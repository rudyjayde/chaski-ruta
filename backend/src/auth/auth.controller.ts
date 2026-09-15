import { Body, Controller, ForbiddenException, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleProfile } from './google.strategy';
import { GoogleAuthGuard } from './google-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from './jwt.strategy';
import { DevLoginDto } from './dto/dev-login.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  // Paso 1: el navegador entra aqui y Passport lo redirige a la pantalla de Google.
  // ?flow=landing (boton de la landing publica) vs sin flow (login interno
  // /ingresar) viaja de ida y vuelta en el `state` de OAuth -- ver GoogleAuthGuard.
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // Nunca se ejecuta: GoogleAuthGuard intercepta y redirige antes.
  }

  // Paso 2: Google redirige de vuelta aqui despues de que la persona inicia sesion.
  // Si el correo tiene una sola cuenta, entra directo (?token=). Si tiene mas de
  // una (Socio + Conductor), en vez de token se manda un selectToken corto para
  // que el frontend muestre "¿A cual panel quieres entrar?" antes de dar acceso.
  //
  // Landing (?flow=landing en el paso 1, devuelto por Google como state) usa una
  // version distinta que NUNCA rechaza un correo desconocido -- lo convierte en
  // visitante (?visitorToken=) en vez de dar error, porque cualquiera puede
  // entrar por la landing. El login interno (sin flow) mantiene el rechazo claro
  // de siempre para alguien que se equivoco de correo.
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const googleProfile = req.user as GoogleProfile;
    const fromLanding = req.query.state === 'landing';
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const flowSuffix = fromLanding ? '&flow=landing' : '';

    const result = fromLanding
      ? await this.authService.loginOrCreateVisitorWithGoogle(googleProfile)
      : await this.authService.loginWithGoogle(googleProfile);

    if ('visitorToken' in result) {
      res.redirect(`${frontendUrl}/auth/callback?visitorToken=${result.visitorToken}${flowSuffix}`);
      return;
    }
    if ('selectToken' in result) {
      res.redirect(`${frontendUrl}/auth/callback?select=${result.selectToken}${flowSuffix}`);
      return;
    }
    // El frontend debe tener una ruta /auth/callback que lea ?token= y lo guarde.
    res.redirect(`${frontendUrl}/auth/callback?token=${result.accessToken}${flowSuffix}`);
  }

  // Lista los paneles disponibles para el selectToken emitido arriba.
  @Get('profiles')
  async profiles(@Query('select') select: string) {
    return this.authService.getProfileOptions(select);
  }

  // La persona ya eligio a cual de sus cuentas quiere entrar: recien aqui se
  // emite el JWT de sesion real, igual que en el flujo de una sola cuenta.
  @Post('select-profile')
  async selectProfile(@Body() body: { select: string; personId: string }) {
    return this.authService.selectProfile(body.select, body.personId);
  }

  // Para que el frontend arme la sesion completa (nombre, asociacion) a partir del JWT ya emitido.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }

  // Login alternativo por correo + contraseña (ver AuthService.loginWithPassword).
  // Limite propio, mas estricto que el default global (13 sept 2026, auditoria
  // de seguridad): sin esto, alguien podia probar contraseñas sin limite por
  // segundo contra una cuenta.
  @Post('login')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async login(@Body() dto: LoginDto) {
    return this.authService.loginWithPassword(dto.email, dto.password);
  }

  // Solicita el enlace para definir/restablecer contraseña. Siempre responde
  // igual exista o no la cuenta -- nunca revela si un correo esta registrado.
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.requestPasswordReset(dto.email);
    return { ok: true, message: 'Si el correo está registrado, te enviamos un enlace para continuar.' };
  }

  // Confirma el enlace enviado por correo y guarda la nueva contraseña.
  @Post('reset-password')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
    return { ok: true };
  }

  // SOLO para los agentes de prueba (conductor/admin/superadmin) en desarrollo.
  // Doble candado, los dos deben cumplirse: ALLOW_DEV_LOGIN=true en el .env de
  // este backend, y la clave enviada debe coincidir con DEV_LOGIN_SECRET. Si
  // cualquiera de los dos falta o no coincide, responde 403 sin tocar nada.
  // Nunca debe existir ALLOW_DEV_LOGIN=true en un despliegue de produccion.
  @Post('dev-login')
  async devLogin(@Body() dto: DevLoginDto) {
    const allowed = this.config.get<string>('ALLOW_DEV_LOGIN') === 'true';
    const expectedKey = this.config.get<string>('DEV_LOGIN_SECRET');
    if (!allowed || !expectedKey || dto.key !== expectedKey) {
      throw new ForbiddenException('Login de prueba deshabilitado en este entorno.');
    }
    return this.authService.devLogin(dto.email, dto.role);
  }
}
