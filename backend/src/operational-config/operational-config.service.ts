import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOperationalConfigDto } from './dto/update-operational-config.dto';
import { JwtPayload } from '../auth/jwt.strategy';

@Injectable()
export class OperationalConfigService {
  constructor(private prisma: PrismaService) {}

  // Mismo patron get-or-create que ya usa QueuesService internamente (valores
  // por defecto del schema si la asociacion todavia no los toco).
  async getOrCreate(organizationId: string) {
    const existing = await this.prisma.operationalConfig.findUnique({ where: { organizationId } });
    if (existing) return existing;
    return this.prisma.operationalConfig.create({ data: { organizationId } });
  }

  async update(organizationId: string, dto: UpdateOperationalConfigDto, actor: JwtPayload) {
    const current = await this.getOrCreate(organizationId);
    const updated = await this.prisma.operationalConfig.update({ where: { organizationId }, data: dto });
    // Apaga una validacion antifraude de toda la asociacion: tiene que quedar quien y cuando.
    if (updated.presentationMode !== current.presentationMode) {
      await this.prisma.auditEntry.create({
        data: {
          organizationId,
          actorId: actor.sub,
          actorRole: actor.role,
          action: updated.presentationMode ? 'MODO_PRESENTACION_ACTIVADO' : 'MODO_PRESENTACION_DESACTIVADO',
          resource: 'Configuracion operativa',
          resourceId: updated.id,
          before: current.presentationMode ? 'ENCENDIDO' : 'APAGADO',
          after: updated.presentationMode ? 'ENCENDIDO' : 'APAGADO',
        },
      });
    }
    return updated;
  }
}
