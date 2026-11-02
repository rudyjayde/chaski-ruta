import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

// Plazo de conservacion del historial del asistente (2 nov 2026, decidido
// con Jayde): 2 meses sin uso. Ley 29733 no fija dias, pide guardar los
// datos personales solo el tiempo necesario -- y una conversacion puede
// nombrar conductores, socios o pasajeros. Se cuenta desde la ultima
// pregunta (updatedAt), no desde la creacion: una conversacion que se sigue
// usando no se borra. Los mensajes caen con ella (onDelete: Cascade).
export const ASSISTANT_RETENTION_DAYS = 60;

@Injectable()
export class AssistantRetentionService {
  private readonly logger = new Logger(AssistantRetentionService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup() {
    const cutoff = new Date(Date.now() - ASSISTANT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.assistantConversation.deleteMany({ where: { updatedAt: { lt: cutoff } } });
    if (count > 0) this.logger.log(`Historial del asistente: ${count} conversaciones con mas de ${ASSISTANT_RETENTION_DAYS} dias sin uso eliminadas.`);
  }
}
