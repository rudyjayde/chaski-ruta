import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { ChangeDriverDto } from './dto/change-driver.dto';
import { ChangePartnerDto } from './dto/change-partner.dto';
import { DeactivateVehicleDto } from './dto/deactivate-vehicle.dto';
import { SetGpsDeviceDto } from './dto/set-gps-device.dto';
import { JwtPayload } from '../auth/jwt.strategy';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  findAll(organizationId: string, route?: string) {
    return this.prisma.vehicle.findMany({
      where: {
        organizationId,
        ...(route ? { OR: [{ routeAssignment: route as any }, { routeAssignment: 'AMBAS' }] } : {}),
      },
      include: { company: true, partner: true, currentDriver: true, plateHistory: true },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { company: true, partner: true, currentDriver: true, plateHistory: true },
    });
    if (!vehicle) throw new NotFoundException('Vehiculo no encontrado');
    if (vehicle.organizationId !== organizationId) {
      throw new ForbiddenException('No tienes acceso a este vehiculo');
    }
    return vehicle;
  }

  async create(organizationId: string, dto: CreateVehicleDto) {
    return this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({
        data: {
          organizationId,
          code: dto.code,
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
      include: { company: true, partner: true, currentDriver: true, plateHistory: true },
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
      include: { company: true, partner: true, currentDriver: true, plateHistory: true },
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
      include: { company: true, partner: true, currentDriver: true, plateHistory: true },
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
      data: { traccarDeviceId: newValue },
      include: { company: true, partner: true, currentDriver: true, plateHistory: true },
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
}
