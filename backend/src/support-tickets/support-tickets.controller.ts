import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { ClassifySupportTicketDto } from './dto/classify-support-ticket.dto';
import { AssignSupportTicketDto } from './dto/assign-support-ticket.dto';
import { EscalateSupportTicketDto } from './dto/escalate-support-ticket.dto';
import { ResolveSupportTicketDto } from './dto/resolve-support-ticket.dto';
import { CloseSupportTicketDto } from './dto/close-support-ticket.dto';
import { UpdateStatusSupportTicketDto } from './dto/update-status-support-ticket.dto';
import { LinkProblemSupportTicketDto } from './dto/link-problem-support-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';
import type { SupportTicketPriority, SupportTicketStatus } from '@prisma/client';

// Mesa de servicio ITIL 4 (OE4 tesis, 2 oct 2026). Solo el Administrador de la asociacion reporta
// -- Socio/Conductor no tienen esta pantalla todavia. Clasificar/asignar/escalar/resolver/cerrar/
// vincular a un problema es exclusivo de Super Admin (N1 de la mesa de servicio).
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

  // El Administrador ve los de su asociacion (con filtros propios); Super Admin ve la cola
  // completa cruzando todas las asociaciones, con filtro adicional por asociacion.
  @Get()
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('organizationId') organizationId?: string,
    @Query('priority') priority?: SupportTicketPriority,
    @Query('status') status?: SupportTicketStatus,
    @Query('supportLevel') supportLevel?: 'N1' | 'N2' | 'N3',
  ) {
    if (user.role === 'SUPERADMIN' && !organizationId) {
      return this.tickets.findAllAcrossOrgs({ priority, status, supportLevel });
    }
    const orgId = resolveOrgId(user, organizationId);
    if (user.role === 'SUPERADMIN') {
      return this.tickets.findAllAcrossOrgs({ organizationId: orgId, priority, status, supportLevel });
    }
    return this.tickets.findForOrganization(orgId, { priority, status, supportLevel });
  }

  @Get('metrics')
  @Roles('SUPERADMIN')
  getMetrics(@Query('month') month: string) {
    return this.tickets.getMetrics(month);
  }

  @Get(':id')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const orgId = user.role === 'SUPERADMIN' ? undefined : resolveOrgId(user, organizationId);
    return this.tickets.findOne(id, orgId);
  }

  @Patch(':id/classify')
  @Roles('SUPERADMIN')
  classify(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ClassifySupportTicketDto) {
    return this.tickets.classify(id, user, dto);
  }

  @Patch(':id/assign')
  @Roles('SUPERADMIN')
  assign(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AssignSupportTicketDto) {
    return this.tickets.assign(id, user, dto);
  }

  @Patch(':id/escalate')
  @Roles('SUPERADMIN')
  escalate(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: EscalateSupportTicketDto) {
    return this.tickets.escalate(id, user, dto);
  }

  @Patch(':id/resolve')
  @Roles('SUPERADMIN')
  resolve(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ResolveSupportTicketDto) {
    return this.tickets.resolve(id, user, dto);
  }

  @Patch(':id/close')
  @Roles('SUPERADMIN')
  close(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: CloseSupportTicketDto) {
    return this.tickets.close(id, user, dto);
  }

  @Patch(':id/status')
  @Roles('SUPERADMIN')
  updateStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateStatusSupportTicketDto) {
    return this.tickets.updateStatus(id, user, dto);
  }

  @Patch(':id/link-problem')
  @Roles('SUPERADMIN')
  linkProblem(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: LinkProblemSupportTicketDto) {
    return this.tickets.linkProblem(id, user, dto);
  }
}
