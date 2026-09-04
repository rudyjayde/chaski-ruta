import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
      include: { actor: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }
}
