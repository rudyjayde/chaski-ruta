import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextSequenceNumber } from '../common/sequence';
import { CreateProblemDto } from './dto/create-problem.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';

// Gestion de problemas (KEDB, ITIL 4 -- OE4 tesis, 2 oct 2026). Solo Super Admin -- ver la nota en
// schema.prisma sobre por que ProblemRecord no tiene organizationId.
@Injectable()
export class ProblemsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProblemDto) {
    const code = await nextSequenceNumber(this.prisma, 'problem_records', 'code', 'PRB-', 3);
    return this.prisma.problemRecord.create({ data: { code, ...dto } });
  }

  findAll() {
    return this.prisma.problemRecord.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tickets: true } } },
    });
  }

  async findOne(id: string) {
    const problem = await this.prisma.problemRecord.findUnique({
      where: { id },
      include: { tickets: { select: { id: true, code: true, subject: true, status: true, priority: true, organizationId: true } } },
    });
    if (!problem) throw new NotFoundException('Problema no encontrado.');
    return problem;
  }

  async update(id: string, dto: UpdateProblemDto) {
    const exists = await this.prisma.problemRecord.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Problema no encontrado.');
    return this.prisma.problemRecord.update({ where: { id }, data: dto });
  }
}
