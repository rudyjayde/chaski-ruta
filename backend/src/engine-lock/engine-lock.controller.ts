import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { EngineLockService } from './engine-lock.service';
import { CreateEngineLockRequestDto } from './dto/create-engine-lock-request.dto';
import { ReasonDto } from './dto/reason.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

// Bloqueo remoto de motor -- decision explicita de Jayde (12 sept 2026):
// Socio SOLICITA su propia unidad, Super Admin CONFIRMA/CANCELA/RESTAURA.
// El Administrador de la asociacion NUNCA tiene acceso a esto.
@Controller('engine-lock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EngineLockController {
  constructor(private engineLock: EngineLockService) {}

  @Get()
  @Roles('SUPERADMIN', 'SOCIO')
  findAll(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.engineLock.findAll(orgId, user);
  }

  // Cross-organizacion, solo para el badge de la lista de Asociaciones.
  @Get('pending-summary')
  @Roles('SUPERADMIN')
  pendingSummary() {
    return this.engineLock.pendingSummary();
  }

  @Post('vehicles/:vehicleId')
  @Roles('SOCIO')
  create(
    @CurrentUser() user: JwtPayload,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: CreateEngineLockRequestDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.engineLock.create(orgId, user, vehicleId, dto.reason);
  }

  // Bloqueo directo por Super Admin (llamada telefonica del socio, sin
  // solicitud digital previa) -- el motivo sigue siendo obligatorio.
  @Post('vehicles/:vehicleId/direct')
  @Roles('SUPERADMIN')
  createDirect(
    @CurrentUser() user: JwtPayload,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: CreateEngineLockRequestDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.engineLock.createDirect(orgId, user, vehicleId, dto.reason);
  }

  @Post(':id/confirm')
  @Roles('SUPERADMIN')
  confirm(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.engineLock.confirm(orgId, user, id);
  }

  @Post(':id/cancel')
  @Roles('SUPERADMIN')
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.engineLock.cancel(orgId, user, id, dto.reason);
  }

  @Post(':id/restore')
  @Roles('SUPERADMIN')
  restore(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.engineLock.restore(orgId, user, id, dto.reason);
  }
}
