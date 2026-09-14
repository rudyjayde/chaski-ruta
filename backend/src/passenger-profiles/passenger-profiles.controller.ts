import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PassengerProfilesService } from './passenger-profiles.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

// CRM de pasajeros (12 sept 2026, decidido con Jayde): solo Super Admin --
// vive "separado por asociacion" como pidio Jayde, nunca mezclado entre
// asociaciones (el mismo DNI en dos asociaciones distintas es dos perfiles).
@Controller('passenger-profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PassengerProfilesController {
  constructor(private passengerProfiles: PassengerProfilesService) {}

  @Get()
  @Roles('SUPERADMIN')
  findAll(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.passengerProfiles.findAll(orgId);
  }

  @Get('dashboard')
  @Roles('SUPERADMIN')
  getDashboard(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.passengerProfiles.getDashboard(orgId);
  }
}
