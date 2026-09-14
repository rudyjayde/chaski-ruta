import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GpsAlertType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GpsService } from '../gps/gps.service';
import { RouteGeofenceService, type GeofencePoint } from '../route-geofence/route-geofence.service';
import { MailService } from '../mail/mail.service';
import { JwtPayload } from '../auth/jwt.strategy';

// Alertas "graves" (mismo criterio que URGENT_TYPES en GpsAlertBanner.tsx del
// frontend): si ocurren en una unidad con GPS Vehicular individual, sin que
// la asociacion tenga Plan PRO, el Administrador nunca las ve (no pago ese
// servicio) -- en su lugar se le notifica a Super Admin por correo (12 sept
// 2026, decidido con Jayde).
const URGENT_ALERT_TYPES: GpsAlertType[] = ['BOTON_PANICO', 'POSIBLE_REMOLQUE', 'POSIBLE_ACCIDENTE', 'FUERA_DE_RUTA'];
const ALERT_TYPE_LABEL: Record<string, string> = {
  DESCONEXION: 'Desconexión',
  MOVIMIENTO_SIN_VIAJE: 'Movimiento sin viaje',
  CORTE_ENERGIA: 'Corte de energía',
  POSIBLE_REMOLQUE: 'Posible remolque',
  BOTON_PANICO: 'Botón de pánico',
  FALLA_REPORTADA: 'Falla reportada por conductor',
  POSIBLE_ACCIDENTE: 'Posible accidente',
  FUERA_DE_RUTA: 'Fuera del corredor autorizado',
};

// Deteccion automatica de alertas GPS (docs/planes/ia-aplicada.md §1): el
// sistema SOLO marca evidencia para revision, nunca sanciona ni concluye
// nada por su cuenta -- mismo principio que accident-detection.service.ts.
//
//  - DESCONEXION: el dispositivo vinculado a la unidad dejo de reportar
//    (Traccar lo marca 'offline').
//  - MOVIMIENTO_SIN_VIAJE: la unidad se mueve a mas de MOVING_THRESHOLD_KMH
//    sin tener un viaje ACTIVO registrado en el sistema -- posible uso fuera
//    de la operacion de la asociacion.
//  - CORTE_ENERGIA (12 sept 2026): powerVoltage cae por debajo de
//    POWER_CUT_THRESHOLD_V -- el equipo paso a su bateria interna, señal de
//    que desconectaron la bateria del vehiculo (falla o manipulacion).
//  - POSIBLE_REMOLQUE (12 sept 2026): motion=true con ignition=false -- el
//    vehiculo se esta desplazando sin el motor encendido (posible robo).
//  - BOTON_PANICO (12 sept 2026): attributes.alarm === 'sos' -- revisado en
//    un cron APARTE, cada 30s en vez de 5 minutos, porque una emergencia real
//    no puede esperar el mismo intervalo que el resto de alertas. Ver el
//    comentario del enum GpsAlertType en schema.prisma: ningun equipo real de
//    esta flota tiene todavia el boton fisico cableado, asi que esta deteccion
//    esta lista pero sin verificar contra un evento real.
//  - FUERA_DE_RUTA (12 sept 2026): la unidad tiene un viaje ACTIVO pero su
//    posicion cae fuera del corredor dibujado a mano (RouteGeofence) --
//    solo se evalua si la asociacion ya dibujo su corredor; sin eso, no hay
//    nada que comparar (nunca se asume un corredor por defecto).
const MOVING_THRESHOLD_KMH = 15;
const POWER_CUT_THRESHOLD_V = 5;

@Injectable()
export class GpsAlertsService {
  private readonly logger = new Logger(GpsAlertsService.name);

  constructor(
    private prisma: PrismaService,
    private gps: GpsService,
    private routeGeofence: RouteGeofenceService,
    private mail: MailService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkFleet() {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { traccarDeviceId: { not: null } },
      select: { organizationId: true },
      distinct: ['organizationId'],
    });
    if (vehicles.length === 0) return;

    for (const { organizationId } of vehicles) {
      try {
        await this.checkOrganization(organizationId);
      } catch (err) {
        // Un error de Traccar en una asociacion nunca debe frenar la
        // revision de las demas.
        this.logger.error(
          `Error revisando alertas GPS de la asociacion ${organizationId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Aparte del checkFleet() de arriba (cada 5 min): el boton de panico exige
  // la menor latencia posible, asi que se revisa cada 30s en su propio cron
  // en vez de compartir el intervalo del resto de alertas.
  @Cron('*/30 * * * * *')
  async checkPanicButton() {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { traccarDeviceId: { not: null } },
      select: { organizationId: true },
      distinct: ['organizationId'],
    });
    if (vehicles.length === 0) return;

    for (const { organizationId } of vehicles) {
      try {
        const positions = await this.gps.getLivePositions(organizationId);
        for (const pos of positions) {
          if (pos.panicAlarm) {
            await this.ensureAlert(
              organizationId,
              pos.vehicleId,
              'BOTON_PANICO',
              `Botón de pánico activado en la unidad ${pos.code}.`,
            );
          }
        }
      } catch (err) {
        this.logger.error(
          `Error revisando boton de panico de la asociacion ${organizationId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async checkOrganization(organizationId: string) {
    const [devices, positions, activeTrips, geofence] = await Promise.all([
      this.gps.getDeviceStatuses(organizationId),
      this.gps.getLivePositions(organizationId),
      this.prisma.trip.findMany({ where: { organizationId, status: 'ACTIVO' }, select: { vehicleId: true } }),
      this.routeGeofence.get(organizationId),
    ]);
    const activeVehicleIds = new Set(activeTrips.map((t) => t.vehicleId));
    const geofencePoints = geofence ? (geofence.points as unknown as GeofencePoint[]) : null;

    for (const device of devices) {
      if (device.linked && device.online === 'offline') {
        await this.ensureAlert(
          organizationId,
          device.vehicleId,
          'DESCONEXION',
          `La unidad ${device.code} perdió conexión con su dispositivo GPS.`,
        );
      }
    }

    for (const pos of positions) {
      if (pos.speedKmh > MOVING_THRESHOLD_KMH && !activeVehicleIds.has(pos.vehicleId)) {
        await this.ensureAlert(
          organizationId,
          pos.vehicleId,
          'MOVIMIENTO_SIN_VIAJE',
          `La unidad ${pos.code} se está moviendo a ${pos.speedKmh} km/h sin un viaje activo registrado.`,
        );
      }

      // Solo evalua si el equipo realmente reporta el atributo -- null
      // significa que el firmware no lo tiene habilitado, no que este en 0.
      if (pos.powerVoltage != null && pos.powerVoltage < POWER_CUT_THRESHOLD_V) {
        await this.ensureAlert(
          organizationId,
          pos.vehicleId,
          'CORTE_ENERGIA',
          `La unidad ${pos.code} perdió la energía de la batería del vehículo (equipo funcionando con batería interna).`,
        );
      }

      if (pos.motion === true && pos.ignition === false) {
        await this.ensureAlert(
          organizationId,
          pos.vehicleId,
          'POSIBLE_REMOLQUE',
          `La unidad ${pos.code} se está desplazando con el motor apagado — posible remolque no autorizado.`,
        );
      }

      // Solo tiene sentido comparar contra el corredor mientras hay un viaje
      // activo -- una unidad parada en su cochera fuera del corredor es normal.
      if (geofencePoints && activeVehicleIds.has(pos.vehicleId)) {
        const inside = RouteGeofenceService.isInside({ lat: pos.lat, lng: pos.lng }, geofencePoints);
        if (!inside) {
          await this.ensureAlert(
            organizationId,
            pos.vehicleId,
            'FUERA_DE_RUTA',
            `La unidad ${pos.code} está en un viaje activo pero su posición real cae fuera del corredor autorizado.`,
          );
        }
      }
    }
  }

  /**
   * Reporte manual del conductor/socio (12 sept 2026) -- "Reportar falla
   * GPS" / "Reportar emergencia" ANTES eran botones decorativos (solo un
   * mensaje local, nunca avisaban a nadie). Ahora crean una GpsAlert real,
   * igual que si la hubiera detectado el cron -- por eso ya sale en el
   * banner y en "Alertas GPS" de Admin/Socio, sin necesitar nada nuevo ahi.
   */
  async reportManual(organizationId: string, actor: JwtPayload, dto: { type: 'BOTON_PANICO' | 'FALLA_REPORTADA'; note?: string }) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { organizationId, OR: [{ currentDriverId: actor.sub }, { partnerId: actor.sub }] },
    });
    if (!vehicle) throw new NotFoundException('No tienes una unidad asignada para reportar.');
    if (!vehicle.traccarDeviceId) {
      throw new BadRequestException('Esta unidad no tiene un dispositivo GPS real vinculado.');
    }

    const roleLabel = actor.role === 'CONDUCTOR' ? 'el conductor' : 'el socio';
    const baseDescription =
      dto.type === 'BOTON_PANICO'
        ? `Emergencia reportada manualmente por ${roleLabel} de la unidad ${vehicle.code}.`
        : `Falla de GPS reportada manualmente por ${roleLabel} de la unidad ${vehicle.code}.`;
    const description = dto.note?.trim() ? `${baseDescription} Nota: ${dto.note.trim()}` : baseDescription;

    return this.ensureAlert(organizationId, vehicle.id, dto.type, description);
  }

  /**
   * Cross-organizacion, solo Super Admin (12 sept 2026): alertas graves
   * abiertas en asociaciones SIN Plan PRO -- el mismo conjunto que dispara el
   * correo de notifySuperAdminIfNoPro(), para que el Resumen de Super Admin
   * muestre exactamente lo mismo que le llega por correo, sin depender de
   * revisar cada asociacion una por una.
   */
  findUrgentForSuperAdmin() {
    return this.prisma.gpsAlert.findMany({
      where: {
        type: { in: URGENT_ALERT_TYPES },
        status: { in: ['NUEVA', 'EN_REVISION'] },
        organization: { plan: { not: 'PRO' } },
      },
      include: {
        vehicle: { select: { code: true, plate: true } },
        organization: { select: { id: true, name: true } },
      },
      orderBy: { detectedAt: 'desc' },
      take: 50,
    });
  }

  // Evita duplicar la misma alerta cada 5 minutos mientras la condicion
  // siga presente -- solo crea una nueva si no hay ya una abierta
  // (NUEVA o EN_REVISION) del mismo tipo para esa unidad.
  private async ensureAlert(
    organizationId: string,
    vehicleId: string,
    type: 'DESCONEXION' | 'MOVIMIENTO_SIN_VIAJE' | 'CORTE_ENERGIA' | 'POSIBLE_REMOLQUE' | 'BOTON_PANICO' | 'FALLA_REPORTADA' | 'FUERA_DE_RUTA',
    description: string,
  ) {
    const existing = await this.prisma.gpsAlert.findFirst({
      where: { vehicleId, type, status: { in: ['NUEVA', 'EN_REVISION'] } },
    });
    if (existing) return existing;

    const created = await this.prisma.gpsAlert.create({
      data: { organizationId, vehicleId, type, description },
    });
    this.logger.warn(`Alerta GPS creada -- unidad ${vehicleId}, tipo ${type}`);

    if (URGENT_ALERT_TYPES.includes(type)) {
      await this.notifySuperAdminIfNoPro(organizationId, vehicleId, type, description);
    }

    return created;
  }

  /**
   * Si la alerta es grave y la asociación NO tiene Plan PRO, el
   * Administrador de esa asociación nunca la ve en su panel (revertido a
   * proposito, 12 sept 2026) -- Super Admin toma ese lugar por correo. Si la
   * asociación SÍ tiene PRO, no hace nada aquí -- el Administrador ya la ve
   * por su propio panel, como siempre.
   */
  private async notifySuperAdminIfNoPro(organizationId: string, vehicleId: string, type: string, description: string) {
    try {
      const [org, vehicle] = await Promise.all([
        this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, plan: true } }),
        this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { code: true } }),
      ]);
      if (!org || org.plan === 'PRO' || !vehicle) return;

      await this.mail.sendSuperAdminSafetyAlertEmail({
        orgName: org.name,
        vehicleCode: vehicle.code,
        alertTypeLabel: ALERT_TYPE_LABEL[type] ?? type,
        description,
        detectedAt: new Date(),
      });
    } catch (err) {
      this.logger.error(
        `Error notificando a Super Admin la alerta ${type} de la unidad ${vehicleId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
