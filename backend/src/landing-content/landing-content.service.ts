import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt.strategy';

export const LANDING_CONTENT_KEYS = [
  'HERO', 'HERO_BACKGROUND', 'PROBLEMS', 'CAPABILITIES', 'PLANS', 'CLIENTS_SHOWCASE', 'FAQ',
  'COMPANY', 'FLEET_SHOWCASE', 'ABOUT', 'LEGAL_TERMS', 'LEGAL_PRIVACY', 'LEGAL_COOKIES',
] as const;
export type LandingContentKey = (typeof LANDING_CONTENT_KEYS)[number];

// Claves de las 3 paginas legales -- usado para validar el parametro de la
// ruta publica GET /landing-content/legal/:key sin aceptar cualquier clave.
export const LEGAL_PAGE_KEYS = ['LEGAL_TERMS', 'LEGAL_PRIVACY', 'LEGAL_COOKIES'] as const;
export type LegalPageKey = (typeof LEGAL_PAGE_KEYS)[number];

// Valores por defecto -- el mismo contenido real que hoy vive escrito directo
// en Landing.tsx (nunca lorem/inventado). CLIENTS_SHOWCASE y FLEET_SHOWCASE
// quedan vacios hasta que Super Admin suba imagenes reales; FAQ describe
// hechos reales ya documentados del producto.
const DEFAULTS: Record<LandingContentKey, unknown> = {
  HERO: {
    tagline: 'Plataformas inteligentes para modernas operaciones',
    title: 'Creamos plataformas digitales para asociaciones de transporte y operaciones logísticas.',
    subtitle: 'Centralizamos colas, ventas, manifiestos, viajes y control operativo en un solo sistema.',
    subtitleCaption: 'Para asociaciones de transporte y operaciones logísticas.',
    ctaPrimary: 'Solicitar demostración',
    ctaSecondary: 'Ingresar a la plataforma',
  },
  // Fondo compartido del hero + vitrina de flota, subido por Super Admin en
  // "Landing fondo" (una sola imagen). Vacio hasta que se suba una real --
  // mientras tanto el hero usa el fondo plano de siempre, nunca una imagen
  // de relleno inventada.
  HERO_BACKGROUND: { imageUrl: '' },
  PROBLEMS: [
    { title: 'Colas sin control', desc: 'Posiciones disputadas, excepciones sin registro y jornadas que empiezan en conflicto.' },
    { title: 'Manifiestos en papel', desc: 'Documentos extraviados, errores de registro y sin trazabilidad de correcciones.' },
    { title: 'Desequilibrio de flota', desc: 'Vehículos acumulados en un terminal mientras el otro carece de unidades.' },
    { title: 'Sin auditoría real', desc: 'Decisiones sin respaldo, responsabilidades difusas y datos inconsistentes.' },
    { title: 'Múltiples sistemas', desc: 'Hojas de cálculo, grupos de WhatsApp y registros sueltos sin integración.' },
    { title: 'Recaudación opaca', desc: 'Totales sin trazabilidad por método de pago ni verificación de tarifas.' },
  ],
  // `icon` es el nombre del icono de lucide-react tal como esta importado en
  // Landing.tsx -- si Super Admin escribe uno que no existe, el frontend cae
  // a un icono generico en vez de romper.
  CAPABILITIES: [
    { icon: 'ListOrdered', label: 'Gestión de colas', desc: 'Cola digital por dirección con posicionamiento justo, llamado confirmado y excepciones auditadas.' },
    { icon: 'FileText', label: 'Ventas y manifiestos', desc: 'Registro de pasajeros por asiento, cierre de manifiesto con PDF y correcciones versionadas.' },
    { icon: 'Route', label: 'Control de viajes', desc: 'Seguimiento del ciclo completo: salida, tránsito y llegada con registro de evidencia.' },
    { icon: 'ArrowLeftRight', label: 'Reubicaciones', desc: 'Detección de desequilibrio, orden de traslado, compensación y auditoría sin manipular la cola.' },
    { icon: 'BarChart2', label: 'Reportes operativos', desc: 'Producción por unidad, empresa y jornada. Ausencias, incidencias y recaudación.' },
    { icon: 'Shield', label: 'Auditoría completa', desc: 'Cada acción registrada con actor, recurso, valores antes/después, motivo y marca de tiempo.' },
  ],
  // Actualizado 13 sept 2026 tras auditar el codigo real (nunca lo que dice
  // la documentacion aspiracional): varias cosas que este objeto marcaba
  // como exclusivas de PRO (reubicaciones con compensacion, correcciones de
  // manifiesto versionadas, reportes de produccion) en realidad NUNCA
  // estuvieron gateadas por plan -- estan disponibles desde Operacion. Se
  // quito "Kiosco QR de terminal" (nunca se construyo, cero codigo) y
  // "Auditoria extendida" (auditoria es identica para todos los planes, no
  // hay una version "basica" distinta). PRO de verdad exclusivo: Asistente
  // de IA (assistant.controller.ts, ForbiddenException real si no es PRO) y
  // visibilidad GPS de FLOTA COMPLETA para el Administrador
  // (gps.controller.ts, adminRequiresPro).
  //
  // Segunda pasada (13 sept 2026, a pedido de Jayde): mantenimiento
  // predictivo y deteccion automatica de posibles accidentes (plan-pro.md
  // §11.1 y §12) tampoco tienen un chequeo de plan en su controller -- pero
  // SI necesitan datos reales de Traccar para funcionar (ver
  // fleet-reports.service.ts / ReportsPage.tsx "Sin dato GPS" cuando la
  // unidad no tiene traccarDeviceId). Por eso NO van en Operacion sola (sin
  // hardware no hay nada que mostrar) -- van en PRO (flota con GPS) y en GPS
  // Vehicular (la unidad puntual que sI tiene el equipo).
  PLANS: {
    operacion: {
      name: 'Operación',
      desc: 'Para asociaciones que comienzan su digitalización — sin necesidad de hardware.',
      features: ['Gestión de colas digitales', 'Ventas, manifiestos y correcciones con historial de versiones', 'Control de viajes de punta a punta', 'Reubicaciones de flota con compensación y sugerencia automática de traslado', 'Reportes de producción por unidad y eficiencia por ruta/empresa', 'Auditoría completa de cada acción', 'Avisos internos a socios y conductores', 'Soporte por correo'],
    },
    pro: {
      name: 'PRO',
      desc: 'Para asociaciones que quieren visibilidad de flota completa y asistente de inteligencia artificial.',
      features: ['Todo en Operación', 'Asistente de inteligencia artificial conversacional para conductores', 'Mapa en vivo, historial e inventario de dispositivos de toda la flota para el administrador', 'Mantenimiento predictivo y detección automática de posibles accidentes en toda la flota', 'Alertas de seguridad graves notificadas directo al administrador', 'Reporte de recaudación por empresa', 'Soporte prioritario'],
    },
    gpsVehicular: {
      name: 'GPS Vehicular',
      desc: 'Para socios que desean controlar una o varias unidades, aunque su asociación permanezca en Operación.',
      features: ['Equipo Teltonika instalado y configurado por nuestro equipo técnico', 'Ubicación en vivo y estado de conexión de la unidad', 'Historial real de recorridos pintado en el mapa', 'Mantenimiento predictivo comparado con el kilometraje real de la unidad', 'Detección automática de posibles accidentes, con verificación humana siempre', 'Alertas automáticas: desconexión, corte de energía, posible remolque y fuera de ruta', 'Bloqueo remoto de motor: el socio solicita, CHASKI AI confirma y ejecuta', 'Visible solo para el socio dueño y su conductor asignado'],
    },
  },
  // Vitrina de clientes reales: logo + rutas que opera cada asociacion, ambas
  // imagenes subidas por Super Admin. Vacio hasta que se suba la primera --
  // nunca un cliente de ejemplo inventado.
  CLIENTS_SHOWCASE: [],
  FAQ: [
    { question: '¿CHASKI RUTA reemplaza el proceso que ya tenemos?', answer: 'Sí. Reemplaza los procesos manuales de cola, venta de pasajes y manifiestos con un sistema digital centralizado que opera en tiempo real, pensado para la operación real de corredores por turnos.' },
    { question: '¿Necesito comprar hardware para empezar?', answer: 'No. El Plan Operación funciona solo con la app web y la app Android del conductor. El GPS físico es un servicio aparte (GPS Vehicular o Plan PRO) y se coordina por separado, instalación incluida.' },
    { question: '¿Qué pasa con mis datos si más adelante decido no continuar?', answer: 'Tus datos son tuyos: colas, manifiestos, viajes y reportes quedan guardados y auditados en tu propia asociación durante todo el tiempo que uses la plataforma.' },
    { question: '¿Cuánto tiempo toma implementarlo?', answer: 'Depende del tamaño de tu asociación y del número de rutas y empresas integrantes. Lo evaluamos juntos después de recibir tu solicitud, sin costo ni compromiso.' },
    { question: '¿El sistema funciona igual para varias empresas dentro de mi asociación?', answer: 'Sí. Cada empresa miembro se gestiona por separado dentro del mismo sistema, con sus propios vehículos, manifiestos y reportes.' },
  ],
  // Datos institucionales y redes sociales que hoy estan fijos en el footer y
  // el bloque de contacto de Landing.tsx -- se separan aqui para que Super
  // Admin los pueda editar sin tocar codigo. Instagram/Facebook/TikTok vacios
  // = icono oculto en el footer (mismo comportamiento que Aesthetic Shopp).
  COMPANY: {
    legalName: 'IMPORT STAR PERUVIAN EIRL',
    ruc: '20609699605',
    whatsapp: '',
    address: '',
    contactEmail: 'contacto@chaski.ai',
    instagramUrl: '',
    facebookUrl: '',
    tiktokUrl: '',
  },
  // Pagina publica "Sobre nosotros" (footer -> Empresa -> Sobre nosotros).
  // Mismo patron que las paginas legales (titulo + cuerpo libre), pero sin
  // aviso de "borrador legal" porque no es un documento vinculante -- es
  // contenido institucional que Super Admin edita como cualquier otra seccion.
  ABOUT: {
    title: 'Sobre nosotros',
    body: `CHASKI AI es una plataforma digital para asociaciones de transporte y operaciones logísticas, operada por IMPORT STAR PERUVIAN EIRL (RUC 20609699605).

Construimos CHASKI RUTA para reemplazar el manejo manual de colas, ventas de pasajes y manifiestos con un sistema centralizado que opera en tiempo real, pensado para la operación real de corredores por turnos en el Perú.

[Este es un borrador inicial editable desde Super Admin. Reemplázalo con la historia, misión o equipo real que quieras mostrar.]`,
  },
  // Vitrina de asociaciones clientes en la landing: cada elemento es la foto
  // real de una unidad (imagen subida por Super Admin) + el nombre de la
  // asociacion dueña como texto simple (ya no como imagen -- corregido 11
  // sept 2026). Vacio hasta que Super Admin suba la primera -- nunca un
  // vehiculo o asociacion de ejemplo inventada. Se muestran de a 2 por
  // pagina fija; intervalSeconds: cada cuanto avanza sola la vitrina.
  FLEET_SHOWCASE: { items: [], intervalSeconds: 3 },
  // Borradores iniciales, NUNCA texto legal definitivo -- son plantillas
  // genericas para que Jayde (idealmente con apoyo de un abogado) las revise
  // y las deje como el contenido real antes de considerarlas vinculantes.
  LEGAL_TERMS: {
    title: 'Términos y condiciones',
    body: `Estos Términos y Condiciones regulan el uso de la plataforma CHASKI AI / CHASKI RUTA, operada por IMPORT STAR PERUVIAN EIRL (RUC 20609699605). Al usar la plataforma, la asociación cliente y sus usuarios (administradores, socios, conductores) aceptan estas condiciones.

1. Objeto del servicio: CHASKI AI provee un sistema de gestión operativa (colas, manifiestos, viajes y reportes) para asociaciones de transporte, bajo los planes Operación, PRO y GPS Vehicular descritos en la plataforma.

2. Cuentas de usuario: cada cuenta es personal e intransferible. La asociación es responsable de mantener actualizados los datos de sus administradores, socios y conductores.

3. Datos operativos: la información registrada en la plataforma (colas, manifiestos, viajes, auditoría) pertenece a la asociación cliente; CHASKI AI la trata como confidencial y solo la usa para prestar el servicio.

4. Planes y pagos: el acceso a cada plan está sujeto al pago vigente según lo coordinado con CHASKI AI; la suspensión o cancelación de un plan se comunica con anticipación razonable.

5. Disponibilidad: CHASKI AI realiza esfuerzos razonables para mantener el servicio disponible, sin garantizar disponibilidad ininterrumpida.

6. Modificaciones: estos términos pueden actualizarse; los cambios relevantes se comunican a la asociación cliente.

[Este es un borrador inicial editable desde Super Admin. Revísalo -- idealmente con un abogado -- antes de considerarlo definitivo y vinculante.]`,
  },
  LEGAL_PRIVACY: {
    title: 'Política de privacidad',
    body: `IMPORT STAR PERUVIAN EIRL (CHASKI AI), RUC 20609699605, trata los datos personales que recibe a través de la plataforma conforme a la Ley N° 29733, Ley de Protección de Datos Personales, y su reglamento.

1. Datos que recopilamos: datos de contacto y de cuenta de administradores, socios y conductores (nombre, correo, teléfono, DNI cuando aplica); datos operativos (colas, manifiestos, viajes); y, en los planes con GPS, datos de ubicación del vehículo -- nunca del conductor como persona fuera de su turno.

2. Finalidad: prestar el servicio contratado por la asociación cliente, dar soporte, y cumplir obligaciones legales.

3. No vendemos datos personales a terceros. Compartimos datos únicamente con proveedores necesarios para operar el servicio (por ejemplo, hosting o mensajería), bajo confidencialidad.

4. Derechos ARCO: cualquier persona puede solicitar acceso, rectificación, cancelación u oposición sobre sus datos personales escribiendo a contacto@chaski.ai.

5. Conservación: los datos se conservan mientras dure la relación con la asociación cliente y el tiempo adicional exigido por ley.

[Este es un borrador inicial editable desde Super Admin. Revísalo -- idealmente con un abogado -- antes de considerarlo definitivo y vinculante.]`,
  },
  LEGAL_COOKIES: {
    title: 'Política de cookies',
    body: `La landing pública de CHASKI AI usa almacenamiento local del navegador (localStorage) para recordar tu preferencia de tema (claro/oscuro) y, dentro de la plataforma ya autenticada, para mantener tu sesión iniciada. No usamos cookies de publicidad ni de rastreo de terceros.

Puedes borrar esta información en cualquier momento desde la configuración de tu navegador; esto no afecta tu acceso a la landing pública, aunque sí cerrará tu sesión dentro de la plataforma si estabas conectado.

[Este es un borrador inicial editable desde Super Admin. Revísalo antes de considerarlo definitivo.]`,
  },
};

function isValidKey(key: string): key is LandingContentKey {
  return (LANDING_CONTENT_KEYS as readonly string[]).includes(key);
}

@Injectable()
export class LandingContentService {
  constructor(private prisma: PrismaService) {}

  /**
   * Publico, sin autenticacion -- lo consume Landing.tsx en cada carga. Nunca
   * lanza ni deja una seccion sin valor: si no hay fila en base de datos
   * todavia, devuelve el default (el contenido real de siempre) para esa
   * seccion puntual.
   */
  async getAll(): Promise<Record<LandingContentKey, unknown>> {
    const rows = await this.prisma.landingContent.findMany();
    const byKey = new Map(rows.map(r => [r.key, r.data]));
    const result = {} as Record<LandingContentKey, unknown>;
    for (const key of LANDING_CONTENT_KEYS) {
      result[key] = byKey.has(key) ? byKey.get(key) : DEFAULTS[key];
    }
    return result;
  }

  /**
   * Publico -- una seccion puntual (Super Admin la usa para editarla; las
   * paginas legales publicas tambien la usan para mostrar el contenido real
   * y su fecha de ultima actualizacion). No hay nada sensible en esta tabla
   * -- es contenido de la landing, igual que getAll() -- asi que no hace
   * falta autenticacion para leer una sola clave tampoco.
   */
  async getOne(key: string): Promise<{ key: string; data: unknown; isDefault: boolean; updatedAt: Date | null }> {
    if (!isValidKey(key)) {
      return { key, data: null, isDefault: true, updatedAt: null };
    }
    const row = await this.prisma.landingContent.findUnique({ where: { key } });
    return row
      ? { key, data: row.data, isDefault: false, updatedAt: row.updatedAt }
      : { key, data: DEFAULTS[key], isDefault: true, updatedAt: null };
  }

  /**
   * Solo Super Admin -- guarda directo (sin borrador/preview/historial, ver
   * comentario del modelo en schema.prisma). Crea la fila la primera vez que
   * alguien edita esa seccion.
   */
  async upsert(key: string, data: unknown, actor: JwtPayload) {
    const row = await this.prisma.landingContent.upsert({
      where: { key },
      create: { key, data: data as any, updatedById: actor.sub },
      update: { data: data as any, updatedById: actor.sub },
    });
    return row;
  }
}
