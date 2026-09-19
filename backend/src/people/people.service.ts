import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonStatusDto } from './dto/update-person-status.dto';
import { UpdateLicenseDto } from './dto/update-license.dto';
import { JwtPayload } from '../auth/jwt.strategy';
import { MailService } from '../mail/mail.service';

@Injectable()
export class PeopleService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  // El hash NUNCA debe llegar al navegador (ni al del admin que consulta a
  // otra persona, ni al de la propia persona via /people/me) -- ningun
  // frontend lo necesita (ver operacion-api.ts), por eso se selecciona todo
  // MENOS passwordHash en vez de devolver la fila completa de Prisma.
  private static readonly SAFE_SELECT = {
    id: true,
    organizationId: true,
    name: true,
    email: true,
    dni: true,
    phone: true,
    role: true,
    status: true,
    googleId: true,
    googleEmailVerifiedAt: true,
    whatsappPhone: true,
    boundDeviceId: true,
    boundDeviceSetAt: true,
    code: true,
    company: true,
    linkedUnit: true,
    license: true,
    licenseCategory: true,
    licenseExpiry: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  // La licencia es de una sola persona: mensaje claro en vez del error generico
  // de la restriccion unica de la base de datos.
  private async assertLicenseFree(license: string, exceptPersonId?: string) {
    const owner = await this.prisma.person.findFirst({
      where: { license, ...(exceptPersonId ? { id: { not: exceptPersonId } } : {}) },
      select: { name: true },
    });
    if (owner) throw new ConflictException(`La licencia ${license} ya está registrada a nombre de ${owner.name}.`);
  }

  findAll(organizationId: string) {
    return this.prisma.person.findMany({
      where: { organizationId },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: PeopleService.SAFE_SELECT,
    });
  }

  async findOne(organizationId: string, id: string) {
    const person = await this.prisma.person.findUnique({ where: { id }, select: PeopleService.SAFE_SELECT });
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
    // Decision 13 sept 2026: dar de alta a OTRO administrador queda exclusivo
    // de Super Admin -- un Administrador no puede auto-invitar a otro admin,
    // debe pedirselo a CHASKI AI. Socio/Conductor siguen siendo autoservicio
    // normal del Administrador.
    if (actor.role === 'ADMINISTRADOR' && dto.role === 'ADMINISTRADOR') {
      throw new ForbiddenException(
        'Solo Super Admin puede registrar una cuenta de Administrador. Pide a CHASKI AI que la dé de alta.',
      );
    }

    const existing = await this.prisma.person.findFirst({
      where: { email: dto.email, role: dto.role },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe una cuenta ${dto.role.toLowerCase()} con el correo ${dto.email}.`,
      );
    }

    // La licencia de conducir solo existe para conductores.
    const hasLicenseData = Boolean(dto.license || dto.licenseCategory || dto.licenseExpiry);
    if (hasLicenseData && dto.role !== 'CONDUCTOR') {
      throw new BadRequestException('La licencia de conducir solo aplica a conductores.');
    }
    if (dto.license) await this.assertLicenseFree(dto.license);

    const normalizedEmail = dto.email.toLowerCase();
    // La contraseña es por correo, no por fila (ver comentario de passwordHash
    // en schema.prisma): si este correo ya tiene otra cuenta (p. ej. Socio) con
    // contraseña definida, esta nueva cuenta (p. ej. Conductor) la hereda de
    // una vez -- asi ambas siempre quedan en sincronia sin pedirle a la
    // persona que la defina dos veces.
    const sibling = await this.prisma.person.findFirst({
      where: { email: normalizedEmail, passwordHash: { not: null } },
    });

    const person = await this.prisma.person.create({
      data: {
        organizationId,
        name: dto.name,
        email: normalizedEmail,
        dni: dto.dni,
        phone: dto.phone,
        role: dto.role,
        code: dto.code,
        company: dto.company,
        license: dto.license || undefined,
        licenseCategory: dto.licenseCategory?.trim() || undefined,
        licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : undefined,
        status: 'PENDIENTE',
        passwordHash: sibling?.passwordHash,
      },
      select: PeopleService.SAFE_SELECT,
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
      select: { name: true, logoUrl: true },
    });
    await this.mail.sendWelcomeEmail({
      to: person.email,
      name: person.name,
      role: dto.role,
      orgName: org?.name ?? 'tu asociación',
      orgLogoUrl: org?.logoUrl,
    });

    return person;
  }

  /** Activar o suspender una cuenta, con auditoria y motivo obligatorio para suspender. */
  async updateStatus(organizationId: string, actor: JwtPayload, personId: string, dto: UpdatePersonStatusDto) {
    const person = await this.findOne(organizationId, personId);
    const updated = await this.prisma.person.update({
      where: { id: personId },
      data: { status: dto.status },
      select: PeopleService.SAFE_SELECT,
    });
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

    // Reactivacion real (13 sept 2026, decidido con Jayde): para la persona
    // es como si la registraran de nuevo -- avisa igual que el alta, con
    // copy de "tu cuenta fue reactivada". Solo cuando de verdad viene de
    // SUSPENDIDO -- nunca en el primer ACTIVO por login de Google (ese
    // camino no pasa por aqui, ver AuthService.activateAndIssue).
    if (dto.status === 'ACTIVO' && person.status === 'SUSPENDIDO') {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, logoUrl: true },
      });
      await this.mail.sendReactivationEmail({
        to: person.email,
        name: person.name,
        // Nunca SUPERADMIN aqui: findOne() ya filtro por organizationId, y
        // el Super Admin siempre tiene organizationId null (seed.ts).
        role: person.role as 'ADMINISTRADOR' | 'SOCIO' | 'CONDUCTOR',
        orgName: org?.name ?? 'tu asociación',
        orgLogoUrl: org?.logoUrl,
      });
    }

    return updated;
  }

  /**
   * Registra o corrige la licencia de un conductor que ya existe (19 sept
   * 2026). Auditado; el numero de licencia NO se copia al texto de la
   * auditoria (solo categoria y vencimiento) para no repartir el dato.
   */
  async updateLicense(organizationId: string, actor: JwtPayload, personId: string, dto: UpdateLicenseDto) {
    const person = await this.findOne(organizationId, personId);
    if (person.role !== 'CONDUCTOR') {
      throw new BadRequestException('La licencia de conducir solo aplica a conductores.');
    }
    await this.assertLicenseFree(dto.license, personId);

    const updated = await this.prisma.person.update({
      where: { id: personId },
      data: {
        license: dto.license,
        licenseCategory: dto.licenseCategory.trim(),
        licenseExpiry: new Date(dto.licenseExpiry),
      },
      select: PeopleService.SAFE_SELECT,
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'ACTUALIZAR_LICENCIA',
        resource: `Persona ${person.name}`,
        resourceId: personId,
        before: person.license ? `Licencia ${person.licenseCategory ?? ''}`.trim() : 'Sin licencia registrada',
        after: `Licencia ${dto.licenseCategory.trim()}, vence ${dto.licenseExpiry.slice(0, 10)}`,
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
      select: PeopleService.SAFE_SELECT,
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
