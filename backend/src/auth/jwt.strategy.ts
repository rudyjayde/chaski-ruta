import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string; // Person.id
  organizationId: string | null;
  role: string;
  email: string;
}

const DEFAULT_STATUS_CACHE_MS = 30_000;
const MAX_CACHE_ENTRIES = 5_000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  // Estado de la persona por id, recordado unos segundos para no consultar la base en cada peticion.
  private readonly statusCache = new Map<string, { allowed: boolean; expiresAt: number }>();
  private readonly cacheMs: number;

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
    const configured = Number(config.get<string>('JWT_STATUS_CACHE_MS'));
    this.cacheMs = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_STATUS_CACHE_MS;
  }

  // Lo que retorna aqui queda disponible como req.user en cualquier ruta protegida.
  //
  // El token dura dias, asi que firmar bien no basta: si a la persona se le da de baja, se le elimina o
  // se elimina su asociacion, la sesion que ya tenia abierta debe dejar de servir de inmediato (a lo
  // mas, lo que dure la memoria de arriba), no cuando venza el token.
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Visitantes de la landing publica: no son Person, su sesion no depende de una asociacion.
    if (payload.role === 'VISITOR') return payload;

    // Los demas tokens firmados con el mismo secreto (elegir panel, restablecer contrasena) no
    // son sesiones y nunca deben abrir una ruta protegida.
    if (!payload.sub || !payload.role) {
      throw new UnauthorizedException('Sesion invalida. Vuelve a iniciar sesion.');
    }

    if (!(await this.isStillAllowed(payload.sub))) {
      throw new UnauthorizedException('Tu cuenta ya no tiene acceso. Contacta a tu administrador.');
    }
    return payload;
  }

  private async isStillAllowed(personId: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.statusCache.get(personId);
    if (cached && cached.expiresAt > now) return cached.allowed;

    // Mismas reglas que el inicio de sesion: SUSPENDIDO y ELIMINADO no entran; una asociacion
    // eliminada tampoco.
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { status: true, organization: { select: { status: true } } },
    });
    const allowed =
      !!person &&
      person.status !== 'SUSPENDIDO' &&
      person.status !== 'ELIMINADO' &&
      person.organization?.status !== 'ELIMINADA';

    if (this.cacheMs > 0) {
      if (this.statusCache.size >= MAX_CACHE_ENTRIES) this.statusCache.clear();
      this.statusCache.set(personId, { allowed, expiresAt: now + this.cacheMs });
    }
    return allowed;
  }
}
