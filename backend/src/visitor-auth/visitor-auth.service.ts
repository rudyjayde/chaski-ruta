import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

// Payload distinto al de una sesion real (JwtPayload en jwt.strategy.ts):
// role: 'VISITOR' nunca coincide con ningun rol real (ADMINISTRADOR/SOCIO/
// CONDUCTOR/SUPERADMIN), asi que @Roles(...) en cualquier endpoint real
// rechaza este token automaticamente -- nunca puede usarse para entrar al
// panel operativo, solo para /visitor-auth/me.
export interface VisitorJwtPayload {
  sub: string; // WebVisitor.id
  role: 'VISITOR';
  email: string;
}

@Injectable()
export class VisitorAuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(email: string, password: string, name?: string) {
    const normalized = email.toLowerCase().trim();
    const existing = await this.prisma.webVisitor.findUnique({ where: { email: normalized } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese correo. Inicia sesión en vez de registrarte.');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const visitor = await this.prisma.webVisitor.create({ data: { email: normalized, name, passwordHash } });
    return { token: this.issueToken(visitor) };
  }

  async login(email: string, password: string) {
    const normalized = email.toLowerCase().trim();
    const visitor = await this.prisma.webVisitor.findUnique({ where: { email: normalized } });
    if (!visitor?.passwordHash || !(await bcrypt.compare(password, visitor.passwordHash))) {
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }
    return { token: this.issueToken(visitor) };
  }

  // Usado desde AuthService cuando alguien entra por Google desde la landing
  // y su correo NO coincide con ningun Person real -- Google ya verifico el
  // correo, asi que no hace falta contraseña para esta cuenta de visitante.
  async findOrCreateByGoogle(email: string, name: string | undefined, googleId: string) {
    const normalized = email.toLowerCase().trim();
    const existing = await this.prisma.webVisitor.findUnique({ where: { email: normalized } });
    if (existing) {
      if (!existing.googleId) {
        return this.prisma.webVisitor.update({ where: { id: existing.id }, data: { googleId } });
      }
      return existing;
    }
    return this.prisma.webVisitor.create({ data: { email: normalized, name, googleId } });
  }

  issueToken(visitor: { id: string; email: string }): string {
    const payload: VisitorJwtPayload = { sub: visitor.id, role: 'VISITOR', email: visitor.email };
    return this.jwt.sign(payload);
  }

  // Solo lo que un visitante puede ver de si mismo: sus propias Solicitudes
  // comerciales (por correo) -- nunca datos de otro visitante, nunca `notes`
  // interno de Super Admin (query select explicito, sin ese campo).
  async me(visitorId: string) {
    const visitor = await this.prisma.webVisitor.findUnique({ where: { id: visitorId } });
    if (!visitor) return null;

    const commercialRequests = await this.prisma.commercialRequest.findMany({
      where: { contactEmail: visitor.email },
      orderBy: { createdAt: 'desc' },
      select: { id: true, solution: true, status: true, orgName: true, createdAt: true },
    });

    return {
      id: visitor.id,
      email: visitor.email,
      name: visitor.name,
      commercialRequests,
    };
  }
}
