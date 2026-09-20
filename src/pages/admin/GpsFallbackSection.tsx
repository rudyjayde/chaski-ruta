import { useEffect, useState } from 'react';
import { SatelliteDish, ShieldCheck, XCircle, AlertTriangle } from 'lucide-react';
import { fetchGpsFallbackRequests, resolveGpsFallbackRequest, type GpsFallbackRow, type GpsFallbackStatus } from '../../lib/operacion-api';

const STATUS_STYLE: Record<GpsFallbackStatus, { label: string; cls: string }> = {
  PENDIENTE: { label: 'Pendiente', cls: 'bg-warn/10 text-warn' },
  AUTORIZADO: { label: 'Autorizado', cls: 'bg-teal/10 text-teal' },
  RECHAZADO: { label: 'Rechazado', cls: 'bg-danger/10 text-danger' },
  EXPIRADO: { label: 'Terminó (el GPS volvió a reportar)', cls: 'bg-ok/10 text-ok' },
};

// Desde cuantas solicitudes en 7 dias se avisa de posible desconexion repetida (igual que en el servidor).
const REPEAT_FROM = 4;

function formatTime(value: string): string {
  return new Date(value).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Solicitudes de conductores cuyo GPS de vehiculo no tiene señal y piden usar el GPS de su
 * celular. Nunca se autoriza solo: el administrador decide. Se oculta si nunca hubo solicitudes.
 */
export default function GpsFallbackSection() {
  const [rows, setRows] = useState<GpsFallbackRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = () => fetchGpsFallbackRequests().then(setRows).catch(() => undefined);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(id);
  }, []);

  const resolve = async (id: string, approve: boolean) => {
    setBusyId(id);
    setError('');
    try {
      await resolveGpsFallbackRequest(id, approve);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo resolver la solicitud.');
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) return null;
  const pending = rows.filter(r => r.status === 'PENDIENTE');
  const history = rows.filter(r => r.status !== 'PENDIENTE').slice(0, 10);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-t1 flex items-center gap-2"><SatelliteDish size={18} /> GPS del vehículo sin señal</h2>
        <p className="text-sm text-t2 mt-0.5">
          El conductor pide usar el GPS de su celular ya verificado porque el equipo de su vehículo dejó de reportar. La autorización dura 24 horas o hasta que el equipo vuelva a reportar. Una unidad que lo pide seguido puede tener el equipo desconectado a propósito.
        </p>
      </div>
      {error && <div className="p-3 bg-danger/5 border border-danger/30 rounded-lg text-sm text-danger">{error}</div>}

      {pending.map(r => (
        <div key={r.id} className="border border-warn/40 bg-warn/5 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-warn mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-t1">Unidad {r.vehicleCode} ({r.vehiclePlate}) — {r.driverName}</p>
              <p className="text-sm text-t2 mt-0.5">Pide usar el GPS de su celular · {formatTime(r.createdAt)}</p>
              {r.requestsLast7Days >= REPEAT_FROM && (
                <p className="text-sm text-danger mt-1 font-medium">Atención: {r.requestsLast7Days} solicitudes de esta unidad en los últimos 7 días.</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap pt-1 border-t border-warn/20">
            <button
              onClick={() => resolve(r.id, false)}
              disabled={busyId === r.id}
              className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 h-9 border border-border rounded-lg text-sm font-medium hover:bg-hover disabled:opacity-50"
            >
              <XCircle size={14} /> Rechazar
            </button>
            <button
              onClick={() => resolve(r.id, true)}
              disabled={busyId === r.id}
              className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 h-9 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50"
            >
              <ShieldCheck size={14} /> Autorizar el GPS del celular
            </button>
          </div>
        </div>
      ))}

      {history.length > 0 && (
        <div className="border border-border rounded-lg divide-y divide-border">
          {history.map(r => (
            <div key={r.id} className="p-3.5 flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium text-t1">Unidad {r.vehicleCode} — {r.driverName}</p>
                <p className="text-sm text-t2 mt-0.5">
                  {formatTime(r.createdAt)}
                  {r.resolvedByName && <> · resuelto por {r.resolvedByName}</>}
                  {r.status === 'AUTORIZADO' && r.authorizedUntil && <> · vale hasta {formatTime(r.authorizedUntil)}</>}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded font-semibold flex-shrink-0 ${STATUS_STYLE[r.status].cls}`}>{STATUS_STYLE[r.status].label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
