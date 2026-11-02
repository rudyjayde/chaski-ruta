import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AssistantService, type ChatTurn } from './assistant.service';
import { ChatDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { assertProPlan, resolveOrgId } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';

// Turnos previos que se le mandan a Claude como contexto -- el mismo tope
// que tenia el historial en memoria (ChatDto.history), para que una
// conversacion muy larga no dispare el costo de cada pregunta.
const CONTEXT_TURNS = 20;
const TITLE_MAX = 60;
const LIST_LIMIT = 50;

function titleFrom(message: string): string {
  const clean = message.trim().replace(/\s+/g, ' ');
  return clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1)}…` : clean;
}

// Panel admin del asistente (docs/planes/plan-pro.md #6) -- alcance amplio,
// solo administrador/super admin. El canal de WhatsApp (#8, alcance acotado a
// conductores/socios) es un modulo aparte, todavia no construido.
//
// Historial (2 nov 2026): cada conversacion se guarda y solo la ve la
// persona que la tuvo, dentro de esa asociacion.
@Controller('assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRADOR', 'SUPERADMIN')
export class AssistantController {
  constructor(
    private assistant: AssistantService,
    private prisma: PrismaService,
  ) {}

  private async resolveProOrg(user: JwtPayload, organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    // El asistente conversacional es una funcion del Plan PRO (plan-pro.md #6) --
    // regla dura en el backend, no solo un toggle visual del frontend.
    assertProPlan(user, org.plan);
    return org;
  }

  private async ownConversation(user: JwtPayload, orgId: string, id: string) {
    const conversation = await this.prisma.assistantConversation.findFirst({
      where: { id, organizationId: orgId, personId: user.sub },
    });
    if (!conversation) throw new NotFoundException('Conversación no encontrada');
    return conversation;
  }

  @Post('chat')
  async chat(@CurrentUser() user: JwtPayload, @Body() dto: ChatDto, @Query('organizationId') organizationId?: string) {
    const org = await this.resolveProOrg(user, organizationId);
    const actor = await this.prisma.person.findUnique({ where: { id: user.sub } });
    // Nombre de pila para el saludo natural ("Hola Rosa", no "Hola Rosa Huanca Flores").
    const actorFirstName = actor?.name?.trim().split(/\s+/)[0] ?? null;

    let history: ChatTurn[] = dto.history ?? [];
    if (dto.conversationId) {
      await this.ownConversation(user, org.id, dto.conversationId);
      const previous = await this.prisma.assistantMessage.findMany({
        where: { conversationId: dto.conversationId },
        orderBy: { createdAt: 'desc' },
        take: CONTEXT_TURNS,
      });
      history = previous.reverse().map((m) => ({ role: m.role as ChatTurn['role'], content: m.content }));
    }

    const reply = await this.assistant.chat(org.id, org.name, actorFirstName, dto.message, history);

    // Se guarda solo despues de una respuesta exitosa: una pregunta que fallo
    // no deja una conversacion vacia ni a medias en el historial.
    const conversation = await this.prisma.$transaction(async (tx) => {
      const conv = dto.conversationId
        ? await tx.assistantConversation.update({ where: { id: dto.conversationId }, data: { updatedAt: new Date() } })
        : await tx.assistantConversation.create({
            data: { organizationId: org.id, personId: user.sub, title: titleFrom(dto.message) },
          });
      await tx.assistantMessage.create({ data: { conversationId: conv.id, role: 'user', content: dto.message } });
      await tx.assistantMessage.create({ data: { conversationId: conv.id, role: 'assistant', content: reply } });
      return conv;
    });

    return { reply, assistantName: `${org.name} AI`, conversationId: conversation.id, title: conversation.title };
  }

  @Get('conversations')
  async list(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const org = await this.resolveProOrg(user, organizationId);
    return this.prisma.assistantConversation.findMany({
      where: { organizationId: org.id, personId: user.sub },
      orderBy: { updatedAt: 'desc' },
      take: LIST_LIMIT,
      select: { id: true, title: true, updatedAt: true },
    });
  }

  @Get('conversations/:id')
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const org = await this.resolveProOrg(user, organizationId);
    const conversation = await this.ownConversation(user, org.id, id);
    const messages = await this.prisma.assistantMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    return { id: conversation.id, title: conversation.title, messages };
  }

  @Delete('conversations/:id')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const org = await this.resolveProOrg(user, organizationId);
    await this.ownConversation(user, org.id, id);
    await this.prisma.assistantConversation.delete({ where: { id } });
    return { ok: true };
  }
}
