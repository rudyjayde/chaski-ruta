import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { JwtPayload } from './jwt.strategy';
import { MobileDeviceDto } from './dto/mobile-auth.dto';

const DEFAULT_ACCESS_TTL = '1h';
const DEFAULT_REFRESH_DAYS = 60;

type LoginResult = { accessToken: string; person: JwtPayload } | { selectToken: string };

export type MobileLoginResult =
  | { accessToken: string; refreshToken: string; person: JwtPayload }
  | { selectToken: string };

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const newRefreshToken = () => randomBytes(48).toString('base64url');

/**
 * Inicio de sesion de la app nativa (Flutter). Reutiliza las mismas reglas de
 * AuthService (cuentas invitadas, nunca se crea una cuenta, elegir perfil si el
 * correo tiene Socio + Conductor) y solo agrega lo propio del celular:
 *
 * - Token de acceso corto (1 h) + token de renovacion de 60 dias que rota en
 *   cada uso; la app no vuelve a pedir contraseña mientras se use.
 * - El identificador de instalacion queda firmado en el JWT (did): el servidor
 *   ya no depende del user-agent para saber que la inscripcion viene del celular.
 * - Una sesion por persona e instalacion: volver a entrar desde el mismo
 *   celular cierra la anterior.
 */
@Injectable()
export class MobileAuthService {
  private readonly google = new OAuth2Client();
  private readonly googleAudiences: string[];
  private readonly accessTtl: string;
  private readonly refreshDays: number;

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    private auth: AuthService,
  ) {
    // Google Sign-In nativo firma el idToken para el client ID "web" que la app
    // declara como serverClientId; en iOS puede venir el client ID de iOS.
    this.googleAudiences = (config.get<string>('GOOGLE_MOBILE_AUDIENCES') ?? config.get<string>('GOOGLE_CLIENT_ID') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    this.accessTtl = config.get<string>('MOBILE_ACCESS_TOKEN_TTL') ?? DEFAULT_ACCESS_TTL;
    const days = Number(config.get<string>('MOBILE_REFRESH_DAYS'));
    this.refreshDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_REFRESH_DAYS;
  }

  async loginWithGoogle(idToken: string, device: MobileDeviceDto): Promise<MobileLoginResult> {
    if (this.googleAudiences.length === 0) {
      throw new BadRequestException('El inicio de sesion con Google para la app no esta configurado.');
    }
    let payload;
    try {
      const ticket = await this.google.verifyIdToken({ idToken, audience: this.googleAudiences });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Google no pudo confirmar tu cuenta. Vuelve a intentarlo.');
    }
    if (!payload?.email || !payload.sub) {
      throw new UnauthorizedException('Google no devolvio un correo verificable');
    }
    const result = await this.auth.loginWithGoogle({
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name ?? payload.email,
      emailVerified: payload.email_verified === true,
    });
    return this.finish(result, device);
  }

  async loginWithPassword(email: string, password: string, device: MobileDeviceDto): Promise<MobileLoginResult> {
    return this.finish(await this.auth.loginWithPassword(email, password), device);
  }

  async selectProfile(select: string, personId: string, device: MobileDeviceDto): Promise<MobileLoginResult> {
    return this.finish(await this.auth.selectProfile(select, personId), device);
  }

  /** Cambia el token de renovacion por uno nuevo y emite un acceso nuevo. El anterior deja de servir. */
  async refresh(refreshToken: string) {
    const session = await this.prisma.mobileSession.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: { person: { include: { organization: { select: { status: true } } } } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Tu sesion expiro. Vuelve a iniciar sesion.');
    }
    const { person } = session;
    if (['SUSPENDIDO', 'ELIMINADO'].includes(person.status) || person.organization?.status === 'ELIMINADA') {
      await this.prisma.mobileSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Tu cuenta ya no tiene acceso. Contacta a tu administrador.');
    }

    const nextRefresh = newRefreshToken();
    await this.prisma.mobileSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: hashToken(nextRefresh), lastUsedAt: new Date(), expiresAt: this.refreshExpiry() },
    });
    const issued = this.auth.issueToken(person, {
      sessionId: session.id,
      deviceId: session.deviceId,
      expiresIn: this.accessTtl,
    });
    return { ...issued, refreshToken: nextRefresh };
  }

  /** Cierra la sesion de esta instalacion: deja de renovarse y de recibir push. */
  async logout(refreshToken: string) {
    await this.prisma.mobileSession.updateMany({
      where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date(), pushToken: null },
    });
  }

  async setPushToken(user: JwtPayload, pushToken: string) {
    if (!user.sid) {
      throw new BadRequestException('Solo la app puede registrar notificaciones.');
    }
    // Un celular compartido (otra persona entro antes en el mismo aparato) no
    // debe seguir recibiendo los avisos de la cuenta anterior.
    await this.prisma.$transaction([
      this.prisma.mobileSession.updateMany({
        where: { pushToken, id: { not: user.sid } },
        data: { pushToken: null },
      }),
      this.prisma.mobileSession.updateMany({
        where: { id: user.sid, personId: user.sub, revokedAt: null },
        data: { pushToken },
      }),
    ]);
  }

  private async finish(result: LoginResult, device: MobileDeviceDto): Promise<MobileLoginResult> {
    if ('selectToken' in result) return result;

    const refreshToken = newRefreshToken();
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.mobileSession.updateMany({
        where: { personId: result.person.sub, deviceId: device.deviceId, revokedAt: null },
        data: { revokedAt: new Date(), pushToken: null },
      });
      return tx.mobileSession.create({
        data: {
          personId: result.person.sub,
          refreshTokenHash: hashToken(refreshToken),
          deviceId: device.deviceId,
          platform: device.platform,
          appVersion: device.appVersion,
          expiresAt: this.refreshExpiry(),
        },
      });
    });

    const issued = this.auth.issueToken(
      {
        id: result.person.sub,
        organizationId: result.person.organizationId,
        role: result.person.role,
        email: result.person.email,
      },
      { sessionId: session.id, deviceId: device.deviceId, expiresIn: this.accessTtl },
    );
    return { ...issued, refreshToken };
  }

  private refreshExpiry() {
    return new Date(Date.now() + this.refreshDays * 24 * 60 * 60 * 1000);
  }
}
