import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { BroadcastNoticeDto } from './dto/broadcast-notice.dto';
import { JwtPayload } from '../auth/jwt.strategy';

@Injectable()
export class NoticesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, actor: JwtPayload, dto: CreateNoticeDto) {
    const author = await this.prisma.person.findUnique({ where: { id: actor.sub } });
    if (!author) {
      throw new NotFoundException('No se encontró tu cuenta para firmar el aviso.');
    }
    return this.prisma.notice.create({
      data: {
        organizationId,
        authorId: author.id,
        authorName: author.name,
        title: dto.title,
        body: dto.body,
        audience: dto.audience,
      },
    });
  }

  /**
   * Aviso masivo de Super Admin a varias asociaciones a la vez (13 sept
   * 2026) -- ej. avisar un mantenimiento programado. organizationIds vacio
   * o ausente = TODAS las asociaciones reales (sin importar plan); con IDs
   * = solo esas, filtro real. Crea un Notice real por cada asociacion
   * (mismo modelo/pantalla que ya usa el Administrador para avisar a su
   * propia flota) y un AuditEntry por asociacion, nunca uno solo global,
   * porque AuditEntry siempre pertenece a una asociacion (regla dura del
   * sistema).
   */
  async broadcast(actor: JwtPayload, dto: BroadcastNoticeDto) {
    const author = await this.prisma.person.findUnique({ where: { id: actor.sub } });
    if (!author) {
      throw new NotFoundException('No se encontró tu cuenta para firmar el aviso.');
    }
    const targetOrgs = await this.prisma.organization.findMany({
      where: { status: { not: 'ELIMINADA' }, ...(dto.organizationIds && dto.organizationIds.length > 0 ? { id: { in: dto.organizationIds } } : {}) },
      select: { id: true, name: true },
    });
    if (targetOrgs.length === 0) {
      throw new BadRequestException('No hay asociaciones para enviar este aviso.');
    }

    await this.prisma.$transaction([
      ...targetOrgs.map((o) =>
        this.prisma.notice.create({
          data: {
            organizationId: o.id,
            authorId: author.id,
            authorName: author.name,
            title: dto.title,
            body: dto.body,
            audience: dto.audience,
          },
        }),
      ),
      ...targetOrgs.map((o) =>
        this.prisma.auditEntry.create({
          data: {
            organizationId: o.id,
            actorId: actor.sub,
            actorRole: actor.role,
            action: 'AVISO_MASIVO_ASOCIACIONES',
            resource: `Asociacion ${o.name}`,
            resourceId: o.id,
            after: dto.title,
            reason: dto.body,
          },
        }),
      ),
    ]);

    return { sent: targetOrgs.length, organizations: targetOrgs.map((o) => o.name) };
  }

  /**
   * Avisos visibles para quien pregunta, segun su rol (plan-pro.md §9):
   * CONDUCTOR ve CONDUCTORES+AMBOS, SOCIO ve SOCIOS+AMBOS -- ninguno de los
   * dos ve nunca un aviso ADMINISTRADORES (13 sept 2026: aviso masivo de
   * Super Admin dirigido solo al administrador de la asociacion). Administrador
   * y Super Admin ven todos, incluido ADMINISTRADORES -- es su propia vista
   * de gestion/historial. Ademas (12 sept 2026) incluye SIEMPRE los avisos
   * privados dirigidos a esta persona (targetPersonId), sin importar su
   * audiencia -- ej. el resultado de su propia solicitud de bloqueo de motor.
   */
  findForRole(organizationId: string, actorId: string, role: string) {
    const audiences: ('CONDUCTORES' | 'SOCIOS' | 'AMBOS' | 'ADMINISTRADORES')[] =
      role === 'CONDUCTOR' ? ['CONDUCTORES', 'AMBOS']
      : role === 'SOCIO' ? ['SOCIOS', 'AMBOS']
      : ['CONDUCTORES', 'SOCIOS', 'AMBOS', 'ADMINISTRADORES'];

    return this.prisma.notice.findMany({
      where: { organizationId, OR: [{ audience: { in: audiences } }, { targetPersonId: actorId }] },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Cuantos avisos PRIVADOS (dirigidos a esta persona) siguen sin leer -- alimenta la campanita real del Shell. */
  countUnread(actorId: string) {
    return this.prisma.notice.count({ where: { targetPersonId: actorId, readAt: null } });
  }

  /** Marca como leidos TODOS los avisos privados de esta persona -- se llama al abrir la campanita. */
  async markAllRead(actorId: string) {
    await this.prisma.notice.updateMany({ where: { targetPersonId: actorId, readAt: null }, data: { readAt: new Date() } });
  }

  /**
   * Aviso privado creado por el propio backend (nunca por el formulario de
   * "Redactar aviso" del administrador) -- usado por engine-lock.service.ts
   * para avisar al socio dueño de una unidad que su solicitud cambio de
   * estado. audience='AMBOS' es un valor de relleno sin efecto real, porque
   * el OR de findForRole ya lo hace visible por targetPersonId.
   */
  async createSystemNotice(organizationId: string, targetPersonId: string, title: string, body: string) {
    await this.prisma.notice.create({
      data: {
        organizationId,
        authorId: targetPersonId,
        authorName: 'CHASKI AI',
        title,
        body,
        audience: 'AMBOS',
        targetPersonId,
      },
    });
  }
}
