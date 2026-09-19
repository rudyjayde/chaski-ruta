import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ComplaintBookService } from './complaint-book.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { RespondComplaintDto } from './dto/respond-complaint.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('complaint-book')
export class ComplaintBookController {
  constructor(private service: ComplaintBookService) {}

  // Publico a proposito -- es el Libro de Reclamaciones virtual, lo llena
  // cualquier persona sin cuenta (docs: requisito legal INDECOPI). Nunca
  // lleva guards de auth.
  @Post()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  create(@Body() dto: CreateComplaintDto) {
    return this.service.create(dto);
  }

  // Todo lo demas es exclusivo del Super Admin -- ver y responder reclamos.
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

  @Patch(':id/respond')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  respond(@Param('id') id: string, @Body() dto: RespondComplaintDto) {
    return this.service.respond(id, dto.providerResponse);
  }
}
