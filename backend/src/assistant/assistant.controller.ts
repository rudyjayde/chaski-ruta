import { Body, Controller, Post, Query, UseGuards } from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { ChatDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { assertProPlan, resolveOrgId } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';

// Panel admin del asistente (docs/planes/plan-pro.md #6) -- alcance amplio,
// solo administrador/super admin. El canal de WhatsApp (#8, alcance acotado a
// conductores/socios) es un modulo aparte, todavia no construido.
@Controller('assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssistantController {
  constructor(
    private assistant: AssistantService,
    private prisma: PrismaService,
  ) {}

  @Post('chat')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  async chat(@CurrentUser() user: JwtPayload, @Body() dto: ChatDto, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    // El asistente conversacional es una funcion del Plan PRO (plan-pro.md #6) --
    // regla dura en el backend, no solo un toggle visual del frontend.
    assertProPlan(user, org.plan);
    const actor = await this.prisma.person.findUnique({ where: { id: user.sub } });
    // Nombre de pila para el saludo natural ("Hola Rosa", no "Hola Rosa Huanca Flores").
    const actorFirstName = actor?.name?.trim().split(/\s+/)[0] ?? null;
    const reply = await this.assistant.chat(orgId, org.name, actorFirstName, dto.message, dto.history);
    return { reply, assistantName: `${org.name} AI` };
  }
}
