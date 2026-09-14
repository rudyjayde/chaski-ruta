import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { RouteGeofenceService, type GeofencePoint } from './route-geofence.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

// Corredor autorizado (12 sept 2026, decidido con Jayde): cualquier rol de
// la asociacion puede LEER (para mostrarlo en el mapa), pero solo
// Administrador/Super Admin lo dibuja/guarda -- es config operativa de la
// asociacion completa, igual que OperationalConfig.
@Controller('route-geofence')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RouteGeofenceController {
  constructor(private routeGeofence: RouteGeofenceService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.routeGeofence.get(orgId);
  }

  @Put()
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  save(
    @CurrentUser() user: JwtPayload,
    @Body('points') points: GeofencePoint[],
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.routeGeofence.save(orgId, user, points);
  }
}
