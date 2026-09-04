import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { GpsService } from './gps.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';

// Mapa en vivo de flota (GPS PRO / GPS Vehicular, plan-gps-vehicular.md) --
// funcion del Plan PRO, misma regla dura en backend que el asistente
// (assistant.controller.ts): el super admin puede verlo en cualquier
// asociacion (soporte), un administrador solo si su asociacion esta en PRO.
@Controller('gps')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GpsController {
  constructor(
    private gps: GpsService,
    private prisma: PrismaService,
  ) {}

  @Get('live')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  async live(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (user.role !== 'SUPERADMIN' && org.plan !== 'PRO') {
      throw new ForbiddenException('El mapa GPS en vivo es una funcion del Plan PRO.');
    }
    return this.gps.getLivePositions(orgId);
  }

  // Pantalla "Dispositivos GPS" del admin -- solo lectura (registrar/editar el
  // dispositivo sigue siendo exclusivo de Super Admin, ver vehicles.controller.ts).
  @Get('devices')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  async devices(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (user.role !== 'SUPERADMIN' && org.plan !== 'PRO') {
      throw new ForbiddenException('Dispositivos GPS es una funcion del Plan PRO.');
    }
    return this.gps.getDeviceStatuses(orgId);
  }
}
