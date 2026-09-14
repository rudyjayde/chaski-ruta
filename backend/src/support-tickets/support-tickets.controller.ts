import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { RespondSupportTicketDto } from './dto/respond-support-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

// Reemplaza la pantalla "Soporte" de Super Admin, antes un placeholder fijo
// (13 sept 2026, decidido con Jayde). Solo el Administrador de la asociacion
// reporta -- Socio/Conductor no tienen esta pantalla todavia.
@Controller('support-tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupportTicketsController {
  constructor(private tickets: SupportTicketsService) {}

  @Post()
  @Roles('ADMINISTRADOR')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSupportTicketDto, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.tickets.create(orgId, user, dto);
  }

  // El Administrador ve los de su asociacion; Super Admin ve la cola completa
  // cruzando todas las asociaciones.
  @Get()
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  findAll(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    if (user.role === 'SUPERADMIN' && !organizationId) {
      return this.tickets.findAllAcrossOrgs();
    }
    const orgId = resolveOrgId(user, organizationId);
    return this.tickets.findForOrganization(orgId);
  }

  @Patch(':id')
  @Roles('SUPERADMIN')
  respond(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: RespondSupportTicketDto) {
    return this.tickets.respond(id, user, dto);
  }
}
