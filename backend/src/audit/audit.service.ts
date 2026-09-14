import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// El hash de la contraseña NUNCA debe llegar al navegador (mismo criterio
// que people.service.ts / vehicles.service.ts) -- select explicito en vez
// de "actor: true".
const PERSON_NAME_SELECT = { id: true, name: true } as const;

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // Ultimos 500 registros de la asociacion, mas reciente primero. El propio
  // AuditEntry.actorRole ya guarda el rol al momento del hecho (no cambia si
  // la persona cambia de rol despues), asi que no hace falta mas que el include
  // de actor para el nombre.
  findMany(organizationId: string) {
    return this.prisma.auditEntry.findMany({
      where: { organizationId },
      include: { actor: { select: PERSON_NAME_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  // Vista cross-organizacion, exclusiva de Super Admin (panel SaaS) -- mismos
  // 500 registros mas recientes, pero de TODAS las asociaciones a la vez.
  findAllAcrossOrgs() {
    return this.prisma.auditEntry.findMany({
      include: { actor: { select: PERSON_NAME_SELECT }, organization: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }
}
