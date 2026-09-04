import { useEffect, useState } from 'react';
import { Clock, PhoneCall, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import type { DelayedRegistrationRequest } from '../../types';
import { fetchDelayedRegistrationRequests, resolveDelayedRegistrationRequest, routeLabel } from '../../lib/operacion-api';
import { useAdminDemo } from './AdminApp';

const STATUS_STYLE: Record<DelayedRegistrationRequest['status'], { label: string; cls: string }> = {
  PENDIENTE: { label: 'Pendiente', cls: 'bg-warn/10 text-warn' },
  AUTORIZADO: { label: 'Autorizado — falta que se inscriba', cls: 'bg-teal/10 text-teal' },
  RESUELTO: { label: 'Resuelto', cls: 'bg-ok/10 text-ok' },
};

function formatTime(value: string): string {
  return new Date(value).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function DelayedRegistrationsPage() {
  const { org } = useAdminDemo();
  const [requests, setRequests] = useState<DelayedRegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    fetchDelayedRegistrationRequests()
      .then(data => { if (!cancelled) setRequests(data); })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudo cargar las solicitudes.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const resolve = async (id: string, resolution: 'LLAMAR_PREDECESOR' | 'AUTORIZAR_DIRECTO') => {
    setBusyId(id);
    setActionError('');
    try {
      const updated = await resolveDelayedRegistrationRequest(id, resolution);
      setRequests(prev => prev.map(r => (r.id === id ? updated : r)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo resolver la solicitud.');
    } finally {
      setBusyId(null);
    }
  };

  const pending = requests.filter(r => r.status === 'PENDIENTE');
  const rest = requests.filter(r => r.status !== 'PENDIENTE');

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-t1">Inscripción retrasada</h1>
          <p className="text-sm text-t2 mt-0.5">
            Un conductor no puede inscribirse porque la unidad que salió antes que él todavía no se inscribió ni avisó que se quedaba. Resuelve cada caso llamando al predecesor o autorizando la inscripción igual.
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-medium hover:bg-hover"
        >
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {loadError && <div className="p-3 bg-danger/5 border border-danger/30 rounded-lg text-sm text-danger">{loadError}</div>}
      {actionError && <div className="p-3 bg-danger/5 border border-danger/30 rounded-lg text-sm text-danger">{actionError}</div>}

      {loading ? (
        <div className="flex items-center gap-3 text-t2 text-sm py-8 justify-center">
          <RefreshCw size={16} className="animate-spin" />Cargando solicitudes…
        </div>
      ) : requests.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center text-sm text-t2">
          No hay solicitudes de inscripción retrasada por ahora.
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-t2 uppercase tracking-wide">Pendientes ({pending.length})</h2>
              {pending.map(req => (
                <div key={req.id} className="border border-warn/40 bg-warn/5 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className="text-warn mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-t1">
                          Unidad {req.requestingVehicleCode} — {req.requestingDriverName}
                        </p>
                        <p className="text-sm text-t2 mt-0.5">
                          Quiere inscribirse en {org ? routeLabel(req.route, org) : req.route}
                          {req.blockedByVehicleCode && <> — bloqueado porque la unidad <strong className="text-t1">{req.blockedByVehicleCode}</strong> no se ha inscrito todavía</>}
                        </p>
                        <p className="text-sm text-t2 mt-0.5 flex-items-center gap-1"><Clock size={12} />{formatTime(req.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap pt-1 border-t border-warn/20">
                    <button
                      onClick={() => resolve(req.id, 'LLAMAR_PREDECESOR')}
                      disabled={busyId === req.id}
                      className="flex-1 min-w-[220px] inline-flex items-center justify-center gap-2 h-9 border border-border rounded-lg text-sm font-medium hover:bg-hover disabled:opacity-50"
                    >
                      <PhoneCall size={14} /> Ya llamé al predecesor — que marque
                    </button>
                    <button
                      onClick={() => resolve(req.id, 'AUTORIZAR_DIRECTO')}
                      disabled={busyId === req.id}
                      className="flex-1 min-w-[220px] inline-flex items-center justify-center gap-2 h-9 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50"
                    >
                      <ShieldCheck size={14} /> Autorizar inscripción igual
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-t2 uppercase tracking-wide">Historial</h2>
              <div className="border border-border rounded-lg divide-y divide-border">
                {rest.map(req => (
                  <div key={req.id} className="p-3.5 flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-t1">
                        Unidad {req.requestingVehicleCode} — {req.requestingDriverName}
                        {req.blockedByVehicleCode && <span className="text-t2"> (bloqueado por {req.blockedByVehicleCode})</span>}
                      </p>
                      <p className="text-sm text-t2 mt-0.5">
                        {org ? routeLabel(req.route, org) : req.route} · {formatTime(req.createdAt)}
                        {req.resolvedByName && <> · resuelto por {req.resolvedByName}{req.resolvedAt ? ` el ${formatTime(req.resolvedAt)}` : ''}</>}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded font-semibold flex-shrink-0 ${STATUS_STYLE[req.status].cls}`}>{STATUS_STYLE[req.status].label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
