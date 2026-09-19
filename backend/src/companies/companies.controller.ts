import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { DeleteCompanyDto } from './dto/delete-company.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

// Las empresas miembro de una asociacion son datos de configuracion comercial
// (§13 del doc maestro). Alta/edicion por ahora solo desde Super Admin (mismo
// criterio que routes/operational-config); se abre a ADMINISTRADOR cuando
// exista el panel comercial completo.
@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private companies: CompaniesService) {}

  @Get()
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  findAll(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.companies.findAll(orgId);
  }

  @Post()
  @Roles('SUPERADMIN')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCompanyDto,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.companies.create(resolveOrgId(user, organizationId), user, dto);
  }

  @Patch(':id')
  @Roles('SUPERADMIN')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.companies.update(resolveOrgId(user, organizationId), user, id, dto);
  }

  // Eliminar = la empresa dejo de operar (motivo obligatorio). No borra datos.
  @Post(':id/delete')
  @Roles('SUPERADMIN')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DeleteCompanyDto,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.companies.remove(resolveOrgId(user, organizationId), user, id, dto);
  }

  @Post(':id/restore')
  @Roles('SUPERADMIN')
  restore(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    return this.companies.restore(resolveOrgId(user, organizationId), user, id);
  }
}
