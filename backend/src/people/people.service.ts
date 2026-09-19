import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonStatusDto } from './dto/update-person-status.dto';
import { UpdateLicenseDto } from './dto/update-license.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { licenseDatesProblem } from '../common/validators';
import { JwtPayload } from '../auth/jwt.strategy';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';

// "12345678" -> "******78": en Auditoria nunca queda un documento completo.
function maskId(value?: string | null): string {
  if (!value) return 'sin dato';
  return value.length > 4 ? `${'*'.repeat(value.length - 2)}${value.slice(-2)}` : value;
}

@Injectable()
export class PeopleService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private auth: AuthService,
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
    licenseIssuedAt: true,
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

  // El DNI es de una sola persona dentro de la asociacion. El mismo correo con
  // dos perfiles (Socio + Conductor) comparte DNI a proposito, por eso se
  // excluyen las cuentas del mismo correo.
  private async assertDniFree(organizationId: string | null, dni: string, email: string) {
    const owner = await this.prisma.person.findFirst({
      where: { organizationId, dni, NOT: { email } },
      select: { name: true },
    });
    if (owner) throw new ConflictException(`El DNI ${dni} ya está registrado a nombre de ${owner.name}.`);
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

    // El correo se compara SIEMPRE en minusculas: antes "Rosa@Gmail.com" no
    // encontraba a "rosa@gmail.com", pasaba la revision y la base de datos lo
    // rechazaba con un error generico.
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.person.findFirst({
      where: { email: normalizedEmail, role: dto.role },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe una cuenta ${dto.role.toLowerCase()} con el correo ${normalizedEmail}.`,
      );
    }
    if (dto.dni) await this.assertDniFree(organizationId, dto.dni, normalizedEmail);

    // La licencia de conducir solo existe para conductores.
    const hasLicenseData = Boolean(dto.license || dto.licenseCategory || dto.licenseIssuedAt || dto.licenseExpiry);
    if (hasLicenseData && dto.role !== 'CONDUCTOR') {
      throw new BadRequestException('La licencia de conducir solo aplica a conductores.');
    }
    if (dto.license) {
      if (!dto.licenseCategory?.trim() || !dto.licenseIssuedAt || !dto.licenseExpiry) {
        throw new BadRequestException('Para registrar la licencia indica el número, la categoría, la fecha de emisión y el vencimiento.');
      }
      const problem = licenseDatesProblem(new Date(dto.licenseIssuedAt), new Date(dto.licenseExpiry));
      if (problem) throw new BadRequestException(problem);
      await this.assertLicenseFree(dto.license);
    }
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
        licenseIssuedAt: dto.licenseIssuedAt ? new Date(dto.licenseIssuedAt) : undefined,
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

    // Correo de bienvenida explicando el rol -- nunca credenciales: la persona
    // entra con Google o define su propia contraseña con el enlace del correo.
    // Mejor esfuerzo: no revierte ni bloquea el alta si el correo falla (ver
    // MailService.sendWelcomeEmail).
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
      setPasswordToken: await this.auth.issuePasswordSetupToken(person.email),
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
    const problem = licenseDatesProblem(new Date(dto.licenseIssuedAt), new Date(dto.licenseExpiry));
    if (problem) throw new BadRequestException(problem);
    await this.assertLicenseFree(dto.license, personId);

    const updated = await this.prisma.person.update({
      where: { id: personId },
      data: {
        license: dto.license,
        licenseCategory: dto.licenseCategory.trim(),
        licenseIssuedAt: new Date(dto.licenseIssuedAt),
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
        after: `Licencia ${dto.licenseCategory.trim()}, emitida ${dto.licenseIssuedAt.slice(0, 10)}, vence ${dto.licenseExpiry.slice(0, 10)}`,
      },
    });
    return updated;
  }

  /** Mi propio registro. No pasa por el filtro de asociacion: el Super Admin no tiene una. */
  async findMe(personId: string) {
    const person = await this.prisma.person.findUnique({ where: { id: personId }, select: PeopleService.SAFE_SELECT });
    if (!person) throw new NotFoundException('Persona no encontrada');
    return person;
  }

  /**
   * "Mi cuenta": la persona corrige sus propios datos personales. El correo
   * (con el que la invitaron), el rol y la asociacion NO se pueden cambiar
   * desde aqui. Nombre, DNI y celular son de la persona, no del perfil: si el
   * mismo correo tiene dos perfiles (Socio + Conductor), se actualizan en
   * ambos. La licencia solo la edita un conductor. Un campo vacio no cambia
   * nada. Cada cambio queda en Auditoria (con DNI y licencia enmascarados).
   */
  async updateMe(actor: JwtPayload, dto: UpdateMyProfileDto) {
    const me = await this.prisma.person.findUnique({ where: { id: actor.sub } });
    if (!me) throw new NotFoundException('Persona no encontrada');

    const name = dto.name?.trim();
    const shared: { name?: string; dni?: string; phone?: string } = {};
    const changes: string[] = [];
    if (name && name !== me.name) {
      shared.name = name;
      changes.push(`Nombre: ${me.name} → ${name}`);
    }
    if (dto.dni && dto.dni !== me.dni) {
      await this.assertDniFree(me.organizationId, dto.dni, me.email);
      shared.dni = dto.dni;
      changes.push(`DNI: ${maskId(me.dni)} → ${maskId(dto.dni)}`);
    }
    if (dto.phone && dto.phone !== me.phone) {
      shared.phone = dto.phone;
      changes.push(`Celular: ${me.phone ?? 'sin dato'} → ${dto.phone}`);
    }

    const licenseData: { license?: string; licenseCategory?: string; licenseIssuedAt?: Date; licenseExpiry?: Date } = {};
    const touchesLicense = Boolean(dto.license || dto.licenseCategory?.trim() || dto.licenseIssuedAt || dto.licenseExpiry);
    if (touchesLicense) {
      if (me.role !== 'CONDUCTOR') throw new BadRequestException('La licencia de conducir solo aplica a conductores.');
      const category = dto.licenseCategory?.trim() || me.licenseCategory;
      const license = dto.license || me.license;
      const issued = dto.licenseIssuedAt ? new Date(dto.licenseIssuedAt) : me.licenseIssuedAt;
      const expiry = dto.licenseExpiry ? new Date(dto.licenseExpiry) : me.licenseExpiry;
      if (!license || !category || !issued || !expiry) {
        throw new BadRequestException('Para registrar la licencia indica el número, la categoría, la fecha de emisión y el vencimiento.');
      }
      const problem = licenseDatesProblem(issued, expiry);
      if (problem) throw new BadRequestException(problem);
      if (license !== me.license) await this.assertLicenseFree(license, me.id);
      const day = (d?: Date | null) => d?.toISOString().slice(0, 10);
      if (license !== me.license || category !== me.licenseCategory || day(issued) !== day(me.licenseIssuedAt) || day(expiry) !== day(me.licenseExpiry)) {
        licenseData.license = license;
        licenseData.licenseCategory = category;
        licenseData.licenseIssuedAt = issued;
        licenseData.licenseExpiry = expiry;
        changes.push(`Licencia: ${maskId(me.license)} → ${maskId(license)} (${category}, emitida ${day(issued)}, vence ${day(expiry)})`);
      }
    }

    if (changes.length === 0) return this.findMe(me.id);

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(shared).length > 0) {
        await tx.person.updateMany({ where: { email: me.email, organizationId: me.organizationId }, data: shared });
      }
      if (Object.keys(licenseData).length > 0) {
        await tx.person.update({ where: { id: me.id }, data: licenseData });
      }
    });

    // El Super Admin no pertenece a ninguna asociacion, y la Auditoria siempre
    // es de una asociacion: en ese caso no hay donde registrarla.
    if (me.organizationId) {
      await this.prisma.auditEntry.create({
        data: {
          organizationId: me.organizationId,
          actorId: actor.sub,
          actorRole: actor.role,
          action: 'ACTUALIZAR_PERFIL',
          resource: `Persona ${shared.name ?? me.name}`,
          resourceId: me.id,
          before: 'Datos personales anteriores',
          after: changes.join(' · '),
        },
      });
    }
    return this.findMe(me.id);
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
