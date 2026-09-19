import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { VEHICLE_TYPE_BY_MODEL } from './vehicle-catalog';
import { ChangeDriverDto } from './dto/change-driver.dto';
import { ChangePartnerDto } from './dto/change-partner.dto';
import { DeactivateVehicleDto } from './dto/deactivate-vehicle.dto';
import { RetireVehiclesDto } from './dto/retire-vehicles.dto';
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
    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId }, select: { organizationId: true, status: true } });
    if (!company || company.organizationId !== organizationId || company.status === 'ELIMINADA') {
      throw new BadRequestException('La empresa elegida no existe en esta asociación.');
    }

    // Si el codigo o la placa pertenecen a una unidad dada de baja, no es un
    // duplicado a rechazar sino una unidad que vuelve: se ofrece restaurarla.
    const sameCode = await this.prisma.vehicle.findFirst({ where: { organizationId, code }, select: { id: true, status: true } });
    if (sameCode?.status === 'BAJA') this.throwRetiredMatch(sameCode.id, `La unidad ${code} fue dada de baja antes.`);
    if (sameCode) throw new ConflictException(`La unidad ${code} ya está registrada en esta asociación.`);
    const samePlate = await this.prisma.vehicle.findFirst({
      where: { organizationId, plate: dto.plate },
      select: { id: true, code: true, status: true },
    });
    if (samePlate?.status === 'BAJA') {
      this.throwRetiredMatch(samePlate.id, `La placa ${dto.plate} pertenece a la unidad ${samePlate.code}, que fue dada de baja.`);
    }
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

  private throwRetiredMatch(vehicleId: string, message: string): never {
    throw new ConflictException({ message, code: 'UNIDAD_DE_BAJA', vehicleId });
  }

  /**
   * Da de baja la unidad: deja de operar y desaparece de las listas, pero nada
   * se borra (viajes, manifiestos y auditoria siguen ligados a ella). Motivo
   * obligatorio. No se puede si tiene un viaje en curso o esta en una cola.
   */
  async retire(organizationId: string, actor: JwtPayload, vehicleId: string, dto: DeactivateVehicleDto) {
    const vehicle = await this.findOne(organizationId, vehicleId);
    if (vehicle.status === 'BAJA') throw new BadRequestException('Esta unidad ya está dada de baja.');

    const [activeTrip, activeQueue] = await Promise.all([
      this.prisma.trip.findFirst({ where: { vehicleId, status: { in: ['PROGRAMADO', 'ACTIVO'] } }, select: { id: true } }),
      this.prisma.queueEntry.findFirst({
        where: { vehicleId, status: { notIn: ['SALIO', 'AUSENTE', 'RETIRADO'] } },
        select: { id: true },
      }),
    ]);
    if (activeTrip) {
      throw new ConflictException(`La unidad ${vehicle.code} tiene un viaje en curso. Termínalo o cancélalo antes de darla de baja.`);
    }
    if (activeQueue) {
      throw new ConflictException(`La unidad ${vehicle.code} está en una cola. Sácala de la cola antes de darla de baja.`);
    }

    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: 'BAJA', currentDriverId: null },
      include: { company: true, partner: { select: PERSON_SAFE_SELECT }, currentDriver: { select: PERSON_SAFE_SELECT }, plateHistory: true },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'BAJA_UNIDAD',
        resource: `Unidad ${vehicle.code}`,
        resourceId: vehicleId,
        before: `${vehicle.status}${vehicle.currentDriver ? ` · conductor ${vehicle.currentDriver.name}` : ''}`,
        after: 'BAJA',
        reason: dto.reason,
      },
    });
    return updated;
  }

  /**
   * Da de baja varias unidades con un solo motivo. Cada una lleva sus mismas
   * reglas y su propia entrada de auditoria; las que no se pueden (viaje en
   * curso, en cola) se devuelven con la razon, sin frenar a las demas.
   */
  async retireMany(organizationId: string, actor: JwtPayload, dto: RetireVehiclesDto) {
    const retired: string[] = [];
    const failed: { code: string; message: string }[] = [];
    for (const id of new Set(dto.ids)) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id }, select: { code: true, organizationId: true } });
      if (!vehicle || vehicle.organizationId !== organizationId) {
        failed.push({ code: id, message: 'Unidad no encontrada' });
        continue;
      }
      try {
        await this.retire(organizationId, actor, id, { reason: dto.reason });
        retired.push(vehicle.code);
      } catch (err) {
        failed.push({ code: vehicle.code, message: err instanceof Error ? err.message : 'No se pudo dar de baja' });
      }
    }
    return { retired, failed };
  }

  /** Restaura una unidad dada de baja (vuelve activa, sin conductor asignado). */
  async restore(organizationId: string, actor: JwtPayload, vehicleId: string) {
    const vehicle = await this.findOne(organizationId, vehicleId);
    if (vehicle.status !== 'BAJA') throw new BadRequestException('Esta unidad no está dada de baja.');
    if (vehicle.company.status === 'ELIMINADA') {
      throw new ConflictException(`La empresa ${vehicle.company.name} está eliminada. Restáurala primero.`);
    }
    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: 'ACTIVO' },
      include: { company: true, partner: { select: PERSON_SAFE_SELECT }, currentDriver: { select: PERSON_SAFE_SELECT }, plateHistory: true },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'RESTAURAR_UNIDAD',
        resource: `Unidad ${vehicle.code}`,
        resourceId: vehicleId,
        before: 'BAJA',
        after: 'ACTIVO',
      },
    });
    return updated;
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
    if (vehicle.status === 'BAJA') throw new BadRequestException('Esta unidad está dada de baja; restáurala primero.');
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
