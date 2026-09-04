import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { JwtPayload } from '../auth/jwt.strategy';
import { MailService } from '../mail/mail.service';

// Aplana operationalConfig.terminalOriginName/terminalDestinationName al nivel
// raiz de la asociacion -- cada asociacion muestra SU PROPIO corredor, nunca el
// de otra (ver comentario en OperationalConfig, schema.prisma). Los defaults
// (Juli/Puno) solo aplican si la asociacion todavia no tiene OperationalConfig.
function flattenCorridor<T extends { operationalConfig?: { terminalOriginName: string; terminalDestinationName: string } | null }>(
  org: T,
) {
  const { operationalConfig, ...rest } = org;
  return {
    ...rest,
    terminalOriginName: operationalConfig?.terminalOriginName ?? 'Juli',
    terminalDestinationName: operationalConfig?.terminalDestinationName ?? 'Puno',
  };
}

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async findAll() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: { operationalConfig: { select: { terminalOriginName: true, terminalDestinationName: true } } },
    });
    return orgs.map(flattenCorridor);
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { operationalConfig: { select: { terminalOriginName: true, terminalDestinationName: true } } },
    });
    if (!org) throw new NotFoundException('Asociacion no encontrada');
    return flattenCorridor(org);
  }

  /**
   * Directorio publico (para cualquier cuenta autenticada, no solo Super Admin):
   * solo datos de vitrina de asociaciones ACTIVAS — nombre y RUC, nada operativo.
   * Se usa en la pantalla de bienvenida post-login para mostrar 'otras
   * asociaciones' sin exponer ninguna informacion interna ni permitir acceso.
   */
  async directory() {
    const orgs = await this.prisma.organization.findMany({
      where: { status: 'ACTIVA' },
      select: {
        id: true,
        name: true,
        ruc: true,
        logoUrl: true,
        operationalConfig: { select: { terminalOriginName: true, terminalDestinationName: true } },
      },
      orderBy: { name: 'asc' },
    });
    return orgs.map(flattenCorridor);
  }

  /**
   * Crea la asociacion Y a su gerente/administrador como Person en estado PENDIENTE
   * en una sola transaccion — es el disparador del correo de invitacion
   * (ver docs/planes/arquitectura-tecnica.md §2): el envio real de ese correo se
   * conecta aqui una vez que el servicio de correo transaccional este configurado.
   */
  async create(dto: CreateOrganizationDto) {
    const org = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.name,
          ruc: dto.ruc,
          plan: dto.plan ?? 'OPERACION',
          driverLiveMapEnabled: dto.driverLiveMapEnabled ?? false,
          ...(dto.logoUrl ? { logoUrl: dto.logoUrl } : {}),
          ...(dto.city ? { city: dto.city } : {}),
          ...(dto.legalRepName ? { legalRepName: dto.legalRepName } : {}),
          ...(dto.contactPhone ? { contactPhone: dto.contactPhone } : {}),
          ...(dto.contactEmail ? { contactEmail: dto.contactEmail } : {}),
        },
      });

      await tx.person.create({
        data: {
          organizationId: org.id,
          name: dto.adminName,
          email: dto.adminEmail.toLowerCase(),
          role: 'ADMINISTRADOR',
          status: 'PENDIENTE',
        },
      });

      // Corredor propio de ESTA asociacion desde el dia 1 (paso 2 del wizard) --
      // nunca comparte fila con el de otra asociacion. Si el wizard no mando
      // nombres todavia, se crea con los defaults del schema (Juli/Puno) y se
      // corrige despues desde el panel de configuracion operativa.
      await tx.operationalConfig.create({
        data: {
          organizationId: org.id,
          ...(dto.terminalOriginName ? { terminalOriginName: dto.terminalOriginName } : {}),
          ...(dto.terminalOriginAddress ? { terminalOriginAddress: dto.terminalOriginAddress } : {}),
          ...(dto.terminalDestinationName ? { terminalDestinationName: dto.terminalDestinationName } : {}),
          ...(dto.terminalDestinationAddress ? { terminalDestinationAddress: dto.terminalDestinationAddress } : {}),
        },
      });

      return org;
    });

    // Correo de bienvenida al gerente inicial, de parte de CHASKI AI (la
    // asociacion recien se esta creando, todavia no tiene "voz propia").
    // Fuera de la transaccion a proposito: un correo que falla nunca debe
    // revertir la creacion de la asociacion.
    await this.mail.sendWelcomeEmail({
      to: dto.adminEmail,
      name: dto.adminName,
      role: 'ADMINISTRADOR',
      orgName: dto.name,
      fromChaski: true,
    });

    return org;
  }

  /** Solo Super Admin: alternar mapa en vivo del conductor o cambiar el estado de la asociacion. */
  async update(id: string, actor: JwtPayload, dto: UpdateOrganizationDto) {
    const org = await this.findOne(id);
    let updated;
    try {
      updated = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.ruc !== undefined ? { ruc: dto.ruc } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.legalRepName !== undefined ? { legalRepName: dto.legalRepName } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
        ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail } : {}),
        ...(dto.driverLiveMapEnabled !== undefined ? { driverLiveMapEnabled: dto.driverLiveMapEnabled } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.plan !== undefined ? { plan: dto.plan } : {}),
      },
      });
    } catch (err) {
      // Prisma P2002 = violacion de restriccion unica (ruc @unique).
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Ya existe otra asociación registrada con el RUC ${dto.ruc}.`);
      }
      throw err;
    }
    if (dto.ruc !== undefined && dto.ruc !== org.ruc) {
      await this.prisma.auditEntry.create({
        data: {
          organizationId: id,
          actorId: actor.sub,
          actorRole: actor.role,
          action: 'CAMBIO_RUC_ASOCIACION',
          resource: `Asociacion ${org.name}`,
          resourceId: id,
          before: org.ruc,
          after: dto.ruc,
        },
      });
    }
    const contactChanged =
      (dto.city !== undefined && dto.city !== org.city) ||
      (dto.legalRepName !== undefined && dto.legalRepName !== org.legalRepName) ||
      (dto.contactPhone !== undefined && dto.contactPhone !== org.contactPhone) ||
      (dto.contactEmail !== undefined && dto.contactEmail !== org.contactEmail);
    if (contactChanged) {
      await this.prisma.auditEntry.create({
        data: {
          organizationId: id,
          actorId: actor.sub,
          actorRole: actor.role,
          action: 'CAMBIO_DATOS_CONTACTO_ASOCIACION',
          resource: `Asociacion ${org.name}`,
          resourceId: id,
          before: `Ciudad: ${org.city ?? '—'} · Repr. legal: ${org.legalRepName ?? '—'} · Tel: ${org.contactPhone ?? '—'} · Correo: ${org.contactEmail ?? '—'}`,
          after: `Ciudad: ${dto.city ?? org.city ?? '—'} · Repr. legal: ${dto.legalRepName ?? org.legalRepName ?? '—'} · Tel: ${dto.contactPhone ?? org.contactPhone ?? '—'} · Correo: ${dto.contactEmail ?? org.contactEmail ?? '—'}`,
        },
      });
    }
    if (dto.name !== undefined && dto.name !== org.name) {
      await this.prisma.auditEntry.create({
        data: {
          organizationId: id,
          actorId: actor.sub,
          actorRole: actor.role,
          action: 'CAMBIO_NOMBRE_ASOCIACION',
          resource: `Asociacion ${org.name}`,
          resourceId: id,
          before: org.name,
          after: dto.name,
        },
      });
    }
    if (dto.status !== undefined && dto.status !== org.status) {
      await this.prisma.auditEntry.create({
        data: {
          organizationId: id,
          actorId: actor.sub,
          actorRole: actor.role,
          action: 'CAMBIO_ESTADO_ASOCIACION',
          resource: `Asociacion ${org.name}`,
          resourceId: id,
          before: org.status,
          after: dto.status,
        },
      });
    }
    if (dto.driverLiveMapEnabled !== undefined && dto.driverLiveMapEnabled !== org.driverLiveMapEnabled) {
      await this.prisma.auditEntry.create({
        data: {
          organizationId: id,
          actorId: actor.sub,
          actorRole: actor.role,
          action: 'CAMBIO_MAPA_VIVO_ASOCIACION',
          resource: `Asociacion ${org.name}`,
          resourceId: id,
          before: org.driverLiveMapEnabled ? 'Habilitado' : 'Deshabilitado',
          after: dto.driverLiveMapEnabled ? 'Habilitado' : 'Deshabilitado',
        },
      });
    }
    if (dto.plan !== undefined && dto.plan !== org.plan) {
      await this.prisma.auditEntry.create({
        data: {
          organizationId: id,
          actorId: actor.sub,
          actorRole: actor.role,
          action: 'CAMBIO_PLAN_ASOCIACION',
          resource: `Asociacion ${org.name}`,
          resourceId: id,
          before: org.plan,
          after: dto.plan,
        },
      });
    }
    return updated;
  }
}
