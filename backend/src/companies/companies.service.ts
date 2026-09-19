import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { DeleteCompanyDto } from './dto/delete-company.dto';
import { hasValidRucCheckDigit, RUC_CHECK_MESSAGE } from '../common/validators';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtPayload } from '../auth/jwt.strategy';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  // Las empresas eliminadas no aparecen en ningun panel (ni admin ni Super Admin).
  findAll(organizationId: string) {
    return this.prisma.company.findMany({
      where: { organizationId, status: { not: 'ELIMINADA' } },
      orderBy: { name: 'asc' },
    });
  }

  async create(organizationId: string, actor: JwtPayload, dto: CreateCompanyDto) {
    // Una empresa que vuelve no se crea de nuevo: si el RUC o el nombre
    // coinciden con una eliminada, se avisa para que el Super Admin la restaure
    // con su historial.
    const name = dto.name.trim();
    const deleted = await this.prisma.company.findFirst({
      where: {
        organizationId,
        status: 'ELIMINADA',
        OR: [...(dto.ruc ? [{ ruc: dto.ruc }] : []), { name: { equals: name, mode: 'insensitive' as const } }],
      },
      select: { id: true, name: true },
    });
    if (deleted) {
      throw new ConflictException({
        message: `${deleted.name} fue eliminada antes.`,
        code: 'EMPRESA_ELIMINADA',
        companyId: deleted.id,
        companyName: deleted.name,
      });
    }

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

  private async findOwned(organizationId: string, id: string, includeDeleted = false) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company || company.organizationId !== organizationId || (!includeDeleted && company.status === 'ELIMINADA')) {
      throw new NotFoundException('Empresa no encontrada');
    }
    return company;
  }

  /**
   * Elimina la empresa (deja de operar): se oculta de todos los paneles, nada
   * se borra. Solo si todas sus unidades ya estan dadas de baja. Motivo
   * obligatorio.
   */
  async remove(organizationId: string, actor: JwtPayload, id: string, dto: DeleteCompanyDto) {
    const company = await this.findOwned(organizationId, id);
    const vehicles = await this.prisma.vehicle.findMany({
      where: { companyId: id, status: { not: 'BAJA' } },
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    if (vehicles.length > 0) {
      const codes = vehicles.slice(0, 5).map((v) => v.code).join(', ');
      throw new ConflictException(
        `${company.name} todavía tiene ${vehicles.length} unidad(es) sin dar de baja (${codes}${vehicles.length > 5 ? '…' : ''}). Dalas de baja primero.`,
      );
    }
    const updated = await this.prisma.company.update({ where: { id }, data: { status: 'ELIMINADA' } });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'ELIMINAR_EMPRESA',
        resource: `Empresa ${company.name}`,
        resourceId: id,
        before: company.status,
        after: 'ELIMINADA',
        reason: dto.reason,
      },
    });
    return updated;
  }

  /** Restaura una empresa eliminada con todo su historial; vuelve como ACTIVA. */
  async restore(organizationId: string, actor: JwtPayload, id: string) {
    const company = await this.findOwned(organizationId, id, true);
    if (company.status !== 'ELIMINADA') throw new BadRequestException('Esta empresa no está eliminada.');
    const updated = await this.prisma.company.update({ where: { id }, data: { status: 'ACTIVA' } });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'RESTAURAR_EMPRESA',
        resource: `Empresa ${company.name}`,
        resourceId: id,
        before: 'ELIMINADA',
        after: 'ACTIVA',
      },
    });
    return updated;
  }

  async update(organizationId: string, actor: JwtPayload, id: string, dto: UpdateCompanyDto) {
    const existing = await this.findOwned(organizationId, id);
    if (dto.ruc && dto.ruc !== existing.ruc && !hasValidRucCheckDigit(dto.ruc)) {
      throw new BadRequestException(RUC_CHECK_MESSAGE);
    }
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
