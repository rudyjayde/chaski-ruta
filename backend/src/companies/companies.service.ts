import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtPayload } from '../auth/jwt.strategy';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  findAll(organizationId: string) {
    return this.prisma.company.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async create(organizationId: string, actor: JwtPayload, dto: CreateCompanyDto) {
    let company;
    try {
      company = await this.prisma.company.create({
        data: {
          organizationId,
          name: dto.name,
          ruc: dto.ruc,
          legalRep: dto.legalRep,
          phone: dto.phone,
          email: dto.email,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Ya existe otra empresa registrada con el RUC ${dto.ruc}.`);
      }
      throw err;
    }
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'REGISTRAR_EMPRESA',
        resource: `Empresa ${company.name}`,
        resourceId: company.id,
        after: company.name,
      },
    });
    return company;
  }

  private async findOwned(organizationId: string, id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company || company.organizationId !== organizationId) {
      throw new NotFoundException('Empresa no encontrada');
    }
    return company;
  }

  async update(organizationId: string, actor: JwtPayload, id: string, dto: UpdateCompanyDto) {
    const existing = await this.findOwned(organizationId, id);
    let updated;
    try {
      updated = await this.prisma.company.update({
        where: { id },
        data: {
          name: dto.name,
          ruc: dto.ruc,
          legalRep: dto.legalRep,
          phone: dto.phone,
          email: dto.email,
          status: dto.status,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Ya existe otra empresa registrada con el RUC ${dto.ruc}.`);
      }
      throw err;
    }
    if (dto.status && dto.status !== existing.status) {
      await this.prisma.auditEntry.create({
        data: {
          organizationId,
          actorId: actor.sub,
          actorRole: actor.role,
          action: 'CAMBIO_ESTADO_EMPRESA',
          resource: `Empresa ${updated.name}`,
          resourceId: id,
          before: existing.status,
          after: updated.status,
        },
      });
    }
    return updated;
  }
}
