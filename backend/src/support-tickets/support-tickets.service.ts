import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { RespondSupportTicketDto } from './dto/respond-support-ticket.dto';

@Injectable()
export class SupportTicketsService {
  constructor(private prisma: PrismaService) {}

  /** El Administrador reporta un problema desde su propio panel -- authorName queda
   * denormalizado (igual que Notice.authorName) para no depender de un JOIN. */
  async create(organizationId: string, actor: JwtPayload, dto: CreateSupportTicketDto) {
    const author = await this.prisma.person.findUnique({ where: { id: actor.sub } });
    if (!author) {
      throw new NotFoundException('No se encontró tu cuenta para crear el ticket.');
    }
    return this.prisma.supportTicket.create({
      data: {
        organizationId,
        authorId: author.id,
        authorName: author.name,
        subject: dto.subject,
        message: dto.message,
      },
    });
  }

  /** El Administrador ve solo los tickets de su propia asociación. */
  findForOrganization(organizationId: string) {
    return this.prisma.supportTicket.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Super Admin ve la cola completa, cruzando TODAS las asociaciones (mismo
   * criterio que audit.service.ts findAllAcrossOrgs). */
  findAllAcrossOrgs() {
    return this.prisma.supportTicket.findMany({
      include: { organization: { select: { name: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  /** Super Admin responde y/o cambia el estado -- nunca se "resuelve" solo, siempre
   * queda quién y cuándo respondió. */
  async respond(id: string, actor: JwtPayload, dto: RespondSupportTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket no encontrado.');
    const responder = await this.prisma.person.findUnique({ where: { id: actor.sub } });
    return this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.response !== undefined ? { response: dto.response } : {}),
        respondedAt: new Date(),
        respondedBy: responder?.name ?? actor.role,
      },
    });
  }
}
