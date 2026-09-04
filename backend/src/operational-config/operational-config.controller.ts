import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { OperationalConfigService } from './operational-config.service';
import { UpdateOperationalConfigDto } from './dto/update-operational-config.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

// Parametros antifraude (plan-operacion.md §3.10): el gerente de la asociacion
// los puede VER (para entender por que el sistema se comporta asi), pero solo
// Super Admin los puede CAMBIAR — nunca fijos en el codigo (doc maestro §4).
@Controller('operational-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OperationalConfigController {
  constructor(private config: OperationalConfigService) {}

  @Get()
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  get(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.config.getOrCreate(orgId);
  }

  @Post()
  @Roles('SUPERADMIN')
  update(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateOperationalConfigDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.config.update(orgId, dto);
  }
}
