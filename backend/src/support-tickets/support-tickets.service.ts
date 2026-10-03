import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupportTicketImpact, SupportTicketPriority, SupportTicketStatus, SupportTicketUrgency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { JwtPayload } from '../auth/jwt.strategy';
import { nextSequenceNumber } from '../common/sequence';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { ClassifySupportTicketDto } from './dto/classify-support-ticket.dto';
import { AssignSupportTicketDto } from './dto/assign-support-ticket.dto';
import { EscalateSupportTicketDto } from './dto/escalate-support-ticket.dto';
import { ResolveSupportTicketDto } from './dto/resolve-support-ticket.dto';
import { CloseSupportTicketDto } from './dto/close-support-ticket.dto';
import { UpdateStatusSupportTicketDto } from './dto/update-status-support-ticket.dto';
import { LinkProblemSupportTicketDto } from './dto/link-problem-support-ticket.dto';

// Matriz impacto x urgencia -> prioridad, EXACTA a la que define el tesista (OE4) -- nunca se
// recalcula distinto en dos lugares del codigo, siempre se pasa por esta funcion.
const PRIORITY_MATRIX: Record<SupportTicketImpact, Record<SupportTicketUrgency, SupportTicketPriority>> = {
  ALTO: { ALTA: 'P1', MEDIA: 'P1', BAJA: 'P2' },
  MEDIO: { ALTA: 'P1', MEDIA: 'P2', BAJA: 'P3' },
  BAJO: { ALTA: 'P2', MEDIA: 'P3', BAJA: 'P4' },
};

// SLA en HORAS CALENDARIO (no habiles), guardado en minutos. P4 no tiene limite de resolucion.
const SLA_MINUTES: Record<SupportTicketPriority, { response: number; resolution: number | null }> = {
  P1: { response: 30, resolution: 4 * 60 },
  P2: { response: 2 * 60, resolution: 24 * 60 },
  P3: { response: 8 * 60, resolution: 72 * 60 },
  P4: { response: 24 * 60, resolution: null },
};

function computePriority(impact: SupportTicketImpact, urgency: SupportTicketUrgency): SupportTicketPriority {
  return PRIORITY_MATRIX[impact][urgency];
}

const OPEN_STATUSES: SupportTicketStatus[] = ['ABIERTO', 'EN_ANALISIS', 'ESCALADO', 'EN_ESPERA'];

export interface TicketListFilters {
  priority?: SupportTicketPriority;
  status?: SupportTicketStatus;
  supportLevel?: 'N1' | 'N2' | 'N3';
  organizationId?: string;
}

@Injectable()
export class SupportTicketsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  /** El Administrador reporta un problema desde su propio panel, ya clasificado por el mismo
   * (tipo/categoria/impacto/urgencia) -- authorName queda denormalizado (igual que Notice.authorName). */
  async create(organizationId: string, actor: JwtPayload, dto: CreateSupportTicketDto) {
    const author = await this.prisma.person.findUnique({ where: { id: actor.sub } });
    if (!author) {
      throw new NotFoundException('No se encontró tu cuenta para crear el ticket.');
    }
    const priority = computePriority(dto.impact, dto.urgency);
    const sla = SLA_MINUTES[priority];
    const code = await nextSequenceNumber(this.prisma, 'support_tickets', 'code', 'TCK-');

    const ticket = await this.prisma.supportTicket.create({
      data: {
        organizationId,
        authorId: author.id,
        authorName: author.name,
        code,
        subject: dto.subject,
        message: dto.message,
        type: dto.type,
        category: dto.category,
        impact: dto.impact,
        urgency: dto.urgency,
        priority,
        slaResponseMin: sla.response,
        slaResolutionMin: sla.resolution,
        evidenceUrl: dto.evidenceUrl,
      },
    });

    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'CREAR_TICKET_SOPORTE',
        resource: `Ticket ${code}`,
        resourceId: ticket.id,
        before: null,
        after: 'ABIERTO',
        reason: `${dto.type} · ${dto.category} · prioridad ${priority}`,
      },
    });

    if (author.email) {
      await this.mail.sendSupportTicketAck({ to: author.email, name: author.name, code, subject: dto.subject, priority });
    }
    return ticket;
  }

  /** El Administrador ve solo los tickets de su propia asociación. */
  findForOrganization(organizationId: string, filters: Omit<TicketListFilters, 'organizationId'> = {}) {
    return this.prisma.supportTicket.findMany({
      where: { organizationId, priority: filters.priority, status: filters.status, supportLevel: filters.supportLevel },
      include: { problem: { select: { code: true, title: true } } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /** Super Admin ve la cola completa, cruzando TODAS las asociaciones, con filtros. */
  findAllAcrossOrgs(filters: TicketListFilters = {}) {
    return this.prisma.supportTicket.findMany({
      where: {
        organizationId: filters.organizationId,
        priority: filters.priority,
        status: filters.status,
        supportLevel: filters.supportLevel,
      },
      include: { organization: { select: { name: true } }, problem: { select: { code: true, title: true } } },
      orderBy: [{ priority: 'asc' }, { status: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async findOne(id: string, organizationId?: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: { organization: { select: { name: true } }, problem: { select: { code: true, title: true } } },
    });
    if (!ticket || (organizationId && ticket.organizationId !== organizationId)) {
      throw new NotFoundException('Ticket no encontrado.');
    }
    const history = await this.prisma.auditEntry.findMany({
      where: { resourceId: id, action: { endsWith: '_TICKET_SOPORTE' } },
      orderBy: { createdAt: 'asc' },
    });
    return { ...ticket, history };
  }

  private async getTicketOrThrow(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket no encontrado.');
    return ticket;
  }

  /** Se fija SOLO en la primera accion real del Super Admin sobre el ticket -- nunca un campo que
   * alguien pueda escribir a mano. Se llama desde cada accion de abajo antes de tocar el ticket. */
  private firstResponsePatch(ticket: { firstResponseAt: Date | null }) {
    return ticket.firstResponseAt ? {} : { firstResponseAt: new Date() };
  }

  private async audit(organizationId: string, actor: JwtPayload, action: string, ticket: { code: string; id: string }, before: string, after: string, reason: string) {
    await this.prisma.auditEntry.create({
      data: { organizationId, actorId: actor.sub, actorRole: actor.role, action, resource: `Ticket ${ticket.code}`, resourceId: ticket.id, before, after, reason },
    });
  }

  private async notifyStatus(ticket: { authorId: string; code: string; subject: string }, message: string) {
    const author = await this.prisma.person.findUnique({ where: { id: ticket.authorId }, select: { email: true, name: true } });
    if (author?.email) {
      await this.mail.sendSupportTicketStatusUpdate({ to: author.email, name: author.name, code: ticket.code, subject: ticket.subject, message });
    }
  }

  /** Super Admin (N1) corrige impacto/urgencia/categoria -- recalcula prioridad y SLA, y deja en
   * Auditoría el valor anterior y el nuevo (pedido explicito del tesista). */
  async classify(id: string, actor: JwtPayload, dto: ClassifySupportTicketDto) {
    const ticket = await this.getTicketOrThrow(id);
    if (dto.category === undefined && dto.impact === undefined && dto.urgency === undefined) {
      throw new BadRequestException('Indica al menos categoría, impacto o urgencia para clasificar.');
    }
    const impact = dto.impact ?? ticket.impact;
    const urgency = dto.urgency ?? ticket.urgency;
    const priority = computePriority(impact, urgency);
    const sla = SLA_MINUTES[priority];
    const changed = impact !== ticket.impact || urgency !== ticket.urgency;

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        category: dto.category ?? ticket.category,
        impact,
        urgency,
        priority,
        slaResponseMin: sla.response,
        slaResolutionMin: sla.resolution,
        ...this.firstResponsePatch(ticket),
      },
    });
    await this.audit(
      ticket.organizationId,
      actor,
      'CLASIFICAR_TICKET_SOPORTE',
      ticket,
      `${ticket.impact}/${ticket.urgency} → ${ticket.priority}`,
      `${impact}/${urgency} → ${priority}`,
      changed ? 'El Super Admin corrigió la clasificación del administrador.' : 'Se confirmó la categoría sin cambiar impacto/urgencia.',
    );
    return updated;
  }

  async assign(id: string, actor: JwtPayload, dto: AssignSupportTicketDto) {
    const ticket = await this.getTicketOrThrow(id);
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: { assigneeName: dto.assigneeName, ...this.firstResponsePatch(ticket) },
    });
    await this.audit(ticket.organizationId, actor, 'ASIGNAR_TICKET_SOPORTE', ticket, ticket.assigneeName ?? 'Sin asignar', dto.assigneeName, 'Asignación de responsable');
    return updated;
  }

  async escalate(id: string, actor: JwtPayload, dto: EscalateSupportTicketDto) {
    const ticket = await this.getTicketOrThrow(id);
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        supportLevel: dto.supportLevel,
        status: 'ESCALADO',
        ...(dto.assigneeName ? { assigneeName: dto.assigneeName } : {}),
        ...this.firstResponsePatch(ticket),
      },
    });
    await this.audit(ticket.organizationId, actor, 'ESCALAR_TICKET_SOPORTE', ticket, ticket.supportLevel, dto.supportLevel, dto.note);
    await this.notifyStatus(ticket, `Tu ticket se escaló a nivel ${dto.supportLevel}.`);
    return updated;
  }

  async resolve(id: string, actor: JwtPayload, dto: ResolveSupportTicketDto) {
    const ticket = await this.getTicketOrThrow(id);
    if (ticket.status === 'CERRADO') throw new BadRequestException('Este ticket ya está cerrado.');
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: 'RESUELTO',
        resolution: dto.resolution,
        ...(dto.evidenceUrl ? { evidenceUrl: dto.evidenceUrl } : {}),
        resolvedAt: new Date(),
        respondedAt: new Date(),
        respondedBy: await this.actorName(actor),
        ...this.firstResponsePatch(ticket),
      },
    });
    await this.audit(ticket.organizationId, actor, 'RESOLVER_TICKET_SOPORTE', ticket, ticket.status, 'RESUELTO', dto.resolution);
    await this.notifyStatus(ticket, `Tu ticket quedó resuelto: ${dto.resolution}`);
    return updated;
  }

  /** ITIL exige pasar por RESUELTO antes de CERRADO -- evita cerrar un ticket que nadie resolvió. */
  async close(id: string, actor: JwtPayload, dto: CloseSupportTicketDto) {
    const ticket = await this.getTicketOrThrow(id);
    if (ticket.status !== 'RESUELTO') {
      throw new BadRequestException('Solo se puede cerrar un ticket que ya está RESUELTO.');
    }
    const updated = await this.prisma.supportTicket.update({ where: { id }, data: { status: 'CERRADO', closedAt: new Date() } });
    await this.audit(ticket.organizationId, actor, 'CERRAR_TICKET_SOPORTE', ticket, 'RESUELTO', 'CERRADO', dto.note ?? 'Cierre del ticket');
    await this.notifyStatus(ticket, dto.note ? `Tu ticket se cerró. ${dto.note}` : 'Tu ticket se cerró.');
    return updated;
  }

  async updateStatus(id: string, actor: JwtPayload, dto: UpdateStatusSupportTicketDto) {
    const ticket = await this.getTicketOrThrow(id);
    if (ticket.status === 'CERRADO') throw new BadRequestException('Este ticket ya está cerrado.');
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: { status: dto.status, ...this.firstResponsePatch(ticket) },
    });
    await this.audit(ticket.organizationId, actor, 'CAMBIAR_ESTADO_TICKET_SOPORTE', ticket, ticket.status, dto.status, dto.note ?? 'Cambio de estado');
    if (dto.status === 'EN_ESPERA') await this.notifyStatus(ticket, dto.note ? `Tu ticket está en espera. ${dto.note}` : 'Tu ticket está en espera de más información.');
    return updated;
  }

  async linkProblem(id: string, actor: JwtPayload, dto: LinkProblemSupportTicketDto) {
    const ticket = await this.getTicketOrThrow(id);
    if (dto.problemId) {
      const problem = await this.prisma.problemRecord.findUnique({ where: { id: dto.problemId } });
      if (!problem) throw new NotFoundException('Problema no encontrado.');
    }
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        ...(dto.problemId !== undefined ? { problemId: dto.problemId || null } : {}),
        ...(dto.rfcRef !== undefined ? { rfcRef: dto.rfcRef || null } : {}),
      },
    });
    await this.audit(
      ticket.organizationId,
      actor,
      'VINCULAR_PROBLEMA_TICKET_SOPORTE',
      ticket,
      ticket.problemId ?? ticket.rfcRef ?? 'Sin vincular',
      dto.problemId ?? dto.rfcRef ?? 'Sin vincular',
      'Vínculo con problema/RFC',
    );
    return updated;
  }

  private async actorName(actor: JwtPayload): Promise<string> {
    const person = await this.prisma.person.findUnique({ where: { id: actor.sub }, select: { name: true } });
    return person?.name ?? actor.role;
  }

  /**
   * Indicadores del mes para la mesa de servicio (OE4 tesis): tickets abiertos por prioridad
   * (de los creados ese mes, los que siguen sin RESUELTO/CERRADO), % dentro de SLA de respuesta y
   * de resolución, MTTR promedio (resolvedAt - createdAt, en horas) y cantidad de P1.
   */
  async getMetrics(month: string) {
    const [year, mon] = month.split('-').map(Number);
    const from = new Date(Date.UTC(year, mon - 1, 1));
    const to = new Date(Date.UTC(year, mon, 1));
    const tickets = await this.prisma.supportTicket.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { priority: true, status: true, createdAt: true, firstResponseAt: true, resolvedAt: true, slaResponseMin: true, slaResolutionMin: true },
    });

    const openByPriority: Record<SupportTicketPriority, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
    let withinResponseSla = 0;
    let measuredResponse = 0;
    let withinResolutionSla = 0;
    let measuredResolution = 0;
    let mttrTotalHours = 0;
    let mttrCount = 0;

    for (const t of tickets) {
      if (OPEN_STATUSES.includes(t.status)) openByPriority[t.priority]++;
      if (t.firstResponseAt && t.slaResponseMin != null) {
        measuredResponse++;
        if ((t.firstResponseAt.getTime() - t.createdAt.getTime()) / 60000 <= t.slaResponseMin) withinResponseSla++;
      }
      if (t.resolvedAt) {
        mttrCount++;
        mttrTotalHours += (t.resolvedAt.getTime() - t.createdAt.getTime()) / 3600000;
        if (t.slaResolutionMin != null) {
          measuredResolution++;
          if ((t.resolvedAt.getTime() - t.createdAt.getTime()) / 60000 <= t.slaResolutionMin) withinResolutionSla++;
        }
      }
    }

    return {
      month,
      totalTickets: tickets.length,
      openByPriority,
      p1Count: tickets.filter(t => t.priority === 'P1').length,
      slaResponsePct: measuredResponse > 0 ? Math.round((withinResponseSla / measuredResponse) * 1000) / 10 : null,
      slaResolutionPct: measuredResolution > 0 ? Math.round((withinResolutionSla / measuredResolution) * 1000) / 10 : null,
      mttrHours: mttrCount > 0 ? Math.round((mttrTotalHours / mttrCount) * 10) / 10 : null,
    };
  }
}
