import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { NoticesService } from './notices.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { BroadcastNoticeDto } from './dto/broadcast-notice.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

// Avisos del administrador a conductores/socios (plan-pro.md §9) -- se
// entregan SOLO dentro de la plataforma, nunca por WhatsApp (ver comentario
// del modelo Notice en schema.prisma).
@Controller('notices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NoticesController {
  constructor(private notices: NoticesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.notices.findForRole(orgId, user.sub, user.role);
  }

  // Campanita real del Shell (12 sept 2026) -- cuenta solo avisos privados
  // (targetPersonId), no los de audiencia general.
  @Get('unread-count')
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.notices.countUnread(user.sub).then((count) => ({ count }));
  }

  @Post('mark-read')
  async markRead(@CurrentUser() user: JwtPayload) {
    await this.notices.markAllRead(user.sub);
    return { ok: true };
  }

  @Post()
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateNoticeDto, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.notices.create(orgId, user, dto);
  }

  // Aviso masivo (13 sept 2026) -- ej. mantenimiento programado. Nunca pasa
  // por resolveOrgId a proposito: es la unica accion que cruza asociaciones
  // a la vez, y organizationIds (vacio = todas) viene en el body, filtrado
  // por el propio Super Admin en la pantalla.
  @Post('broadcast')
  @Roles('SUPERADMIN')
  broadcast(@CurrentUser() user: JwtPayload, @Body() dto: BroadcastNoticeDto) {
    return this.notices.broadcast(user, dto);
  }
}
