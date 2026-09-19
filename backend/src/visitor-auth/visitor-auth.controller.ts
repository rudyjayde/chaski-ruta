import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { VisitorAuthService } from './visitor-auth.service';
import { RegisterVisitorDto } from './dto/register-visitor.dto';
import { LoginVisitorDto } from './dto/login-visitor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';

// Cuentas de visitante de la landing publica -- SEPARADAS de Person/Organization
// (ver WebVisitor en schema.prisma). Publico a proposito: cualquiera puede
// registrarse, esto NUNCA da acceso al panel operativo de una asociacion.
@Controller('visitor-auth')
export class VisitorAuthController {
  constructor(private visitorAuth: VisitorAuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  async register(@Body() dto: RegisterVisitorDto) {
    // Campo trampa anti-robots: se descarta en silencio (sin token real).
    if (dto.website?.trim()) return { token: '' };
    return this.visitorAuth.register(dto.email, dto.password, dto.name);
  }

  @Post('login')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async login(@Body() dto: LoginVisitorDto) {
    return this.visitorAuth.login(dto.email, dto.password);
  }

  // JwtAuthGuard solo valida que el token este bien firmado -- por eso se
  // verifica aqui adentro que de verdad sea un token de VISITOR (no un token
  // real de Person) antes de buscar en WebVisitor.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: JwtPayload) {
    if (user.role !== 'VISITOR') return null;
    return this.visitorAuth.me(user.sub);
  }
}
