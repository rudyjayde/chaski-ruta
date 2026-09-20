import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { DeleteOrganizationDto } from './dto/delete-organization.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { assertOrgAccess, resolveOrgId } from '../common/tenant';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private orgs: OrganizationsService) {}

  // Cualquier persona autenticada ve SOLO su propia asociacion. Excepcion: Super
  // Admin en modo "Entrar como administrador" (ver acting-org.ts en el frontend) --
  // ahi si manda organizationId por query, y resolveOrgId() lo respeta porque ya
  // sabemos por su rol que no pertenece a ninguna asociacion propia.
  @Get('me')
  async myOrganization(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    if (!user.organizationId && !(user.role === 'SUPERADMIN' && organizationId)) {
      return null; // Super Admin fuera del modo "entrar como administrador".
    }
    const orgId = resolveOrgId(user, organizationId);
    const org = await this.orgs.findOne(orgId);
    assertOrgAccess(user, org.id);
    return org;
  }

  // Solo Super Admin ve el listado completo de asociaciones (con todos los campos).
  @Get()
  @Roles('SUPERADMIN')
  findAll() {
    return this.orgs.findAll();
  }

  // Metricas reales de negocio para "Resumen" de Super Admin -- declarado
  // ANTES de cualquier ruta con :id para que Nest nunca confunda "metrics"
  // con un id de asociacion.
  @Get('metrics')
  @Roles('SUPERADMIN')
  metrics() {
    return this.orgs.getMetrics();
  }

  // Cualquier persona autenticada (admin, socio, conductor o super admin) puede ver
  // el directorio publico de asociaciones ACTIVAS — solo nombre y RUC, sin datos
  // operativos. Se usa en la pantalla de bienvenida para mostrar 'otras asociaciones'.
  @Get('directory')
  directory() {
    return this.orgs.directory();
  }

  // Solo Super Admin crea asociaciones nuevas (paso 5 del wizard: activa el alcance).
  @Post()
  @Roles('SUPERADMIN')
  create(@Body() dto: CreateOrganizationDto) {
    return this.orgs.create(dto);
  }

  // Solo Super Admin: alternar mapa en vivo del conductor o activar/suspender la asociacion.
  @Patch(':id')
  @Roles('SUPERADMIN')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.orgs.update(id, user, dto);
  }

  // Solo Super Admin: baja de la asociacion completa (el historial se conserva).
  @Post(':id/delete')
  @Roles('SUPERADMIN')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: DeleteOrganizationDto) {
    return this.orgs.remove(id, user, dto);
  }

  // Checklist real de onboarding de esta asociacion (ver organizations.service.ts).
  @Get(':id/onboarding')
  @Roles('SUPERADMIN')
  onboarding(@Param('id') id: string) {
    return this.orgs.getOnboardingStatus(id);
  }
}
