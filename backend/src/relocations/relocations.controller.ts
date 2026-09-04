import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RelocationsService } from './relocations.service';
import { CreateRelocationDto } from './dto/create-relocation.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

@Controller('relocations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RelocationsController {
  constructor(private relocations: RelocationsService) {}

  @Get()
  findMany(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.relocations.findMany(orgId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.relocations.findOne(orgId, id);
  }

  @Post()
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRelocationDto, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.relocations.create(orgId, user, dto);
  }

  @Post(':id/authorize')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  authorize(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.relocations.authorize(orgId, user, id);
  }

  @Post(':id/units/:vehicleId/accept')
  @Roles('CONDUCTOR', 'SOCIO', 'ADMINISTRADOR', 'SUPERADMIN')
  acceptUnit(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.relocations.acceptUnit(orgId, user, id, vehicleId);
  }

  @Post(':id/start')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  start(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.relocations.start(orgId, user, id);
  }

  @Post(':id/complete')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  complete(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.relocations.complete(orgId, user, id);
  }
}
