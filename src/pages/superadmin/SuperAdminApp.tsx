import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Building2, Wrench, Activity,
  HeadphonesIcon, ShieldCheck, Settings, Plus, X, ChevronRight, ArrowRight,
  AlertTriangle, CheckCircle, Clock, Users, CreditCard, DollarSign,
  Wifi, Sliders, FileText, AlertCircle, RefreshCw, ChevronDown,
  RotateCcw, Upload, ImageIcon, MapPin, Search, Map, LogIn, Pencil, ChevronLeft,
} from 'lucide-react';
import Shell, { type NavItem } from '../../components/layout/Shell';
import TerminalMapPicker from '../../components/TerminalMapPicker';
import { ORGANIZATIONS, SUBSCRIPTIONS, PAYMENTS, COMMERCIAL_REQUESTS, GPS_DEVICES, AUDIT_LOG } from '../../data/demo';
import type { Subscription, Payment, CommercialRequest, GPSDevice, AuditEntry, SubscriptionStatus, PaymentStatus } from '../../types';
import {
  fetchOrganizations, updateOrganization, createOrganization, uploadImage,
  fetchPeople, createPerson, updatePersonStatus,
  fetchOperationalConfig, updateOperationalConfig,
  fetchRoutes, createRoute, deleteRoute,
  fetchCompanies, createCompany, updateCompany,
  type Organization, type OperationalConfig, type Route, type CompanyOption,
} from '../../lib/operacion-api';
import type { Person } from '../../types';

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
  | 'resumen' | 'asociaciones' | 'solicitudes' | 'planes-sub'
  | 'pagos' | 'gps-solicitudes' | 'gps-instalaciones' | 'gps' | 'gps-suscripciones' | 'cobros' | 'salud' | 'soporte' | 'auditoria'
  | 'configuracion' | 'nueva-org';

const NAV_ITEMS: NavItem[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'asociaciones', label: 'Asociaciones', icon: Building2 },
  { id: 'solicitudes', label: 'Solicitudes comerciales', icon: FileText },
  { id: 'planes-sub', label: 'Planes y suscripciones', icon: CreditCard },
  { id: 'pagos', label: 'Pagos', icon: DollarSign },
  { id: 'gps-solicitudes', label: 'Solicitudes GPS', icon: FileText },
  { id: 'gps-instalaciones', label: 'Instalaciones GPS', icon: Wrench },
  { id: 'gps', label: 'Inventario GPS', icon: Wifi },
  { id: 'gps-suscripciones', label: 'Suscripciones GPS', icon: CreditCard },
  { id: 'cobros', label: 'Config. de cobros', icon: Sliders },
  { id: 'salud', label: 'Salud técnica', icon: Activity },
  { id: 'soporte', label: 'Soporte', icon: HeadphonesIcon },
  { id: 'auditoria', label: 'Auditoría', icon: ShieldCheck },
  { id: 'configuracion', label: 'Configuración SaaS', icon: Settings },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ORG_STATUS_STYLE: Record<string, string> = {
  ACTIVA: 'bg-ok/10 text-ok',
  EN_CONFIGURACION: 'bg-warn/10 text-warn',
  SUSPENDIDA: 'bg-danger/10 text-danger',
  CON_INCIDENCIA: 'bg-accent/20 text-accent',
};

const SUB_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  BORRADOR: 'Borrador',
  PENDIENTE_PAGO: 'Pendiente de pago',
  PAGO_EN_REVISION: 'Pago en revisión',
  PROGRAMADA: 'Programada',
  ACTIVA: 'Activa',
  PERIODO_GRACIA: 'Periodo de gracia',
  SUSPENDIDA: 'Suspendida',
  CANCELADA: 'Cancelada',
};

const SUB_STATUS_STYLE: Record<SubscriptionStatus, string> = {
  BORRADOR: 'bg-t2/10 text-t2',
  PENDIENTE_PAGO: 'bg-warn/10 text-warn',
  PAGO_EN_REVISION: 'bg-accent/10 text-accent',
  PROGRAMADA: 'bg-primary/10 text-primary',
  ACTIVA: 'bg-ok/10 text-ok',
  PERIODO_GRACIA: 'bg-warn/10 text-warn',
  SUSPENDIDA: 'bg-danger/10 text-danger',
  CANCELADA: 'bg-t2/10 text-muted',
};

const PAY_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  CORRECCION_SOLICITADA: 'Corrección solicitada',
};

const PAY_STATUS_STYLE: Record<PaymentStatus, string> = {
  PENDIENTE: 'bg-t2/10 text-t2',
  EN_REVISION: 'bg-accent/10 text-accent',
  APROBADO: 'bg-ok/10 text-ok',
  RECHAZADO: 'bg-danger/10 text-danger',
  CORRECCION_SOLICITADA: 'bg-warn/10 text-warn',
};

const GPS_STATUS_STYLE: Record<string, string> = {
  PENDIENTE: 'bg-t2/10 text-t2',
  INSTALADO: 'bg-primary/10 text-primary',
  EN_LINEA: 'bg-ok/10 text-ok',
  SIN_SENAL: 'bg-warn/10 text-warn',
  DESCONECTADO: 'bg-danger/10 text-danger',
};

const PRO_FEATURES = [
  'GPS en vivo', 'Historial GPS', 'Dispositivos GPS',
  'Geocercas', 'Alertas GPS', 'Estado técnico', 'Reportes avanzados',
];

function field(label: string, value: string, mono = false) {
  return (
    <div className="flex justify-between px-3 py-2">
      <span className="text-sm text-t2">{label}</span>
      <span className={`text-sm text-t1 font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function SADashboard({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchOrganizations().then(list => { if (!cancelled) setOrgs(list); }).catch(() => { /* se degrada a lista vacia */ });
    return () => { cancelled = true; };
  }, []);
  const active = orgs.filter(o => o.status === 'ACTIVA').length;
  const configuring = orgs.filter(o => o.status === 'EN_CONFIGURACION').length;
  const suspended = orgs.filter(o => o.status === 'SUSPENDIDA').length;
  const incident = 0; // el estado CON_INCIDENCIA no existe en el backend real (OrgStatus solo tiene 3 valores)
  const pendingPayments = PAYMENTS.filter(p => p.status === 'PENDIENTE' || p.status === 'EN_REVISION').length;
  const newRequests = COMMERCIAL_REQUESTS.filter(r => r.status === 'NUEVA').length;

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

      {/* Pending attention */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {pendingPayments > 0 && (
          <button onClick={() => onNavigate('pagos')} className="bg-warn/5 border border-warn/30 rounded-lg p-4 text-left hover:bg-warn/10 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={14} className="text-warn" />
              <span className="text-sm font-medium text-warn">{pendingPayments} pago{pendingPayments > 1 ? 's' : ''} pendiente{pendingPayments > 1 ? 's' : ''} de revisión</span>
            </div>
            <p className="text-sm text-t2 flex items-center gap-1">Ir a Pagos <ArrowRight size={13} /></p>
          </button>
        )}
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
          <h2 className="text-base font-semibold text-t1">Alertas de servicio</h2>
        </div>
        <div className="p-4 space-y-2.5">
          <div className="flex items-start gap-3 p-3.5 rounded-lg border border-accent/30 bg-accent/5">
            <AlertTriangle size={16} className="text-accent mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-t1">ASOTRANS ILAVE — Incidencia en cola</p>
              <p className="text-sm text-t2 mt-0.5">Reportaron un error en la asignación de posiciones. Soporte activo.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3.5 rounded-lg border border-warn/30 bg-warn/5">
            <Clock size={16} className="text-warn mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-t1">TRANSTITI — Configuración pendiente</p>
              <p className="text-sm text-t2 mt-0.5">Organización creada el 15/08. Checklist de configuración al 30%.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3.5 rounded-lg border border-ok/30 bg-ok/5">
            <CheckCircle size={16} className="text-ok mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-t1">ATIPCAR — Operación normal</p>
              <p className="text-sm text-t2 mt-0.5">Jornada 29/08 activa. Sin alertas de servicio.</p>
            </div>
          </div>
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
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOrganizations().then(list => { if (!cancelled) setOrgs(list); }).catch(() => { /* se degrada a lista vacia */ });
    return () => { cancelled = true; };
  }, [version]);

  const selected = orgs.find(o => o.id === selectedId) ?? null;

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

  // Sin flujo de pago real conectado todavia (plan-pro.md) -- por ahora el
  // Super Admin activa el Plan PRO a mano desde aqui.
  const changePlan = async (next: Organization['plan']) => {
    if (!selected || selected.plan === next) return;
    setBusy(true);
    try {
      await updateOrganization(selected.id, { plan: next });
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

  if (editingOrg) {
    return (
      <EditOrgWizard
        org={editingOrg}
        onBack={() => setEditingOrg(null)}
        onSaved={() => setVersion(v => v + 1)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
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
                    <p className="font-medium text-t1">{o.name}</p>
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
          <aside className="w-80 flex-shrink-0 overflow-auto p-4 bg-surface" aria-label="Detalle asociación">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-t1">{selected.name}</h3>
              <button onClick={() => setSelectedId(null)} className="text-muted hover:text-t1" aria-label="Cerrar"><X size={16} /></button>
            </div>
            <button
              onClick={() => onEnterAsAdmin({ id: selected.id, name: selected.name })}
              className="w-full flex items-center justify-center gap-2 h-9 mb-4 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90"
            >
              <LogIn size={14} /> Entrar como administrador
            </button>
            <button
              onClick={() => setEditingOrg(selected)}
              className="w-full flex items-center justify-center gap-2 h-9 mb-4 rounded-lg text-sm font-medium border border-primary/30 text-primary hover:bg-primary/5"
            >
              <Pencil size={14} /> Editar asociación
            </button>
            <div className="space-y-4 text-sm">
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

              <div className="border border-border rounded-lg divide-y divide-border">
                {[
                  { label: 'RUC', value: selected.ruc, mono: true },
                  { label: 'Creada', value: selected.createdAt.slice(0, 10) },
                ].map(row => (
                  <div key={row.label} className="flex justify-between px-3 py-2">
                    <span className="text-t2">{row.label}</span>
                    <span className={`text-t1 font-medium ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-2">Plan</p>
                <div className="flex rounded-lg border border-border overflow-hidden text-sm">
                  <button
                    onClick={() => changePlan('OPERACION')}
                    disabled={busy || selected.plan === 'OPERACION'}
                    className={`flex-1 py-2 font-medium transition-colors disabled:cursor-default ${selected.plan === 'OPERACION' ? 'bg-primary text-white' : 'text-t2 hover:bg-hover'}`}
                  >
                    Operación
                  </button>
                  <button
                    onClick={() => changePlan('PRO')}
                    disabled={busy || selected.plan === 'PRO'}
                    className={`flex-1 py-2 font-medium transition-colors disabled:cursor-default ${selected.plan === 'PRO' ? 'bg-primary text-white' : 'text-t2 hover:bg-hover'}`}
                  >
                    PRO
                  </button>
                </div>
                <p className="text-[11px] text-t2 mt-1.5">Activa PRO para desbloquear GPS Vehicular y el Asistente AI de esta asociación.</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-2">Mapa en vivo del conductor</p>
                <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2.5 gap-2">
                  <div>
                    <p className="text-t1 font-medium">{selected.driverLiveMapEnabled ? 'Habilitado' : 'Deshabilitado'}</p>
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
              <p className="text-[11px] text-t2">Módulos, unidades, socios y terminales se consultan y configuran desde "Entrar como administrador" arriba (Flota, Personas, Empresas, GPS, Reportes...).</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

const EDIT_ORG_STEPS = ['Organización', 'Administrador', 'Operación', 'Plan y facturación', 'Confirmación'];

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
    setInfoSaving(true);
    setInfoError('');
    try {
      await updateOrganization(org.id, {
        name: infoForm.name.trim(),
        ruc: infoForm.ruc.trim(),
        city: infoForm.city.trim(),
        legalRepName: infoForm.legalRepName.trim(),
        contactPhone: infoForm.contactPhone.trim(),
        contactEmail: infoForm.contactEmail.trim(),
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

  const handleSwapAdmin = async () => {
    if (!swapName.trim() || !swapEmail.trim()) return;
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
      const toSuspend = admins.filter(a => a.status !== 'SUSPENDIDO');
      for (const a of toSuspend) {
        await updatePersonStatus(a.id, 'SUSPENDIDO', 'Reemplazado por nuevo administrador (Super Admin)', org.id);
      }
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
    initialConfigNotes: '',
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

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) return;
    setCompanyError('');
    setCompanySaving(true);
    try {
      await createCompany({ name: newCompanyName.trim() }, org.id);
      setNewCompanyName('');
      reloadCompanies();
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : 'No se pudo agregar la empresa.');
    } finally {
      setCompanySaving(false);
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
          initialConfigNotes: cfg.initialConfigNotes ?? '',
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
          initialConfigNotes: opForm.initialConfigNotes.trim(),
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

  const handleChangePlan = async (next: Organization['plan']) => {
    if (next === org.plan) { setEditingPlan(false); return; }
    setPlanSaving(true);
    setPlanError('');
    try {
      await updateOrganization(org.id, { plan: next });
      setEditingPlan(false);
      onSaved();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'No se pudo cambiar el plan.');
    } finally {
      setPlanSaving(false);
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
        <Pencil size={13} /> {activeAdmins.length > 0 ? 'Cambiar administrador' : 'Registrar administrador'}
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
          onClick={handleSwapAdmin}
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
                initialConfigNotes: opConfig.initialConfigNotes ?? '',
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
      <button onClick={() => setEditingPlan(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h">
        <Pencil size={13} /> Editar
      </button>
    ) : (
      <button onClick={() => { setEditingPlan(false); setPlanError(''); }} disabled={planSaving} className="px-3 py-1.5 text-sm font-medium text-t2 border border-border rounded-lg hover:bg-hover disabled:opacity-50">
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
                      onChange={e => setInfoForm(v => ({ ...v, [f.key]: e.target.value }))}
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
                <p className="text-sm font-medium text-t1 mb-2">Administrador actual</p>
                {activeAdmins.length > 0 ? (
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {activeAdmins.map(a => (
                      <div key={a.id} className="px-3.5 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-t1 text-sm">{a.name}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${a.status === 'ACTIVO' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
                            {a.status === 'ACTIVO' ? 'Activo' : 'Pendiente (aún no ingresó con Google)'}
                          </span>
                        </div>
                        <p className="text-sm text-t2 mt-0.5">{a.email}</p>
                        {a.phone && <p className="text-sm text-t2 mt-0.5">{a.phone}</p>}
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
                    {activeAdmins.length > 0 ? 'Nuevo administrador (reemplaza al actual)' : 'Registrar administrador'}
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-t1 mb-1">Nombre del administrador *</label>
                    <input
                      value={swapName}
                      onChange={e => setSwapName(e.target.value)}
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
                      onChange={e => setSwapPhone(e.target.value)}
                      placeholder="9XXXXXXXX"
                      className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  {swapError && <p className="text-sm text-danger">{swapError}</p>}
                  <p className="text-xs text-t2">
                    {activeAdmins.length > 0
                      ? 'Al guardar, este correo queda como nuevo administrador y se suspende automáticamente al anterior.'
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
                La ubicación en el mapa que marques aquí es la misma que usa el GPS en vivo (Configuración → Terminales, dentro del panel del administrador, edita este mismo dato).
              </p>

              <div className="border-t border-border pt-5">
                <p className="text-sm font-semibold text-t1 mb-1">Rutas de operación adicionales</p>
                <p className="text-xs text-t2 mb-3">La ruta de ida y de vuelta ya están cubiertas por Terminal 1 y Terminal 2. Agrega aquí cualquier recorrido extra.</p>
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
                        <button
                          onClick={() => handleToggleCompanyStatus(co.id, co.status)}
                          className={`text-[10px] px-2 py-1 rounded font-medium ${co.status === 'SUSPENDIDA' ? 'bg-danger/10 text-danger' : 'bg-ok/10 text-ok'}`}
                        >
                          {co.status === 'SUSPENDIDA' ? 'Suspendida — reactivar' : 'Activa — suspender'}
                        </button>
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
                  <div className="flex rounded-lg border border-border overflow-hidden text-sm max-w-xs">
                    <button
                      onClick={() => handleChangePlan('OPERACION')}
                      disabled={planSaving}
                      className={`flex-1 py-2 font-medium transition-colors disabled:cursor-default ${org.plan === 'OPERACION' ? 'bg-primary text-white' : 'text-t2 hover:bg-hover'}`}
                    >
                      Operación
                    </button>
                    <button
                      onClick={() => handleChangePlan('PRO')}
                      disabled={planSaving}
                      className={`flex-1 py-2 font-medium transition-colors disabled:cursor-default ${org.plan === 'PRO' ? 'bg-primary text-white' : 'text-t2 hover:bg-hover'}`}
                    >
                      PRO
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-t1">{org.plan}</p>
                )}
                {planError && <p className="text-sm text-danger mt-1.5">{planError}</p>}
              </div>
              <p className="text-xs text-t2">
                Periodicidad, unidades contratadas, costos acordados y estado de suscripción viven en "Planes y Suscripciones" —
                esa pantalla todavía no está conectada a datos reales, así que no se muestran aquí como editables.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-1 text-sm">
              {[
                ['Nombre', infoForm.name || '—'],
                ['RUC', infoForm.ruc || '—'],
                ['Ciudad', infoForm.city || '—'],
                ['Representante', infoForm.legalRepName || '—'],
                ['Teléfono', infoForm.contactPhone || '—'],
                ['Correo institucional', infoForm.contactEmail || '—'],
                ['Administrador', activeAdmins[0]?.name || '—'],
                ['Correo admin', activeAdmins[0]?.email || '—'],
                ['Terminal 1', opForm.terminalOriginName || '—'],
                ['Terminal 2', opForm.terminalDestinationName || '—'],
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
    </div>
  );
}


// ─── Solicitudes comerciales ─────────────────────────────────────────────────
const CR_STATUS_STYLE: Record<string, string> = {
  NUEVA: 'bg-primary/10 text-primary',
  EN_PROCESO: 'bg-warn/10 text-warn',
  PROPUESTA_ENVIADA: 'bg-teal/10 text-teal',
  CERRADA: 'bg-t2/10 text-muted',
};

function SACommercialRequests() {
  const [requests, setRequests] = useState<CommercialRequest[]>(COMMERCIAL_REQUESTS);
  const [selected, setSelected] = useState<CommercialRequest | null>(null);

  const advance = (id: string) => {
    setRequests(prev => prev.map(r => {
      if (r.id !== id) return r;
      const next: Record<string, string> = { NUEVA: 'EN_PROCESO', EN_PROCESO: 'PROPUESTA_ENVIADA', PROPUESTA_ENVIADA: 'CERRADA' };
      return { ...r, status: (next[r.status] ?? r.status) as CommercialRequest['status'] };
    }));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface">
        <h1 className="text-2xl font-bold text-t1">Solicitudes comerciales</h1>
        <p className="text-sm text-t2 mt-0.5">Solicitudes recibidas desde la landing pública</p>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selected ? 'border-r border-border' : ''}`}>
          <table className="w-full text-sm" aria-label="Solicitudes comerciales">
            <thead className="sticky top-0">
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Organización</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Contacto</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Unidades</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">GPS</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Periodo</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Fecha</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-hover cursor-pointer" onClick={() => setSelected(r === selected ? null : r)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-t1">{r.orgName}</p>
                    <p className="text-xs text-t2">{r.city}</p>
                  </td>
                  <td className="px-4 py-3 text-t1">{r.contactName}</td>
                  <td className="px-4 py-3 font-medium text-t1">{r.totalUnits}</td>
                  <td className="px-4 py-3 text-t1">{r.gpsUnits}</td>
                  <td className="px-4 py-3 text-t2">{r.period}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${CR_STATUS_STYLE[r.status]}`}>{r.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3 text-t2 font-mono">{r.createdAt}</td>
                  <td className="px-4 py-3"><ChevronRight size={14} className="text-muted" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <aside className="w-80 flex-shrink-0 overflow-auto p-4 bg-surface" aria-label="Detalle solicitud">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-t1">{selected.orgName}</h3>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-t1"><X size={16} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <span className={`inline-block text-[11px] px-2 py-0.5 rounded font-medium ${CR_STATUS_STYLE[selected.status]}`}>
                {selected.status.replace(/_/g, ' ')}
              </span>
              <div className="border border-border rounded-lg divide-y divide-border">
                {field('Ciudad', selected.city)}
                {field('Rutas', selected.routes)}
                {field('Contacto', selected.contactName)}
                {field('Correo', selected.contactEmail)}
                {field('Teléfono', selected.contactPhone)}
                {field('Unidades', String(selected.totalUnits))}
                {field('Unidades GPS', String(selected.gpsUnits))}
                {field('Periodo', selected.period)}
                {selected.ruc && field('RUC', selected.ruc, true)}
              </div>
              {selected.comments && (
                <div className="border border-border rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-1">Comentarios</p>
                  <p className="text-t1">{selected.comments}</p>
                </div>
              )}
              {selected.status !== 'CERRADA' && (
                <button onClick={() => { advance(selected.id); setSelected(prev => prev ? { ...prev, status: (() => { const n: Record<string, string> = { NUEVA: 'EN_PROCESO', EN_PROCESO: 'PROPUESTA_ENVIADA', PROPUESTA_ENVIADA: 'CERRADA' }; return (n[prev.status] ?? prev.status) as CommercialRequest['status']; })() } : null); }}
                  className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h">
                  {selected.status === 'NUEVA' ? 'Marcar en proceso' : selected.status === 'EN_PROCESO' ? 'Marcar propuesta enviada' : 'Cerrar solicitud'}
                </button>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── Planes y suscripciones ───────────────────────────────────────────────────
type ActivationMode = 'NORMAL' | 'PRUEBA_GRATUITA' | 'CORTESIA' | 'ADMINISTRATIVA';

function ActivateModal({
  sub, paymentApproved, onConfirm, onClose
}: {
  sub: Subscription;
  paymentApproved: boolean;
  onConfirm: (data: { startDate: string; endDate: string; mode: ActivationMode; reason: string; responsible: string; features: string[] }) => void;
  onClose: () => void;
}) {
  const today = '2026-08-29';
  const defaultEnd = sub.period === 'ANUAL' ? '2027-08-28' : '2026-09-28';
  const [mode, setMode] = useState<ActivationMode>('NORMAL');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [reason, setReason] = useState('');
  const [responsible, setResponsible] = useState('superadmin@acceso.chaski.test');
  const [features, setFeatures] = useState<string[]>(PRO_FEATURES);

  const requiresJustification = mode !== 'NORMAL';
  const canSubmit = (!requiresJustification || reason.trim().length > 0) && responsible.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-t1">Activar Plan PRO — {sub.orgName}</h2>
          <button onClick={onClose} className="text-muted hover:text-t1"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Activation type */}
          <div>
            <label className="block text-sm font-medium text-t1 mb-2">Tipo de activación</label>
            <div className="grid grid-cols-2 gap-2">
              {([['NORMAL', 'Normal'], ['PRUEBA_GRATUITA', 'Prueba gratuita'], ['CORTESIA', 'Cortesía'], ['ADMINISTRATIVA', 'Administrativa']] as [ActivationMode, string][]).map(([v, l]) => (
                <button key={v} onClick={() => setMode(v)}
                  className={`py-1.5 text-sm rounded-lg border font-medium transition-colors ${mode === v ? 'bg-primary text-white border-primary' : 'border-border text-t2 hover:bg-hover'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {!paymentApproved && mode === 'NORMAL' && (
            <div className="bg-danger/5 border border-danger/20 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={13} className="text-danger mt-0.5" />
              <p className="text-sm text-danger">No hay un pago aprobado para esta suscripción. Aprueba el pago antes de activar normalmente, o selecciona un tipo de activación especial.</p>
            </div>
          )}

          {requiresJustification && (
            <div className="bg-warn/5 border border-warn/20 rounded-lg p-3">
              <p className="text-sm text-warn font-medium">Las activaciones especiales nunca quedan activas indefinidamente sin justificación. Asegúrate de establecer una fecha de vencimiento.</p>
            </div>
          )}

          {/* Details summary */}
          <div className="border border-border rounded-lg divide-y divide-border text-sm">
            {field('Asociación', sub.orgName)}
            {field('Plan', sub.plan)}
            {field('Periodicidad', sub.period)}
            {field('Unidades máx.', String(sub.units))}
            {field('Unidades GPS máx.', String(sub.gpsUnits))}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Fecha de inicio</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Vencimiento / renovación</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          {/* Features */}
          <div>
            <p className="text-sm font-medium text-t1 mb-2">Funciones habilitadas (PRO)</p>
            <div className="space-y-1">
              {PRO_FEATURES.map(f => (
                <label key={f} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={features.includes(f)}
                    onChange={e => setFeatures(prev => e.target.checked ? [...prev, f] : prev.filter(x => x !== f))}
                    className="accent-primary" />
                  <span className="text-sm text-t1">{f}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Responsible + reason */}
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Responsable de la activación</label>
            <input value={responsible} onChange={e => setResponsible(e.target.value)}
              className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">
              Motivo u observación {requiresJustification && <span className="text-danger">*</span>}
            </label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
              placeholder={requiresJustification ? 'Requerido para activaciones especiales…' : 'Opcional…'}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>
        </div>
        <div className="flex gap-3 justify-end px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-sm text-t2 hover:bg-hover">Cancelar</button>
          <button
            onClick={() => onConfirm({ startDate, endDate, mode, reason, responsible, features })}
            disabled={!canSubmit || (mode === 'NORMAL' && !paymentApproved)}
            className="px-4 py-2 bg-ok text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            Confirmar activación PRO
          </button>
        </div>
      </div>
    </div>
  );
}

function SAPlansSubscriptions({ onGoToPayments }: { onGoToPayments: () => void }) {
  const [subs, setSubs] = useState<Subscription[]>(SUBSCRIPTIONS);
  const [activating, setActivating] = useState<Subscription | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

  const getPaymentStatus = (subId: string): PaymentStatus | null => {
    const pay = PAYMENTS.find(p => p.subscriptionId === subId);
    return pay?.status ?? null;
  };

  const handleActivate = (sub: Subscription, data: { startDate: string; endDate: string; mode: ActivationMode; reason: string; responsible: string; features: string[] }) => {
    setSubs(prev => prev.map(s => s.id !== sub.id ? s : {
      ...s, status: 'ACTIVA', startDate: data.startDate, endDate: data.endDate,
      activationType: data.mode, activatedBy: data.responsible,
      activationReason: data.reason || 'Activación desde panel CHASKI AI',
      features: data.features, updatedAt: '2026-08-29',
    }));
    const entry: AuditEntry = {
      id: `a-act-${Date.now()}`, actor: data.responsible, actorRole: 'SUPERADMIN',
      org: sub.orgName, action: 'ACTIVAR_PRO', resource: 'Suscripción',
      resourceId: sub.id, timestamp: new Date().toISOString(),
      before: sub.status, after: 'ACTIVA',
      reason: data.reason || `Activación tipo ${data.mode}`,
    };
    setAuditEntries(prev => [entry, ...prev]);
    setActivating(null);
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-t1">Planes y suscripciones</h1>
          <p className="text-sm text-t2 mt-0.5">Estado de suscripción por asociación</p>
        </div>
      </div>

      {auditEntries.length > 0 && (
        <div className="bg-ok/5 border border-ok/30 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle size={14} className="text-ok" />
          <p className="text-sm text-ok">{auditEntries.length} activación{auditEntries.length > 1 ? 'es' : ''} registrada{auditEntries.length > 1 ? 's' : ''} en auditoría en esta sesión.</p>
        </div>
      )}

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Suscripciones">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Asociación</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Plan</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Periodo</th>
              <th className="text-right px-4 py-2.5 text-t2 font-medium">Unidades</th>
              <th className="text-right px-4 py-2.5 text-t2 font-medium">GPS</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Vigencia</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Pago</th>
              <th className="px-4 py-2.5 text-t2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {subs.map(s => {
              const payStatus = getPaymentStatus(s.id);
              const payApproved = payStatus === 'APROBADO';
              const canActivate = (payApproved || s.plan === 'OPERACION') && s.status !== 'ACTIVA' && s.status !== 'CANCELADA';
              return (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-hover/50">
                  <td className="px-4 py-3 font-medium text-t1">{s.orgName}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-semibold ${s.plan === 'PRO' ? 'text-primary' : 'text-t2'}`}>{s.plan}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${SUB_STATUS_STYLE[s.status]}`}>
                      {SUB_STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-t2">{s.period}</td>
                  <td className="px-4 py-3 text-right text-t1">{s.units || '—'}</td>
                  <td className="px-4 py-3 text-right text-t1">{s.gpsUnits || '—'}</td>
                  <td className="px-4 py-3 font-mono text-t2">
                    {s.startDate ? `${s.startDate} → ${s.endDate ?? '?'}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {payStatus ? (
                      <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${PAY_STATUS_STYLE[payStatus]}`}>{PAY_STATUS_LABEL[payStatus]}</span>
                    ) : (
                      <button onClick={onGoToPayments} className="px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">Registrar pago</button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.plan === 'PRO' && s.status !== 'ACTIVA' && (
                      <button
                        onClick={() => setActivating(s)}
                        disabled={!canActivate && !payApproved}
                        title={!payApproved ? 'Se requiere pago aprobado, o selecciona activación especial en el modal' : ''}
                        className="px-3 py-1.5 text-sm bg-ok text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-40"
                      >
                        Activar PRO
                      </button>
                    )}
                    {s.status === 'ACTIVA' && (
                      <span className="text-sm text-ok font-medium">✓ Activa</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {activating && (
        <ActivateModal
          sub={activating}
          paymentApproved={PAYMENTS.find(p => p.subscriptionId === activating.id)?.status === 'APROBADO'}
          onConfirm={data => handleActivate(activating, data)}
          onClose={() => setActivating(null)}
        />
      )}
    </div>
  );
}

// ─── Pagos ────────────────────────────────────────────────────────────────────
function RegisterPaymentModal({ onClose, onSave }: { onClose: () => void; onSave: (p: Payment) => void }) {
  const [form, setForm] = useState({
    orgId: 'atipcar', concept: '', quoteNumber: '', amount: '',
    currency: 'PEN', method: 'TRANSFERENCIA', bank: '', operationNumber: '',
    paymentDate: '2026-08-29', observations: '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const orgName = ORGANIZATIONS.find(o => o.id === form.orgId)?.name ?? '';
  const sub = SUBSCRIPTIONS.find(s => s.orgId === form.orgId);

  const handleSave = () => {
    if (!form.concept || !form.amount || !form.paymentDate) return;
    const p: Payment = {
      id: `pay-${Date.now()}`, orgId: form.orgId, orgName,
      subscriptionId: sub?.id ?? '',
      concept: form.concept, quoteNumber: form.quoteNumber || undefined,
      amount: parseFloat(form.amount), currency: form.currency as 'PEN' | 'USD',
      method: form.method as Payment['method'], bank: form.bank || undefined,
      operationNumber: form.operationNumber || undefined,
      paymentDate: form.paymentDate, status: 'PENDIENTE',
      observations: form.observations || undefined, createdAt: '2026-08-29',
    };
    onSave(p);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-t1">Registrar pago manual</h2>
          <button onClick={onClose} className="text-muted hover:text-t1"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Asociación *</label>
            <select value={form.orgId} onChange={e => set('orgId', e.target.value)}
              className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              {ORGANIZATIONS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Plan / servicio pagado</label>
            <p className="text-sm text-t2 px-3 py-2 bg-bg border border-border rounded-lg">{sub ? `Plan ${sub.plan}` : 'Sin suscripción activa'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Número de cotización u orden</label>
            <input value={form.quoteNumber} onChange={e => set('quoteNumber', e.target.value)} placeholder="COT-2026-XXXX"
              className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Concepto *</label>
            <input value={form.concept} onChange={e => set('concept', e.target.value)} placeholder="Suscripción mensual PRO…"
              className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Importe *</label>
              <input type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00"
                className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Moneda</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)}
                className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="PEN">PEN (Soles)</option>
                <option value="USD">USD (Dólares)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Método</label>
              <select value={form.method} onChange={e => set('method', e.target.value)}
                className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="DEPOSITO">Depósito</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Banco</label>
              <input value={form.bank} onChange={e => set('bank', e.target.value)} placeholder="BCP, Interbank…"
                className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">N.° de operación</label>
              <input value={form.operationNumber} onChange={e => set('operationNumber', e.target.value)} placeholder="XXXXXXXX"
                className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Fecha del pago *</label>
              <input type="date" value={form.paymentDate} onChange={e => set('paymentDate', e.target.value)}
                className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Comprobante adjunto</label>
            <div className="border border-dashed border-border rounded-lg px-3 py-3 text-center text-sm text-muted">
              La carga de archivos aún no está habilitada. Registra el número de operación como referencia.
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Observaciones</label>
            <textarea value={form.observations} onChange={e => set('observations', e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>
        </div>
        <div className="flex gap-3 justify-end px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-sm text-t2 hover:bg-hover">Cancelar</button>
          <button onClick={handleSave} disabled={!form.concept || !form.amount || !form.paymentDate}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50">
            Guardar pago
          </button>
        </div>
      </div>
    </div>
  );
}

function SAPayments({ onActivateSub }: { onActivateSub: () => void }) {
  const [payments, setPayments] = useState<Payment[]>(PAYMENTS);
  const [selected, setSelected] = useState<Payment | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const update = (id: string, patch: Partial<Payment>) =>
    setPayments(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

  const action = (id: string, status: PaymentStatus, extra: Partial<Payment> = {}) => {
    update(id, { status, ...extra });
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status, ...extra } : null);
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-t1">Pagos</h1>
          <p className="text-sm text-t2 mt-0.5">Registro y verificación de pagos de suscripción</p>
        </div>
        <button onClick={() => setShowRegister(true)} className="flex items-center gap-2 px-3.5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h">
          <Plus size={14} /> Registrar pago
        </button>
      </div>

      <div className="flex gap-4 overflow-hidden" style={{ minHeight: 0 }}>
        <div className={`flex-1 overflow-auto bg-surface border border-border rounded-lg ${selected ? 'border-r border-border' : ''}`}>
          <table className="w-full text-sm" aria-label="Pagos">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Asociación</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Concepto</th>
                <th className="text-right px-4 py-2.5 text-t2 font-medium">Importe</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Método</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Fecha</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className={`border-b border-border last:border-0 hover:bg-hover cursor-pointer ${selected?.id === p.id ? 'bg-primary/5' : ''}`}
                  onClick={() => setSelected(p === selected ? null : p)}>
                  <td className="px-4 py-3 font-medium text-t1">{p.orgName}</td>
                  <td className="px-4 py-3 text-t2 max-w-xs truncate">{p.concept}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-t1">{p.currency} {p.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-t2">{p.method}</td>
                  <td className="px-4 py-3 font-mono text-t2">{p.paymentDate}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${PAY_STATUS_STYLE[p.status]}`}>
                      {PAY_STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3"><ChevronRight size={14} className="text-muted" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <aside className="w-80 flex-shrink-0 overflow-auto bg-surface border border-border rounded-lg p-4" aria-label="Detalle de pago">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-t1">{selected.orgName}</h3>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-t1"><X size={16} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <span className={`inline-block text-[11px] px-2 py-0.5 rounded font-medium ${PAY_STATUS_STYLE[selected.status]}`}>
                {PAY_STATUS_LABEL[selected.status]}
              </span>
              <div className="border border-border rounded-lg divide-y divide-border">
                {field('Concepto', selected.concept)}
                {selected.quoteNumber && field('N.° cotización', selected.quoteNumber, true)}
                {field('Importe', `${selected.currency} ${selected.amount.toLocaleString()}`)}
                {field('Método', selected.method)}
                {selected.bank && field('Banco', selected.bank)}
                {selected.operationNumber && field('N.° operación', selected.operationNumber, true)}
                {field('Fecha de pago', selected.paymentDate)}
              </div>
              {selected.observations && (
                <div className="border border-border rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-1">Observaciones</p>
                  <p className="text-t1">{selected.observations}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2 pt-1">
                {selected.status === 'PENDIENTE' && (
                  <button onClick={() => action(selected.id, 'EN_REVISION')}
                    className="w-full py-2.5 border border-border rounded-lg text-sm text-t1 hover:bg-hover flex items-center justify-center gap-1.5">
                    <RefreshCw size={13} /> Marcar en revisión
                  </button>
                )}
                {(selected.status === 'PENDIENTE' || selected.status === 'EN_REVISION' || selected.status === 'CORRECCION_SOLICITADA') && (
                  <button onClick={() => action(selected.id, 'APROBADO', { approvedAt: '2026-08-29', reviewedBy: 'superadmin@acceso.chaski.test' })}
                    className="w-full py-2.5 bg-ok text-white rounded-lg text-sm font-medium hover:opacity-90 flex items-center justify-center gap-1.5">
                    <CheckCircle size={13} /> Aprobar pago
                  </button>
                )}
                {selected.status === 'APROBADO' && (
                  <button onClick={onActivateSub}
                    className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h flex items-center justify-center gap-1.5">
                    <Activity size={13} /> Activar suscripción <ArrowRight size={13} />
                  </button>
                )}
                {(selected.status === 'PENDIENTE' || selected.status === 'EN_REVISION') && (
                  <button onClick={() => setShowRejectModal(true)}
                    className="w-full py-2.5 border border-danger/30 text-danger rounded-lg text-sm hover:bg-danger/5 flex items-center justify-center gap-1.5">
                    <X size={13} /> Rechazar pago
                  </button>
                )}
                {(selected.status === 'PENDIENTE' || selected.status === 'EN_REVISION') && (
                  <button onClick={() => action(selected.id, 'CORRECCION_SOLICITADA')}
                    className="w-full py-2.5 border border-warn/30 text-warn rounded-lg text-sm hover:bg-warn/5 flex items-center justify-center gap-1.5">
                    <AlertCircle size={13} /> Solicitar corrección
                  </button>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {showRejectModal && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-5">
            <h3 className="text-base font-semibold text-t1 mb-3">Rechazar pago</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
              placeholder="Motivo del rechazo (requerido)…"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
            <div className="flex gap-3 justify-end mt-3">
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-hover">Cancelar</button>
              <button
                disabled={!rejectReason.trim()}
                onClick={() => { action(selected.id, 'RECHAZADO', { rejectionReason: rejectReason }); setShowRejectModal(false); setRejectReason(''); }}
                className="px-4 py-2 bg-danger text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {showRegister && (
        <RegisterPaymentModal
          onClose={() => setShowRegister(false)}
          onSave={p => setPayments(prev => [p, ...prev])}
        />
      )}
    </div>
  );
}

// ─── Dispositivos GPS ─────────────────────────────────────────────────────────

type GPSRequestStatus = 'SOLICITADA' | 'COTIZADA' | 'PENDIENTE_PAGO' | 'PAGADA' | 'PROGRAMADA' | 'INSTALANDO' | 'EN_PRUEBAS' | 'ACTIVA';

const GPS_REQUEST_FLOW: GPSRequestStatus[] = [
  'SOLICITADA', 'COTIZADA', 'PENDIENTE_PAGO', 'PAGADA',
  'PROGRAMADA', 'INSTALANDO', 'EN_PRUEBAS', 'ACTIVA',
];

const GPS_REQUEST_LABEL: Record<GPSRequestStatus, string> = {
  SOLICITADA: 'Solicitada', COTIZADA: 'Cotizada', PENDIENTE_PAGO: 'Pendiente de pago',
  PAGADA: 'Pagada', PROGRAMADA: 'Programada', INSTALANDO: 'Instalando',
  EN_PRUEBAS: 'En pruebas', ACTIVA: 'Activa',
};

const GPS_REQUEST_SEED = [
  {
    id: 'GPS-VEH-2026-0042', owner: 'Mario Condori Apaza', email: 'socio@acceso.atipcar.test',
    association: 'ATIPCAR', associationPlan: 'Operación', unit: '015', plate: 'Z5C-444',
    units: 1, requestedAt: '29/08/2026 09:12', status: 'SOLICITADA' as GPSRequestStatus,
    hardware: 'S/ 420 referencial', installation: 'S/ 120 referencial', monthly: 'S/ 30 referencial',
  },
  {
    id: 'GPS-VEH-2026-0038', owner: 'Luisa Ticona Callo', email: 'l.ticona@acceso.atipcar.test',
    association: 'ATIPCAR', associationPlan: 'Operación', unit: '004', plate: 'Z1A-123',
    units: 1, requestedAt: '28/08/2026 16:40', status: 'PAGADA' as GPSRequestStatus,
    hardware: 'S/ 420 referencial', installation: 'S/ 120 referencial', monthly: 'S/ 30 referencial',
  },
];

function SAGPSRequests() {
  const [requests, setRequests] = useState(GPS_REQUEST_SEED);
  const [selectedId, setSelectedId] = useState(GPS_REQUEST_SEED[0].id);
  const selected = requests.find(request => request.id === selectedId) ?? requests[0];

  const advance = () => {
    setRequests(current => current.map(request => {
      if (request.id !== selected.id) return request;
      const index = GPS_REQUEST_FLOW.indexOf(request.status);
      if (index >= GPS_REQUEST_FLOW.length - 1) return request;
      return { ...request, status: GPS_REQUEST_FLOW[index + 1] };
    }));
  };

  const currentIndex = GPS_REQUEST_FLOW.indexOf(selected.status);
  const nextStatus = GPS_REQUEST_FLOW[currentIndex + 1];

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-t1">Solicitudes GPS Vehicular</h1>
        <p className="text-sm text-t2 mt-0.5">Contratación individual por unidad · No modifica el plan de la asociación</p>
      </div>

      <div className="bg-warn/5 border border-warn/30 rounded-lg p-3 text-sm text-t2">
        Los montos mostrados son referenciales y no constituyen una tarifa publicada.
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-5">
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Solicitudes GPS Vehicular">
            <thead><tr className="bg-bg border-b border-border">
              {['Solicitud','Socio','Asociación','Unidad','Estado','Fecha'].map(label => <th key={label} className="px-4 py-2.5 text-left text-t2 font-medium">{label}</th>)}
            </tr></thead>
            <tbody>{requests.map(request => (
              <tr key={request.id} onClick={() => setSelectedId(request.id)}
                className={'border-b border-border last:border-0 cursor-pointer ' + (selectedId === request.id ? 'bg-primary/5' : 'hover:bg-hover/50')}>
                <td className="px-4 py-3 font-mono text-primary">{request.id}</td>
                <td className="px-4 py-3"><p className="text-t1 font-medium">{request.owner}</p><p className="text-muted">{request.email}</p></td>
                <td className="px-4 py-3"><p className="text-t1">{request.association}</p><p className="text-muted">Plan {request.associationPlan}</p></td>
                <td className="px-4 py-3 text-t1">{request.unit} · <span className="font-mono">{request.plate}</span></td>
                <td className="px-4 py-3"><span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded">{GPS_REQUEST_LABEL[request.status]}</span></td>
                <td className="px-4 py-3 text-t2">{request.requestedAt}</td>
              </tr>
            ))}</tbody>
          </table>
          </div>
        </div>

        <aside className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-border">
            <p className="font-mono text-sm text-primary">{selected.id}</p>
            <h2 className="text-base font-semibold text-t1 mt-1">{selected.owner}</h2>
            <p className="text-sm text-t2">{selected.association} · Unidad {selected.unit} · {selected.plate}</p>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-t2 mb-2">Cotización referencial</p>
              <div className="border border-border rounded divide-y divide-border text-sm">
                <div className="p-2.5 flex justify-between"><span>Teltonika FMC130</span><strong>{selected.hardware}</strong></div>
                <div className="p-2.5 flex justify-between"><span>Instalación técnica</span><strong>{selected.installation}</strong></div>
                <div className="p-2.5 flex justify-between"><span>SIM + plataforma mensual</span><strong>{selected.monthly}</strong></div>
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-t2 mb-2">Flujo controlado</p>
              <div className="space-y-2">
                {GPS_REQUEST_FLOW.map((status, index) => (
                  <div key={status} className="flex items-center gap-2 text-sm">
                    <span className={'w-5 h-5 rounded-full flex items-center justify-center text-[11px] ' + (index <= currentIndex ? 'bg-ok text-white' : 'bg-bg text-muted border border-border')}>
                      {index < currentIndex ? '✓' : index + 1}
                    </span>
                    <span className={index <= currentIndex ? 'text-t1 font-medium' : 'text-muted'}>{GPS_REQUEST_LABEL[status]}</span>
                  </div>
                ))}
              </div>
            </div>
            {nextStatus ? (
              <button onClick={advance} className="w-full h-9 bg-primary text-white rounded text-sm font-medium">
                Avanzar a: {GPS_REQUEST_LABEL[nextStatus]}
              </button>
            ) : (
              <div className="bg-ok/10 text-ok rounded p-3 text-sm font-medium flex items-center gap-2"><CheckCircle size={14} /> Servicio activo</div>
            )}
            <p className="text-xs text-muted">La activación final exige pago verificado, dispositivo instalado y prueba de primera señal aprobada.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SAInstallations() {
  const installationFlow = ['PROGRAMADA', 'INSTALANDO', 'EN_PRUEBAS', 'ACTIVA'] as const;
  const [stage, setStage] = useState<(typeof installationFlow)[number]>('PROGRAMADA');
  const [checks, setChecks] = useState({ power: false, ignition: false, signal: false, traccar: false, link: false });
  const allChecked = Object.values(checks).every(Boolean);
  const stageIndex = installationFlow.indexOf(stage);
  const toggle = (key: keyof typeof checks) => setChecks(current => ({ ...current, [key]: !current[key] }));

  const advance = () => {
    if (stage === 'EN_PRUEBAS' && !allChecked) return;
    const next = installationFlow[stageIndex + 1];
    if (next) setStage(next);
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div><h1 className="text-2xl font-bold text-t1">Órdenes de instalación GPS</h1><p className="text-sm text-t2 mt-0.5">Coordinación técnica y aceptación de primera señal</p></div>
      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="p-5 border-b border-border flex items-start justify-between gap-4">
            <div><p className="font-mono text-sm text-primary">OT-GPS-2026-0018</p><h2 className="text-base font-semibold text-t1 mt-1">Unidad 004 · Z1A-123</h2><p className="text-sm text-t2">ATIPCAR · Luisa Ticona Callo</p></div>
            <span className="bg-primary/10 text-primary text-[11px] px-2 py-0.5 rounded font-medium">{GPS_REQUEST_LABEL[stage]}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="p-5 text-sm space-y-3">
              <p className="text-[11px] uppercase tracking-wide text-t2">Programación</p>
              <div className="flex justify-between"><span className="text-t2">Fecha</span><strong>30/08/2026 · 10:00</strong></div>
              <div className="flex justify-between"><span className="text-t2">Lugar</span><strong>Terminal Juli</strong></div>
              <div className="flex justify-between"><span className="text-t2">Técnico</span><strong>Rudy Choque</strong></div>
              <div className="flex justify-between"><span className="text-t2">Equipo</span><strong>FMC130</strong></div>
              <div className="flex justify-between"><span className="text-t2">IMEI</span><strong className="font-mono">***********2639</strong></div>
              <div className="flex justify-between"><span className="text-t2">SIM</span><strong className="font-mono">********4821</strong></div>
            </div>
            <div className="p-5">
              <p className="text-[11px] uppercase tracking-wide text-t2 mb-3">Pruebas obligatorias</p>
              <div className="space-y-2">
                {[
                  ['power','Alimentación principal'],
                  ['ignition','Lectura de ignición'],
                  ['signal','Primera señal GPS'],
                  ['traccar','Recepción en Traccar'],
                  ['link','Vínculo organización–unidad–dispositivo'],
                ].map(([key,label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-t1 cursor-pointer">
                    <input type="checkbox" checked={checks[key as keyof typeof checks]} onChange={() => toggle(key as keyof typeof checks)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
        <aside className="border border-border rounded-lg p-4 space-y-4">
          <p className="text-sm font-semibold text-t1">Estado de la orden</p>
          {installationFlow.map((item,index) => (
            <div key={item} className="flex items-center gap-2 text-sm">
              <span className={'w-6 h-6 rounded-full flex items-center justify-center ' + (index <= stageIndex ? 'bg-primary text-white' : 'bg-bg text-muted')}>{index + 1}</span>
              <span className={index <= stageIndex ? 'text-t1 font-medium' : 'text-muted'}>{GPS_REQUEST_LABEL[item]}</span>
            </div>
          ))}
          {stage !== 'ACTIVA' && (
            <button onClick={advance} disabled={stage === 'EN_PRUEBAS' && !allChecked}
              className="w-full h-9 bg-primary text-white rounded text-sm font-medium disabled:opacity-40">
              {stage === 'PROGRAMADA' ? 'Iniciar instalación' : stage === 'INSTALANDO' ? 'Pasar a pruebas' : 'Aprobar y activar'}
            </button>
          )}
          {stage === 'ACTIVA' && <div className="bg-ok/10 text-ok p-3 rounded text-sm font-medium">Instalación aprobada y suscripción activa.</div>}
          <p className="text-xs text-muted">El técnico configura APN, dominio, puerto y conexión. El socio no recibe credenciales de Traccar.</p>
        </aside>
      </div>
    </div>
  );
}

function SAGPSSubscriptions() {
  const [coveredByAssociation, setCoveredByAssociation] = useState(false);
  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div><h1 className="text-2xl font-bold text-t1">Suscripciones GPS por unidad</h1><p className="text-sm text-t2 mt-0.5">Cobertura individual y migración a PRO institucional sin duplicar dispositivos ni cobros</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Activas','2'],['Individuales',coveredByAssociation ? '1' : '2'],['Cubiertas por asociación',coveredByAssociation ? '1' : '0'],['En instalación','1']].map(([label,value]) => (
          <div key={label} className="border border-border rounded-lg p-4"><p className="text-sm text-t2">{label}</p><p className="text-2xl font-bold text-t1 mt-1">{value}</p></div>
        ))}
      </div>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-bg border-b border-border">
            {['Suscripción','Titular','Asociación','Unidad','Cobertura','Facturación','Estado','Acción'].map(label => <th key={label} className="px-4 py-2.5 text-left text-t2 font-medium">{label}</th>)}
          </tr></thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="px-4 py-3 font-mono text-primary">GPS-SUB-0015</td>
              <td className="px-4 py-3 text-t1">Mario Condori Apaza</td>
              <td className="px-4 py-3"><p className="text-t1">ATIPCAR</p><p className="text-muted">{coveredByAssociation ? 'PRO' : 'Operación'}</p></td>
              <td className="px-4 py-3 text-t1">015 · <span className="font-mono">Z5C-444</span></td>
              <td className="px-4 py-3"><span className={coveredByAssociation ? 'bg-primary/10 text-primary px-2 py-0.5 rounded' : 'bg-warn/10 text-warn px-2 py-0.5 rounded'}>{coveredByAssociation ? 'Por asociación' : 'Individual'}</span></td>
              <td className="px-4 py-3 text-t1">{coveredByAssociation ? 'Cubierta por ATIPCAR' : 'Mensual por unidad'}</td>
              <td className="px-4 py-3"><span className="bg-ok/10 text-ok px-2 py-0.5 rounded">Activa</span></td>
              <td className="px-4 py-3"><button onClick={() => setCoveredByAssociation(!coveredByAssociation)} className="px-2.5 py-1 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">{coveredByAssociation ? 'Volver a individual' : 'Cubrir con PRO'}</button></td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-mono text-primary">GPS-SUB-0004</td>
              <td className="px-4 py-3 text-t1">Luisa Ticona Callo</td>
              <td className="px-4 py-3"><p className="text-t1">ATIPCAR</p><p className="text-muted">Operación</p></td>
              <td className="px-4 py-3 text-t1">004 · <span className="font-mono">Z1A-123</span></td>
              <td className="px-4 py-3"><span className="bg-warn/10 text-warn px-2 py-0.5 rounded">Individual</span></td>
              <td className="px-4 py-3 text-t1">Pago verificado</td>
              <td className="px-4 py-3"><span className="bg-primary/10 text-primary px-2 py-0.5 rounded">Instalación</span></td>
              <td className="px-4 py-3"><button className="px-2.5 py-1 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">Ver orden</button></td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm text-t2">
        Al activar PRO para una asociación, el mismo IMEI, vehículo e historial se conservan. La suscripción individual cambia a “Cubierta por asociación”; se registra prorrateo o saldo a favor y nunca se cobra dos veces.
      </div>
    </div>
  );
}

function SAGPSDevices() {
  const [devices] = useState<GPSDevice[]>(GPS_DEVICES);
  const [filter, setFilter] = useState('todas');

  const orgs = ['todas', ...Array.from(new Set(devices.map(d => d.orgName)))];
  const filtered = filter === 'todas' ? devices : devices.filter(d => d.orgName === filter);

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-t1">Dispositivos GPS</h1>
          <p className="text-sm text-t2 mt-0.5">{devices.length} dispositivos registrados · Inventario técnico administrado</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary">
            {orgs.map(o => <option key={o} value={o}>{o === 'todas' ? 'Todas las asociaciones' : o}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {(['EN_LINEA', 'INSTALADO', 'SIN_SENAL', 'DESCONECTADO', 'PENDIENTE'] as const).map(s => {
          const count = devices.filter(d => d.status === s).length;
          return (
            <div key={s} className={`border rounded-lg px-4 py-4 text-center ${GPS_STATUS_STYLE[s].replace('text-', 'border-').replace('bg-', 'bg-')}`}>
              <p className={`text-3xl font-bold ${GPS_STATUS_STYLE[s].split(' ')[1]}`}>{count}</p>
              <p className="text-xs text-t2 mt-0.5">{s.replace(/_/g, ' ')}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Dispositivos GPS">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="text-left px-4 py-2.5 text-t2 font-medium">IMEI</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Modelo</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Asociación</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Unidad</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">SIM</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Última señal</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Firmware</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id} className="border-b border-border last:border-0 hover:bg-hover/50">
                <td className="px-4 py-3 font-mono text-t1">{d.imei}</td>
                <td className="px-4 py-3 text-t2">{d.model}</td>
                <td className="px-4 py-3 text-t1">{d.orgName}</td>
                <td className="px-4 py-3 text-t2">{d.unitCode ? `${d.unitCode} · ${d.plate}` : '—'}</td>
                <td className="px-4 py-3 font-mono text-t2">{d.simNumber ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${GPS_STATUS_STYLE[d.status]}`}>{d.status.replace(/_/g, ' ')}</span>
                </td>
                <td className="px-4 py-3 font-mono text-t2">{d.lastSignal ? d.lastSignal.slice(0, 16).replace('T', ' ') : '—'}</td>
                <td className="px-4 py-3 font-mono text-t2">{d.firmwareVersion ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <p className="text-sm text-muted">Los estados se actualizarán al recibir telemetría válida.</p>
    </div>
  );
}

// ─── Config. de cobros ────────────────────────────────────────────────────────
function SABillingConfig() {
  const [saved, setSaved] = useState(false);
  const [config, setConfig] = useState({
    graceDays: '15',
    suspendAfterGrace: true,
    notifyBeforeExpiry: '7',
    currency: 'PEN',
    proMonthlyBase: '350',
    proAnnualBase: '3500',
    gpsMonthlyPerUnit: '18',
    gpsMonthlySim: '12',
  });
  const set = (k: string, v: string | boolean) => setConfig(f => ({ ...f, [k]: v }));

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <h1 className="text-2xl font-bold text-t1">Configuración de cobros</h1>
      <p className="text-sm text-t2">Parámetros globales de facturación. Cada suscripción puede tener condiciones distintas acordadas.</p>

      {saved && (
        <div className="bg-ok/5 border border-ok/30 rounded-lg p-3 flex items-center gap-2 text-sm text-ok">
          <CheckCircle size={14} /> Configuración guardada
        </div>
      )}

      <div className="bg-surface border border-border rounded-lg divide-y divide-border max-w-2xl">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-t1">Periodo de gracia (días)</p>
            <p className="text-sm text-t2">Días adicionales al vencer antes de suspender.</p>
          </div>
          <input type="number" min="0" max="90" value={config.graceDays} onChange={e => set('graceDays', e.target.value)}
            className="w-20 h-8 px-2 border border-border rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-t1">Suspender al finalizar gracia</p>
            <p className="text-sm text-t2">Bloquear nuevas configuraciones automáticamente.</p>
          </div>
          <button onClick={() => set('suspendAfterGrace', !config.suspendAfterGrace)}
            className={`w-10 h-5 rounded-full transition-colors relative ${config.suspendAfterGrace ? 'bg-primary' : 'bg-border'}`}>
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${config.suspendAfterGrace ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-t1">Avisar antes del vencimiento (días)</p>
            <p className="text-sm text-t2">Notificación al admin de la asociación.</p>
          </div>
          <input type="number" min="1" max="60" value={config.notifyBeforeExpiry} onChange={e => set('notifyBeforeExpiry', e.target.value)}
            className="w-20 h-8 px-2 border border-border rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-semibold text-t2 uppercase tracking-wide">Precios de referencia (S/)</h3>
        <p className="text-sm text-muted">Estos valores son referencia. El precio acordado se define por suscripción.</p>
        {[
          { label: 'Plan PRO mensual (base)', key: 'proMonthlyBase' },
          { label: 'Plan PRO anual (base)', key: 'proAnnualBase' },
          { label: 'GPS Vehicular mensual por unidad', key: 'gpsMonthlyPerUnit' },
          { label: 'SIM mensual por dispositivo', key: 'gpsMonthlySim' },
        ].map(item => (
          <div key={item.key} className="flex items-center justify-between gap-4">
            <label className="text-sm text-t1 flex-1">{item.label}</label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-t2">S/</span>
              <input type="number" min="0" value={(config as unknown as Record<string, string>)[item.key]}
                onChange={e => set(item.key, e.target.value)}
                className="w-24 h-8 px-2 border border-border rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setSaved(true)} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h">
        Guardar configuración
      </button>
    </div>
  );
}

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

function NewOrgWizard({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [created, setCreated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [mapTarget, setMapTarget] = useState<'terminal1' | 'terminal2' | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [form, setForm] = useState({
    // Step 0
    name: '', logoUrl: '', ruc: '', city: '', legalRep: '', phone: '', email: '',
    // Step 1
    adminName: '', adminEmail: '', adminPhone: '',
    // Step 2
    terminal1: '', terminal1Address: '', terminal2: '', terminal2Address: '',
    routes: [
      { origin: '', destination: '' },
      { origin: '', destination: '' },
    ],
    companies: '', config: '',
    // Step 3
    plan: 'OPERACION' as 'OPERACION' | 'PRO',
    period: 'MENSUAL' as 'MENSUAL' | 'ANUAL',
    units: '', gpsUnits: '', startDate: '', agreedPrice: '', discount: '',
    hardwareCost: '', installCost: '', simCost: '', serviceCost: '',
    subStatus: 'PENDIENTE_PAGO' as string,
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const isLast = step === WIZARD_STEPS.length - 1;

  const handleNext = async () => {
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
        await createOrganization({
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
        });
        setCreated(true);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'No se pudo crear la asociación. Intenta de nuevo.');
      } finally {
        setSaving(false);
      }
      return;
    }
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
          {form.plan === 'PRO' && (
            <div className="bg-warn/5 border border-warn/20 rounded-lg p-3 text-left mb-4">
              <p className="text-sm font-medium text-warn">Plan PRO — {form.subStatus === 'PENDIENTE_PAGO' ? 'Pendiente de pago' : form.subStatus}</p>
              <p className="text-sm text-t2 mt-1">El plan PRO no se activa automáticamente. Registra el pago en la sección Pagos y apruébalo para activarlo.</p>
            </div>
          )}
          <div className="bg-bg border border-border rounded-lg p-4 text-left mb-6">
            <h3 className="text-xs font-semibold text-t2 uppercase tracking-wide mb-3">Próximos pasos</h3>
            {[
              { task: 'Completar datos de la organización', done: !!form.name },
              { task: 'Configurar terminales y rutas', done: !!form.terminal1 },
              { task: 'Agregar empresas integrantes', done: !!form.companies },
              { task: form.plan === 'PRO' ? 'Registrar y aprobar pago PRO' : 'Verificar plan Operación', done: false },
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
                <input value={(form as unknown as Record<string, string>)[f.key]} onChange={e => set(f.key, e.target.value)}
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
                <input type={f.type ?? 'text'} value={(form as unknown as Record<string, string>)[f.key]} onChange={e => set(f.key, e.target.value)}
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

            <div className="border border-border rounded-lg p-4">
              <div className="flex items-start gap-2 mb-4">
                <Map size={17} className="text-primary mt-0.5" />
                <div>
                  <h3 className="text-base font-semibold text-t1">Rutas de operación</h3>
                  <p className="text-sm text-t2 mt-0.5">Define la ruta de ida, la ruta de vuelta y cualquier recorrido adicional.</p>
                </div>
              </div>

              <div className="space-y-3">
                {form.routes.map((route, index) => (
                  <div key={index} className="border-b border-border pb-3 last:border-b-0">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-sm font-semibold text-t2">
                        {index === 0 ? 'Ruta de ida' : index === 1 ? 'Ruta de vuelta' : 'Ruta ' + (index + 1)}
                      </p>
                      {index > 1 && (
                        <button
                          onClick={() => setForm(current => ({
                            ...current,
                            routes: current.routes.filter((_, routeIndex) => routeIndex !== index),
                          }))}
                          className="w-7 h-7 grid place-items-center rounded-md text-danger hover:bg-danger/5"
                          aria-label={'Eliminar ruta ' + (index + 1)}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-t1 mb-1">Origen</label>
                        <input
                          list="route-cities"
                          value={route.origin}
                          onChange={event => setForm(current => ({
                            ...current,
                            routes: current.routes.map((item, routeIndex) =>
                              routeIndex === index ? { ...item, origin: event.target.value } : item
                            ),
                          }))}
                          placeholder={index === 0 ? 'Juli' : index === 1 ? 'Puno' : 'Origen'}
                          className="w-full h-9 px-3 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-t1 mb-1">Destino</label>
                        <input
                          list="route-cities"
                          value={route.destination}
                          onChange={event => setForm(current => ({
                            ...current,
                            routes: current.routes.map((item, routeIndex) =>
                              routeIndex === index ? { ...item, destination: event.target.value } : item
                            ),
                          }))}
                          placeholder={index === 0 ? 'Puno' : index === 1 ? 'Juli' : 'Destino'}
                          className="w-full h-9 px-3 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <datalist id="route-cities">
                <option value="Juli" />
                <option value="Puno" />
                <option value="Juliaca" />
                <option value="Ilave" />
                <option value="Desaguadero" />
              </datalist>

              <button
                onClick={() => setForm(current => ({
                  ...current,
                  routes: [...current.routes, { origin: '', destination: '' }],
                }))}
                className="mt-3 h-9 px-3 border border-primary text-primary rounded-md text-sm font-medium hover:bg-selected flex items-center gap-2"
              >
                <Plus size={15} />
                Agregar ruta
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Empresas integrantes (nombres)</label>
              <input value={form.companies} onChange={event => set('companies', event.target.value)} placeholder="Empresa A, Empresa B"
                className="w-full h-9 px-3 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
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
                <p className="text-sm text-t2 mt-1">La asociación quedará con estado "PRO — Pendiente de pago" hasta que se registre y apruebe el pago correspondiente.</p>
              </div>
            )}

            {/* Periodicity */}
            <div>
              <label className="block text-sm font-medium text-t1 mb-2">Periodicidad</label>
              <div className="flex gap-3">
                {(['MENSUAL', 'ANUAL'] as const).map(p => (
                  <button key={p} onClick={() => setForm(f => ({ ...f, period: p }))}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${form.period === p ? 'bg-primary text-white border-primary' : 'border-border text-t2 hover:bg-hover'}`}>
                    {p === 'MENSUAL' ? 'Mensual' : 'Anual'}
                  </button>
                ))}
              </div>
            </div>

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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-t1 mb-1">Fecha prevista de inicio</label>
                <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)}
                  className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-t1 mb-1">Estado inicial suscripción</label>
                <select value={form.subStatus} onChange={e => set('subStatus', e.target.value)}
                  className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="BORRADOR">Borrador</option>
                  <option value="PENDIENTE_PAGO">Pendiente de pago</option>
                  <option value="PROGRAMADA">Programada</option>
                </select>
              </div>
            </div>

            <div className="border border-border rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-t2 uppercase tracking-wide">Costos acordados (S/ — opcionales)</p>
              {[
                { label: 'Precio acordado (servicio)', key: 'agreedPrice' },
                { label: 'Descuento (%)', key: 'discount' },
                { label: 'Hardware (dispositivos GPS)', key: 'hardwareCost' },
                { label: 'Instalación', key: 'installCost' },
                { label: 'SIM (anual)', key: 'simCost' },
                { label: 'Servicio recurrente', key: 'serviceCost' },
              ].map(f => (
                <div key={f.key} className="flex items-center justify-between gap-3">
                  <label className="text-sm text-t1 flex-1">{f.label}</label>
                  <input type="number" min="0" value={(form as unknown as Record<string, string>)[f.key]} onChange={e => set(f.key, e.target.value)}
                    placeholder="0"
                    className="w-28 h-8 px-2 border border-border rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              ))}
            </div>
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
              ['Rutas', form.routes
                .filter(route => route.origin && route.destination)
                .map(route => route.origin + ' → ' + route.destination)
                .join(' · ') || '—'],
              ['Plan', form.plan],
              ['Periodicidad', form.period],
              ['Unidades', form.units || '—'],
              ['Unidades GPS', form.gpsUnits || '—'],
              ['Estado suscripción', form.subStatus],
              ['Precio acordado', form.agreedPrice ? `S/ ${form.agreedPrice}` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-border pb-2">
                <span className="text-t2">{k}</span>
                <span className="text-t1 font-medium">{v}</span>
              </div>
            ))}
            {form.plan === 'PRO' && (
              <div className="bg-warn/5 border border-warn/20 rounded-lg p-3">
                <p className="text-sm font-medium text-warn">Al crear, el plan PRO quedará en estado "{form.subStatus}". No se activa automáticamente.</p>
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
            if (mapTarget === 'terminal1') {
              setForm(current => ({
                ...current,
                terminal1: location.name,
                terminal1Address: location.address,
              }));
            } else {
              setForm(current => ({
                ...current,
                terminal2: location.name,
                terminal2Address: location.address,
              }));
            }
            setMapTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Tech health & placeholders ───────────────────────────────────────────────
function SATechHealth() {
  const services = [
    { name: 'API Principal', status: 'OK', latency: '42ms', uptime: '99.98%' },
    { name: 'Base de datos', status: 'OK', latency: '8ms', uptime: '99.99%' },
    { name: 'Kiosco QR', status: 'OK', latency: '120ms', uptime: '99.92%' },
    { name: 'Notificaciones', status: 'DEGRADADO', latency: '850ms', uptime: '98.1%' },
    { name: 'GPS PRO', status: 'OK', latency: '65ms', uptime: '99.95%' },
    { name: 'PDF Export', status: 'OK', latency: '340ms', uptime: '99.88%' },
  ];
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-t1">Salud técnica</h1>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Estado de servicios">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Servicio</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Latencia</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Uptime 30d</th>
            </tr>
          </thead>
          <tbody>
            {services.map(s => (
              <tr key={s.name} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-t1">{s.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${s.status === 'OK' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>{s.status}</span>
                </td>
                <td className="px-4 py-3 font-mono text-t2">{s.latency}</td>
                <td className="px-4 py-3 font-mono text-t1">{s.uptime}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <p className="text-sm text-muted">Datos de referencia.</p>
    </div>
  );
}

function SAAudit() {
  return (
    <div className="p-6 lg:p-8 space-y-4">
      <h1 className="text-2xl font-bold text-t1">Auditoría</h1>
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
            {AUDIT_LOG.map(e => (
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
      {section === 'nueva-org' && <NewOrgWizard onBack={() => nav('asociaciones')} />}
      {section === 'solicitudes' && <SACommercialRequests />}
      {section === 'planes-sub' && <SAPlansSubscriptions onGoToPayments={() => nav('pagos')} />}
      {section === 'pagos' && <SAPayments onActivateSub={() => nav('planes-sub')} />}
      {section === 'gps-solicitudes' && <SAGPSRequests />}
      {section === 'gps-instalaciones' && <SAInstallations />}
      {section === 'gps' && <SAGPSDevices />}
      {section === 'gps-suscripciones' && <SAGPSSubscriptions />}
      {section === 'cobros' && <SABillingConfig />}
      {section === 'salud' && <SATechHealth />}
      {section === 'soporte' && <SAPlaceholder title="Soporte" />}
      {section === 'auditoria' && <SAAudit />}
      {section === 'configuracion' && <SAPlaceholder title="Configuración SaaS" />}
    </Shell>
  );
}
