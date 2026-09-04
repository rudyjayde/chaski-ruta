import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt.strategy';
import { JoinQueueDto } from './dto/join-queue.dto';
import { ConfirmArrivalDto } from './dto/confirm-arrival.dto';
import { AdvanceQueueDto } from './dto/advance-queue.dto';
import { OverrideQueueDto } from './dto/override-queue.dto';

type RouteDir = 'JULI_PUNO' | 'PUNO_JULI';

const ADVANCE_ORDER = ['INSCRITO', 'LLAMADO', 'EN_TERMINAL', 'EMBARCANDO', 'LISTO'] as const;

// Estados desde los que el conductor ya puede prepararse para salir por su
// cuenta (abrir manifiesto, cerrarlo, marcar salida) sin que el administrador
// tenga que seguir avanzandolo manualmente por EN_TERMINAL/EMBARCANDO/LISTO.
// EN_TERMINAL/EMBARCANDO/LISTO se mantienen en el modelo como registro
// opcional (el administrador los puede seguir usando si quiere trazabilidad
// mas fina), pero dejan de ser un requisito bloqueante.
const SELF_SERVICE_STATUSES = new Set(ADVANCE_ORDER.slice(1)); // LLAMADO en adelante

function opposite(route: RouteDir): RouteDir {
  return route === 'JULI_PUNO' ? 'PUNO_JULI' : 'JULI_PUNO';
}

// Distancia aproximada en metros entre dos coordenadas (formula haversine) —
// suficiente para el chequeo puntual de llegada, no se necesita precision de rastreo.
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class QueuesService {
  constructor(private prisma: PrismaService) {}

  private async getConfig(organizationId: string) {
    const config = await this.prisma.operationalConfig.findUnique({ where: { organizationId } });
    if (config) return config;
    // Asociacion sin configuracion explicita todavia: usa los valores por defecto del modelo.
    return this.prisma.operationalConfig.create({ data: { organizationId } });
  }

  async list(organizationId: string, route: RouteDir) {
    await this.sweepTimeouts(organizationId, route);
    return this.prisma.queueEntry.findMany({
      where: { organizationId, route },
      include: { vehicle: { include: { company: true, partner: true } }, driver: true },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Via 1 del escape de 3 vias (§3.6): timeout automatico. Se revisa de forma
   * perezosa (al leer la cola) en vez de con un cron aparte — suficiente para
   * el volumen de una asociacion; si hace falta precision al segundo, esto se
   * puede mover a un job programado despues sin cambiar la regla de negocio.
   */
  private async sweepTimeouts(organizationId: string, route: RouteDir) {
    const now = new Date();
    const expired = await this.prisma.queueEntry.findMany({
      where: { organizationId, route, status: 'LLAMADO', timeoutAt: { lte: now } },
    });
    for (const entry of expired) {
      await this.demoteToBack(entry.id, 'INSCRITO');
      await this.prisma.auditEntry.create({
        data: {
          organizationId,
          actorId: null,
          actorRole: 'SISTEMA',
          action: 'TIMEOUT_AUTOMATICO',
          resource: `Cola ${route}`,
          resourceId: entry.id,
          before: entry.status,
          after: 'INSCRITO (al final)',
          reason: `Sin confirmacion tras ${entry.timeoutAt ? '' : ''}el tiempo de espera configurado`,
        },
      });
    }
  }

  private async demoteToBack(entryId: string, newStatus: 'INSCRITO' | 'AUSENTE') {
    await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: {
        status: newStatus,
        escapeState: 'NINGUNO',
        chainDepartureAt: null,
        registeredAt: new Date(),
        timeoutAt: null,
      },
    });
    const entry = await this.prisma.queueEntry.findUniqueOrThrow({ where: { id: entryId } });
    await this.recomputeOrder(entry.organizationId, entry.route as RouteDir);
    // Regla general de auto-Llamando (ver maybeAutoPromote): si esta cola se
    // quedo sin nadie en Llamando -- por ejemplo, la unica unidad presente
    // acaba de declinar su turno ("me inscribo mas tarde" / "no voy a salir
    // todavia") -- el sistema pasa de inmediato a la siguiente unidad
    // inscrita (que puede ser esta misma, si sigue siendo la unica) a
    // Llamando, sin esperar a que el administrador apriete "Llamar siguiente".
    await this.maybeAutoPromote(entry.organizationId, entry.route as RouteDir);
  }

  /**
   * Cadena de predecesores (§3.5): reordena TODA la cola de una direccion por
   * hora real de salida del viaje que trajo a cada vehiculo (chainDepartureAt),
   * y para los que no tienen ese dato (primera vuelta del dia) por hora de
   * inscripcion — nunca por el orden en que alguien toco "inscribirme".
   */
  private async recomputeOrder(organizationId: string, route: RouteDir) {
    const entries = await this.prisma.queueEntry.findMany({ where: { organizationId, route } });
    const sorted = [...entries].sort((a, b) => {
      const aKey = a.chainDepartureAt?.getTime() ?? a.registeredAt.getTime();
      const bKey = b.chainDepartureAt?.getTime() ?? b.registeredAt.getTime();
      return aKey - bKey;
    });
    await this.prisma.$transaction(
      sorted.map((entry, index) =>
        this.prisma.queueEntry.update({ where: { id: entry.id }, data: { position: index + 1 } }),
      ),
    );
  }

  /**
   * Auto-Llamando en cola vacia (Jayde, 3 sept 2026 -- regla generalizada):
   * invariante que se aplica cada vez que la cola puede haber quedado sin
   * nadie en Llamando (al confirmar llegada, al declinar el turno, al vencer
   * un timeout, o al aplicar una excepcion manual). Si no hay NINGUNA unidad
   * en estado LLAMADO para esta ruta, la primera unidad INSCRITA en orden
   * pasa a Llamando automaticamente -- el administrador no tiene que apretar
   * "Llamar siguiente" cuando en realidad no hay a quien mas llamar antes.
   * Si ya hay alguien Llamando, o no hay ninguna unidad inscrita esperando,
   * no hace nada.
   */
  private async maybeAutoPromote(organizationId: string, route: RouteDir) {
    const anyLlamando = await this.prisma.queueEntry.count({
      where: { organizationId, route, status: 'LLAMADO' },
    });
    if (anyLlamando > 0) return;

    const next = await this.prisma.queueEntry.findFirst({
      where: { organizationId, route, status: 'INSCRITO' },
      orderBy: { position: 'asc' },
    });
    if (!next) return;

    const config = await this.getConfig(organizationId);
    await this.prisma.queueEntry.update({
      where: { id: next.id },
      data: { status: 'LLAMADO', timeoutAt: new Date(Date.now() + config.timeoutMinutes * 60000) },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: null,
        actorRole: 'SISTEMA',
        action: 'AUTO_LLAMANDO_COLA_VACIA',
        resource: `Cola ${route}`,
        resourceId: next.id,
        before: 'INSCRITO',
        after: 'LLAMADO',
        reason: 'No habia ninguna unidad en Llamando en esta cola -- se paso automaticamente a la siguiente inscrita',
      },
    });
  }

  /**
   * Retiro voluntario de la cola (Jayde, 3 sept 2026 -- aclaracion final del
   * alcance real de "me inscribo mas tarde" / "no voy a salir todavia"): el
   * conductor sale POR COMPLETO de esta cola, no solo se manda al final --
   * deja de contar para el orden de salida y ya no aparece esperando turno,
   * queda igual que cualquier vehiculo que hoy no esta inscrito en ninguna
   * ruta. Si mas adelante si va a salir, tiene que volver a inscribirse
   * desde cero (boton "Inscribirme"), igual que si llegara por primera vez.
   *
   * Distinto del timeout automatico (via 1, sweepTimeouts) y de la excepcion
   * manual del administrador con REQUEUE (via 3, override) -- esos siguen
   * usando demoteToBack porque ahi la unidad no decidio voluntariamente
   * salir de la fila: solo perdio su turno, o el administrador la esta
   * reinscribiendo a proposito.
   */
  private async withdrawFromQueue(entryId: string) {
    const entry = await this.prisma.queueEntry.findUniqueOrThrow({ where: { id: entryId } });
    await this.prisma.queueEntry.delete({ where: { id: entryId } });
    await this.recomputeOrder(entry.organizationId, entry.route as RouteDir);
    await this.maybeAutoPromote(entry.organizationId, entry.route as RouteDir);
    return entry;
  }

  async join(organizationId: string, actor: JwtPayload, route: RouteDir, dto: JoinQueueDto) {
    await this.sweepTimeouts(organizationId, route);

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle || vehicle.organizationId !== organizationId) {
      throw new NotFoundException('Vehiculo no encontrado en esta asociacion');
    }

    // Solo el conductor asignado, o un administrador de la asociacion, pueden inscribir la unidad.
    if (actor.role === 'CONDUCTOR' && vehicle.currentDriverId !== actor.sub) {
      throw new ForbiddenException('No eres el conductor asignado a esta unidad');
    }
    const driverId = vehicle.currentDriverId ?? actor.sub;

    // Vinculo cuenta-dispositivo (§3.2): solo se exige cuando el conductor se
    // inscribe el mismo desde su celular — una intervencion de administrador no aplica.
    if (actor.role === 'CONDUCTOR') {
      const person = await this.prisma.person.findUniqueOrThrow({ where: { id: actor.sub } });
      if (!dto.deviceId) {
        throw new BadRequestException('Falta el identificador del dispositivo');
      }
      if (!person.boundDeviceId) {
        await this.prisma.person.update({
          where: { id: person.id },
          data: { boundDeviceId: dto.deviceId, boundDeviceSetAt: new Date() },
        });
      } else if (person.boundDeviceId !== dto.deviceId) {
        throw new ForbiddenException(
          'Esta cuenta ya esta vinculada a otro dispositivo. Contacta a tu administrador para revincularla.',
        );
      }
    }

    // Regla dura universal (§3.1): con viaje activo, no puede entrar a NINGUNA cola.
    const activeTrip = await this.prisma.trip.findFirst({
      where: { organizationId, vehicleId: vehicle.id, status: 'ACTIVO' },
    });
    if (activeTrip) {
      throw new ForbiddenException('La unidad tiene un viaje activo — no puede inscribirse hasta cerrarlo');
    }

    // Regla dura universal (§3.1) extendida: tampoco puede entrar a la cola contraria
    // mientras ya esta activo en la otra cola (esperando turno, antes de tener viaje
    // creado) — fisicamente no puede estar esperando salida en las dos terminales a la vez.
    const activeOppositeEntry = await this.prisma.queueEntry.findFirst({
      where: {
        organizationId,
        vehicleId: vehicle.id,
        route: opposite(route),
        status: { notIn: ['AUSENTE', 'RETIRADO'] },
      },
    });
    if (activeOppositeEntry) {
      throw new ForbiddenException('La unidad ya esta activa en la cola contraria — no puede inscribirse en las dos colas a la vez');
    }

    const existing = await this.prisma.queueEntry.findUnique({
      where: { organizationId_route_vehicleId: { organizationId, route, vehicleId: vehicle.id } },
    });
    if (existing) {
      throw new BadRequestException('Esta unidad ya esta inscrita en esta cola');
    }

    // Reubicacion (§3.9 / Jayde, 3 sept 2026): el conductor puede marcar "vengo
    // por reubicacion" para saltarse el tiempo minimo y el candado de orden real
    // de salida de abajo -- pero eso NUNCA se confia de lo que declara el
    // celular. Se verifica contra una orden real que el administrador ya
    // selecciono para esta unidad, autorizo y puso EN_TRASLADO, en esta misma
    // direccion exacta. Si marca la casilla sin tener una orden asi, se ignora
    // el flag y sigue el flujo normal de abajo (con sus candados de siempre) --
    // nadie se autoriza solo.
    const fromTerminal = route === 'JULI_PUNO' ? 'JULI' : 'PUNO';
    const toTerminal = route === 'JULI_PUNO' ? 'PUNO' : 'JULI';
    const verifiedRelocation = dto.isRelocation
      ? await this.prisma.relocationUnit.findFirst({
          where: {
            vehicleId: vehicle.id,
            relocationOrder: { organizationId, status: 'EN_TRASLADO', fromTerminal, toTerminal },
          },
        })
      : null;
    if (dto.isRelocation && !verifiedRelocation) {
      throw new ForbiddenException(
        'No hay una reubicacion autorizada para esta unidad en este sentido -- contacta a tu administrador',
      );
    }

    // Ultimo viaje de esta unidad en la direccion contraria — da el gate de tiempo
    // minimo (§3.4) y la hora real de salida para la cadena de predecesores (§3.5).
    const lastOppositeTrip = await this.prisma.trip.findFirst({
      where: { organizationId, vehicleId: vehicle.id, route: opposite(route), status: 'COMPLETADO' },
      orderBy: { actualDeparture: 'desc' },
    });

    if (lastOppositeTrip?.actualDeparture && !verifiedRelocation) {
      const config = await this.getConfig(organizationId);
      const minMinutes =
        route === 'JULI_PUNO' ? config.minTripMinutesOutbound : config.minTripMinutesReturn;
      const minutesSince = (Date.now() - lastOppositeTrip.actualDeparture.getTime()) / 60000;
      if (minutesSince < minMinutes) {
        throw new ForbiddenException(
          `Tiempo minimo de viaje no cumplido: faltan ${Math.ceil(minMinutes - minutesSince)} min para poder inscribirse en esta cola`,
        );
      }
    }

    // Candado duro de orden real de salida (plan-flujo-colas-hardware.md §3):
    // no puede inscribirse en el regreso si una unidad que salio ANTES que
    // ella en la ida todavia no se ha inscrito/movido en esta misma cola.
    // Evita que el orden real de salida se pierda cuando alguien se olvida
    // de anotarse -- el administrador solo interviene si hace falta (nunca
    // fuerza el orden en el caso normal). Una reubicacion VERIFICADA es la
    // unica manera de saltarse este candado a proposito -- es justamente el
    // caso que rompe el orden real (una unidad vacia mandada aposta a cubrir
    // un hueco), y solo cuenta si el administrador de verdad la autorizo.
    // Excepcion 3 -- Inscripcion retrasada (Jayde, 4 sept 2026): si el candado
    // de arriba bloquearia esta inscripcion, se revisa si el administrador ya
    // autorizo una excepcion para esta unidad+ruta (ver resolveDelayedRegistrationRequest).
    // Igual que la reubicacion, NUNCA se confia del cliente -- se verifica en
    // la tabla. Si hay autorizacion, se deja pasar y se consume abajo
    // (queda RESUELTO) para que no sirva una segunda vez.
    let delayedAuthorization: { id: string } | null = null;
    if (lastOppositeTrip?.actualDeparture && !verifiedRelocation) {
      const blocker = await this.findUnregisteredPredecessor(
        organizationId,
        route,
        lastOppositeTrip.actualDeparture,
        vehicle.id,
      );
      if (blocker) {
        delayedAuthorization = await this.prisma.delayedRegistrationRequest.findFirst({
          where: { organizationId, route, requestingVehicleId: vehicle.id, status: 'AUTORIZADO' },
        });
        if (!delayedAuthorization) {
          throw new ForbiddenException(
            `Aun no puedes inscribirte -- la unidad ${blocker.code} no se ha inscrito todavia. Contactate con el administrador de tu asociacion.`,
          );
        }
      }
    }

    const created = await this.prisma.queueEntry.create({
      data: {
        organizationId,
        route,
        position: 1, // se recalcula abajo con recomputeOrder
        vehicleId: vehicle.id,
        driverId,
        status: 'PREINSCRITO',
        evidence: 'SIN_EVIDENCIA',
        deviceId: dto.deviceId,
        chainDepartureAt: lastOppositeTrip?.actualDeparture ?? null,
      },
    });
    await this.recomputeOrder(organizationId, route);
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'INSCRIPCION_COLA',
        resource: `Cola ${route}`,
        resourceId: created.id,
        before: null,
        after: 'PREINSCRITO',
        reason: `Unidad ${vehicle.code}`,
      },
    });

    // Si esta inscripcion se hizo usando una autorizacion de "inscripcion
    // retrasada", se consume (no sirve una segunda vez). Si NO se uso pero
    // igual habia una solicitud pendiente/autorizada para esta unidad+ruta
    // -- por ejemplo, el predecesor se inscribio por su cuenta mientras
    // tanto y el candado ya no aplicaba -- tambien se cierra sola, para no
    // dejarle al administrador un pendiente que ya no tiene sentido resolver.
    if (delayedAuthorization) {
      await this.prisma.delayedRegistrationRequest.update({
        where: { id: delayedAuthorization.id },
        data: { status: 'RESUELTO', consumedAt: new Date() },
      });
    } else {
      await this.prisma.delayedRegistrationRequest.updateMany({
        where: { organizationId, route, requestingVehicleId: vehicle.id, status: { in: ['PENDIENTE', 'AUTORIZADO'] } },
        data: { status: 'RESUELTO', consumedAt: new Date() },
      });
    }

    return this.prisma.queueEntry.findUnique({ where: { id: created.id } });
  }

  /**
   * Verificacion de llegada por GPS del celular (§3.3): chequeo puntual UNA VEZ,
   * nunca rastreo. Si cae dentro del radio configurado, evidencia fuerte
   * (PRESENCIA_TERMINAL); si no, evidencia mas debil pero NUNCA bloquea por si
   * sola (misma regla de "nunca castigar solo con señal debil" que en PRO).
   */
  async confirmArrival(organizationId: string, actor: JwtPayload, entryId: string, dto: ConfirmArrivalDto) {
    const entry = await this.findOwnedEntry(organizationId, actor, entryId);
    const config = await this.getConfig(organizationId);
    const terminal =
      entry.route === 'JULI_PUNO'
        ? { lat: config.terminalOriginLat, lng: config.terminalOriginLng }
        : { lat: config.terminalDestinationLat, lng: config.terminalDestinationLng };
    const distance = distanceMeters(dto.lat, dto.lng, terminal.lat, terminal.lng);
    const withinRadius = distance <= config.gpsRadiusMeters;
    const evidence = withinRadius ? 'PRESENCIA_TERMINAL' : 'REGISTRO_MOVIL';

    const updated = await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: {
        status: 'INSCRITO',
        evidence,
        arrivalGpsLat: dto.lat,
        arrivalGpsLng: dto.lng,
        arrivalCheckedAt: new Date(),
      },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'CONFIRMAR_LLEGADA',
        resource: `Cola ${entry.route}`,
        resourceId: entryId,
        before: entry.status,
        after: 'INSCRITO',
        evidence,
      },
    });

    // Auto-Llamando en cola vacia (Jayde, 3 sept 2026 -- regla generalizada,
    // ver maybeAutoPromote): si en esta cola no hay NINGUNA unidad en
    // Llamando, esta unidad (o la que corresponda por orden) pasa a Llamando
    // de inmediato -- no hace falta que el administrador apriete "Llamar
    // siguiente" cuando no hay a quien mas llamar antes.
    await this.maybeAutoPromote(organizationId, entry.route as RouteDir);

    return this.prisma.queueEntry.findUniqueOrThrow({ where: { id: entryId } });
  }

  /** Transiciones manuales del gerente: llamar, marcar en terminal, embarcando, listo. */
  async advance(organizationId: string, actor: JwtPayload, entryId: string, dto: AdvanceQueueDto) {
    const entry = await this.getEntryOrThrow(organizationId, entryId);
    const currentIndex = ADVANCE_ORDER.indexOf(entry.status as (typeof ADVANCE_ORDER)[number]);
    const targetIndex = ADVANCE_ORDER.indexOf(dto.toStatus);
    if (currentIndex === -1 || targetIndex !== currentIndex + 1) {
      throw new BadRequestException(`No se puede pasar de ${entry.status} a ${dto.toStatus} directamente`);
    }

    const config = await this.getConfig(organizationId);
    const data: Record<string, unknown> = { status: dto.toStatus };
    // Al llamar, arranca el reloj del timeout automatico (via 1 del escape de 3 vias).
    if (dto.toStatus === 'LLAMADO') {
      data.timeoutAt = new Date(Date.now() + config.timeoutMinutes * 60000);
    }
    const updated = await this.prisma.queueEntry.update({ where: { id: entryId }, data });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: `AVANZAR_COLA_${dto.toStatus}`,
        resource: `Cola ${entry.route}`,
        resourceId: entryId,
        before: entry.status,
        after: dto.toStatus,
      },
    });
    return updated;
  }

  /**
   * Via 2 del escape de 3 vias (§3.6): declaracion explicita del conductor
   * ("me inscribo mas tarde" en Cola, "no voy a salir todavia" en Inicio).
   * Lo retira POR COMPLETO de esta cola -- ver withdrawFromQueue.
   */
  async declareLater(organizationId: string, actor: JwtPayload, entryId: string) {
    const entry = await this.findOwnedEntry(organizationId, actor, entryId);
    await this.withdrawFromQueue(entry.id);
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'ME_INSCRIBO_MAS_TARDE',
        resource: `Cola ${entry.route}`,
        resourceId: entry.id,
        before: entry.status,
        after: 'FUERA_DE_COLA (retiro voluntario)',
        reason: 'Declaracion explicita del conductor -- se retira de la cola por completo, no solo se pospone',
      },
    });
    // OJO: nunca devolver null/undefined aqui -- Nest responde con el body
    // vacio y el frontend (que siempre hace res.json()) truena con "Unexpected
    // end of JSON input". Se devuelve un objeto simple aunque el frontend no
    // use el valor (declareLater() en el cliente es Promise<void>).
    return { withdrawn: true, route: entry.route };
  }

  /**
   * Via 3 del escape de 3 vias (§3.6): intervencion manual del gerente/administrador,
   * SIEMPRE con motivo obligatorio — y el mismo mecanismo que reusa el boton de
   * alerta / incidentes reales (§3.7): nunca autoservicio del interesado.
   */
  async override(organizationId: string, actor: JwtPayload, entryId: string, dto: OverrideQueueDto) {
    const entry = await this.getEntryOrThrow(organizationId, entryId);

    if (dto.action === 'REQUEUE') {
      await this.demoteToBack(entry.id, 'INSCRITO');
    } else {
      await this.prisma.queueEntry.update({ where: { id: entry.id }, data: { status: dto.action } });
    }

    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: `EXCEPCION_COLA_${dto.action}`,
        resource: `Cola ${entry.route}`,
        resourceId: entry.id,
        before: entry.status,
        after: dto.action === 'REQUEUE' ? 'INSCRITO (al final)' : dto.action,
        reason: dto.reason,
      },
    });
    return this.prisma.queueEntry.findUnique({ where: { id: entry.id } });
  }

  /**
   * Salida de terminal: cierra la fila en cola y abre el Trip real. Aqui nace
   * la referencia de cadena de predecesores para el proximo vehiculo que use
   * esta misma unidad al re-inscribirse en la cola contraria.
   */
  /**
   * Prepara el viaje (Trip en PROGRAMADO, sin actualDeparture todavia) que
   * necesita el conductor para poder abrir su manifiesto ANTES de salir.
   * Disponible desde que la unidad es LLAMADA en adelante (DOCUMENTO_MAESTRO
   * §6.4: el conductor es autonomo desde que lo llaman, sin pasos intermedios
   * del administrador). Si ya existe un viaje PROGRAMADO para esta
   * unidad/entrada, lo reutiliza (no crea uno nuevo cada vez que el
   * conductor reabre la pantalla).
   */
  async prepareTrip(organizationId: string, actor: JwtPayload, entryId: string) {
    const entry = await this.findOwnedEntry(organizationId, actor, entryId);
    if (!SELF_SERVICE_STATUSES.has(entry.status as (typeof ADVANCE_ORDER)[number])) {
      throw new BadRequestException('La unidad debe estar Llamada (o mas adelante en la fila) para preparar el manifiesto');
    }

    const existing = await this.prisma.trip.findFirst({
      where: { organizationId, vehicleId: entry.vehicleId, route: entry.route as RouteDir, status: 'PROGRAMADO' },
    });
    if (existing) return existing;

    return this.prisma.trip.create({
      data: {
        organizationId,
        vehicleId: entry.vehicleId,
        driverId: entry.driverId,
        route: entry.route,
        status: 'PROGRAMADO',
        gpsStatus: 'SIN_GPS',
      },
    });
  }

  /**
   * "Marcar salida" (plan-flujo-colas-hardware.md §2.4) -- el propio
   * conductor dueno de la unidad, o un administrador, pueden despachar.
   * Reutiliza el viaje PROGRAMADO que dejo prepareTrip() si el conductor ya
   * habia empezado su manifiesto; si no existe (despacho directo del
   * administrador, caso de excepcion), lo crea y activa de una vez.
   */
  async depart(organizationId: string, actor: JwtPayload, entryId: string) {
    const entry = await this.findOwnedEntry(organizationId, actor, entryId);
    if (!SELF_SERVICE_STATUSES.has(entry.status as (typeof ADVANCE_ORDER)[number])) {
      throw new BadRequestException('La unidad debe estar Llamada (o mas adelante en la fila) para salir a viaje');
    }

    const predecessor = await this.prisma.trip.findFirst({
      where: { organizationId, vehicleId: entry.vehicleId, route: opposite(entry.route as RouteDir), status: 'COMPLETADO' },
      orderBy: { actualDeparture: 'desc' },
    });

    const config = await this.getConfig(organizationId);
    const minMinutes =
      entry.route === 'JULI_PUNO' ? config.minTripMinutesOutbound : config.minTripMinutesReturn;
    const now = new Date();
    const scheduledArrival = new Date(now.getTime() + minMinutes * 60000);

    const trip = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.trip.findFirst({
        where: { organizationId, vehicleId: entry.vehicleId, route: entry.route as RouteDir, status: 'PROGRAMADO' },
      });
      const activated = pending
        ? await tx.trip.update({
            where: { id: pending.id },
            data: {
              status: 'ACTIVO',
              actualDeparture: now,
              scheduledArrival,
              predecessorTripId: predecessor?.id ?? null,
            },
          })
        : await tx.trip.create({
            data: {
              organizationId,
              vehicleId: entry.vehicleId,
              driverId: entry.driverId,
              route: entry.route,
              status: 'ACTIVO',
              actualDeparture: now,
              scheduledArrival,
              gpsStatus: 'SIN_GPS',
              predecessorTripId: predecessor?.id ?? null,
            },
          });
      // Si el conductor ya habia abierto su manifiesto sobre el viaje
      // PROGRAMADO, la hora de salida que quedo ahi (provisional, del
      // momento en que abrio el manifiesto) se actualiza a la real.
      await tx.manifest.updateMany({
        where: { tripId: activated.id },
        data: { departureTime: now.toISOString().slice(11, 16) },
      });
      await tx.queueEntry.delete({ where: { id: entry.id } });
      return activated;
    });

    await this.recomputeOrder(organizationId, entry.route as RouteDir);
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'DESPACHAR_VIAJE',
        resource: 'Viaje',
        resourceId: trip.id,
        before: `Cola ${entry.route} (LISTO)`,
        after: 'ACTIVO',
      },
    });
    return trip;
  }

  /**
   * Candado duro de orden real de salida (plan-flujo-colas-hardware.md §3):
   * busca, entre las unidades que completaron su viaje de ida ANTES que
   * `myDeparture`, la mas antigua que todavia no hizo nada en la cola de
   * regreso (ni se inscribio, ni ya salio, ni ya completo el regreso).
   * Devuelve el vehiculo que esta bloqueando, o null si nadie bloquea.
   */
  private async findUnregisteredPredecessor(
    organizationId: string,
    route: RouteDir,
    myDeparture: Date,
    myVehicleId: string,
  ) {
    const earlierArrivals = await this.prisma.trip.findMany({
      where: {
        organizationId,
        route: opposite(route),
        status: 'COMPLETADO',
        actualDeparture: { lt: myDeparture },
        vehicleId: { not: myVehicleId },
      },
      orderBy: { actualDeparture: 'asc' },
      include: { vehicle: true },
    });

    // Nos quedamos con el viaje de ida MAS RECIENTE de cada unidad (por si ya
    // dio varias vueltas hoy) -- como recorremos en orden ascendente, la
    // ultima asignacion por vehiculo es la mas reciente.
    const latestByVehicle = new Map<string, (typeof earlierArrivals)[number]>();
    for (const t of earlierArrivals) latestByVehicle.set(t.vehicleId, t);

    for (const trip of latestByVehicle.values()) {
      const [pendingEntry, activeTrip, completedTrip] = await Promise.all([
        this.prisma.queueEntry.findFirst({ where: { organizationId, route, vehicleId: trip.vehicleId } }),
        this.prisma.trip.findFirst({ where: { organizationId, route, vehicleId: trip.vehicleId, status: 'ACTIVO' } }),
        this.prisma.trip.findFirst({
          where: {
            organizationId,
            route,
            vehicleId: trip.vehicleId,
            status: 'COMPLETADO',
            actualDeparture: { gt: trip.actualDeparture ?? undefined },
          },
        }),
      ]);
      if (!pendingEntry && !activeTrip && !completedTrip) {
        return trip.vehicle;
      }
    }
    return null;
  }

  private async getEntryOrThrow(organizationId: string, entryId: string) {
    const entry = await this.prisma.queueEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.organizationId !== organizationId) {
      throw new NotFoundException('Registro de cola no encontrado');
    }
    return entry;
  }

  private async findOwnedEntry(organizationId: string, actor: JwtPayload, entryId: string) {
    const entry = await this.getEntryOrThrow(organizationId, entryId);
    if (actor.role === 'CONDUCTOR' && entry.driverId !== actor.sub) {
      throw new ForbiddenException('No es tu registro de cola');
    }
    return entry;
  }

  /**
   * Excepcion 3 -- Inscripcion retrasada (plan-operacion.md, Jayde 4 sept
   * 2026): el conductor bloqueado por el candado de orden real de salida (su
   * predecesor no se inscribio ni aviso que se quedaba) presiona este boton
   * para avisarle al administrador -- nunca se resuelve sola, siempre pasa
   * por resolveDelayedRegistrationRequest.
   */
  async createDelayedRegistrationRequest(organizationId: string, actor: JwtPayload, route: RouteDir) {
    if (actor.role !== 'CONDUCTOR') {
      throw new ForbiddenException('Solo el conductor bloqueado puede avisar esto -- el administrador la resuelve desde su panel');
    }
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { organizationId, currentDriverId: actor.sub },
    });
    if (!vehicle) {
      throw new NotFoundException('No se encontro la unidad asignada a tu cuenta');
    }

    // No duplicar si ya hay una solicitud abierta para esta unidad+ruta.
    const existing = await this.prisma.delayedRegistrationRequest.findFirst({
      where: { organizationId, route, requestingVehicleId: vehicle.id, status: { in: ['PENDIENTE', 'AUTORIZADO'] } },
    });
    if (existing) return existing;

    const lastOppositeTrip = await this.prisma.trip.findFirst({
      where: { organizationId, vehicleId: vehicle.id, route: opposite(route), status: 'COMPLETADO' },
      orderBy: { actualDeparture: 'desc' },
    });
    const blocker = lastOppositeTrip?.actualDeparture
      ? await this.findUnregisteredPredecessor(organizationId, route, lastOppositeTrip.actualDeparture, vehicle.id)
      : null;

    const created = await this.prisma.delayedRegistrationRequest.create({
      data: {
        organizationId,
        route,
        requestingVehicleId: vehicle.id,
        blockedByVehicleId: blocker?.id ?? null,
      },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'SOLICITAR_INSCRIPCION_RETRASADA',
        resource: `Cola ${route}`,
        resourceId: created.id,
        before: null,
        after: 'PENDIENTE',
        reason: blocker
          ? `Unidad ${vehicle.code} bloqueada -- la unidad ${blocker.code} no se ha inscrito todavia`
          : `Unidad ${vehicle.code} bloqueada por el candado de orden real de salida`,
      },
    });
    return created;
  }

  /** Panel admin: lista las solicitudes de inscripcion retrasada, mas recientes primero. */
  async listDelayedRegistrationRequests(organizationId: string) {
    return this.prisma.delayedRegistrationRequest.findMany({
      where: { organizationId },
      include: {
        requestingVehicle: { include: { currentDriver: true } },
        blockedByVehicle: { include: { currentDriver: true } },
        resolvedBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * El administrador resuelve una solicitud pendiente con una de 2 acciones:
   * LLAMAR_PREDECESOR (solo se cierra el aviso -- el administrador ya se
   * comunico con la unidad bloqueadora para que se inscriba, el candado
   * sigue activo) o AUTORIZAR_DIRECTO (se autoriza a la unidad bloqueada a
   * inscribirse igual -- ella tiene que volver a presionar "Inscribirme",
   * esto solo levanta el candado para su proximo intento).
   */
  async resolveDelayedRegistrationRequest(
    organizationId: string,
    actor: JwtPayload,
    id: string,
    resolution: 'LLAMAR_PREDECESOR' | 'AUTORIZAR_DIRECTO',
  ) {
    const request = await this.prisma.delayedRegistrationRequest.findUnique({ where: { id } });
    if (!request || request.organizationId !== organizationId) {
      throw new NotFoundException('Solicitud no encontrada');
    }
    if (request.status !== 'PENDIENTE') {
      throw new BadRequestException('Esta solicitud ya fue resuelta');
    }
    const updated = await this.prisma.delayedRegistrationRequest.update({
      where: { id },
      data: {
        status: resolution === 'AUTORIZAR_DIRECTO' ? 'AUTORIZADO' : 'RESUELTO',
        resolution,
        resolvedById: actor.sub,
        resolvedAt: new Date(),
      },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'RESOLVER_INSCRIPCION_RETRASADA',
        resource: `Cola ${request.route}`,
        resourceId: id,
        before: 'PENDIENTE',
        after: updated.status,
        reason:
          resolution === 'AUTORIZAR_DIRECTO'
            ? 'Se autoriza la inscripcion aunque el predecesor no marco -- valido para el proximo intento de esa unidad'
            : 'Se contacto al predecesor para que marque -- el candado sigue activo',
      },
    });
    return updated;
  }
}
