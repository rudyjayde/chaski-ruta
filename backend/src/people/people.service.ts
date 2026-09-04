import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonStatusDto } from './dto/update-person-status.dto';
import { JwtPayload } from '../auth/jwt.strategy';
import { MailService } from '../mail/mail.service';

@Injectable()
export class PeopleService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  findAll(organizationId: string) {
    return this.prisma.person.findMany({
      where: { organizationId },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(organizationId: string, id: string) {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person || person.organizationId !== organizationId) {
      throw new NotFoundException('Persona no encontrada');
    }
    return person;
  }

  /**
   * Alta de una cuenta (Administrador, Socio o Conductor). Un mismo correo
   * puede tener hasta 2 cuentas — una Socio, una Conductor — nunca dos con
   * el mismo rol (regla dura acordada con Jayde, agosto 2026: permite que un
   * socio que tambien maneja su propio vehiculo entre a cualquiera de los dos
   * paneles con el mismo correo, eligiendo cual al iniciar sesion, sin mezclar
   * las pantallas de cada rol en una sola cuenta).
   */
  async create(organizationId: string, actor: JwtPayload, dto: CreatePersonDto) {
    const existing = await this.prisma.person.findFirst({
      where: { email: dto.email, role: dto.role },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe una cuenta ${dto.role.toLowerCase()} con el correo ${dto.email}.`,
      );
    }

    const person = await this.prisma.person.create({
      data: {
        organizationId,
        name: dto.name,
        email: dto.email.toLowerCase(),
        dni: dto.dni,
        phone: dto.phone,
        role: dto.role,
        code: dto.code,
        company: dto.company,
        status: 'PENDIENTE',
      },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'REGISTRAR_PERSONA',
        resource: `${dto.role} ${person.name}`,
        resourceId: person.id,
        before: 'Sin cuenta',
        after: `Cuenta creada (${dto.role.toLowerCase()}, correo autorizado: ${person.email})`,
      },
    });

    // Correo de bienvenida explicando el rol -- nunca credenciales, el login
    // es siempre por Google. Mejor esfuerzo: no revierte ni bloquea el alta
    // si el correo falla (ver MailService.sendWelcomeEmail).
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    await this.mail.sendWelcomeEmail({
      to: person.email,
      name: person.name,
      role: dto.role,
      orgName: org?.name ?? 'tu asociación',
    });

    return person;
  }

  /** Activar o suspender una cuenta, con auditoria y motivo obligatorio para suspender. */
  async updateStatus(organizationId: string, actor: JwtPayload, personId: string, dto: UpdatePersonStatusDto) {
    const person = await this.findOne(organizationId, personId);
    const updated = await this.prisma.person.update({ where: { id: personId }, data: { status: dto.status } });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: dto.status === 'SUSPENDIDO' ? 'SUSPENDER_PERSONA' : 'ACTIVAR_PERSONA',
        resource: `Persona ${person.name}`,
        resourceId: personId,
        before: person.status,
        after: dto.status,
        reason: dto.reason,
      },
    });
    return updated;
  }

  /**
   * Reasignar dispositivo (Excepcion 2, plan-operacion.md §3.2): cuando un
   * conductor pierde o le roban el celular, o simplemente cambia de equipo,
   * el administrador libera la vinculacion cuenta-dispositivo desde el panel
   * -- unicamente el administrador puede hacerlo, nunca el propio conductor.
   * No borra ni cambia ningun otro dato: la proxima vez que la cuenta se use
   * para inscribirse en una cola, se vuelve a vincular sola al dispositivo
   * desde el que se haga.
   */
  async resetDevice(organizationId: string, actor: JwtPayload, personId: string, reason?: string) {
    const person = await this.findOne(organizationId, personId);
    if (!person.boundDeviceId) {
      return person; // nada que reasignar, no hace falta auditoria
    }
    const updated = await this.prisma.person.update({
      where: { id: personId },
      data: { boundDeviceId: null, boundDeviceSetAt: null },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'REASIGNAR_DISPOSITIVO',
        resource: `Persona ${person.name}`,
        resourceId: personId,
        before: `Vinculado a ${person.boundDeviceId}`,
        after: 'Sin vinculacion -- se vinculara al proximo dispositivo que use',
        reason: reason || 'Reasignacion manual desde el panel (equipo perdido, robado o cambiado)',
      },
    });
    return updated;
  }
}
