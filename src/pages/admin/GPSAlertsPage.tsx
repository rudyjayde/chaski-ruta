import { useState, useEffect } from 'react';
import { Bell, AlertTriangle, X, Search, CheckCircle, Loader2 } from 'lucide-react';
import { fetchGpsAlerts, updateGpsAlertStatus, type GpsAlert, type GpsAlertType, type GpsAlertStatus } from '../../lib/operacion-api';

const ALERT_TYPE_LABEL: Record<GpsAlertType, string> = {
  DESCONEXION: 'Desconexión',
  MOVIMIENTO_SIN_VIAJE: 'Movimiento sin viaje',
  CORTE_ENERGIA: 'Corte de energía',
  POSIBLE_REMOLQUE: 'Posible remolque',
  BOTON_PANICO: '🆘 Botón de pánico',
  FALLA_REPORTADA: 'Falla reportada por conductor',
  POSIBLE_ACCIDENTE: '🆘 Posible accidente',
  FUERA_DE_RUTA: '🆘 Fuera del corredor autorizado',
};

const ALERT_TYPE_STYLE: Record<GpsAlertType, string> = {
  DESCONEXION: 'bg-danger/10 text-danger',
  MOVIMIENTO_SIN_VIAJE: 'bg-accent/10 text-accent',
  CORTE_ENERGIA: 'bg-danger/10 text-danger',
  POSIBLE_REMOLQUE: 'bg-danger/10 text-danger',
  BOTON_PANICO: 'bg-danger text-white font-bold animate-pulse',
  FALLA_REPORTADA: 'bg-accent/10 text-accent',
  POSIBLE_ACCIDENTE: 'bg-danger text-white font-bold animate-pulse',
  FUERA_DE_RUTA: 'bg-danger text-white font-bold animate-pulse',
};

const STATUS_STYLE: Record<GpsAlertStatus, string> = {
  NUEVA: 'bg-danger/10 text-danger',
  EN_REVISION: 'bg-warn/10 text-warn',
  REVISADA: 'bg-ok/10 text-ok',
  DESCARTADA: 'bg-t2/10 text-t2',
};

// organizationId: presente solo cuando Super Admin reutiliza esta misma
// pantalla dentro de Super Admin -> GPS -> [asociacion] -> Alertas (12 sept
// 2026) -- el administrador normal nunca lo pasa (usa su propia asociacion
// via resolveOrgId en el backend).
export default function GPSAlertsPage({ organizationId }: { organizationId?: string } = {}) {
  const [alerts, setAlerts] = useState<GpsAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<GpsAlert | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    setLoadError('');
    fetchGpsAlerts(organizationId)
      .then(setAlerts)
      .catch(err => setLoadError(err instanceof Error ? err.message : 'No se pudo cargar las alertas GPS'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [organizationId]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const updateStatus = async (id: string, status: Exclude<GpsAlertStatus, 'NUEVA'>, note: string) => {
    setSaving(true);
    try {
      await updateGpsAlertStatus(id, status, note || undefined, organizationId);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, status, reviewNote: note || undefined } : a));
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, status, reviewNote: note || undefined } : null);
      showToast(`Alerta ${status.toLowerCase()}. Registrado en auditoría. Nota: "${note || 'Sin nota'}".`);
      setReviewNote('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar la alerta');
    } finally {
      setSaving(false);
    }
  };

  const filtered = alerts.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.unitCode.includes(q) || a.plate.toLowerCase().includes(q) || a.driver.toLowerCase().includes(q);
    const matchType = !filterType || a.type === filterType;
    const matchStatus = !filterStatus || a.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  const newCount = alerts.filter(a => a.status === 'NUEVA').length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 py-4 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-t2" />
            <h1 className="text-2xl font-bold text-t1">Alertas GPS</h1>
            {newCount > 0 && (
              <span className="text-[11px] font-bold bg-danger text-white px-2 py-0.5 rounded-full">{newCount} nuevas</span>
            )}
          </div>
          <p className="text-sm text-t2 mt-0.5">Toda alerta requiere revisión. No se generan sanciones automáticas.</p>
        </div>
      </div>

      <div className="mx-6 mt-3 p-3 bg-warn/5 border border-warn/20 rounded-lg flex items-start gap-2 text-sm text-warn">
        <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
        <span>Toda alerta requiere revisión manual antes de tomar acciones. No se generan sanciones automáticas. La señal se valida con telemetría recibida — detección automática cada 5 minutos.</span>
      </div>

      {toast && (
        <div className="mx-6 mt-2 p-2.5 bg-ok/5 border border-ok/30 rounded-lg flex items-center gap-2 text-sm text-ok">
          <CheckCircle size={12} />
          {toast}
        </div>
      )}

      {loadError && (
        <div className="mx-6 mt-2 p-2.5 bg-danger/5 border border-danger/20 rounded-lg text-sm text-danger">{loadError}</div>
      )}

      <div className="px-6 py-3 mt-3 border-b border-border bg-surface flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" placeholder="Unidad, placa o conductor…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-56" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Todos los tipos</option>
          {Object.entries(ALERT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Todos los estados</option>
          {['NUEVA', 'EN_REVISION', 'REVISADA', 'DESCARTADA'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-t2 ml-auto">{filtered.length} alertas</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selected ? 'border-r border-border' : ''}`}>
          {loading ? (
            <p className="p-10 text-center text-sm text-t2">Cargando…</p>
          ) : filtered.length === 0 ? (
            <p className="p-10 text-center text-sm text-t2">Sin alertas registradas.</p>
          ) : (
          <table className="w-full text-sm" aria-label="Alertas GPS">
            <thead className="sticky top-0">
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Fecha / Hora</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Unidad</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Conductor</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Tipo</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Descripción</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr
                  key={a.id}
                  className={`border-b border-border last:border-0 hover:bg-hover cursor-pointer ${selected?.id === a.id ? 'bg-hover' : ''}`}
                  onClick={() => setSelected(selected?.id === a.id ? null : a)}
                >
                  <td className="px-4 py-3 font-mono text-t2 whitespace-nowrap">
                    {new Date(a.detectedAt).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 font-bold text-t1">{a.unitCode}</td>
                  <td className="px-4 py-3 text-t1">{a.driver}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${ALERT_TYPE_STYLE[a.type]}`}>
                      {ALERT_TYPE_LABEL[a.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-t2 max-w-[200px] truncate" title={a.description}>{a.description}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${STATUS_STYLE[a.status]}`}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>

        {selected && (
          <aside className="fixed inset-0 z-40 w-full md:static md:inset-auto md:z-auto md:w-80 md:flex-shrink-0 bg-surface p-4 overflow-auto" aria-label="Detalle de alerta">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-t1">Detalle de alerta</h3>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-t1 p-1" aria-label="Cerrar"><X size={16} /></button>
            </div>

            <div className="space-y-3 text-sm">
              <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${ALERT_TYPE_STYLE[selected.type]}`}>
                {ALERT_TYPE_LABEL[selected.type]}
              </span>

              <div className="border border-border rounded-lg divide-y divide-border">
                {[
                  { label: 'Unidad', value: selected.unitCode },
                  { label: 'Placa', value: selected.plate, mono: true },
                  { label: 'Conductor', value: selected.driver },
                  { label: 'Fecha/Hora', value: new Date(selected.detectedAt).toLocaleString('es-PE') },
                  { label: 'Estado', value: selected.status },
                ].map(r => (
                  <div key={r.label} className="flex justify-between px-3 py-2">
                    <span className="text-t2">{r.label}</span>
                    <span className={`text-t1 font-medium ${(r as Record<string, unknown>).mono ? 'font-mono' : ''}`}>{r.value}</span>
                  </div>
                ))}
              </div>

              <div className="p-2.5 border border-border rounded-lg text-t2 leading-relaxed">
                {selected.description}
              </div>

              {selected.reviewNote && (
                <div className="p-2.5 border border-border rounded-lg text-t2 leading-relaxed">
                  <span className="text-t1 font-medium">Nota anterior:</span> {selected.reviewNote}
                </div>
              )}

              <div className="p-2.5 bg-warn/5 border border-warn/20 rounded-lg text-warn">
                Toda alerta requiere revisión manual. No se generan sanciones automáticas.
              </div>

              {selected.status !== 'REVISADA' && selected.status !== 'DESCARTADA' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-t1 mb-1">Nota de revisión</label>
                    <textarea
                      value={reviewNote}
                      onChange={e => setReviewNote(e.target.value)}
                      rows={2}
                      placeholder="Observación del administrador…"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <button
                      disabled={saving}
                      onClick={() => updateStatus(selected.id, 'EN_REVISION', reviewNote)}
                      className="w-full h-8 border border-warn text-warn rounded-lg text-sm hover:bg-warn/5 disabled:opacity-50"
                    >
                      Marcar en revisión
                    </button>
                    <button
                      disabled={saving}
                      onClick={() => updateStatus(selected.id, 'REVISADA', reviewNote)}
                      className="w-full h-8 bg-ok text-white rounded-lg text-sm hover:bg-ok/80 disabled:opacity-50"
                    >
                      Marcar como revisada
                    </button>
                    <button
                      disabled={saving}
                      onClick={() => updateStatus(selected.id, 'DESCARTADA', reviewNote)}
                      className="w-full h-8 border border-border text-t2 rounded-lg text-sm hover:bg-hover disabled:opacity-50"
                    >
                      Descartar
                    </button>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      <div className="px-6 py-2 border-t border-border text-[11px] text-muted text-center">
        GPS PRO — Sin sanciones automáticas. Toda acción queda registrada en auditoría.
      </div>
    </div>
  );
}
