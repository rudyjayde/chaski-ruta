import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import type { NoticeAudience, PersonRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface PushMessage {
  title: string;
  body: string;
  // La app usa `type` para decidir a que pantalla abrir al tocar la notificacion.
  data?: Record<string, string>;
}

const AUDIENCE_ROLES: Record<NoticeAudience, PersonRole[]> = {
  CONDUCTORES: ['CONDUCTOR'],
  SOCIOS: ['SOCIO'],
  AMBOS: ['CONDUCTOR', 'SOCIO'],
  ADMINISTRADORES: ['ADMINISTRADOR'],
};

const SEND_CONCURRENCY = 50;

/**
 * Notificaciones push a la app nativa (Firebase Cloud Messaging, API HTTP v1).
 * Android e iOS salen por el mismo camino: Firebase reenvia a APNs con la llave
 * de Apple configurada en la consola de Firebase.
 *
 * Sin FIREBASE_SERVICE_ACCOUNT_JSON el envio queda apagado y se avisa una vez
 * en el log -- nunca se finge que se envio. El push es siempre un extra: el
 * aviso real vive en la tabla notices y la app lo muestra igual al abrirse.
 *
 * Los metodos notify* no devuelven promesa a proposito: quien los llama no
 * espera ni falla por un push, solo el log registra el error.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly auth: GoogleAuth | null = null;
  private readonly projectId: string | null = null;

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    const raw = config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!raw) {
      this.logger.warn('Push desactivado: falta FIREBASE_SERVICE_ACCOUNT_JSON.');
      return;
    }
    try {
      // Acepta el JSON tal cual o en base64 (mas comodo como variable de entorno en Railway).
      const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const credentials = JSON.parse(json) as { project_id?: string; client_email?: string; private_key?: string };
      if (!credentials.project_id) throw new Error('el JSON no trae project_id');
      this.projectId = credentials.project_id;
      this.auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
    } catch (err) {
      this.logger.error(`Push desactivado: FIREBASE_SERVICE_ACCOUNT_JSON invalido (${(err as Error).message}).`);
    }
  }

  get enabled(): boolean {
    return this.auth !== null;
  }

  notifyPeople(personIds: string[], message: PushMessage): void {
    if (!this.enabled || personIds.length === 0) return;
    this.sendToPeople(personIds, message).catch((err) => this.logger.error(`Fallo el envio de push: ${(err as Error).message}`));
  }

  notifyAudience(organizationIds: string[], audience: NoticeAudience, message: PushMessage): void {
    if (!this.enabled || organizationIds.length === 0) return;
    this.prisma.person
      .findMany({
        where: {
          organizationId: { in: organizationIds },
          role: { in: AUDIENCE_ROLES[audience] },
          status: { notIn: ['SUSPENDIDO', 'ELIMINADO'] },
        },
        select: { id: true },
      })
      .then((people) => this.sendToPeople(people.map((p) => p.id), message))
      .catch((err) => this.logger.error(`Fallo el envio de push: ${(err as Error).message}`));
  }

  private async sendToPeople(personIds: string[], message: PushMessage) {
    const sessions = await this.prisma.mobileSession.findMany({
      where: { personId: { in: personIds }, revokedAt: null, expiresAt: { gt: new Date() }, pushToken: { not: null } },
      select: { id: true, pushToken: true },
    });
    if (sessions.length === 0) return;

    const client = await this.auth!.getClient();
    for (let i = 0; i < sessions.length; i += SEND_CONCURRENCY) {
      await Promise.all(
        sessions.slice(i, i + SEND_CONCURRENCY).map((s) => this.sendOne(client, s.id, s.pushToken!, message)),
      );
    }
  }

  private async sendOne(
    client: Awaited<ReturnType<GoogleAuth['getClient']>>,
    sessionId: string,
    token: string,
    message: PushMessage,
  ) {
    try {
      await client.request({
        url: `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
        method: 'POST',
        data: {
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: message.data ?? {},
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        },
      });
    } catch (err) {
      const response = (err as { response?: { status?: number; data?: { error?: { details?: { errorCode?: string }[] } } } })
        .response;
      const unregistered =
        response?.status === 404 || response?.data?.error?.details?.some((d) => d.errorCode === 'UNREGISTERED');
      if (unregistered) {
        // La app se desinstalo o Firebase renovo el token: se deja de usar.
        await this.prisma.mobileSession.update({ where: { id: sessionId }, data: { pushToken: null } });
        return;
      }
      this.logger.warn(`Push no entregado (sesion ${sessionId}): ${(err as Error).message}`);
    }
  }
}
