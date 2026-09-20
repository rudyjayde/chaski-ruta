import { routeLabel as routeLabelFor } from '../common/route-labels';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GpsService } from '../gps/gps.service';
import { MailService } from '../mail/mail.service';

// Deteccion automatica de posibles accidentes (docs/planes/ia-aplicada.md
// §3.1, PRIORIDAD 1). Umbrales propuestos por Claude (9 sept 2026) -- Jayde
// delego el valor exacto ("yo propongo un valor razonable, lo reviso
// despues"), asi que estos 4 numeros son ajustables sin tocar la logica:
//
//  - SPEED_MOVING_KMH: por debajo de esto el vehiculo ya se considera
//    "andando normal" en el corredor (no autopista -- via de montana Juli-
//    Puno), suficiente para descartar que ya estaba detenido de por si.
//  - SPEED_STOPPED_KMH: por debajo de esto se considera inmovil (deja margen
//    de ruido de GPS -- un fix parado casi nunca da exactamente 0).
//  - IMMOBILITY_MINUTES: cuanto tiempo de inmovilidad sostenida hace falta
//    despues de ir "andando normal" para dejar de ser un semaforo/control y
//    empezar a ser sospechoso.
//  - LOOKBACK_MINUTES: ventana de historial que se pide a Traccar en cada
//    corrida (debe ser mayor a IMMOBILITY_MINUTES para poder ver el "antes").
//
// IMPORTANTE (honestidad del principio rector, ia-aplicada.md §1): esto es
// un patron de velocidad + inmovilidad -- NO una deteccion real de impacto.
// El hardware Teltonika puede reportar un evento de choque/acelerometro,
// pero este backend no lee ese atributo de Traccar hoy (no esta parseado en
// GpsService). Por eso el texto de la alerta y del correo dice "posible
// accidente" y pide verificacion humana -- nunca "accidente confirmado".
const SPEED_MOVING_KMH = 30;
const SPEED_STOPPED_KMH = 3;
const IMMOBILITY_MINUTES = 8;
const LOOKBACK_MINUTES = 20;

@Injectable()
export class AccidentDetectionService {
  private readonly logger = new Logger(AccidentDetectionService.name);

  constructor(
    private prisma: PrismaService,
    private gps: GpsService,
    private mail: MailService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkActiveTrips() {
    // Solo unidades con hardware Traccar vinculado (Plan PRO real) tienen
    // telemetria continua -- sin eso no hay nada que analizar (ia-aplicada.md
    // §3.1: "Depende de: unidades con GPS fisico activo (PRO)").
    const trips = await this.prisma.trip.findMany({
      where: { status: 'ACTIVO', vehicle: { traccarDeviceId: { not: null } } },
      include: { vehicle: true, organization: true },
    });
    if (trips.length === 0) return;

    for (const trip of trips) {
      try {
        await this.evaluateTrip(trip.id, trip.organizationId, trip.vehicleId);
      } catch (err) {
        // Un error de Traccar (servidor caido, credenciales, etc.) en un
        // viaje nunca debe frenar la revision de los demas.
        this.logger.error(
          `Error evaluando posible accidente para el viaje ${trip.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async evaluateTrip(tripId: string, organizationId: string, vehicleId: string) {
    const now = new Date();
    const from = new Date(now.getTime() - LOOKBACK_MINUTES * 60_000);
    const history = await this.gps.getPositionHistory(organizationId, vehicleId, from.toISOString(), now.toISOString());
    if (history.length === 0) return;

    // El ultimo fix tiene que ser reciente -- si Traccar no reporta nada
    // hace rato (perdida de señal, unidad apagada) no es un accidente, es
    // silencio de datos; el principio rector (§2.6) prohibe justo inventar
    // una conclusion cuando falta la señal.
    const last = history[history.length - 1];
    const minutesSinceLast = (now.getTime() - new Date(last.fixTime).getTime()) / 60_000;
    if (minutesSinceLast > 5) return;
    if (last.speedKmh > SPEED_STOPPED_KMH) return; // sigue en movimiento, no hay nada que marcar

    // Buscar el ultimo fix "andando normal" dentro de la ventana.
    let lastMovingIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].speedKmh >= SPEED_MOVING_KMH) {
        lastMovingIndex = i;
        break;
      }
    }
    if (lastMovingIndex === -1) return; // en toda la ventana nunca "iba andando" -- no hay desaceleracion que evaluar

    // Desde ese punto hasta ahora, todo el tramo debe estar inmovil (sin otro
    // pico de velocidad en el medio -- si volvio a moverse, no es un patron
    // de accidente, fue una parada normal que ya siguio su viaje).
    const stillMoving = history.slice(lastMovingIndex + 1).some((p) => p.speedKmh > SPEED_STOPPED_KMH);
    if (stillMoving) return;

    const stoppedSinceMinutes = (now.getTime() - new Date(history[lastMovingIndex].fixTime).getTime()) / 60_000;
    if (stoppedSinceMinutes < IMMOBILITY_MINUTES) return;

    await this.flagPossibleAccident(tripId, organizationId, vehicleId, {
      lat: last.lat,
      lng: last.lng,
      stoppedSinceMinutes: Math.round(stoppedSinceMinutes),
      speedBeforeKmh: history[lastMovingIndex].speedKmh,
    });
  }

  private async flagPossibleAccident(
    tripId: string,
    organizationId: string,
    vehicleId: string,
    evidence: { lat: number; lng: number; stoppedSinceMinutes: number; speedBeforeKmh: number },
  ) {
    // Releer el viaje adentro de la transaccion logica: puede que ya lo haya
    // resuelto un administrador, o marcado otra alerta, entre el query masivo
    // de arriba y este punto -- nunca pisar un estado que ya cambio.
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { vehicle: true, organization: true } });
    if (!trip || trip.status !== 'ACTIVO') return;

    const note =
      `Detección automática (no confirmada): la unidad ${trip.vehicle.code} iba a ` +
      `~${evidence.speedBeforeKmh} km/h y quedó inmóvil desde hace ${evidence.stoppedSinceMinutes} min. ` +
      `Puede ser un accidente, una avería, o una parada real -- verificar con el conductor.`;

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'CON_INCIDENCIA', incidentNote: note },
    });

    // Union con el sistema de Alertas GPS (12 sept 2026) -- ANTES esto solo
    // cambiaba el estado del viaje y mandaba un correo, nunca aparecia en
    // "Alertas GPS" ni en el banner rojo/campanita que ya usan
    // panico/remolque/energia. No hace falta deduplicar (a diferencia de
    // gps-alerts.service.ts): este metodo solo corre una vez por viaje,
    // porque checkActiveTrips() ya solo evalua viajes en estado ACTIVO.
    await this.prisma.gpsAlert.create({
      data: { organizationId, vehicleId, type: 'POSIBLE_ACCIDENTE', description: note },
    });

    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: null,
        actorRole: 'SISTEMA',
        action: 'DETECCION_AUTOMATICA_POSIBLE_ACCIDENTE',
        resource: 'Viaje',
        resourceId: tripId,
        before: 'ACTIVO',
        after: 'CON_INCIDENCIA',
        reason: note,
        evidence: JSON.stringify(evidence),
      },
    });

    this.logger.warn(`Posible accidente detectado -- viaje ${tripId}, unidad ${trip.vehicle.code}: ${note}`);

    // Notificacion "ambos" confirmada por Jayde: alerta en la app (ya cubierta
    // por CON_INCIDENCIA, que Viajes/Operaciones ya muestran) + correo.
    //
    // A quien le llega el correo (12 sept 2026, decidido con Jayde): si la
    // asociacion tiene Plan PRO, a cada administrador activo (como siempre).
    // Si NO tiene PRO, la unidad solo tiene GPS Vehicular individual pagado
    // por el socio -- el Administrador de esa asociacion no tiene por que
    // enterarse, asi que en su lugar se notifica a Super Admin.
    const routeConfig = await this.prisma.operationalConfig.findUnique({ where: { organizationId } });
    const routeLabel = routeLabelFor(trip.route as 'JULI_PUNO' | 'PUNO_JULI', routeConfig);
    if (trip.organization.plan === 'PRO') {
      const admins = await this.prisma.person.findMany({
        where: { organizationId, role: 'ADMINISTRADOR', status: 'ACTIVO' },
      });
      // Mismo formato ya usado en digest.service.ts para el resumen del gerente.
      await Promise.all(
        admins.map((admin) =>
          this.mail.sendPossibleAccidentAlert({
            to: admin.email,
            adminName: admin.name,
            vehicleCode: trip.vehicle.code,
            routeLabel,
            note,
            lat: evidence.lat,
            lng: evidence.lng,
            detectedAt: new Date(),
          }),
        ),
      );
    } else {
      await this.mail.sendSuperAdminSafetyAlertEmail({
        orgName: trip.organization.name,
        vehicleCode: trip.vehicle.code,
        alertTypeLabel: 'Posible accidente',
        description: note,
        detectedAt: new Date(),
      });
    }

    return updated;
  }
}
