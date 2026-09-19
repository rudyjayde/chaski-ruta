import { useEffect, useState, type FormEvent } from 'react';
import { submitCommercialRequest } from '../lib/commercial-requests-api';
import { PHONE_ERROR, PLATE_ERROR, phoneInputProps, sanitizePhone, sanitizePlate, isValidPhone, isValidPlate, RUC_ERROR, isValidOptionalRuc, sanitizeRuc, rucInputProps } from '../lib/validators';
import { AccountPanelContent } from './VisitorAccountPage';
import { useAuth } from '../contexts/AuthContext';
import { getVisitorToken, fetchVisitorMe, clearVisitorToken } from '../lib/visitor-auth-api';
import { fetchLandingContent, type LandingContentData, type LandingPlan, type LandingFleetItem } from '../lib/landing-content-api';
import {
  CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Menu, X, BarChart2, ListOrdered, FileText, Route,
  ArrowLeftRight, ArrowRight, Shield, Loader2, Moon, Sun, User, type LucideIcon,
} from 'lucide-react';

const WORDMARK_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/e_trim,f_png,q_auto/v1788027352/chaski-AI-nombre_1_1.png';
const LANDING_THEME_KEY = 'chaski-landing-theme';
type LandingTheme = 'light' | 'dark';

// Contenido por defecto de la landing -- el mismo texto real de siempre.
// Se usa como valor inicial mientras se espera la respuesta de
// GET /landing-content, y como respaldo si esa llamada falla -- asi la
// landing publica nunca queda en blanco. Super Admin puede sobreescribir
// cualquiera de estos textos (docs/planes/landing-publica-y-solicitudes-
// comerciales.md §9).
//
// IMPORTANTE: este objeto debe coincidir exactamente con los defaults de
// backend/src/landing-content/landing-content.service.ts. Si cambias un
// texto aqui, cambialo alla tambien -- son dos copias de la misma regla, y
// ya encontramos un bug real (FleetPage vs. SeatMap, capacidad de Master)
// causado justo por eso: dos lugares con el mismo dato escrito por separado
// que se desincronizaron.
const DEFAULT_LANDING_CONTENT: LandingContentData = {
  HERO: {
    tagline: 'Plataformas inteligentes para modernas operaciones',
    title: 'Creamos plataformas digitales para asociaciones de transporte y operaciones logísticas.',
    subtitle: 'Centralizamos colas, ventas, manifiestos, viajes y control operativo en un solo sistema.',
    subtitleCaption: 'Para asociaciones de transporte y operaciones logísticas.',
    ctaPrimary: 'Solicitar demostración',
    ctaSecondary: 'Ingresar a la plataforma',
  },
  HERO_BACKGROUND: { imageUrl: '' },
  PROBLEMS: [
    { title: 'Colas sin control', desc: 'Posiciones disputadas, excepciones sin registro y jornadas que empiezan en conflicto.' },
    { title: 'Manifiestos en papel', desc: 'Documentos extraviados, errores de registro y sin trazabilidad de correcciones.' },
    { title: 'Desequilibrio de flota', desc: 'Vehículos acumulados en un terminal mientras el otro carece de unidades.' },
    { title: 'Sin auditoría real', desc: 'Decisiones sin respaldo, responsabilidades difusas y datos inconsistentes.' },
    { title: 'Múltiples sistemas', desc: 'Hojas de cálculo, grupos de WhatsApp y registros sueltos sin integración.' },
    { title: 'Recaudación opaca', desc: 'Totales sin trazabilidad por método de pago ni verificación de tarifas.' },
  ],
  CAPABILITIES: [
    { icon: 'ListOrdered', label: 'Gestión de colas', desc: 'Cola digital por dirección con posicionamiento justo, llamado confirmado y excepciones auditadas.' },
    { icon: 'FileText', label: 'Ventas y manifiestos', desc: 'Registro de pasajeros por asiento, cierre de manifiesto con PDF y correcciones versionadas.' },
    { icon: 'Route', label: 'Control de viajes', desc: 'Seguimiento del ciclo completo: salida, tránsito y llegada con registro de evidencia.' },
    { icon: 'ArrowLeftRight', label: 'Reubicaciones', desc: 'Detección de desequilibrio, orden de traslado, compensación y auditoría sin manipular la cola.' },
    { icon: 'BarChart2', label: 'Reportes operativos', desc: 'Producción por unidad, empresa y jornada. Ausencias, incidencias y recaudación.' },
    { icon: 'Shield', label: 'Auditoría completa', desc: 'Cada acción registrada con actor, recurso, valores antes/después, motivo y marca de tiempo.' },
  ],
  // Debe coincidir con los defaults del backend (landing-content.service.ts)
  // -- actualizado 13 sept 2026 tras auditar el codigo real: ver el
  // comentario extendido alla sobre que se quito (Kiosco QR nunca se
  // construyo, Auditoria no tiene version "extendida" distinta), que se
  // corrigio (reubicaciones/reportes/correcciones de manifiesto SIEMPRE
  // estuvieron disponibles desde Operacion, nunca fueron exclusivas de PRO)
  // y donde va mantenimiento predictivo/deteccion de accidentes (necesitan
  // GPS real para funcionar -- van en PRO y GPS Vehicular, nunca en
  // Operacion sola).
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
  CLIENTS_SHOWCASE: [],
  FAQ: [
    { question: '¿CHASKI RUTA reemplaza el proceso que ya tenemos?', answer: 'Sí. Reemplaza los procesos manuales de cola, venta de pasajes y manifiestos con un sistema digital centralizado que opera en tiempo real, pensado para la operación real de corredores por turnos.' },
    { question: '¿Necesito comprar hardware para empezar?', answer: 'No. El Plan Operación funciona solo con la app web y la app Android del conductor. El GPS físico es un servicio aparte (GPS Vehicular o Plan PRO) y se coordina por separado, instalación incluida.' },
    { question: '¿Qué pasa con mis datos si más adelante decido no continuar?', answer: 'Tus datos son tuyos: colas, manifiestos, viajes y reportes quedan guardados y auditados en tu propia asociación durante todo el tiempo que uses la plataforma.' },
    { question: '¿Cuánto tiempo toma implementarlo?', answer: 'Depende del tamaño de tu asociación y del número de rutas y empresas integrantes. Lo evaluamos juntos después de recibir tu solicitud, sin costo ni compromiso.' },
    { question: '¿El sistema funciona igual para varias empresas dentro de mi asociación?', answer: 'Sí. Cada empresa miembro se gestiona por separado dentro del mismo sistema, con sus propios vehículos, manifiestos y reportes.' },
  ],
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
  ABOUT: {
    title: 'Sobre nosotros',
    body: `CHASKI AI es una plataforma digital para asociaciones de transporte y operaciones logísticas, operada por IMPORT STAR PERUVIAN EIRL (RUC 20609699605).

Construimos CHASKI RUTA para reemplazar el manejo manual de colas, ventas de pasajes y manifiestos con un sistema centralizado que opera en tiempo real, pensado para la operación real de corredores por turnos en el Perú.`,
  },
  // Vacio hasta que Super Admin suba la primera pareja de imagenes -- nunca
  // un vehiculo/asociacion de ejemplo inventado.
  FLEET_SHOWCASE: { items: [], intervalSeconds: 3 },
  // Landing.tsx no lee estas 3 directamente (la pagina publica /legal/:slug
  // usa fetchLegalPage, que trae tambien la fecha real de actualizacion) --
  // estan aca solo para que DEFAULT_LANDING_CONTENT cumpla el tipo
  // LandingContentData completo. Deben coincidir con los defaults del
  // backend (landing-content.service.ts) igual que el resto de este objeto.
  LEGAL_TERMS: { title: '', body: '' },
  LEGAL_PRIVACY: { title: '', body: '' },
  LEGAL_COOKIES: { title: '', body: '' },
};

// Nombre del icono (guardado como texto en CAPABILITIES, editable desde Super
// Admin) -> componente real de lucide-react. Si algun dia se guarda un
// nombre que no existe en este mapa, cae a Shield en vez de romper la pagina.
const ICONS: Record<string, LucideIcon> = { ListOrdered, FileText, Route, ArrowLeftRight, BarChart2, Shield };
function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? Shield;
}

function getInitialTheme(): LandingTheme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(LANDING_THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function WordmarkImg({ className = '', height = 28 }: { className?: string; height?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={`font-semibold text-t1 ${className}`} style={{ fontSize: height * 0.7 }}>CHASKI AI</span>;
  return (
    <img
      src={WORDMARK_URL}
      alt="CHASKI AI"
      height={height}
      style={{ height, objectFit: 'contain', display: 'block' }}
      className={`landing-wordmark ${className}`}
      onError={() => setFailed(true)}
    />
  );
}

const NAV_LINKS = ['Soluciones', 'Cómo funciona', 'Planes', 'Empresa', 'Contacto'];

function GPSVehicleCard({ plan }: { plan: LandingPlan }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [website, setWebsite] = useState('');
  const [form, setForm] = useState({
    owner: '', email: '', phone: '', association: 'ATIPCAR',
    unitCode: '', plate: '', units: '1',
  });
  const setField = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValidPhone(form.phone)) {
      setError(PHONE_ERROR);
      return;
    }
    if (!isValidPlate(form.plate)) {
      setError(PLATE_ERROR);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitCommercialRequest({
        solution: 'GPS_VEHICULAR',
        contactName: form.owner,
        contactEmail: form.email,
        contactPhone: form.phone,
        orgName: form.association,
        answers: { unitCode: form.unitCode, plate: form.plate, units: form.units },
        website: website || undefined,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud. Intenta nuevamente.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="border border-border rounded-lg p-6 flex flex-col transition-all hover:border-primary hover:shadow-md">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-base font-semibold text-t1">{plan.name}</h3>
          <span className="text-[10px] bg-ok/10 text-ok px-2 py-0.5 rounded font-medium">Por unidad</span>
        </div>
        <p className="text-xs text-t2 mb-5">{plan.desc}</p>
        <ul className="space-y-2 mb-5 flex-1">
          {plan.features.map(feature => (
            <li key={feature} className="flex items-start gap-2 text-sm text-t2">
              <CheckCircle size={14} className="text-ok mt-0.5 flex-shrink-0" /> {feature}
            </li>
          ))}
        </ul>
        <div className="bg-bg border border-border rounded p-3 mb-4 text-xs text-t2">
          No cambia el plan de la asociación. El acceso GPS queda vinculado al socio propietario y al vehículo, nunca al conductor.
        </div>
        <button onClick={() => setOpen(true)}
          className="w-full py-2 bg-t1 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          Cotizar GPS para mi unidad
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Cotización GPS Vehicular">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold text-t1">Cotizar CHASKI GPS Vehicular</h2>
                <p className="text-xs text-t2 mt-0.5">Solicitud para instalación administrada por CHASKI AI.</p>
              </div>
              <button onClick={() => { setOpen(false); setSent(false); }} className="text-muted hover:text-t1" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            {sent ? (
              <div className="p-8 text-center">
                <CheckCircle size={34} className="text-ok mx-auto mb-4" />
                <p className="text-sm font-semibold text-t1 mb-2">Solicitud GPS-VEH-2026-0042 registrada</p>
                <p className="text-sm text-t2">El Super Admin validará la afiliación y preparará una cotización de equipo, instalación, SIM y servicio mensual.</p>
                <div className="mt-5 bg-bg border border-border rounded p-3 text-xs text-left text-t2">
                  Estado: <strong className="text-t1">Solicitada</strong>. No se activa GPS hasta verificar pago, instalar el dispositivo y aprobar la primera señal.
                </div>
                <button onClick={() => { setOpen(false); setSent(false); }} className="mt-6 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium">
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="p-6 space-y-4">
                <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}><label>Sitio web<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label></div>
                <div className="bg-primary/5 border border-primary/20 rounded p-3 text-xs text-t2">
                  Disponible inicialmente para socios de asociaciones que utilizan CHASKI RUTA.
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <label className="col-span-2 text-xs font-medium text-t1">Socio propietario *
                    <input required value={form.owner} onChange={e => setField('owner', e.target.value)} placeholder="Nombre completo"
                      className="mt-1 w-full h-9 px-3 border border-border rounded-lg text-sm font-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                  </label>
                  <label className="text-xs font-medium text-t1">Correo *
                    <input required type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="socio@correo.pe"
                      className="mt-1 w-full h-9 px-3 border border-border rounded-lg text-sm font-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                  </label>
                  <label className="text-xs font-medium text-t1">Teléfono *
                    <input required {...phoneInputProps} value={form.phone} onChange={e => setField('phone', sanitizePhone(e.target.value))} placeholder="9XXXXXXXX"
                      className="mt-1 w-full h-9 px-3 border border-border rounded-lg text-sm font-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                  </label>
                  <label className="col-span-2 text-xs font-medium text-t1">Asociación *
                    <select required value={form.association} onChange={e => setField('association', e.target.value)}
                      className="mt-1 w-full h-9 px-3 border border-border rounded-lg text-sm font-normal bg-surface focus:outline-none focus:ring-2 focus:ring-primary">
                      <option>ATIPCAR</option>
                      <option>Otra asociación CHASKI RUTA</option>
                    </select>
                  </label>
                  <label className="text-xs font-medium text-t1">Código de unidad *
                    <input required value={form.unitCode} onChange={e => setField('unitCode', e.target.value)} placeholder="Ej. 015"
                      className="mt-1 w-full h-9 px-3 border border-border rounded-lg text-sm font-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                  </label>
                  <label className="text-xs font-medium text-t1">Placa actual *
                    <input required autoComplete="off" value={form.plate} onChange={e => setField('plate', sanitizePlate(e.target.value, form.plate))} placeholder="Ej. Z5C-444"
                      className="mt-1 w-full h-9 px-3 border border-border rounded-lg text-sm font-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                  </label>
                  <label className="col-span-2 text-xs font-medium text-t1">Unidades a cotizar
                    <select value={form.units} onChange={e => setField('units', e.target.value)}
                      className="mt-1 w-full h-9 px-3 border border-border rounded-lg text-sm font-normal bg-surface focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="1">1 unidad</option><option value="2">2 unidades</option><option value="3">3 unidades</option>
                    </select>
                  </label>
                </div>
                <div className="text-xs text-t2 border-t border-border pt-4">
                  Flujo: solicitud → cotización → pago verificado → instalación → prueba de señal → activación.
                </div>
                {error && (
                  <p className="text-xs text-danger" role="alert">{error}</p>
                )}
                <button type="submit" disabled={sending}
                  className="w-full h-10 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                  {sending && <Loader2 size={14} className="animate-spin" />}
                  {sending ? 'Registrando…' : 'Enviar solicitud de cotización'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Formulario institucional (Operación y PRO) -- landing-publica-y-solicitudes-comerciales.md
// §3: mismo formulario para las dos soluciones, PRO solo agrega el campo de
// unidades que requieren GPS. El constructor dinamico de preguntas por
// solucion (§8) es Nivel 2/3 -- por ahora son campos fijos.
function PlanSection({ scrollTo, plans }: { scrollTo: (id: string) => void; plans: LandingContentData['PLANS'] }) {
  const [activeModal, setActiveModal] = useState<'OPERACION' | 'PRO' | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [website, setWebsite] = useState('');
  const [form, setForm] = useState({
    orgName: '', ruc: '', city: '', routes: '',
    contactName: '', email: '', phone: '',
    totalUnits: '', gpsUnits: '',
    period: 'MENSUAL', comments: '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const closeModal = () => { setActiveModal(null); setSubmitted(false); };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeModal) return;
    if (!isValidPhone(form.phone)) {
      setError(PHONE_ERROR);
      return;
    }
    if (!isValidOptionalRuc(form.ruc)) {
      setError(RUC_ERROR);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await submitCommercialRequest({
        solution: activeModal,
        contactName: form.contactName,
        contactEmail: form.email,
        contactPhone: form.phone,
        orgName: form.orgName,
        ruc: form.ruc || undefined,
        website: website || undefined,
        answers: {
          city: form.city,
          routes: form.routes,
          totalUnits: form.totalUnits,
          ...(activeModal === 'PRO' ? { gpsUnits: form.gpsUnits } : {}),
          period: form.period,
          comments: form.comments,
        },
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="planes" className="max-w-6xl mx-auto px-6 py-20" aria-labelledby="plans-heading">
      <div className="mb-12 max-w-xl">
        <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Planes</p>
        <h2 id="plans-heading" className="text-2xl font-semibold text-t1 leading-snug">
          Elige la cobertura adecuada para tu asociación o tu unidad.
        </h2>
        <p className="text-sm text-t2 mt-3">Operación y PRO se contratan por asociación. GPS Vehicular se contrata por cada unidad afiliada.</p>
      </div>
      <div className="grid lg:grid-cols-3 gap-6 max-w-5xl">
        {/* Operacion */}
        <div className="border border-border rounded-lg p-6 transition-all hover:border-primary hover:shadow-md">
          <h3 className="text-base font-semibold text-t1 mb-1">{plans.operacion.name}</h3>
          <p className="text-xs text-t2 mb-5">{plans.operacion.desc}</p>
          <ul className="space-y-2 mb-6">
            {plans.operacion.features.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-t2">
                <CheckCircle size={14} className="text-ok mt-0.5 flex-shrink-0" /> {f}
              </li>
            ))}
          </ul>
          <button
            onClick={() => setActiveModal('OPERACION')}
            className="w-full py-2 border border-border text-t1 rounded-lg text-sm font-medium hover:bg-hover transition-colors"
          >
            Solicitar información
          </button>
        </div>
        {/* PRO */}
        <div className="border-2 border-primary rounded-lg p-6 relative transition-shadow hover:shadow-md">
          <span className="absolute top-4 right-4 text-[10px] bg-primary text-white px-2 py-0.5 rounded-full font-medium">Recomendado</span>
          <h3 className="text-base font-semibold text-t1 mb-1">{plans.pro.name}</h3>
          <p className="text-xs text-t2 mb-5">{plans.pro.desc}</p>
          <ul className="space-y-2 mb-6">
            {plans.pro.features.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-t2">
                <CheckCircle size={14} className="text-primary mt-0.5 flex-shrink-0" /> {f}
              </li>
            ))}
          </ul>
          <button
            onClick={() => setActiveModal('PRO')}
            className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors"
          >
            Solicitar información
          </button>
        </div>
        <GPSVehicleCard plan={plans.gpsVehicular} />
      </div>

      {/* Formulario institucional -- Operacion y PRO comparten el mismo modal */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label={`Solicitud de información Plan ${activeModal === 'PRO' ? 'PRO' : 'Operación'}`}>
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold text-t1">Solicitud de información — Plan {activeModal === 'PRO' ? 'PRO' : 'Operación'}</h2>
                <p className="text-xs text-t2 mt-0.5">CHASKI AI se comunicará para preparar la propuesta.</p>
              </div>
              <button onClick={closeModal} className="text-muted hover:text-t1" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            {submitted ? (
              <div className="p-8 text-center">
                <CheckCircle size={32} className="text-ok mx-auto mb-4" />
                <p className="text-sm font-semibold text-t1 mb-2">Solicitud recibida.</p>
                <p className="text-sm text-t2">CHASKI AI se comunicará para preparar la propuesta.</p>
                <button
                  onClick={() => { closeModal(); setForm({ orgName: '', ruc: '', city: '', routes: '', contactName: '', email: '', phone: '', totalUnits: '', gpsUnits: '', period: 'MENSUAL', comments: '' }); }}
                  className="mt-6 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}><label>Sitio web<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-t1 mb-1">Nombre de la asociación *</label>
                    <input required maxLength={150} value={form.orgName} onChange={e => set('orgName', e.target.value)} placeholder="ASOTRANS NORTE S.A."
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t1 mb-1">RUC</label>
                    <input {...rucInputProps} value={form.ruc} onChange={e => set('ruc', sanitizeRuc(e.target.value))} placeholder="20XXXXXXXXX"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t1 mb-1">Ciudad *</label>
                    <input required value={form.city} onChange={e => set('city', e.target.value)} placeholder="Puno"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-t1 mb-1">Rutas que operan *</label>
                    <input required value={form.routes} onChange={e => set('routes', e.target.value)} placeholder="Puno → Juli, Juli → Puno"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-t1 mb-1">Persona de contacto *</label>
                    <input required value={form.contactName} onChange={e => set('contactName', e.target.value)} placeholder="Nombre completo"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t1 mb-1">Correo *</label>
                    <input required type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contacto@asociacion.pe"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t1 mb-1">Teléfono *</label>
                    <input required {...phoneInputProps} value={form.phone} onChange={e => set('phone', sanitizePhone(e.target.value))} placeholder="9XXXXXXXX"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className={activeModal === 'PRO' ? '' : 'col-span-2'}>
                    <label className="block text-xs font-medium text-t1 mb-1">Total de unidades *</label>
                    <input required type="number" min="1" value={form.totalUnits} onChange={e => set('totalUnits', e.target.value)} placeholder="30"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  {activeModal === 'PRO' && (
                    <div>
                      <label className="block text-xs font-medium text-t1 mb-1">Unidades que requieren GPS</label>
                      <input type="number" min="0" value={form.gpsUnits} onChange={e => set('gpsUnits', e.target.value)} placeholder="0"
                        className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  )}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-t1 mb-1">Preferencia de facturación</label>
                    <div className="flex gap-3">
                      {(['MENSUAL', 'ANUAL'] as const).map(p => (
                        <button key={p} type="button" onClick={() => set('period', p)}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${form.period === p ? 'bg-primary text-white border-primary' : 'border-border text-t2 hover:bg-hover'}`}>
                          {p === 'MENSUAL' ? 'Mensual' : 'Anual'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-t1 mb-1">Comentarios adicionales</label>
                    <textarea value={form.comments} onChange={e => set('comments', e.target.value)} rows={3} placeholder="Cuéntanos sobre tu operación..."
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                  </div>
                </div>
                {error && (
                  <p className="text-xs text-danger" role="alert">{error}</p>
                )}
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 border border-border rounded-lg text-sm text-t2 hover:bg-hover">
                    Cancelar
                  </button>
                  <button type="submit" disabled={loading}
                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-60 flex items-center gap-2">
                    {loading ? <><Loader2 size={14} className="animate-spin" /> Enviando…</> : 'Enviar solicitud'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// Vitrina de clientes reales: logo de la asociacion + una imagen con las
// rutas que opera (ambas subidas por Super Admin, nunca texto que redacte el
// sistema). Se muestran todos juntos en una fila, sin rotar -- nunca un
// cliente de ejemplo inventado, oculta mientras no haya ninguno cargado.
function ClientsShowcase({ items }: { items: LandingContentData['CLIENTS_SHOWCASE'] }) {
  if (items.length === 0) return null;
  return (
    <section id="empresa" className="max-w-6xl mx-auto px-6 py-20" aria-labelledby="clients-heading">
      <p id="clients-heading" className="text-xs font-semibold text-primary uppercase tracking-widest mb-8 text-center">
        Clientes de referencia
      </p>
      <div className="flex flex-wrap items-center justify-center gap-10 sm:gap-14">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-3">
            <img src={item.logoUrl} alt="Logo de asociación cliente" className="h-16 w-auto object-contain" />
            <img src={item.routesImageUrl} alt="Rutas que opera" className="h-8 w-auto object-contain" />
          </div>
        ))}
      </div>
    </section>
  );
}

function FaqSection({ items }: { items: LandingContentData['FAQ'] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (items.length === 0) return null;
  return (
    <section id="faq" className="max-w-6xl mx-auto px-6 py-20" aria-labelledby="faq-heading">
      <div className="mb-12 max-w-xl">
        <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Preguntas frecuentes</p>
        <h2 id="faq-heading" className="text-2xl font-semibold text-t1 leading-snug">
          Lo que suelen preguntarnos antes de empezar.
        </h2>
      </div>
      <div className="max-w-3xl border-t border-border">
        {items.map((item, i) => {
          const open = openIndex === i;
          return (
            <div key={item.question} className="border-b border-border">
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : i)}
                className="w-full flex items-center justify-between gap-4 py-4 text-left"
                aria-expanded={open}
              >
                <span className="text-sm font-medium text-t1">{item.question}</span>
                <ChevronDown size={16} className={`text-t2 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <p className="text-sm text-t2 leading-relaxed pb-4 pr-8">{item.answer}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Vitrina de asociaciones clientes -- cada tarjeta es un PAR de imagenes ya
// subidas por Super Admin (foto real de la unidad + nombre estilizado de la
// asociacion dueña, como imagen). Muestra hasta 3 unidades a la vez
// (anterior/activa/siguiente) y avanza sola cada `intervalSeconds` (editable
// desde Super Admin) -- si hay mas de 3 asociaciones cargadas, la ventana se
// desliza para mostrarlas todas por turnos. El nombre de abajo siempre
// corresponde a la unidad activa (centro).
// Vitrina de flota: 2 unidades por pagina fija (1-2, 3-4, ...) -- si el
// numero de asociaciones cargadas es impar, la ultima pagina muestra 1 sola
// en vez de repetir una para rellenar. `onDark` la pone en texto claro fijo
// (no ligado al tema claro/oscuro) cuando vive sobre la foto de fondo del
// hero, que Super Admin sube clara/luminosa (ver mockup) -- sin eso el modo
// oscuro del sitio volvería el texto ilegible sobre esa misma foto.
function FleetShowcase({ items, intervalSeconds, onDark }: { items: LandingFleetItem[]; intervalSeconds: number; onDark: boolean }) {
  const pageSize = 2;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (pageCount < 2) return;
    const id = setInterval(() => setPage(p => (p + 1) % pageCount), Math.max(1, intervalSeconds) * 1000);
    return () => clearInterval(id);
  }, [pageCount, intervalSeconds]);

  const pageItems = items.slice(page * pageSize, page * pageSize + pageSize);
  const labelClass = onDark ? 'text-[#0f172a]/60' : 'text-t2';
  const nameClass = onDark ? 'text-[#0f172a]' : 'text-t1';
  const iconBtnClass = onDark
    ? 'text-[#0f172a]/60 hover:text-[#0f172a]'
    : 'text-t2 hover:text-t1';

  return (
    <div aria-label="Asociaciones que confían en CHASKI AI">
      {/* Grid (no flex) a proposito: con flex + ancho libre, dos fotos anchas
          terminaban superpuestas -- el item se encoge bajo presion de espacio
          pero la imagen seguia pintando a su ancho completo. Un grid de
          columnas fijas le reserva a cada vehiculo su propia columna real,
          asi la imagen (limitada tambien en ancho, no solo en alto) nunca
          puede invadir la columna vecina. */}
      <div className={`grid ${pageItems.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-6 sm:gap-10 items-end mb-6`}>
        {pageItems.map((item, i) => (
          <div key={page * pageSize + i} className="flex flex-col items-center min-w-0">
            <div className="h-56 sm:h-72 md:h-96 w-full flex items-end justify-center overflow-hidden">
              <img
                src={item.vehicleImageUrl}
                alt={item.name ? `Unidad de ${item.name}` : 'Unidad de una asociación cliente'}
                className="max-h-full max-w-full object-contain object-bottom transition-transform duration-300 hover:scale-105"
              />
            </div>
            {item.name && (
              <p className={`mt-2 text-xs sm:text-sm tracking-[0.15em] uppercase font-medium ${nameClass}`}>{item.name}</p>
            )}
          </div>
        ))}
      </div>

      {/* Linea de punta a punta de la ventana, igual que el border-b del
          <header> (que tampoco vive dentro del contenedor con margen) -- el
          truco es sacar este div del ancho del padre (w-screen + recentrado)
          y volver a meter el max-w-6xl solo para el contenido de adentro. */}
      <div className={`relative w-screen left-1/2 -translate-x-1/2 border-t ${onDark ? 'border-[#0f172a]/15' : 'border-border'}`}>
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between pt-3">
          <p className={`text-xs tracking-[0.2em] uppercase ${labelClass}`}>Empresas de transporte</p>
          {pageCount > 1 && (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setPage(p => (p - 1 + pageCount) % pageCount)} aria-label="Anterior" className={iconBtnClass}>
                <ChevronLeft size={16} />
              </button>
              <span className={`text-xs font-mono ${labelClass}`}>{String(page + 1).padStart(2, '0')} / {String(pageCount).padStart(2, '0')}</span>
              <button type="button" onClick={() => setPage(p => (p + 1) % pageCount)} aria-label="Siguiente" className={iconBtnClass}>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  onNavigateToLogin: () => void;
  navigate: (to: string) => void;
}

export default function Landing({ onNavigateToLogin, navigate }: Props) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  // Panel de cuenta (login/registro de visitante, o vista de "mis
  // cotizaciones") -- solo se abre cuando la persona hace clic, nunca solo.
  // Si el correo resulta ser un socio/conductor/admin real (`user` activo),
  // el boton "Ingresar a la plataforma" vive directo en el encabezado, sin
  // pasar por el modal para nada.
  const [showAccount, setShowAccount] = useState(false);
  const [visitorName, setVisitorName] = useState<string | null>(null);
  useEffect(() => {
    if (user || !getVisitorToken()) return;
    fetchVisitorMe()
      .then(v => setVisitorName(v ? (v.name || v.email) : null))
      .catch(() => clearVisitorToken());
  }, [user]);
  const [theme, setTheme] = useState<LandingTheme>(getInitialTheme);
  const [contactForm, setContactForm] = useState({ org: '', email: '', message: '' });
  const [contactSent, setContactSent] = useState(false);
  const [contactSending, setContactSending] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  // Contenido editable desde Super Admin -- arranca con el texto de siempre
  // (DEFAULT_LANDING_CONTENT) y se sobreescribe si GET /landing-content
  // responde con algo distinto. Si la llamada falla, se queda con el default
  // -- nunca se muestra una landing en blanco por un backend caido.
  const [content, setContent] = useState<LandingContentData>(DEFAULT_LANDING_CONTENT);

  useEffect(() => {
    let active = true;
    fetchLandingContent().then(data => {
      if (active && data) setContent(data);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LANDING_THEME_KEY, theme);
  }, [theme]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  // El hero (y la vitrina de flota, que comparte la misma seccion) fuerza
  // texto oscuro fijo cuando hay foto de fondo -- Super Admin sube fotos
  // claras/luminosas para este bloque (ver mockup), asi que el texto oscuro
  // siempre queda legible ahi, sin depender de si el tema del sitio esta en
  // claro u oscuro.
  const hasHeroBackground = Boolean(content.HERO_BACKGROUND.imageUrl);

  const handleContact = async (e: FormEvent) => {
    e.preventDefault();
    setContactSending(true);
    setContactError(null);
    try {
      await submitCommercialRequest({
        solution: 'OPERACION',
        contactName: contactForm.org,
        contactEmail: contactForm.email,
        orgName: contactForm.org,
        answers: { message: contactForm.message },
      });
      setContactSent(true);
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje. Intenta nuevamente.');
    } finally {
      setContactSending(false);
    }
  };

  return (
    <div className={`min-h-screen bg-surface text-t1 transition-colors duration-200 ${theme === 'dark' ? 'landing-theme-dark' : 'landing-theme-light'}`}>
      <style>{`
        .landing-theme-dark {
          color-scheme: dark;
          --color-primary: #6D96FF;
          --color-primary-h: #8AAAFF;
          --color-accent: #FF9A4A;
          --color-teal: #2DD4BF;
          --color-ok: #41D17D;
          --color-warn: #F6B95E;
          --color-danger: #FF7373;
          --color-bg: #090D14;
          --color-surface: #101620;
          --color-border: #2A3443;
          --color-t1: #F5F7FA;
          --color-t2: #C4CBD5;
          --color-muted: #8D98A8;
          --color-hover: #192230;
          --color-selected: #172A49;
        }
        .landing-theme-dark .landing-wordmark {
          filter: invert(1) brightness(1.2);
        }
        .landing-theme-dark {
          background-color: #101620 !important;
          color: #F5F7FA !important;
        }
        .landing-theme-dark .bg-surface { background-color: #101620 !important; }
        .landing-theme-dark .bg-bg { background-color: #090D14 !important; }
        .landing-theme-dark .text-t1 { color: #F5F7FA !important; }
        .landing-theme-dark .text-t2 { color: #C4CBD5 !important; }
        .landing-theme-dark .text-muted { color: #8D98A8 !important; }
        .landing-theme-dark .border-border { border-color: #2A3443 !important; }
        .landing-theme-dark .bg-t1 { background-color: #F5F7FA !important; color: #090D14 !important; }
        .landing-theme-dark [class*='hover:bg-hover']:hover { background-color: #192230 !important; }
        .landing-theme-dark input,
        .landing-theme-dark textarea,
        .landing-theme-dark select {
          color-scheme: dark;
          background-color: #0C111A;
          color: #F5F7FA;
        }
        .landing-theme-dark input::placeholder,
        .landing-theme-dark textarea::placeholder { color: #7D8898; }
      `}</style>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-surface border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <WordmarkImg height={24} className="max-w-[46vw] sm:max-w-none" />
          {/* Menu + "Iniciar sesion" agrupados juntos a la derecha (igual que
              el mockup) -- antes el menu vivia pegado al logo y "Iniciar
              sesion" quedaba solo, lejos a la derecha, con un hueco enorme
              en medio. Ahora el unico justify-between real es logo vs. todo
              lo demas junto. */}
          <div className="flex items-center gap-8 min-w-0">
            <nav className="hidden xl:flex items-center gap-5 flex-shrink-0" aria-label="Navegación principal">
              {NAV_LINKS.map(link => (
                <button
                  key={link}
                  onClick={() => scrollTo(link.toLowerCase().replace(/\s/g, '-').replace('ó', 'o').replace('é', 'e'))}
                  className="text-sm text-t2 hover:text-t1 transition-colors"
                >
                  {link}
                </button>
              ))}
            </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            {user && (
              <button
                onClick={() => navigate(user.role === 'superadmin' ? '/app' : '/portal')}
                className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors whitespace-nowrap flex-shrink-0"
              >
                <span className="hidden sm:inline">Ingresar a la plataforma</span>
                <span className="sm:hidden">Ingresar</span>
              </button>
            )}
            {(user || visitorName) && (
              <button
                type="button"
                onClick={() => setShowAccount(v => !v)}
                className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-t1 hover:text-primary transition-colors border border-border rounded-lg px-3 py-1.5 flex-shrink-0"
              >
                <User size={16} />
                Mi cuenta
              </button>
            )}
            {!user && !visitorName && (
              <button
                type="button"
                onClick={() => setShowAccount(true)}
                className="hidden sm:block text-sm text-t2 hover:text-t1 transition-colors"
              >
                Iniciar sesión
              </button>
            )}
            <button
              className="xl:hidden text-t2 hover:text-t1 p-1"
              onClick={() => setMenuOpen(v => !v)}
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
          </div>
        </div>

        {/* Mobile nav */}
        {menuOpen && (
          <div className="xl:hidden border-t border-border bg-surface px-6 py-4 space-y-3">
            {NAV_LINKS.map(link => (
              <button
                key={link}
                onClick={() => scrollTo(link.toLowerCase().replace(/\s/g, '-').replace('ó', 'o').replace('é', 'e'))}
                className="block text-sm text-t2 hover:text-t1 py-1 w-full text-left"
              >
                {link}
              </button>
            ))}
            {user ? (
              <button
                type="button"
                onClick={() => { navigate(user.role === 'superadmin' ? '/app' : '/portal'); setMenuOpen(false); }}
                className="block text-sm text-primary py-1 font-medium w-full text-left"
              >
                Ingresar a la plataforma →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setShowAccount(true); setMenuOpen(false); }}
                className="block text-sm text-primary py-1 font-medium w-full text-left"
              >
                {visitorName ? `Hola, ${visitorName} →` : 'Iniciar sesión →'}
              </button>
            )}
          </div>
        )}
      </header>

      <main>
        {/* Hero + vitrina de flota -- comparten un mismo fondo (foto subida por
            Super Admin en "Landing fondo"). Sin fondo subido todavia, se ve
            igual que siempre (fondo plano del tema).
            Nota (Jayde, 11 sept 2026): se probo forzar todo el bloque a
            caber en una sola pantalla (min-height + justify-between), pero
            eso obligaba a achicar los vehiculos cada vez que algo mas crecia.
            Se prioriza el tamaño grande del mockup: el bloque fluye con su
            alto natural, y si el pie ("Empresas de transporte" + flechas)
            queda un poco mas abajo, se llega con un scroll corto -- igual
            que cualquier pagina normal. */}
        <section
          className="relative overflow-hidden"
          aria-labelledby="hero-heading"
          style={hasHeroBackground ? { backgroundImage: `url(${content.HERO_BACKGROUND.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          <div className="relative max-w-6xl mx-auto w-full px-6 pt-16 pb-10">
            <div className="grid md:grid-cols-2 gap-6 md:gap-12 items-start mb-8 md:mb-10">
              <div>
                <p className={`text-xs tracking-[0.25em] uppercase mb-3 ${hasHeroBackground ? 'text-[#0f172a]/60' : 'text-t2'}`}>
                  {content.HERO.tagline}
                </p>
                <h1 id="hero-heading" className={`text-4xl lg:text-6xl font-medium leading-[1.1] ${hasHeroBackground ? 'text-[#0f172a]' : 'text-t1'}`}>
                  {content.HERO.title}
                </h1>
              </div>
              <div className="max-w-sm">
                {content.HERO.subtitle && (
                  <p className={`text-base sm:text-lg font-medium ${hasHeroBackground ? 'text-[#0f172a]' : 'text-t1'}`}>
                    {content.HERO.subtitle}
                  </p>
                )}
                {content.HERO.subtitleCaption && (
                  <p className={`text-sm mt-2 ${hasHeroBackground ? 'text-[#0f172a]/60' : 'text-t2'}`}>
                    {content.HERO.subtitleCaption}
                  </p>
                )}
                {/* Boton oscuro fijo (no bg-primary) solo en este hero -- decision
                    puntual de Jayde para calzar con el mockup, no un cambio de
                    color de marca en el resto del sitio. */}
                <button
                  onClick={() => scrollTo('contacto')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#0f172a] text-white rounded-lg text-sm font-medium hover:bg-[#1e293b] transition-colors mt-5"
                >
                  {content.HERO.ctaPrimary}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {content.FLEET_SHOWCASE.items.length > 0 && (
              <FleetShowcase
                items={content.FLEET_SHOWCASE.items}
                intervalSeconds={content.FLEET_SHOWCASE.intervalSeconds}
                onDark={hasHeroBackground}
              />
            )}
          </div>
        </section>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Problems */}
        <section id="soluciones" className="max-w-6xl mx-auto px-6 py-20" aria-labelledby="problems-heading">
          <div className="mb-12 max-w-xl">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Problemas que resolvemos</p>
            <h2 id="problems-heading" className="text-2xl font-semibold text-t1 leading-snug">
              Las asociaciones de transporte enfrentan los mismos problemas operativos cada día.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {content.PROBLEMS.map(p => (
              <div key={p.title} className="border border-border rounded-lg p-5">
                <h3 className="text-sm font-semibold text-t1 mb-2">{p.title}</h3>
                <p className="text-sm text-t2 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-border" />

        {/* CHASKI RUTA product */}
        <section id="como-funciona" className="max-w-6xl mx-auto px-6 py-20" aria-labelledby="product-heading">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Producto</p>
              <h2 id="product-heading" className="text-2xl font-semibold text-t1 mb-4 leading-snug">CHASKI RUTA</h2>
              <p className="text-sm text-t2 leading-relaxed mb-6">
                Software operativo para asociaciones de transporte por turnos. Reemplaza los procesos manuales de cola, venta de pasajes y manifiestos con un sistema digital centralizado que opera en tiempo real.
              </p>
              <p className="text-sm text-t2 leading-relaxed mb-6">
                Diseñado para la operación real de corredores por turnos: la cola de la asociación determina el orden de salida, no una app de demanda individual.
              </p>
              <ul className="space-y-2">
                {['Web para administradores, socios y conductores', 'App Android para conductores en campo', 'Panel super-admin para implementadores'].map(item => (
                  <li key={item} className="flex items-start gap-2 text-sm text-t2">
                    <CheckCircle size={15} className="text-ok mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-bg border border-border rounded-lg p-6 space-y-4">
              <h3 className="text-xs font-semibold text-t2 uppercase tracking-wide">Flujo operativo típico</h3>
              {[
                ['1', 'El conductor se inscribe en la cola desde su Android'],
                ['2', 'El administrador llama al siguiente y confirma presencia en terminal'],
                ['3', 'El conductor registra pasajeros y genera el manifiesto'],
                ['4', 'El sistema cierra el viaje al registrar la llegada'],
                ['5', 'Todo queda auditado con actor, hora y evidencia'],
              ].map(([n, text]) => (
                <div key={n} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                  <p className="text-sm text-t1">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Capabilities */}
        <section id="capacidades" className="max-w-6xl mx-auto px-6 py-20" aria-labelledby="caps-heading">
          <div className="mb-12 max-w-xl">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Capacidades</p>
            <h2 id="caps-heading" className="text-2xl font-semibold text-t1 leading-snug">
              Todo lo que necesita una asociación de transporte en un solo sistema.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {content.CAPABILITIES.map(cap => {
              const Icon = resolveIcon(cap.icon);
              return (
                <div key={cap.label} className="border border-border rounded-lg p-5">
                  <Icon size={20} className="text-primary mb-3" />
                  <h3 className="text-sm font-semibold text-t1 mb-2">{cap.label}</h3>
                  <p className="text-sm text-t2 leading-relaxed">{cap.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Cliente de referencia */}
        <ClientsShowcase items={content.CLIENTS_SHOWCASE} />

        <div className="border-t border-border" />

        {/* Plans */}
        <PlanSection scrollTo={scrollTo} plans={content.PLANS} />

        <div className="border-t border-border" />

        {/* FAQ */}
        <FaqSection items={content.FAQ} />

        <div className="border-t border-border" />

        {/* Contact */}
        <section id="contacto" className="max-w-6xl mx-auto px-6 py-20" aria-labelledby="contact-heading">
          <div className="grid lg:grid-cols-2 gap-12">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Contacto</p>
              <h2 id="contact-heading" className="text-2xl font-semibold text-t1 mb-4 leading-snug">
                Agenda una demostración con tu asociación.
              </h2>
              <p className="text-sm text-t2 leading-relaxed mb-6">
                Te mostramos CHASKI RUTA funcionando con datos de un corredor similar al tuyo. Sin compromiso y sin costo.
              </p>
              <div className="space-y-3 text-sm text-t2">
                <p><strong className="text-t1">{content.COMPANY.legalName}</strong></p>
                <p>RUC {content.COMPANY.ruc}</p>
                <p>{content.COMPANY.contactEmail}</p>
                {content.COMPANY.whatsapp && <p>WhatsApp {content.COMPANY.whatsapp}</p>}
                {content.COMPANY.address && <p>{content.COMPANY.address}</p>}
                {(content.COMPANY.instagramUrl || content.COMPANY.facebookUrl || content.COMPANY.tiktokUrl) && (
                  <div className="flex items-center gap-2 pt-1">
                    {content.COMPANY.instagramUrl && (
                      <a href={content.COMPANY.instagramUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-semibold text-t2 hover:text-t1 border border-border rounded px-1.5 py-1">
                        Instagram
                      </a>
                    )}
                    {content.COMPANY.facebookUrl && (
                      <a href={content.COMPANY.facebookUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-semibold text-t2 hover:text-t1 border border-border rounded px-1.5 py-1">
                        Facebook
                      </a>
                    )}
                    {content.COMPANY.tiktokUrl && (
                      <a href={content.COMPANY.tiktokUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-semibold text-t2 hover:text-t1 border border-border rounded px-1.5 py-1">
                        TikTok
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="bg-bg border border-border rounded-lg p-6">
              {contactSent ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                  <CheckCircle size={32} className="text-ok mb-4" />
                  <p className="text-sm font-semibold text-t1 mb-2">Mensaje recibido</p>
                  <p className="text-xs text-t2">Nos pondremos en contacto en breve. Tu solicitud quedó registrada para seguimiento.</p>
                </div>
              ) : (
                <form onSubmit={handleContact} className="space-y-4">
                  <div>
                    <label htmlFor="org" className="block text-xs font-medium text-t1 mb-1">Nombre de la asociación</label>
                    <input
                      id="org"
                      type="text"
                      value={contactForm.org}
                      onChange={e => setContactForm(f => ({ ...f, org: e.target.value }))}
                      required
                      placeholder="Ej. ATIPCAR"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-xs font-medium text-t1 mb-1">Correo de contacto</label>
                    <input
                      id="contact-email"
                      type="email"
                      value={contactForm.email}
                      onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                      required
                      placeholder="correo@asociacion.pe"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-msg" className="block text-xs font-medium text-t1 mb-1">Mensaje (opcional)</label>
                    <textarea
                      id="contact-msg"
                      rows={3}
                      value={contactForm.message}
                      onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))}
                      placeholder="Describe brevemente tu operación y corredor…"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </div>
                  {contactError && (
                    <p className="text-xs text-danger" role="alert">{contactError}</p>
                  )}
                  <button type="submit" disabled={contactSending}
                    className="w-full h-10 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                    {contactSending && <Loader2 size={14} className="animate-spin" />}
                    {contactSending ? 'Enviando…' : 'Solicitar demostración'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-bg">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 mb-8">
            <div>
              <WordmarkImg height={20} className="mb-2" />
              <p className="text-xs text-t2 mt-2">{content.HERO.tagline}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs text-t2">
              <div className="space-y-2">
                <p className="font-semibold text-t1 mb-1">Producto</p>
                {[
                  { label: 'Problemas que resolvemos', id: 'soluciones' },
                  { label: 'Producto', id: 'como-funciona' },
                  { label: 'Capacidades', id: 'capacidades' },
                  { label: 'Clientes de referencia', id: 'empresa' },
                  { label: 'Planes', id: 'planes' },
                  { label: 'Preguntas frecuentes', id: 'faq' },
                  { label: 'Contacto', id: 'contacto' },
                ].map(l => (
                  <button key={l.id} type="button" onClick={() => scrollTo(l.id)} className="block text-left hover:text-t1">{l.label}</button>
                ))}
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-t1 mb-1">Empresa</p>
                <button type="button" onClick={() => navigate('/empresa')} className="block text-left hover:text-t1">Sobre nosotros</button>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-t1 mb-1">Legal</p>
                <a href="/legal/terminos-condiciones" className="block hover:text-t1">Términos y condiciones</a>
                <a href="/legal/politica-privacidad" className="block hover:text-t1">Política de privacidad</a>
                <a href="/legal/politica-cookies" className="block hover:text-t1">Política de cookies</a>
                <a href="/libro-de-reclamaciones" className="block hover:text-t1">Libro de Reclamaciones</a>
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-muted">
            <p>© {new Date().getFullYear()} {content.COMPANY.legalName} · RUC {content.COMPANY.ruc}</p>
            <p>CHASKI AI — {content.HERO.tagline}</p>
          </div>
        </div>
      </footer>

      {showAccount && (user || visitorName) && (
        <>
          {/* Dropdown de cuenta ya identificada (socio/conductor/admin o visitante) --
              pegado cerca del boton "Mi cuenta", sin oscurecer la pagina. */}
          <div className="fixed inset-0 z-40" onClick={() => setShowAccount(false)} />
          <div
            className="fixed top-[68px] right-4 sm:right-6 z-50 w-[calc(100%-2rem)] max-w-sm sm:w-80 bg-surface border border-border rounded-lg shadow-xl p-5"
            role="dialog"
            aria-modal="true"
          >
            <button
              onClick={() => setShowAccount(false)}
              className="absolute top-3 right-3 text-muted hover:text-t1"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
            <AccountPanelContent navigate={navigate} />
          </div>
        </>
      )}

      {showAccount && !user && !visitorName && (
        // Login/registro (todavia sin identificar a nadie) -- modal centrado,
        // como cualquier formulario de inicio de sesion, no un dropdown chico.
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6 relative">
            <button
              onClick={() => setShowAccount(false)}
              className="absolute top-4 right-4 text-muted hover:text-t1"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <AccountPanelContent navigate={navigate} />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}
        className="fixed bottom-5 right-5 z-40 w-11 h-11 grid place-items-center border border-border bg-surface text-t2 rounded-full shadow-lg hover:bg-hover hover:text-t1 transition-colors"
        aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
        title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
        aria-pressed={theme === 'dark'}
      >
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>
    </div>
  );
}
