import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CommercialRequestsService } from './commercial-requests.service';
import { CreateCommercialRequestDto } from './dto/create-commercial-request.dto';
import { MarkReviewedDto } from './dto/mark-reviewed.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';

@Controller('commercial-requests')
export class CommercialRequestsController {
  constructor(private service: CommercialRequestsService) {}

  // Publico a proposito -- lo llena un interesado que todavia no tiene
  // cuenta ni asociacion (ver Landing.tsx). Nunca lleva guards de auth.
  @Post()
  create(@Body() dto: CreateCommercialRequestDto) {
    return this.service.create(dto);
  }

  // Todo lo demas es exclusivo del Super Admin -- el interesado nunca ve
  // el listado ni el detalle de otras solicitudes.
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // Triaje automatico (ia-aplicada.md §2.1) -- resumen ejecutivo aparte del
  // detalle real (arriba), nunca lo reemplaza.
  @Get(':id/triage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  triage(@Param('id') id: string) {
    return this.service.triage(id);
  }

  // Asistente de onboarding (ia-aplicada.md §2.5) -- sugerencia para
  // pre-llenar el wizard "Nueva asociación", nunca crea nada por su cuenta.
  @Get(':id/onboarding-suggestion')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  onboardingSuggestion(@Param('id') id: string) {
    return this.service.onboardingSuggestion(id);
  }

  @Patch(':id/reviewed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  markReviewed(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: MarkReviewedDto) {
    return this.service.markReviewed(id, user, dto.notes);
  }
}
