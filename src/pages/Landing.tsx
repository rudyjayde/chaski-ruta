import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle, ChevronDown, Menu, X, ArrowRight, BarChart2, ListOrdered, FileText, Route, ArrowLeftRight, Shield, Loader2, Moon, Sun } from 'lucide-react';

const WORDMARK_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/e_trim,f_png,q_auto/v1788027352/chaski-AI-nombre_1_1.png';
const TAGLINE = 'Plataformas inteligentes para modernas operaciones';
const LANDING_THEME_KEY = 'chaski-landing-theme';
type LandingTheme = 'light' | 'dark';

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

const PROBLEMS = [
  { title: 'Colas sin control', desc: 'Posiciones disputadas, excepciones sin registro y jornadas que empiezan en conflicto.' },
  { title: 'Manifiestos en papel', desc: 'Documentos extraviados, errores de registro y sin trazabilidad de correcciones.' },
  { title: 'Desequilibrio de flota', desc: 'Vehículos acumulados en un terminal mientras el otro carece de unidades.' },
  { title: 'Sin auditoría real', desc: 'Decisiones sin respaldo, responsabilidades difusas y datos inconsistentes.' },
  { title: 'Múltiples sistemas', desc: 'Hojas de cálculo, grupos de WhatsApp y registros sueltos sin integración.' },
  { title: 'Recaudación opaca', desc: 'Totales sin trazabilidad por método de pago ni verificación de tarifas.' },
];

const CAPABILITIES = [
  { icon: ListOrdered, label: 'Gestión de colas', desc: 'Cola digital por dirección con posicionamiento justo, llamado confirmado y excepciones auditadas.' },
  { icon: FileText, label: 'Ventas y manifiestos', desc: 'Registro de pasajeros por asiento, cierre de manifiesto con PDF y correcciones versionadas.' },
  { icon: Route, label: 'Control de viajes', desc: 'Seguimiento del ciclo completo: salida, tránsito y llegada con registro de evidencia.' },
  { icon: ArrowLeftRight, label: 'Reubicaciones', desc: 'Detección de desequilibrio, orden de traslado, compensación y auditoría sin manipular la cola.' },
  { icon: BarChart2, label: 'Reportes operativos', desc: 'Producción por unidad, empresa y jornada. Ausencias, incidencias y recaudación.' },
  { icon: Shield, label: 'Auditoría completa', desc: 'Cada acción registrada con actor, recurso, valores antes/después, motivo y marca de tiempo.' },
];

const PLAN_OPERACION = [
  'Gestión de colas digitales',
  'Ventas y manifiestos básicos',
  'Control de viajes',
  'Reportes de jornada',
  'Auditoría básica',
  'Soporte por correo',
];

const PLAN_PRO = [
  'Todo en Operación',
  'Reubicaciones con compensación',
  'Kiosco QR de terminal',
  'Correcciones de manifiesto con versión',
  'Auditoría extendida',
  'Reportes avanzados por empresa',
  'Soporte prioritario',
  'GPS PRO (módulo adicional)',
];


const GPS_VEHICLE_FEATURES = [
  'Equipo Teltonika instalado y configurado',
  'Ubicación y estado de señal en la cuenta del socio',
  'Historial de recorridos, paradas y kilómetros',
  'Alertas de desconexión, ignición y geocercas',
  'SIM, conectividad y soporte técnico',
];

function GPSVehicleCard() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    owner: '', email: '', phone: '', association: 'ATIPCAR',
    unitCode: '', plate: '', units: '1',
  });
  const setField = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setSent(true);
    }, 700);
  };

  return (
    <>
      <div className="border border-border rounded-lg p-6 flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-base font-semibold text-t1">GPS Vehicular</h3>
          <span className="text-[10px] bg-ok/10 text-ok px-2 py-0.5 rounded font-medium">Por unidad</span>
        </div>
        <p className="text-xs text-t2 mb-5">Para socios que desean controlar una o varias unidades, aunque su asociación permanezca en Operación.</p>
        <ul className="space-y-2 mb-5 flex-1">
          {GPS_VEHICLE_FEATURES.map(feature => (
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
                    <input required value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="9XXXXXXXX"
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
                    <input required value={form.plate} onChange={e => setField('plate', e.target.value)} placeholder="Ej. Z5C-444"
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

function PlanSection({ scrollTo }: { scrollTo: (id: string) => void }) {
  const [showProModal, setShowProModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    orgName: '', ruc: '', city: '', routes: '',
    contactName: '', email: '', phone: '',
    totalUnits: '', gpsUnits: '',
    period: 'MENSUAL', comments: '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); setSubmitted(true); }, 1000);
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
        <div className="border border-border rounded-lg p-6">
          <h3 className="text-base font-semibold text-t1 mb-1">Operación</h3>
          <p className="text-xs text-t2 mb-5">Para asociaciones que comienzan su digitalización.</p>
          <ul className="space-y-2 mb-6">
            {PLAN_OPERACION.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-t2">
                <CheckCircle size={14} className="text-ok mt-0.5 flex-shrink-0" /> {f}
              </li>
            ))}
          </ul>
          <button
            onClick={() => scrollTo('contacto')}
            className="w-full py-2 border border-border text-t1 rounded-lg text-sm font-medium hover:bg-hover transition-colors"
          >
            Solicitar información
          </button>
        </div>
        {/* PRO */}
        <div className="border-2 border-primary rounded-lg p-6 relative">
          <span className="absolute top-4 right-4 text-[10px] bg-primary text-white px-2 py-0.5 rounded-full font-medium">Recomendado</span>
          <h3 className="text-base font-semibold text-t1 mb-1">PRO</h3>
          <p className="text-xs text-t2 mb-5">Para asociaciones con operación compleja y múltiples empresas.</p>
          <ul className="space-y-2 mb-6">
            {PLAN_PRO.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-t2">
                <CheckCircle size={14} className="text-primary mt-0.5 flex-shrink-0" /> {f}
              </li>
            ))}
          </ul>
          <button
            onClick={() => setShowProModal(true)}
            className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors"
          >
            Solicitar información
          </button>
        </div>
        <GPSVehicleCard />
      </div>

      {/* PRO request modal */}
      {showProModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Solicitud de información Plan PRO">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold text-t1">Solicitud de información — Plan PRO</h2>
                <p className="text-xs text-t2 mt-0.5">CHASKI AI se comunicará para preparar la propuesta.</p>
              </div>
              <button onClick={() => { setShowProModal(false); setSubmitted(false); }} className="text-muted hover:text-t1" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            {submitted ? (
              <div className="p-8 text-center">
                <CheckCircle size={32} className="text-ok mx-auto mb-4" />
                <p className="text-sm font-semibold text-t1 mb-2">Solicitud recibida.</p>
                <p className="text-sm text-t2">CHASKI AI se comunicará para preparar la propuesta.</p>
                <button
                  onClick={() => { setShowProModal(false); setSubmitted(false); setForm({ orgName: '', ruc: '', city: '', routes: '', contactName: '', email: '', phone: '', totalUnits: '', gpsUnits: '', period: 'MENSUAL', comments: '' }); }}
                  className="mt-6 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-t1 mb-1">Nombre de la asociación *</label>
                    <input required value={form.orgName} onChange={e => set('orgName', e.target.value)} placeholder="ASOTRANS NORTE S.A."
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t1 mb-1">RUC</label>
                    <input value={form.ruc} onChange={e => set('ruc', e.target.value)} placeholder="20XXXXXXXXX"
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
                    <input required value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9XXXXXXXX"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t1 mb-1">Total de unidades *</label>
                    <input required type="number" min="1" value={form.totalUnits} onChange={e => set('totalUnits', e.target.value)} placeholder="30"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t1 mb-1">Unidades que requieren GPS</label>
                    <input type="number" min="0" value={form.gpsUnits} onChange={e => set('gpsUnits', e.target.value)} placeholder="0"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
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
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowProModal(false)} className="px-4 py-2 border border-border rounded-lg text-sm text-t2 hover:bg-hover">
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

interface Props {
  onNavigateToLogin: () => void;
}

export default function Landing({ onNavigateToLogin }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<LandingTheme>(getInitialTheme);
  const [contactForm, setContactForm] = useState({ org: '', email: '', message: '' });
  const [contactSent, setContactSent] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(LANDING_THEME_KEY, theme);
  }, [theme]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  const handleContact = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSent(true);
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
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <WordmarkImg height={24} />
            <nav className="hidden xl:flex items-center gap-6" aria-label="Navegación principal">
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
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}
              className="w-9 h-9 grid place-items-center border border-border text-t2 rounded-lg hover:bg-hover hover:text-t1 transition-colors flex-shrink-0"
              aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
              title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
              aria-pressed={theme === 'dark'}
            >
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button
              onClick={onNavigateToLogin}
              className="hidden sm:flex items-center gap-2 text-sm text-t2 hover:text-t1 transition-colors"
            >
              Ingresar a la plataforma
            </button>
            <button
              onClick={() => scrollTo('contacto')}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors"
            >
              Solicitar demostración
            </button>
            <button
              className="xl:hidden text-t2 hover:text-t1 p-1"
              onClick={() => setMenuOpen(v => !v)}
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
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
            <button onClick={onNavigateToLogin} className="block text-sm text-primary py-1 font-medium w-full text-left">
              Ingresar a la plataforma →
            </button>
          </div>
        )}
      </header>

      <main>
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-24 text-center" aria-labelledby="hero-heading">
          <div className="flex justify-center mb-8">
            <WordmarkImg height={40} />
          </div>
          <p className="text-base text-t2 mb-6 font-medium">{TAGLINE}</p>
          <h1 id="hero-heading" className="text-3xl lg:text-4xl font-semibold text-t1 max-w-3xl mx-auto leading-tight mb-6">
            Creamos plataformas digitales para asociaciones de transporte y operaciones logísticas.
          </h1>
          <p className="text-base text-t2 max-w-2xl mx-auto mb-10 leading-relaxed">
            Centralizamos colas, ventas, manifiestos, viajes y control operativo en un solo sistema.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => scrollTo('contacto')}
              className="px-6 py-3 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors"
            >
              Solicitar demostración
            </button>
            <button
              onClick={onNavigateToLogin}
              className="px-6 py-3 border border-border text-t1 rounded-lg text-sm font-medium hover:bg-hover transition-colors flex items-center justify-center gap-2"
            >
              Ingresar a la plataforma <ArrowRight size={15} />
            </button>
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
            {PROBLEMS.map(p => (
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
                {['Web para administradores, socios y conductores', 'App Android para conductores en campo', 'Kiosco QR para terminales', 'Panel super-admin para implementadores'].map(item => (
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
            {CAPABILITIES.map(cap => (
              <div key={cap.label} className="border border-border rounded-lg p-5">
                <cap.icon size={20} className="text-primary mb-3" />
                <h3 className="text-sm font-semibold text-t1 mb-2">{cap.label}</h3>
                <p className="text-sm text-t2 leading-relaxed">{cap.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Plans */}
        <PlanSection scrollTo={scrollTo} />

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
                <p><strong className="text-t1">IMPORT STAR PERUVIAN EIRL</strong></p>
                <p>RUC 20609699605</p>
                <p>contacto@chaski.ai</p>
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
                  <button type="submit" className="w-full h-10 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors">
                    Solicitar demostración
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
              <p className="text-xs text-t2 mt-2">{TAGLINE}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs text-t2">
              <div className="space-y-2">
                <p className="font-semibold text-t1 mb-1">Producto</p>
                {['CHASKI RUTA', 'Capacidades', 'Planes'].map(l => <p key={l} className="hover:text-t1 cursor-pointer">{l}</p>)}
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-t1 mb-1">Empresa</p>
                {['Sobre nosotros', 'Contacto'].map(l => <p key={l} className="hover:text-t1 cursor-pointer">{l}</p>)}
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-t1 mb-1">Legal</p>
                {['Términos de servicio', 'Política de privacidad', 'Política de cookies', 'Libro de Reclamaciones'].map(l => (
                  <p key={l} className="hover:text-t1 cursor-pointer">{l}</p>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-muted">
            <p>© {new Date().getFullYear()} IMPORT STAR PERUVIAN EIRL · RUC 20609699605</p>
            <p>CHASKI AI — {TAGLINE}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
