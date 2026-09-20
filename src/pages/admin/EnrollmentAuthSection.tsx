import { useEffect, useState } from 'react';
import { UserCheck, ShieldCheck, XCircle, AlertTriangle } from 'lucide-react';
import {
  fetchEnrollmentAuthRequests, resolveEnrollmentAuthRequest, routeLabel,
  type EnrollmentAuthRow, type EnrollmentAuthStatus,
} from '../../lib/operacion-api';
import { useAdminDemo } from './AdminApp';

const STATUS_STYLE: Record<EnrollmentAuthStatus, { label: string; cls: string }> = {
  PENDIENTE: { label: 'Pendiente', cls: 'bg-warn/10 text-warn' },
  AUTORIZADO: { label: 'Autorizado — falta que se inscriba', cls: 'bg-teal/10 text-teal' },
  RECHAZADO: { label: 'Rechazado', cls: 'bg-danger/10 text-danger' },
  CONSUMIDO: { label: 'Autorizado y ya inscrita', cls: 'bg-ok/10 text-ok' },
  EXPIRADO: { label: 'Vencido', cls: 'bg-muted/10 text-t2' },
};

const TYPE_TEXT = {
  SIN_HISTORIAL: 'La unidad no tiene ningún viaje registrado.',
  NO_COINCIDE: 'Su último viaje no coincide con el terminal donde está (aparece en otro lado sin un viaje de por medio).',
} as const;

const MIN_REASON = 10;

function formatTime(value: string): string {
  return new Date(value).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Unidades que intentaron inscribirse y el sistema no pudo confirmar de donde vienen (sin historial, o su
 * ultimo viaje no calza con el terminal). El administrador autoriza con un MOTIVO obligatorio -- ese motivo
 * lo ven todos los conductores en la campanita cuando la unidad se inscribe -- o rechaza. Se oculta si nunca
 * hubo solicitudes.
 */
export default function EnrollmentAuthSection() {
  const { org } = useAdminDemo();
  const [rows, setRows] = useState<EnrollmentAuthRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const load = () => fetchEnrollmentAuthRequests().then(setRows).catch(() => undefined);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(id);
  }, []);

  const resolve = async (id: string, approve: boolean) => {
    setError('');
    if (approve && reason.trim().length < MIN_REASON) {
      setError(`Escribe el motivo de la autorización (mínimo ${MIN_REASON} letras): lo verán todos los conductores.`);
      return;
    }
    setBusyId(id);
    try {
      await resolveEnrollmentAuthRequest(id, approve, reason.trim());
      setOpenId(null);
      setReason('');
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
        <h2 className="text-lg font-bold text-t1 flex items-center gap-2"><UserCheck size={18} /> Unidades sin historial o que no coinciden</h2>
        <p className="text-sm text-t2 mt-0.5">
          El sistema no pudo confirmar de dónde viene la unidad. Al autorizar escribes el motivo: la unidad entra al final de la cola y todos los conductores lo ven en su campanita.
        </p>
      </div>
      {error && <div className="p-3 bg-danger/5 border border-danger/30 rounded-lg text-sm text-danger">{error}</div>}

      {pending.map(r => (
        <div key={r.id} className="border border-warn/40 bg-warn/5 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-warn mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-t1">Unidad {r.vehicleCode} ({r.vehiclePlate}) — {r.driverName}</p>
              <p className="text-sm text-t2 mt-0.5">Quiere inscribirse en {org ? routeLabel(r.route, org) : r.route} · {formatTime(r.createdAt)}</p>
              <p className="text-sm text-t2 mt-0.5">{TYPE_TEXT[r.type]}</p>
            </div>
          </div>

          {openId === r.id ? (
            <div className="space-y-2 pt-1 border-t border-warn/20">
              <label htmlFor={`enroll-reason-${r.id}`} className="block text-sm font-medium text-t1">
                Motivo (obligatorio al autorizar) — lo verán todos los conductores
              </label>
              <textarea
                id={`enroll-reason-${r.id}`}
                value={reason}
                onChange={e => setReason(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="Ej.: Unidad que llegó de Lima el sábado y empieza en este terminal."
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => { setOpenId(null); setReason(''); setError(''); }}
                  disabled={busyId === r.id}
                  className="px-4 h-9 border border-border rounded-lg text-sm font-medium hover:bg-hover disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => resolve(r.id, false)}
                  disabled={busyId === r.id}
                  className="inline-flex items-center gap-2 px-4 h-9 border border-danger/40 text-danger rounded-lg text-sm font-medium hover:bg-danger/5 disabled:opacity-50"
                >
                  <XCircle size={14} /> Rechazar
                </button>
                <button
                  onClick={() => resolve(r.id, true)}
                  disabled={busyId === r.id}
                  className="inline-flex items-center gap-2 px-4 h-9 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50"
                >
                  <ShieldCheck size={14} /> Autorizar con este motivo
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap pt-1 border-t border-warn/20">
              <button
                onClick={() => { setOpenId(r.id); setReason(''); setError(''); }}
                className="inline-flex items-center gap-2 px-4 h-9 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h"
              >
                <ShieldCheck size={14} /> Revisar y resolver
              </button>
            </div>
          )}
        </div>
      ))}

      {history.length > 0 && (
        <div className="border border-border rounded-lg divide-y divide-border">
          {history.map(r => (
            <div key={r.id} className="p-3.5 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-t1">Unidad {r.vehicleCode} — {r.driverName}</p>
                <p className="text-sm text-t2 mt-0.5">
                  {org ? routeLabel(r.route, org) : r.route} · {formatTime(r.createdAt)}
                  {r.resolvedByName && <> · resuelto por {r.resolvedByName}</>}
                </p>
                {r.resolutionReason && <p className="text-sm text-t2 mt-0.5">Motivo: {r.resolutionReason}</p>}
              </div>
              <span className={`text-xs px-2 py-1 rounded font-semibold flex-shrink-0 ${STATUS_STYLE[r.status].cls}`}>{STATUS_STYLE[r.status].label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
