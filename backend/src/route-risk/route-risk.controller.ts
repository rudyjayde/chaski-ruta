import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RouteRiskService } from './route-risk.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;

// Mapa de riesgo de ruta (docs/planes/ia-aplicada.md §3.2) -- depende de
// hardware Traccar real (unidades con traccarDeviceId), asi que naturalmente
// no devuelve nada si la asociacion no tiene ninguna unidad equipada. Ya no
// exige Plan PRO (correccion 11 sept 2026, mismo bug que gps.controller.ts):
// una asociacion en Operacion con unidades con GPS Vehicular individual
// tambien genera datos reales validos para este mapa.
@Controller('route-risk')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RouteRiskController {
  constructor(private routeRisk: RouteRiskService) {}

  @Get()
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  async get(
    @CurrentUser() user: JwtPayload,
    @Query('organizationId') organizationId?: string,
    @Query('days') daysRaw?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    const parsed = daysRaw ? parseInt(daysRaw, 10) : DEFAULT_WINDOW_DAYS;
    const days = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_WINDOW_DAYS) : DEFAULT_WINDOW_DAYS;
    return this.routeRisk.getRiskPoints(orgId, days);
  }
}
