import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOperationalConfigDto } from './dto/update-operational-config.dto';

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

  async update(organizationId: string, dto: UpdateOperationalConfigDto) {
    await this.getOrCreate(organizationId);
    return this.prisma.operationalConfig.update({ where: { organizationId }, data: dto });
  }
}
