import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { LandingContentService } from './landing-content.service';
import { UpsertLandingSectionDto } from './dto/upsert-landing-section.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';

@Controller('landing-content')
export class LandingContentController {
  constructor(private service: LandingContentService) {}

  // Publico a proposito -- lo consume la landing publica (Landing.tsx) para
  // cualquier visitante, sin cuenta. Nunca lleva guards de auth.
  @Get()
  getAll() {
    return this.service.getAll();
  }

  // Tambien publico -- no hay nada sensible en esta tabla (es contenido de
  // landing/paginas legales, ver comentario en el service). Super Admin lo
  // usa para editar; las paginas legales publicas lo usan para mostrarse.
  @Get(':key')
  getOne(@Param('key') key: string) {
    return this.service.getOne(key);
  }

  // Solo esto -- escribir -- sigue exclusivo del Super Admin.
  @Put(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  upsert(@CurrentUser() user: JwtPayload, @Param('key') key: string, @Body() dto: UpsertLandingSectionDto) {
    return this.service.upsert(key, dto.data, user);
  }
}
