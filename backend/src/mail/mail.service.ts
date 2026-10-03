import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Activos oficiales de marca (mismos usados en el frontend -- ver
// src/pages/Landing.tsx, src/pages/Login.tsx, src/App.tsx). El logo es una
// imagen real de Cloudinary, nunca texto simulando el wordmark.
const CHASKI_WORDMARK_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/e_trim,f_png,q_auto/v1788027352/chaski-AI-nombre_1_1.png';
const CHASKI_TAGLINE = 'Plataformas inteligentes para modernas operaciones';

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
  // Logo real de la asociacion (Cloudinary), subido desde Super Admin ->
  // Asociaciones -> Organizacion. Si la asociacion todavia no tiene logo,
  // se usa el nombre en texto como respaldo (ver buildWelcomeEmailHtml).
  orgLogoUrl?: string | null;
  // Token de un solo uso para que la persona defina su propia contraseña (ver
  // AuthService.issuePasswordSetupToken). Solo lo lleva el correo de bienvenida.
  setPasswordToken?: string;
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

interface CommercialRequestNotificationParams {
  id: string;
  solution: 'OPERACION' | 'PRO' | 'GPS_VEHICULAR';
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  orgName?: string | null;
  ruc?: string | null;
}

const SOLUTION_LABEL: Record<CommercialRequestNotificationParams['solution'], string> = {
  OPERACION: 'Operación',
  PRO: 'PRO',
  GPS_VEHICULAR: 'GPS Vehicular',
};

interface ComplaintConfirmationParams {
  to: string;
  consumerName: string;
  number: string;
  type: 'RECLAMO' | 'QUEJA';
}

const COMPLAINT_TYPE_LABEL: Record<ComplaintConfirmationParams['type'], string> = {
  RECLAMO: 'reclamo',
  QUEJA: 'queja',
};

interface ComplaintInternalNotificationParams {
  number: string;
  type: 'RECLAMO' | 'QUEJA';
  consumerName: string;
  consumerEmail: string;
  consumerPhone?: string | null;
  serviceDescription: string;
}

interface PasswordResetEmailParams {
  to: string;
  name: string;
  token: string;
}

interface PassengerTicketEmailParams {
  to: string;
  passengerName: string;
  orgName: string;
  origin: string;
  destination: string;
  manifestNumber: string;
  date: Date;
  departureTime: string;
  vehicleCode: string;
  vehiclePlate: string;
}

interface SuperAdminSafetyAlertParams {
  orgName: string;
  vehicleCode: string;
  alertTypeLabel: string;
  description: string;
  detectedAt: Date;
}

interface PossibleAccidentAlertParams {
  to: string;
  adminName: string;
  vehicleCode: string;
  routeLabel: string;
  note: string;
  lat: number;
  lng: number;
  detectedAt: Date;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private config: ConfigService) {}

  /**
   * Correo de bienvenida al crear una cuenta (Socio, Conductor, Administrador,
   * o el gerente inicial de una asociacion nueva). Nunca se genera ni se
   * muestra una contrasena aqui -- se puede entrar con Google directo, o
   * definir una contrasena propia desde "Recuperar acceso" en el login --
   * asi que este correo nunca lleva credenciales, solo explica el rol y
   * enlaza al login.
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

  /**
   * Correo cuando una cuenta suspendida vuelve a ACTIVO (13 sept 2026,
   * decidido con Jayde): para la persona es como si la registraran de
   * nuevo -- avisa igual que sendWelcomeEmail, pero con copy de
   * reactivacion en vez de bienvenida por primera vez. Mismo patron
   * best-effort: PeopleService.updateStatus ya cambio el estado antes de
   * llamar esto, un correo fallido nunca revierte la reactivacion.
   */
  async sendReactivationEmail(params: WelcomeEmailParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY no configurada -- no se envio el correo de reactivacion a ${params.to} (${params.role}).`,
      );
      return;
    }

    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'CHASKI AI <onboarding@resend.dev>';
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:8443';
    const subject = `Tu cuenta en ${params.orgName} fue reactivada`;

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
          html: buildReactivationEmailHtml(params, frontendUrl),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Resend respondio ${res.status} al enviar reactivacion a ${params.to}: ${text}`);
      }
    } catch (err) {
      this.logger.error(
        `Error enviando correo de reactivacion a ${params.to}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * "Boleto" por correo al pasajero (12 sept 2026, decidido con Jayde): el
   * correo del pasajero en el manifiesto es un dato NO obligatorio -- si el
   * conductor lo llena, se guarda (ver PassengerProfile en
   * ManifestsService) y se le manda este correo con los datos reales de SU
   * viaje. Best-effort igual que los demas: el pasajero ya quedo registrado
   * en el manifiesto antes de llamar esto, un correo fallido nunca pierde
   * el registro.
   */
  async sendPassengerTicketEmail(params: PassengerTicketEmailParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY no configurada -- no se envio el boleto a ${params.to} (manifiesto ${params.manifestNumber}).`);
      return;
    }

    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'CHASKI AI <onboarding@resend.dev>';
    const subject = `Tu boleto: ${params.origin} → ${params.destination} — ${params.orgName}`;
    const fecha = params.date.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'long', year: 'numeric' });
    const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#eef1f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr>
        <td style="background-color:#1d3fb8;background-image:linear-gradient(135deg,#1d3fb8,#0b1a4d);padding:32px 32px 24px;text-align:center;">
          <div style="display:inline-block;margin-bottom:10px;padding:3px 10px;background-color:rgba(255,255,255,0.16);border-radius:6px;font-size:12px;font-weight:600;color:#ffe9a8;letter-spacing:0.5px;">${escapeHtml(params.orgName)}</div>
          <div style="font-size:20px;font-weight:700;color:#fff;">${escapeHtml(params.origin)} → ${escapeHtml(params.destination)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:19px;color:#0f172a;">Hola, ${escapeHtml(params.passengerName)}</h1>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155;">
            Disfruta tu viaje de <strong>${escapeHtml(params.origin)}</strong> a <strong>${escapeHtml(params.destination)}</strong> con <strong>${escapeHtml(params.orgName)}</strong>.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:8px;">
            <tr><td style="padding:16px 20px;font-size:13px;line-height:1.9;color:#334155;">
              <strong>Fecha:</strong> ${escapeHtml(fecha)}<br/>
              <strong>Salida:</strong> ${escapeHtml(params.departureTime)}<br/>
              <strong>Unidad:</strong> ${escapeHtml(params.vehicleCode)} — Placa ${escapeHtml(params.vehiclePlate)}<br/>
              <strong>N.º de manifiesto:</strong> ${escapeHtml(params.manifestNumber)}
            </td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px 28px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">Este boleto es una constancia informativa de tu viaje, generada automáticamente por CHASKI AI a nombre de ${escapeHtml(params.orgName)}.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: params.to, subject, html }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Resend respondio ${res.status} enviando el boleto a ${params.to} (manifiesto ${params.manifestNumber}): ${text}`);
      }
    } catch (err) {
      this.logger.error(
        `Error enviando el boleto a ${params.to} (manifiesto ${params.manifestNumber}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Notificacion interna a CHASKI AI cuando llega una Solicitud comercial
   * desde la landing (docs/planes/landing-publica-y-solicitudes-
   * comerciales.md §5). Best-effort igual que sendWelcomeEmail: la
   * solicitud ya quedo guardada en base de datos antes de llamar esto, asi
   * que un correo fallido nunca la pierde -- el Super Admin siempre puede
   * verla en el listado.
   */
  async sendCommercialRequestNotification(params: CommercialRequestNotificationParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const notifyTo = this.config.get<string>('COMMERCIAL_NOTIFICATIONS_EMAIL') || this.config.get<string>('RESEND_FROM_EMAIL');
    if (!apiKey || !notifyTo) {
      this.logger.warn(
        `RESEND_API_KEY o COMMERCIAL_NOTIFICATIONS_EMAIL no configurados -- no se notifico la solicitud comercial ${params.id}.`,
      );
      return;
    }

    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'CHASKI AI <onboarding@resend.dev>';
    const label = SOLUTION_LABEL[params.solution];
    const subject = `Nueva solicitud comercial (${label}) — ${params.orgName ?? params.contactName}`;
    const html = `<!doctype html>
<html lang="es">
  <body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <p>Nueva solicitud comercial recibida desde la landing.</p>
    <ul>
      <li><strong>Solución:</strong> ${escapeHtml(label)}</li>
      <li><strong>Contacto:</strong> ${escapeHtml(params.contactName)} — ${escapeHtml(params.contactEmail)}${params.contactPhone ? ` — ${escapeHtml(params.contactPhone)}` : ''}</li>
      ${params.orgName ? `<li><strong>Asociación/socio:</strong> ${escapeHtml(params.orgName)}</li>` : ''}
      ${params.ruc ? `<li><strong>RUC/DNI:</strong> ${escapeHtml(params.ruc)}</li>` : ''}
    </ul>
    <p>Revisar el detalle completo y las respuestas del formulario en el panel de Super Admin → Solicitudes comerciales.</p>
  </body>
</html>`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: notifyTo, subject, html }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Resend respondio ${res.status} notificando la solicitud comercial ${params.id}: ${text}`);
      }
    } catch (err) {
      this.logger.error(
        `Error notificando la solicitud comercial ${params.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Correo de confirmacion al consumidor cuando registra un reclamo/queja en
   * el Libro de Reclamaciones publico. Best-effort igual que los demas: el
   * reclamo ya quedo guardado (y tiene su numero RC-YYYY-NNNN) antes de
   * llamar esto, asi que un correo fallido nunca lo pierde -- el numero
   * mostrado en pantalla al momento de registrar sigue siendo su constancia.
   */
  async sendComplaintConfirmation(params: ComplaintConfirmationParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY no configurada -- no se envio la confirmacion del reclamo ${params.number} a ${params.to}.`,
      );
      return;
    }

    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'CHASKI AI <onboarding@resend.dev>';
    const tipo = COMPLAINT_TYPE_LABEL[params.type];
    const subject = `Registramos tu ${tipo} N.º ${params.number} — CHASKI AI`;
    const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#eef1f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr>
        <td style="background-color:#1d3fb8;background-image:linear-gradient(135deg,#1d3fb8,#0b1a4d);padding:32px 32px 24px;text-align:center;">
          <img src="${CHASKI_WORDMARK_URL}" alt="CHASKI AI" style="height:28px;width:auto;object-fit:contain;" />
          <div style="margin-top:6px;font-size:11px;font-weight:500;color:#c7d2ff;letter-spacing:0.2px;">${escapeHtml(CHASKI_TAGLINE)}</div>
          <div style="display:inline-block;margin-top:10px;padding:3px 10px;background-color:rgba(255,255,255,0.16);border-radius:6px;font-size:12px;font-weight:600;color:#ffe9a8;letter-spacing:0.5px;">Libro de Reclamaciones</div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:19px;color:#0f172a;">Hola, ${escapeHtml(params.consumerName)}</h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
            Confirmamos que tu <strong>${tipo}</strong> quedó registrado en el Libro de Reclamaciones virtual de CHASKI AI con el número:
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:20px;">
            <tr>
              <td style="padding:16px 20px;text-align:center;">
                <div style="font-size:20px;font-weight:700;color:#1d3fb8;letter-spacing:0.5px;">${escapeHtml(params.number)}</div>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
            Nuestro equipo directivo (gerencia general) va a revisar tu caso y te responderá dentro de los <strong>30 días calendario</strong> siguientes, conforme al Código de Protección y Defensa del Consumidor (Ley N° 29571).
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
            <tr>
              <td style="padding:12px 16px;font-size:13px;line-height:1.5;color:#78350f;">
                📌 Guarda este número como constancia de tu ${tipo}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px 28px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">Si no registraste este ${tipo}, puedes ignorar este correo.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: params.to, subject, html }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Resend respondio ${res.status} confirmando el reclamo ${params.number} a ${params.to}: ${text}`);
      }
    } catch (err) {
      this.logger.error(
        `Error confirmando el reclamo ${params.number} a ${params.to}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Notificacion interna a CHASKI AI cuando llega un reclamo/queja nuevo al
   * Libro de Reclamaciones -- mismo destino y mismo patron best-effort que
   * sendCommercialRequestNotification. Existe para que el equipo se entere
   * a tiempo: INDECOPI da 30 dias calendario para responder, y sin este
   * aviso el unico modo de enterarse es revisar el panel de Super Admin
   * manualmente.
   */
  async sendComplaintInternalNotification(params: ComplaintInternalNotificationParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const notifyTo = this.config.get<string>('COMMERCIAL_NOTIFICATIONS_EMAIL') || this.config.get<string>('RESEND_FROM_EMAIL');
    if (!apiKey || !notifyTo) {
      this.logger.warn(
        `RESEND_API_KEY o COMMERCIAL_NOTIFICATIONS_EMAIL no configurados -- no se notifico internamente el reclamo ${params.number}.`,
      );
      return;
    }

    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'CHASKI AI <onboarding@resend.dev>';
    const tipo = COMPLAINT_TYPE_LABEL[params.type];
    const subject = `Nuevo ${tipo} en el Libro de Reclamaciones — ${params.number}`;
    const html = `<!doctype html>
<html lang="es">
  <body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <p>Se registró un nuevo <strong>${escapeHtml(tipo)}</strong> en el Libro de Reclamaciones. Recuerda que hay <strong>30 días calendario</strong> para responder.</p>
    <ul>
      <li><strong>Número:</strong> ${escapeHtml(params.number)}</li>
      <li><strong>Reclamante:</strong> ${escapeHtml(params.consumerName)} — ${escapeHtml(params.consumerEmail)}${params.consumerPhone ? ` — ${escapeHtml(params.consumerPhone)}` : ''}</li>
      <li><strong>Bien o servicio:</strong> ${escapeHtml(params.serviceDescription)}</li>
    </ul>
    <p>Revisar el detalle completo y responder desde el panel de Super Admin → Libro de Reclamaciones.</p>
  </body>
</html>`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: notifyTo, subject, html }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Resend respondio ${res.status} notificando internamente el reclamo ${params.number}: ${text}`);
      }
    } catch (err) {
      this.logger.error(
        `Error notificando internamente el reclamo ${params.number}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Alerta de seguridad grave a Super Admin cuando la asociación NO tiene PRO
   * (12 sept 2026, decidido con Jayde): si una unidad con GPS Vehicular
   * individual genera botón de pánico, posible remolque, posible accidente o
   * sale del corredor, el Administrador de esa asociación NO se entera (no
   * pagó ese servicio) -- Super Admin toma ese lugar, como controlador de
   * toda la plataforma. Best-effort igual que el resto: la GpsAlert ya quedó
   * creada en base de datos antes de llamar esto, un correo fallido nunca la
   * pierde -- sigue visible en el Resumen de Super Admin.
   */
  async sendSuperAdminSafetyAlertEmail(params: SuperAdminSafetyAlertParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const notifyTo = this.config.get<string>('COMMERCIAL_NOTIFICATIONS_EMAIL') || this.config.get<string>('RESEND_FROM_EMAIL');
    if (!apiKey || !notifyTo) {
      this.logger.warn(
        `RESEND_API_KEY o COMMERCIAL_NOTIFICATIONS_EMAIL no configurados -- no se notificó a Super Admin la alerta de ${params.orgName} (unidad ${params.vehicleCode}).`,
      );
      return;
    }

    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'CHASKI AI <onboarding@resend.dev>';
    const subject = `⚠ ${params.alertTypeLabel} -- unidad ${params.vehicleCode} (${params.orgName}, sin Plan PRO)`;
    const fecha = params.detectedAt.toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const html = `<!doctype html>
<html lang="es">
  <body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <p><strong>${escapeHtml(params.alertTypeLabel)}</strong> en la unidad <strong>${escapeHtml(params.vehicleCode)}</strong> de <strong>${escapeHtml(params.orgName)}</strong>.</p>
    <p>${escapeHtml(params.description)}</p>
    <p style="color:#64748b;font-size:13px;">Detectado el ${escapeHtml(fecha)}. Esta asociación no tiene Plan PRO, por eso su Administrador no ve esta alerta en su panel -- te llega a ti como Super Admin. Revísala desde Super Admin → GPS → ${escapeHtml(params.orgName)} → Alertas.</p>
  </body>
</html>`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: notifyTo, subject, html }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Resend respondio ${res.status} notificando a Super Admin (unidad ${params.vehicleCode}, ${params.orgName}): ${text}`);
      }
    } catch (err) {
      this.logger.error(
        `Error notificando a Super Admin (unidad ${params.vehicleCode}, ${params.orgName}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Alerta de posible accidente (docs/planes/ia-aplicada.md §3.1, prioridad 1):
   * el vehiculo iba a velocidad normal y de golpe quedo inmovil por varios
   * minutos -- un patron de velocidad + inmovilidad, NO una deteccion real de
   * impacto (este backend no lee ningun sensor de acelerometro/choque de
   * Traccar hoy). Por eso el correo es explicito en que es una alerta a
   * revisar, nunca una confirmacion. Best-effort igual que los demas correos:
   * el viaje ya quedo marcado CON_INCIDENCIA en el sistema antes de llamar
   * esto, asi que un correo fallido nunca pierde la alerta -- sigue visible
   * en el panel de administrador.
   */
  async sendPossibleAccidentAlert(params: PossibleAccidentAlertParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY no configurada -- no se envio la alerta de posible accidente (unidad ${params.vehicleCode}) a ${params.to}.`,
      );
      return;
    }

    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'CHASKI AI <onboarding@resend.dev>';
    const subject = `⚠ Posible accidente -- unidad ${params.vehicleCode} (${params.routeLabel})`;
    const mapsUrl = `https://www.google.com/maps?q=${params.lat},${params.lng}`;
    const fecha = params.detectedAt.toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#eef1f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr>
        <td style="background-color:#b91c1c;background-image:linear-gradient(135deg,#b91c1c,#450a0a);padding:32px 32px 24px;text-align:center;">
          <img src="${CHASKI_WORDMARK_URL}" alt="CHASKI AI" style="height:28px;width:auto;object-fit:contain;" />
          <div style="display:inline-block;margin-top:12px;padding:4px 12px;background-color:rgba(255,255,255,0.18);border-radius:6px;font-size:12px;font-weight:700;color:#fecaca;letter-spacing:0.5px;">DETECCIÓN AUTOMÁTICA -- POR REVISAR</div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:19px;color:#0f172a;">Hola, ${escapeHtml(params.adminName)}</h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
            El sistema detectó un patrón de <strong>velocidad seguida de inmovilidad total</strong> en la unidad
            <strong>${escapeHtml(params.vehicleCode)}</strong> (${escapeHtml(params.routeLabel)}), y marcó el viaje con una incidencia para que la revises.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:12px;margin-bottom:20px;">
            <tr>
              <td style="padding:16px 20px;font-size:14px;line-height:1.6;color:#7f1d1d;">
                ${escapeHtml(params.note)}
              </td>
            </tr>
          </table>
          <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#64748b;">
            Detectado el ${escapeHtml(fecha)}. <a href="${mapsUrl}" style="color:#1d3fb8;">Ver última posición en el mapa →</a>
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:8px;">
            <tr>
              <td style="padding:12px 16px;font-size:13px;line-height:1.5;color:#78350f;">
                📌 Esto es una alerta automática basada en velocidad + inmovilidad -- <strong>no es una confirmación de accidente</strong>. Puede tratarse de una parada real, una avería, o una zona sin señal. Verifica con el conductor y resuelve la incidencia desde el panel (Viajes → Resolver incidencia).
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: params.to, subject, html }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Resend respondio ${res.status} enviando alerta de posible accidente (unidad ${params.vehicleCode}) a ${params.to}: ${text}`);
      }
    } catch (err) {
      this.logger.error(
        `Error enviando alerta de posible accidente (unidad ${params.vehicleCode}) a ${params.to}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  /**
   * Enlace para definir/restablecer la contraseña (login alternativo a Google,
   * ver AuthService.requestPasswordReset/resetPassword). El enlace vence en
   * 30 minutos. Si RESEND_API_KEY no esta configurada, se registra el enlace
   * en el log en vez de enviarlo -- asi en desarrollo local se puede seguir
   * probando el flujo completo sin depender de Resend.
   */
  async sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:8443';
    const resetUrl = `${frontendUrl.replace(/\/$/, '')}/restablecer-contrasena?token=${encodeURIComponent(params.token)}`;

    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY no configurada -- enlace de restablecimiento para ${params.to}: ${resetUrl}`,
      );
      return;
    }

    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'CHASKI AI <onboarding@resend.dev>';
    const subject = 'Restablece tu contraseña — CHASKI AI';
    const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#eef1f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr>
        <td style="background-color:#1d3fb8;background-image:linear-gradient(135deg,#1d3fb8,#0b1a4d);padding:32px 32px 24px;text-align:center;">
          <img src="${CHASKI_WORDMARK_URL}" alt="CHASKI AI" style="height:28px;width:auto;object-fit:contain;" />
          <div style="margin-top:6px;font-size:11px;font-weight:500;color:#c7d2ff;letter-spacing:0.2px;">${escapeHtml(CHASKI_TAGLINE)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:19px;color:#0f172a;">Hola, ${escapeHtml(params.name)}</h1>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155;">
            Recibimos una solicitud para definir o restablecer la contraseña de tu cuenta en CHASKI AI. Este enlace vence en 30 minutos.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr>
              <td style="border-radius:10px;background-color:#1d3fb8;">
                <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Definir nueva contraseña →</a>
              </td>
            </tr>
          </table>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
            Si no solicitaste esto, puedes ignorar este correo -- tu contraseña actual (si tienes una) sigue funcionando igual. También puedes seguir ingresando con tu cuenta de Google en cualquier momento.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: params.to, subject, html }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Resend respondio ${res.status} enviando el restablecimiento de contraseña a ${params.to}: ${text}`);
      }
    } catch (err) {
      this.logger.error(
        `Error enviando el restablecimiento de contraseña a ${params.to}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Mesa de servicio ITIL 4 (OE4 tesis, 2 oct 2026): acuse de recibo al crear un ticket, con su
   * codigo (TCK-xxxx) y la prioridad calculada.
   */
  async sendSupportTicketAck(params: { to: string; name: string; code: string; subject: string; priority: string }): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY no configurada -- no se envió el acuse del ticket ${params.code} a ${params.to}.`);
      return;
    }
    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'CHASKI AI <onboarding@resend.dev>';
    const subject = `Recibimos tu ticket ${params.code} -- CHASKI AI`;
    const html = `<!doctype html>
<html lang="es">
  <body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <p>Hola ${escapeHtml(params.name)},</p>
    <p>Recibimos tu ticket <strong>${escapeHtml(params.code)}</strong>: "${escapeHtml(params.subject)}".</p>
    <p>Quedó clasificado con prioridad <strong>${escapeHtml(params.priority)}</strong>. Te avisaremos por aquí cada vez que cambie de estado.</p>
  </body>
</html>`;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: params.to, subject, html }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Resend respondio ${res.status} enviando el acuse del ticket ${params.code}: ${text}`);
      }
    } catch (err) {
      this.logger.error(`Error enviando el acuse del ticket ${params.code}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Un solo metodo reusado para CADA cambio de estado del ticket (escalar, resolver, en espera,
   * cerrar) -- el mensaje ya viene redactado por quien llama, aqui solo se arma el correo.
   */
  async sendSupportTicketStatusUpdate(params: { to: string; name: string; code: string; subject: string; message: string }): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY no configurada -- no se notificó el cambio del ticket ${params.code} a ${params.to}.`);
      return;
    }
    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'CHASKI AI <onboarding@resend.dev>';
    const subject = `Novedad en tu ticket ${params.code} -- CHASKI AI`;
    const html = `<!doctype html>
<html lang="es">
  <body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <p>Hola ${escapeHtml(params.name)},</p>
    <p>Tu ticket <strong>${escapeHtml(params.code)}</strong> ("${escapeHtml(params.subject)}") tiene una novedad:</p>
    <p style="padding:12px 16px;background:#f1f5f9;border-radius:8px;">${escapeHtml(params.message)}</p>
  </body>
</html>`;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: params.to, subject, html }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Resend respondio ${res.status} notificando el ticket ${params.code}: ${text}`);
      }
    } catch (err) {
      this.logger.error(`Error notificando el ticket ${params.code}: ${err instanceof Error ? err.message : String(err)}`);
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

// Encabezado compartido (wordmark de CHASKI AI + logo real de la asociacion,
// con texto como respaldo si no tiene logo cargado) -- reusado por el correo
// de bienvenida y el de reactivacion, para que ambos se vean como el mismo
// producto.
function buildEmailHeaderHtml(orgName: string, orgLogoUrl?: string | null): string {
  const safeOrgName = escapeHtml(orgName);
  return `<img src="${CHASKI_WORDMARK_URL}" alt="CHASKI AI" style="height:28px;width:auto;object-fit:contain;" />
          <div style="margin-top:6px;font-size:11px;font-weight:500;color:#c7d2ff;letter-spacing:0.2px;">${escapeHtml(CHASKI_TAGLINE)}</div>
          ${orgLogoUrl
            ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px auto 0;"><tr><td style="background-color:#ffffff;border-radius:999px;padding:6px 14px;">
                 <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                   <td style="padding-right:8px;"><img src="${escapeHtml(orgLogoUrl)}" alt="${safeOrgName}" style="height:20px;width:auto;max-width:110px;object-fit:contain;display:block;" /></td>
                   <td style="font-size:12px;font-weight:600;color:#1d3fb8;letter-spacing:0.3px;white-space:nowrap;">${safeOrgName}</td>
                 </tr></table>
               </td></tr></table>`
            : `<div style="display:inline-block;margin-top:10px;padding:3px 10px;background-color:rgba(255,255,255,0.16);border-radius:6px;font-size:12px;font-weight:600;color:#ffe9a8;letter-spacing:0.5px;">${safeOrgName}</div>`}`;
}

function buildWelcomeEmailHtml(params: WelcomeEmailParams, frontendUrl: string): string {
  const copy = ROLE_COPY[params.role];
  const name = escapeHtml(params.name);
  const orgName = escapeHtml(params.orgName);
  const baseUrl = frontendUrl.replace(/\/$/, '');
  const loginUrl = `${baseUrl}/ingresar`;
  const setPasswordUrl = params.setPasswordToken
    ? `${baseUrl}/restablecer-contrasena?token=${encodeURIComponent(params.setPasswordToken)}`
    : null;
  const safeTo = escapeHtml(params.to);
  const accessNote = setPasswordUrl
    ? `🔑 Tu usuario es tu correo (<strong>${safeTo}</strong>). Puedes ingresar con tu cuenta de <strong>Google</strong> o crear tu propia contraseña con el botón de abajo. El enlace de la contraseña vale 7 días y solo se puede usar una vez.`
    : `🔑 Ingresa con tu cuenta de <strong>Google</strong> (${safeTo}), o si prefieres, define una contraseña propia desde "Recuperar acceso" en la pantalla de acceso.`;
  const setPasswordButton = setPasswordUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px auto 0;">
            <tr>
              <td style="border-radius:10px;border:2px solid #1d3fb8;">
                <a href="${setPasswordUrl}" style="display:inline-block;padding:10px 26px;font-size:14px;font-weight:700;color:#1d3fb8;text-decoration:none;">Crear mi contraseña</a>
              </td>
            </tr>
          </table>`
    : '';

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
          ${buildEmailHeaderHtml(params.orgName, params.orgLogoUrl)}
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
                ${accessNote}
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
          ${setPasswordButton}
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

function buildReactivationEmailHtml(params: WelcomeEmailParams, frontendUrl: string): string {
  const copy = ROLE_COPY[params.role];
  const name = escapeHtml(params.name);
  const orgName = escapeHtml(params.orgName);
  const loginUrl = `${frontendUrl.replace(/\/$/, '')}/ingresar`;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tu cuenta fue reactivada</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#eef1f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr>
        <td style="background-color:#1d3fb8;background-image:linear-gradient(135deg,#1d3fb8,#0b1a4d);padding:32px 32px 24px;text-align:center;">
          ${buildEmailHeaderHtml(params.orgName, params.orgLogoUrl)}
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:19px;color:#0f172a;">Hola de nuevo, ${name} 👋</h1>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155;">
            Tu cuenta de ${copy.etiqueta.toLowerCase()} en <strong>${orgName}</strong> fue reactivada. Ya puedes volver a ingresar con normalidad.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:24px;">
            <tr>
              <td style="padding:12px 16px;font-size:13px;line-height:1.5;color:#78350f;">
                🔑 Ingresa con tu cuenta de <strong>Google</strong> (${escapeHtml(params.to)}), o si prefieres, define una contraseña propia desde "Recuperar acceso" en la pantalla de acceso.
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
          <p style="margin:0;font-size:11px;color:#94a3b8;">Si no esperabas este correo, contacta al administrador de tu asociación.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
