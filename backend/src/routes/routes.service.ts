import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { JwtPayload } from '../auth/jwt.strategy';

// Rutas ADICIONALES de la asociacion (mas alla de ida/vuelta, que ya viven en
// OperationalConfig via los terminales). El wizard "Nueva asociacion" siempre
// tuvo un boton "+ Agregar ruta" pero nunca se guardaba nada real -- ver
// comentario en el modelo Route del schema.
@Injectable()
export class RoutesService {
  constructor(private prisma: PrismaService) {}

  findAll(organizationId: string) {
    return this.prisma.route.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async findOwned(organizationId: string, id: string) {
    const route = await this.prisma.route.findUnique({ where: { id } });
    if (!route || route.organizationId !== organizationId) {
      throw new NotFoundException('Ruta no encontrada');
    }
    return route;
  }

  async create(organizationId: string, actor: JwtPayload, dto: CreateRouteDto) {
    const route = await this.prisma.route.create({
      data: { organizationId, origin: dto.origin, destination: dto.destination },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'CREACION_RUTA',
        resource: `Ruta ${dto.origin} → ${dto.destination}`,
        resourceId: route.id,
        after: `${dto.origin} → ${dto.destination}`,
      },
    });
    return route;
  }

  async update(organizationId: string, actor: JwtPayload, id: string, dto: UpdateRouteDto) {
    const existing = await this.findOwned(organizationId, id);
    const updated = await this.prisma.route.update({
      where: { id },
      data: { origin: dto.origin, destination: dto.destination },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'EDICION_RUTA',
        resource: `Ruta ${updated.origin} → ${updated.destination}`,
        resourceId: id,
        before: `${existing.origin} → ${existing.destination}`,
        after: `${updated.origin} → ${updated.destination}`,
      },
    });
    return updated;
  }

  async remove(organizationId: string, actor: JwtPayload, id: string) {
    const existing = await this.findOwned(organizationId, id);
    await this.prisma.route.delete({ where: { id } });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'ELIMINACION_RUTA',
        resource: `Ruta ${existing.origin} → ${existing.destination}`,
        resourceId: id,
        before: `${existing.origin} → ${existing.destination}`,
      },
    });
    return { ok: true };
  }
}
