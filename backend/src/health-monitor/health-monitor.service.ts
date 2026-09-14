import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { HealthCheckService, HealthCheckStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GpsService } from '../gps/gps.service';
import { UploadsService } from '../uploads/uploads.service';

// Salud tecnica REAL de la propia infraestructura de CHASKI AI (12 sept 2026,
// decidido con Jayde) -- reemplaza la pantalla "Salud tecnica" que antes
// mostraba 5 numeros escritos a mano (siempre "OK", nunca reflejaba una
// falla real). Un cron corre cada 5 minutos, guarda un HealthCheckLog por
// servicio, y "Salud tecnica" lee ese historial para mostrar estado actual +
// uptime 30d + una tira de los ultimos chequeos.
const DB_DEGRADED_MS = 500;
const TRACCAR_DEGRADED_MS = 2000;
const RESEND_DEGRADED_MS = 1500;
const CLOUDINARY_DEGRADED_MS = 1500;
const HISTORY_POINTS = 48; // ultimos 48 chequeos (~4h a cada 5 min)
const RETENTION_DAYS = 35; // 30d de uptime + margen

@Injectable()
export class HealthMonitorService {
  private readonly logger = new Logger(HealthMonitorService.name);

  constructor(
    private prisma: PrismaService,
    private gps: GpsService,
    private uploads: UploadsService,
    private config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runChecks() {
    const [db, traccar, notifications, cloudinary, assistant] = await Promise.all([
      this.checkDatabase(),
      this.checkTraccar(),
      this.checkNotifications(),
      this.checkCloudinary(),
      this.checkAssistant(),
    ]);

    await this.prisma.healthCheckLog.createMany({
      data: [
        { service: 'BASE_DE_DATOS', ...db },
        { service: 'TRACCAR', ...traccar },
        { service: 'NOTIFICACIONES', ...notifications },
        { service: 'CLOUDINARY', ...cloudinary },
        { service: 'ASISTENTE_IA', ...assistant },
      ],
    });
  }

  // Limpieza diaria (12 sept 2026): solo se necesitan 30 dias para el
  // calculo de uptime -- sin esto la tabla crece sin limite para siempre.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.healthCheckLog.deleteMany({ where: { checkedAt: { lt: cutoff } } });
    if (count > 0) this.logger.log(`Limpieza de HealthCheckLog: ${count} filas antiguas eliminadas.`);
  }

  private async checkDatabase(): Promise<{ status: HealthCheckStatus; latencyMs: number; errorMessage: string | null }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;
      return { status: this.classify(latencyMs, DB_DEGRADED_MS), latencyMs, errorMessage: null };
    } catch (err) {
      return { status: 'CAIDO', latencyMs: Date.now() - start, errorMessage: err instanceof Error ? err.message : String(err) };
    }
  }

  private async checkTraccar(): Promise<{ status: HealthCheckStatus; latencyMs: number; errorMessage: string | null }> {
    const result = await this.gps.checkHealth();
    if (!result.ok) return { status: 'CAIDO', latencyMs: result.latencyMs, errorMessage: result.error ?? null };
    return { status: this.classify(result.latencyMs, TRACCAR_DEGRADED_MS), latencyMs: result.latencyMs, errorMessage: null };
  }

  // Resend no tiene un endpoint "health" dedicado -- GET /api-keys es liviano
  // y ademas confirma que la clave configurada de verdad autentica, no solo
  // que la variable de entorno existe.
  private async checkNotifications(): Promise<{ status: HealthCheckStatus; latencyMs: number; errorMessage: string | null }> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      return { status: 'DEGRADADO', latencyMs: 0, errorMessage: 'RESEND_API_KEY no configurada -- los correos no se envian (se registran en el log).' };
    }
    const start = Date.now();
    try {
      const res = await fetch('https://api.resend.com/api-keys', { headers: { Authorization: `Bearer ${apiKey}` } });
      const latencyMs = Date.now() - start;
      if (!res.ok) return { status: 'CAIDO', latencyMs, errorMessage: `Resend respondio ${res.status} al validar la clave.` };
      return { status: this.classify(latencyMs, RESEND_DEGRADED_MS), latencyMs, errorMessage: null };
    } catch (err) {
      return { status: 'CAIDO', latencyMs: Date.now() - start, errorMessage: err instanceof Error ? err.message : String(err) };
    }
  }

  private async checkCloudinary(): Promise<{ status: HealthCheckStatus; latencyMs: number; errorMessage: string | null }> {
    const result = await this.uploads.checkHealth();
    if (!result.ok) return { status: 'CAIDO', latencyMs: result.latencyMs, errorMessage: result.error ?? null };
    return { status: this.classify(result.latencyMs, CLOUDINARY_DEGRADED_MS), latencyMs: result.latencyMs, errorMessage: null };
  }

  // Solo verifica que la clave este configurada -- NO hace una llamada real
  // a Claude cada 5 minutos (288 veces al dia) solo para "probar que
  // funciona": eso gastaria tokens reales sin necesidad. Decidido con Jayde.
  private checkAssistant(): { status: HealthCheckStatus; latencyMs: number; errorMessage: string | null } {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return { status: 'DEGRADADO', latencyMs: 0, errorMessage: 'ANTHROPIC_API_KEY no configurada -- Asistente AI, resumen del dia y digitalizacion asistida no disponibles.' };
    }
    return { status: 'OK', latencyMs: 0, errorMessage: null };
  }

  // CAIDO se reserva para errores reales (excepcion, servidor no responde) --
  // una respuesta lenta pero exitosa nunca se marca como caida, solo como
  // degradada. Nunca inventamos un tercer umbral de "muy lento = caido".
  private classify(latencyMs: number, degradedAt: number): HealthCheckStatus {
    return latencyMs >= degradedAt ? 'DEGRADADO' : 'OK';
  }

  /**
   * Estado consolidado para la pantalla "Salud tecnica" de Super Admin: por
   * cada servicio, el ultimo chequeo real, el % de uptime de los ultimos 30
   * dias (CAIDO cuenta como caido, DEGRADADO cuenta como arriba -- respondio,
   * solo lento), y los ultimos HISTORY_POINTS chequeos para la tira visual.
   */
  async getStatus() {
    const services: HealthCheckService[] = ['BASE_DE_DATOS', 'TRACCAR', 'NOTIFICACIONES', 'CLOUDINARY', 'ASISTENTE_IA'];
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const results = await Promise.all(
      services.map(async (service) => {
        const [latest, history, total30d, down30d] = await Promise.all([
          this.prisma.healthCheckLog.findFirst({ where: { service }, orderBy: { checkedAt: 'desc' } }),
          this.prisma.healthCheckLog.findMany({ where: { service }, orderBy: { checkedAt: 'desc' }, take: HISTORY_POINTS }),
          this.prisma.healthCheckLog.count({ where: { service, checkedAt: { gte: since30d } } }),
          this.prisma.healthCheckLog.count({ where: { service, checkedAt: { gte: since30d }, status: 'CAIDO' } }),
        ]);
        return {
          service,
          status: latest?.status ?? null,
          latencyMs: latest?.latencyMs ?? null,
          errorMessage: latest?.errorMessage ?? null,
          checkedAt: latest?.checkedAt ?? null,
          uptime30d: total30d === 0 ? null : Math.round(((total30d - down30d) / total30d) * 1000) / 10,
          history: history.reverse().map((h) => ({ status: h.status, checkedAt: h.checkedAt })),
        };
      }),
    );

    return results;
  }
}
