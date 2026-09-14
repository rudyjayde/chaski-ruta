import { useState, useEffect, useCallback, Fragment } from 'react';
import { ChevronRight, ArrowLeft, Download, Map as MapIcon, Table as TableIcon, Bell, Route, Wallet } from 'lucide-react';
import GPSAlertsPage from '../admin/GPSAlertsPage';
import GpsRouteHistoryView from '../../components/GpsRouteHistoryView';
import {
  fetchOrganizations, fetchVehicles, fetchGpsDevices, fetchGpsAlerts, fetchGpsLive, fetchOperationalConfig,
  fetchEngineLockRequests, confirmEngineLock, cancelEngineLock, restoreEngineLock, requestEngineLockDirect,
  setVehicleGpsVehicularPlan, updateOrganization,
  type Organization, type VehicleGpsStatus, type EngineLockRequest, type LiveVehiclePosition, type OperationalConfig,
} from '../../lib/operacion-api';
import type { Unit } from '../../types';
import LiveFleetMap from '../../components/LiveFleetMap';

// Vista consolidada de GPS (12 sept 2026, decidido con Jayde): lista de las
// asociaciones reales -> entrar a una -> tabla completa de sus unidades con
// codigo, empresa, IMEI, SIM (dato informativo, ver comentario en
// schema.prisma), estado de señal real, y el mismo boton de bloqueo de motor
// que ya existe en el wizard de edicion de asociacion (Socio solicita, Super
// Admin confirma/cancela/restaura -- misma regla, nunca cambia, esto solo
// copia el acceso a otra pantalla).
//
// El IMEI se muestra COMPLETO, sin enmascarar (corregido 12 sept 2026, a
// pedido de Jayde): Super Admin es quien instala y configura cada
// dispositivo fisico, no tiene sentido ocultarle un dato que el mismo
// escribio -- el enmascarado solo tendria sentido para un rol que no deba
// operar el hardware.

// Mismo generador liviano de PDF que ya usa ManifestsPage.tsx (un solo
// bloque de texto, sin dependencias externas).
function pdfSafeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function createPdfBlob(lines: string[]) {
  const textCommands = lines.slice(0, 55).map((line, index) =>
    (index === 0 ? '' : 'T* ') + '(' + pdfSafeText(line) + ') Tj'
  ).join('\n');
  const stream = 'BT\n/F1 9 Tf\n50 800 Td\n13 TL\n' + textCommands + '\nET';
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    '5 0 obj << /Length ' + stream.length + ' >> stream\n' + stream + '\nendstream\nendobj',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(object => { offsets.push(pdf.length); pdf += object + '\n'; });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  offsets.slice(1).forEach(offset => { pdf += String(offset).padStart(10, '0') + ' 00000 n \n'; });
  pdf += 'trailer << /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return new Blob([pdf], { type: 'application/pdf' });
}

function downloadGpsOverviewPdf(orgName: string, rows: { code: string; company: string; imei: string; sim: string; status: string }[]) {
  const lines = [
    orgName + ' - REPORTE GPS',
    'Generado: ' + new Date().toLocaleString('es-PE'),
    '',
    'Unidad | Empresa | IMEI | SIM | Estado de señal',
    ...rows.map(r => `${r.code} | ${r.company} | ${r.imei} | ${r.sim} | ${r.status}`),
  ];
  const blob = createPdfBlob(lines);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `gps-${orgName.toLowerCase().replace(/\s+/g, '-')}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const STATUS_LABEL: Record<string, string> = {
  online: 'En línea',
  offline: 'Sin señal',
  unknown: 'Desconocido',
  sin_vincular: 'Sin dispositivo',
};
const STATUS_STYLE: Record<string, string> = {
  online: 'bg-ok/10 text-ok',
  offline: 'bg-danger/10 text-danger',
  unknown: 'bg-warn/10 text-warn',
  sin_vincular: 'bg-t2/10 text-t2',
};

// Salud GPS de una asociación (vista tipo CRM): a partir de los mismos datos
// reales que ya usa la tabla de detalle -- ningun numero se inventa, si algo
// falla al cargar simplemente no se muestra esa metrica.
interface OrgHealth {
  vehicles: number;
  linked: number;
  online: number;
  openAlerts: number;
  pendingLocks: number;
}

export default function GPSOverviewPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [health, setHealth] = useState<Record<string, OrgHealth>>({});
  const [healthLoading, setHealthLoading] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [view, setView] = useState<'tabla' | 'mapa' | 'alertas' | 'plan'>('tabla');
  // Recorrido pintado en el mapa (12 sept 2026, decidido con Jayde): solo
  // Super Admin y el propio Socio -- el Administrador nunca ve esto, es
  // privado del GPS Vehicular individual (ver GpsRouteHistoryView.tsx).
  // Distinto de "view" porque es por UNIDAD, no por toda la asociacion.
  const [historyVehicle, setHistoryVehicle] = useState<Unit | null>(null);
  const [vehicles, setVehicles] = useState<Unit[]>([]);
  const [devices, setDevices] = useState<VehicleGpsStatus[]>([]);
  const [lockRequests, setLockRequests] = useState<EngineLockRequest[]>([]);
  const [positions, setPositions] = useState<LiveVehiclePosition[] | null>(null);
  const [mapConfig, setMapConfig] = useState<OperationalConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [reasonDraft, setReasonDraft] = useState<{ id: string; action: 'cancel' | 'restore' | 'direct'; reason: string } | null>(null);
  // Plan GPS Vehicular individual (13 sept 2026, decidido con Jayde): vive
  // aca, no en el wizard de edicion de asociacion -- es una tarea de
  // cobranza recurrente (revisar quien pago este mes), no una tarea tecnica
  // de una sola vez como vincular el IMEI. Por eso tiene su propio tab, con
  // el mismo patron de motivo obligatorio que ya usa el bloqueo de motor.
  const [planReasonDraft, setPlanReasonDraft] = useState<{ id: string; activo: boolean; reason: string } | null>(null);
  const [planActionId, setPlanActionId] = useState<string | null>(null);
  const [planActionError, setPlanActionError] = useState('');

  // Dias de gracia del Plan GPS Vehicular (13 sept 2026): editable por Super
  // Admin, por asociacion -- se usa la proxima vez que ESA asociacion baje
  // de PRO a Operacion (ver organizations.service.ts update()).
  const [graceDaysDraft, setGraceDaysDraft] = useState(10);
  const [graceDaysSaving, setGraceDaysSaving] = useState(false);
  const [graceDaysError, setGraceDaysError] = useState('');
  useEffect(() => {
    if (selectedOrg) setGraceDaysDraft(selectedOrg.gpsVehicularGraceDays);
  }, [selectedOrg?.id, selectedOrg?.gpsVehicularGraceDays]);

  const handleSaveGraceDays = async () => {
    if (!selectedOrg) return;
    setGraceDaysSaving(true);
    setGraceDaysError('');
    try {
      await updateOrganization(selectedOrg.id, { gpsVehicularGraceDays: graceDaysDraft });
      setSelectedOrg(o => o && { ...o, gpsVehicularGraceDays: graceDaysDraft });
      setOrgs(list => list.map(o => (o.id === selectedOrg.id ? { ...o, gpsVehicularGraceDays: graceDaysDraft } : o)));
    } catch (err) {
      setGraceDaysError(err instanceof Error ? err.message : 'No se pudo guardar los días de gracia.');
    } finally {
      setGraceDaysSaving(false);
    }
  };

  useEffect(() => {
    fetchOrganizations().then(async (list) => {
      setOrgs(list);
      setHealthLoading(true);
      const entries = await Promise.all(list.map(async (o) => {
        try {
          const [v, d, alerts, locks] = await Promise.all([
            fetchVehicles(undefined, o.id),
            fetchGpsDevices(o.id),
            fetchGpsAlerts(o.id),
            fetchEngineLockRequests(o.id),
          ]);
          const h: OrgHealth = {
            vehicles: v.length,
            linked: v.filter(u => !!u.traccarDeviceId).length,
            online: d.filter(x => x.online === 'online').length,
            openAlerts: alerts.filter(a => a.status === 'NUEVA' || a.status === 'EN_REVISION').length,
            pendingLocks: locks.filter(r => r.status === 'SOLICITADO' || r.status === 'CONFIRMADO').length,
          };
          return [o.id, h] as const;
        } catch {
          return null;
        }
      }));
      const map: Record<string, OrgHealth> = {};
      for (const entry of entries) { if (entry) map[entry[0]] = entry[1]; }
      setHealth(map);
      setHealthLoading(false);
    }).catch(() => { /* se degrada a lista vacia */ });
  }, []);

  const loadOrgData = useCallback((org: Organization) => {
    setLoading(true);
    setError('');
    Promise.all([
      fetchVehicles(undefined, org.id),
      fetchGpsDevices(org.id),
      fetchEngineLockRequests(org.id),
    ])
      .then(([v, d, l]) => { setVehicles(v); setDevices(d); setLockRequests(l); })
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo cargar la información GPS.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectOrg = (org: Organization) => {
    setSelectedOrg(org);
    setView('tabla');
    loadOrgData(org);
  };

  // Mapa en vivo (Google Maps + Traccar real) -- mismo componente que usa el
  // panel de administracion (LiveFleetMap), solo que aqui filtrado por la
  // asociacion elegida via organizationId (Super Admin puede ver cualquiera).
  useEffect(() => {
    if (!selectedOrg || view !== 'mapa') return;
    let cancelled = false;
    fetchOperationalConfig(selectedOrg.id).then((c) => { if (!cancelled) setMapConfig(c); }).catch(() => { /* usa el centro por defecto */ });
    const refresh = () => {
      fetchGpsLive(selectedOrg.id)
        .then((data) => { if (!cancelled) setPositions(data); })
        .catch(() => { /* se mantiene la ultima posicion conocida */ });
    };
    refresh();
    const id = setInterval(refresh, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [selectedOrg, view]);

  const handleConfirmLock = async (id: string) => {
    if (!selectedOrg) return;
    setActionId(id);
    setActionError('');
    try {
      await confirmEngineLock(id, selectedOrg.id);
      loadOrgData(selectedOrg);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo confirmar el bloqueo.');
    } finally {
      setActionId(null);
    }
  };

  const handleReasonSubmit = async () => {
    if (!reasonDraft || !reasonDraft.reason.trim() || !selectedOrg) return;
    setActionId(reasonDraft.id);
    setActionError('');
    try {
      if (reasonDraft.action === 'cancel') await cancelEngineLock(reasonDraft.id, reasonDraft.reason.trim(), selectedOrg.id);
      else if (reasonDraft.action === 'restore') await restoreEngineLock(reasonDraft.id, reasonDraft.reason.trim(), selectedOrg.id);
      else await requestEngineLockDirect(reasonDraft.id, reasonDraft.reason.trim(), selectedOrg.id);
      setReasonDraft(null);
      loadOrgData(selectedOrg);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    } finally {
      setActionId(null);
    }
  };

  const handlePlanReasonSubmit = async () => {
    if (!planReasonDraft || !planReasonDraft.reason.trim() || !selectedOrg) return;
    setPlanActionId(planReasonDraft.id);
    setPlanActionError('');
    try {
      await setVehicleGpsVehicularPlan(planReasonDraft.id, planReasonDraft.activo, planReasonDraft.reason.trim(), selectedOrg.id);
      setPlanReasonDraft(null);
      loadOrgData(selectedOrg);
    } catch (err) {
      setPlanActionError(err instanceof Error ? err.message : 'No se pudo actualizar el plan GPS Vehicular.');
    } finally {
      setPlanActionId(null);
    }
  };

  const handleDownloadPdf = () => {
    if (!selectedOrg) return;
    const rows = vehicles.map(v => {
      const device = devices.find(d => d.vehicleId === v.id);
      const statusKey = !v.traccarDeviceId ? 'sin_vincular' : (device?.online ?? 'unknown');
      return {
        code: v.code,
        company: v.company,
        imei: v.traccarDeviceId ?? 'Sin dispositivo',
        sim: [v.simOperator, v.simNumber].filter(Boolean).join(' - ') || '—',
        status: STATUS_LABEL[statusKey] ?? statusKey,
      };
    });
    downloadGpsOverviewPdf(selectedOrg.name, rows);
  };

  if (!selectedOrg) {
    return (
      <div className="p-6 lg:p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-t1">GPS por asociación</h1>
          <p className="text-sm text-t2 mt-0.5">Salud real de cada asociación (vinculación, señal, alertas abiertas y bloqueos pendientes). Elige una para ver el detalle y el mapa en vivo.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orgs.map(o => {
            const h = health[o.id];
            return (
              <button
                key={o.id}
                onClick={() => handleSelectOrg(o)}
                className="bg-surface border border-border rounded-lg p-4 text-left hover:border-primary/40 hover:shadow-sm transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-t1">{o.name}</p>
                    <p className="text-xs text-t2">{o.plan}</p>
                  </div>
                  <ChevronRight size={16} className="text-muted" />
                </div>
                {healthLoading && !h ? (
                  <p className="text-xs text-t2">Calculando salud GPS…</p>
                ) : !h ? (
                  <p className="text-xs text-t2">No se pudo calcular la salud GPS.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-bg rounded px-2 py-1.5">
                      <p className="text-t2">Vinculados</p>
                      <p className="font-bold text-t1 text-sm">{h.linked}/{h.vehicles}</p>
                    </div>
                    <div className="bg-bg rounded px-2 py-1.5">
                      <p className="text-t2">En línea</p>
                      <p className={`font-bold text-sm ${h.online > 0 ? 'text-ok' : 'text-t1'}`}>{h.online}</p>
                    </div>
                    <div className="bg-bg rounded px-2 py-1.5">
                      <p className="text-t2">Alertas abiertas</p>
                      <p className={`font-bold text-sm ${h.openAlerts > 0 ? 'text-danger' : 'text-t1'}`}>{h.openAlerts}</p>
                    </div>
                    <div className="bg-bg rounded px-2 py-1.5">
                      <p className="text-t2">Bloqueos pendientes</p>
                      <p className={`font-bold text-sm ${h.pendingLocks > 0 ? 'text-warn' : 'text-t1'}`}>{h.pendingLocks}</p>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
          {orgs.length === 0 && <p className="px-4 py-6 text-sm text-t2">Sin asociaciones registradas.</p>}
        </div>
      </div>
    );
  }

  if (historyVehicle) {
    return (
      <div className="p-6 lg:p-8 space-y-5">
        <button onClick={() => setHistoryVehicle(null)} className="flex items-center gap-1.5 text-sm text-t2 hover:text-t1">
          <ArrowLeft size={14} /> Volver a GPS · {selectedOrg.name}
        </button>
        <div>
          <h1 className="text-2xl font-bold text-t1">Recorrido · Unidad {historyVehicle.code}</h1>
          <p className="text-sm text-t2 mt-0.5">{selectedOrg.name} · {historyVehicle.plate}</p>
        </div>
        <GpsRouteHistoryView vehicleId={historyVehicle.id} code={historyVehicle.code} plate={historyVehicle.plate} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <button onClick={() => setSelectedOrg(null)} className="flex items-center gap-1.5 text-sm text-t2 hover:text-t1">
        <ArrowLeft size={14} /> Volver a asociaciones
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-t1">GPS · {selectedOrg.name}</h1>
          <p className="text-sm text-t2 mt-0.5">{vehicles.length} unidad(es)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-bg border border-border rounded-lg p-0.5">
            <button
              onClick={() => setView('tabla')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${view === 'tabla' ? 'bg-surface shadow-sm text-t1' : 'text-t2 hover:text-t1'}`}
            >
              <TableIcon size={13} /> Tabla
            </button>
            <button
              onClick={() => setView('mapa')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${view === 'mapa' ? 'bg-surface shadow-sm text-t1' : 'text-t2 hover:text-t1'}`}
            >
              <MapIcon size={13} /> Mapa en vivo
            </button>
            <button
              onClick={() => setView('alertas')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${view === 'alertas' ? 'bg-surface shadow-sm text-t1' : 'text-t2 hover:text-t1'}`}
            >
              <Bell size={13} /> Alertas
            </button>
            <button
              onClick={() => setView('plan')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${view === 'plan' ? 'bg-surface shadow-sm text-t1' : 'text-t2 hover:text-t1'}`}
            >
              <Wallet size={13} /> Plan GPS Vehicular
            </button>
          </div>
          <button onClick={handleDownloadPdf} disabled={loading || vehicles.length === 0} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50">
            <Download size={14} /> Descargar PDF
          </button>
        </div>
      </div>

      {view === 'mapa' ? (
        <div className="relative bg-surface border border-border rounded-lg overflow-hidden h-[70vh] max-h-[560px] min-h-[360px]">
          <LiveFleetMap positions={positions} config={mapConfig} org={selectedOrg} heightClass="h-full" />
        </div>
      ) : view === 'alertas' ? (
        <div className="bg-surface border border-border rounded-lg overflow-hidden h-[70vh] max-h-[700px] min-h-[420px]">
          <GPSAlertsPage organizationId={selectedOrg.id} />
        </div>
      ) : view === 'plan' ? (
        loading ? (
          <p className="text-sm text-t2">Cargando…</p>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : (
          <div className="space-y-3">
            <div className="bg-surface border border-border rounded-lg px-3.5 py-3 flex items-center gap-3 flex-wrap">
              <label className="text-sm text-t1 font-medium">Días de gracia al bajar de PRO a Operación:</label>
              <input
                type="number"
                min={0}
                max={365}
                value={graceDaysDraft}
                onChange={e => setGraceDaysDraft(Number(e.target.value))}
                className="h-8 w-20 px-2 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handleSaveGraceDays}
                disabled={graceDaysSaving || graceDaysDraft === selectedOrg.gpsVehicularGraceDays}
                className="px-2.5 py-1 text-xs font-medium bg-primary text-white rounded hover:bg-primary-h disabled:opacity-50"
              >
                {graceDaysSaving ? 'Guardando…' : 'Guardar'}
              </button>
              {graceDaysError && <p className="text-xs text-danger w-full">{graceDaysError}</p>}
              <p className="text-xs text-muted w-full">
                Aplica la próxima vez que {selectedOrg.name} baje de PRO a Operación — no cambia la fecha de gracia ya asignada a unidades
                que bajaron antes.
              </p>
            </div>
            {selectedOrg.plan === 'PRO' && (
              <p className="text-sm text-t2 bg-surface border border-border rounded-lg px-3.5 py-2.5">
                {selectedOrg.name} está en Plan PRO: el GPS de toda su flota ya viene incluido, el Plan GPS Vehicular individual no aplica
                (solo es relevante en Plan Operación).
              </p>
            )}
            <div className="bg-surface border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm" aria-label="Plan GPS Vehicular por socio">
                <thead>
                  <tr className="border-b border-border bg-bg">
                    <th className="text-left px-3 py-2.5 text-t2 font-medium">Socio</th>
                    <th className="text-left px-3 py-2.5 text-t2 font-medium">Unidad</th>
                    <th className="text-left px-3 py-2.5 text-t2 font-medium">Equipo</th>
                    <th className="text-left px-3 py-2.5 text-t2 font-medium">Plan GPS Vehicular</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {[...vehicles].sort((a, b) => (a.partnerName || 'zzz').localeCompare(b.partnerName || 'zzz')).map(v => (
                    <Fragment key={v.id}>
                      <tr className="border-b border-border last:border-0 align-top">
                        <td className="px-3 py-2.5">
                          {v.partnerName ? (
                            <div>
                              <p className="font-medium text-t1">{v.partnerName}</p>
                              {v.partnerDni && <p className="text-xs text-muted">DNI {v.partnerDni}</p>}
                            </div>
                          ) : (
                            <span className="text-muted">Sin socio asignado</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-t1">{v.code}</p>
                          <p className="text-xs text-t2">{v.plate}</p>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-t2">{v.traccarDeviceId ?? 'Sin equipo instalado'}</td>
                        <td className="px-3 py-2.5">
                          {selectedOrg.plan === 'PRO' ? (
                            <span className="text-xs text-muted">Incluido en PRO</span>
                          ) : !v.traccarDeviceId ? (
                            <span className="text-xs text-muted">—</span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded w-fit ${v.gpsVehicularActivo !== false ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>
                                {v.gpsVehicularActivo !== false ? 'Activo' : 'Inactivo'}
                              </span>
                              {v.gpsVehicularVenceEn && (
                                <span className="text-[10px] text-muted">Gracia hasta {new Date(v.gpsVehicularVenceEn).toLocaleDateString('es-PE')}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {selectedOrg.plan !== 'PRO' && v.traccarDeviceId && (
                            <button
                              onClick={() => setPlanReasonDraft({ id: v.id, activo: v.gpsVehicularActivo === false, reason: '' })}
                              disabled={planActionId === v.id}
                              className={`px-2.5 py-1 text-xs font-medium border rounded disabled:opacity-50 ${v.gpsVehicularActivo !== false ? 'text-danger border-danger/30 hover:bg-danger/5' : 'text-ok border-ok/30 hover:bg-ok/5'}`}
                            >
                              {v.gpsVehicularActivo !== false ? 'Desactivar plan' : 'Activar plan'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {planReasonDraft?.id === v.id && (
                        <tr className="border-b border-border last:border-0 bg-hover/40">
                          <td colSpan={5} className="px-3 py-3">
                            <div className="space-y-2 max-w-lg">
                              <p className="text-xs text-t2">
                                Motivo para {planReasonDraft.activo ? 'activar' : 'desactivar'} el Plan GPS Vehicular de la unidad {v.code}
                                {planReasonDraft.activo ? ' (ej. referencia del pago recibido)' : ' (ej. no pagó el servicio, motivo del corte)'}:
                              </p>
                              <textarea
                                value={planReasonDraft.reason}
                                onChange={e => setPlanReasonDraft(d => d && { ...d, reason: e.target.value })}
                                placeholder="Motivo…"
                                rows={2}
                                className="w-full px-2.5 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                              <div className="flex gap-1.5">
                                <button
                                  onClick={handlePlanReasonSubmit}
                                  disabled={!planReasonDraft.reason.trim() || planActionId === v.id}
                                  className="px-2.5 py-1 text-xs font-medium bg-primary text-white rounded hover:bg-primary-h disabled:opacity-50"
                                >
                                  {planActionId === v.id ? 'Guardando…' : 'Confirmar'}
                                </button>
                                <button onClick={() => setPlanReasonDraft(null)} className="px-2.5 py-1 text-xs font-medium text-t2 border border-border rounded hover:bg-hover">
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {vehicles.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-t2">Esta asociación no tiene unidades registradas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {planActionError && <p className="text-sm text-danger">{planActionError}</p>}
            <p className="text-xs text-muted">
              Al bajar de PRO a Operación, las unidades con equipo instalado quedan 10 días en gracia (fecha de referencia visible arriba)
              antes de necesitar que el socio pague el servicio aparte — pasado ese plazo, desactívalo aquí si no pagó. Reactivar es un
              clic, sin volver a pedir el IMEI.
            </p>
          </div>
        )
      ) : loading ? (
        <p className="text-sm text-t2">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm" aria-label="GPS por unidad">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-3 py-2.5 text-t2 font-medium">Unidad</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium">Empresa</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium">IMEI</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium">SIM (informativo)</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium">Estado</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium">Bloqueo de motor</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium">Recorrido</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map(v => {
                const device = devices.find(d => d.vehicleId === v.id);
                const statusKey = !v.traccarDeviceId ? 'sin_vincular' : (device?.online ?? 'unknown');
                const activeLock = lockRequests.find(r => r.vehicleId === v.id && ['SOLICITADO', 'CONFIRMADO', 'EJECUTADO'].includes(r.status));
                return (
                  <tr key={v.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-3 py-2.5 font-semibold text-t1">{v.code}</td>
                    <td className="px-3 py-2.5 text-t2">{v.company}</td>
                    <td className="px-3 py-2.5 font-mono text-t2">{v.traccarDeviceId ?? '—'}</td>
                    <td className="px-3 py-2.5 text-t2">
                      {v.simOperator ? v.simOperator.charAt(0) + v.simOperator.slice(1).toLowerCase() : '—'}
                      {v.simNumber ? ` · ${v.simNumber}` : ''}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLE[statusKey]}`}>
                        {STATUS_LABEL[statusKey]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {!activeLock ? (
                        <div className="space-y-1.5">
                          <span className="text-xs text-t2 block">Sin solicitud</span>
                          {v.traccarDeviceId && (
                            <button onClick={() => setReasonDraft({ id: v.id, action: 'direct', reason: '' })} className="px-2 py-1 text-xs font-medium bg-danger text-white rounded hover:opacity-90">
                              Bloquear ahora (llamada del socio)
                            </button>
                          )}
                          {reasonDraft?.id === v.id && reasonDraft.action === 'direct' && (
                            <div className="space-y-1.5 pt-1">
                              <textarea
                                value={reasonDraft.reason}
                                onChange={e => setReasonDraft(d => d && { ...d, reason: e.target.value })}
                                placeholder="Motivo del bloqueo (obligatorio)…"
                                rows={2}
                                className="w-full px-2 py-1 border border-border rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                              <div className="flex gap-1.5">
                                <button onClick={handleReasonSubmit} disabled={!reasonDraft.reason.trim() || actionId === v.id} className="px-2 py-1 text-xs font-medium bg-danger text-white rounded hover:opacity-90 disabled:opacity-50">
                                  {actionId === v.id ? 'Bloqueando…' : 'Confirmar bloqueo'}
                                </button>
                                <button onClick={() => setReasonDraft(null)} className="px-2 py-1 text-xs font-medium text-t2 border border-border rounded hover:bg-hover">Cancelar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${activeLock.status === 'EJECUTADO' ? 'bg-danger text-white' : activeLock.status === 'CONFIRMADO' ? 'bg-warn/10 text-warn' : 'bg-t2/10 text-t2'}`}>
                            {activeLock.status}
                          </span>
                          <p className="text-xs text-t2 max-w-[180px]">{activeLock.requestReason}</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {activeLock.status === 'SOLICITADO' && (
                              <button onClick={() => handleConfirmLock(activeLock.id)} disabled={actionId === activeLock.id} className="px-2 py-1 text-xs font-medium bg-danger text-white rounded hover:opacity-90 disabled:opacity-50">
                                {actionId === activeLock.id ? 'Confirmando…' : 'Confirmar bloqueo'}
                              </button>
                            )}
                            {(activeLock.status === 'SOLICITADO' || activeLock.status === 'CONFIRMADO') && (
                              <button onClick={() => setReasonDraft({ id: activeLock.id, action: 'cancel', reason: '' })} className="px-2 py-1 text-xs font-medium text-t2 border border-border rounded hover:bg-hover">
                                Cancelar
                              </button>
                            )}
                            {activeLock.status === 'EJECUTADO' && (
                              <button onClick={() => setReasonDraft({ id: activeLock.id, action: 'restore', reason: '' })} className="px-2 py-1 text-xs font-medium text-ok border border-ok/30 rounded hover:bg-ok/5">
                                Restaurar
                              </button>
                            )}
                          </div>
                          {reasonDraft?.id === activeLock.id && (
                            <div className="space-y-1.5 pt-1">
                              <textarea
                                value={reasonDraft.reason}
                                onChange={e => setReasonDraft(d => d && { ...d, reason: e.target.value })}
                                placeholder={reasonDraft.action === 'cancel' ? 'Motivo de la cancelación…' : 'Motivo de la restauración…'}
                                rows={2}
                                className="w-full px-2 py-1 border border-border rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                              <div className="flex gap-1.5">
                                <button onClick={handleReasonSubmit} disabled={!reasonDraft.reason.trim() || actionId === activeLock.id} className="px-2 py-1 text-xs font-medium bg-primary text-white rounded hover:bg-primary-h disabled:opacity-50">
                                  {actionId === activeLock.id ? 'Guardando…' : 'Confirmar'}
                                </button>
                                <button onClick={() => setReasonDraft(null)} className="px-2 py-1 text-xs font-medium text-t2 border border-border rounded hover:bg-hover">Cancelar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {v.traccarDeviceId ? (
                        <button
                          onClick={() => setHistoryVehicle(v)}
                          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-primary border border-primary/30 rounded hover:bg-primary/5"
                        >
                          <Route size={12} /> Ver recorrido
                        </button>
                      ) : (
                        <span className="text-xs text-t2">Sin GPS</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {vehicles.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-t2">Esta asociación no tiene unidades registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {actionError && <p className="text-sm text-danger">{actionError}</p>}
    </div>
  );
}
