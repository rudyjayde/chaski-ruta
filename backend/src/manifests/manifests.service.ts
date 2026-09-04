import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteDir } from '@prisma/client';
import { JwtPayload } from '../auth/jwt.strategy';
import { OpenManifestDto } from './dto/open-manifest.dto';
import { AddPassengerDto } from './dto/add-passenger.dto';
import { CloseManifestDto } from './dto/close-manifest.dto';
import { CorrectManifestDto } from './dto/correct-manifest.dto';

@Injectable()
export class ManifestsService {
  constructor(private prisma: PrismaService) {}

  // Relaciones que el frontend necesita para mostrar codigo/placa/conductor/empresa
  // de un manifiesto — sin esto, esos campos llegan undefined y la UI los pinta en blanco.
  private readonly include = {
    passengers: true,
    vehicle: { include: { company: true } },
    driver: true,
    operator: true,
    company: true,
  } as const;

  /**
   * Calcula el numero segun el MAXIMO ya usado ese anio, nunca contando
   * filas (`count()` se desincroniza en cuanto hay un hueco en la
   * numeracion -- un manifiesto borrado, una prueba abandonada, etc. -- y
   * entonces siempre recalcula el mismo numero ya usado, chocando con la
   * restriccion unica de `number` una y otra vez sin arreglarse solo).
   */
  private async nextNumber(organizationId: string) {
    const year = new Date().getFullYear();
    const prefix = `MAN-${year}-`;
    const last = await this.prisma.manifest.findFirst({
      where: { organizationId, number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
    });
    const lastSeq = last ? parseInt(last.number.slice(prefix.length), 10) || 0 : 0;
    return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;
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
      const number = await this.nextNumber(data.organizationId);
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
    if (manifest.passengers.some((p) => p.seat === dto.seat)) {
      throw new BadRequestException(`El asiento ${dto.seat} ya esta ocupado en este manifiesto`);
    }
    const passenger = await this.prisma.passenger.create({ data: { manifestId, ...dto } });

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
    return closed;
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
      where: { organizationId },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }
}
