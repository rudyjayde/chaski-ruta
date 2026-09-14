import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PeopleService } from './people.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonStatusDto } from './dto/update-person-status.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

// Solo Administrador (de su propia asociacion) o Super Admin pueden ver o dar
// de alta cuentas — es el flujo de invitacion (nunca auto-registro, ver
// AuthService.loginWithGoogle).
@Controller('people')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRADOR', 'SUPERADMIN')
export class PeopleController {
  constructor(private people: PeopleService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.people.findAll(orgId);
  }

  // Autoservicio: cualquier rol puede leer SU PROPIO registro (dni, telefono,
  // licencia, etc.) -- a diferencia de findAll() de arriba, que sigue siendo
  // solo Administrador/Super Admin porque expone el directorio completo de la
  // asociacion. Sin esto, Socio/Conductor no tenian forma de leer su propio
  // perfil sin pasar por el endpoint restringido (bug real: PartnerApp.tsx /
  // DriverApp.tsx llamaban a fetchPeople() dentro de un Promise.all que
  // fallaba entero con 403, dejando "Mis unidades" vacio). Debe declararse
  // ANTES de @Get(':id') para que "me" no se interprete como un id.
  @Get('me')
  @Roles('ADMINISTRADOR', 'SUPERADMIN', 'SOCIO', 'CONDUCTOR')
  findMe(@CurrentUser() user: JwtPayload) {
    return this.people.findOne(user.organizationId!, user.sub);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.people.findOne(orgId, id);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePersonDto, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.people.create(orgId, user, dto);
  }

  // Activar/suspender una cuenta ya existente, con auditoria.
  @Post(':id/status')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePersonStatusDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.people.updateStatus(orgId, user, id, dto);
  }

  // Excepcion 2 (plan-operacion.md §3.2): liberar la vinculacion cuenta-
  // dispositivo de un conductor/socio -- equipo perdido, robado o cambiado.
  @Post(':id/reset-device')
  resetDevice(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: { reason?: string },
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.people.resetDevice(orgId, user, id, dto?.reason);
  }
}
