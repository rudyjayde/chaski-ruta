import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FleetReportsService } from './fleet-reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { assertProPlan, resolveOrgId } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;

// Reportes gerenciales (plan-pro.md §11.3, §11.4) -- solo administrador y
// Super Admin, como el resto de herramientas de gestion de flota. Nunca
// ejecutan nada por su cuenta: son evidencia real para que el gerente decida.
// Son una funcion del Plan PRO (usan telemetria real de Traccar) -- 13 sept
// 2026, auditoria de planes: antes solo el frontend ocultaba el menu si no
// era PRO, un administrador podia llamar el endpoint directo igual.
@Controller('fleet-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FleetReportsController {
  constructor(
    private fleetReports: FleetReportsService,
    private prisma: PrismaService,
  ) {}

  private parseDays(daysRaw?: string) {
    const parsed = daysRaw ? parseInt(daysRaw, 10) : DEFAULT_WINDOW_DAYS;
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_WINDOW_DAYS) : DEFAULT_WINDOW_DAYS;
  }

  private async assertPro(user: JwtPayload, orgId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    assertProPlan(user, org.plan);
  }

  @Get('hourly-queue')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  async getHourlyQueuePattern(
    @CurrentUser() user: JwtPayload,
    @Query('organizationId') organizationId?: string,
    @Query('days') daysRaw?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    await this.assertPro(user, orgId);
    return this.fleetReports.getHourlyQueuePattern(orgId, this.parseDays(daysRaw));
  }

  @Get('turnaround')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  async getTurnaroundEfficiency(
    @CurrentUser() user: JwtPayload,
    @Query('organizationId') organizationId?: string,
    @Query('days') daysRaw?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    await this.assertPro(user, orgId);
    return this.fleetReports.getTurnaroundEfficiency(orgId, this.parseDays(daysRaw));
  }

  // 11.2 (PENDIENTE DE DECISIÓN): solo conteo crudo de eventos, nunca un
  // puntaje ni un ranking de "buen/mal conductor" -- ver comentario en el
  // servicio.
  @Get('driving-events')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  async getDrivingEventCounts(
    @CurrentUser() user: JwtPayload,
    @Query('organizationId') organizationId?: string,
    @Query('days') daysRaw?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    await this.assertPro(user, orgId);
    return this.fleetReports.getDrivingEventCounts(orgId, this.parseDays(daysRaw));
  }
}
