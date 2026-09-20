import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreateRelocationDto } from './dto/create-relocation.dto';
import { nextSequenceNumber } from '../common/sequence';

// El hash de la contraseña NUNCA debe llegar al navegador (mismo criterio
// que people.service.ts / vehicles.service.ts) -- select explicito en vez
// de "currentDriver: true".
const PERSON_NAME_SELECT = { id: true, name: true } as const;

@Injectable()
export class RelocationsService {
  constructor(private prisma: PrismaService) {}

  findMany(organizationId: string) {
    return this.prisma.relocationOrder.findMany({
      where: { organizationId },
      include: { units: { include: { vehicle: { include: { currentDriver: { select: PERSON_NAME_SELECT } } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const order = await this.prisma.relocationOrder.findUnique({
      where: { id },
      include: { units: { include: { vehicle: { include: { currentDriver: { select: PERSON_NAME_SELECT } } } } } },
    });
    if (!order || order.organizationId !== organizationId) {
      throw new NotFoundException('Orden de reubicacion no encontrada');
    }
    return order;
  }

  async create(organizationId: string, actor: JwtPayload, dto: CreateRelocationDto) {
    // internalOrder es unico en TODO el sistema (no por asociacion): se calcula
    // sobre el maximo global y se reintenta si dos ordenes chocan a la vez.
    let order;
    for (let attempt = 0; ; attempt++) {
      const internalOrder = await nextSequenceNumber(this.prisma, 'relocation_orders', 'internalOrder', `ORD-REL-${new Date().getFullYear()}-`);
      try {
        order = await this.prisma.relocationOrder.create({
          data: {
            organizationId,
            status: 'PROPUESTA',
            fromTerminal: dto.fromTerminal,
            toTerminal: dto.toTerminal,
            reason: dto.reason,
            windowLabel: dto.windowLabel,
            compensation: dto.compensation,
            internalOrder,
            units: { create: dto.vehicleIds.map((vehicleId) => ({ vehicleId })) },
          },
          include: { units: { include: { vehicle: { include: { currentDriver: { select: PERSON_NAME_SELECT } } } } } },
        });
        break;
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002' || attempt >= 4) throw err;
      }
    }

    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'INICIAR_REUBICACION',
        resource: 'Orden de reubicacion',
        resourceId: order.id,
        after: 'PROPUESTA',
        reason: dto.reason,
      },
    });
    return order;
  }

  async authorize(organizationId: string, actor: JwtPayload, id: string) {
    const order = await this.findOne(organizationId, id);
    if (order.status !== 'PROPUESTA') {
      throw new BadRequestException('Solo una orden en PROPUESTA se puede autorizar');
    }
    await this.prisma.relocationOrder.update({
      where: { id },
      data: { status: 'AUTORIZADA', confirmedById: actor.sub },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'AUTORIZAR_REUBICACION',
        resource: 'Orden de reubicacion',
        resourceId: id,
        before: 'PROPUESTA',
        after: 'AUTORIZADA',
        reason: 'Autorizacion del gerente/administrador',
      },
    });
    return this.findOne(organizationId, id);
  }

  /** El socio/conductor de la unidad (o un administrador) acepta participar. */
  async acceptUnit(organizationId: string, actor: JwtPayload, id: string, vehicleId: string) {
    const order = await this.findOne(organizationId, id);
    const unit = order.units.find((u) => u.vehicleId === vehicleId);
    if (!unit) throw new NotFoundException('Esta unidad no forma parte de la orden');

    if (actor.role === 'CONDUCTOR') {
      const vehicle = await this.prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
      if (vehicle.currentDriverId !== actor.sub) {
        throw new ForbiddenException('No eres el conductor de esta unidad');
      }
    }

    await this.prisma.relocationUnit.update({
      where: { id: unit.id },
      data: { accepted: true },
    });
    return this.findOne(organizationId, id);
  }

  async start(organizationId: string, actor: JwtPayload, id: string) {
    const order = await this.findOne(organizationId, id);
    if (order.status !== 'AUTORIZADA') {
      throw new BadRequestException('Solo una orden AUTORIZADA puede iniciar traslado');
    }
    await this.prisma.relocationOrder.update({ where: { id }, data: { status: 'EN_TRASLADO' } });
    return this.findOne(organizationId, id);
  }

  /**
   * Cierra la reubicacion. La compensacion economica (§3.9) se registra como
   * "vacio/sin cobro" en la auditoria de cada unidad aceptada — la compensacion
   * de posicion en cola SIEMPRE queda a criterio manual del gerente despues
   * (si no interviene, el vehiculo vuelve a inscribirse normal al final).
   */
  async complete(organizationId: string, actor: JwtPayload, id: string) {
    const order = await this.findOne(organizationId, id);
    if (order.status !== 'EN_TRASLADO') {
      throw new BadRequestException('Solo una orden EN_TRASLADO se puede completar');
    }

    await this.prisma.relocationOrder.update({ where: { id }, data: { status: 'COMPLETADA' } });

    const accepted = order.units.filter((u) => u.accepted);
    await this.prisma.$transaction(
      accepted.map((u) =>
        this.prisma.auditEntry.create({
          data: {
            organizationId,
            actorId: actor.sub,
            actorRole: actor.role,
            action: 'REUBICACION_COMPENSACION',
            resource: 'Vehiculo',
            resourceId: u.vehicleId,
            after: 'vacio/sin cobro',
            reason: `Orden ${order.internalOrder}: ${order.reason}`,
          },
        }),
      ),
    );

    return this.findOne(organizationId, id);
  }
}
