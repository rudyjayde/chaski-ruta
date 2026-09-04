import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ManifestsService } from './manifests.service';
import { OpenManifestDto } from './dto/open-manifest.dto';
import { AddPassengerDto } from './dto/add-passenger.dto';
import { CloseManifestDto } from './dto/close-manifest.dto';
import { CorrectManifestDto } from './dto/correct-manifest.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

@Controller('manifests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManifestsController {
  constructor(private manifests: ManifestsService) {}

  @Get()
  findMany(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.manifests.findMany(orgId, user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.manifests.findOne(orgId, user, id);
  }

  @Post()
  @Roles('CONDUCTOR', 'ADMINISTRADOR', 'SUPERADMIN')
  open(@CurrentUser() user: JwtPayload, @Body() dto: OpenManifestDto, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.manifests.open(orgId, user, dto);
  }

  @Post(':id/passengers')
  @Roles('CONDUCTOR', 'ADMINISTRADOR', 'SUPERADMIN')
  addPassenger(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AddPassengerDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.manifests.addPassenger(orgId, user, id, dto);
  }

  @Post(':id/close')
  @Roles('CONDUCTOR', 'ADMINISTRADOR', 'SUPERADMIN')
  close(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CloseManifestDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.manifests.close(orgId, user, id, dto);
  }

  @Post(':id/digitize')
  @Roles('CONDUCTOR', 'ADMINISTRADOR', 'SUPERADMIN')
  digitize(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { passengers: AddPassengerDto[] },
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.manifests.digitize(orgId, user, id, body.passengers);
  }

  @Post(':id/correct')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  correct(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CorrectManifestDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.manifests.correct(orgId, user, id, dto);
  }
}
