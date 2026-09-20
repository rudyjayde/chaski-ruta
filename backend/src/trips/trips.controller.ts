import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TripsService } from './trips.service';
import { AlertTripDto } from './dto/alert-trip.dto';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { ResolveIncidentDto } from './dto/resolve-incident.dto';
import { CancelTripDto } from './dto/cancel-trip.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

@Controller('trips')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TripsController {
  constructor(private trips: TripsService) {}

  @Get()
  findMany(
    @CurrentUser() user: JwtPayload,
    @Query('organizationId') organizationId?: string,
    @Query('route') route?: string,
    @Query('status') status?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.trips.findMany(orgId, user, route, status);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.trips.findOne(orgId, user, id);
  }

  @Post(':id/complete')
  @Roles('CONDUCTOR', 'ADMINISTRADOR', 'SUPERADMIN')
  complete(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CompleteTripDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.trips.complete(orgId, user, id, dto);
  }

  @Post(':id/alert')
  @Roles('CONDUCTOR', 'ADMINISTRADOR', 'SUPERADMIN')
  alert(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AlertTripDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.trips.alert(orgId, user, id, dto);
  }

  @Post(':id/cancel')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CancelTripDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.trips.cancel(orgId, user, id, dto);
  }

  @Post(':id/resolve-incident')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  resolveIncident(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ResolveIncidentDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.trips.resolveIncident(orgId, user, id, dto);
  }
}
