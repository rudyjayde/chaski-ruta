import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Building2, Activity,
  HeadphonesIcon, ShieldCheck, Settings, Plus, X, ChevronRight, ArrowRight,
  AlertTriangle, CheckCircle, Users,
  FileText, AlertCircle, RefreshCw, ChevronDown,
  RotateCcw, Upload, ImageIcon, MapPin, Search, Map, LogIn, Pencil, ChevronLeft, Globe, Sparkles,
} from 'lucide-react';
import Shell, { type NavItem } from '../../components/layout/Shell';
import TerminalMapPicker from '../../components/TerminalMapPicker';
import GPSOverviewPage from './GPSOverviewPage';
import PassengerProfilesPage from './PassengerProfilesPage';
import type { AuditEntry } from '../../types';
import {
  fetchOrganizations, updateOrganization, createOrganization, deleteOrganization, deletePerson, uploadImage,
  fetchGlobalAudit,
  fetchPeople, createPerson, updatePersonStatus,
  fetchOperationalConfig, updateOperationalConfig,
  fetchRoutes, createRoute, deleteRoute,
  fetchCompanies, createCompany, updateCompany, deleteCompany, restoreCompany, ApiError,
  fetchCommercialRequests, markCommercialRequestReviewed, fetchCommercialRequestTriage, updateLandingSection,
  fetchCommercialRequestOnboardingSuggestion,
  fetchComplaints, respondComplaint,
  fetchVehicles, setVehicleGpsDevice, broadcastNotice,
  fetchSupportTickets, respondSupportTicket, type SupportTicket, type SupportTicketStatus,
  fetchOrganizationMetrics, type OrganizationMetrics,
  fetchOrganizationOnboarding, type OrganizationOnboardingStatus,
  fetchEngineLockRequests, confirmEngineLock, cancelEngineLock, restoreEngineLock, requestEngineLockDirect, fetchEngineLockPendingSummary, type EngineLockRequest,
  fetchSuperAdminUrgentGpsAlerts, type SuperAdminUrgentAlert,
  fetchHealthStatus, type HealthCheckServiceStatus,
  type Organization, type OperationalConfig, type Route, type CompanyOption,
  type CommercialRequest as ApiCommercialRequest, type ComplaintBookEntry, type OnboardingSuggestion,
} from '../../lib/operacion-api';
import { fetchLandingContent, type LandingContentData, type LandingFleetItem, type LandingFleetShowcase } from '../../lib/landing-content-api';
import type { Person, Unit } from '../../types';
import { PHONE_ERROR, phoneInputProps, sanitizePhone, isValidOptionalPhone, RUC_ERROR, rucInputProps, sanitizeRuc, isValidRuc, IMEI_ERROR, sanitizeImei, isValidOptionalImei, capitalizeWords } from '../../lib/validators';

// Redimensiona la imagen ANTES de convertirla a data URI -- una foto real de
// varios MB facilmente supera el limite del body del backend (y se ve exactamente
// igual de bien en un logo de ~130x65px). Sin esto, la subida fallaba en
// silencio: el archivo se leia bien en el navegador pero el POST/PATCH al
// backend era rechazado (413) sin que la pantalla mostrara ningun error.
function resizeImageFile(file: File, maxDimension = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('El archivo no parece ser una imagen valida'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('No se pudo procesar la imagen')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

type Section =
  | 'resumen' | 'asociaciones' | 'gps-overview' | 'pasajeros' | 'solicitudes' | 'landing' | 'libro-reclamaciones'
  | 'salud' | 'soporte' | 'auditoria'
  | 'configuracion' | 'nueva-org';

// "Planes y suscripciones", "Pagos" e "Inventario GPS" se eliminaron (11 sept
// 2026, decision de Jayde): simulaban un sistema de facturacion que nunca se
// va a construir -- el pago se coordina por fuera de la plataforma, y el
// cambio de plan real ya vive en Asociaciones -> editar -> Plan (ver
// handleChangePlan, que llama a updateOrganization() de verdad y ahora pide
// motivo obligatorio).
const NAV_ITEMS: NavItem[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'asociaciones', label: 'Asociaciones', icon: Building2 },
  { id: 'gps-overview', label: 'GPS', icon: MapPin },
  { id: 'pasajeros', label: 'Pasajeros', icon: Users },
  { id: 'solicitudes', label: 'Solicitudes comerciales', icon: FileText },
  { id: 'landing', label: 'Landing pública', icon: Globe },
  { id: 'libro-reclamaciones', label: 'Libro de Reclamaciones', icon: AlertCircle },
  { id: 'salud', label: 'Salud técnica', icon: Activity },
  { id: 'soporte', label: 'Soporte', icon: HeadphonesIcon },
  { id: 'auditoria', label: 'Auditoría', icon: ShieldCheck },
  { id: 'configuracion', label: 'Configuración SaaS', icon: Settings },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Rutas habilitadas (las que arman las colas): exactamente dos, una de ida y
// una de retorno, que se escriben a mano -- primero el origen, luego el
// destino, "Agregar", y lo mismo para la segunda. Nada viene por defecto.
type EnabledRoute = { origin: string; destination: string };
function EnabledRoutesEditor({ routes, editing, onChange }: { routes: EnabledRoute[]; editing: boolean; onChange: (next: EnabledRoute[]) => void }) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const canAdd = editing && routes.length < 2 && origin.trim() !== '' && destination.trim() !== '';
  const add = () => {
    if (!canAdd) return;
    onChange([...routes, { origin: origin.trim(), destination: destination.trim() }]);
    setOrigin('');
    setDestination('');
  };
  return (
    <div className="border border-border rounded-lg p-4 bg-bg">
      <p className="text-sm font-semibold text-t1 mb-1">Rutas habilitadas</p>
      <p className="text-xs text-t2 mb-3">
        Son las dos rutas reales de la asociación, las que tienen cola de salida y aparecen en el portal: una de ida y una de retorno (ej. "Juli → Puno" y "Puno → Juli"). Escribe el origen y el destino, toca "Agregar" y repite para la segunda. No es lo mismo que el nombre del terminal.
      </p>
      {routes.length > 0 ? (
        <div className="border border-border rounded-lg divide-y divide-border mb-3 bg-surface">
          {routes.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <p className="text-sm text-t1"><span className="text-[11px] font-semibold text-t2 uppercase mr-2">{i === 0 ? 'Ida' : 'Retorno'}</span>{r.origin} → {r.destination}</p>
              {editing && (
                <button type="button" onClick={() => onChange(routes.filter((_, k) => k !== i))} className="w-7 h-7 grid place-items-center rounded-md text-danger hover:bg-danger/5" aria-label={`Quitar ruta ${r.origin} → ${r.destination}`}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-t2 mb-3">Todavía no hay rutas configuradas.</p>
      )}
      {editing && routes.length < 2 && (
        <div className="flex items-center gap-2">
          <input value={origin} onChange={e => setOrigin(e.target.value)} placeholder={routes.length === 0 ? 'Origen de la ida' : 'Origen del retorno'} className="flex-1 h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary" />
          <input value={destination} onChange={e => setDestination(e.target.value)} placeholder={routes.length === 0 ? 'Destino de la ida' : 'Destino del retorno'} className="flex-1 h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary" />
          <button type="button" onClick={add} disabled={!canAdd} className="h-9 px-3 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-selected disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0">
            <Plus size={14} /> Agregar
          </button>
        </div>
      )}
      {editing && routes.length >= 2 && <p className="text-[11px] text-t2">Ya están las dos rutas (ida y retorno). Quita una con la X si necesitas cambiarla.</p>}
    </div>
  );
}

// Lista de paradas (solo informativas, sin limite): origen + destino + "Agregar".
function StopsEditor({ stops, onChange }: { stops: { origin: string; destination: string }[]; onChange: (next: { origin: string; destination: string }[]) => void }) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const canAdd = origin.trim() !== '' && destination.trim() !== '';
  const add = () => {
    if (!canAdd) return;
    onChange([...stops, { origin: origin.trim(), destination: destination.trim() }]);
    setOrigin('');
    setDestination('');
  };
  return (
    <div>
      {stops.length > 0 && (
        <div className="border border-border rounded-lg divide-y divide-border mb-3">
          {stops.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <p className="text-sm text-t1">{r.origin} → {r.destination}</p>
              <button type="button" onClick={() => onChange(stops.filter((_, k) => k !== i))} className="w-7 h-7 grid place-items-center rounded-md text-danger hover:bg-danger/5" aria-label={`Quitar parada ${r.origin} → ${r.destination}`}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="Origen" className="flex-1 h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Destino" className="flex-1 h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <button type="button" onClick={add} disabled={!canAdd} className="h-9 px-3 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-selected disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0">
          <Plus size={14} /> Agregar
        </button>
      </div>
    </div>
  );
}

// Lista de nombres (empresas integrantes): escribes el nombre, "Agregar", y otro.
function NamesListEditor({ items, placeholder, onChange }: { items: string[]; placeholder: string; onChange: (next: string[]) => void }) {
  const [name, setName] = useState('');
  const canAdd = name.trim() !== '' && !items.some(i => i.toLowerCase() === name.trim().toLowerCase());
  const add = () => {
    if (!canAdd) return;
    onChange([...items, name.trim()]);
    setName('');
  };
  return (
    <div>
      {items.length > 0 && (
        <div className="border border-border rounded-lg divide-y divide-border mb-3">
          {items.map((n, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <p className="text-sm text-t1">{n}</p>
              <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))} className="w-7 h-7 grid place-items-center rounded-md text-danger hover:bg-danger/5" aria-label={`Quitar ${n}`}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={placeholder} className="flex-1 h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <button type="button" onClick={add} disabled={!canAdd} className="h-9 px-3 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-selected disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0">
          <Plus size={14} /> Agregar
        </button>
      </div>
    </div>
  );
}

const ORG_STATUS_STYLE: Record<string, string> = {
  ACTIVA: 'bg-ok/10 text-ok',
  EN_CONFIGURACION: 'bg-warn/10 text-warn',
  SUSPENDIDA: 'bg-danger/10 text-danger',
  CON_INCIDENCIA: 'bg-accent/20 text-accent',
  ELIMINADA: 'bg-border text-muted',
};

function field(label: string, value: string, mono = false) {
  return (
    <div className="flex justify-between px-3 py-2">
      <span className="text-sm text-t2">{label}</span>
      <span className={`text-sm text-t1 font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
const URGENT_ALERT_LABEL: Record<string, string> = {
  BOTON_PANICO: 'Botón de pánico',
  POSIBLE_REMOLQUE: 'Posible remolque',
  POSIBLE_ACCIDENTE: 'Posible accidente',
  FUERA_DE_RUTA: 'Fuera del corredor autorizado',
};

function SADashboard({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [commercialRequests, setCommercialRequests] = useState<ApiCommercialRequest[]>([]);
  // Alertas graves de asociaciones SIN Plan PRO (12 sept 2026, decidido con
  // Jayde): el Administrador de esas asociaciones no las ve -- Super Admin
  // toma ese lugar, aqui y por correo (ver notifySuperAdminIfNoPro en el
  // backend). Nunca inventado -- mismo endpoint que alimenta el correo.
  const [urgentAlerts, setUrgentAlerts] = useState<SuperAdminUrgentAlert[]>([]);
  // Metricas reales de negocio (13 sept 2026, decidido con Jayde) -- antes
  // "Resumen" solo mostraba salud operativa; esto agrega cuantas
  // asociaciones hay por plan, altas recientes y adopcion de GPS Vehicular.
  const [metrics, setMetrics] = useState<OrganizationMetrics | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchOrganizations().then(list => { if (!cancelled) setOrgs(list); }).catch(() => { /* se degrada a lista vacia */ });
    fetchCommercialRequests().then(list => { if (!cancelled) setCommercialRequests(list); }).catch(() => { /* se degrada a lista vacia */ });
    fetchOrganizationMetrics().then(m => { if (!cancelled) setMetrics(m); }).catch(() => { /* se degrada sin metricas */ });
    const pollAlerts = () => {
      fetchSuperAdminUrgentGpsAlerts().then(list => { if (!cancelled) setUrgentAlerts(list); }).catch(() => { /* se degrada sin alertas */ });
    };
    pollAlerts();
    const id = setInterval(pollAlerts, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  const active = orgs.filter(o => o.status === 'ACTIVA').length;
  const configuring = orgs.filter(o => o.status === 'EN_CONFIGURACION').length;
  const suspended = orgs.filter(o => o.status === 'SUSPENDIDA').length;
  const incident = 0; // el estado CON_INCIDENCIA no existe en el backend real (OrgStatus solo tiene 3 valores)
  const newRequests = commercialRequests.filter(r => r.status === 'NUEVA').length;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-t1">Resumen — CHASKI AI</h1>
        <p className="text-sm text-t2 mt-0.5">Administración global · 29 ago 2026</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Activas', value: active, cls: 'text-ok', bg: 'bg-ok/5 border-ok/20' },
          { label: 'En configuración', value: configuring, cls: 'text-warn', bg: 'bg-warn/5 border-warn/20' },
          { label: 'Con incidencia', value: incident, cls: 'text-accent', bg: 'bg-accent/5 border-accent/20' },
          { label: 'Suspendidas', value: suspended, cls: 'text-danger', bg: 'bg-danger/5 border-danger/20' },
        ].map(item => (
          <div key={item.label} className={`border rounded-lg px-4 py-4 ${item.bg}`}>
            <div className={`text-2xl font-bold ${item.cls}`}>{item.value}</div>
            <div className="text-sm text-t2 mt-1">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Metricas de negocio: cuantas asociaciones por plan, altas recientes
          y adopcion de GPS Vehicular -- todo contado en vivo, nunca una
          proyeccion inventada. */}
      {metrics && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-3">Negocio</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="text-xl font-bold text-t1">{metrics.pro} <span className="text-sm font-normal text-t2">PRO</span></div>
              <div className="text-xs text-t2 mt-0.5">{metrics.operacion} en Operación</div>
            </div>
            <div>
              <div className="text-xl font-bold text-t1">{metrics.nuevasUltimos30Dias}</div>
              <div className="text-xs text-t2 mt-0.5">Altas en los últimos 30 días</div>
            </div>
            <div>
              <div className="text-xl font-bold text-t1">{metrics.unidadesConPlanGpsVehicularActivo}</div>
              <div className="text-xs text-t2 mt-0.5">Unidades con GPS Vehicular activo</div>
            </div>
            <div>
              <div className="text-xl font-bold text-warn">{metrics.unidadesEnGraciaGpsVehicular}</div>
              <div className="text-xs text-t2 mt-0.5">Unidades en periodo de gracia</div>
            </div>
          </div>
        </div>
      )}

      {/* Pending attention */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {newRequests > 0 && (
          <button onClick={() => onNavigate('solicitudes')} className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-left hover:bg-primary/10 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <FileText size={14} className="text-primary" />
              <span className="text-sm font-medium text-primary">{newRequests} solicitud{newRequests > 1 ? 'es' : ''} comercial{newRequests > 1 ? 'es' : ''} nueva{newRequests > 1 ? 's' : ''}</span>
            </div>
            <p className="text-sm text-t2 flex items-center gap-1">Ir a Solicitudes <ArrowRight size={13} /></p>
          </button>
        )}
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
          <AlertTriangle size={15} className="text-warn" />
          <h2 className="text-base font-semibold text-t1">Alertas de seguridad — asociaciones sin Plan PRO</h2>
          {urgentAlerts.length > 0 && (
            <span className="text-[11px] font-bold bg-danger text-white px-2 py-0.5 rounded-full ml-auto">{urgentAlerts.length}</span>
          )}
        </div>
        <div className="p-4 space-y-2.5">
          {urgentAlerts.length === 0 ? (
            <div className="flex items-start gap-3 p-3.5 rounded-lg border border-ok/30 bg-ok/5">
              <CheckCircle size={16} className="text-ok mt-0.5 flex-shrink-0" />
              <p className="text-sm text-t2">Sin alertas de seguridad abiertas en asociaciones sin Plan PRO.</p>
            </div>
          ) : (
            urgentAlerts.map(a => (
              <button
                key={a.id}
                onClick={() => onNavigate('gps-overview')}
                className="w-full flex items-start gap-3 p-3.5 rounded-lg border border-danger/30 bg-danger/5 text-left hover:bg-danger/10"
              >
                <AlertTriangle size={16} className="text-danger mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-t1">{URGENT_ALERT_LABEL[a.type] ?? a.type} — Unidad {a.vehicleCode} de {a.organizationName}</p>
                  <p className="text-sm text-t2 mt-0.5">{a.description}</p>
                  <p className="text-xs text-muted mt-1">{new Date(a.detectedAt).toLocaleString('es-PE')}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button onClick={() => onNavigate('asociaciones')} className="bg-surface border border-border rounded-lg p-4 text-left hover:bg-hover transition-colors">
          <Building2 size={18} className="text-primary mb-2" />
          <p className="text-sm font-medium text-t1">Asociaciones</p>
          <p className="text-sm text-t2 mt-0.5">{orgs.length} registradas</p>
        </button>
        <button onClick={() => onNavigate('salud')} className="bg-surface border border-border rounded-lg p-4 text-left hover:bg-hover transition-colors">
          <Activity size={18} className="text-ok mb-2" />
          <p className="text-sm font-medium text-t1">Salud técnica</p>
          <p className="text-sm text-t2 mt-0.5">Todos los sistemas operativos</p>
        </button>
      </div>
    </div>
  );
}

// ─── Asociaciones ─────────────────────────────────────────────────────────────
function SAOrganizations({ onNew, onEnterAsAdmin }: { onNew: () => void; onEnterAsAdmin: (org: { id: string; name: string }) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  // Guarda solo el id (no el objeto Organization completo): si se guardara el
  // objeto, quedaria congelado con los valores de ANTES de guardar -- tras
  // cambiar el plan (o cualquier otro campo) en el wizard, la pantalla
  // seguiria mostrando el valor viejo aunque el backend ya haya guardado el
  // nuevo, porque "orgs" se refresca pero este objeto frozen no. Derivando
  // siempre desde "orgs" (ver editingOrgFull mas abajo) el wizard recibe el
  // dato real despues de cada guardado.
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  // Bloqueo de motor (12 sept 2026): cuantas solicitudes SOLICITADO tiene
  // cada asociacion, para verlo sin entrar una por una.
  const [pendingLocksByOrg, setPendingLocksByOrg] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetchOrganizations().then(list => { if (!cancelled) setOrgs(list); }).catch(() => { /* se degrada a lista vacia */ });
    return () => { cancelled = true; };
  }, [version]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetchEngineLockPendingSummary()
        .then(summary => {
          if (cancelled) return;
          setPendingLocksByOrg(Object.fromEntries(summary.map(s => [s.organizationId, s.pendingCount])));
        })
        .catch(() => { /* se degrada a sin badges */ });
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const selected = orgs.find(o => o.id === selectedId) ?? null;
  const editingOrgFull = orgs.find(o => o.id === editingOrgId) ?? null;

  // Checklist real de onboarding (13 sept 2026, decidido con Jayde): cada
  // senal sale de datos reales (ver organizations.service.ts
  // getOnboardingStatus) -- nunca una casilla marcada a mano.
  const [onboarding, setOnboarding] = useState<OrganizationOnboardingStatus | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  useEffect(() => {
    if (!selectedId) { setOnboarding(null); return; }
    let cancelled = false;
    setOnboardingLoading(true);
    fetchOrganizationOnboarding(selectedId)
      .then(status => { if (!cancelled) setOnboarding(status); })
      .catch(() => { if (!cancelled) setOnboarding(null); })
      .finally(() => { if (!cancelled) setOnboardingLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, version]);

  const toggleLiveMap = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await updateOrganization(selected.id, { driverLiveMapEnabled: !selected.driverLiveMapEnabled });
      setVersion(v => v + 1);
    } finally {
      setBusy(false);
    }
  };

  // Una asociacion nueva nace en EN_CONFIGURACION y se queda asi hasta que el
  // Super Admin la activa a mano -- recien entonces aparece en la vitrina de
  // "otras asociaciones" para el resto de usuarios y queda operativa.
  const changeStatus = async (next: Organization['status']) => {
    if (!selected) return;
    setBusy(true);
    try {
      await updateOrganization(selected.id, { status: next });
      setVersion(v => v + 1);
    } finally {
      setBusy(false);
    }
  };

  // Eliminar asociacion completa (baja: el historial se conserva). Pide motivo
  // y que se escriba el nombre exacto, para que no se haga por un clic sin querer.
  const [showDeleteOrg, setShowDeleteOrg] = useState(false);
  const [deleteOrgReason, setDeleteOrgReason] = useState('');
  const [deleteOrgConfirm, setDeleteOrgConfirm] = useState('');
  const [deleteOrgError, setDeleteOrgError] = useState('');
  const [deletingOrg, setDeletingOrg] = useState(false);
  const closeDeleteOrg = () => { setShowDeleteOrg(false); setDeleteOrgReason(''); setDeleteOrgConfirm(''); setDeleteOrgError(''); };
  const confirmDeleteOrg = async () => {
    if (!selected || !deleteOrgReason.trim() || deleteOrgConfirm.trim() !== selected.name) return;
    setDeletingOrg(true);
    setDeleteOrgError('');
    try {
      await deleteOrganization(selected.id, deleteOrgReason.trim());
      closeDeleteOrg();
      setSelectedId(null);
      setVersion(v => v + 1);
    } catch (err) {
      setDeleteOrgError(err instanceof Error ? err.message : 'No se pudo eliminar la asociación.');
    } finally {
      setDeletingOrg(false);
    }
  };

  if (editingOrgFull) {
    return (
      <EditOrgWizard
        org={editingOrgFull}
        onBack={() => setEditingOrgId(null)}
        onSaved={() => setVersion(v => v + 1)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 py-4 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-t1">Asociaciones</h1>
          <p className="text-sm text-t2 mt-0.5">{orgs.length} registradas</p>
        </div>
        <button onClick={onNew} className="flex items-center gap-2 px-3.5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h">
          <Plus size={14} /> Nueva asociación
        </button>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selected ? 'border-r border-border' : ''}`}>
          <table className="w-full text-sm" aria-label="Asociaciones">
            <thead className="sticky top-0">
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Asociación</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Plan</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Creada</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado org.</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {orgs.map(o => (
                <tr key={o.id} className="border-b border-border last:border-0 hover:bg-hover cursor-pointer" onClick={() => setSelectedId(o.id === selectedId ? null : o.id)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-t1">{o.name}</p>
                      {Boolean(pendingLocksByOrg[o.id]) && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-danger text-white animate-pulse">
                          🔒 {pendingLocksByOrg[o.id]} bloqueo{pendingLocksByOrg[o.id] > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-t2 font-mono">{o.ruc}</p>
                  </td>
                  <td className="px-4 py-3 text-t1">{o.plan}</td>
                  <td className="px-4 py-3 text-t2">{o.createdAt.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${ORG_STATUS_STYLE[o.status]}`}>
                      {o.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3"><ChevronRight size={14} className="text-muted" /></td>
                </tr>
              ))}
              {orgs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-t2">Sin asociaciones registradas</td></tr>}
            </tbody>
          </table>
        </div>

        {selected && (
          <aside className="fixed inset-0 z-40 w-full md:static md:inset-auto md:z-auto md:w-80 md:flex-shrink-0 overflow-auto p-4 bg-surface" aria-label="Detalle asociación">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-t1">{selected.name}</h3>
              <button onClick={() => setSelectedId(null)} className="text-muted hover:text-t1" aria-label="Cerrar"><X size={16} /></button>
            </div>
            <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-2">Acciones</p>
            <button
              onClick={() => onEnterAsAdmin({ id: selected.id, name: selected.name })}
              className="w-full flex items-center justify-center gap-2 h-9 mb-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90"
            >
              <LogIn size={14} /> Entrar como administrador
            </button>
            <button
              onClick={() => setEditingOrgId(selected.id)}
              className="w-full flex items-center justify-center gap-2 h-9 mb-5 rounded-lg text-sm font-medium border border-primary/30 text-primary hover:bg-primary/5"
            >
              <Pencil size={14} /> Editar asociación
            </button>
            <button
              onClick={() => setShowDeleteOrg(true)}
              className="w-full flex items-center justify-center gap-2 h-9 mb-5 -mt-3 rounded-lg text-sm font-medium border border-danger/30 text-danger hover:bg-danger/5"
            >
              Eliminar asociación
            </button>

            <div className="space-y-5 text-sm">
              {/* Estado: la unica accion de ciclo de vida que queda fuera del
                  wizard a proposito -- activar/suspender es una decision
                  puntual, no un dato que se "edita". */}
              <div>
                <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-2">Estado</p>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`inline-block text-[11px] px-2 py-0.5 rounded font-medium ${ORG_STATUS_STYLE[selected.status]}`}>
                    {selected.status.replace(/_/g, ' ')}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {selected.status !== 'ACTIVA' && (
                      <button
                        onClick={() => changeStatus('ACTIVA')}
                        disabled={busy}
                        className="h-7 px-2.5 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/5 disabled:opacity-50"
                      >
                        Activar
                      </button>
                    )}
                    {selected.status !== 'SUSPENDIDA' && (
                      <button
                        onClick={() => changeStatus('SUSPENDIDA')}
                        disabled={busy}
                        className="h-7 px-2.5 text-xs font-medium text-danger border border-danger/30 rounded-md hover:bg-danger/5 disabled:opacity-50"
                      >
                        Suspender
                      </button>
                    )}
                    {selected.status !== 'EN_CONFIGURACION' && (
                      <button
                        onClick={() => changeStatus('EN_CONFIGURACION')}
                        disabled={busy}
                        className="h-7 px-2.5 text-xs font-medium text-t2 border border-border rounded-md hover:bg-hover disabled:opacity-50"
                      >
                        Volver a configuración
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Onboarding: checklist calculado en vivo de datos reales --
                  nunca casillas marcadas a mano (ver getOnboardingStatus). */}
              <div>
                <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-2">Onboarding</p>
                {onboardingLoading || !onboarding ? (
                  <p className="text-t2 text-xs">Calculando…</p>
                ) : (
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {[
                      { label: 'Administrador invitado y activo', ok: onboarding.adminActivo },
                      { label: 'Corredor con direcciones reales configurado', ok: onboarding.corredorConfigurado },
                      { label: `Empresas registradas (${onboarding.empresasRegistradas})`, ok: onboarding.empresasRegistradas > 0 },
                      { label: `Vehículos registrados (${onboarding.vehiculosRegistrados})`, ok: onboarding.vehiculosRegistrados > 0 },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between px-3 py-2 gap-2">
                        <span className="text-t2 text-xs">{row.label}</span>
                        <span className={`text-[11px] font-bold shrink-0 ${row.ok ? 'text-ok' : 'text-warn'}`}>{row.ok ? '✓' : '· falta'}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 gap-2">
                      <span className="text-t2 text-xs">Unidades con GPS vinculado</span>
                      <span className="text-[11px] font-medium text-t1 shrink-0">{onboarding.unidadesConGps}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Datos: solo lectura -- todo lo editable vive en "Editar
                  asociacion" (incluido el Plan, que antes tambien se podia
                  cambiar aqui mismo: dos caminos para lo mismo). */}
              <div>
                <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-2">Datos</p>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {[
                    { label: 'RUC', value: selected.ruc, mono: true },
                    { label: 'Creada', value: selected.createdAt.slice(0, 10) },
                    { label: 'Plan', value: selected.plan },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between px-3 py-2">
                      <span className="text-t2">{row.label}</span>
                      <span className={`text-t1 font-medium ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-t2 mt-1.5">El plan se cambia desde "Editar asociación" → Plan y facturación.</p>
              </div>

              {/* Funciones: interruptores puntuales que no forman parte de
                  ningun paso del wizard. */}
              <div>
                <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-2">Funciones</p>
                <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2.5 gap-2">
                  <div>
                    <p className="text-t1 font-medium">Mapa en vivo del conductor: {selected.driverLiveMapEnabled ? 'habilitado' : 'deshabilitado'}</p>
                    <p className="text-t2 mt-0.5">Ubicación en vivo (Google Maps) en el perfil del conductor. Consume cuota de Google Maps Platform.</p>
                  </div>
                  <button
                    onClick={toggleLiveMap}
                    disabled={busy}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${selected.driverLiveMapEnabled ? 'bg-primary' : 'bg-t2/30'}`}
                    aria-label="Alternar mapa en vivo del conductor"
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${selected.driverLiveMapEnabled ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-t2">
                Flota, Personas, Cola, Empresas y Reportes se operan desde "Entrar como administrador" arriba. Terminales, radio GPS y tiempos mínimos de viaje se configuran desde "Editar asociación" → Operación.
              </p>
            </div>
          </aside>
        )}
      </div>

      {showDeleteOrg && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Eliminar asociación">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-t1 mb-1">Eliminar {selected.name}</h3>
            <p className="text-xs text-t2 mb-4">
              La asociación deja de aparecer en el listado, en el portal y en los avisos, y todas sus cuentas quedan suspendidas: nadie de ahí podrá volver a entrar. Su historial (viajes, manifiestos, pasajeros, personas, unidades y auditoría) se conserva tal como estaba hasta hoy. Solo se puede eliminar si no tiene viajes en curso ni unidades en cola.
            </p>
            <textarea
              value={deleteOrgReason}
              onChange={e => setDeleteOrgReason(e.target.value)}
              placeholder="Motivo (ej. la asociación dejó el servicio)…"
              className="w-full min-h-20 px-3 py-2 border border-border rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <label className="block text-xs text-t2 mb-1">Para confirmar, escribe el nombre exacto: <strong className="text-t1">{selected.name}</strong></label>
            <input
              value={deleteOrgConfirm}
              onChange={e => setDeleteOrgConfirm(e.target.value)}
              className="w-full h-9 px-3 border border-border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {deleteOrgError && <p className="text-xs text-danger mb-3">{deleteOrgError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={closeDeleteOrg} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button
                onClick={confirmDeleteOrg}
                disabled={!deleteOrgReason.trim() || deleteOrgConfirm.trim() !== selected.name || deletingOrg}
                className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/80 disabled:opacity-50"
              >
                {deletingOrg ? 'Eliminando…' : 'Eliminar asociación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const EDIT_ORG_STEPS = ['Organización', 'Administrador', 'Operación', 'Plan y facturación', 'GPS', 'Bloqueo de motor', 'Confirmación'];

// Flujo dedicado de edicion (Super Admin -> Asociaciones -> seleccionar ->
// "Editar asociacion"), con la MISMA navegacion por pasos y el mismo look
// (tarjeta con borde, indicador circular) que el wizard "Nueva asociacion" --
// para que se sienta como la misma pantalla, ahora en modo editar. A
// diferencia del wizard de creacion, aqui los circulos son clicables (se
// puede saltar directo a cualquier paso) y cada paso tiene su propio boton
// Editar/Guardar arriba a la derecha de la tarjeta -- salvo el ultimo paso
// (Confirmacion), que es solo lectura.
//
// Paso "Operacion" edita de verdad Terminal 1/2 (nombre y direccion) contra
// OperationalConfig -- el mismo registro que ya edita Configuracion ->
// Terminales del panel de administrador (con el mapa), asi que no hay dos
// fuentes de verdad, solo dos entradas a la misma. Rutas / empresas
// integrantes / notas de configuracion del wizard original NO se incluyen
// aqui porque nunca se conectaron a ningun dato real (empresas integrantes
// ya tiene su propia pantalla real: Flota/Empresas).
//
// Paso "Plan y facturacion" solo edita Plan (real). Periodicidad, unidades,
// costos, etc. del wizard original tampoco se incluyen -- viven en "Planes y
// Suscripciones", que hoy sigue siendo una pantalla de datos de ejemplo, no
// conectada a nada; agregarlos aqui hubiera sido mostrar campos que no
// guardan nada de verdad.
function EditOrgWizard({ org, onBack, onSaved }: { org: Organization; onBack: () => void; onSaved: () => void }) {
  const [step, setStep] = useState(0);

  // ── Paso 1: Organización ──
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({
    name: org.name,
    ruc: org.ruc,
    city: org.city ?? '',
    legalRepName: org.legalRepName ?? '',
    contactPhone: org.contactPhone ?? '',
    contactEmail: org.contactEmail ?? '',
    logoUrl: org.logoUrl ?? '',
  });
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);

  const resetInfoForm = () => {
    setInfoForm({
      name: org.name,
      ruc: org.ruc,
      city: org.city ?? '',
      legalRepName: org.legalRepName ?? '',
      contactPhone: org.contactPhone ?? '',
      contactEmail: org.contactEmail ?? '',
      logoUrl: org.logoUrl ?? '',
    });
    setInfoError('');
  };

  const handleLogoFile = async (file: File) => {
    setInfoError('');
    if (file.size > 5 * 1024 * 1024) {
      setInfoError('La imagen pesa demasiado (máximo 5 MB).');
      return;
    }
    setLogoUploading(true);
    try {
      const resized = await resizeImageFile(file);
      const { url } = await uploadImage(resized, 'logos');
      setInfoForm(f => ({ ...f, logoUrl: url }));
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : 'No se pudo subir el logo. Intenta de nuevo.');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!infoForm.name.trim() || !infoForm.ruc.trim()) {
      setInfoError('Nombre y RUC no pueden quedar vacíos.');
      return;
    }
    if (!isValidOptionalPhone(infoForm.contactPhone.trim())) {
      setInfoError(PHONE_ERROR);
      return;
    }
    if (infoForm.ruc.trim() !== org.ruc && !isValidRuc(infoForm.ruc.trim())) {
      setInfoError(RUC_ERROR);
      return;
    }
    setInfoSaving(true);
    setInfoError('');
    try {
      await updateOrganization(org.id, {
        name: infoForm.name.trim(),
        ruc: infoForm.ruc.trim(),
        city: infoForm.city.trim(),
        legalRepName: infoForm.legalRepName.trim(),
        contactPhone: infoForm.contactPhone.trim(),
        ...(infoForm.contactEmail.trim() ? { contactEmail: infoForm.contactEmail.trim() } : {}),
        logoUrl: infoForm.logoUrl,
      });
      setEditingInfo(false);
      onSaved();
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setInfoSaving(false);
    }
  };

  // ── Paso 2: Administrador ──
  const [admins, setAdmins] = useState<Person[]>([]);
  const [editingAdmin, setEditingAdmin] = useState(false);
  const [swapName, setSwapName] = useState('');
  const [swapEmail, setSwapEmail] = useState('');
  const [swapPhone, setSwapPhone] = useState('');
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapError, setSwapError] = useState('');

  const reloadAdmins = useCallback(() => {
    fetchPeople(org.id)
      .then(list => setAdmins(list.filter(p => p.role === 'ADMINISTRADOR')))
      .catch(() => setAdmins([]));
  }, [org.id]);

  useEffect(() => {
    reloadAdmins();
  }, [reloadAdmins]);

  // Decision 13 sept 2026 (Jayde): agregar un administrador NUNCA suspende a
  // los demas -- una asociacion puede tener varios administradores activos a
  // la vez. Dar de baja a uno es una accion aparte (confirmRemoveAdmin), con
  // un modal propio que exige motivo -- mismo patron que Personas
  // (PeoplePage.tsx) y Vehiculos (FleetPage.tsx showDeactivate).
  const handleAddAdmin = async () => {
    if (!swapName.trim() || !swapEmail.trim()) return;
    if (!isValidOptionalPhone(swapPhone.trim())) {
      setSwapError(PHONE_ERROR);
      return;
    }
    setSwapError('');
    setSwapBusy(true);
    try {
      await createPerson(
        {
          name: swapName.trim(),
          email: swapEmail.trim().toLowerCase(),
          role: 'ADMINISTRADOR',
          ...(swapPhone.trim() ? { phone: swapPhone.trim() } : {}),
        },
        org.id,
      );
      setSwapName('');
      setSwapEmail('');
      setSwapPhone('');
      setEditingAdmin(false);
      reloadAdmins();
    } catch (err) {
      setSwapError(err instanceof Error ? err.message : 'No se pudo registrar al nuevo administrador.');
    } finally {
      setSwapBusy(false);
    }
  };

  const [removingAdminId, setRemovingAdminId] = useState<string | null>(null);
  const [removeAdminTarget, setRemoveAdminTarget] = useState<Person | null>(null);
  const [removeAdminReason, setRemoveAdminReason] = useState('');
  const [removeAdminError, setRemoveAdminError] = useState('');
  const confirmRemoveAdmin = async () => {
    if (!removeAdminTarget || !removeAdminReason.trim()) return;
    setRemovingAdminId(removeAdminTarget.id);
    setRemoveAdminError('');
    try {
      await deletePerson(removeAdminTarget.id, removeAdminReason.trim(), org.id);
      setRemoveAdminTarget(null);
      setRemoveAdminReason('');
      reloadAdmins();
    } catch (err) {
      setRemoveAdminError(err instanceof Error ? err.message : 'No se pudo dar de baja al administrador.');
    } finally {
      setRemovingAdminId(null);
    }
  };

  const activeAdmins = admins.filter(a => a.status !== 'SUSPENDIDO');

  // ── Paso 3: Operación (terminales -- solo nombre y direccion; las
  // coordenadas del mapa se ajustan en Configuracion -> Terminales) ──
  const [opConfig, setOpConfig] = useState<OperationalConfig | null>(null);
  const [editingOp, setEditingOp] = useState(false);
  const [opForm, setOpForm] = useState({
    terminalOriginName: '',
    terminalOriginAddress: '',
    terminalOriginLat: null as number | null,
    terminalOriginLng: null as number | null,
    terminalDestinationName: '',
    terminalDestinationAddress: '',
    terminalDestinationLat: null as number | null,
    terminalDestinationLng: null as number | null,
    routeOriginName: '',
    routeDestinationName: '',
    returnOriginName: '',
    returnDestinationName: '',
    initialConfigNotes: '',
    // Parametros antifraude (plan-operacion.md §3.10) -- ya existian en el
    // backend y en OperationalConfig, pero ningun formulario los expone
    // todavia. timeoutMinutes y anomalySpeedThresholdKmh se quedan afuera a
    // proposito: existen en el modelo pero ningun servicio los lee hoy
    // (agregarlos aqui daria la falsa impresion de que hacen algo).
    gpsRadiusMeters: 300,
    minTripMinutesOutbound: 90,
    minTripMinutesReturn: 90,
  });
  const [opSaving, setOpSaving] = useState(false);
  const [opError, setOpError] = useState('');

  // Rutas adicionales (mas alla de ida/vuelta, que ya son Terminal 1/2) --
  // CRUD independiente del Editar/Guardar de arriba: cada ruta se agrega o
  // elimina al instante, igual que el administrador en el Paso 2.
  const [routes, setRoutes] = useState<Route[]>([]);
  const [newRouteOrigin, setNewRouteOrigin] = useState('');
  const [newRouteDestination, setNewRouteDestination] = useState('');
  const [routeSaving, setRouteSaving] = useState(false);
  const [routeError, setRouteError] = useState('');

  const reloadRoutes = useCallback(() => {
    fetchRoutes(org.id).then(setRoutes).catch(() => setRoutes([]));
  }, [org.id]);

  useEffect(() => {
    reloadRoutes();
  }, [reloadRoutes]);

  const handleAddRoute = async () => {
    if (!newRouteOrigin.trim() || !newRouteDestination.trim()) return;
    setRouteError('');
    setRouteSaving(true);
    try {
      await createRoute({ origin: newRouteOrigin.trim(), destination: newRouteDestination.trim() }, org.id);
      setNewRouteOrigin('');
      setNewRouteDestination('');
      reloadRoutes();
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : 'No se pudo agregar la ruta.');
    } finally {
      setRouteSaving(false);
    }
  };

  const handleDeleteRoute = async (id: string) => {
    setRouteError('');
    try {
      await deleteRoute(id, org.id);
      setRoutes(rs => rs.filter(r => r.id !== id));
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : 'No se pudo eliminar la ruta.');
    }
  };

  // Empresas integrantes -- reutiliza el modelo real Company (el mismo que ya
  // usan Flota/Manifiestos), no una lista de texto aparte. Solo el nombre es
  // obligatorio para agregar una; RUC/representante/telefono/correo se
  // completan despues si hace falta.
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [companySaving, setCompanySaving] = useState(false);
  const [companyError, setCompanyError] = useState('');

  const reloadCompanies = useCallback(() => {
    fetchCompanies(org.id).then(setCompanies).catch(() => setCompanies([]));
  }, [org.id]);

  useEffect(() => {
    reloadCompanies();
  }, [reloadCompanies]);

  const [deleteCompanyTarget, setDeleteCompanyTarget] = useState<CompanyOption | null>(null);
  const [deleteCompanyReason, setDeleteCompanyReason] = useState('');
  const [deleteCompanyError, setDeleteCompanyError] = useState('');
  const [deletingCompany, setDeletingCompany] = useState(false);
  const [restoreOffer, setRestoreOffer] = useState<{ id: string; name: string } | null>(null);
  const [restoringCompany, setRestoringCompany] = useState(false);

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) return;
    setCompanyError('');
    setCompanySaving(true);
    try {
      await createCompany({ name: newCompanyName.trim() }, org.id);
      setNewCompanyName('');
      reloadCompanies();
    } catch (err) {
      // Una empresa eliminada que vuelve se restaura con su historial, no se crea de nuevo.
      if (err instanceof ApiError && err.code === 'EMPRESA_ELIMINADA') {
        setRestoreOffer({ id: String(err.data.companyId), name: String(err.data.companyName ?? newCompanyName.trim()) });
      } else {
        setCompanyError(err instanceof Error ? err.message : 'No se pudo agregar la empresa.');
      }
    } finally {
      setCompanySaving(false);
    }
  };

  const confirmRestoreCompany = async () => {
    if (!restoreOffer) return;
    setRestoringCompany(true);
    try {
      await restoreCompany(restoreOffer.id, org.id);
      setRestoreOffer(null);
      setNewCompanyName('');
      reloadCompanies();
    } catch (err) {
      setRestoreOffer(null);
      setCompanyError(err instanceof Error ? err.message : 'No se pudo restaurar la empresa.');
    } finally {
      setRestoringCompany(false);
    }
  };

  const confirmDeleteCompany = async () => {
    if (!deleteCompanyTarget || !deleteCompanyReason.trim()) return;
    setDeletingCompany(true);
    setDeleteCompanyError('');
    try {
      await deleteCompany(deleteCompanyTarget.id, deleteCompanyReason.trim(), org.id);
      setDeleteCompanyTarget(null);
      setDeleteCompanyReason('');
      reloadCompanies();
    } catch (err) {
      setDeleteCompanyError(err instanceof Error ? err.message : 'No se pudo eliminar la empresa.');
    } finally {
      setDeletingCompany(false);
    }
  };

  const handleToggleCompanyStatus = async (companyId: string, current?: CompanyOption['status']) => {
    setCompanyError('');
    try {
      const next = current === 'SUSPENDIDA' ? 'ACTIVA' : 'SUSPENDIDA';
      await updateCompany(companyId, { status: next }, org.id);
      reloadCompanies();
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : 'No se pudo actualizar la empresa.');
    }
  };

  useEffect(() => {
    fetchOperationalConfig(org.id)
      .then(cfg => {
        setOpConfig(cfg);
        setOpForm({
          terminalOriginName: cfg.terminalOriginName ?? '',
          terminalOriginAddress: cfg.terminalOriginAddress ?? '',
          terminalOriginLat: cfg.terminalOriginLat ?? null,
          terminalOriginLng: cfg.terminalOriginLng ?? null,
          terminalDestinationName: cfg.terminalDestinationName ?? '',
          terminalDestinationAddress: cfg.terminalDestinationAddress ?? '',
          terminalDestinationLat: cfg.terminalDestinationLat ?? null,
          terminalDestinationLng: cfg.terminalDestinationLng ?? null,
          routeOriginName: cfg.routeOriginName ?? '',
          routeDestinationName: cfg.routeDestinationName ?? '',
          returnOriginName: cfg.returnOriginName ?? '',
          returnDestinationName: cfg.returnDestinationName ?? '',
          initialConfigNotes: cfg.initialConfigNotes ?? '',
          gpsRadiusMeters: cfg.gpsRadiusMeters ?? 300,
          minTripMinutesOutbound: cfg.minTripMinutesOutbound ?? 90,
          minTripMinutesReturn: cfg.minTripMinutesReturn ?? 90,
        });
      })
      .catch(() => setOpConfig(null));
  }, [org.id]);

  const handleSaveOp = async () => {
    setOpSaving(true);
    setOpError('');
    try {
      const updated = await updateOperationalConfig(
        {
          terminalOriginName: opForm.terminalOriginName.trim(),
          terminalOriginAddress: opForm.terminalOriginAddress.trim(),
          ...(opForm.terminalOriginLat != null && opForm.terminalOriginLng != null
            ? { terminalOriginLat: opForm.terminalOriginLat, terminalOriginLng: opForm.terminalOriginLng }
            : {}),
          terminalDestinationName: opForm.terminalDestinationName.trim(),
          terminalDestinationAddress: opForm.terminalDestinationAddress.trim(),
          ...(opForm.terminalDestinationLat != null && opForm.terminalDestinationLng != null
            ? { terminalDestinationLat: opForm.terminalDestinationLat, terminalDestinationLng: opForm.terminalDestinationLng }
            : {}),
          routeOriginName: opForm.routeOriginName.trim(),
          routeDestinationName: opForm.routeDestinationName.trim(),
          returnOriginName: opForm.returnOriginName.trim(),
          returnDestinationName: opForm.returnDestinationName.trim(),
          initialConfigNotes: opForm.initialConfigNotes.trim(),
          gpsRadiusMeters: opForm.gpsRadiusMeters,
          minTripMinutesOutbound: opForm.minTripMinutesOutbound,
          minTripMinutesReturn: opForm.minTripMinutesReturn,
        },
        org.id,
      );
      setOpConfig(updated);
      setEditingOp(false);
    } catch (err) {
      setOpError(err instanceof Error ? err.message : 'No se pudieron guardar los terminales.');
    } finally {
      setOpSaving(false);
    }
  };

  // ── Paso 4: Plan y facturación (solo Plan -- el resto vive en "Planes y
  // Suscripciones", todavia no conectado a datos reales) ──
  const [editingPlan, setEditingPlan] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState('');
  const [pendingPlan, setPendingPlan] = useState<Organization['plan']>(org.plan);
  const [planReason, setPlanReason] = useState('');

  // Sin modulo de Pagos interno (11 sept 2026), el motivo es el UNICO rastro
  // de por que se activo/desactivo PRO -- nunca se manda el cambio sin el.
  const handleChangePlan = async (next: Organization['plan'], reason: string) => {
    if (next === org.plan) { setEditingPlan(false); return; }
    setPlanSaving(true);
    setPlanError('');
    try {
      await updateOrganization(org.id, { plan: next, reason });
      setEditingPlan(false);
      setPlanReason('');
      onSaved();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'No se pudo cambiar el plan.');
    } finally {
      setPlanSaving(false);
    }
  };

  // ── Paso GPS: vincular/editar el dispositivo Traccar real de cada unidad de
  // ESTA asociacion (nunca la flota de otra) -- unico lugar real donde Super
  // Admin hace esto (antes existia el endpoint pero ninguna pantalla lo usaba).
  const [gpsVehicles, setGpsVehicles] = useState<Unit[]>([]);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsLoadError, setGpsLoadError] = useState('');
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [imeiDraft, setImeiDraft] = useState('');
  // Operador/numero de SIM (12 sept 2026): dato puramente informativo, ver
  // comentario en schema.prisma -- se edita junto al IMEI, en la misma fila.
  const [simOperatorDraft, setSimOperatorDraft] = useState('');
  const [simNumberDraft, setSimNumberDraft] = useState('');
  const [gpsSaving, setGpsSaving] = useState(false);
  const [gpsSaveError, setGpsSaveError] = useState('');

  const loadGpsVehicles = useCallback(() => {
    setGpsLoading(true);
    setGpsLoadError('');
    fetchVehicles(undefined, org.id)
      .then(setGpsVehicles)
      .catch(err => setGpsLoadError(err instanceof Error ? err.message : 'No se pudieron cargar las unidades.'))
      .finally(() => setGpsLoading(false));
  }, [org.id]);

  useEffect(() => {
    // Tambien en el paso 5 (Bloqueo de motor): necesita la misma lista de
    // unidades con GPS real para ofrecer el bloqueo directo por llamada.
    if (step === 4 || step === 5) loadGpsVehicles();
  }, [step, loadGpsVehicles]);

  const startEditImei = (vehicleId: string, current?: string, currentSimOperator?: string, currentSimNumber?: string) => {
    setEditingVehicleId(vehicleId);
    setImeiDraft(current ?? '');
    setSimOperatorDraft(currentSimOperator ?? '');
    setSimNumberDraft(currentSimNumber ?? '');
    setGpsSaveError('');
  };

  const handleSaveImei = async (vehicleId: string) => {
    if (!isValidOptionalImei(imeiDraft.trim())) {
      setGpsSaveError(IMEI_ERROR);
      return;
    }
    if (!isValidOptionalPhone(simNumberDraft.trim())) {
      setGpsSaveError(`Número de la SIM: ${PHONE_ERROR}`);
      return;
    }
    setGpsSaving(true);
    setGpsSaveError('');
    try {
      await setVehicleGpsDevice(vehicleId, imeiDraft.trim(), org.id, simOperatorDraft || undefined, simNumberDraft.trim() || undefined);
      setEditingVehicleId(null);
      loadGpsVehicles();
    } catch (err) {
      setGpsSaveError(err instanceof Error ? err.message : 'No se pudo guardar el dispositivo.');
    } finally {
      setGpsSaving(false);
    }
  };

  const handleUnlinkImei = async (vehicleId: string) => {
    if (!window.confirm('¿Desvincular el dispositivo GPS de esta unidad?')) return;
    setGpsSaving(true);
    setGpsSaveError('');
    try {
      await setVehicleGpsDevice(vehicleId, '', org.id);
      loadGpsVehicles();
    } catch (err) {
      setGpsSaveError(err instanceof Error ? err.message : 'No se pudo desvincular el dispositivo.');
    } finally {
      setGpsSaving(false);
    }
  };

  // El Plan GPS Vehicular individual (activo/inactivo por socio) vive en
  // GPSOverviewPage.tsx (nav "GPS" -> asociacion -> tab "Plan GPS Vehicular"),
  // no aca -- es una tarea de cobranza recurrente, no algo que se revise
  // durante la edicion de la asociacion. Este paso solo vincula el IMEI.

  // ── Paso Bloqueo de motor (12 sept 2026, decidido con Jayde): el Socio
  // solicita desde su panel, Super Admin confirma/cancela/restaura ACA --
  // nunca el Administrador de la asociacion.
  const [lockRequests, setLockRequests] = useState<EngineLockRequest[]>([]);
  const [lockLoading, setLockLoading] = useState(false);
  const [lockLoadError, setLockLoadError] = useState('');
  const [lockActionId, setLockActionId] = useState<string | null>(null);
  const [lockActionError, setLockActionError] = useState('');
  const [lockReasonDraft, setLockReasonDraft] = useState<{ id: string; action: 'cancel' | 'restore'; reason: string } | null>(null);

  const loadLockRequests = useCallback(() => {
    setLockLoading(true);
    setLockLoadError('');
    fetchEngineLockRequests(org.id)
      .then(setLockRequests)
      .catch(err => setLockLoadError(err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes.'))
      .finally(() => setLockLoading(false));
  }, [org.id]);

  useEffect(() => {
    if (step === 5) loadLockRequests();
  }, [step, loadLockRequests]);

  const handleConfirmLock = async (id: string) => {
    setLockActionId(id);
    setLockActionError('');
    try {
      await confirmEngineLock(id, org.id);
      loadLockRequests();
    } catch (err) {
      setLockActionError(err instanceof Error ? err.message : 'No se pudo confirmar el bloqueo.');
    } finally {
      setLockActionId(null);
    }
  };

  const handleLockReasonSubmit = async () => {
    if (!lockReasonDraft || !lockReasonDraft.reason.trim()) return;
    setLockActionId(lockReasonDraft.id);
    setLockActionError('');
    try {
      if (lockReasonDraft.action === 'cancel') await cancelEngineLock(lockReasonDraft.id, lockReasonDraft.reason.trim(), org.id);
      else await restoreEngineLock(lockReasonDraft.id, lockReasonDraft.reason.trim(), org.id);
      setLockReasonDraft(null);
      loadLockRequests();
    } catch (err) {
      setLockActionError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    } finally {
      setLockActionId(null);
    }
  };

  // Bloqueo directo por Super Admin (12 sept 2026, acordado con Jayde): el
  // socio llama por telefono sin pasar por su panel -- el motivo sigue
  // siendo obligatorio. Solo unidades con GPS real y sin un bloqueo activo ya.
  const [directVehicleId, setDirectVehicleId] = useState('');
  const [directReason, setDirectReason] = useState('');
  const [directBusy, setDirectBusy] = useState(false);
  const [directError, setDirectError] = useState('');

  const lockableVehicles = gpsVehicles.filter(v =>
    !!v.traccarDeviceId && !lockRequests.some(r => r.vehicleId === v.id && ['SOLICITADO', 'CONFIRMADO', 'EJECUTADO'].includes(r.status)),
  );

  const handleDirectLock = async () => {
    if (!directVehicleId || !directReason.trim()) return;
    setDirectBusy(true);
    setDirectError('');
    try {
      await requestEngineLockDirect(directVehicleId, directReason.trim(), org.id);
      setDirectVehicleId('');
      setDirectReason('');
      loadLockRequests();
    } catch (err) {
      setDirectError(err instanceof Error ? err.message : 'No se pudo registrar el bloqueo.');
    } finally {
      setDirectBusy(false);
    }
  };

  const infoFields: { key: 'name' | 'ruc' | 'city' | 'legalRepName' | 'contactPhone' | 'contactEmail'; label: string; placeholder: string; mono?: boolean }[] = [
    { key: 'name', label: 'Nombre de la asociación *', placeholder: 'ASOTRANS NORTE' },
    { key: 'ruc', label: 'RUC *', placeholder: '20XXXXXXXXX', mono: true },
    { key: 'city', label: 'Ciudad / ubicación', placeholder: 'Puno' },
    { key: 'legalRepName', label: 'Representante legal', placeholder: 'Nombre completo' },
    { key: 'contactPhone', label: 'Teléfono', placeholder: '95XXXXXXX' },
    { key: 'contactEmail', label: 'Correo institucional', placeholder: 'contacto@asociacion.pe' },
  ];

  // Boton Editar/Guardar de la tarjeta -- distinto por paso, ausente en el
  // ultimo (Confirmacion).
  let stepAction: React.ReactNode = null;
  if (step === 0) {
    stepAction = !editingInfo ? (
      <button onClick={() => setEditingInfo(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h">
        <Pencil size={13} /> Editar
      </button>
    ) : (
      <div className="flex items-center gap-2">
        <button onClick={() => { setEditingInfo(false); resetInfoForm(); }} disabled={infoSaving} className="px-3 py-1.5 text-sm font-medium text-t2 border border-border rounded-lg hover:bg-hover disabled:opacity-50">
          Cancelar
        </button>
        <button onClick={handleSaveInfo} disabled={infoSaving} className="px-3.5 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50">
          {infoSaving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    );
  } else if (step === 1) {
    stepAction = !editingAdmin ? (
      <button onClick={() => setEditingAdmin(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h">
        <Pencil size={13} /> {activeAdmins.length > 0 ? 'Agregar administrador' : 'Registrar administrador'}
      </button>
    ) : (
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setEditingAdmin(false); setSwapName(''); setSwapEmail(''); setSwapPhone(''); setSwapError(''); }}
          disabled={swapBusy}
          className="px-3 py-1.5 text-sm font-medium text-t2 border border-border rounded-lg hover:bg-hover disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleAddAdmin}
          disabled={swapBusy || !swapName.trim() || !swapEmail.trim()}
          className="px-3.5 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50"
        >
          {swapBusy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    );
  } else if (step === 2) {
    stepAction = !editingOp ? (
      <button onClick={() => setEditingOp(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h">
        <Pencil size={13} /> Editar
      </button>
    ) : (
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setEditingOp(false);
            setOpError('');
            if (opConfig) {
              setOpForm({
                terminalOriginName: opConfig.terminalOriginName ?? '',
                terminalOriginAddress: opConfig.terminalOriginAddress ?? '',
                terminalOriginLat: opConfig.terminalOriginLat ?? null,
                terminalOriginLng: opConfig.terminalOriginLng ?? null,
                terminalDestinationName: opConfig.terminalDestinationName ?? '',
                terminalDestinationAddress: opConfig.terminalDestinationAddress ?? '',
                terminalDestinationLat: opConfig.terminalDestinationLat ?? null,
                terminalDestinationLng: opConfig.terminalDestinationLng ?? null,
                routeOriginName: opConfig.routeOriginName ?? '',
                routeDestinationName: opConfig.routeDestinationName ?? '',
                returnOriginName: opConfig.returnOriginName ?? '',
                returnDestinationName: opConfig.returnDestinationName ?? '',
                initialConfigNotes: opConfig.initialConfigNotes ?? '',
                gpsRadiusMeters: opConfig.gpsRadiusMeters ?? 300,
                minTripMinutesOutbound: opConfig.minTripMinutesOutbound ?? 90,
                minTripMinutesReturn: opConfig.minTripMinutesReturn ?? 90,
              });
            }
          }}
          disabled={opSaving}
          className="px-3 py-1.5 text-sm font-medium text-t2 border border-border rounded-lg hover:bg-hover disabled:opacity-50"
        >
          Cancelar
        </button>
        <button onClick={handleSaveOp} disabled={opSaving} className="px-3.5 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50">
          {opSaving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    );
  } else if (step === 3) {
    stepAction = !editingPlan ? (
      <button onClick={() => { setEditingPlan(true); setPendingPlan(org.plan); setPlanReason(''); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h">
        <Pencil size={13} /> Editar
      </button>
    ) : (
      <button onClick={() => { setEditingPlan(false); setPlanError(''); setPendingPlan(org.plan); setPlanReason(''); }} disabled={planSaving} className="px-3 py-1.5 text-sm font-medium text-t2 border border-border rounded-lg hover:bg-hover disabled:opacity-50">
        Cancelar
      </button>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 lg:p-8">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onBack} className="text-sm text-primary hover:underline flex items-center gap-1">
            <ChevronLeft size={16} /> Volver
          </button>
          <h1 className="text-2xl font-bold text-t1">Editar asociación · {org.name}</h1>
        </div>

        {/* Progress bar -- igual al del wizard de creacion, pero clicable */}
        <div className="flex items-center mb-8 overflow-x-auto">
          {EDIT_ORG_STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-shrink-0">
              <button onClick={() => setStep(i)} className="cursor-pointer">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mx-auto ${i === step ? 'bg-primary text-white' : 'bg-border text-muted hover:bg-primary/20'}`}>
                  {i + 1}
                </div>
                <span className={`text-[10px] mt-1 whitespace-nowrap block text-center ${i === step ? 'text-primary font-medium' : 'text-t2'}`}>{s}</span>
              </button>
              {i < EDIT_ORG_STEPS.length - 1 && <div className="h-0.5 w-10 mx-1 mb-3 bg-border" />}
            </div>
          ))}
        </div>

        <div className="bg-surface border border-border rounded-lg p-6 max-w-2xl">
          <div className="flex items-center justify-between mb-5 gap-3">
            <h2 className="text-base font-semibold text-t1">{EDIT_ORG_STEPS[step]}</h2>
            {stepAction}
          </div>

          {step === 0 && (
            <div className="space-y-4">
              {infoFields.map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-t1 mb-1">{f.label}</label>
                  {editingInfo ? (
                    <input
                      value={infoForm[f.key]}
                      onChange={e => setInfoForm(v => ({ ...v, [f.key]: f.key === 'contactPhone' ? sanitizePhone(e.target.value) : f.key === 'ruc' ? sanitizeRuc(e.target.value) : f.key === 'legalRepName' ? capitalizeWords(e.target.value) : e.target.value }))}
                      {...(f.key === 'contactPhone' ? phoneInputProps : f.key === 'ruc' ? rucInputProps : {})}
                      placeholder={f.placeholder}
                      className={`w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary ${f.mono ? 'font-mono' : ''}`}
                    />
                  ) : (
                    <p className={`text-sm text-t1 ${f.mono ? 'font-mono' : ''}`}>{infoForm[f.key] || '—'}</p>
                  )}
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium text-t1 mb-1">Logotipo de la asociación</label>
                <div className="flex items-center gap-3">
                  {infoForm.logoUrl ? (
                    <img src={infoForm.logoUrl} alt={`Logo de ${org.name}`} className="w-20 h-12 object-contain bg-bg border border-border rounded-md" />
                  ) : (
                    <div className="w-20 h-12 flex items-center justify-center bg-bg border border-dashed border-border rounded-md text-muted">
                      <ImageIcon size={16} />
                    </div>
                  )}
                  {editingInfo && (
                    <label className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors cursor-pointer">
                      <Upload size={13} />
                      {logoUploading ? 'Subiendo…' : infoForm.logoUrl ? 'Cambiar' : 'Subir logo'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={logoUploading}
                        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) handleLogoFile(file); }}
                      />
                    </label>
                  )}
                </div>
              </div>

              {infoError && <p className="text-sm text-danger">{infoError}</p>}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-t1 mb-2">Administradores</p>
                {activeAdmins.length > 0 ? (
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {activeAdmins.map(a => (
                      <div key={a.id} className="px-3.5 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-t1 text-sm">{a.name}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${a.status === 'ACTIVO' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
                              {a.status === 'ACTIVO' ? 'Activo' : 'Pendiente (aún no ingresó con Google)'}
                            </span>
                          </div>
                          <p className="text-sm text-t2 mt-0.5">{a.email}</p>
                          {a.phone && <p className="text-sm text-t2 mt-0.5">{a.phone}</p>}
                        </div>
                        <button
                          onClick={() => { setRemoveAdminTarget(a); setRemoveAdminReason(''); setRemoveAdminError(''); }}
                          disabled={removingAdminId === a.id}
                          className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-danger border border-danger/30 rounded-lg hover:bg-danger/5 disabled:opacity-50"
                        >
                          {removingAdminId === a.id ? 'Dando de baja…' : 'Eliminar'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-t2">Sin administrador registrado todavía.</p>
                )}
              </div>

              {editingAdmin && (
                <div className="p-3.5 border border-border rounded-lg space-y-3 bg-bg">
                  <p className="text-sm font-medium text-t1">
                    {activeAdmins.length > 0 ? 'Nuevo administrador adicional' : 'Registrar administrador'}
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-t1 mb-1">Nombre del administrador *</label>
                    <input
                      value={swapName}
                      onChange={e => setSwapName(capitalizeWords(e.target.value))}
                      placeholder="Nombre completo"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-t1 mb-1">Correo *</label>
                    <input
                      value={swapEmail}
                      onChange={e => setSwapEmail(e.target.value)}
                      placeholder="admin@asociacion.pe"
                      type="email"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-t1 mb-1">Teléfono</label>
                    <input
                      value={swapPhone}
                      onChange={e => setSwapPhone(sanitizePhone(e.target.value))}
                      {...phoneInputProps}
                      placeholder="9XXXXXXXX"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  {swapError && <p className="text-sm text-danger">{swapError}</p>}
                  <p className="text-xs text-t2">
                    {activeAdmins.length > 0
                      ? 'Al guardar, este correo queda como administrador adicional -- los demás administradores activos siguen igual.'
                      : 'Se enviará una invitación al administrador cuando guardes (entra con su cuenta de Google).'}
                  </p>
                </div>
              )}

              <p className="text-xs text-t2">El resto de cuentas (socios, conductores) se gestionan desde "Entrar como administrador" → Personas.</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-t1 mb-2">Terminal 1 — Punto de salida de la ruta de ida</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-t1 mb-1">Nombre del terminal *</label>
                    {editingOp ? (
                      <input
                        value={opForm.terminalOriginName}
                        onChange={e => setOpForm(v => ({ ...v, terminalOriginName: e.target.value }))}
                        placeholder="Terminal Zonal Juli"
                        className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <p className="text-sm text-t1">{opForm.terminalOriginName || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-t1 mb-1">Dirección</label>
                    {editingOp ? (
                      <input
                        value={opForm.terminalOriginAddress}
                        onChange={e => setOpForm(v => ({ ...v, terminalOriginAddress: e.target.value }))}
                        placeholder="Jr. Terminal 123, Juli"
                        className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <p className="text-sm text-t1">{opForm.terminalOriginAddress || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-t1 mb-1">Ubicación en el mapa</label>
                    {editingOp ? (
                      <TerminalMapPicker
                        lat={opForm.terminalOriginLat}
                        lng={opForm.terminalOriginLng}
                        onChange={(lat, lng) => setOpForm(v => ({ ...v, terminalOriginLat: lat, terminalOriginLng: lng }))}
                        heightClass="h-48"
                      />
                    ) : null}
                    <p className="text-sm text-t2 mt-1.5 font-mono">
                      {opForm.terminalOriginLat != null && opForm.terminalOriginLng != null
                        ? `${opForm.terminalOriginLat.toFixed(5)}, ${opForm.terminalOriginLng.toFixed(5)}`
                        : 'Sin ubicación marcada todavía'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-t1 mb-2">Terminal 2 — Punto de salida de la ruta de vuelta</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-t1 mb-1">Nombre del terminal *</label>
                    {editingOp ? (
                      <input
                        value={opForm.terminalDestinationName}
                        onChange={e => setOpForm(v => ({ ...v, terminalDestinationName: e.target.value }))}
                        placeholder="Terminal Zonal Puno"
                        className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <p className="text-sm text-t1">{opForm.terminalDestinationName || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-t1 mb-1">Dirección</label>
                    {editingOp ? (
                      <input
                        value={opForm.terminalDestinationAddress}
                        onChange={e => setOpForm(v => ({ ...v, terminalDestinationAddress: e.target.value }))}
                        placeholder="Terminal Terrestre, Puno"
                        className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <p className="text-sm text-t1">{opForm.terminalDestinationAddress || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-t1 mb-1">Ubicación en el mapa</label>
                    {editingOp ? (
                      <TerminalMapPicker
                        lat={opForm.terminalDestinationLat}
                        lng={opForm.terminalDestinationLng}
                        onChange={(lat, lng) => setOpForm(v => ({ ...v, terminalDestinationLat: lat, terminalDestinationLng: lng }))}
                        heightClass="h-48"
                      />
                    ) : null}
                    <p className="text-sm text-t2 mt-1.5 font-mono">
                      {opForm.terminalDestinationLat != null && opForm.terminalDestinationLng != null
                        ? `${opForm.terminalDestinationLat.toFixed(5)}, ${opForm.terminalDestinationLng.toFixed(5)}`
                        : 'Sin ubicación marcada todavía'}
                    </p>
                  </div>
                </div>
              </div>

              <EnabledRoutesEditor
                editing={editingOp}
                routes={[
                  { origin: opForm.routeOriginName, destination: opForm.routeDestinationName },
                  { origin: opForm.returnOriginName, destination: opForm.returnDestinationName },
                ].filter(r => r.origin.trim() && r.destination.trim())}
                onChange={list => setOpForm(v => ({
                  ...v,
                  routeOriginName: list[0]?.origin ?? '',
                  routeDestinationName: list[0]?.destination ?? '',
                  returnOriginName: list[1]?.origin ?? '',
                  returnDestinationName: list[1]?.destination ?? '',
                }))}
              />

              <div>
                <label className="block text-sm font-medium text-t1 mb-1">Configuración inicial (notas)</label>
                {editingOp ? (
                  <textarea
                    value={opForm.initialConfigNotes}
                    onChange={e => setOpForm(v => ({ ...v, initialConfigNotes: e.target.value }))}
                    placeholder="Horario de apertura, tarifa base…"
                    rows={2}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                ) : (
                  <p className="text-sm text-t1 whitespace-pre-wrap">{opForm.initialConfigNotes || '—'}</p>
                )}
              </div>

              {opError && <p className="text-sm text-danger">{opError}</p>}
              <p className="text-xs text-t2">
                La ubicación en el mapa que marques aquí es la que usa el sistema para validar el GPS al inscribirse en la cola contraria. El administrador de la asociación puede consultarla desde Configuración → Terminales, pero solo el Super Admin puede cambiarla — y solo se cambia aquí.
              </p>

              <div className="border-t border-border pt-5">
                <p className="text-sm font-semibold text-t1 mb-1">Parámetros antifraude</p>
                <p className="text-xs text-t2 mb-3">
                  Controlan la cola contraria (plan-operacion.md §3.10) — el administrador de la asociación solo puede verlos, nunca cambiarlos.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-t1 mb-1">Radio GPS de terminal (metros)</label>
                    {editingOp ? (
                      <input
                        type="number"
                        min={50}
                        max={2000}
                        value={opForm.gpsRadiusMeters}
                        onChange={e => setOpForm(v => ({ ...v, gpsRadiusMeters: Number(e.target.value) }))}
                        className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <p className="text-sm text-t1">{opForm.gpsRadiusMeters} m</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t1 mb-1">Tiempo mínimo de viaje — ida (min)</label>
                    {editingOp ? (
                      <input
                        type="number"
                        min={10}
                        max={600}
                        value={opForm.minTripMinutesOutbound}
                        onChange={e => setOpForm(v => ({ ...v, minTripMinutesOutbound: Number(e.target.value) }))}
                        className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <p className="text-sm text-t1">{opForm.minTripMinutesOutbound} min</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t1 mb-1">Tiempo mínimo de viaje — vuelta (min)</label>
                    {editingOp ? (
                      <input
                        type="number"
                        min={10}
                        max={600}
                        value={opForm.minTripMinutesReturn}
                        onChange={e => setOpForm(v => ({ ...v, minTripMinutesReturn: Number(e.target.value) }))}
                        className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <p className="text-sm text-t1">{opForm.minTripMinutesReturn} min</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-5">
                <p className="text-sm font-semibold text-t1 mb-1">Paradas adicionales</p>
                <p className="text-xs text-t2 mb-3">
                  La ruta de ida y de vuelta ya están cubiertas por Terminal 1 y Terminal 2 — esas dos son las que aparecen en "Rutas habilitadas". Esto de aquí es solo informativo: paradas intermedias por las que pasa la unidad, para que el pasajero no se confunda. No crea una cola de salida nueva.
                </p>
                {routes.length > 0 && (
                  <div className="border border-border rounded-lg divide-y divide-border mb-3">
                    {routes.map(r => (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <p className="text-sm text-t1">{r.origin} → {r.destination}</p>
                        <button
                          onClick={() => handleDeleteRoute(r.id)}
                          className="w-7 h-7 grid place-items-center rounded-md text-danger hover:bg-danger/5"
                          aria-label={`Eliminar ruta ${r.origin} → ${r.destination}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={newRouteOrigin}
                    onChange={e => setNewRouteOrigin(e.target.value)}
                    placeholder="Origen"
                    className="flex-1 h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <input
                    value={newRouteDestination}
                    onChange={e => setNewRouteDestination(e.target.value)}
                    placeholder="Destino"
                    className="flex-1 h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={handleAddRoute}
                    disabled={routeSaving || !newRouteOrigin.trim() || !newRouteDestination.trim()}
                    className="h-9 px-3 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-selected disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                  >
                    <Plus size={14} /> Agregar
                  </button>
                </div>
                {routeError && <p className="text-sm text-danger mt-2">{routeError}</p>}
              </div>

              <div className="border-t border-border pt-5">
                <p className="text-sm font-semibold text-t1 mb-1">Empresas integrantes</p>
                <p className="text-xs text-t2 mb-3">Mismas empresas que aparecen en Flota y Manifiestos del panel del administrador — agrégalas por nombre, el resto de sus datos se completa después si hace falta.</p>
                {companies.length > 0 && (
                  <div className="border border-border rounded-lg divide-y divide-border mb-3">
                    {companies.map(co => (
                      <div key={co.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <div>
                          <p className="text-sm text-t1">{co.name}</p>
                          {co.ruc && <p className="text-xs text-t2">RUC {co.ruc}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleToggleCompanyStatus(co.id, co.status)}
                            className={`text-[10px] px-2 py-1 rounded font-medium ${co.status === 'SUSPENDIDA' ? 'bg-danger/10 text-danger' : 'bg-ok/10 text-ok'}`}
                          >
                            {co.status === 'SUSPENDIDA' ? 'Suspendida — reactivar' : 'Activa — suspender'}
                          </button>
                          <button
                            onClick={() => { setDeleteCompanyTarget(co); setDeleteCompanyReason(''); setDeleteCompanyError(''); }}
                            className="text-[10px] px-2 py-1 rounded font-medium border border-border text-t2 hover:border-danger/40 hover:text-danger"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={newCompanyName}
                    onChange={e => setNewCompanyName(e.target.value)}
                    placeholder="Nombre de la empresa"
                    className="flex-1 h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={handleAddCompany}
                    disabled={companySaving || !newCompanyName.trim()}
                    className="h-9 px-3 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-selected disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                  >
                    <Plus size={14} /> Agregar
                  </button>
                </div>
                {companyError && <p className="text-sm text-danger mt-2">{companyError}</p>}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-t1 mb-1">Plan *</label>
                {editingPlan ? (
                  <div className="space-y-3 max-w-sm">
                    <div className="flex rounded-lg border border-border overflow-hidden text-sm">
                      <button
                        onClick={() => setPendingPlan('OPERACION')}
                        disabled={planSaving}
                        className={`flex-1 py-2 font-medium transition-colors disabled:cursor-default ${pendingPlan === 'OPERACION' ? 'bg-primary text-white' : 'text-t2 hover:bg-hover'}`}
                      >
                        Operación
                      </button>
                      <button
                        onClick={() => setPendingPlan('PRO')}
                        disabled={planSaving}
                        className={`flex-1 py-2 font-medium transition-colors disabled:cursor-default ${pendingPlan === 'PRO' ? 'bg-primary text-white' : 'text-t2 hover:bg-hover'}`}
                      >
                        PRO
                      </button>
                    </div>
                    {pendingPlan !== org.plan && (
                      <div>
                        <label className="block text-xs font-medium text-t1 mb-1">Motivo del cambio * (queda en Auditoría)</label>
                        <textarea
                          value={planReason}
                          onChange={e => setPlanReason(e.target.value)}
                          rows={2}
                          placeholder="Ej. Pago confirmado por transferencia, referencia 00123"
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <button
                          onClick={() => handleChangePlan(pendingPlan, planReason)}
                          disabled={planSaving || !planReason.trim()}
                          className="mt-2 px-3.5 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50"
                        >
                          {planSaving ? 'Guardando…' : `Confirmar cambio a ${pendingPlan === 'PRO' ? 'PRO' : 'Operación'}`}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-t1">{org.plan}</p>
                )}
                {planError && <p className="text-sm text-danger mt-1.5">{planError}</p>}
              </div>
              <p className="text-xs text-t2">
                El pago y la facturación se coordinan directamente con la asociación, fuera de la plataforma — este botón es el único
                que activa o desactiva PRO de verdad, y cada cambio queda registrado en Auditoría con el motivo indicado.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-xs text-t2">
                Vincula el IMEI real del dispositivo Traccar a cada unidad de {org.name}. Aplica tanto para flota PRO como para
                unidades con GPS Vehicular individual en Plan Operación — el acceso al GPS de cada unidad ya no depende del plan,
                depende de si tiene un dispositivo vinculado aquí.
              </p>
              {gpsLoading ? (
                <p className="text-sm text-t2">Cargando unidades…</p>
              ) : gpsLoadError ? (
                <p className="text-sm text-danger">{gpsLoadError}</p>
              ) : gpsVehicles.length === 0 ? (
                <p className="text-sm text-t2">Esta asociación todavía no tiene unidades registradas.</p>
              ) : (
                <div className="bg-bg border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-3 py-2 text-t2 font-medium">Unidad</th>
                        <th className="text-left px-3 py-2 text-t2 font-medium">Placa</th>
                        <th className="text-left px-3 py-2 text-t2 font-medium">Empresa</th>
                        <th className="text-left px-3 py-2 text-t2 font-medium">Dispositivo (IMEI)</th>
                        <th className="text-left px-3 py-2 text-t2 font-medium">SIM (informativo)</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {gpsVehicles.map(v => (
                        <tr key={v.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2.5 font-semibold text-t1">{v.code}</td>
                          <td className="px-3 py-2.5 font-mono text-t2">{v.plate}</td>
                          <td className="px-3 py-2.5 text-t2">{v.company}</td>
                          <td className="px-3 py-2.5">
                            {editingVehicleId === v.id ? (
                              <input
                                value={imeiDraft}
                                onChange={e => setImeiDraft(sanitizeImei(e.target.value))}
                                inputMode="numeric"
                                placeholder="IMEI (15 números)"
                                className="h-8 px-2 border border-border rounded text-sm font-mono w-44 focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                            ) : v.traccarDeviceId ? (
                              <span className="font-mono text-t1">{v.traccarDeviceId}</span>
                            ) : (
                              <span className="text-muted">Sin dispositivo</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {editingVehicleId === v.id ? (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={simOperatorDraft}
                                  onChange={e => setSimOperatorDraft(e.target.value)}
                                  className="h-8 px-1.5 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                  <option value="">— Operador —</option>
                                  <option value="CLARO">Claro</option>
                                  <option value="MOVISTAR">Movistar</option>
                                  <option value="BITEL">Bitel</option>
                                  <option value="ENTEL">Entel</option>
                                </select>
                                <input
                                  value={simNumberDraft}
                                  onChange={e => setSimNumberDraft(sanitizePhone(e.target.value))}
                                  inputMode="numeric"
                                  placeholder="SIM (9 números)"
                                  className="h-8 px-2 border border-border rounded text-sm w-28 focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                              </div>
                            ) : v.simOperator || v.simNumber ? (
                              <span className="text-t2">{v.simOperator ? v.simOperator.charAt(0) + v.simOperator.slice(1).toLowerCase() : '—'}{v.simNumber ? ` · ${v.simNumber}` : ''}</span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            {editingVehicleId === v.id ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleSaveImei(v.id)}
                                  disabled={gpsSaving || !imeiDraft.trim()}
                                  className="px-2.5 py-1 text-xs font-medium bg-primary text-white rounded hover:bg-primary-h disabled:opacity-50"
                                >
                                  {gpsSaving ? 'Guardando…' : 'Guardar'}
                                </button>
                                <button
                                  onClick={() => setEditingVehicleId(null)}
                                  disabled={gpsSaving}
                                  className="px-2.5 py-1 text-xs font-medium text-t2 border border-border rounded hover:bg-hover"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => startEditImei(v.id, v.traccarDeviceId, v.simOperator, v.simNumber)}
                                  className="px-2.5 py-1 text-xs font-medium text-primary border border-primary/30 rounded hover:bg-primary/5"
                                >
                                  {v.traccarDeviceId ? 'Editar' : 'Vincular'}
                                </button>
                                {v.traccarDeviceId && (
                                  <button
                                    onClick={() => handleUnlinkImei(v.id)}
                                    disabled={gpsSaving}
                                    className="px-2.5 py-1 text-xs font-medium text-danger border border-danger/30 rounded hover:bg-danger/5 disabled:opacity-50"
                                  >
                                    Desvincular
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {gpsSaveError && <p className="text-sm text-danger">{gpsSaveError}</p>}
              <p className="text-xs text-muted">El IMEI se define durante la instalación física del equipo (equipo técnico de CHASKI AI) — nunca lo asigna el administrador de la asociación.</p>
              <p className="text-xs text-muted">
                Para activar/desactivar el Plan GPS Vehicular individual de un socio (por pago), ve a <strong>GPS</strong> en el menú
                lateral → esta asociación → tab "Plan GPS Vehicular".
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <p className="text-xs text-t2">
                Solicitudes de bloqueo remoto de motor de {org.name}. Solo el socio dueño puede solicitar (desde su panel); solo tú confirmas, cancelas o restauras — nunca el administrador de la asociación.
              </p>

              {/* Bloqueo directo (12 sept 2026): el socio llama por telefono
                  en vez de solicitarlo digitalmente -- el motivo sigue siendo
                  obligatorio, sin excepcion. */}
              <div className="bg-danger/5 border border-danger/20 rounded-lg p-3.5 space-y-2">
                <p className="text-sm font-semibold text-t1">Bloquear ahora (llamada telefónica del socio)</p>
                <p className="text-xs text-t2">Para cuando el socio te llama directamente en vez de solicitarlo desde su panel. Se registra y se ejecuta de inmediato con el mismo motivo obligatorio.</p>
                <div className="flex flex-wrap gap-2 items-start">
                  <select
                    value={directVehicleId}
                    onChange={e => setDirectVehicleId(e.target.value)}
                    className="h-9 px-2.5 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary min-w-[220px]"
                  >
                    <option value="">Elegir unidad…</option>
                    {lockableVehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.code} · {v.plate}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={directReason}
                    onChange={e => setDirectReason(e.target.value)}
                    placeholder="Motivo del bloqueo (obligatorio)…"
                    className="h-9 px-2.5 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary flex-1 min-w-[220px]"
                  />
                  <button
                    onClick={handleDirectLock}
                    disabled={!directVehicleId || !directReason.trim() || directBusy}
                    className="h-9 px-3.5 text-sm font-medium bg-danger text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {directBusy ? 'Bloqueando…' : 'Bloquear'}
                  </button>
                </div>
                {lockableVehicles.length === 0 && <p className="text-xs text-t2">No hay unidades con GPS disponibles para bloquear (o todas ya tienen un bloqueo activo).</p>}
                {directError && <p className="text-xs text-danger">{directError}</p>}
              </div>

              {lockLoading ? (
                <p className="text-sm text-t2">Cargando solicitudes…</p>
              ) : lockLoadError ? (
                <p className="text-sm text-danger">{lockLoadError}</p>
              ) : lockRequests.length === 0 ? (
                <p className="text-sm text-t2">Sin solicitudes de bloqueo para esta asociación.</p>
              ) : (
                <div className="bg-bg border border-border rounded-lg overflow-hidden divide-y divide-border">
                  {lockRequests.map(r => (
                    <div key={r.id} className={`p-3.5 ${r.status === 'EJECUTADO' ? 'bg-danger/10' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-t1">
                            Unidad {r.vehicle.code} · {r.vehicle.plate}
                            <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded font-medium ${r.status === 'EJECUTADO' ? 'bg-danger text-white' : r.status === 'CONFIRMADO' ? 'bg-warn/10 text-warn' : 'bg-t2/10 text-t2'}`}>
                              {r.status}
                            </span>
                          </p>
                          <p className="text-sm text-t2 mt-1">Motivo: {r.requestReason}</p>
                          <p className="text-xs text-muted mt-1">Solicitado: {new Date(r.createdAt).toLocaleString('es-PE')}</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {r.status === 'SOLICITADO' && (
                            <button onClick={() => handleConfirmLock(r.id)} disabled={lockActionId === r.id} className="px-2.5 py-1 text-xs font-medium bg-danger text-white rounded hover:opacity-90 disabled:opacity-50">
                              {lockActionId === r.id ? 'Confirmando…' : 'Confirmar bloqueo'}
                            </button>
                          )}
                          {(r.status === 'SOLICITADO' || r.status === 'CONFIRMADO') && (
                            <button onClick={() => setLockReasonDraft({ id: r.id, action: 'cancel', reason: '' })} className="px-2.5 py-1 text-xs font-medium text-t2 border border-border rounded hover:bg-hover">
                              Cancelar
                            </button>
                          )}
                          {r.status === 'EJECUTADO' && (
                            <button onClick={() => setLockReasonDraft({ id: r.id, action: 'restore', reason: '' })} className="px-2.5 py-1 text-xs font-medium text-ok border border-ok/30 rounded hover:bg-ok/5">
                              Restaurar
                            </button>
                          )}
                        </div>
                      </div>
                      {lockReasonDraft?.id === r.id && (
                        <div className="mt-3 space-y-2 border-t border-border pt-3">
                          <textarea
                            value={lockReasonDraft.reason}
                            onChange={e => setLockReasonDraft(d => d && { ...d, reason: e.target.value })}
                            placeholder={lockReasonDraft.action === 'cancel' ? 'Motivo de la cancelación…' : 'Motivo de la restauración…'}
                            rows={2}
                            className="w-full px-2.5 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <div className="flex gap-1.5">
                            <button onClick={handleLockReasonSubmit} disabled={!lockReasonDraft.reason.trim() || lockActionId === r.id} className="px-2.5 py-1 text-xs font-medium bg-primary text-white rounded hover:bg-primary-h disabled:opacity-50">
                              {lockActionId === r.id ? 'Guardando…' : 'Confirmar'}
                            </button>
                            <button onClick={() => setLockReasonDraft(null)} className="px-2.5 py-1 text-xs font-medium text-t2 border border-border rounded hover:bg-hover">Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {lockActionError && <p className="text-sm text-danger">{lockActionError}</p>}
              <p className="text-xs text-muted">Si la unidad está en movimiento al confirmar, el corte espera a que se detenga por completo (no un instante) antes de ejecutarse — nunca con el vehículo en marcha.</p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-1 text-sm">
              {[
                ['Nombre', infoForm.name || '—'],
                ['RUC', infoForm.ruc || '—'],
                ['Ciudad', infoForm.city || '—'],
                ['Representante', infoForm.legalRepName || '—'],
                ['Teléfono', infoForm.contactPhone || '—'],
                ['Correo institucional', infoForm.contactEmail || '—'],
                ['Administrador', activeAdmins.length > 1 ? `${activeAdmins[0]?.name} (+${activeAdmins.length - 1} más)` : activeAdmins[0]?.name || '—'],
                ['Correo admin', activeAdmins[0]?.email || '—'],
                ['Terminal 1', opForm.terminalOriginName || '—'],
                ['Terminal 2', opForm.terminalDestinationName || '—'],
                ['Radio GPS de terminal', `${opForm.gpsRadiusMeters} m`],
                ['Tiempo mínimo — ida', `${opForm.minTripMinutesOutbound} min`],
                ['Tiempo mínimo — vuelta', `${opForm.minTripMinutesReturn} min`],
                ['Rutas adicionales', routes.length > 0 ? routes.map(r => `${r.origin} → ${r.destination}`).join(', ') : '—'],
                ['Empresas integrantes', companies.length > 0 ? companies.map(co => co.name).join(', ') : '—'],
                ['Plan', org.plan],
                ['Estado', org.status.replace(/_/g, ' ')],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-border py-2 last:border-0">
                  <span className="text-t2">{label}</span>
                  <span className="text-t1 font-medium">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mt-6 max-w-2xl">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-3.5 py-2 text-sm font-medium text-t2 border border-border rounded-lg hover:bg-hover disabled:opacity-40"
          >
            ← Anterior
          </button>
          {step < EDIT_ORG_STEPS.length - 1 && (
            <button
              onClick={() => setStep(s => Math.min(EDIT_ORG_STEPS.length - 1, s + 1))}
              className="px-3.5 py-2 text-sm font-medium text-t2 border border-border rounded-lg hover:bg-hover"
            >
              Siguiente →
            </button>
          )}
        </div>
      </div>

      {deleteCompanyTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Eliminar empresa integrante">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-t1 mb-1">Eliminar {deleteCompanyTarget.name}</h3>
            <p className="text-xs text-t2 mb-4">
              La empresa dejará de aparecer en el panel del administrador y en el tuyo. Sus datos e historial se conservan; si vuelve a operar, podrás restaurarla. Solo se puede eliminar si todas sus unidades ya están dadas de baja. Se requiere motivo.
            </p>
            <textarea
              value={deleteCompanyReason}
              onChange={e => setDeleteCompanyReason(e.target.value)}
              placeholder="Motivo (ej. la empresa dejó de operar)…"
              className="w-full min-h-20 px-3 py-2 border border-border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {deleteCompanyError && <p className="text-xs text-danger mb-3">{deleteCompanyError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setDeleteCompanyTarget(null); setDeleteCompanyReason(''); setDeleteCompanyError(''); }} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button onClick={confirmDeleteCompany} disabled={!deleteCompanyReason.trim() || deletingCompany} className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/80 disabled:opacity-50">
                {deletingCompany ? 'Eliminando…' : 'Eliminar empresa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreOffer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Restaurar empresa">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-t1 mb-1">{restoreOffer.name} ya existió</h3>
            <p className="text-xs text-t2 mb-4">
              Esta empresa fue eliminada antes. Puedes restaurarla con todo su historial en vez de crearla de nuevo.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRestoreOffer(null)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button onClick={confirmRestoreCompany} disabled={restoringCompany} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50">
                {restoringCompany ? 'Restaurando…' : 'Restaurar empresa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {removeAdminTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Eliminar administrador">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-t1 mb-1">Eliminar a {removeAdminTarget.name}</h3>
            <p className="text-xs text-t2 mb-4">Deja de aparecer y no podrá volver a entrar; su historial hasta hoy se conserva. Si lo registras de nuevo con el mismo correo, empieza como una cuenta nueva. Se requiere motivo.</p>
            <textarea
              value={removeAdminReason}
              onChange={e => setRemoveAdminReason(e.target.value)}
              placeholder="Motivo de la eliminación…"
              className="w-full min-h-20 px-3 py-2 border border-border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {removeAdminError && <p className="text-xs text-danger mb-3">{removeAdminError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setRemoveAdminTarget(null); setRemoveAdminReason(''); setRemoveAdminError(''); }} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button onClick={confirmRemoveAdmin} disabled={!removeAdminReason.trim() || removingAdminId === removeAdminTarget.id} className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/80 disabled:opacity-50">
                {removingAdminId === removeAdminTarget.id ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Solicitudes comerciales ────────────────────────────────────
const CR_STATUS_STYLE: Record<string, string> = {
  NUEVA: 'bg-primary/10 text-primary',
  CONTACTADA: 'bg-warn/10 text-warn',
  COTIZADA: 'bg-teal/10 text-teal',
  CONVERTIDA: 'bg-ok/10 text-ok',
  DESCARTADA: 'bg-t2/10 text-muted',
};

const CR_SOLUTION_LABEL: Record<string, string> = {
  OPERACION: 'Operación',
  PRO: 'PRO',
  GPS_VEHICULAR: 'GPS Vehicular',
};

const CR_ANSWER_LABEL: Record<string, string> = {
  city: 'Ciudad', routes: 'Rutas', totalUnits: 'Unidades totales', gpsUnits: 'Unidades GPS',
  period: 'Periodo', comments: 'Comentarios', unitCode: 'Código de unidad', plate: 'Placa',
  units: 'Unidades a cotizar', message: 'Mensaje',
};

// Las solicitudes llegan desde la landing pública sin autenticación (ver
// src/lib/commercial-requests-api.ts) y se atienden aquí. El backend solo
// expone "marcar contactada" -- cotización, propuesta y conversión a cliente
// se registran manualmente por el Super Admin fuera de este listado (ver
// docs/planes/landing-publica-y-solicitudes-comerciales.md §7, PENDIENTE DE
// DECISIÓN si hace falta una pantalla dedicada para ese seguimiento).
function SACommercialRequests({ onUseForNewOrg }: { onUseForNewOrg: (req: ApiCommercialRequest, suggestion: OnboardingSuggestion) => void }) {
  const [requests, setRequests] = useState<ApiCommercialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApiCommercialRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [triageSummary, setTriageSummary] = useState<string | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState('');

  // Triaje automatico (ia-aplicada.md §2.1) -- resumen ejecutivo aparte del
  // detalle real (siempre visible abajo), nunca lo reemplaza. Best-effort:
  // si no hay resumen (Claude no configurado o fallo puntual), la tarjeta
  // simplemente no aparece.
  useEffect(() => {
    if (!selected) { setTriageSummary(null); return; }
    setTriageSummary(null);
    setTriageLoading(true);
    fetchCommercialRequestTriage(selected.id)
      .then(res => setTriageSummary(res.summary))
      .catch(() => setTriageSummary(null))
      .finally(() => setTriageLoading(false));
  }, [selected?.id]);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchCommercialRequests()
      .then(list => setRequests(list))
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo cargar las solicitudes.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const markReviewed = async (id: string) => {
    setSaving(true);
    try {
      const updated = await markCommercialRequestReviewed(id);
      setRequests(prev => prev.map(r => (r.id === id ? updated : r)));
      setSelected(prev => (prev && prev.id === id ? updated : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la solicitud.');
    } finally {
      setSaving(false);
    }
  };

  // Asistente de onboarding (ia-aplicada.md §2.5): pide la sugerencia y
  // navega al wizard "Nueva asociación" ya pre-llenado -- el wizard mismo
  // muestra el aviso de que hay que revisar, nunca crea nada por su cuenta.
  const useForNewOrg = async (req: ApiCommercialRequest) => {
    setOnboardingLoading(true);
    setOnboardingError('');
    try {
      const suggestion = await fetchCommercialRequestOnboardingSuggestion(req.id);
      onUseForNewOrg(req, suggestion);
    } catch (err) {
      setOnboardingError(err instanceof Error ? err.message : 'No se pudo generar la sugerencia.');
    } finally {
      setOnboardingLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 py-4 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-t1">Solicitudes comerciales</h1>
          <p className="text-sm text-t2 mt-0.5">Solicitudes recibidas desde la landing pública</p>
        </div>
        <button onClick={load} className="text-sm text-t2 hover:text-t1 flex items-center gap-1.5">
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {error && (
        <div className="px-6 py-3 bg-danger/5 border-b border-danger/20 text-sm text-danger" role="alert">{error}</div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selected ? 'border-r border-border' : ''}`}>
          {loading ? (
            <div className="p-6 text-sm text-t2">Cargando solicitudes…</div>
          ) : requests.length === 0 ? (
            <div className="p-6 text-sm text-t2">Todavía no hay solicitudes comerciales registradas.</div>
          ) : (
            <table className="w-full text-sm" aria-label="Solicitudes comerciales">
              <thead className="sticky top-0">
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Solución</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Organización / Contacto</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Correo</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Teléfono</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Fecha</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-hover cursor-pointer" onClick={() => setSelected(r === selected ? null : r)}>
                    <td className="px-4 py-3 text-t1">{CR_SOLUTION_LABEL[r.solution] ?? r.solution}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-t1">{r.orgName || r.contactName}</p>
                      {r.orgName && <p className="text-xs text-t2">{r.contactName}</p>}
                    </td>
                    <td className="px-4 py-3 text-t2">{r.contactEmail}</td>
                    <td className="px-4 py-3 text-t2">{r.contactPhone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${CR_STATUS_STYLE[r.status]}`}>{r.status.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-t2 font-mono">{r.createdAt.slice(0, 10)}</td>
                    <td className="px-4 py-3"><ChevronRight size={14} className="text-muted" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <aside className="fixed inset-0 z-40 w-full md:static md:inset-auto md:z-auto md:w-80 md:flex-shrink-0 overflow-auto p-4 bg-surface" aria-label="Detalle solicitud">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-t1">{selected.orgName || selected.contactName}</h3>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-t1"><X size={16} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <span className={`inline-block text-[11px] px-2 py-0.5 rounded font-medium ${CR_STATUS_STYLE[selected.status]}`}>
                {selected.status.replace(/_/g, ' ')}
              </span>
              {(triageLoading || triageSummary) && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1">Resumen ejecutivo (IA)</p>
                  <p className="text-sm text-t1 leading-relaxed">{triageLoading ? 'Generando resumen…' : triageSummary}</p>
                </div>
              )}
              <div className="border border-border rounded-lg divide-y divide-border">
                {field('Solución', CR_SOLUTION_LABEL[selected.solution] ?? selected.solution)}
                {field('Contacto', selected.contactName)}
                {field('Correo', selected.contactEmail)}
                {selected.contactPhone && field('Teléfono', selected.contactPhone)}
                {selected.ruc && field('RUC', selected.ruc, true)}
              </div>
              {Object.keys(selected.answers ?? {}).length > 0 && (
                <div className="border border-border rounded-lg divide-y divide-border">
                  {Object.entries(selected.answers).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-3 px-3 py-2">
                      <span className="text-sm text-t2">{CR_ANSWER_LABEL[key] ?? key}</span>
                      <span className="text-sm text-t1 font-medium text-right">{String(value ?? '—')}</span>
                    </div>
                  ))}
                </div>
              )}
              {selected.reviewedBy && (
                <div className="border border-border rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-1">Atendida por</p>
                  <p className="text-t1">{selected.reviewedBy.name}</p>
                </div>
              )}
              {selected.status === 'NUEVA' && (
                <button onClick={() => markReviewed(selected.id)} disabled={saving}
                  className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-60">
                  {saving ? 'Guardando…' : 'Marcar como contactada'}
                </button>
              )}
              {(selected.solution === 'OPERACION' || selected.solution === 'PRO') && (
                <button
                  onClick={() => useForNewOrg(selected)}
                  disabled={onboardingLoading}
                  className="w-full py-2.5 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-primary/5 disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  <Sparkles size={13} />
                  {onboardingLoading ? 'Preparando…' : 'Usar para nueva asociación (IA)'}
                </button>
              )}
              {onboardingError && <p className="text-xs text-danger">{onboardingError}</p>}
              <p className="text-xs text-t2">
                La cotización, la propuesta y la conversión a cliente se registran manualmente por el Super Admin fuera de este listado.
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// Nota (12 sept 2026, decidido con Jayde): las pantallas "Solicitudes GPS",
// "Instalaciones GPS", "Suscripciones GPS" y "Config. de cobros" se
// eliminaron -- eran 100% datos de ejemplo (nunca leian ni escribian nada
// real). El registro real de GPS Vehicular es directo: Super Admin escribe
// el IMEI/SIM en Asociaciones -> editar -> GPS (o desde Super Admin -> GPS),
// ver plan-gps-vehicular.md §6.1.

// ─── New Org Wizard (5 steps) ─────────────────────────────────────────────────
const WIZARD_STEPS = ['Organización', 'Administrador', 'Operación', 'Plan y facturación', 'Confirmación'];

interface MapLocation {
  id: string;
  name: string;
  address: string;
  city: string;
}

const MAP_LOCATIONS: MapLocation[] = [
  { id: 'terminal-puno', name: 'Terminal Zonal Puno', address: 'Puno, Perú', city: 'Puno' },
  { id: 'terminal-juli', name: 'Terminal Terrestre Juli', address: 'Juli, Chucuito, Puno', city: 'Juli' },
  { id: 'terminal-ilave', name: 'Terminal Terrestre Ilave', address: 'Ilave, El Collao, Puno', city: 'Ilave' },
  { id: 'terminal-desaguadero', name: 'Terminal Terrestre Desaguadero', address: 'Desaguadero, Chucuito, Puno', city: 'Desaguadero' },
];

function MapPickerModal({
  terminalLabel,
  currentAddress,
  onClose,
  onSelect,
}: {
  terminalLabel: string;
  currentAddress: string;
  onClose: () => void;
  onSelect: (location: MapLocation) => void;
}) {
  const [query, setQuery] = useState(currentAddress);
  const normalized = query.trim().toLowerCase();
  const results = MAP_LOCATIONS.filter(location =>
    !normalized ||
    location.name.toLowerCase().includes(normalized) ||
    location.address.toLowerCase().includes(normalized)
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/45 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MapPin size={17} className="text-primary" />
              <h2 className="text-base font-semibold text-t1">Seleccionar ubicación para {terminalLabel}</h2>
            </div>
            <p className="text-sm text-t2 mt-1">Google Maps · integración preparada para el plan PRO</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-md hover:bg-hover" aria-label="Cerrar mapa">
            <X size={18} />
          </button>
        </div>

        <div className="grid md:grid-cols-[0.9fr_1.1fr]">
          <div className="p-5 border-b md:border-b-0 md:border-r border-border">
            <label className="block text-sm font-medium text-t1 mb-1">Buscar lugar o dirección</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-2.5 text-muted" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Terminal, dirección o ciudad"
                className="w-full h-9 pl-9 pr-3 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="mt-4 space-y-2 max-h-56 overflow-y-auto">
              {results.length ? results.map(location => (
                <button
                  key={location.id}
                  onClick={() => onSelect(location)}
                  className="w-full text-left p-3 border border-border rounded-md hover:border-primary hover:bg-selected"
                >
                  <p className="text-sm font-medium text-t1">{location.name}</p>
                  <p className="text-sm text-t2 mt-1">{location.address}</p>
                </button>
              )) : (
                <div className="p-3 border border-border rounded-md">
                  <p className="text-sm font-medium text-t1">Sin coincidencias</p>
                  <p className="text-sm text-t2 mt-1">La dirección escrita podrá resolverse con Google Maps API.</p>
                </div>
              )}
            </div>
          </div>

          <div className="relative min-h-[300px] bg-bg overflow-hidden">
            <div className="absolute inset-x-8 top-1/2 h-2 bg-border rotate-[-8deg]" />
            <div className="absolute inset-y-8 left-1/2 w-2 bg-border rotate-[12deg]" />
            <div className="absolute left-8 top-8 px-3 py-2 bg-surface border border-border rounded-md">
              <p className="text-sm font-semibold text-t1">Google Maps</p>
              <p className="text-xs text-t2">Vista de selección de terminal</p>
            </div>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-white grid place-items-center mx-auto shadow-md">
                  <MapPin size={24} />
                </div>
                <p className="mt-2 text-sm font-medium text-t1 bg-surface border border-border rounded px-2 py-1">
                  {query || terminalLabel}
                </p>
              </div>
            </div>
            <div className="absolute right-4 bottom-4 bg-surface border border-border rounded-md px-3 py-2">
              <p className="text-xs text-t2">Mapa interactivo al conectar la API</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewOrgWizard({
  onBack,
  fromRequest,
}: {
  onBack: () => void;
  // Presente solo cuando se llega desde "Usar para nueva asociación (IA)" en
  // Solicitudes comerciales (ia-aplicada.md §2.5) -- el wizard arranca
  // pre-llenado con la sugerencia, pero cada campo sigue siendo editable: no
  // se crea nada hasta que el Super Admin confirme el ultimo paso, igual que
  // si lo hubiera llenado a mano.
  fromRequest?: { contactName: string; suggestion: OnboardingSuggestion } | null;
}) {
  const [step, setStep] = useState(0);
  const [created, setCreated] = useState(false);
  const [createdNote, setCreatedNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [mapTarget, setMapTarget] = useState<'terminal1' | 'terminal2' | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const sug = fromRequest?.suggestion;
  const [form, setForm] = useState({
    // Step 0
    name: sug?.name ?? '', logoUrl: '', ruc: sug?.ruc ?? '', city: sug?.city ?? '', legalRep: '', phone: '', email: '',
    // Step 1
    adminName: sug?.adminName ?? '', adminEmail: sug?.adminEmail ?? '', adminPhone: sug?.adminPhone ?? '',
    // Step 2
    terminal1: sug?.terminal1 ?? '', terminal1Address: '', terminal2: sug?.terminal2 ?? '', terminal2Address: '', enabledRoutes: [] as { origin: string; destination: string }[],
    // Paradas adicionales (solo informativas): empiezan vacias.
    routes: (sug?.routes ?? []).filter(r => r.origin && r.destination) as { origin: string; destination: string }[],
    companiesList: [] as string[], config: sug?.configNotes ?? '',
    // Step 3
    plan: sug?.plan ?? ('OPERACION' as 'OPERACION' | 'PRO'),
    units: sug?.units ?? '', gpsUnits: sug?.gpsUnits ?? '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const isLast = step === WIZARD_STEPS.length - 1;

  const handleNext = async () => {
    if ((step === 0 || isLast) && form.ruc.trim() && !isValidRuc(form.ruc.trim())) {
      setSaveError(RUC_ERROR);
      return;
    }
    if ((step === 0 || isLast) && !isValidOptionalPhone(form.phone.trim())) {
      setSaveError(`Teléfono de la asociación: ${PHONE_ERROR}`);
      return;
    }
    if ((step === 1 || isLast) && !isValidOptionalPhone(form.adminPhone.trim())) {
      setSaveError(`Teléfono del administrador: ${PHONE_ERROR}`);
      return;
    }
    if (isLast) {
      if (!form.name.trim() || !form.ruc.trim() || !form.adminName.trim() || !form.adminEmail.trim()) {
        setSaveError('Completa nombre, RUC y los datos del administrador antes de crear la asociación.');
        return;
      }
      setSaving(true);
      setSaveError('');
      try {
        // Cuenta real (backend/src/organizations): crea la asociacion y, en la misma
        // transaccion, la cuenta ADMINISTRADOR (estado Pendiente) para el correo indicado,
        // mas el corredor propio de esta asociacion (Terminal 1 = origen, Terminal 2 =
        // destino del paso 2) — cada asociacion con su propia ruta, nunca una global
        // compartida. Empresas integrantes y el plan de suscripcion PRO se configuran
        // despues desde sus propios paneles — no tienen campo aqui todavia.
        const newOrg = await createOrganization({
          name: form.name.trim(),
          ruc: form.ruc.trim(),
          adminEmail: form.adminEmail.trim().toLowerCase(),
          adminName: form.adminName.trim(),
          plan: form.plan,
          ...(form.logoUrl ? { logoUrl: form.logoUrl } : {}),
          ...(form.city.trim() ? { city: form.city.trim() } : {}),
          ...(form.legalRep.trim() ? { legalRepName: form.legalRep.trim() } : {}),
          ...(form.phone.trim() ? { contactPhone: form.phone.trim() } : {}),
          ...(form.email.trim() ? { contactEmail: form.email.trim().toLowerCase() } : {}),
          ...(form.terminal1.trim() ? { terminalOriginName: form.terminal1.trim() } : {}),
          ...(form.terminal1Address.trim() ? { terminalOriginAddress: form.terminal1Address.trim() } : {}),
          ...(form.terminal2.trim() ? { terminalDestinationName: form.terminal2.trim() } : {}),
          ...(form.terminal2Address.trim() ? { terminalDestinationAddress: form.terminal2Address.trim() } : {}),
          ...(form.enabledRoutes[0] ? { routeOriginName: form.enabledRoutes[0].origin, routeDestinationName: form.enabledRoutes[0].destination } : {}),
          ...(form.enabledRoutes[1] ? { returnOriginName: form.enabledRoutes[1].origin, returnDestinationName: form.enabledRoutes[1].destination } : {}),
        });
        // Empresas integrantes y paradas adicionales: antes se pedian aqui pero
        // se descartaban al crear. Ahora se guardan en la asociacion recien creada.
        const extras = await Promise.allSettled([
          ...form.companiesList.map(name => createCompany({ name }, newOrg.id)),
          ...form.routes.filter(r => r.origin.trim() && r.destination.trim()).map(r => createRoute({ origin: r.origin.trim(), destination: r.destination.trim() }, newOrg.id)),
        ]);
        const failed = extras.filter(x => x.status === 'rejected').length;
        setCreatedNote(failed > 0 ? `${failed} empresa(s) o parada(s) no se pudieron guardar; agrégalas desde Editar asociación.` : '');
        setCreated(true);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'No se pudo crear la asociación. Intenta de nuevo.');
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaveError('');
    setStep(s => s + 1);
  };

  if (created) {
    return (
      <div className="p-6 lg:p-8">
        <div className="bg-surface border border-border rounded-lg p-8 text-center max-w-2xl">
          <CheckCircle size={32} className="text-ok mx-auto mb-4" />
          <h2 className="text-base font-semibold text-t1 mb-2">Asociación creada</h2>
          <p className="text-sm text-t2 mb-2">
            <strong>{form.name || 'Nueva Org'}</strong> fue creada con plan {form.plan}.
          </p>
          {createdNote && <p className="text-sm text-warn mb-2">{createdNote}</p>}
          {form.plan === 'PRO' && (
            <div className="bg-ok/5 border border-ok/20 rounded-lg p-3 text-left mb-4">
              <p className="text-sm font-medium text-ok">Plan PRO — activo</p>
              <p className="text-sm text-t2 mt-1">La asociación ya tiene acceso PRO real (GPS, alertas, asistente de IA). Si necesitas cambiarlo más adelante, hazlo desde Asociaciones → editar → Plan.</p>
            </div>
          )}
          <div className="bg-bg border border-border rounded-lg p-4 text-left mb-6">
            <h3 className="text-xs font-semibold text-t2 uppercase tracking-wide mb-3">Próximos pasos</h3>
            {[
              { task: 'Completar datos de la organización', done: !!form.name },
              { task: 'Configurar terminales y rutas', done: !!form.terminal1 },
              { task: 'Agregar empresas integrantes', done: form.companiesList.length > 0 },
              { task: 'Invitar administrador', done: !!form.adminEmail },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5">
                <div className={`w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-ok border-ok' : 'border-border'}`}>
                  {item.done && <CheckCircle size={10} className="text-white" />}
                </div>
                <span className={`text-sm ${item.done ? 'text-t2 line-through' : 'text-t1'}`}>{item.task}</span>
              </div>
            ))}
          </div>
          <button onClick={onBack} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h">
            Volver a asociaciones
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-sm text-primary hover:underline">← Cancelar</button>
        <h1 className="text-2xl font-bold text-t1">Nueva asociación</h1>
      </div>

      {fromRequest && (
        <div className="mb-6 p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-2 text-sm text-primary max-w-2xl">
          <Sparkles size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            Prellenado con la sugerencia de IA a partir de la solicitud comercial de <strong>{fromRequest.contactName}</strong>.
            {sug && !sug.aiParsed && sug.routes.length === 0 && !sug.terminal1
              ? ' No se pudo interpretar un corredor claro del texto de la solicitud -- completa terminales y rutas a mano.'
              : ' Revisa cada campo antes de continuar: nada se crea hasta el último paso.'}
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div className="flex items-center mb-8 overflow-x-auto">
        {WIZARD_STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-shrink-0">
            <div>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mx-auto ${i < step ? 'bg-ok text-white' : i === step ? 'bg-primary text-white' : 'bg-border text-muted'}`}>
                {i < step ? <CheckCircle size={13} /> : i + 1}
              </div>
              <span className={`text-[10px] mt-1 whitespace-nowrap block text-center ${i === step ? 'text-primary font-medium' : 'text-t2'}`}>{s}</span>
            </div>
            {i < WIZARD_STEPS.length - 1 && <div className={`h-0.5 w-10 mx-1 mb-3 ${i < step ? 'bg-ok' : 'bg-border'}`} />}
          </div>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-lg p-6 max-w-2xl">
        <h2 className="text-base font-semibold text-t1 mb-5">{WIZARD_STEPS[step]}</h2>

        {step === 0 && (
          <div className="space-y-4">
            {[
              { label: 'Nombre de la asociación *', key: 'name', placeholder: 'ASOTRANS NORTE' },
              { label: 'RUC *', key: 'ruc', placeholder: '20XXXXXXXXX' },
              { label: 'Ciudad / ubicación *', key: 'city', placeholder: 'Puno' },
              { label: 'Representante legal', key: 'legalRep', placeholder: 'Nombre completo' },
              { label: 'Teléfono', key: 'phone', placeholder: '95XXXXXXX' },
              { label: 'Correo institucional', key: 'email', placeholder: 'contacto@asociacion.pe' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-t1 mb-1">{f.label}</label>
                <input value={(form as unknown as Record<string, string>)[f.key]} onChange={e => set(f.key, f.key === 'phone' ? sanitizePhone(e.target.value) : f.key === 'ruc' ? sanitizeRuc(e.target.value) : f.key === 'legalRep' ? capitalizeWords(e.target.value) : e.target.value)}
                  {...(f.key === 'phone' ? phoneInputProps : f.key === 'ruc' ? rucInputProps : {})}
                  placeholder={f.placeholder}
                  className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Logotipo de la asociación</label>
              <label
                htmlFor="organization-logo"
                className="min-h-[112px] border border-dashed border-border rounded-lg bg-bg hover:border-primary cursor-pointer flex items-center justify-center p-4"
              >
                <input
                  id="organization-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      setSaveError('La imagen pesa demasiado (máximo 5 MB).');
                      return;
                    }
                    setSaveError('');
                    setLogoUploading(true);
                    // "Adjuntar imagen" sube a Cloudinary automaticamente; el
                    // campo logoUrl guarda la URL final, nunca el archivo.
                    resizeImageFile(file)
                      .then(resized => uploadImage(resized, 'logos'))
                      .then(({ url }) => set('logoUrl', url))
                      .catch(() => setSaveError('No se pudo subir la imagen del logo. Intenta con otro archivo.'))
                      .finally(() => setLogoUploading(false));
                  }}
                />
                {logoUploading ? (
                  <div className="text-center">
                    <p className="text-sm font-medium text-t1">Subiendo imagen…</p>
                  </div>
                ) : form.logoUrl ? (
                  <div className="w-full flex items-center gap-4">
                    <img src={form.logoUrl} alt="Vista previa del logotipo" className="w-32 h-16 object-contain bg-surface border border-border rounded-md" />
                    <div>
                      <p className="text-sm font-medium text-t1 flex items-center gap-2">
                        <ImageIcon size={16} className="text-primary" />
                        Imagen seleccionada
                      </p>
                      <p className="text-sm text-t2 mt-1">Presiona para reemplazarla</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload size={22} className="text-primary mx-auto" />
                    <p className="text-sm font-medium text-t1 mt-2">Seleccionar imagen</p>
                    <p className="text-sm text-t2 mt-1">PNG, JPG o WebP · máximo 5 MB</p>
                  </div>
                )}
              </label>
              <div className="flex items-center justify-between gap-3 mt-2">
                <p className="text-sm text-t2">La plataforma procesará y almacenará el archivo automáticamente.</p>
                {form.logoUrl && (
                  <button onClick={() => set('logoUrl', '')} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-danger border border-danger/30 rounded-lg hover:bg-danger/5 transition-colors">
                    Quitar
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <input
                  value={form.logoUrl.startsWith('data:') ? '' : form.logoUrl}
                  onChange={e => set('logoUrl', e.target.value)}
                  placeholder="o pega la URL de una imagen ya alojada (recomendado: Cloudinary)"
                  className="flex-1 h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {[
              { label: 'Nombre del administrador *', key: 'adminName', placeholder: 'Nombre completo' },
              { label: 'Correo *', key: 'adminEmail', placeholder: 'admin@asociacion.pe', type: 'email' },
              { label: 'Teléfono', key: 'adminPhone', placeholder: '9XXXXXXXX' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-t1 mb-1">{f.label}</label>
                <input type={f.type ?? 'text'} value={(form as unknown as Record<string, string>)[f.key]} onChange={e => set(f.key, f.key === 'adminPhone' ? sanitizePhone(e.target.value) : f.key === 'adminName' ? capitalizeWords(e.target.value) : e.target.value)}
                  {...(f.key === 'adminPhone' ? phoneInputProps : {})}
                  placeholder={f.placeholder}
                  className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            ))}
            <p className="text-sm text-t2">Se enviará una invitación al administrador cuando la asociación esté lista.</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-base font-semibold text-t1">Terminal 1 *</h3>
                  <p className="text-sm text-t2 mt-0.5">Punto de salida de la ruta de ida</p>
                </div>
                <button onClick={() => setMapTarget('terminal1')} className="h-9 px-3 border border-primary text-primary rounded-md text-sm font-medium hover:bg-selected flex items-center gap-1.5">
                  <MapPin size={14} />
                  Seleccionar en Google Maps
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-t1 mb-1">Nombre del terminal</label>
                  <input value={form.terminal1} onChange={event => set('terminal1', event.target.value)} placeholder="Terminal Terrestre Juli"
                    className="w-full h-9 px-3 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-t1 mb-1">Dirección</label>
                  <input value={form.terminal1Address} onChange={event => set('terminal1Address', event.target.value)} placeholder="Escribe o selecciona en el mapa"
                    className="w-full h-9 px-3 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
            </div>

            <div className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-base font-semibold text-t1">Terminal 2 *</h3>
                  <p className="text-sm text-t2 mt-0.5">Punto de salida de la ruta de vuelta</p>
                </div>
                <button onClick={() => setMapTarget('terminal2')} className="h-9 px-3 border border-primary text-primary rounded-md text-sm font-medium hover:bg-selected flex items-center gap-1.5">
                  <MapPin size={14} />
                  Seleccionar en Google Maps
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-t1 mb-1">Nombre del terminal</label>
                  <input value={form.terminal2} onChange={event => set('terminal2', event.target.value)} placeholder="Terminal Zonal Puno"
                    className="w-full h-9 px-3 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-t1 mb-1">Dirección</label>
                  <input value={form.terminal2Address} onChange={event => set('terminal2Address', event.target.value)} placeholder="Escribe o selecciona en el mapa"
                    className="w-full h-9 px-3 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
            </div>

            <EnabledRoutesEditor
              editing
              routes={form.enabledRoutes}
              onChange={list => setForm(current => ({ ...current, enabledRoutes: list }))}
            />

            <div className="border border-border rounded-lg p-4">
              <div className="flex items-start gap-2 mb-4">
                <Map size={17} className="text-primary mt-0.5" />
                <div>
                  <h3 className="text-base font-semibold text-t1">Paradas adicionales</h3>
                  <p className="text-sm text-t2 mt-0.5">Opcional. Paradas intermedias por las que pasa la unidad, solo informativas: no crean una cola de salida nueva. La ruta de ida y la de vuelta ya son las "Rutas habilitadas" de arriba.</p>
                </div>
              </div>

              <StopsEditor stops={form.routes} onChange={list => setForm(current => ({ ...current, routes: list }))} />
            </div>

            <div className="border border-border rounded-lg p-4">
              <h3 className="text-base font-semibold text-t1">Empresas integrantes</h3>
              <p className="text-sm text-t2 mt-0.5 mb-3">Escribe el nombre de una empresa y toca "Agregar"; repite para las demás. El resto de sus datos se completa después.</p>
              <NamesListEditor items={form.companiesList} placeholder="Nombre de la empresa" onChange={list => setForm(current => ({ ...current, companiesList: list }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Configuración inicial (notas)</label>
              <input value={form.config} onChange={event => set('config', event.target.value)} placeholder="Horario de apertura, tarifa base…"
                className="w-full h-9 px-3 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            {/* Plan */}
            <div>
              <label className="block text-sm font-medium text-t1 mb-2">Plan *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['OPERACION', 'PRO'] as const).map(p => (
                  <button key={p} onClick={() => setForm(f => ({ ...f, plan: p }))}
                    className={`py-3 rounded-lg border text-sm font-medium transition-colors ${form.plan === p ? (p === 'PRO' ? 'bg-primary text-white border-primary' : 'bg-surface border-primary text-primary') : 'border-border text-t2 hover:bg-hover'}`}>
                    {p === 'OPERACION' ? 'Operación' : 'PRO'}
                    {p === 'PRO' && form.plan === 'PRO' && <p className="text-xs font-normal opacity-80 mt-0.5">Requiere pago verificado para activar</p>}
                  </button>
                ))}
              </div>
            </div>

            {form.plan === 'PRO' && (
              <div className="bg-warn/5 border border-warn/20 rounded-lg p-3">
                <p className="text-sm font-medium text-warn">Plan PRO seleccionado</p>
                <p className="text-sm text-t2 mt-1">Esto activa el Plan PRO de inmediato para la asociación (GPS, alertas, asistente de IA, etc.). Confirma el pago con el cliente antes de crearla así — el cambio de plan no pasa por ninguna aprobación intermedia.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Unidades contratadas', key: 'units', placeholder: '30' },
                { label: 'Unidades con GPS', key: 'gpsUnits', placeholder: '0' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-t1 mb-1">{f.label}</label>
                  <input type="number" min="0" value={(form as unknown as Record<string, string>)[f.key]} onChange={e => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted">Solo informativo (referencia de la cotización) — no se guarda todavía como dato propio de la asociación.</p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 text-sm">
            <h3 className="font-medium text-t1">Resumen de la nueva asociación</h3>
            {[
              ['Nombre', form.name || '—'],
              ['RUC', form.ruc || '—'],
              ['Ciudad', form.city || '—'],
              ['Representante', form.legalRep || '—'],
              ['Administrador', form.adminName || '—'],
              ['Correo admin', form.adminEmail || '—'],
              ['Terminal 1', form.terminal1 || '—'],
              ['Dirección terminal 1', form.terminal1Address || '—'],
              ['Terminal 2', form.terminal2 || '—'],
              ['Dirección terminal 2', form.terminal2Address || '—'],
              ['Rutas habilitadas', form.enabledRoutes.length ? form.enabledRoutes.map(r => `${r.origin} → ${r.destination}`).join(' · ') : '—'],
              ['Paradas adicionales', form.routes
                .filter(route => route.origin && route.destination)
                .map(route => route.origin + ' → ' + route.destination)
                .join(' · ') || '—'],
              ['Empresas integrantes', form.companiesList.join(', ') || '—'],
              ['Plan', form.plan],
              ['Unidades', form.units || '—'],
              ['Unidades GPS', form.gpsUnits || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-border pb-2">
                <span className="text-t2">{k}</span>
                <span className="text-t1 font-medium">{v}</span>
              </div>
            ))}
            {form.plan === 'PRO' && (
              <div className="bg-warn/5 border border-warn/20 rounded-lg p-3">
                <p className="text-sm font-medium text-warn">Al crear, la asociación queda con Plan PRO real de inmediato — confirma que el pago ya está acordado.</p>
              </div>
            )}
            <p className="text-sm text-muted">La organización se creará en estado borrador. Se enviará invitación al administrador.</p>
          </div>
        )}
      </div>

      {saveError && <div className="mt-4 p-3 bg-danger/5 border border-danger/30 rounded-lg text-sm text-danger max-w-2xl">{saveError}</div>}

      <div className="flex justify-between mt-4">
        <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0 || saving}
          className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover disabled:opacity-50">
          Anterior
        </button>
        <button onClick={handleNext} disabled={saving} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50">
          {saving ? 'Creando…' : isLast ? 'Crear asociación y enviar invitación' : 'Siguiente'}
        </button>
      </div>

      {mapTarget && (
        <MapPickerModal
          terminalLabel={mapTarget === 'terminal1' ? 'Terminal 1' : 'Terminal 2'}
          currentAddress={mapTarget === 'terminal1' ? form.terminal1Address : form.terminal2Address}
          onClose={() => setMapTarget(null)}
          onSelect={location => {
            // Google Maps llena el nombre y la direccion del terminal. Las RUTAS
            // habilitadas tienen su propia lista (enabledRoutes)
            // y ya no dependen del nombre del terminal.
            if (mapTarget === 'terminal1') {
              setForm(current => ({ ...current, terminal1: location.name, terminal1Address: location.address }));
            } else {
              setForm(current => ({ ...current, terminal2: location.name, terminal2Address: location.address }));
            }
            setMapTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Tech health & placeholders ───────────────────────────────────────────────
const HEALTH_SERVICE_LABEL: Record<string, string> = {
  BASE_DE_DATOS: 'Base de datos',
  TRACCAR: 'Traccar (GPS)',
  NOTIFICACIONES: 'Notificaciones (Resend)',
  CLOUDINARY: 'Cloudinary (imágenes)',
  ASISTENTE_IA: 'Asistente AI (Claude)',
};
const HEALTH_STATUS_STYLE: Record<string, string> = {
  OK: 'bg-ok/10 text-ok',
  DEGRADADO: 'bg-warn/10 text-warn',
  CAIDO: 'bg-danger/10 text-danger',
};
const HEALTH_HISTORY_DOT: Record<string, string> = {
  OK: 'bg-ok',
  DEGRADADO: 'bg-warn',
  CAIDO: 'bg-danger',
};

function SATechHealth() {
  const [rows, setRows] = useState<HealthCheckServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetchHealthStatus()
        .then(list => { if (!cancelled) setRows(list); })
        .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la salud técnica.'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-t1">Salud técnica</h1>
        <p className="text-sm text-t2 mt-0.5">Monitoreo real de la propia infraestructura de CHASKI AI — no es el GPS de las asociaciones (eso vive en Super Admin → GPS). Un chequeo real corre cada 5 minutos.</p>
      </div>

      {loading ? (
        <p className="text-sm text-t2">Cargando…</p>
      ) : loadError ? (
        <p className="text-sm text-danger">{loadError}</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.service} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-sm font-semibold text-t1">{HEALTH_SERVICE_LABEL[r.service] ?? r.service}</h3>
                  {r.status ? (
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${HEALTH_STATUS_STYLE[r.status]}`}>{r.status}</span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded font-medium bg-t2/10 text-t2">SIN DATOS</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-t2">Latencia: <span className="font-mono text-t1">{r.latencyMs == null ? '—' : `${r.latencyMs}ms`}</span></span>
                  <span className="text-t2">Uptime 30d: <span className="font-mono text-t1">{r.uptime30d == null ? '—' : `${r.uptime30d}%`}</span></span>
                </div>
              </div>

              {r.errorMessage && (
                <p className="text-xs text-danger mt-2">{r.errorMessage}</p>
              )}

              {r.history.length > 0 && (
                <div className="flex items-end gap-0.5 mt-3 h-5">
                  {r.history.map((h, i) => (
                    <div
                      key={i}
                      title={`${h.status} · ${new Date(h.checkedAt).toLocaleString('es-PE')}`}
                      className={`flex-1 h-full rounded-sm ${HEALTH_HISTORY_DOT[h.status] ?? 'bg-t2/20'}`}
                    />
                  ))}
                </div>
              )}
              {r.checkedAt && (
                <p className="text-[11px] text-muted mt-1.5">Último chequeo: {new Date(r.checkedAt).toLocaleString('es-PE')}</p>
              )}
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-t2">Todavía no hay chequeos registrados — el primero corre dentro de los próximos 5 minutos.</p>}
        </div>
      )}
    </div>
  );
}

function SAAudit() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchGlobalAudit()
      .then(data => { if (!cancelled) setEntries(data); })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la auditoría.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <h1 className="text-2xl font-bold text-t1">Auditoría</h1>
      {loadError && (
        <div className="bg-danger/5 border border-danger/20 rounded-lg p-3 text-sm text-danger">{loadError}</div>
      )}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Auditoría">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Acción</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Actor</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Org.</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Recurso</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Timestamp</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-t2">Cargando auditoría…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-t2">Sin registros de auditoría todavía.</td></tr>
            ) : entries.map(e => (
              <tr key={e.id} className="border-b border-border last:border-0 hover:bg-hover/50">
                <td className="px-4 py-2.5 font-medium text-t1">{e.action}</td>
                <td className="px-4 py-2.5 text-t2">{e.actor}</td>
                <td className="px-4 py-2.5 text-t2">{e.org}</td>
                <td className="px-4 py-2.5 text-t2">{e.resource}</td>
                <td className="px-4 py-2.5 font-mono text-muted">{e.timestamp.slice(0, 16).replace('T', ' ')}</td>
                <td className="px-4 py-2.5 text-t2 max-w-xs truncate">{e.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ─── Landing pública (contenido editable) ──────────────────────────────────
// docs/planes/landing-publica-y-solicitudes-comerciales.md §9 -- alcance
// actual: solo el contenido visual (hero, problemas/capacidades, planes,
// referencia ATIPCAR, FAQ), guardado directo por sección, sin borrador ni
// historial de versiones. El formulario comercial en sí (§8, preguntas
// dinámicas) y SEO/páginas legales/modo mantenimiento quedan pendientes.
const LANDING_ICON_OPTIONS = ['ListOrdered', 'FileText', 'Route', 'ArrowLeftRight', 'BarChart2', 'Shield'];

const LANDING_SECTION_TABS: { key: keyof LandingContentData; label: string }[] = [
  { key: 'HERO', label: 'Hero' },
  { key: 'HERO_BACKGROUND', label: 'Landing fondo' },
  { key: 'PROBLEMS', label: 'Problemas' },
  { key: 'CAPABILITIES', label: 'Capacidades' },
  { key: 'PLANS', label: 'Planes' },
  { key: 'CLIENTS_SHOWCASE', label: 'Clientes de referencia' },
  { key: 'FAQ', label: 'Preguntas frecuentes' },
  { key: 'COMPANY', label: 'Datos de empresa' },
  { key: 'FLEET_SHOWCASE', label: 'Carrusel de flota' },
  { key: 'ABOUT', label: 'Sobre nosotros' },
  { key: 'LEGAL_TERMS', label: 'Términos y condiciones' },
  { key: 'LEGAL_PRIVACY', label: 'Política de privacidad' },
  { key: 'LEGAL_COOKIES', label: 'Política de cookies' },
];

function LegalPageEditor({ page, onChange }: { page: LandingContentData['LEGAL_TERMS']; onChange: (page: LandingContentData['LEGAL_TERMS']) => void }) {
  return (
    <div className="space-y-4">
      <LandingTextField label="Título" value={page.title} onChange={v => onChange({ ...page, title: v })} />
      <div>
        <label className="block text-xs font-medium text-t1 mb-1">Contenido</label>
        <textarea
          value={page.body}
          onChange={e => onChange({ ...page, body: e.target.value })}
          rows={18}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-y font-mono focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-xs text-muted mt-1">Un párrafo por línea en blanco. Esto es un borrador editable -- no está revisado legalmente.</p>
      </div>
    </div>
  );
}

function LandingTextField({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-t1 mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={3}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)}
          className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      )}
    </div>
  );
}

// Editor generico para listas de objetos con campos de texto simples (usado
// por Problemas y Preguntas frecuentes -- Capacidades tiene su propio editor
// porque ademas necesita el selector de icono).
function RepeatableEditor<T extends Record<string, string>>({
  items, onChange, fields, addLabel, emptyItem,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  fields: { key: keyof T; label: string; multiline?: boolean }[];
  addLabel: string;
  emptyItem: T;
}) {
  const update = (i: number, key: keyof T, value: string) => onChange(items.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-2 relative">
          <button type="button" onClick={() => remove(i)} className="absolute top-2 right-2 text-muted hover:text-danger" aria-label="Eliminar">
            <X size={14} />
          </button>
          {fields.map(f => (
            <div key={String(f.key)} className="pr-6">
              <LandingTextField label={f.label} value={(item[f.key] as string) ?? ''} onChange={v => update(i, f.key, v)} multiline={f.multiline} />
            </div>
          ))}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, emptyItem])} className="text-sm text-primary font-medium flex items-center gap-1.5">
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  );
}

// Un slot de imagen (foto de unidad, o nombre estilizado de la asociacion) --
// mismo pipeline de subida que el logo de una asociacion (resizeImageFile +
// uploadImage a Cloudinary), solo cambia el tamaño maximo y la carpeta.
function FleetImageField({ label, value, onChange, folder, maxDimension }: {
  label: string; value: string; onChange: (url: string) => void; folder: string; maxDimension: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    setError('');
    if (file.size > 8 * 1024 * 1024) { setError('La imagen pesa demasiado (máximo 8 MB).'); return; }
    setUploading(true);
    try {
      const resized = await resizeImageFile(file, maxDimension);
      const { url } = await uploadImage(resized, folder);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-t1 mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-24 h-16 border border-border rounded-lg bg-bg flex items-center justify-center overflow-hidden flex-shrink-0">
          {value ? <img src={value} alt={label} className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-muted">Sin imagen</span>}
        </div>
        <label className="px-3 py-1.5 text-sm border border-border rounded-lg cursor-pointer hover:bg-hover">
          {uploading ? 'Subiendo…' : 'Subir imagen'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
        </label>
      </div>
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}

function FleetShowcaseEditor({ value, onChange }: { value: LandingFleetShowcase; onChange: (value: LandingFleetShowcase) => void }) {
  const items = value.items;
  const update = (i: number, patch: Partial<LandingFleetItem>) =>
    onChange({ ...value, items: items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  const remove = (i: number) => onChange({ ...value, items: items.filter((_, idx) => idx !== i) });
  return (
    <div className="space-y-3">
      <p className="text-sm text-t2">
        Cada asociación necesita la foto real de una de sus unidades, y su nombre como texto simple (se muestra con
        la tipografía del sitio, ya no como imagen). Se muestran de a 2 por página en la landing.
      </p>
      <div>
        <label className="block text-xs font-medium text-t1 mb-1">Segundos entre cada cambio de página</label>
        <input
          type="number"
          min={1}
          max={30}
          value={value.intervalSeconds}
          onChange={e => onChange({ ...value, intervalSeconds: Math.max(1, Number(e.target.value) || 1) })}
          className="w-24 h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      {items.map((item, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-3 relative">
          <button type="button" onClick={() => remove(i)} className="absolute top-2 right-2 text-muted hover:text-danger" aria-label="Eliminar">
            <X size={14} />
          </button>
          <FleetImageField
            label="Foto de la unidad"
            value={item.vehicleImageUrl}
            onChange={url => update(i, { vehicleImageUrl: url })}
            folder="fleet-vehicles"
            maxDimension={960}
          />
          <LandingTextField label="Nombre de la asociación" value={item.name} onChange={v => update(i, { name: v })} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...value, items: [...items, { vehicleImageUrl: '', name: '' }] })}
        className="text-sm text-primary font-medium flex items-center gap-1.5"
      >
        <Plus size={14} /> Agregar asociación
      </button>
    </div>
  );
}

function HeroBackgroundEditor({ value, onChange }: { value: LandingContentData['HERO_BACKGROUND']; onChange: (value: LandingContentData['HERO_BACKGROUND']) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-t2">
        Una sola foto de fondo para el bloque principal de la landing (título, subtítulo y la vitrina de flota).
        Usa una imagen clara/luminosa — el texto se muestra en color oscuro fijo sobre ella. Vacío = fondo plano de siempre.
      </p>
      <FleetImageField
        label="Foto de fondo"
        value={value.imageUrl}
        onChange={url => onChange({ imageUrl: url })}
        folder="landing-background"
        maxDimension={2400}
      />
    </div>
  );
}

function ClientsShowcaseEditor({ items, onChange }: { items: LandingContentData['CLIENTS_SHOWCASE']; onChange: (items: LandingContentData['CLIENTS_SHOWCASE']) => void }) {
  const update = (i: number, patch: Partial<LandingContentData['CLIENTS_SHOWCASE'][number]>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3">
      <p className="text-sm text-t2">
        Cada cliente necesita 2 imágenes: el logo de la asociación y una imagen con las rutas que opera (ya diseñada —
        no es texto que redacte el sistema). Todos se muestran juntos en una fila en la landing, sin rotar.
      </p>
      {items.map((item, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-3 relative">
          <button type="button" onClick={() => remove(i)} className="absolute top-2 right-2 text-muted hover:text-danger" aria-label="Eliminar">
            <X size={14} />
          </button>
          <FleetImageField
            label="Logo de la asociación"
            value={item.logoUrl}
            onChange={url => update(i, { logoUrl: url })}
            folder="client-logos"
            maxDimension={480}
          />
          <FleetImageField
            label="Rutas que opera (imagen)"
            value={item.routesImageUrl}
            onChange={url => update(i, { routesImageUrl: url })}
            folder="client-routes"
            maxDimension={480}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { logoUrl: '', routesImageUrl: '' }])}
        className="text-sm text-primary font-medium flex items-center gap-1.5"
      >
        <Plus size={14} /> Agregar cliente
      </button>
    </div>
  );
}

function CapabilitiesEditor({ items, onChange }: { items: LandingContentData['CAPABILITIES']; onChange: (items: LandingContentData['CAPABILITIES']) => void }) {
  const update = (i: number, patch: Partial<LandingContentData['CAPABILITIES'][number]>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-2 relative">
          <button type="button" onClick={() => remove(i)} className="absolute top-2 right-2 text-muted hover:text-danger" aria-label="Eliminar">
            <X size={14} />
          </button>
          <div className="pr-6">
            <label className="block text-xs font-medium text-t1 mb-1">Icono</label>
            <select value={item.icon} onChange={e => update(i, { icon: e.target.value })}
              className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary">
              {LANDING_ICON_OPTIONS.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div className="pr-6"><LandingTextField label="Título" value={item.label} onChange={v => update(i, { label: v })} /></div>
          <div className="pr-6"><LandingTextField label="Descripción" value={item.desc} onChange={v => update(i, { desc: v })} multiline /></div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { icon: 'Shield', label: '', desc: '' }])} className="text-sm text-primary font-medium flex items-center gap-1.5">
        <Plus size={14} /> Agregar capacidad
      </button>
    </div>
  );
}

function PlanBlockEditor({ plan, onChange }: { plan: LandingContentData['PLANS']['operacion']; onChange: (plan: LandingContentData['PLANS']['operacion']) => void }) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <LandingTextField label="Nombre del plan" value={plan.name} onChange={v => onChange({ ...plan, name: v })} />
      <LandingTextField label="Descripción corta" value={plan.desc} onChange={v => onChange({ ...plan, desc: v })} />
      <div>
        <label className="block text-xs font-medium text-t1 mb-1">Características (una por línea)</label>
        <textarea
          value={plan.features.join('\n')}
          onChange={e => onChange({ ...plan, features: e.target.value.split('\n') })}
          rows={Math.max(4, plan.features.length)}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none font-mono focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
    </div>
  );
}

function SALandingContent() {
  const [content, setContent] = useState<LandingContentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<keyof LandingContentData>('HERO');
  const [saving, setSaving] = useState(false);
  const [savedTab, setSavedTab] = useState<keyof LandingContentData | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    setSavedTab(null);
    fetchLandingContent()
      .then(data => {
        if (!data) { setError('No se pudo cargar el contenido de la landing.'); return; }
        setContent(data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = <K extends keyof LandingContentData>(key: K, value: LandingContentData[K]) => {
    setContent(prev => (prev ? { ...prev, [key]: value } : prev));
    setSavedTab(null);
  };

  const save = async () => {
    if (!content) return;
    setSaving(true);
    setError(null);
    setSavedTab(null);
    try {
      await updateLandingSection(tab, content[tab]);
      setSavedTab(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la sección.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 py-4 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-t1">Landing pública</h1>
          <p className="text-sm text-t2 mt-0.5">Contenido de la página pública de CHASKI AI — se guarda directo, sin vista previa.</p>
        </div>
        <button onClick={load} className="text-sm text-t2 hover:text-t1 flex items-center gap-1.5">
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {error && (
        <div className="px-6 py-3 bg-danger/5 border-b border-danger/20 text-sm text-danger" role="alert">{error}</div>
      )}

      {loading || !content ? (
        <div className="p-6 text-sm text-t2">Cargando contenido de la landing…</div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <nav className="w-52 flex-shrink-0 border-r border-border overflow-auto py-3" aria-label="Secciones de la landing">
            {LANDING_SECTION_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`w-full text-left px-4 py-2 text-sm ${tab === t.key ? 'bg-primary/10 text-primary font-medium' : 'text-t2 hover:bg-hover hover:text-t1'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-auto p-6 max-w-2xl">
            {tab === 'HERO' && (
              <div className="space-y-4">
                <LandingTextField label="Frase corta (arriba del título)" value={content.HERO.tagline} onChange={v => set('HERO', { ...content.HERO, tagline: v })} />
                <LandingTextField label="Título principal" value={content.HERO.title} onChange={v => set('HERO', { ...content.HERO, title: v })} multiline />
                <LandingTextField label="Subtítulo" value={content.HERO.subtitle} onChange={v => set('HERO', { ...content.HERO, subtitle: v })} multiline />
                <LandingTextField label="Línea chica (debajo del subtítulo)" value={content.HERO.subtitleCaption ?? ''} onChange={v => set('HERO', { ...content.HERO, subtitleCaption: v })} />
                <LandingTextField label="Botón principal (ej. 'Solicitar demostración')" value={content.HERO.ctaPrimary} onChange={v => set('HERO', { ...content.HERO, ctaPrimary: v })} />
                <LandingTextField label="Botón secundario (ej. 'Ingresar a la plataforma')" value={content.HERO.ctaSecondary} onChange={v => set('HERO', { ...content.HERO, ctaSecondary: v })} />
              </div>
            )}

            {tab === 'HERO_BACKGROUND' && (
              <HeroBackgroundEditor value={content.HERO_BACKGROUND} onChange={v => set('HERO_BACKGROUND', v)} />
            )}

            {tab === 'PROBLEMS' && (
              <RepeatableEditor
                items={content.PROBLEMS}
                onChange={v => set('PROBLEMS', v)}
                fields={[{ key: 'title', label: 'Título' }, { key: 'desc', label: 'Descripción', multiline: true }]}
                addLabel="Agregar problema"
                emptyItem={{ title: '', desc: '' }}
              />
            )}

            {tab === 'CAPABILITIES' && (
              <CapabilitiesEditor items={content.CAPABILITIES} onChange={v => set('CAPABILITIES', v)} />
            )}

            {tab === 'PLANS' && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-t2 uppercase tracking-wide mb-2">Operación</p>
                  <PlanBlockEditor plan={content.PLANS.operacion} onChange={v => set('PLANS', { ...content.PLANS, operacion: v })} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-t2 uppercase tracking-wide mb-2">PRO</p>
                  <PlanBlockEditor plan={content.PLANS.pro} onChange={v => set('PLANS', { ...content.PLANS, pro: v })} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-t2 uppercase tracking-wide mb-2">GPS Vehicular</p>
                  <PlanBlockEditor plan={content.PLANS.gpsVehicular} onChange={v => set('PLANS', { ...content.PLANS, gpsVehicular: v })} />
                </div>
              </div>
            )}

            {tab === 'CLIENTS_SHOWCASE' && (
              <ClientsShowcaseEditor items={content.CLIENTS_SHOWCASE} onChange={v => set('CLIENTS_SHOWCASE', v)} />
            )}

            {tab === 'FAQ' && (
              <RepeatableEditor
                items={content.FAQ}
                onChange={v => set('FAQ', v)}
                fields={[{ key: 'question', label: 'Pregunta' }, { key: 'answer', label: 'Respuesta', multiline: true }]}
                addLabel="Agregar pregunta"
                emptyItem={{ question: '', answer: '' }}
              />
            )}

            {tab === 'COMPANY' && (
              <div className="space-y-4">
                <LandingTextField label="Razón social" value={content.COMPANY.legalName} onChange={v => set('COMPANY', { ...content.COMPANY, legalName: v })} />
                <LandingTextField label="RUC" value={content.COMPANY.ruc} onChange={v => set('COMPANY', { ...content.COMPANY, ruc: v })} />
                <LandingTextField label="WhatsApp" value={content.COMPANY.whatsapp} onChange={v => set('COMPANY', { ...content.COMPANY, whatsapp: v })} />
                <LandingTextField label="Dirección" value={content.COMPANY.address} onChange={v => set('COMPANY', { ...content.COMPANY, address: v })} />
                <LandingTextField label="Correo de contacto" value={content.COMPANY.contactEmail} onChange={v => set('COMPANY', { ...content.COMPANY, contactEmail: v })} />
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-t2 mb-3">Redes sociales -- deja el campo vacío para ocultar el ícono en el footer de la landing.</p>
                  <LandingTextField label="Instagram (URL completa)" value={content.COMPANY.instagramUrl} onChange={v => set('COMPANY', { ...content.COMPANY, instagramUrl: v })} />
                  <div className="mt-3"><LandingTextField label="Facebook (URL completa)" value={content.COMPANY.facebookUrl} onChange={v => set('COMPANY', { ...content.COMPANY, facebookUrl: v })} /></div>
                  <div className="mt-3"><LandingTextField label="TikTok (URL completa)" value={content.COMPANY.tiktokUrl} onChange={v => set('COMPANY', { ...content.COMPANY, tiktokUrl: v })} /></div>
                </div>
              </div>
            )}

            {tab === 'FLEET_SHOWCASE' && (
              <FleetShowcaseEditor value={content.FLEET_SHOWCASE} onChange={v => set('FLEET_SHOWCASE', v)} />
            )}

            {tab === 'ABOUT' && <LegalPageEditor page={content.ABOUT} onChange={v => set('ABOUT', v)} />}

            {tab === 'LEGAL_TERMS' && <LegalPageEditor page={content.LEGAL_TERMS} onChange={v => set('LEGAL_TERMS', v)} />}
            {tab === 'LEGAL_PRIVACY' && <LegalPageEditor page={content.LEGAL_PRIVACY} onChange={v => set('LEGAL_PRIVACY', v)} />}
            {tab === 'LEGAL_COOKIES' && <LegalPageEditor page={content.LEGAL_COOKIES} onChange={v => set('LEGAL_COOKIES', v)} />}

            <div className="flex items-center gap-3 pt-6 mt-6 border-t border-border">
              <button onClick={save} disabled={saving}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-60">
                {saving ? 'Guardando…' : 'Guardar sección'}
              </button>
              {savedTab === tab && <span className="text-sm text-ok flex items-center gap-1.5"><CheckCircle size={14} /> Guardado</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Libro de Reclamaciones ─────────────────────────────────────────────────
const COMPLAINT_STATUS_STYLE: Record<string, string> = {
  RECIBIDO: 'bg-warn/10 text-warn',
  EN_PROCESO: 'bg-primary/10 text-primary',
  RESPONDIDO: 'bg-ok/10 text-ok',
};

// El envio llega desde la landing publica sin autenticacion (docs: requisito
// legal INDECOPI, Ley 29571 -- ver src/lib/complaint-book-api.ts). Aqui el
// Super Admin lo revisa y registra la respuesta al consumidor -- la norma
// exige responder dentro de 30 dias calendario; este panel no bloquea nada
// fuera de plazo, solo lo deja a la vista para que se pueda dar seguimiento.
function SAComplaintBook() {
  const [entries, setEntries] = useState<ComplaintBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ComplaintBookEntry | null>(null);
  const [responseText, setResponseText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchComplaints()
      .then(list => setEntries(list))
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo cargar el libro de reclamaciones.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!selected || !responseText.trim()) return;
    setSaving(true);
    try {
      const updated = await respondComplaint(selected.id, responseText);
      setEntries(prev => prev.map(e => (e.id === selected.id ? updated : e)));
      setSelected(updated);
      setResponseText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la respuesta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 py-4 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-t1">Libro de Reclamaciones</h1>
          <p className="text-sm text-t2 mt-0.5">Reclamos y quejas recibidos desde la landing pública (/libro-de-reclamaciones)</p>
        </div>
        <button onClick={load} className="text-sm text-t2 hover:text-t1 flex items-center gap-1.5">
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {error && (
        <div className="px-6 py-3 bg-danger/5 border-b border-danger/20 text-sm text-danger" role="alert">{error}</div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selected ? 'border-r border-border' : ''}`}>
          {loading ? (
            <div className="p-6 text-sm text-t2">Cargando reclamos…</div>
          ) : entries.length === 0 ? (
            <div className="p-6 text-sm text-t2">Todavía no hay reclamos ni quejas registrados.</div>
          ) : (
            <table className="w-full text-sm" aria-label="Libro de Reclamaciones">
              <thead className="sticky top-0">
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">N.º</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Tipo</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Consumidor</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Correo</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Fecha</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-hover cursor-pointer" onClick={() => { setSelected(e === selected ? null : e); setResponseText(''); }}>
                    <td className="px-4 py-3 text-t1 font-mono">{e.number}</td>
                    <td className="px-4 py-3 text-t2">{e.type === 'RECLAMO' ? 'Reclamo' : 'Queja'}</td>
                    <td className="px-4 py-3 font-medium text-t1">{e.consumerName}</td>
                    <td className="px-4 py-3 text-t2">{e.consumerEmail}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${COMPLAINT_STATUS_STYLE[e.status]}`}>{e.status.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-t2 font-mono">{e.createdAt.slice(0, 10)}</td>
                    <td className="px-4 py-3"><ChevronRight size={14} className="text-muted" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <aside className="fixed inset-0 z-40 w-full md:static md:inset-auto md:z-auto md:w-96 md:flex-shrink-0 overflow-auto p-4 bg-surface" aria-label="Detalle del reclamo">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-t1">{selected.number}</h3>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-t1"><X size={16} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <span className={`inline-block text-[11px] px-2 py-0.5 rounded font-medium ${COMPLAINT_STATUS_STYLE[selected.status]}`}>
                {selected.status.replace(/_/g, ' ')}
              </span>
              <div className="border border-border rounded-lg divide-y divide-border">
                {field('Tipo', selected.type === 'RECLAMO' ? 'Reclamo' : 'Queja')}
                {field('Consumidor', selected.consumerName)}
                {field('Documento', selected.consumerDocument, true)}
                {field('Correo', selected.consumerEmail)}
                {selected.consumerPhone && field('Teléfono', selected.consumerPhone)}
                {selected.consumerAddress && field('Domicilio', selected.consumerAddress)}
                {selected.isMinor && field('Menor de edad, apoderado', selected.guardianName ?? '—')}
                {field('Bien/servicio', selected.serviceDescription)}
                {selected.claimedAmount != null && field('Monto reclamado', `S/ ${selected.claimedAmount.toFixed(2)}`)}
              </div>
              <div className="border border-border rounded-lg p-3">
                <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-1">Detalle</p>
                <p className="text-t1 whitespace-pre-line">{selected.detail}</p>
              </div>
              <div className="border border-border rounded-lg p-3">
                <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-1">Pedido del consumidor</p>
                <p className="text-t1 whitespace-pre-line">{selected.consumerRequest}</p>
              </div>

              {selected.status === 'RESPONDIDO' ? (
                <div className="border border-ok/30 bg-ok/5 rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-ok uppercase tracking-wide mb-1">Respuesta enviada</p>
                  <p className="text-t1 whitespace-pre-line">{selected.providerResponse}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-t1">Registrar respuesta</label>
                  <textarea value={responseText} onChange={e => setResponseText(e.target.value)} rows={4}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
                  <button onClick={send} disabled={saving || !responseText.trim()}
                    className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-60">
                    {saving ? 'Guardando…' : 'Registrar respuesta'}
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// Aviso masivo (13 sept 2026, decidido con Jayde): ej. avisar un
// mantenimiento programado a todas las asociaciones a la vez, sin importar
// su plan (PRO, Operacion, GPS Vehicular todas reciben el mismo Aviso real
// dentro de su panel -- nunca por WhatsApp). "Enviar a todas" es el default;
// desmarcarlo habilita el filtro real por asociacion especifica.
function SABroadcastNotice() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [allOrgs, setAllOrgs] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'CONDUCTORES' | 'SOCIOS' | 'AMBOS' | 'ADMINISTRADORES'>('AMBOS');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ sent: number; organizations: string[] } | null>(null);

  useEffect(() => {
    fetchOrganizations()
      .then(setOrgs)
      .catch(() => { /* se degrada a lista vacia */ })
      .finally(() => setLoadingOrgs(false));
  }, []);

  const toggleOrg = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const canSend = title.trim() !== '' && body.trim() !== '' && (allOrgs || selectedIds.size > 0);

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError('');
    setResult(null);
    try {
      const res = await broadcastNotice({
        title: title.trim(),
        body: body.trim(),
        audience,
        organizationIds: allOrgs ? undefined : Array.from(selectedIds),
      });
      setResult(res);
      setTitle('');
      setBody('');
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el aviso.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-t1">Configuración SaaS</h1>
        <p className="text-sm text-t2 mt-0.5">
          Aviso masivo a asociaciones — por ejemplo, un mantenimiento programado. Llega como un aviso real dentro del panel de cada
          asociación (Administrador siempre lo ve; Socio/Conductor según la audiencia elegida), nunca por WhatsApp.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-t2 mb-1">Título</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ej. Mantenimiento programado — sábado 20, 10pm a 12am"
            className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-t2 mb-1">Mensaje</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={4}
            placeholder="Detalle del aviso…"
            className="w-full px-3 py-2 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-t2 mb-1">Audiencia</label>
          <select
            value={audience}
            onChange={e => setAudience(e.target.value as typeof audience)}
            className="h-9 px-2 border border-border rounded text-sm max-w-full focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="AMBOS">Todos (socios, conductores y administrador)</option>
            <option value="SOCIOS">Solo socios y administrador</option>
            <option value="CONDUCTORES">Solo conductores y administrador</option>
            <option value="ADMINISTRADORES">Solo administrador</option>
          </select>
          <p className="text-xs text-muted mt-1">
            {audience === 'ADMINISTRADORES'
              ? 'Solo lo ve el Administrador de cada asociación — Socio y Conductor nunca lo ven.'
              : 'El Administrador de cada asociación siempre lo ve también, sin importar la audiencia elegida arriba.'}
          </p>
        </div>

        <div className="border-t border-border pt-4">
          <label className="flex items-center gap-2 text-sm text-t1 font-medium cursor-pointer">
            <input type="checkbox" checked={allOrgs} onChange={e => setAllOrgs(e.target.checked)} />
            Enviar a todas las asociaciones ({orgs.length})
          </label>
          <p className="text-xs text-muted mt-1 mb-2">
            {allOrgs ? 'Desmarca la casilla de arriba para elegir asociaciones específicas.' : 'Elige una o varias asociaciones específicas:'}
          </p>
          <div className="border border-border rounded-lg max-h-56 overflow-y-auto divide-y divide-border">
            {loadingOrgs ? (
              <p className="px-3 py-3 text-sm text-t2">Cargando asociaciones…</p>
            ) : orgs.length === 0 ? (
              <p className="px-3 py-3 text-sm text-t2">Sin asociaciones registradas.</p>
            ) : (
              orgs.map(o => (
                <label
                  key={o.id}
                  className={`flex items-center gap-2 px-3 py-2 text-sm ${allOrgs ? 'opacity-60' : 'hover:bg-hover cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={allOrgs || selectedIds.has(o.id)}
                    disabled={allOrgs}
                    onChange={() => toggleOrg(o.id)}
                  />
                  <span className="text-t1">{o.name}</span>
                  <span className="text-xs text-t2">({o.plan})</span>
                </label>
              ))
            )}
          </div>
          {!allOrgs && selectedIds.size === 0 && (
            <p className="text-xs text-warn mt-1.5">Elige al menos una asociación, o marca "Enviar a todas".</p>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={!canSend || sending}
          className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50"
        >
          {sending ? 'Enviando…' : 'Enviar aviso'}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
        {result && (
          <p className="text-sm text-ok">
            Aviso enviado a {result.sent} asociación(es): {result.organizations.join(', ')}.
          </p>
        )}
      </div>
    </div>
  );
}

// Cola real de soporte (13 sept 2026, decidido con Jayde) -- reemplaza el
// placeholder fijo que tenia esta pantalla. El Administrador de cada
// asociacion reporta desde su propio panel (SupportPage.tsx); aca se ve la
// cola completa cruzando TODAS las asociaciones, mas reciente y ABIERTO
// primero (mismo orden que ya aplica el backend).
const TICKET_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  ABIERTO: 'Abierto',
  EN_PROGRESO: 'En progreso',
  RESUELTO: 'Resuelto',
};
const TICKET_STATUS_STYLE: Record<SupportTicketStatus, string> = {
  ABIERTO: 'bg-warn/10 text-warn',
  EN_PROGRESO: 'bg-primary/10 text-primary',
  RESUELTO: 'bg-ok/10 text-ok',
};

function SASupportTickets() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'todos' | SupportTicketStatus>('todos');
  const [replyDraft, setReplyDraft] = useState<{ id: string; status: 'EN_PROGRESO' | 'RESUELTO'; response: string } | null>(null);
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    fetchSupportTickets()
      .then(setTickets)
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudieron cargar los tickets.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filtered = filter === 'todos' ? tickets : tickets.filter(t => t.status === filter);
  const openCount = tickets.filter(t => t.status === 'ABIERTO').length;

  const handleReplySubmit = async () => {
    if (!replyDraft) return;
    setReplyBusy(true);
    setReplyError('');
    try {
      const updated = await respondSupportTicket(replyDraft.id, replyDraft.status, replyDraft.response.trim() || undefined);
      setTickets(prev => prev.map(t => (t.id === updated.id ? updated : t)));
      setReplyDraft(null);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'No se pudo guardar la respuesta.');
    } finally {
      setReplyBusy(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-t1">Soporte</h1>
        <p className="text-sm text-t2 mt-0.5">
          Tickets reales reportados por administradores de cualquier asociación{openCount > 0 ? ` · ${openCount} abierto(s)` : ''}.
        </p>
      </div>

      <div className="flex gap-1.5">
        {(['todos', 'ABIERTO', 'EN_PROGRESO', 'RESUELTO'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1.5 text-xs rounded border transition-colors ${filter === f ? 'bg-primary text-white border-primary' : 'border-border text-t2 hover:bg-hover'}`}
          >
            {f === 'todos' ? 'Todos' : TICKET_STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-t2">Cargando tickets…</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-t2 bg-surface border border-border rounded-lg p-8 text-center">Sin tickets en este filtro.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <div key={t.id} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 bg-t2/10 text-t2 rounded-full font-medium">{t.organizationName ?? 'Asociación'}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TICKET_STATUS_STYLE[t.status]}`}>{TICKET_STATUS_LABEL[t.status]}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-t1 mt-1.5">{t.subject}</h3>
                  <p className="text-sm text-t2 mt-1 whitespace-pre-wrap">{t.message}</p>
                  <p className="text-xs text-muted mt-1.5">Por {t.authorName} · {new Date(t.createdAt).toLocaleString('es-PE')}</p>
                </div>
                {t.status !== 'RESUELTO' && (
                  <button
                    onClick={() => setReplyDraft({ id: t.id, status: 'EN_PROGRESO', response: t.response ?? '' })}
                    className="px-2.5 py-1 text-xs font-medium text-primary border border-primary/30 rounded hover:bg-primary/5 shrink-0"
                  >
                    Responder
                  </button>
                )}
              </div>

              {t.response && replyDraft?.id !== t.id && (
                <div className="mt-3 bg-bg border border-border rounded-lg p-3">
                  <p className="text-xs font-medium text-t1 mb-1">Tu respuesta{t.respondedBy ? ` · ${t.respondedBy}` : ''}</p>
                  <p className="text-sm text-t2 whitespace-pre-wrap">{t.response}</p>
                </div>
              )}

              {replyDraft?.id === t.id && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <textarea
                    value={replyDraft.response}
                    onChange={e => setReplyDraft(d => d && { ...d, response: e.target.value })}
                    placeholder="Respuesta para el administrador…"
                    rows={3}
                    className="w-full px-2.5 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={replyDraft.status}
                      onChange={e => setReplyDraft(d => d && { ...d, status: e.target.value as 'EN_PROGRESO' | 'RESUELTO' })}
                      className="h-8 px-2 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="EN_PROGRESO">Marcar en progreso</option>
                      <option value="RESUELTO">Marcar resuelto</option>
                    </select>
                    <button onClick={handleReplySubmit} disabled={replyBusy} className="px-2.5 py-1 text-xs font-medium bg-primary text-white rounded hover:bg-primary-h disabled:opacity-50">
                      {replyBusy ? 'Guardando…' : 'Guardar respuesta'}
                    </button>
                    <button onClick={() => setReplyDraft(null)} className="px-2.5 py-1 text-xs font-medium text-t2 border border-border rounded hover:bg-hover">Cancelar</button>
                  </div>
                  {replyError && <p className="text-xs text-danger">{replyError}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SAPlaceholder({ title }: { title: string }) {
  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-t1 mb-4">{title}</h1>
      <div className="bg-surface border border-border rounded-lg p-8 text-center max-w-2xl">
        <p className="text-sm text-t2">Módulo disponible en la versión completa de CHASKI AI.</p>
        <p className="text-sm text-muted mt-2">Sin datos</p>
      </div>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────
export default function SuperAdminApp({
  onLogout,
  onEnterAsAdmin,
}: {
  onLogout?: () => void;
  onEnterAsAdmin: (org: { id: string; name: string }) => void;
}) {
  const [section, setSection] = useState<Section>(
    () => (window.history.state as { chaskiSection?: Section } | null)?.chaskiSection ?? 'resumen'
  );
  // Prellenado del wizard "Nueva asociación" cuando se llega desde "Usar
  // para nueva asociación (IA)" en Solicitudes comerciales (ia-aplicada.md
  // §2.5) -- se limpia al salir del wizard, para que un "Nueva asociación"
  // normal (sin pasar por una solicitud) siga arrancando en blanco.
  const [newOrgFromRequest, setNewOrgFromRequest] = useState<{ contactName: string; suggestion: OnboardingSuggestion } | null>(null);

  // Igual que en AdminApp: cambiar de seccion aqui era solo estado interno de
  // React, nunca tocaba la URL/historial del navegador -- por eso "atras"
  // saltaba directo al portal en vez de a la pantalla anterior del panel.
  useEffect(() => {
    window.history.replaceState(
      { ...(window.history.state ?? {}), chaskiSection: section },
      '',
      window.location.pathname
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      const s = (e.state as { chaskiSection?: Section } | null)?.chaskiSection;
      setSection(s ?? 'resumen');
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const nav = useCallback((s: Section) => {
    setSection(s);
    window.history.pushState({ chaskiSection: s }, '', window.location.pathname);
  }, []);

  return (
    <Shell
      navItems={NAV_ITEMS}
      activeSection={section === 'nueva-org' ? 'asociaciones' : section}
      onNavigate={(id) => nav(id as Section)}
      isSuperAdmin
      onLogout={onLogout}
    >
      {section === 'resumen' && <SADashboard onNavigate={nav} />}
      {section === 'asociaciones' && <SAOrganizations onNew={() => nav('nueva-org')} onEnterAsAdmin={onEnterAsAdmin} />}
      {section === 'gps-overview' && <GPSOverviewPage />}
      {section === 'pasajeros' && <PassengerProfilesPage />}
      {section === 'nueva-org' && (
        <NewOrgWizard
          onBack={() => { setNewOrgFromRequest(null); nav('asociaciones'); }}
          fromRequest={newOrgFromRequest}
        />
      )}
      {section === 'solicitudes' && (
        <SACommercialRequests
          onUseForNewOrg={(req, suggestion) => {
            setNewOrgFromRequest({ contactName: req.contactName, suggestion });
            nav('nueva-org');
          }}
        />
      )}
      {section === 'landing' && <SALandingContent />}
      {section === 'libro-reclamaciones' && <SAComplaintBook />}
      {section === 'salud' && <SATechHealth />}
      {section === 'soporte' && <SASupportTickets />}
      {section === 'auditoria' && <SAAudit />}
      {section === 'configuracion' && <SABroadcastNotice />}
    </Shell>
  );
}
