import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProblemsService } from './problems.service';
import { CreateProblemDto } from './dto/create-problem.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

// Pantalla "Problemas" (KEDB) de Super Admin -- solo el (OE4 tesis, 2 oct 2026).
@Controller('problems')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPERADMIN')
export class ProblemsController {
  constructor(private problems: ProblemsService) {}

  @Post()
  create(@Body() dto: CreateProblemDto) {
    return this.problems.create(dto);
  }

  @Get()
  findAll() {
    return this.problems.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.problems.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProblemDto) {
    return this.problems.update(id, dto);
  }
}
