import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleProfile } from './google.strategy';
import { JwtPayload } from './jwt.strategy';
import { VisitorAuthService } from '../visitor-auth/visitor-auth.service';
import { MailService } from '../mail/mail.service';

/**
 * Payload del token corto de "elige tu panel" — nunca sirve para llamar rutas
 * protegidas normales. `googleId` solo viaja cuando el login vino de Google
 * (para que selectProfile() sepa si debe marcar la identidad de Google); un
 * login por contraseña lo omite, ya que loginWithPassword() ya verifico la
 * contraseña antes de emitir este token.
 */
interface SelectTokenPayload {
  purpose: 'select-profile';
  email: string;
  googleId?: string;
}

/** Token corto de "restablecer contraseña" enviado por correo — nunca sirve para nada mas. */
interface ResetTokenPayload {
  purpose: 'reset-password';
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private visitorAuth: VisitorAuthService,
    private mail: MailService,
  ) {}

  /**
   * Regla de negocio clave: aqui NUNCA se crea una cuenta nueva.
   * La persona (gerente/socio/conductor) tiene que existir de antemano en la tabla
   * `people`, creada por un Super Admin o Administrador (flujo de invitacion —
   * ver docs/planes/arquitectura-tecnica.md §4). Google solo confirma que quien
   * esta del otro lado es dueno real de ese correo; nunca es la fuente de la cuenta.
   *
   * Desde agosto 2026, un mismo correo puede tener hasta 2 cuentas (una Socio,
   * una Conductor — nunca dos con el mismo rol). Si hay mas de una cuenta activa
   * para este correo, no se entra directo: se devuelve un selectToken de corta
   * duracion para que el frontend muestre "¿A cual panel quieres entrar?" antes
   * de emitir el JWT de sesion real (ver selectProfile).
   */
  async loginWithGoogle(google: GoogleProfile): Promise<
    | { accessToken: string; person: JwtPayload }
    | { selectToken: string }
  > {
    if (!google.emailVerified) {
      throw new UnauthorizedException('Google no pudo verificar este correo');
    }

    const matches = await this.prisma.person.findMany({
      where: { email: google.email },
    });

    if (matches.length === 0) {
      throw new UnauthorizedException(
        'Este correo no esta registrado en ninguna asociacion. Pide a tu administrador que te invite primero.',
      );
    }

    const usable = matches.filter((p) => p.status !== 'SUSPENDIDO');
    if (usable.length === 0) {
      throw new UnauthorizedException('Tu cuenta esta suspendida. Contacta a tu administrador.');
    }

    if (usable.length === 1) {
      const updated = await this.activateAndIssue(usable[0].id, google.googleId);
      return updated;
    }

    // Mas de una cuenta activa para este correo (Socio + Conductor, tipicamente).
    const selectToken = this.jwt.sign(
      { purpose: 'select-profile', email: google.email, googleId: google.googleId } satisfies SelectTokenPayload,
      { expiresIn: '10m' },
    );
    return { selectToken };
  }

  /**
   * Version del login de Google usada SOLO desde el boton de la landing
   * publica (nunca desde el login interno /ingresar): si el correo YA es un
   * Person real, entra exactamente igual que loginWithGoogle(). Si NO
   * coincide con nadie, en vez de rechazarlo lo convierte en una cuenta de
   * visitante (WebVisitor) -- Google ya verifico el correo, asi que no hace
   * falta contraseña para esta cuenta de bajo riesgo. Nunca al reves: un
   * visitante con solo correo+contraseña jamas llega a esta funcion ni
   * obtiene una sesion real (ver WebVisitor en schema.prisma).
   */
  async loginOrCreateVisitorWithGoogle(google: GoogleProfile): Promise<
    | { accessToken: string; person: JwtPayload }
    | { selectToken: string }
    | { visitorToken: string }
  > {
    if (!google.emailVerified) {
      throw new UnauthorizedException('Google no pudo verificar este correo');
    }

    const matches = await this.prisma.person.findMany({ where: { email: google.email } });
    const usable = matches.filter((p) => p.status !== 'SUSPENDIDO');

    if (usable.length === 1) {
      return this.activateAndIssue(usable[0].id, google.googleId);
    }
    if (usable.length > 1) {
      const selectToken = this.jwt.sign(
        { purpose: 'select-profile', email: google.email, googleId: google.googleId } satisfies SelectTokenPayload,
        { expiresIn: '10m' },
      );
      return { selectToken };
    }

    const visitor = await this.visitorAuth.findOrCreateByGoogle(google.email, google.name, google.googleId);
    return { visitorToken: this.visitorAuth.issueToken(visitor) };
  }

  /**
   * Perfiles disponibles para un selectToken — alimenta la pantalla
   * "¿A cual panel quieres entrar?" sin exponer nada sensible todavia
   * (no emite JWT de sesion hasta que se elija uno, ver selectProfile).
   */
  async getProfileOptions(selectToken: string) {
    const payload = this.verifySelectToken(selectToken);
    const people = await this.prisma.person.findMany({
      where: { email: payload.email },
      include: { organization: true },
    });
    return people
      .filter((p) => p.status !== 'SUSPENDIDO')
      .map((p) => ({
        id: p.id,
        role: p.role,
        name: p.name,
        company: p.company,
        organizationName: p.organization?.name ?? null,
      }));
  }

  /** Confirma cual de las cuentas eligio la persona y recien ahi emite el JWT de sesion real. */
  async selectProfile(selectToken: string, personId: string) {
    const payload = this.verifySelectToken(selectToken);
    const person = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!person || person.email !== payload.email) {
      throw new UnauthorizedException('Ese perfil no corresponde a este correo. Vuelve a iniciar sesion.');
    }
    if (person.status === 'SUSPENDIDO') {
      throw new UnauthorizedException('Tu cuenta esta suspendida. Contacta a tu administrador.');
    }
    // Sin googleId: vino de un login por contraseña (loginWithPassword ya la
    // verifico), aqui solo se emite el JWT de sesion -- nunca se toca el
    // estado de verificacion de Google de la cuenta.
    if (!payload.googleId) {
      return this.issueToken(person);
    }
    return this.activateAndIssue(person.id, payload.googleId);
  }

  private verifySelectToken(selectToken: string): SelectTokenPayload {
    let payload: SelectTokenPayload;
    try {
      payload = this.jwt.verify<SelectTokenPayload>(selectToken);
    } catch {
      throw new UnauthorizedException('El enlace de seleccion de cuenta expiro o es invalido. Vuelve a iniciar sesion.');
    }
    if (payload.purpose !== 'select-profile') {
      throw new UnauthorizedException('Enlace de seleccion de cuenta invalido.');
    }
    return payload;
  }

  /**
   * Login real por correo + contraseña (alternativa a Google, decision de
   * producto sept-2026). La contraseña es POR CORREO: si el correo tiene 2
   * cuentas (Socio + Conductor), ambas comparten el mismo hash (ver
   * resetPassword), asi que basta verificarla contra cualquiera de las filas
   * que ya tenga una. Igual que loginWithGoogle, si hay mas de una cuenta
   * usable se devuelve un selectToken para elegir panel antes de emitir sesion.
   */
  async loginWithPassword(email: string, password: string): Promise<
    | { accessToken: string; person: JwtPayload }
    | { selectToken: string }
  > {
    const normalized = email.trim().toLowerCase();
    const matches = await this.prisma.person.findMany({
      where: { email: normalized, status: { not: 'SUSPENDIDO' } },
    });
    const withPassword = matches.filter((p) => p.passwordHash);
    const reference = withPassword[0];
    if (!reference || !(await bcrypt.compare(password, reference.passwordHash!))) {
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    if (withPassword.length === 1) {
      return this.issueToken(reference);
    }
    const selectToken = this.jwt.sign(
      { purpose: 'select-profile', email: normalized } satisfies SelectTokenPayload,
      { expiresIn: '10m' },
    );
    return { selectToken };
  }

  /**
   * Solicita restablecer contraseña. Best-effort y NUNCA revela si el correo
   * existe o no (evita enumeracion de cuentas reales) -- siempre responde
   * igual del lado del controller, exista o no la cuenta.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const person = await this.prisma.person.findFirst({
      where: { email: normalized, status: { not: 'SUSPENDIDO' } },
    });
    if (!person) return;

    const token = this.jwt.sign(
      { purpose: 'reset-password', email: normalized } satisfies ResetTokenPayload,
      { expiresIn: '30m' },
    );
    await this.mail.sendPasswordResetEmail({ to: normalized, name: person.name, token });
  }

  /**
   * Confirma el enlace de restablecimiento y guarda la nueva contraseña.
   * Se aplica a TODAS las cuentas (filas de Person) de ese correo a la vez
   * -- ver comentario de passwordHash en schema.prisma -- y de paso activa
   * cualquiera que siguiera PENDIENTE (ya demostro ser dueña del correo).
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const payload = this.verifyResetToken(token);
    const people = await this.prisma.person.findMany({
      where: { email: payload.email, status: { not: 'SUSPENDIDO' } },
    });
    if (people.length === 0) {
      throw new UnauthorizedException('No se encontro una cuenta activa para este enlace.');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.person.updateMany({
      where: { email: payload.email, status: { not: 'SUSPENDIDO' } },
      data: { passwordHash, status: 'ACTIVO' },
    });
  }

  private verifyResetToken(token: string): ResetTokenPayload {
    let payload: ResetTokenPayload;
    try {
      payload = this.jwt.verify<ResetTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('El enlace para restablecer tu contraseña expiro o es invalido. Solicita uno nuevo.');
    }
    if (payload.purpose !== 'reset-password') {
      throw new UnauthorizedException('Enlace de restablecimiento invalido.');
    }
    return payload;
  }

  private async activateAndIssue(personId: string, googleId: string) {
    const person = await this.prisma.person.findUniqueOrThrow({ where: { id: personId } });
    const updated = await this.prisma.person.update({
      where: { id: personId },
      data: {
        googleId,
        googleEmailVerifiedAt: new Date(),
        // Primera vez que confirma su correo con Google: pasa de PENDIENTE a ACTIVO.
        status: person.status === 'PENDIENTE' ? 'ACTIVO' : person.status,
      },
    });
    return this.issueToken(updated);
  }

  issueToken(person: {
    id: string;
    organizationId: string | null;
    role: string;
    email: string;
  }) {
    const payload: JwtPayload = {
      sub: person.id,
      organizationId: person.organizationId,
      role: person.role,
      email: person.email,
    };
    return {
      accessToken: this.jwt.sign(payload),
      person: payload,
    };
  }

  /**
   * SOLO para agentes de prueba en desarrollo (Task: "agentes de prueba
   * conductor/admin/superadmin"). Nunca crea cuentas ni toca Google: busca una
   * Person YA sembrada (prisma/seed.ts) por email+rol y emite un JWT real con
   * el mismo issueToken() que usa el login de Google — misma firma, mismo
   * aislamiento por organizationId, cero logica de autenticacion duplicada.
   * El gateo (ALLOW_DEV_LOGIN + DEV_LOGIN_SECRET) vive en el controller.
   */
  async devLogin(email: string, role: string) {
    const person = await this.prisma.person.findFirst({ where: { email, role: role as never } });
    if (!person) {
      throw new NotFoundException(
        `No existe una persona de prueba con correo "${email}" y rol ${role}. Siembrala primero en prisma/seed.ts.`,
      );
    }
    if (person.status === 'SUSPENDIDO') {
      throw new UnauthorizedException('Esa cuenta de prueba esta suspendida.');
    }
    return this.issueToken(person);
  }

  /**
   * Perfil completo para que el frontend arme la sesion (nombre, asociacion) —
   * el JWT solo trae el payload minimo (sub/organizationId/role/email).
   */
  async getProfile(personId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: { organization: true },
    });

    if (!person) {
      throw new NotFoundException('Persona no encontrada');
    }

    return {
      id: person.id,
      email: person.email,
      name: person.name,
      role: person.role,
      organizationId: person.organizationId,
      organizationName: person.organization?.name ?? null,
      code: person.code,
      company: person.company,
    };
  }
}
