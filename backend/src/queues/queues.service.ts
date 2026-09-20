import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GpsService } from '../gps/gps.service';
import { JwtPayload } from '../auth/jwt.strategy';
import { JoinQueueDto } from './dto/join-queue.dto';
import { ConfirmArrivalDto } from './dto/confirm-arrival.dto';
import { AdvanceQueueDto } from './dto/advance-queue.dto';
import { OverrideQueueDto } from './dto/override-queue.dto';
import { redactPerson } from '../common/redact';

type RouteDir = 'JULI_PUNO' | 'PUNO_JULI';

// El hash de la contraseña NUNCA debe llegar al navegador (mismo criterio
// que people.service.ts / vehicles.service.ts) -- select explicito en vez
// de "driver: true" / "partner: true" / "currentDriver: true".
const PERSON_QUEUE_SELECT = { id: true, name: true, dni: true, phone: true, email: true, code: true } as const;

const ADVANCE_ORDER = ['INSCRITO', 'LLAMADO', 'EN_TERMINAL', 'EMBARCANDO', 'LISTO'] as const;

// Estados desde los que el conductor ya puede prepararse para salir por su
// cuenta (cerrar manifiesto, marcar salida) sin que el administrador tenga
// que seguir avanzandolo manualmente por EN_TERMINAL/EMBARCANDO/LISTO.
// EN_TERMINAL/EMBARCANDO/LISTO se mantienen en el modelo como registro
// opcional (el administrador los puede seguir usando si quiere trazabilidad
// mas fina), pero dejan de ser un requisito bloqueante para "Marcar salida".
const SELF_SERVICE_STATUSES = new Set(ADVANCE_ORDER.slice(1)); // LLAMADO en adelante

// Cuanto hacia atras se mira para la cadena de predecesores (una jornada de trabajo). Es un
// limite razonable, no una cifra del documento maestro.
const PREDECESSOR_WINDOW_HOURS = 18;

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
  constructor(
    private prisma: PrismaService,
    private gps: GpsService,
  ) {}

  private async getConfig(organizationId: string) {
    const config = await this.prisma.operationalConfig.findUnique({ where: { organizationId } });
    if (config) return config;
    // Asociacion sin configuracion explicita todavia: usa los valores por defecto del modelo.
    return this.prisma.operationalConfig.create({ data: { organizationId } });
  }

  async list(organizationId: string, route: RouteDir, actor: JwtPayload) {
    const entries = await this.prisma.queueEntry.findMany({
      where: { organizationId, route },
      include: {
        vehicle: { include: { company: true, partner: { select: PERSON_QUEUE_SELECT } } },
        driver: { select: PERSON_QUEUE_SELECT },
      },
      orderBy: { position: 'asc' },
    });
    // Socios y conductores ven la cola (nombres y codigos), no los datos personales de los demas.
    return entries.map((e) => ({
      ...e,
      driver: redactPerson(e.driver, actor),
      vehicle: { ...e.vehicle, partner: redactPerson(e.vehicle.partner, actor) },
    }));
  }

  private async demoteToBack(entryId: string, newStatus: 'INSCRITO' | 'AUSENTE') {
    await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: {
        status: newStatus,
        escapeState: 'NINGUNO',
        chainDepartureAt: null,
        registeredAt: new Date(),
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
   * y para los que no tienen ese dato (primera vuelta del dia, o una
   * reubicacion -- ver join()) por hora de inscripcion — nunca por el orden
   * en que alguien toco "inscribirme" sin mas contexto.
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
   * nadie en Llamando (al inscribirse, al declinar el turno, o al aplicar
   * una excepcion manual). Si no hay NINGUNA unidad en estado LLAMADO para
   * esta ruta, la primera unidad INSCRITA en orden pasa a Llamando
   * automaticamente -- el administrador no tiene que apretar "Llamar
   * siguiente" cuando en realidad no hay a quien mas llamar antes.
   * Si ya hay alguien Llamando, o no hay ninguna unidad inscrita esperando,
   * no hace nada.
   *
   * Correccion (8 de septiembre de 2026): LLAMANDO ya no vence nunca por el
   * paso del tiempo -- se elimina el timeout automatico (sweepTimeouts).
   * Una unidad permanece en LLAMANDO indefinidamente hasta que su propio
   * conductor presiona "Marcar salida"; el desbloqueo de una posicion
   * depende siempre de una accion explicita, nunca de un cronometro.
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

    await this.prisma.queueEntry.update({
      where: { id: next.id },
      data: { status: 'LLAMADO' },
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
   * Distinto de la excepcion manual del administrador con REQUEUE (override)
   * -- ahi la unidad no decidio voluntariamente salir de la fila: el
   * administrador la esta reinscribiendo a proposito.
   */
  private async withdrawFromQueue(entryId: string) {
    const entry = await this.prisma.queueEntry.findUniqueOrThrow({ where: { id: entryId } });
    await this.prisma.queueEntry.delete({ where: { id: entryId } });
    await this.recomputeOrder(entry.organizationId, entry.route as RouteDir);
    await this.maybeAutoPromote(entry.organizationId, entry.route as RouteDir);
    return entry;
  }

  /**
   * "Inscribirme" (plan-flujo-colas-hardware.md §2 paso 6). Correccion (8 de
   * septiembre de 2026): ya no existen dos pasos separados ("Marcar llegada"
   * + "Inscribirme") ni un tercero de confirmacion GPS aparte -- este unico
   * paso hace las tres cosas: (a) si la unidad tenia un viaje activo en la
   * direccion CONTRARIA, lo completa aqui mismo (antes vivia en
   * trips.service.ts -> complete(), boton "Marcar llegada" en DriverApp.tsx);
   * (b) confirma la evidencia GPS de que esta en la terminal de destino
   * (antes vivia en confirmArrival(), boton "Confirmar llegada" separado);
   * (c) valida el tiempo minimo (§3.4) y el candado de orden real de salida
   * (§3.5) y crea la inscripcion, ya directamente en INSCRITO (nunca
   * PREINSCRITO -- ese estado queda sin uso desde esta correccion, se
   * mantiene en el modelo solo por compatibilidad con filas antiguas).
   */
  async join(organizationId: string, actor: JwtPayload, route: RouteDir, dto: JoinQueueDto) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle || vehicle.organizationId !== organizationId) {
      throw new NotFoundException('Vehiculo no encontrado en esta asociacion');
    }
    // Una unidad desactivada (taller, etc.) o dada de baja no opera: no puede entrar a la cola.
    if (vehicle.status !== 'ACTIVO') {
      throw new ForbiddenException(
        vehicle.status === 'BAJA'
          ? `La unidad ${vehicle.code} esta dada de baja -- no puede inscribirse`
          : `La unidad ${vehicle.code} esta desactivada -- reactivala antes de inscribirla en la cola`,
      );
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

    // Regla dura universal (§3.1) -- MODIFICADA (correccion 8 de septiembre de
    // 2026, fusion de "Marcar llegada" en "Inscribirme"): un viaje activo de
    // esta unidad ya no bloquea por si solo la inscripcion. Si el viaje
    // activo es justo en la direccion CONTRARIA a la que se quiere
    // inscribir, se completa mas abajo como parte de este mismo paso. Si el
    // viaje activo es en la MISMA direccion que se intenta inscribir, eso si
    // sigue bloqueado — no tiene sentido re-inscribirse en la ruta que ya
    // esta recorriendo.
    const activeTrip = await this.prisma.trip.findFirst({
      where: { organizationId, vehicleId: vehicle.id, status: 'ACTIVO' },
    });
    if (activeTrip && activeTrip.route === route) {
      throw new ForbiddenException('La unidad tiene un viaje activo en esta misma direccion — no puede inscribirse hasta llegar');
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
    // Una entrada AUSENTE o RETIRADA (intervencion del administrador) es historia, no una
    // inscripcion vigente: se reemplaza al volver a inscribirse. Antes la unidad quedaba
    // bloqueada con "ya esta inscrita" y no podia volver a la cola.
    if (existing && !['AUSENTE', 'RETIRADO'].includes(existing.status)) {
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
    // La orden dice DE donde salen las unidades y A donde van. Al llegar al terminal destino
    // (la orden.toTerminal), la unidad se inscribe en la cola que sale de ese terminal.
    const queueOrigin = route === 'JULI_PUNO' ? 'JULI' : 'PUNO';
    const queueDestination = route === 'JULI_PUNO' ? 'PUNO' : 'JULI';
    const verifiedRelocation = dto.isRelocation
      ? await this.prisma.relocationUnit.findFirst({
          where: {
            vehicleId: vehicle.id,
            relocationOrder: { organizationId, status: 'EN_TRASLADO', fromTerminal: queueDestination, toTerminal: queueOrigin },
          },
        })
      : null;
    if (dto.isRelocation && !verifiedRelocation) {
      throw new ForbiddenException(
        'No hay una reubicacion autorizada para esta unidad en este sentido -- contacta a tu administrador',
      );
    }

    // Confirmacion de llegada por GPS (§3.3), fusionada aqui (correccion 8 de
    // septiembre de 2026) -- misma fuente que antes en trips.service.ts ->
    // complete(): hardware Traccar si esta unidad ya lo tiene vinculado (PRO
    // real), si no exige el GPS del celular (chequeo puntual, nunca rastreo
    // continuo). Sin ninguna de las dos, solo administrador/superadmin puede
    // continuar (caso de excepcion), igual que ya permitia confirmArrival().
    const config = await this.getConfig(organizationId);
    const terminal =
      route === 'JULI_PUNO'
        ? { lat: config.terminalOriginLat, lng: config.terminalOriginLng }
        : { lat: config.terminalDestinationLat, lng: config.terminalDestinationLng };

    let evidence: 'PRESENCIA_TERMINAL' | 'REGISTRO_MOVIL' | 'SIN_EVIDENCIA' = 'SIN_EVIDENCIA';
    let tripGpsStatus: 'SIN_GPS' | 'REGISTRO_MOVIL' | 'GPS_FISICO' = 'SIN_GPS';
    let arrivalLat: number | null = null;
    let arrivalLng: number | null = null;

    // Radio de terminal (Jayde, 9 sept 2026): antes esta distancia solo
    // rebajaba la calidad de la evidencia, nunca rechazaba nada -- ni
    // siquiera se calculaba en Plan PRO. Ahora, en los dos planes, si SI hay
    // una posicion real (hardware o celular) y esta fuera del radio
    // configurado, se rechaza para cualquier rol -- el dato ya existe y
    // contradice la presencia, nadie puede "forzarlo". La excepcion de
    // administrador/superadmin de mas abajo sigue intacta y solo aplica
    // cuando NO hay ninguna posicion disponible (nunca cuando la hay y dice
    // que esta lejos).
    const hardwarePosition = await this.gps.getVehiclePosition(organizationId, vehicle.id).catch(() => null);
    if (hardwarePosition) {
      tripGpsStatus = 'GPS_FISICO';
      const distance = distanceMeters(hardwarePosition.lat, hardwarePosition.lng, terminal.lat, terminal.lng);
      if (distance > config.gpsRadiusMeters) {
        throw new ForbiddenException(
          `El GPS del vehiculo indica que esta a ${Math.round(distance)}m del terminal -- fuera del radio permitido (${config.gpsRadiusMeters}m). Acercate al terminal para poder inscribirte.`,
        );
      }
      evidence = 'PRESENCIA_TERMINAL';
      arrivalLat = hardwarePosition.lat;
      arrivalLng = hardwarePosition.lng;
    } else if (dto.lat !== undefined && dto.lng !== undefined) {
      tripGpsStatus = 'REGISTRO_MOVIL';
      const distance = distanceMeters(dto.lat, dto.lng, terminal.lat, terminal.lng);
      if (distance > config.gpsRadiusMeters) {
        throw new ForbiddenException(
          `Tu ubicacion esta a ${Math.round(distance)}m del terminal -- fuera del radio permitido (${config.gpsRadiusMeters}m). Acercate al terminal para poder inscribirte.`,
        );
      }
      evidence = 'PRESENCIA_TERMINAL';
      arrivalLat = dto.lat;
      arrivalLng = dto.lng;
    } else if (actor.role === 'CONDUCTOR') {
      throw new BadRequestException(
        'Falta la ubicacion del celular para confirmar la llegada. Revisa los permisos de ubicacion del navegador.',
      );
    }
    // administrador/superadmin sin ninguna de las dos evidencias: sigue SIN_EVIDENCIA/SIN_GPS,
    // caso de excepcion real (igual que ya permitia trips.service.ts -> complete()).

    // Ultimo viaje de esta unidad en la direccion contraria — da el gate de tiempo
    // minimo (§3.4) y la hora real de salida para la cadena de predecesores (§3.5).
    // Con la fusion de arriba, si hay un viaje activo (siempre en la direccion
    // contraria por el chequeo de mas arriba) es EXACTAMENTE el que se completa
    // en este mismo paso — ya no hace falta una query aparte a un viaje ya
    // COMPLETADO, se usa directamente.
    const lastOppositeTrip =
      activeTrip ??
      (await this.prisma.trip.findFirst({
        where: { organizationId, vehicleId: vehicle.id, route: opposite(route), status: 'COMPLETADO' },
        orderBy: { actualDeparture: 'desc' },
      }));

    if (lastOppositeTrip?.actualDeparture && !verifiedRelocation) {
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

    // Reubicaciones (§3.9): orden en destino por llegada GPS REAL, nunca por
    // un dato de un viaje viejo/no relacionado -- si se usara aqui el
    // lastOppositeTrip de arriba (normalmente irrelevante en una reubicacion,
    // que no tiene un viaje comercial real recien completado en ese sentido)
    // el orden quedaria "ciego", elegido de antemano por una fecha vieja en
    // vez de por cuando la unidad llego de verdad. Se deja chainDepartureAt en
    // null a proposito para que recomputeOrder use registeredAt -- el
    // instante de este mismo paso de "Inscribirme", justo cuando se confirmo
    // la evidencia GPS de arriba.
    const chainDepartureAt = verifiedRelocation ? null : lastOppositeTrip?.actualDeparture ?? null;

    const created = await this.prisma.$transaction(async (tx) => {
      // Completa el viaje activo (si lo hay) como parte de este mismo paso —
      // antes era la accion separada "Marcar llegada" (trips.service.ts -> complete()).
      if (activeTrip) {
        await tx.trip.update({
          where: { id: activeTrip.id },
          data: { status: 'COMPLETADO', actualArrival: new Date(), gpsStatus: tripGpsStatus },
        });
      }
      if (existing) await tx.queueEntry.delete({ where: { id: existing.id } });
      return tx.queueEntry.create({
        data: {
          organizationId,
          route,
          position: 1, // se recalcula abajo con recomputeOrder
          vehicleId: vehicle.id,
          driverId,
          status: 'INSCRITO',
          evidence,
          deviceId: dto.deviceId,
          arrivalGpsLat: arrivalLat,
          arrivalGpsLng: arrivalLng,
          arrivalCheckedAt: new Date(),
          chainDepartureAt,
        },
      });
    });
    await this.recomputeOrder(organizationId, route);
    await this.maybeAutoPromote(organizationId, route);

    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'INSCRIPCION_COLA',
        resource: `Cola ${route}`,
        resourceId: created.id,
        before: null,
        after: 'INSCRITO',
        evidence,
        reason: `Unidad ${vehicle.code}`,
      },
    });
    if (activeTrip) {
      await this.prisma.auditEntry.create({
        data: {
          organizationId,
          actorId: actor.sub,
          actorRole: actor.role,
          action: 'COMPLETAR_VIAJE',
          resource: 'Viaje',
          resourceId: activeTrip.id,
          before: 'ACTIVO',
          after: 'COMPLETADO',
          evidence: tripGpsStatus,
          reason: 'Completado como parte del mismo paso de "Inscribirme" en la cola contraria',
        },
      });
    }

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
   * Legado: confirmacion de llegada por GPS como paso separado. Desde la
   * correccion del 8 de septiembre de 2026 esto ya vive fusionado dentro de
   * join() y las inscripciones nuevas nunca quedan en PREINSCRITO -- este
   * metodo se mantiene solo por compatibilidad con filas PREINSCRITO que
   * hayan quedado de antes del corte (no hay ninguna forma de crear una
   * fila nueva en ese estado).
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

    await this.prisma.queueEntry.update({
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

    const updated = await this.prisma.queueEntry.update({ where: { id: entryId }, data: { status: dto.toStatus } });
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
   * Via 2 del escape de 2 vias (§3.6): declaracion explicita del conductor
   * ("me inscribo mas tarde" en Cola, "no voy a salir todavia" en Inicio).
   * Lo retira POR COMPLETO de esta cola -- ver withdrawFromQueue.
   */
  async declareLater(organizationId: string, actor: JwtPayload, entryId: string) {
    const entry = await this.findOwnedEntry(organizationId, actor, entryId);
    await this.withdrawFromQueue(entry.id);
    // Cadena de predecesores (§3.5): declarar "no saldre ahora" RESUELVE la situacion de esta
    // unidad para las que salieron despues -- deja de bloquearlas. Se marca el viaje de ida que
    // la trajo (el que fijo su lugar en la cola, chainDepartureAt).
    if (entry.chainDepartureAt) {
      await this.prisma.trip.updateMany({
        where: {
          organizationId,
          vehicleId: entry.vehicleId,
          route: opposite(entry.route as RouteDir),
          status: 'COMPLETADO',
          actualDeparture: entry.chainDepartureAt,
        },
        data: { returnHandledAt: new Date() },
      });
    }
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
   * Via 2 (unica via de intervencion manual restante, §3.6): intervencion del
   * gerente/administrador, SIEMPRE con motivo obligatorio — el mismo
   * mecanismo que reusa el boton de alerta / incidentes reales (§3.7): nunca
   * autoservicio del interesado.
   */
  async override(organizationId: string, actor: JwtPayload, entryId: string, dto: OverrideQueueDto) {
    const entry = await this.getEntryOrThrow(organizationId, entryId);

    if (dto.action === 'REQUEUE') {
      await this.demoteToBack(entry.id, 'INSCRITO');
    } else {
      await this.prisma.queueEntry.update({ where: { id: entry.id }, data: { status: dto.action } });
      // La cola no puede quedarse sin nadie LLAMADO si todavia hay unidades esperando.
      await this.maybeAutoPromote(entry.organizationId, entry.route as RouteDir);
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
   * Prepara el viaje (Trip en PROGRAMADO, sin actualDeparture todavia) que
   * necesita el conductor para poder abrir su manifiesto ANTES de salir.
   * Correccion (8 de septiembre de 2026): disponible UNICAMENTE mientras la
   * unidad esta LLAMADA -- no "LLAMADA o mas adelante en la fila". El
   * manifiesto nunca se prepara antes (no hay viaje que llenar) ni en un
   * estado posterior (plan-operacion.md §3.8). Si ya existe un viaje
   * PROGRAMADO para esta unidad/entrada, lo reutiliza (no crea uno nuevo
   * cada vez que el conductor reabre la pantalla).
   */
  async prepareTrip(organizationId: string, actor: JwtPayload, entryId: string) {
    const entry = await this.findOwnedEntry(organizationId, actor, entryId);
    if (entry.status !== 'LLAMADO') {
      throw new BadRequestException('La unidad debe estar Llamada para preparar el manifiesto');
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
   * Correccion (8 de septiembre de 2026): no existe despacho sin manifiesto,
   * ni como flujo normal ni como excepcion administrativa -- ni siquiera en
   * un caso de accidente/robo/celular perdido (esos casos se resuelven
   * reasignando el dispositivo o interviniendo la cola, nunca saltandose el
   * manifiesto). Por eso ya no se crea un viaje "directo" cuando no existe
   * uno PROGRAMADO: siempre tiene que existir ya, con su manifiesto CERRADO
   * (o CORREGIDO/CON_INCIDENCIA -- cualquier estado despues de BORRADOR).
   */
  async depart(organizationId: string, actor: JwtPayload, entryId: string) {
    const entry = await this.findOwnedEntry(organizationId, actor, entryId);
    if (!SELF_SERVICE_STATUSES.has(entry.status as (typeof ADVANCE_ORDER)[number])) {
      throw new BadRequestException('La unidad debe estar Llamada (o mas adelante en la fila) para salir a viaje');
    }

    const pending = await this.prisma.trip.findFirst({
      where: { organizationId, vehicleId: entry.vehicleId, route: entry.route as RouteDir, status: 'PROGRAMADO' },
      include: { manifest: true },
    });
    if (!pending) {
      throw new BadRequestException(
        'Falta preparar el manifiesto antes de marcar salida -- no existe despacho sin manifiesto',
      );
    }
    if (!pending.manifest || pending.manifest.status === 'BORRADOR') {
      throw new BadRequestException(
        'El manifiesto de este viaje todavia no esta cerrado -- cierralo antes de marcar salida',
      );
    }

    const predecessor = await this.prisma.trip.findFirst({
      where: { organizationId, vehicleId: entry.vehicleId, route: opposite(entry.route as RouteDir), status: 'COMPLETADO' },
      orderBy: { actualDeparture: 'desc' },
    });

    const now = new Date();
    const config = await this.getConfig(organizationId);
    const minMinutes =
      entry.route === 'JULI_PUNO' ? config.minTripMinutesOutbound : config.minTripMinutesReturn;
    const scheduledArrival = new Date(now.getTime() + minMinutes * 60000);

    const trip = await this.prisma.$transaction(async (tx) => {
      const activated = await tx.trip.update({
        where: { id: pending.id },
        data: {
          status: 'ACTIVO',
          actualDeparture: now,
          scheduledArrival,
          predecessorTripId: predecessor?.id ?? null,
        },
      });
      // La hora de salida que quedo en el manifiesto (provisional, del
      // momento en que se preparo el viaje) se actualiza a la real.
      await tx.manifest.updateMany({
        where: { tripId: activated.id },
        data: { departureTime: now.toISOString().slice(11, 16) },
      });
      await tx.queueEntry.delete({ where: { id: entry.id } });
      return activated;
    });

    await this.recomputeOrder(organizationId, entry.route as RouteDir);
    // plan-flujo-colas-hardware.md §2.4: al salir una unidad, la siguiente pasa sola a LLAMADO.
    await this.maybeAutoPromote(organizationId, entry.route as RouteDir);
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
    // Solo cuenta la jornada en curso: una unidad que termino su ultimo viaje ayer y no volvio a
    // inscribirse NO debe bloquear a las de hoy para siempre (antes no habia limite de tiempo).
    const windowStart = new Date(myDeparture.getTime() - PREDECESSOR_WINDOW_HOURS * 3600_000);
    const earlierArrivals = await this.prisma.trip.findMany({
      where: {
        organizationId,
        route: opposite(route),
        status: 'COMPLETADO',
        actualDeparture: { lt: myDeparture, gte: windowStart },
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
      // La unidad ya declaro "no saldre ahora" para este viaje: quedo resuelta, no bloquea.
      if (trip.returnHandledAt) continue;
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
        requestingVehicle: { include: { currentDriver: { select: PERSON_QUEUE_SELECT } } },
        blockedByVehicle: { include: { currentDriver: { select: PERSON_QUEUE_SELECT } } },
        resolvedBy: { select: PERSON_QUEUE_SELECT },
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
