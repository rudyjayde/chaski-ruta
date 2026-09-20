import { routeEnds, routeLabel } from '../common/route-labels';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteDir } from '@prisma/client';
import { JwtPayload } from '../auth/jwt.strategy';
import { OpenManifestDto } from './dto/open-manifest.dto';
import { AddPassengerDto } from './dto/add-passenger.dto';
import { CloseManifestDto } from './dto/close-manifest.dto';
import { CorrectManifestDto } from './dto/correct-manifest.dto';
import { DigitizeSuggestDto } from './dto/digitize-suggest.dto';
import { AnthropicService } from '../ai/anthropic.service';
import { MailService } from '../mail/mail.service';
import { nextSequenceNumber } from '../common/sequence';

// El hash de la contraseña NUNCA debe llegar al navegador (mismo criterio
// que people.service.ts / vehicles.service.ts) -- select explicito en vez
// de "driver: true" / "operator: true".
const PERSON_MINIMAL_SELECT = { id: true, name: true, email: true, dni: true, phone: true } as const;

// Saca el bloque JSON de la respuesta de Claude aunque venga envuelto en
// ```json ... ``` u otro texto alrededor -- defensivo, el prompt ya pide
// JSON puro pero no hay que confiar ciegamente en que el modelo lo respete
// siempre.
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

@Injectable()
export class ManifestsService {
  private readonly logger = new Logger(ManifestsService.name);

  constructor(
    private prisma: PrismaService,
    private anthropic: AnthropicService,
    private mail: MailService,
  ) {}

  // Relaciones que el frontend necesita para mostrar codigo/placa/conductor/empresa
  // de un manifiesto — sin esto, esos campos llegan undefined y la UI los pinta en blanco.
  private readonly include = {
    passengers: true,
    vehicle: { include: { company: true } },
    driver: { select: PERSON_MINIMAL_SELECT },
    operator: { select: PERSON_MINIMAL_SELECT },
    company: true,
  } as const;

  /**
   * Calcula el numero segun el MAXIMO ya usado ese anio, nunca contando
   * filas (`count()` se desincroniza en cuanto hay un hueco en la
   * numeracion -- un manifiesto borrado, una prueba abandonada, etc. -- y
   * entonces siempre recalcula el mismo numero ya usado, chocando con la
   * restriccion unica de `number` una y otra vez sin arreglarse solo).
   */
  private async nextNumber() {
    // El numero es unico en TODO el sistema: se calcula sobre el maximo de todas
    // las asociaciones (ver common/sequence.ts). Antes solo miraba la propia
    // asociacion y la segunda asociacion fallaba con error 500 al abrir su primer manifiesto.
    return nextSequenceNumber(this.prisma, 'manifests', 'number', `MAN-${new Date().getFullYear()}-`);
  }

  /**
   * Crea el manifiesto reintentando si el numero calculado choca (dos
   * conductores abriendo manifiesto casi al mismo instante pueden calcular
   * el mismo "siguiente numero" antes de que el primero termine de
   * guardar) -- sin esto, la segunda peticion fallaba con un error crudo
   * de Prisma en vez de simplemente obtener el siguiente numero libre.
   */
  private async createManifestWithNumber(data: {
    organizationId: string;
    status: 'BORRADOR';
    route: RouteDir;
    vehicleId: string;
    driverId: string;
    companyId: string;
    operatorId: string;
    tripId: string;
    date: Date;
    departureTime: string;
    capacity: number;
  }) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = await this.nextNumber();
      try {
        return await this.prisma.manifest.create({ data: { ...data, number }, include: this.include });
      } catch (err: any) {
        const isNumberClash = err?.code === 'P2002' && err?.meta?.target?.includes?.('number');
        if (!isNumberClash || attempt === 4) throw err;
      }
    }
    throw new Error('No se pudo generar un numero de manifiesto libre');
  }

  async open(organizationId: string, actor: JwtPayload, dto: OpenManifestDto) {
    const trip = await this.prisma.trip.findUnique({ where: { id: dto.tripId }, include: { vehicle: true } });
    if (!trip || trip.organizationId !== organizationId) {
      throw new NotFoundException('Viaje no encontrado');
    }
    if (actor.role === 'CONDUCTOR' && trip.driverId !== actor.sub) {
      throw new ForbiddenException('No es tu viaje');
    }
    const existing = await this.prisma.manifest.findUnique({ where: { tripId: trip.id } });
    if (existing) {
      throw new BadRequestException('Este viaje ya tiene un manifiesto');
    }

    const created = await this.createManifestWithNumber({
      organizationId,
      status: 'BORRADOR',
      route: trip.route,
      vehicleId: trip.vehicleId,
      driverId: trip.driverId,
      companyId: (await this.prisma.vehicle.findUniqueOrThrow({ where: { id: trip.vehicleId } })).companyId,
      operatorId: actor.sub,
      tripId: trip.id,
      date: new Date(),
      departureTime: trip.actualDeparture
        ? trip.actualDeparture.toISOString().slice(11, 16)
        : new Date().toISOString().slice(11, 16),
      capacity: dto.capacity,
    });

    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'ABRIR_MANIFIESTO',
        resource: 'Manifiesto',
        resourceId: created.id,
        before: null,
        after: created.number,
        reason: `Viaje ${trip.id}`,
      },
    });
    return created;
  }

  private async findOwnedManifest(organizationId: string, actor: JwtPayload, id: string) {
    const manifest = await this.prisma.manifest.findUnique({ where: { id }, include: this.include });
    if (!manifest || manifest.organizationId !== organizationId) {
      throw new NotFoundException('Manifiesto no encontrado');
    }
    if (actor.role === 'CONDUCTOR' && manifest.driverId !== actor.sub) {
      throw new ForbiddenException('No es tu manifiesto');
    }
    // El manifiesto lleva el DNI de los pasajeros: un socio solo ve los de SUS unidades.
    if (actor.role === 'SOCIO' && manifest.vehicle.partnerId !== actor.sub) {
      throw new ForbiddenException('Este manifiesto no es de una de tus unidades');
    }
    return manifest;
  }

  async addPassenger(organizationId: string, actor: JwtPayload, manifestId: string, dto: AddPassengerDto) {
    const manifest = await this.findOwnedManifest(organizationId, actor, manifestId);
    // BORRADOR: carga normal antes del cierre. CORREGIDO: el administrador ya
    // registro un motivo de correccion (correct()) y esta autorizado a modificar
    // el contenido de esa nueva version — nunca se edita un CERRADO directamente.
    if (manifest.status !== 'BORRADOR' && manifest.status !== 'CORREGIDO') {
      throw new BadRequestException('El manifiesto esta cerrado — corrigelo primero para poder agregar pasajeros');
    }
    if (manifest.passengers.length >= manifest.capacity) {
      throw new BadRequestException('El manifiesto ya alcanzo su capacidad');
    }
    if (dto.seat > manifest.capacity) {
      throw new BadRequestException(`El asiento ${dto.seat} no existe: esta unidad tiene ${manifest.capacity} asientos.`);
    }
    if (manifest.passengers.some((p) => p.seat === dto.seat)) {
      throw new BadRequestException(`El asiento ${dto.seat} ya esta ocupado en este manifiesto`);
    }
    const passenger = await this.prisma.passenger.create({ data: { manifestId, ...dto } });
    await this.recordPassengerAndNotify(organizationId, manifest, dto, true);

    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'AGREGAR_PASAJERO',
        resource: 'Manifiesto',
        resourceId: manifestId,
        before: null,
        after: `Asiento ${dto.seat}: ${dto.name}`,
      },
    });
    return passenger;
  }

  /**
   * Guarda/actualiza el perfil agregado del pasajero (PassengerProfile,
   * identificado por DNI dentro de la asociacion) y, si corresponde, le
   * manda el correo tipo boleto (12 sept 2026, decidido con Jayde). El
   * email persiste una vez guardado aunque un viaje futuro no lo repita --
   * por eso el envio usa el email DEL PERFIL (ya actualizado), no solo el
   * que vino en este dto puntual.
   *
   * "notify" es false al digitalizar respaldo en papel (digitize()): esos
   * viajes ya ocurrieron, mandar "disfruta tu viaje" dias despues no tiene
   * sentido -- pero igual se cuenta para la recurrencia real del pasajero.
   *
   * Nunca lanza -- ni el conteo de viajes ni el correo deben poder tumbar el
   * registro real del pasajero en el manifiesto (lo unico que importa de
   * verdad para la operacion).
   */
  private async recordPassengerAndNotify(
    organizationId: string,
    manifest: { number: string; date: Date; departureTime: string; vehicle: { code: string; plate: string } },
    dto: AddPassengerDto,
    notify: boolean,
  ): Promise<void> {
    try {
      const email = dto.email?.trim() || undefined;
      const documentType = dto.documentType ?? 'DNI';
      const profile = await this.prisma.passengerProfile.upsert({
        where: { organizationId_documentType_dni: { organizationId, documentType, dni: dto.dni } },
        create: { organizationId, documentType, dni: dto.dni, name: dto.name, email: email ?? null, tripCount: 1, lastTripAt: new Date() },
        update: { name: dto.name, ...(email ? { email } : {}), tripCount: { increment: 1 }, lastTripAt: new Date() },
      });

      if (!notify || !profile.email) return;

      const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
      if (!org) return;

      await this.mail.sendPassengerTicketEmail({
        to: profile.email,
        passengerName: dto.name,
        orgName: org.name,
        origin: dto.origin,
        destination: dto.destination,
        manifestNumber: manifest.number,
        date: manifest.date,
        departureTime: manifest.departureTime,
        vehicleCode: manifest.vehicle.code,
        vehiclePlate: manifest.vehicle.plate,
      });
    } catch (err) {
      this.logger.error(
        `Error registrando perfil/boleto del pasajero (${dto.documentType ?? 'DNI'} ${dto.dni}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Cierre del manifiesto (§3.8). Si no tiene pasajeros digitalizados, exige la
   * confirmacion explicita de que existe respaldo fisico en papel — nunca se
   * cierra vacio "en silencio". El respaldo en papel tambien aplica a un cierre
   * PARCIAL (Jayde, 3 sept 2026): bajo presion real el conductor puede alcanzar
   * a cargar solo algunos pasajeros en la app y anotar el resto en papel —
   * dto.paperBackupConfirmed marca el manifiesto como "pendiente de completar"
   * sin importar si ya tiene 0 o varios pasajeros digitalizados.
   */
  async close(organizationId: string, actor: JwtPayload, manifestId: string, dto: CloseManifestDto) {
    const manifest = await this.findOwnedManifest(organizationId, actor, manifestId);
    if (manifest.status !== 'BORRADOR') {
      throw new BadRequestException('El manifiesto ya esta cerrado');
    }

    const isEmpty = manifest.passengers.length === 0;
    if (isEmpty && !dto.paperBackupConfirmed) {
      throw new BadRequestException(
        'Manifiesto sin pasajeros: confirma paperBackupConfirmed=true (existe el respaldo fisico en papel) para cerrarlo',
      );
    }
    const paperBackup = !!dto.paperBackupConfirmed;

    const closed = await this.prisma.manifest.update({
      where: { id: manifestId },
      data: {
        status: 'CERRADO',
        arrivalTime: dto.arrivalTime,
        pdfGenerated: true,
        paperBackup,
        pendingDigitize: paperBackup,
      },
      include: this.include,
    });

    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'CERRAR_MANIFIESTO',
        resource: 'Manifiesto',
        resourceId: manifestId,
        before: 'BORRADOR',
        after: 'CERRADO',
        reason: paperBackup
          ? isEmpty
            ? 'Sin pasajeros digitalizados — respaldo en papel confirmado'
            : `${manifest.passengers.length} pasajero(s) + respaldo en papel pendiente para el resto`
          : `${manifest.passengers.length} pasajero(s)`,
      },
    });

    // Deteccion de anomalias en recaudacion (ia-aplicada.md §2.4): nunca
    // bloquea el cierre -- corre DESPUES de que el manifiesto ya quedo
    // cerrado, solo marca para revision si corresponde.
    const flagged = await this.flagRevenueAnomalyIfAny(organizationId, closed);
    return flagged ?? closed;
  }

  /**
   * Si la recaudacion de este manifiesto cerrado es una caida fuerte frente
   * al propio historial reciente de la MISMA unidad en la MISMA ruta, lo
   * marca CON_INCIDENCIA para que el administrador lo revise -- nunca una
   * acusacion, nunca automatico mas alla de la marca (ia-aplicada.md §1 y
   * §2.4: "se marca como algo a revisar -- nunca como una acusacion").
   * Puede ser baja demanda real, un error al tipear una tarifa, o algo real
   * que revisar -- el sistema no distingue eso, solo lo senala.
   *
   * Requiere un minimo de historial (REVENUE_ANOMALY_MIN_HISTORY manifiestos
   * previos de esa misma unidad/ruta) antes de comparar nada -- una unidad
   * nueva sin historial no tiene "su propio historial" contra que compararse
   * todavia, y marcarla de entrada seria un falso positivo garantizado.
   */
  private async flagRevenueAnomalyIfAny(organizationId: string, manifest: { id: string; vehicleId: string; route: RouteDir; passengers: { fare: number }[] }) {
    const REVENUE_ANOMALY_MIN_HISTORY = 3;
    const REVENUE_ANOMALY_DROP_RATIO = 0.4; // se marca si recaudo <= 40% del promedio historico

    const thisRevenue = manifest.passengers.reduce((s, p) => s + p.fare, 0);

    const history = await this.prisma.manifest.findMany({
      where: {
        organizationId,
        vehicleId: manifest.vehicleId,
        route: manifest.route,
        id: { not: manifest.id },
        status: { in: ['CERRADO', 'CORREGIDO', 'CON_INCIDENCIA'] },
      },
      orderBy: { date: 'desc' },
      take: 8,
      select: { passengers: { select: { fare: true } } },
    });
    if (history.length < REVENUE_ANOMALY_MIN_HISTORY) return null;

    const historyRevenues = history.map((m) => m.passengers.reduce((s, p) => s + p.fare, 0));
    const avgRevenue = historyRevenues.reduce((a, b) => a + b, 0) / historyRevenues.length;
    if (avgRevenue <= 0 || thisRevenue > avgRevenue * REVENUE_ANOMALY_DROP_RATIO) return null;

    const note =
      `Detección automática (no confirmada): este manifiesto recaudó S/ ${thisRevenue.toFixed(2)}, ` +
      `muy por debajo del promedio de esta unidad en sus últimos ${history.length} viajes de esta ruta ` +
      `(S/ ${avgRevenue.toFixed(2)}). Puede ser baja demanda real, un error al registrar tarifas, o algo a ` +
      `revisar -- no es una acusación.`;

    const flagged = await this.prisma.manifest.update({
      where: { id: manifest.id },
      data: { status: 'CON_INCIDENCIA', correctionReason: note },
      include: this.include,
    });

    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: null,
        actorRole: 'SISTEMA',
        action: 'ANOMALIA_RECAUDACION_DETECTADA',
        resource: 'Manifiesto',
        resourceId: manifest.id,
        before: `S/ ${thisRevenue.toFixed(2)}`,
        after: `Promedio histórico S/ ${avgRevenue.toFixed(2)} (${history.length} viajes)`,
        reason: note,
        evidence: JSON.stringify({ thisRevenue, avgRevenue: Math.round(avgRevenue * 100) / 100, sampleSize: history.length }),
      },
    });

    return flagged;
  }

  /**
   * IA con vision (ia-aplicada.md §2.2, plan-operacion.md §3.8): lee la foto
   * del respaldo en papel y devuelve una SUGERENCIA de pasajeros -- nunca
   * guarda nada. Quien llama (conductor o administrador) revisa/edita/quita
   * antes de confirmar con digitize(), que es el unico metodo que persiste.
   * Mismo principio rector que el resto de IA del sistema: sugiere, nunca
   * decide (ia-aplicada.md §1).
   *
   * No se guarda la foto como archivo permanente -- solo se usa en memoria
   * para esta lectura y se descarta (no hay integracion de Cloudinary en el
   * backend todavia; si se quiere guardar como respaldo digital adicional,
   * es un cambio aparte).
   *
   * Nunca inventa un dato ilegible: una fila con DNI/asiento/tarifa que no
   * se pudo leer con confianza simplemente se omite (se cuenta en
   * `skipped`) en vez de completarse con un valor inventado.
   */
  async digitizeSuggest(organizationId: string, actor: JwtPayload, manifestId: string, dto: DigitizeSuggestDto) {
    const manifest = await this.findOwnedManifest(organizationId, actor, manifestId);
    if (!manifest.pendingDigitize) {
      throw new BadRequestException('Este manifiesto no tiene respaldo en papel pendiente de digitalizar');
    }

    const occupiedSeats = new Set(manifest.passengers.map((p) => p.seat));
    const routeConfig = await this.prisma.operationalConfig.findUnique({ where: { organizationId } });
    const { origin, destination } = routeEnds(manifest.route as 'JULI_PUNO' | 'PUNO_JULI', routeConfig);

    const prompt = `Esta es una foto de un manifiesto de pasajeros de un bus interprovincial peruano, llenado a mano o impreso en papel. Lee cada fila de pasajero y devuelve UNICAMENTE un JSON valido (sin texto adicional, sin markdown, sin bloques de codigo) con esta forma exacta:
{"passengers":[{"seat":numero,"name":"nombres y apellidos completos","dni":"8 digitos o cadena vacia si no es legible","fare":numero,"paymentMethod":"EFECTIVO, YAPE, PLIN, TRANSFERENCIA, QR, o null si no esta indicado"}]}

Reglas estrictas:
- El vehiculo tiene ${manifest.capacity} asientos numerados del 1 al ${manifest.capacity}. Ignora cualquier fila con un numero de asiento fuera de ese rango.
- Si el DNI no es completamente legible o no tiene exactamente 8 digitos, devuelve "dni":"" para esa fila -- nunca inventes ni completes digitos faltantes.
- Si la tarifa no es legible, devuelve "fare":0 -- nunca inventes un monto.
- Si el metodo de pago no esta indicado en el papel, devuelve "paymentMethod":null.
- No incluyas una fila si no puedes leerla con razonable confianza -- es preferible omitirla a inventar datos.
- No incluyas estos asientos, ya estan ocupados en el sistema: ${occupiedSeats.size > 0 ? [...occupiedSeats].join(', ') : '(ninguno)'}.`;

    const raw = await this.anthropic.visionExtract({
      imageBase64: dto.imageBase64,
      mediaType: dto.mediaType,
      prompt,
    });

    let parsed: { passengers?: unknown[] };
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      throw new BadRequestException(
        'No se pudo interpretar la foto del manifiesto. Intenta con una foto mas clara (buena luz, sin inclinacion) o completa los datos a mano.',
      );
    }

    const candidates = Array.isArray(parsed.passengers) ? parsed.passengers : [];
    const seenSeats = new Set<number>();
    const suggested: AddPassengerDto[] = [];
    let skipped = 0;

    for (const candidate of candidates) {
      const c = candidate as Record<string, unknown>;
      const seat = Number(c.seat);
      const name = typeof c.name === 'string' ? c.name.trim() : '';
      const dni = typeof c.dni === 'string' ? c.dni.trim() : '';
      const fare = Number(c.fare);
      const paymentMethod = (['EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA', 'QR'] as const).includes(
        c.paymentMethod as any,
      )
        ? (c.paymentMethod as AddPassengerDto['paymentMethod'])
        : 'EFECTIVO';

      const seatValid = Number.isInteger(seat) && seat >= 1 && seat <= manifest.capacity;
      const dniValid = /^\d{8}$/.test(dni);
      const fareValid = Number.isFinite(fare) && fare >= 0;

      if (!seatValid || !name || !dniValid || !fareValid || occupiedSeats.has(seat) || seenSeats.has(seat)) {
        skipped++;
        continue;
      }
      seenSeats.add(seat);
      suggested.push({ seat, name, dni, fare, paymentMethod, origin, destination });
    }

    return { suggested, skipped, total: candidates.length };
  }

  /**
   * El respaldo en papel ya se paso al sistema — agrega los pasajeros que
   * faltaban y limpia el estado "pendiente de digitalizar". Valida asientos
   * contra los que YA existian en el manifiesto (puede tener pasajeros reales
   * de antes del cierre, no solo el caso vacio) para no duplicar un asiento.
   */
  async digitize(organizationId: string, actor: JwtPayload, manifestId: string, passengers: AddPassengerDto[]) {
    const manifest = await this.findOwnedManifest(organizationId, actor, manifestId);
    if (!manifest.pendingDigitize) {
      throw new BadRequestException('Este manifiesto no tiene respaldo en papel pendiente de digitalizar');
    }
    const existingSeats = new Set(manifest.passengers.map((p) => p.seat));
    const seenSeats = new Set<number>();
    for (const p of passengers) {
      if (existingSeats.has(p.seat) || seenSeats.has(p.seat)) {
        throw new BadRequestException(`El asiento ${p.seat} ya esta ocupado en este manifiesto`);
      }
      seenSeats.add(p.seat);
    }
    if (manifest.passengers.length + passengers.length > manifest.capacity) {
      throw new BadRequestException('La cantidad de pasajeros supera la capacidad del manifiesto');
    }
    await this.prisma.$transaction([
      ...passengers.map((p) => this.prisma.passenger.create({ data: { manifestId, ...p } })),
      this.prisma.manifest.update({ where: { id: manifestId }, data: { pendingDigitize: false } }),
    ]);
    // notify=false: son viajes que ya ocurrieron (respaldo en papel), pero
    // igual cuentan para la recurrencia real del pasajero.
    for (const p of passengers) {
      await this.recordPassengerAndNotify(organizationId, manifest, p, false);
    }
    return this.prisma.manifest.findUnique({ where: { id: manifestId }, include: this.include });
  }

  /** Correccion con nueva version + motivo obligatorio + auditoria — solo administrador. */
  async correct(organizationId: string, actor: JwtPayload, manifestId: string, dto: CorrectManifestDto) {
    const manifest = await this.prisma.manifest.findUnique({ where: { id: manifestId } });
    if (!manifest || manifest.organizationId !== organizationId) {
      throw new NotFoundException('Manifiesto no encontrado');
    }

    const updated = await this.prisma.manifest.update({
      where: { id: manifestId },
      data: { status: 'CORREGIDO', version: { increment: 1 }, correctionReason: dto.reason },
      include: this.include,
    });

    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'CORREGIR_MANIFIESTO',
        resource: 'Manifiesto',
        resourceId: manifestId,
        before: `v${manifest.version}`,
        after: `v${updated.version}`,
        reason: dto.reason,
      },
    });
    return updated;
  }

  async findOne(organizationId: string, actor: JwtPayload, id: string) {
    return this.findOwnedManifest(organizationId, actor, id);
  }

  /**
   * Visibilidad del conductor (§3.8 ultimo punto): solo su manifiesto activo y
   * sus propios manifiestos vacios/pendientes del dia — nunca su historial cerrado
   * ni el de otros. Administrador/socio/super admin ven todo.
   */
  async findMany(organizationId: string, actor: JwtPayload) {
    if (actor.role === 'CONDUCTOR') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      return this.prisma.manifest.findMany({
        where: {
          organizationId,
          driverId: actor.sub,
          OR: [
            { status: 'BORRADOR' },
            { pendingDigitize: true, createdAt: { gte: startOfDay } },
            // Manifiesto ya cerrado pero cuyo viaje sigue sin salir (o en
            // curso) -- el conductor lo sigue necesitando para "Marcar
            // salida" o para seguir viendo su viaje activo, aunque el
            // manifiesto en si ya no este en BORRADOR. Sin esto, un viaje
            // PROGRAMADO con manifiesto CERRADO desaparece de la vista del
            // conductor y la pantalla vuelve a ofrecer "Abrir manifiesto",
            // que el backend rechaza porque ese viaje ya tiene uno.
            { trip: { status: { in: ['PROGRAMADO', 'ACTIVO'] } } },
          ],
        },
        include: this.include,
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.manifest.findMany({
      where: { organizationId, ...(actor.role === 'SOCIO' ? { vehicle: { partnerId: actor.sub } } : {}) },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Decodifica el token que el conductor genera al descargar el PDF
  // (frontend: manifestVerificationToken() en App.tsx/DriverApp.tsx --
  // 'atp_' + base64url(id|number|code)). Nunca inventa el formato aqui:
  // debe coincidir exactamente con como el frontend lo arma.
  private decodeVerificationToken(token: string): { id: string; number: string; code: string } | null {
    try {
      const b64 = token.replace(/^atp_/, '').replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const [id, number, code] = Buffer.from(padded, 'base64').toString('utf8').split('|');
      if (!id || !number || !code) return null;
      return { id, number, code };
    } catch {
      return null;
    }
  }

  /**
   * Verificacion PUBLICA de un manifiesto (sin autenticacion -- quien escanea
   * el QR de un manifiesto impreso puede ser cualquier persona, en cualquier
   * dispositivo, sin cuenta). El token ya trae el id real del manifiesto;
   * number/code se revisan ademas como verificacion de integridad (evita que
   * alguien arme una URL con un id valido pero datos que no coinciden).
   * Nunca devuelve manifiestos en BORRADOR (todavia no son un documento
   * emitido) ni el `notes`/campos internos de otros modelos.
   */
  async verifyToken(token: string) {
    const parsed = this.decodeVerificationToken(token);
    if (!parsed) throw new NotFoundException('El código no existe o no corresponde a un manifiesto emitido.');

    const manifest = await this.prisma.manifest.findUnique({
      where: { id: parsed.id },
      include: { passengers: true, vehicle: true, driver: true, company: true, organization: { include: { operationalConfig: true } } },
    });
    if (
      !manifest ||
      manifest.number !== parsed.number ||
      manifest.vehicle.code !== parsed.code ||
      manifest.status === 'BORRADOR'
    ) {
      throw new NotFoundException('El código no existe, fue revocado o no corresponde a un manifiesto emitido.');
    }

    return {
      number: manifest.number,
      route: manifest.route,
      routeLabel: routeLabel(manifest.route as 'JULI_PUNO' | 'PUNO_JULI', manifest.organization.operationalConfig),
      date: manifest.date,
      departureTime: manifest.departureTime,
      arrivalTime: manifest.arrivalTime,
      code: manifest.vehicle.code,
      plate: manifest.vehicle.plate,
      model: manifest.vehicle.model,
      vehicleType: manifest.vehicle.vehicleType,
      capacity: manifest.capacity,
      association: manifest.organization.name,
      company: manifest.company.name,
      driver: manifest.driver.name,
      passengers: manifest.passengers.map((p) => ({
        seat: p.seat,
        name: p.name,
        dni: p.dni,
        origin: p.origin,
        destination: p.destination,
        fare: p.fare,
        paymentMethod: p.paymentMethod,
      })),
    };
  }
}
