import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';

// Solo lectura: el registro de auditoria se escribe desde cada modulo que hace
// la excepcion/cambio (queues, trips, vehicles, relocations, manifests) — nunca
// se crea a mano desde aqui.
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  @Roles('ADMINISTRADOR', 'SUPERADMIN')
  findMany(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    return this.audit.findMany(orgId);
  }

  // Panel SaaS de Super Admin (fuera del modo "entrar como administrador"):
  // auditoria de TODAS las asociaciones a la vez, no de una sola.
  @Get('all')
  @Roles('SUPERADMIN')
  findAllAcrossOrgs() {
    return this.audit.findAllAcrossOrgs();
  }
}
