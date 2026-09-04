import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type WelcomeEmailRole = 'ADMINISTRADOR' | 'SOCIO' | 'CONDUCTOR';

interface WelcomeEmailParams {
  to: string;
  name: string;
  role: WelcomeEmailRole;
  orgName: string;
  // Verdadero solo para el gerente inicial que se crea junto con la
  // asociacion (Super Admin -> nueva asociacion): ese correo saluda "de
  // parte de CHASKI AI", no de la asociacion, porque la asociacion recien
  // se esta creando en ese instante.
  fromChaski?: boolean;
}

const ROLE_COPY: Record<WelcomeEmailRole, { etiqueta: string; puntos: string[] }> = {
  ADMINISTRADOR: {
    etiqueta: 'Administrador',
    puntos: [
      'Gestionar colas, manifiestos y viajes del dia a dia de tu asociacion.',
      'Dar de alta y suspender cuentas de socios y conductores.',
      'Ver reportes, auditoria y (si tu plan lo incluye) el GPS en vivo de tu flota.',
    ],
  },
  SOCIO: {
    etiqueta: 'Socio',
    puntos: [
      'Ver los reportes y la produccion de tu(s) unidad(es).',
      'Revisar el estado de los viajes de tu vehiculo.',
    ],
  },
  CONDUCTOR: {
    etiqueta: 'Conductor',
    puntos: [
      'Anotarte en la cola de salida de tu unidad.',
      'Llenar el manifiesto de pasajeros de cada viaje.',
      'Marcar tu salida y tu llegada.',
    ],
  },
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private config: ConfigService) {}

  /**
   * Correo de bienvenida al crear una cuenta (Socio, Conductor, Administrador,
   * o el gerente inicial de una asociacion nueva). El login es siempre por
   * Google -- nunca se genera ni se muestra una contrasena -- asi que este
   * correo nunca lleva credenciales, solo explica el rol y enlaza al login.
   *
   * Mejor esfuerzo: si RESEND_API_KEY no esta configurada, o Resend falla, se
   * registra en el log y se sigue de largo -- la cuenta ya quedo creada y
   * funcional de todas formas (entra con Google en cuanto ella quiera).
   */
  async sendWelcomeEmail(params: WelcomeEmailParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY no configurada -- no se envio el correo de bienvenida a ${params.to} (${params.role}).`,
      );
      return;
    }

    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'CHASKI AI <onboarding@resend.dev>';
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:8443';
    const subject = params.fromChaski
      ? `Bienvenido a CHASKI AI, ${params.name}`
      : `Bienvenido a ${params.orgName}, ${params.name}`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: params.to,
          subject,
          html: buildWelcomeEmailHtml(params, frontendUrl),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Resend respondio ${res.status} al enviar a ${params.to}: ${text}`);
      }
    } catch (err) {
      this.logger.error(
        `Error enviando correo de bienvenida a ${params.to}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildWelcomeEmailHtml(params: WelcomeEmailParams, frontendUrl: string): string {
  const copy = ROLE_COPY[params.role];
  const name = escapeHtml(params.name);
  const orgName = escapeHtml(params.orgName);
  const loginUrl = `${frontendUrl.replace(/\/$/, '')}/ingresar`;

  const intro = params.fromChaski
    ? `Te damos la bienvenida a <strong>CHASKI AI</strong>. Te agradecemos la confianza de gestionar <strong>${orgName}</strong> con nuestra plataforma.`
    : `Te felicitamos por ser parte de <strong>${orgName}</strong>. Tu cuenta de ${copy.etiqueta.toLowerCase()} ya esta lista.`;

  const puntosHtml = copy.puntos
    .map(
      (p) =>
        `<tr><td style="padding:4px 0;font-size:14px;line-height:1.5;color:#334155;">• ${escapeHtml(p)}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bienvenido a CHASKI AI</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#eef1f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr>
        <td style="background-color:#1d3fb8;background-image:linear-gradient(135deg,#1d3fb8,#0b1a4d);padding:32px 32px 24px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">CHASKI AI</div>
          <div style="display:inline-block;margin-top:8px;padding:3px 10px;background-color:rgba(255,255,255,0.16);border-radius:6px;font-size:12px;font-weight:600;color:#ffe9a8;letter-spacing:0.5px;">${orgName}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:19px;color:#0f172a;">¡Bienvenido, ${name}! 🎉</h1>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155;">${intro}</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:20px;">
            <tr>
              <td style="padding:16px 20px;">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.6px;color:#64748b;text-transform:uppercase;margin-bottom:8px;">Con tu cuenta de ${copy.etiqueta} puedes</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${puntosHtml}</table>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:24px;">
            <tr>
              <td style="padding:12px 16px;font-size:13px;line-height:1.5;color:#78350f;">
                🔑 No necesitas contraseña: ingresas con tu cuenta de <strong>Google</strong> (${escapeHtml(params.to)}). Solo confirma tu identidad la primera vez.
              </td>
            </tr>
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              <td style="border-radius:10px;background-color:#1d3fb8;">
                <a href="${loginUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Ingresar a CHASKI AI →</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px 28px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">Si no esperabas este correo, puedes ignorarlo.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
