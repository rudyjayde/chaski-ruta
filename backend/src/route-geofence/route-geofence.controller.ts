import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { RouteGeofenceService, type GeofencePoint } from './route-geofence.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { assertProPlan, resolveOrgId } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';

// Corredor autorizado (12 sept 2026, decidido con Jayde): cualquier rol de
// la asociacion puede LEER (para mostrarlo en el mapa), pero solo
// Administrador/Super Admin lo dibuja/guarda -- es config operativa de la
// asociacion completa, igual que OperationalConfig. Dibujar/guardar el
// corredor es una funcion del Plan PRO (13 sept 2026, auditoria de planes) --
// GET se deja abierto (leer un polígono vacío no expone nada de valor).
@Controller('route-geofence')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RouteGeofenceController {
  constructor(
    private routeGeofence: RouteGeofenceService,
    private prisma: PrismaService,
  ) {}

  @Get()
  get(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.routeGeofence.get(orgId);
  }

  @Put()
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  async save(
    @CurrentUser() user: JwtPayload,
    @Body('points') points: GeofencePoint[],
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    assertProPlan(user, org.plan);
    return this.routeGeofence.save(orgId, user, points);
  }
}
