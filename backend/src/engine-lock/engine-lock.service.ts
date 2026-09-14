import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GpsService, type LiveVehiclePosition } from '../gps/gps.service';
import { NoticesService } from '../notices/notices.service';
import { JwtPayload } from '../auth/jwt.strategy';

// Bloqueo remoto de motor (12 sept 2026, decidido con Jayde) -- ver el
// comentario largo en schema.prisma (enum EngineLockStatus) para el flujo
// completo. Reglas duras de este archivo:
//  - Solo el Socio dueño de la unidad puede SOLICITAR.
//  - Solo Super Admin puede CONFIRMAR, CANCELAR o RESTAURAR -- nunca el
//    Administrador de la asociacion (decision explicita de Jayde).
//  - Si al confirmar la unidad ya esta detenida, se ejecuta al toque.
//  - Si esta en movimiento, este mismo servicio la vigila cada 30s y solo
//    ejecuta tras una detencion SOSTENIDA (no un instante) -- nunca corta el
//    motor con el vehiculo en marcha.
const STOP_SPEED_THRESHOLD_KMH = 3;
const REQUIRED_STOP_SECONDS = 30;

@Injectable()
export class EngineLockService {
  private readonly logger = new Logger(EngineLockService.name);

  constructor(
    private prisma: PrismaService,
    private gps: GpsService,
    private notices: NoticesService,
  ) {}

  /**
   * Resumen cross-organizacion, SOLO Super Admin (12 sept 2026): cuantas
   * solicitudes SOLICITADO hay por asociacion, para que se vea en la lista
   * de "Asociaciones" sin tener que entrar una por una a revisar. Mismo
   * criterio que organizations.service.findAll() (Super Admin ve todas sin
   * resolveOrgId) -- es un resumen agregado, no datos operativos de una sola
   * asociacion.
   */
  async pendingSummary() {
    const grouped = await this.prisma.engineLockRequest.groupBy({
      by: ['organizationId'],
      where: { status: 'SOLICITADO' },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ organizationId: g.organizationId, pendingCount: g._count._all }));
  }

  async findAll(organizationId: string, actor: JwtPayload) {
    const isSocio = actor.role === 'SOCIO';
    return this.prisma.engineLockRequest.findMany({
      where: {
        organizationId,
        ...(isSocio ? { vehicle: { partnerId: actor.sub } } : {}),
      },
      include: { vehicle: { select: { code: true, plate: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Solo el socio dueño de la unidad puede solicitar -- una sola solicitud activa (SOLICITADO/CONFIRMADO) por unidad a la vez. */
  async create(organizationId: string, actor: JwtPayload, vehicleId: string, reason: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId } });
    if (!vehicle) throw new NotFoundException('Unidad no encontrada');
    if (vehicle.partnerId !== actor.sub) {
      throw new ForbiddenException('Solo el socio dueño de esta unidad puede solicitar su bloqueo.');
    }
    if (!vehicle.traccarDeviceId) {
      throw new BadRequestException('Esta unidad no tiene un dispositivo GPS real vinculado.');
    }
    const existing = await this.prisma.engineLockRequest.findFirst({
      where: { vehicleId, status: { in: ['SOLICITADO', 'CONFIRMADO'] } },
    });
    if (existing) {
      throw new BadRequestException('Ya hay una solicitud de bloqueo activa para esta unidad.');
    }

    const request = await this.prisma.engineLockRequest.create({
      data: { organizationId, vehicleId, requestedById: actor.sub, requestReason: reason },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'SOLICITAR_BLOQUEO_MOTOR',
        resource: `Unidad ${vehicle.code}`,
        resourceId: vehicleId,
        before: 'Sin solicitud',
        after: 'Solicitud creada',
        reason,
      },
    });
    return request;
  }

  /**
   * Bloqueo directo por Super Admin (12 sept 2026, acordado con Jayde): el
   * socio llama por telefono desesperado, sin pasar por la solicitud digital
   * previa -- pero el motivo sigue siendo obligatorio siempre, sin excepcion.
   * Se registra igual como una solicitud real (requestedById siempre queda
   * en el socio dueño, nunca en el Super Admin -- asi las notificaciones le
   * llegan a el) y de inmediato se confirma/ejecuta con el mismo flujo que
   * confirm() (detenida -> ejecuta al toque; en movimiento -> el cron de
   * checkPendingLocks() la vigila). La auditoria queda con actorId = Super
   * Admin en ambos pasos, lo que por si solo distingue este camino del
   * flujo normal (ahi actorId siempre es el socio que solicito).
   */
  async createDirect(organizationId: string, actor: JwtPayload, vehicleId: string, reason: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId } });
    if (!vehicle) throw new NotFoundException('Unidad no encontrada');
    if (!vehicle.partnerId) {
      throw new BadRequestException('Esta unidad no tiene un socio asignado, no se puede registrar el bloqueo.');
    }
    if (!vehicle.traccarDeviceId) {
      throw new BadRequestException('Esta unidad no tiene un dispositivo GPS real vinculado.');
    }
    const existing = await this.prisma.engineLockRequest.findFirst({
      where: { vehicleId, status: { in: ['SOLICITADO', 'CONFIRMADO'] } },
    });
    if (existing) {
      throw new BadRequestException('Ya hay una solicitud de bloqueo activa para esta unidad.');
    }

    const request = await this.prisma.engineLockRequest.create({
      data: { organizationId, vehicleId, requestedById: vehicle.partnerId, requestReason: reason },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'SOLICITAR_BLOQUEO_MOTOR',
        resource: `Unidad ${vehicle.code}`,
        resourceId: vehicleId,
        before: 'Sin solicitud',
        after: 'Solicitud registrada por Super Admin a pedido telefónico del socio',
        reason,
      },
    });
    return this.confirm(organizationId, actor, request.id);
  }

  /** Solo Super Admin. Si la unidad ya esta detenida, ejecuta al toque; si no, queda CONFIRMADO y el cron la vigila. */
  async confirm(organizationId: string, actor: JwtPayload, requestId: string) {
    const request = await this.getActive(organizationId, requestId, 'SOLICITADO');
    const updated = await this.prisma.engineLockRequest.update({
      where: { id: requestId },
      data: { status: 'CONFIRMADO', confirmedById: actor.sub, confirmedAt: new Date() },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'CONFIRMAR_BLOQUEO_MOTOR',
        resource: `Unidad ${request.vehicle.code}`,
        resourceId: request.vehicleId,
        before: 'Solicitado',
        after: 'Confirmado',
      },
    });

    const positions = await this.gps.getLivePositions(organizationId).catch(() => [] as LiveVehiclePosition[]);
    const pos = positions.find((p) => p.vehicleId === request.vehicleId);
    if (pos && pos.speedKmh <= STOP_SPEED_THRESHOLD_KMH) {
      return this.executeLock(organizationId, requestId);
    }

    await this.notices.createSystemNotice(
      organizationId,
      request.requestedById,
      'Bloqueo de motor confirmado',
      `Tu solicitud de bloqueo para la unidad ${request.vehicle.code} fue confirmada. Como la unidad sigue en movimiento, se ejecutará apenas se detenga por completo.`,
    );
    return updated;
  }

  async cancel(organizationId: string, actor: JwtPayload, requestId: string, reason: string) {
    const request = await this.prisma.engineLockRequest.findFirst({
      where: { id: requestId, organizationId, status: { in: ['SOLICITADO', 'CONFIRMADO'] } },
      include: { vehicle: { select: { code: true } } },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada o ya no se puede cancelar');

    const updated = await this.prisma.engineLockRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELADO', cancelledById: actor.sub, cancelledAt: new Date(), cancelReason: reason },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'CANCELAR_BLOQUEO_MOTOR',
        resource: `Unidad ${request.vehicle.code}`,
        resourceId: request.vehicleId,
        before: request.status,
        after: 'Cancelado',
        reason,
      },
    });
    await this.notices.createSystemNotice(
      organizationId,
      request.requestedById,
      'Bloqueo de motor cancelado',
      `Tu solicitud de bloqueo para la unidad ${request.vehicle.code} fue cancelada. Motivo: ${reason}`,
    );
    return updated;
  }

  /** Solo Super Admin, solo si ya esta EJECUTADO. Envia 'engineResume' real por Traccar. */
  async restore(organizationId: string, actor: JwtPayload, requestId: string, reason: string) {
    const request = await this.getActive(organizationId, requestId, 'EJECUTADO');
    await this.gps.sendEngineCommand(organizationId, request.vehicleId, 'resume');

    const [updated] = await this.prisma.$transaction([
      this.prisma.engineLockRequest.update({
        where: { id: requestId },
        data: { status: 'RESTAURADO', restoredById: actor.sub, restoredAt: new Date(), restoreReason: reason },
      }),
      this.prisma.vehicle.update({ where: { id: request.vehicleId }, data: { engineLocked: false } }),
    ]);
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'RESTAURAR_MOTOR',
        resource: `Unidad ${request.vehicle.code}`,
        resourceId: request.vehicleId,
        before: 'Bloqueado',
        after: 'Restaurado',
        reason,
      },
    });
    await this.notices.createSystemNotice(
      organizationId,
      request.requestedById,
      'Motor restaurado',
      `Se restauró el motor de tu unidad ${request.vehicle.code}. Motivo: ${reason}`,
    );
    return updated;
  }

  private async getActive(organizationId: string, requestId: string, expectedStatus: 'SOLICITADO' | 'EJECUTADO') {
    const request = await this.prisma.engineLockRequest.findFirst({
      where: { id: requestId, organizationId, status: expectedStatus },
      include: { vehicle: { select: { code: true } } },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada en el estado esperado');
    return request;
  }

  private async executeLock(organizationId: string, requestId: string) {
    const request = await this.prisma.engineLockRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { vehicle: { select: { code: true } } },
    });
    await this.gps.sendEngineCommand(organizationId, request.vehicleId, 'stop');

    const [updated] = await this.prisma.$transaction([
      this.prisma.engineLockRequest.update({
        where: { id: requestId },
        data: { status: 'EJECUTADO', executedAt: new Date(), stopCandidateSince: null },
      }),
      this.prisma.vehicle.update({ where: { id: request.vehicleId }, data: { engineLocked: true } }),
    ]);
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: request.confirmedById ?? request.requestedById,
        actorRole: 'SUPERADMIN',
        action: 'EJECUTAR_BLOQUEO_MOTOR',
        resource: `Unidad ${request.vehicle.code}`,
        resourceId: request.vehicleId,
        before: 'Confirmado',
        after: 'Ejecutado',
      },
    });
    this.logger.warn(`Bloqueo de motor ejecutado -- unidad ${request.vehicleId}`);
    await this.notices.createSystemNotice(
      organizationId,
      request.requestedById,
      'Motor bloqueado',
      `Se ejecutó el bloqueo de motor de tu unidad ${request.vehicle.code}. Cuando recuperes el vehículo, solicita la restauración a CHASKI AI.`,
    );
    return updated;
  }

  /**
   * Cada 30s: revisa las solicitudes CONFIRMADO cuyo vehiculo seguia en
   * movimiento. Exige velocidad <= STOP_SPEED_THRESHOLD_KMH sostenida por
   * REQUIRED_STOP_SECONDS antes de ejecutar -- nunca corta ante una sola
   * lectura (evita confundir un semaforo con una detencion real).
   */
  @Cron('*/30 * * * * *')
  async checkPendingLocks() {
    const pending = await this.prisma.engineLockRequest.findMany({
      where: { status: 'CONFIRMADO' },
      select: { id: true, organizationId: true, vehicleId: true, stopCandidateSince: true },
    });
    if (pending.length === 0) return;

    const byOrg = new Map<string, typeof pending>();
    for (const req of pending) {
      const list = byOrg.get(req.organizationId) ?? [];
      list.push(req);
      byOrg.set(req.organizationId, list);
    }

    for (const [organizationId, requests] of byOrg) {
      try {
        const positions = await this.gps.getLivePositions(organizationId);
        const positionByVehicleId = new Map(positions.map((p) => [p.vehicleId, p]));

        for (const req of requests) {
          const pos = positionByVehicleId.get(req.vehicleId);
          const isStopped = Boolean(pos && pos.speedKmh <= STOP_SPEED_THRESHOLD_KMH);

          if (!isStopped) {
            if (req.stopCandidateSince) {
              await this.prisma.engineLockRequest.update({ where: { id: req.id }, data: { stopCandidateSince: null } });
            }
            continue;
          }

          if (!req.stopCandidateSince) {
            await this.prisma.engineLockRequest.update({ where: { id: req.id }, data: { stopCandidateSince: new Date() } });
            continue;
          }

          const stoppedSeconds = (Date.now() - req.stopCandidateSince.getTime()) / 1000;
          if (stoppedSeconds >= REQUIRED_STOP_SECONDS) {
            await this.executeLock(organizationId, req.id);
          }
        }
      } catch (err) {
        this.logger.error(
          `Error revisando bloqueos de motor pendientes de la asociacion ${organizationId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
