import { Body, Controller, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MobileAuthService } from './mobile-auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from './jwt.strategy';
import {
  MobileGoogleLoginDto,
  MobilePasswordLoginDto,
  MobilePushTokenDto,
  MobileRefreshDto,
  MobileSelectProfileDto,
} from './dto/mobile-auth.dto';

// Inicio de sesion de la app nativa. La web sigue usando /auth/google y /auth/login.
// Si la respuesta trae selectToken, la app lista los perfiles con GET /auth/profiles
// (el mismo de la web) y luego llama a /auth/mobile/select-profile.
@Controller('auth/mobile')
export class MobileAuthController {
  constructor(private mobileAuth: MobileAuthService) {}

  @Post('google')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  google(@Body() dto: MobileGoogleLoginDto) {
    return this.mobileAuth.loginWithGoogle(dto.idToken, dto);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  login(@Body() dto: MobilePasswordLoginDto) {
    return this.mobileAuth.loginWithPassword(dto.email, dto.password, dto);
  }

  @Post('select-profile')
  @HttpCode(200)
  selectProfile(@Body() dto: MobileSelectProfileDto) {
    return this.mobileAuth.selectProfile(dto.select, dto.personId, dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() dto: MobileRefreshDto) {
    return this.mobileAuth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: MobileRefreshDto) {
    await this.mobileAuth.logout(dto.refreshToken);
    return { ok: true };
  }

  @Put('push-token')
  @UseGuards(JwtAuthGuard)
  async pushToken(@CurrentUser() user: JwtPayload, @Body() dto: MobilePushTokenDto) {
    await this.mobileAuth.setPushToken(user, dto.pushToken);
    return { ok: true };
  }
}
