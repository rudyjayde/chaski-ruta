import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { DeleteOrganizationDto } from './dto/delete-organization.dto';
import { JwtPayload } from '../auth/jwt.strategy';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { hasValidRucCheckDigit, RUC_CHECK_MESSAGE } from '../common/validators';

// Aplana operationalConfig.terminalOriginName/terminalDestinationName (y sus
// direcciones completas, si vienen seleccionadas) al nivel raiz de la
// asociacion -- cada asociacion muestra SU PROPIO corredor, nunca el de otra
// (ver comentario en OperationalConfig, schema.prisma). Los defaults
// (Juli/Puno) solo aplican si la asociacion todavia no tiene OperationalConfig.
type Corridor = {
  terminalOriginName: string;
  terminalDestinationName: string;
  terminalOriginAddress?: string | null;
  terminalDestinationAddress?: string | null;
  routeOriginName?: string | null;
  routeDestinationName?: string | null;
  returnOriginName?: string | null;
  returnDestinationName?: string | null;
};
const CORRIDOR_SELECT = { terminalOriginName: true, terminalDestinationName: true, routeOriginName: true, routeDestinationName: true, returnOriginName: true, returnDestinationName: true } as const;
function flattenCorridor<T extends { operationalConfig?: Corridor | null }>(org: T) {
  const { operationalConfig, ...rest } = org;
  return {
    ...rest,
    terminalOriginName: operationalConfig?.terminalOriginName ?? '',
    terminalDestinationName: operationalConfig?.terminalDestinationName ?? '',
    routeOriginName: operationalConfig?.routeOriginName ?? null,
    routeDestinationName: operationalConfig?.routeDestinationName ?? null,
    returnOriginName: operationalConfig?.returnOriginName ?? null,
    returnDestinationName: operationalConfig?.returnDestinationName ?? null,
    ...(operationalConfig && 'terminalOriginAddress' in operationalConfig
      ? { terminalOriginAddress: operationalConfig.terminalOriginAddress, terminalDestinationAddress: operationalConfig.terminalDestinationAddress }
      : {}),
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
      where: { status: { not: 'ELIMINADA' } },
      orderBy: { createdAt: 'desc' },
      include: { operationalConfig: { select: CORRIDOR_SELECT } },
    });
    return orgs.map(flattenCorridor);
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { operationalConfig: { select: CORRIDOR_SELECT } },
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
        operationalConfig: {
          select: { ...CORRIDOR_SELECT, terminalOriginAddress: true, terminalDestinationAddress: true },
        },
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
          // Sin nombre escrito queda vacio (nunca "Juli"/"Puno" de otra asociacion).
          terminalOriginName: dto.terminalOriginName?.trim() ?? '',
          terminalDestinationName: dto.terminalDestinationName?.trim() ?? '',
          ...(dto.terminalOriginAddress ? { terminalOriginAddress: dto.terminalOriginAddress } : {}),
          ...(dto.terminalDestinationAddress ? { terminalDestinationAddress: dto.terminalDestinationAddress } : {}),
          ...(dto.routeOriginName?.trim() ? { routeOriginName: dto.routeOriginName.trim() } : {}),
          ...(dto.routeDestinationName?.trim() ? { routeDestinationName: dto.routeDestinationName.trim() } : {}),
          ...(dto.returnOriginName?.trim() ? { returnOriginName: dto.returnOriginName.trim() } : {}),
          ...(dto.returnDestinationName?.trim() ? { returnDestinationName: dto.returnDestinationName.trim() } : {}),
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
    if (dto.ruc !== undefined && dto.ruc !== org.ruc && !hasValidRucCheckDigit(dto.ruc)) {
      throw new BadRequestException(RUC_CHECK_MESSAGE);
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
   * Eliminar una asociacion completa (20 sept 2026): es una BAJA, no un borrado
   * -- viajes, manifiestos, pasajeros, personas, unidades y auditoria se
   * conservan tal como estaban hasta este dia. La asociacion sale del listado,
   * del portal y de los avisos, y sus cuentas quedan suspendidas para que nadie
   * de ahi pueda volver a entrar. Solo Super Admin, con motivo obligatorio; se
   * rechaza si todavia tiene viajes en curso o unidades en cola.
   */
  async remove(id: string, actor: JwtPayload, dto: DeleteOrganizationDto) {
    const org = await this.prisma.organization.findUnique({ where: { id }, select: { id: true, name: true, ruc: true, status: true } });
    if (!org) throw new NotFoundException('Asociacion no encontrada');
    if (org.status === 'ELIMINADA') throw new ConflictException(`${org.name} ya fue eliminada.`);

    const [openTrips, queued] = await Promise.all([
      this.prisma.trip.count({ where: { organizationId: id, status: { in: ['PROGRAMADO', 'ACTIVO'] } } }),
      this.prisma.queueEntry.count({ where: { organizationId: id } }),
    ]);
    if (openTrips > 0 || queued > 0) {
      throw new ConflictException(
        `${org.name} todavía tiene ${openTrips} viaje(s) en curso y ${queued} unidad(es) en cola. Termínalos o sácalas de la cola antes de eliminarla.`,
      );
    }

    // Para que una asociacion NUEVA pueda usar el mismo RUC, los mismos
    // correos, licencias, WhatsApp o equipos GPS como si la anterior nunca
    // hubiera existido, los datos que la base exige UNICOS EN TODO EL SISTEMA se
    // marcan con "~E<fecha>" al final (el original sigue legible) y el equipo
    // GPS se libera. Todo lo demas (viajes, manifiestos, pasajeros, nombres,
    // unidades) queda intacto. Lo que era unico solo dentro de la asociacion
    // (codigos y placas de unidad, empresas) no choca con la nueva.
    const tag = `~E${Date.now()}`;
    await this.prisma.$transaction(async (tx) => {
      const gpsDevices = await tx.vehicle.findMany({
        where: { organizationId: id, traccarDeviceId: { not: null } },
        select: { code: true, traccarDeviceId: true },
      });
      await tx.organization.update({ where: { id }, data: { status: 'ELIMINADA', ruc: `${org.ruc}${tag}` } });
      await tx.person.updateMany({
        where: { organizationId: id, role: { not: 'SUPERADMIN' }, status: { not: 'SUSPENDIDO' } },
        data: { status: 'SUSPENDIDO' },
      });
      await tx.$executeRaw(Prisma.sql`
        UPDATE "people" SET
          "email" = "email" || ${tag},
          "license" = CASE WHEN "license" IS NULL THEN NULL ELSE "license" || ${tag} END,
          "whatsappPhone" = CASE WHEN "whatsappPhone" IS NULL THEN NULL ELSE "whatsappPhone" || ${tag} END
        WHERE "organizationId" = ${id}`);
      await tx.vehicle.updateMany({ where: { organizationId: id }, data: { traccarDeviceId: null } });
      await tx.auditEntry.create({
        data: {
          organizationId: id,
          actorId: actor.sub,
          actorRole: actor.role,
          action: 'ELIMINAR_ASOCIACION',
          resource: `Asociacion ${org.name}`,
          resourceId: id,
          before: `${org.status} · RUC ${org.ruc}${gpsDevices.length ? ` · equipos GPS liberados: ${gpsDevices.map((v) => `${v.code}=${v.traccarDeviceId}`).join(', ')}` : ''}`,
          after: 'ELIMINADA',
          reason: dto.reason,
        },
      });
    });
    return { ok: true, name: org.name };
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
        this.prisma.organization.count({ where: { status: { not: 'ELIMINADA' } } }),
        this.prisma.organization.count({ where: { status: 'ACTIVA' } }),
        this.prisma.organization.count({ where: { status: 'EN_CONFIGURACION' } }),
        this.prisma.organization.count({ where: { status: 'SUSPENDIDA' } }),
        this.prisma.organization.count({ where: { plan: 'PRO', status: { not: 'ELIMINADA' } } }),
        this.prisma.organization.count({ where: { plan: 'OPERACION', status: { not: 'ELIMINADA' } } }),
        this.prisma.organization.count({ where: { createdAt: { gte: thirtyDaysAgo }, status: { not: 'ELIMINADA' } } }),
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
