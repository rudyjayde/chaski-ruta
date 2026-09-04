import { Body, Controller, ForbiddenException, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleProfile } from './google.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from './jwt.strategy';
import { DevLoginDto } from './dto/dev-login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  // Paso 1: el navegador entra aqui y Passport lo redirige a la pantalla de Google.
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Nunca se ejecuta: AuthGuard('google') intercepta y redirige antes.
  }

  // Paso 2: Google redirige de vuelta aqui despues de que la persona inicia sesion.
  // Si el correo tiene una sola cuenta, entra directo (?token=). Si tiene mas de
  // una (Socio + Conductor), en vez de token se manda un selectToken corto para
  // que el frontend muestre "¿A cual panel quieres entrar?" antes de dar acceso.
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const googleProfile = req.user as GoogleProfile;
    const result = await this.authService.loginWithGoogle(googleProfile);

    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    if ('selectToken' in result) {
      res.redirect(`${frontendUrl}/auth/callback?select=${result.selectToken}`);
      return;
    }
    // El frontend debe tener una ruta /auth/callback que lea ?token= y lo guarde.
    res.redirect(`${frontendUrl}/auth/callback?token=${result.accessToken}`);
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
