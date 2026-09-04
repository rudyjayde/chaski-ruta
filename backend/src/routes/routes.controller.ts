import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

// Mismo criterio de permisos que operational-config: el administrador de la
// asociacion puede VER sus rutas, pero solo Super Admin las CREA/EDITA/ELIMINA
// (por ahora -- se abre a ADMINISTRADOR cuando exista el panel comercial
// completo, igual que companies).
@Controller('routes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoutesController {
  constructor(private routes: RoutesService) {}

  @Get()
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  findAll(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    return this.routes.findAll(resolveOrgId(user, organizationId));
  }

  @Post()
  @Roles('SUPERADMIN')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRouteDto,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.routes.create(resolveOrgId(user, organizationId), user, dto);
  }

  @Patch(':id')
  @Roles('SUPERADMIN')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.routes.update(resolveOrgId(user, organizationId), user, id, dto);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.routes.remove(resolveOrgId(user, organizationId), user, id);
  }
}
