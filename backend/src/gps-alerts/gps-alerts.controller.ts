import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GpsAlertsService } from './gps-alerts.service';
import { UpdateGpsAlertDto } from './dto/update-gps-alert.dto';
import { ReportGpsAlertDto } from './dto/report-gps-alert.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

// Pantalla "Alertas GPS" -- solo lectura + revision manual. La deteccion
// automatica vive en gps-alerts.service.ts (cron); este controller nunca
// crea una alerta, solo lista y cambia su estado de revision.
//
// Correccion (11 sept 2026): ya no exige Plan PRO para leer -- el cron ya
// genera alertas para CUALQUIER unidad con dispositivo real vinculado, sea
// PRO o GPS Vehicular individual (ver gps-alerts.service.ts checkFleet()),
// asi que bloquear la lectura por plan solo escondia alertas reales de
// asociaciones en Operacion con unidades equipadas -- mismo bug que en
// gps.controller.ts. Socio/Conductor solo ven alertas de su propia unidad.
@Controller('gps-alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GpsAlertsController {
  constructor(
    private prisma: PrismaService,
    private gpsAlerts: GpsAlertsService,
  ) {}

  // "Reportar falla GPS" / "Reportar emergencia" del conductor/socio (12
  // sept 2026) -- antes eran botones decorativos, ahora crean una GpsAlert
  // real sobre SU PROPIA unidad (currentDriverId o partnerId).
  @Post('report')
  @Roles('CONDUCTOR', 'SOCIO')
  report(@CurrentUser() user: JwtPayload, @Body() dto: ReportGpsAlertDto, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.gpsAlerts.reportManual(orgId, user, dto);
  }

  // Resumen de Super Admin (12 sept 2026): alertas graves abiertas en
  // asociaciones sin Plan PRO -- el mismo criterio que decide a quien le
  // llega el correo (ver gps-alerts.service.ts notifySuperAdminIfNoPro()).
  @Get('superadmin-urgent')
  @Roles('SUPERADMIN')
  findUrgentForSuperAdmin() {
    return this.gpsAlerts.findUrgentForSuperAdmin();
  }

  @Get()
  @Roles('ADMINISTRADOR', 'SUPERADMIN', 'SOCIO', 'CONDUCTOR')
  async findAll(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    const isSelfService = user.role === 'SOCIO' || user.role === 'CONDUCTOR';
    let vehicleIdIn: string[] | undefined;
    if (isSelfService) {
      const vehicles = await this.prisma.vehicle.findMany({
        where: { organizationId: orgId, OR: [{ partnerId: user.sub }, { currentDriverId: user.sub }] },
        select: { id: true },
      });
      vehicleIdIn = vehicles.map((v) => v.id);
    }

    return this.prisma.gpsAlert.findMany({
      where: { organizationId: orgId, ...(vehicleIdIn ? { vehicleId: { in: vehicleIdIn } } : {}) },
      // El hash de la contraseña NUNCA debe llegar al navegador (mismo
      // criterio que people.service.ts / vehicles.service.ts) -- select
      // explicito en vez de "currentDriver: true".
      include: { vehicle: { include: { currentDriver: { select: { id: true, name: true } } } } },
      orderBy: { detectedAt: 'desc' },
      take: 500,
    });
  }

  // Revision manual del administrador -- nunca resuelve nada por su cuenta,
  // solo registra que un humano ya lo vio (ia-aplicada.md §1). Solo
  // administrador/super admin revisan -- socio/conductor solo leen (arriba).
  @Patch(':id')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateGpsAlertDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    const alert = await this.prisma.gpsAlert.findFirst({ where: { id, organizationId: orgId } });
    if (!alert) throw new ForbiddenException('Alerta no encontrada para esta asociación.');

    const updated = await this.prisma.gpsAlert.update({
      where: { id },
      data: {
        status: dto.status,
        reviewedAt: new Date(),
        reviewedBy: user.email,
        reviewNote: dto.note,
      },
    });

    await this.prisma.auditEntry.create({
      data: {
        organizationId: orgId,
        actorId: user.sub,
        actorRole: user.role,
        action: 'REVISAR_ALERTA_GPS',
        resource: 'GpsAlert',
        resourceId: id,
        before: alert.status,
        after: dto.status,
        reason: dto.note,
      },
    });

    return updated;
  }
}
