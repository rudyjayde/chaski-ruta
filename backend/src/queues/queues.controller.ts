import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { JoinQueueDto } from './dto/join-queue.dto';
import { ConfirmArrivalDto } from './dto/confirm-arrival.dto';
import { AdvanceQueueDto } from './dto/advance-queue.dto';
import { OverrideQueueDto } from './dto/override-queue.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

type RouteDir = 'JULI_PUNO' | 'PUNO_JULI';

function parseRoute(route: string): RouteDir {
  if (route !== 'JULI_PUNO' && route !== 'PUNO_JULI') {
    throw new BadRequestException('Ruta invalida — usa JULI_PUNO o PUNO_JULI');
  }
  return route;
}

@Controller('queues')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QueuesController {
  constructor(private queues: QueuesService) {}

  @Get(':route')
  list(@CurrentUser() user: JwtPayload, @Param('route') route: string, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.queues.list(orgId, parseRoute(route), user);
  }

  // El propio conductor (o un administrador en su nombre) inscribe la unidad.
  @Post(':route/join')
  @Roles('CONDUCTOR', 'ADMINISTRADOR', 'SUPERADMIN')
  join(
    @CurrentUser() user: JwtPayload,
    @Param('route') route: string,
    @Body() dto: JoinQueueDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.queues.join(orgId, user, parseRoute(route), dto);
  }

  @Post('entries/:entryId/confirm-arrival')
  @Roles('CONDUCTOR', 'ADMINISTRADOR', 'SUPERADMIN')
  confirmArrival(
    @CurrentUser() user: JwtPayload,
    @Param('entryId') entryId: string,
    @Body() dto: ConfirmArrivalDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.queues.confirmArrival(orgId, user, entryId, dto);
  }

  // Solo el gerente/administrador llama y mueve la fila hacia adelante.
  @Post('entries/:entryId/advance')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  advance(
    @CurrentUser() user: JwtPayload,
    @Param('entryId') entryId: string,
    @Body() dto: AdvanceQueueDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.queues.advance(orgId, user, entryId, dto);
  }

  // Via 2 del escape de 3 vias: el propio conductor declara "me inscribo mas tarde".
  @Post('entries/:entryId/declare-later')
  @Roles('CONDUCTOR', 'ADMINISTRADOR', 'SUPERADMIN')
  declareLater(
    @CurrentUser() user: JwtPayload,
    @Param('entryId') entryId: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.queues.declareLater(orgId, user, entryId);
  }

  // Via 3 del escape de 3 vias: intervencion manual del gerente, con motivo obligatorio.
  @Post('entries/:entryId/override')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  override(
    @CurrentUser() user: JwtPayload,
    @Param('entryId') entryId: string,
    @Body() dto: OverrideQueueDto,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.queues.override(orgId, user, entryId, dto);
  }

  // El conductor prepara su viaje (PROGRAMADO) al llegar a LISTO, para poder
  // abrir su manifiesto antes de salir (plan-flujo-colas-hardware.md §4).
  @Post('entries/:entryId/prepare-trip')
  @Roles('CONDUCTOR', 'ADMINISTRADOR', 'SUPERADMIN')
  prepareTrip(
    @CurrentUser() user: JwtPayload,
    @Param('entryId') entryId: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.queues.prepareTrip(orgId, user, entryId);
  }

  // "Marcar salida" -- el propio conductor dueno de la unidad, o un
  // administrador (despacho directo, caso de excepcion), pueden despachar.
  @Post('entries/:entryId/depart')
  @Roles('CONDUCTOR', 'ADMINISTRADOR', 'SUPERADMIN')
  depart(
    @CurrentUser() user: JwtPayload,
    @Param('entryId') entryId: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.queues.depart(orgId, user, entryId);
  }

  // Excepcion 3: el conductor bloqueado por el candado de orden real de
  // salida avisa al administrador ("Inscripcion retrasada").
  @Post('delayed-registration')
  @Roles('CONDUCTOR')
  createDelayedRegistrationRequest(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { route: string },
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.queues.createDelayedRegistrationRequest(orgId, user, parseRoute(dto.route));
  }

  // Panel admin: lista de solicitudes de inscripcion retrasada.
  @Get('delayed-registration/list')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  listDelayedRegistrationRequests(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.queues.listDelayedRegistrationRequests(orgId);
  }

  // El administrador resuelve: LLAMAR_PREDECESOR o AUTORIZAR_DIRECTO.
  @Post('delayed-registration/:id/resolve')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  resolveDelayedRegistrationRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: { resolution: 'LLAMAR_PREDECESOR' | 'AUTORIZAR_DIRECTO' },
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    return this.queues.resolveDelayedRegistrationRequest(orgId, user, id, dto.resolution);
  }
}
