import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { ChangeDriverDto } from './dto/change-driver.dto';
import { ChangePartnerDto } from './dto/change-partner.dto';
import { DeactivateVehicleDto } from './dto/deactivate-vehicle.dto';
import { RetireVehiclesDto } from './dto/retire-vehicles.dto';
import { SetGpsDeviceDto } from './dto/set-gps-device.dto';
import { SetGpsVehicularPlanDto } from './dto/set-gps-vehicular-plan.dto';
import { SetMaintenanceDto } from './dto/set-maintenance.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehiclesController {
  constructor(private vehicles: VehiclesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string, @Query('route') route?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.vehicles.findAll(orgId, route);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.vehicles.findOne(orgId, id);
  }

  // Alta de unidades: solo administrador de la asociacion o Super Admin.
  @Post()
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateVehicleDto, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.vehicles.create(orgId, dto);
  }

  // Cambiar conductor asignado: siempre con auditoria (CAMBIO_CONDUCTOR).
  @Post(':id/change-driver')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  changeDriver(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ChangeDriverDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.vehicles.changeDriver(orgId, user, id, dto);
  }

  // Cambiar socio (propietario) asignado: siempre con auditoria (CAMBIO_SOCIO).
  @Post(':id/change-partner')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  changePartner(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ChangePartnerDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.vehicles.changePartner(orgId, user, id, dto);
  }

  // Desactivar unidad: motivo obligatorio, queda en el historial (nunca se borra).
  @Post(':id/deactivate')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  deactivate(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DeactivateVehicleDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.vehicles.deactivate(orgId, user, id, dto);
  }

  // Dar de baja varias unidades a la vez (mismo motivo para todas).
  @Post('retire-bulk')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  retireMany(@CurrentUser() user: JwtPayload, @Body() dto: RetireVehiclesDto, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.vehicles.retireMany(orgId, user, dto);
  }

  // Dar de baja: la unidad ya no opera (motivo obligatorio); se puede restaurar.
  @Post(':id/retire')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  retire(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DeactivateVehicleDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.vehicles.retire(orgId, user, id, dto);
  }

  @Post(':id/restore')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  restore(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.vehicles.restore(orgId, user, id);
  }

  // Vincula/desvincula el dispositivo GPS real (Traccar) de la unidad -- GPS PRO.
  // Solo Super Admin: el IMEI se define durante la instalacion fisica del hardware
  // (equipo tecnico de CHASKI AI), nunca por el admin de la asociacion -- evita que
  // alguien sin saberlo desvincule o pegue mal el identificador y se caiga el rastreo.
  @Post(':id/gps-device')
  @Roles('SUPERADMIN')
  setGpsDevice(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetGpsDeviceDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.vehicles.setGpsDevice(orgId, user, id, dto);
  }

  // Prende/apaga el Plan GPS Vehicular individual (por falta de pago, etc.):
  // solo Super Admin, motivo obligatorio -- misma logica que gps-device.
  @Post(':id/gps-vehicular-plan')
  @Roles('SUPERADMIN')
  setGpsVehicularPlan(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetGpsVehicularPlanDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.vehicles.setGpsVehicularPlan(orgId, user, id, dto);
  }

  // Mantenimiento predictivo (plan-pro.md §11.1): administrador o Super Admin
  // registran el ultimo servicio y el intervalo -- el socio solo lo lee
  // (GET /vehicles ya incluye estos campos).
  @Post(':id/maintenance')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  setMaintenance(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetMaintenanceDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.vehicles.setMaintenance(orgId, user, id, dto);
  }
}
