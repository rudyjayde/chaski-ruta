import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle, Truck, Clock, Plus, X } from 'lucide-react';
import type { RelocationOrder, RelocationStatus, Unit, QueueEntry } from '../../types';
import {
  fetchRelocations, authorizeRelocation, acceptRelocationUnit, startRelocation, completeRelocation,
  createRelocation, fetchVehicles, fetchQueue, terminalName,
} from '../../lib/operacion-api';
import { useAdminDemo } from './AdminApp';

const STATUS_FLOW: RelocationStatus[] = ['DETECTADO', 'PROPUESTA', 'AUTORIZADA', 'EN_TRASLADO', 'COMPLETADA'];

const STATUS_STYLE: Record<RelocationStatus, { label: string; cls: string }> = {
  DETECTADO: { label: 'Detectado', cls: 'bg-warn/10 text-warn' },
  PROPUESTA: { label: 'Propuesta', cls: 'bg-primary/10 text-primary' },
  AUTORIZADA: { label: 'Autorizada', cls: 'bg-teal/10 text-teal' },
  EN_TRASLADO: { label: 'En traslado', cls: 'bg-accent/20 text-accent' },
  COMPLETADA: { label: 'Completada', cls: 'bg-ok/10 text-ok' },
};

export default function RelocationsPage() {
  const { org } = useAdminDemo();
  const [orders, setOrders] = useState<RelocationOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmReason, setConfirmReason] = useState('');
  const [showProgress, setShowProgress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    fetchRelocations()
      .then(data => {
        if (cancelled) return;
        setOrders(data);
        setSelectedId(prev => (prev && data.some(o => o.id === prev)) ? prev : (data[0]?.id ?? null));
      })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudo cargar las reubicaciones.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const order = orders.find(o => o.id === selectedId) ?? null;

  const applyUpdatedOrder = (updated: RelocationOrder) => {
    setOrders(prev => prev.map(o => (o.id === updated.id ? updated : o)));
    setRefreshKey(k => k + 1);
  };

  const statusIdx = order ? STATUS_FLOW.indexOf(order.status) : -1;
  const canAuthorize = order?.status === 'PROPUESTA';
  const canSimulateAccept = order?.status === 'AUTORIZADA';
  const canComplete = order?.status === 'EN_TRASLADO';

  const handleAuthorize = async () => {
    if (!confirmReason || !order) return;
    setBusy(true);
    setActionError('');
    try {
      const updated = await authorizeRelocation(order.id);
      applyUpdatedOrder(updated);
      setShowConfirm(false);
      setConfirmReason('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo autorizar la reubicación.');
    } finally {
      setBusy(false);
    }
  };

  const simulateAcceptance = async () => {
    if (!order) return;
    setShowProgress(true);
    setActionError('');
    try {
      let updated = order;
      for (const unit of order.units) {
        if (unit.vehicleId) {
          updated = await acceptRelocationUnit(order.id, unit.vehicleId);
        }
      }
      updated = await startRelocation(order.id);
      applyUpdatedOrder(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo simular la aceptación.');
    } finally {
      setShowProgress(false);
    }
  };

  const handleComplete = async () => {
    if (!order) return;
    setBusy(true);
    setActionError('');
    try {
      const updated = await completeRelocation(order.id);
      applyUpdatedOrder(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo completar la reubicación.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-t1">Reubicaciones</h1>
          <p className="text-sm text-t2 mt-0.5">{orders.length} {orders.length === 1 ? 'orden registrada' : 'órdenes registradas'}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h"
        >
          <Plus size={14} /> Nueva reubicación
        </button>
      </div>

      {loadError && (
        <div className="px-4 py-3 bg-danger/5 border border-danger/20 rounded-lg text-sm text-danger">{loadError}</div>
      )}

      {loading ? (
        <div className="p-10 text-center text-sm text-t2">Cargando reubicaciones…</div>
      ) : orders.length === 0 ? (
        <div className="p-10 text-center text-sm text-t2">No hay reubicaciones registradas.</div>
      ) : (
        <>
          {/* Order selector */}
          {orders.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {orders.map(o => (
                <button
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className={`text-left flex-shrink-0 w-56 border rounded-lg px-3 py-2.5 transition-colors ${
                    selectedId === o.id ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-hover'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-t1">{o.internalOrder}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLE[o.status].cls}`}>
                      {STATUS_STYLE[o.status].label}
                    </span>
                  </div>
                  <p className="text-xs text-t2 mt-1">{terminalName(o.fromTerminal, org)} → {terminalName(o.toTerminal, org)}</p>
                </button>
              ))}
            </div>
          )}

          {order && (
            <>
              {/* Progress steps */}
              <div className="bg-surface border border-border rounded-lg p-4">
                <div className="flex items-center gap-2">
                  {STATUS_FLOW.map((s, i) => (
                    <div key={s} className="flex items-center gap-2 flex-1">
                      <div className={`flex flex-col items-center flex-1`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                          i < statusIdx ? 'bg-ok text-white' :
                          i === statusIdx ? 'bg-primary text-white' :
                          'bg-border text-muted'
                        }`}>
                          {i < statusIdx ? <CheckCircle size={14} /> : i + 1}
                        </div>
                        <span className={`text-[11px] mt-1 text-center leading-tight ${i === statusIdx ? 'text-primary font-medium' : 'text-t2'}`}>
                          {STATUS_STYLE[s].label}
                        </span>
                      </div>
                      {i < STATUS_FLOW.length - 1 && (
                        <div className={`h-0.5 flex-1 mb-4 ${i < statusIdx ? 'bg-ok' : 'bg-border'}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Order details */}
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-t1">{order.internalOrder}</h3>
                    <p className="text-sm text-t2 mt-0.5">Creado {new Date(order.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_STYLE[order.status].cls}`}>
                    {STATUS_STYLE[order.status].label}
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {/* Route */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex-1 border border-border rounded-lg p-3 text-center">
                      <p className="text-sm text-t2 mb-1">Origen</p>
                      <p className="font-semibold text-t1">{terminalName(order.fromTerminal, org)}</p>
                    </div>
                    <ArrowRight size={20} className="text-muted flex-shrink-0" />
                    <div className="flex-1 border border-border rounded-lg p-3 text-center">
                      <p className="text-sm text-t2 mb-1">Destino</p>
                      <p className="font-semibold text-t1">{terminalName(order.toTerminal, org)}</p>
                    </div>
                  </div>

                  {/* Alert */}
                  <div className="bg-warn/5 border border-warn/30 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle size={14} className="text-warn mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-t1">{order.reason}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-t2">Ventana horaria</span>
                      <p className="font-medium text-t1 flex items-center gap-1 mt-0.5"><Clock size={12} /> {order.window}</p>
                    </div>
                    <div>
                      <span className="text-t2">Compensación</span>
                      <p className="font-medium text-warn mt-0.5">Compensación pendiente de configuración</p>
                    </div>
                  </div>

                  {/* Units */}
                  <div>
                    <h4 className="text-sm font-semibold text-t2 uppercase tracking-wide mb-2">Unidades asignadas</h4>
                    <div className="space-y-2">
                      {order.units.map(u => (
                        <div key={u.code} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5">
                          <Truck size={15} className={u.accepted ? 'text-ok' : 'text-muted'} />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-t1">Código {u.code}</span>
                            <span className="text-sm text-t2 ml-2 font-mono">{u.plate}</span>
                          </div>
                          <span className="text-sm text-t2">{u.driverName}</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded ${u.accepted ? 'bg-ok/10 text-ok' : 'bg-t2/10 text-t2'}`}>
                            {u.accepted ? 'Aceptado' : 'Pendiente'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-sm text-t2 border-t border-border pt-3">
                    <strong className="text-t1">Importante:</strong> Los vehículos que ya esperan en {terminalName(order.toTerminal, org)} conservan su posición en la cola. La compensación se registra y no altera el orden de la cola de destino.
                  </p>
                </div>

                {actionError && (
                  <div className="mx-4 mb-3 p-3 bg-danger/5 border border-danger/30 rounded-lg text-sm text-danger">{actionError}</div>
                )}

                {/* Actions */}
                {(canAuthorize || canSimulateAccept || canComplete) && (
                  <div className="px-4 pb-4 flex gap-3">
                    {canAuthorize && (
                      <button
                        onClick={() => setShowConfirm(true)}
                        disabled={busy}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-60"
                      >
                        <CheckCircle size={14} /> Autorizar reubicación
                      </button>
                    )}
                    {canSimulateAccept && (
                      <button
                        onClick={simulateAcceptance}
                        disabled={showProgress}
                        className="flex items-center gap-2 px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
                      >
                        {showProgress ? 'Simulando aceptación…' : 'Simular aceptación del conductor'}
                      </button>
                    )}
                    {canComplete && (
                      <button
                        onClick={handleComplete}
                        disabled={busy}
                        className="flex items-center gap-2 px-4 py-2 bg-ok text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
                      >
                        <CheckCircle size={14} /> Marcar completada
                      </button>
                    )}
                  </div>
                )}

                {order.status === 'COMPLETADA' && (
                  <div className="mx-4 mb-4 p-3 bg-ok/5 border border-ok/30 rounded-lg flex items-center gap-2">
                    <CheckCircle size={14} className="text-ok" />
                    <p className="text-sm text-ok font-medium">Reubicación completada. Los vehículos están en {terminalName(order.toTerminal, org)} listos para operar.</p>
                  </div>
                )}
              </div>

              {/* Confirm authorize modal */}
              {showConfirm && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
                  <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
                    <h3 className="text-base font-semibold text-t1 mb-2">Autorizar reubicación</h3>
                    <p className="text-sm text-t2 mb-4">
                      Códigos {order.units.map(u => u.code).join(', ')} se trasladarán vacíos {terminalName(order.fromTerminal, org)} → {terminalName(order.toTerminal, org)}. Ventana: {order.window}. Compensación: {order.compensation}.
                    </p>
                    <label className="block text-sm font-medium text-t1 mb-1">Motivo de autorización <span className="text-danger">*</span></label>
                    <textarea
                      value={confirmReason}
                      onChange={e => setConfirmReason(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none mb-4"
                      placeholder="Justificación de la decisión…"
                    />
                    {actionError && <p className="text-sm text-danger mb-3">{actionError}</p>}
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setShowConfirm(false)} disabled={busy} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover disabled:opacity-60">Cancelar</button>
                      <button onClick={handleAuthorize} disabled={!confirmReason || busy} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50">
                        {busy ? 'Autorizando…' : 'Confirmar autorización'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {showCreate && (
        <NewRelocationForm
          org={org}
          onClose={() => setShowCreate(false)}
          onCreated={created => {
            setOrders(prev => [created, ...prev]);
            setSelectedId(created.id);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function NewRelocationForm({
  org,
  onClose,
  onCreated,
}: {
  org: ReturnType<typeof useAdminDemo>['org'];
  onClose: () => void;
  onCreated: (order: RelocationOrder) => void;
}) {
  const [fromTerminal, setFromTerminal] = useState<'JULI' | 'PUNO'>('PUNO');
  const toTerminal: 'JULI' | 'PUNO' = fromTerminal === 'JULI' ? 'PUNO' : 'JULI';
  const [reason, setReason] = useState('');
  const [windowLabel, setWindowLabel] = useState('');
  const [compensation, setCompensation] = useState('Vacío/sin cobro (viaje sin pasajeros)');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [vehicles, setVehicles] = useState<Unit[]>([]);
  const [queuedHere, setQueuedHere] = useState<QueueEntry[]>([]);
  const [queuedThere, setQueuedThere] = useState<QueueEntry[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setSelectedIds([]);
    const sourceRoute = fromTerminal === 'JULI' ? 'JULI_PUNO' : 'PUNO_JULI';
    const oppositeRoute = fromTerminal === 'JULI' ? 'PUNO_JULI' : 'JULI_PUNO';
    Promise.all([fetchVehicles(), fetchQueue(sourceRoute), fetchQueue(oppositeRoute)])
      .then(([v, qHere, qThere]) => {
        if (cancelled) return;
        setVehicles(v);
        setQueuedHere(qHere);
        setQueuedThere(qThere);
      })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la información.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fromTerminal]);

  const vehicleIdByCode = new Map(vehicles.map(v => [v.code, v.id]));
  const queuedCodesEverywhere = new Set([...queuedHere, ...queuedThere].map(e => e.code));
  const idle = vehicles.filter(v => v.status === 'ACTIVO' && !queuedCodesEverywhere.has(v.code));

  const toggle = (vehicleId: string) => {
    setSelectedIds(prev => (prev.includes(vehicleId) ? prev.filter(id => id !== vehicleId) : [...prev, vehicleId]));
  };

  const canSubmit = selectedIds.length > 0 && reason.trim().length >= 5 && windowLabel.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const created = await createRelocation({ fromTerminal, toTerminal, reason, windowLabel, compensation, vehicleIds: selectedIds });
      onCreated(created);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo crear la reubicación');
    } finally {
      setSubmitting(false);
    }
  };

  const renderPickRow = (label: string, sub: string, vehicleId: string | undefined) => {
    if (!vehicleId) return null;
    const idx = selectedIds.indexOf(vehicleId);
    const picked = idx >= 0;
    return (
      <button
        key={vehicleId}
        type="button"
        onClick={() => toggle(vehicleId)}
        className={`w-full flex items-center gap-3 border rounded-lg px-3 py-2.5 text-left transition-colors ${
          picked ? 'border-primary bg-primary/5' : 'border-border hover:bg-hover'
        }`}
      >
        <span className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
          picked ? 'bg-primary text-white' : 'bg-border text-muted'
        }`}>
          {picked ? idx + 1 : <Truck size={12} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-t1 truncate">{label}</p>
          <p className="text-sm text-t2 truncate">{sub}</p>
        </div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-t1">Nueva reubicación</h3>
          <button onClick={onClose} className="text-muted hover:text-t1" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <div className="flex-1">
            <label className="block text-t2 mb-1">Desde</label>
            <select
              value={fromTerminal}
              onChange={e => setFromTerminal(e.target.value as 'JULI' | 'PUNO')}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="JULI">{terminalName('JULI', org)}</option>
              <option value="PUNO">{terminalName('PUNO', org)}</option>
            </select>
          </div>
          <ArrowRight size={18} className="text-muted mt-5 flex-shrink-0" />
          <div className="flex-1">
            <label className="block text-t2 mb-1">Hacia</label>
            <div className="px-3 py-2 border border-border rounded-lg bg-bg/50 text-t1">{terminalName(toTerminal, org)}</div>
          </div>
        </div>

        {loadError && <p className="text-sm text-danger">{loadError}</p>}
        {loading ? (
          <p className="text-sm text-t2 py-4 text-center">Cargando unidades…</p>
        ) : (
          <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
            <div>
              <h4 className="text-sm font-semibold text-t2 uppercase tracking-wide mb-2">
                En cola de regreso en {terminalName(fromTerminal, org)} ({queuedHere.length})
              </h4>
              <div className="space-y-1.5">
                {queuedHere.length === 0 && <p className="text-sm text-t2">No hay unidades en esa cola ahora mismo.</p>}
                {queuedHere.map(e => renderPickRow(`Código ${e.code}`, `${e.plate} · ${e.driverName || 'Sin conductor'} · posición ${e.position}`, vehicleIdByCode.get(e.code)))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-t2 uppercase tracking-wide mb-2">
                Fuera de ruta hoy ({idle.length})
              </h4>
              <div className="space-y-1.5">
                {idle.length === 0 && <p className="text-sm text-t2">No hay unidades fuera de ruta ahora mismo.</p>}
                {idle.map(v => renderPickRow(`Código ${v.code}`, `${v.plate} · ${v.currentDriverName || 'Sin conductor'}`, v.id))}
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-t1 mb-1">Motivo <span className="text-danger">*</span></label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder={`Ej: ${terminalName(toTerminal, org)} se quedó sin unidades y hay pasajeros esperando`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Ventana horaria <span className="text-danger">*</span></label>
            <input
              value={windowLabel}
              onChange={e => setWindowLabel(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Ej: hoy antes de las 3pm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Compensación</label>
            <input
              value={compensation}
              onChange={e => setCompensation(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {submitError && <p className="text-sm text-danger">{submitError}</p>}
        <div className="flex gap-3 justify-end pt-2 border-t border-border">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover disabled:opacity-60">Cancelar</button>
          <button onClick={handleSubmit} disabled={!canSubmit} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50">
            {submitting ? 'Creando…' : `Proponer reubicación (${selectedIds.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
