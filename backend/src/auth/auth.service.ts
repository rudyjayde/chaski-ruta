import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleProfile } from './google.strategy';
import { JwtPayload } from './jwt.strategy';

/** Payload del token corto de "elige tu panel" — nunca sirve para llamar rutas protegidas normales. */
interface SelectTokenPayload {
  purpose: 'select-profile';
  email: string;
  googleId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
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
