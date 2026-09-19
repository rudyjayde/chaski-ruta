import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { VEHICLE_TYPE_BY_MODEL } from './vehicle-catalog';
import { ChangeDriverDto } from './dto/change-driver.dto';
import { ChangePartnerDto } from './dto/change-partner.dto';
import { DeactivateVehicleDto } from './dto/deactivate-vehicle.dto';
import { SetGpsDeviceDto } from './dto/set-gps-device.dto';
import { SetGpsVehicularPlanDto } from './dto/set-gps-vehicular-plan.dto';
import { SetMaintenanceDto } from './dto/set-maintenance.dto';
import { JwtPayload } from '../auth/jwt.strategy';

// El hash de la contraseña NUNCA debe llegar al navegador (mismo criterio
// que people.service.ts) -- Vehicle incluye partner/currentDriver como
// relacion completa en cada consulta de abajo, asi que se selecciona todo
// MENOS passwordHash en vez de devolver la fila completa de Prisma.
const PERSON_SAFE_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  email: true,
  dni: true,
  phone: true,
  role: true,
  status: true,
  googleId: true,
  googleEmailVerifiedAt: true,
  whatsappPhone: true,
  boundDeviceId: true,
  boundDeviceSetAt: true,
  code: true,
  company: true,
  linkedUnit: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  findAll(organizationId: string, route?: string) {
    return this.prisma.vehicle.findMany({
      where: {
        organizationId,
        ...(route ? { OR: [{ routeAssignment: route as any }, { routeAssignment: 'AMBAS' }] } : {}),
      },
      include: { company: true, partner: { select: PERSON_SAFE_SELECT }, currentDriver: { select: PERSON_SAFE_SELECT }, plateHistory: true },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { company: true, partner: { select: PERSON_SAFE_SELECT }, currentDriver: { select: PERSON_SAFE_SELECT }, plateHistory: true },
    });
    if (!vehicle) throw new NotFoundException('Vehiculo no encontrado');
    if (vehicle.organizationId !== organizationId) {
      throw new ForbiddenException('No tienes acceso a este vehiculo');
    }
    return vehicle;
  }

  async create(organizationId: string, dto: CreateVehicleDto) {
    const code = dto.code.trim();
    if (!code) throw new BadRequestException('El código de unidad no puede estar vacío.');
    if (VEHICLE_TYPE_BY_MODEL[dto.model] !== dto.vehicleType) {
      throw new BadRequestException('El tipo de vehículo no corresponde a la marca y modelo elegidos.');
    }

    // Avisos claros ANTES de escribir -- sin esto el codigo repetido solo
    // fallaba en la base de datos (unique organizationId+code) con un error
    // generico, sin decir que la unidad ya existia.
    const sameCode = await this.prisma.vehicle.findFirst({ where: { organizationId, code }, select: { id: true } });
    if (sameCode) throw new ConflictException(`La unidad ${code} ya está registrada en esta asociación.`);
    const samePlate = await this.prisma.vehicle.findFirst({
      where: { organizationId, plate: dto.plate },
      select: { code: true },
    });
    if (samePlate) throw new ConflictException(`La placa ${dto.plate} ya está registrada en la unidad ${samePlate.code}.`);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.create({
          data: {
            organizationId,
            code,
            companyId: dto.companyId,
            vehicleType: dto.vehicleType,
            plate: dto.plate,
            model: dto.model,
            year: dto.year,
            routeAssignment: dto.routeAssignment ?? 'AMBAS',
            partnerId: dto.partnerId,
            currentDriverId: dto.currentDriverId,
          },
        });
        await tx.vehiclePlateHistory.create({
          data: { vehicleId: vehicle.id, plate: dto.plate, fromDate: new Date() },
        });
        return vehicle;
      });
    } catch (err) {
      // Dos altas simultaneas con el mismo codigo: la segunda pasa el chequeo
      // de arriba pero la base de datos igual la rechaza (P2002).
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
        throw new ConflictException(`La unidad ${code} ya está registrada en esta asociación.`);
      }
      throw err;
    }
  }

  /** Cambia el conductor asignado, con auditoria obligatoria (CAMBIO_CONDUCTOR). */
  async changeDriver(organizationId: string, actor: JwtPayload, vehicleId: string, dto: ChangeDriverDto) {
    const vehicle = await this.findOne(organizationId, vehicleId);
    const driver = await this.prisma.person.findUnique({ where: { id: dto.currentDriverId } });
    if (!driver || driver.organizationId !== organizationId || driver.role !== 'CONDUCTOR') {
      throw new BadRequestException('El conductor indicado no pertenece a esta asociacion');
    }
    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { currentDriverId: dto.currentDriverId },
      include: { company: true, partner: { select: PERSON_SAFE_SELECT }, currentDriver: { select: PERSON_SAFE_SELECT }, plateHistory: true },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'CAMBIO_CONDUCTOR',
        resource: `Unidad ${vehicle.code}`,
        resourceId: vehicleId,
        before: vehicle.currentDriver?.name ?? 'Sin conductor',
        after: driver.name,
        reason: dto.reason,
      },
    });
    return updated;
  }

  /** Cambia el socio (propietario) asignado, con auditoria obligatoria (CAMBIO_SOCIO). */
  async changePartner(organizationId: string, actor: JwtPayload, vehicleId: string, dto: ChangePartnerDto) {
    const vehicle = await this.findOne(organizationId, vehicleId);
    const partner = await this.prisma.person.findUnique({ where: { id: dto.partnerId } });
    if (!partner || partner.organizationId !== organizationId || partner.role !== 'SOCIO') {
      throw new BadRequestException('El socio indicado no pertenece a esta asociacion');
    }
    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { partnerId: dto.partnerId },
      include: { company: true, partner: { select: PERSON_SAFE_SELECT }, currentDriver: { select: PERSON_SAFE_SELECT }, plateHistory: true },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'CAMBIO_SOCIO',
        resource: `Unidad ${vehicle.code}`,
        resourceId: vehicleId,
        before: vehicle.partner?.name ?? 'Sin socio',
        after: partner.name,
        reason: dto.reason,
      },
    });
    return updated;
  }

  /** Desactiva la unidad (el codigo permanece en el historial), con auditoria y motivo obligatorio. */
  async deactivate(organizationId: string, actor: JwtPayload, vehicleId: string, dto: DeactivateVehicleDto) {
    const vehicle = await this.findOne(organizationId, vehicleId);
    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: 'INACTIVO' },
      include: { company: true, partner: { select: PERSON_SAFE_SELECT }, currentDriver: { select: PERSON_SAFE_SELECT }, plateHistory: true },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'DESACTIVAR_UNIDAD',
        resource: `Unidad ${vehicle.code}`,
        resourceId: vehicleId,
        before: vehicle.status,
        after: 'INACTIVO',
        reason: dto.reason,
      },
    });
    return updated;
  }

  /**
   * Vincula (o desvincula) el dispositivo Traccar real de esta unidad
   * (GPS PRO / GPS Vehicular). El "id" es el uniqueId de Traccar (normalmente
   * el IMEI del Teltonika), no el id interno de Traccar.
   */
  async setGpsDevice(organizationId: string, actor: JwtPayload, vehicleId: string, dto: SetGpsDeviceDto) {
    const vehicle = await this.findOne(organizationId, vehicleId);
    const newValue = dto.traccarDeviceId?.trim() || null;
    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        traccarDeviceId: newValue,
        ...(dto.simOperator !== undefined ? { simOperator: dto.simOperator || null } : {}),
        ...(dto.simNumber !== undefined ? { simNumber: dto.simNumber?.trim() || null } : {}),
      },
      include: { company: true, partner: { select: PERSON_SAFE_SELECT }, currentDriver: { select: PERSON_SAFE_SELECT }, plateHistory: true },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'CONFIGURAR_GPS_TRACCAR',
        resource: `Unidad ${vehicle.code}`,
        resourceId: vehicleId,
        before: vehicle.traccarDeviceId ?? 'Sin dispositivo',
        after: newValue ?? 'Sin dispositivo',
      },
    });
    return updated;
  }

  /**
   * Prende/apaga el Plan GPS Vehicular individual de la unidad (13 sept
   * 2026, decidido con Jayde). Nunca toca traccarDeviceId -- eso es el
   * hardware instalado, esto es si el servicio individual esta pagado. En
   * false, gps.controller.ts deja de mostrarle esta unidad a su Socio y
   * Conductor (ver myVehicleIds).
   */
  async setGpsVehicularPlan(organizationId: string, actor: JwtPayload, vehicleId: string, dto: SetGpsVehicularPlanDto) {
    const vehicle = await this.findOne(organizationId, vehicleId);
    if (!vehicle.traccarDeviceId) {
      throw new BadRequestException('Esta unidad todavia no tiene un equipo GPS vinculado -- no hay plan que activar.');
    }
    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        gpsVehicularActivo: dto.activo,
        gpsVehicularVenceEn: dto.venceEn !== undefined ? (dto.venceEn ? new Date(dto.venceEn) : null) : vehicle.gpsVehicularVenceEn,
      },
      include: { company: true, partner: { select: PERSON_SAFE_SELECT }, currentDriver: { select: PERSON_SAFE_SELECT }, plateHistory: true },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: dto.activo ? 'ACTIVAR_PLAN_GPS_VEHICULAR' : 'DESACTIVAR_PLAN_GPS_VEHICULAR',
        resource: `Unidad ${vehicle.code}`,
        resourceId: vehicleId,
        before: vehicle.gpsVehicularActivo ? 'Activo' : 'Inactivo',
        after: dto.activo ? 'Activo' : 'Inactivo',
        reason: dto.reason,
      },
    });
    return updated;
  }

  /**
   * Configura el seguimiento de mantenimiento predictivo de la unidad
   * (plan-pro.md §11.1). El intervalo lo define el administrador, nunca el
   * sistema -- solo se compara el kilometraje real (Traccar) contra estos
   * dos valores para avisar cuando toca servicio.
   */
  async setMaintenance(organizationId: string, actor: JwtPayload, vehicleId: string, dto: SetMaintenanceDto) {
    const vehicle = await this.findOne(organizationId, vehicleId);
    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        lastServiceKm: dto.lastServiceKm ?? null,
        serviceIntervalKm: dto.serviceIntervalKm ?? null,
        lastServiceAt: dto.lastServiceKm !== undefined ? new Date() : vehicle.lastServiceAt,
      },
      include: { company: true, partner: { select: PERSON_SAFE_SELECT }, currentDriver: { select: PERSON_SAFE_SELECT }, plateHistory: true },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'CONFIGURAR_MANTENIMIENTO',
        resource: `Unidad ${vehicle.code}`,
        resourceId: vehicleId,
        before: `Último servicio: ${vehicle.lastServiceKm ?? '—'} km · Intervalo: ${vehicle.serviceIntervalKm ?? '—'} km`,
        after: `Último servicio: ${dto.lastServiceKm ?? '—'} km · Intervalo: ${dto.serviceIntervalKm ?? '—'} km`,
      },
    });
    return updated;
  }
}
