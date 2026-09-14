import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DigestService } from './digest.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

@Controller('digest')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DigestController {
  constructor(private digest: DigestService) {}

  // Solo administrador (gerente) y Super Admin -- es un resumen gerencial,
  // no algo que necesite ver socio o conductor.
  @Get('today')
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  async today(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    const facts = await this.digest.computeFacts(orgId);
    const summary = await this.digest.writeSummary(facts);
    return { facts, summary };
  }
}
