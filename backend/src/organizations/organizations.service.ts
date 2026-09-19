import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { JwtPayload } from '../auth/jwt.strategy';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';

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
    private auth: AuthService,
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
      orgLogoUrl: dto.logoUrl,
      setPasswordToken: await this.auth.issuePasswordSetupToken(dto.adminEmail),
    });

    return org;
  }

  /** Solo Super Admin: alternar mapa en vivo del conductor o cambiar el estado de la asociacion. */
  async update(id: string, actor: JwtPayload, dto: UpdateOrganizationDto) {
    const org = await this.findOne(id);
    // Sin modulo de Pagos interno, esta auditoria es el UNICO rastro de por
    // que una asociacion paso a PRO (o volvio a Operacion) -- nunca se
    // permite sin motivo, igual que cualquier otra excepcion del sistema.
    if (dto.plan !== undefined && dto.plan !== org.plan && !dto.reason?.trim()) {
      throw new BadRequestException('Indica un motivo para cambiar el plan (ej. referencia del pago acordado).');
    }
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
        ...(dto.gpsVehicularGraceDays !== undefined ? { gpsVehicularGraceDays: dto.gpsVehicularGraceDays } : {}),
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
    if (dto.gpsVehicularGraceDays !== undefined && dto.gpsVehicularGraceDays !== org.gpsVehicularGraceDays) {
      await this.prisma.auditEntry.create({
        data: {
          organizationId: id,
          actorId: actor.sub,
          actorRole: actor.role,
          action: 'CAMBIO_DIAS_GRACIA_GPS_VEHICULAR',
          resource: `Asociacion ${org.name}`,
          resourceId: id,
          before: `${org.gpsVehicularGraceDays} dias`,
          after: `${dto.gpsVehicularGraceDays} dias`,
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
          reason: dto.reason,
        },
      });
      // Al bajar de PRO a Operacion, las unidades que ya tenian hardware
      // instalado conservan su GPS gpsVehicularGraceDays dias mas (gracia
      // acordada con Jayde, editable por Super Admin en el tab "Plan GPS
      // Vehicular") antes de que el Plan GPS Vehicular individual dependa de
      // que el socio lo pague aparte. gpsVehicularVenceEn es solo la fecha
      // de referencia para que Super Admin sepa a quien le toca revisar --
      // nada la desactiva sola, el toggle sigue siendo una accion manual
      // (ver vehicles.service.ts setGpsVehicularPlan). Si en esta misma
      // llamada tambien cambio gpsVehicularGraceDays, usa el valor NUEVO.
      if (dto.plan === 'OPERACION' && org.plan === 'PRO') {
        const graceDays = dto.gpsVehicularGraceDays ?? org.gpsVehicularGraceDays;
        const graceEndsAt = new Date(Date.now() + graceDays * 24 * 3600 * 1000);
        await this.prisma.vehicle.updateMany({
          where: { organizationId: id, traccarDeviceId: { not: null } },
          data: { gpsVehicularActivo: true, gpsVehicularVenceEn: graceEndsAt },
        });
      }
    }
    return updated;
  }

  /**
   * Metricas reales de negocio para Super Admin (13 sept 2026, decidido con
   * Jayde) -- "Resumen" antes solo mostraba salud GPS/alertas; esto agrega
   * cuantas asociaciones hay, en que estado, por que plan, altas recientes
   * y cuantas unidades tienen el Plan GPS Vehicular activo o en gracia.
   * Todo contado en vivo de la base de datos real, ningun numero fijo.
   */
  async getMetrics() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [total, activas, enConfiguracion, suspendidas, pro, operacion, nuevasUltimos30Dias, unidadesConPlanActivo, unidadesEnGracia] =
      await Promise.all([
        this.prisma.organization.count(),
        this.prisma.organization.count({ where: { status: 'ACTIVA' } }),
        this.prisma.organization.count({ where: { status: 'EN_CONFIGURACION' } }),
        this.prisma.organization.count({ where: { status: 'SUSPENDIDA' } }),
        this.prisma.organization.count({ where: { plan: 'PRO' } }),
        this.prisma.organization.count({ where: { plan: 'OPERACION' } }),
        this.prisma.organization.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
        this.prisma.vehicle.count({ where: { traccarDeviceId: { not: null }, gpsVehicularActivo: true } }),
        this.prisma.vehicle.count({ where: { gpsVehicularVenceEn: { gt: new Date() } } }),
      ]);
    return {
      totalOrganizaciones: total,
      activas,
      enConfiguracion,
      suspendidas,
      pro,
      operacion,
      nuevasUltimos30Dias,
      unidadesConPlanGpsVehicularActivo: unidadesConPlanActivo,
      unidadesEnGraciaGpsVehicular: unidadesEnGracia,
    };
  }

  /**
   * Checklist real de onboarding por asociacion (13 sept 2026) -- cada
   * senal viene de datos que ya existen, ninguna casilla se marca a mano.
   * corredorConfigurado exige direccion real en AMBOS terminales (no el
   * nombre: "Juli"/"Puno" son el default del schema, asi que el nombre solo
   * nunca distingue "ya lo configuraron" de "nadie lo toco todavia").
   */
  async getOnboardingStatus(id: string) {
    await this.findOne(id);
    const [adminActivo, corredor, empresas, vehiculos, unidadesConGps] = await Promise.all([
      this.prisma.person.count({ where: { organizationId: id, role: 'ADMINISTRADOR', status: 'ACTIVO' } }),
      this.prisma.operationalConfig.findUnique({
        where: { organizationId: id },
        select: { terminalOriginAddress: true, terminalDestinationAddress: true },
      }),
      this.prisma.company.count({ where: { organizationId: id } }),
      this.prisma.vehicle.count({ where: { organizationId: id } }),
      this.prisma.vehicle.count({ where: { organizationId: id, traccarDeviceId: { not: null } } }),
    ]);
    return {
      adminActivo: adminActivo > 0,
      corredorConfigurado: Boolean(corredor?.terminalOriginAddress && corredor?.terminalDestinationAddress),
      empresasRegistradas: empresas,
      vehiculosRegistrados: vehiculos,
      unidadesConGps,
    };
  }
}
