import { useCallback, useEffect, useState } from 'react';
import { SatelliteDish, Hourglass, CheckCircle2, XCircle } from 'lucide-react';
import { fetchMyGpsFallback, requestGpsFallback, type MyGpsFallback } from '../lib/operacion-api';

const REFRESH_MS = 20000;

/**
 * Aviso del conductor cuando el GPS fisico de su vehiculo no tiene señal (equipo malogrado o
 * desconectado). No cambia solo al celular: pide autorizacion al administrador, que la aprueba o
 * rechaza. No muestra nada si la unidad no tiene GPS fisico o el equipo esta reportando bien.
 */
export default function GpsFallbackNotice() {
  const [state, setState] = useState<MyGpsFallback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setState(await fetchMyGpsFallback());
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (!state || !state.applies || !state.noSignal) return null;

  const ask = async () => {
    setBusy(true);
    setError('');
    try {
      await requestGpsFallback();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud.');
    } finally {
      setBusy(false);
    }
  };

  const status = state.request?.status ?? null;
  const until = state.request?.authorizedUntil
    ? new Date(state.request.authorizedUntil).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  if (status === 'AUTORIZADO') {
    return (
      <div className="border border-ok/40 bg-ok/5 rounded-lg p-4 flex items-start gap-3">
        <CheckCircle2 size={18} className="text-ok mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-t1">Tu administrador autorizó usar el GPS de tu celular</p>
          <p className="text-xs text-t2 mt-0.5">
            Ya puedes inscribirte. Debes estar dentro del radio del terminal. Vale hasta {until} o hasta que el GPS de tu vehículo vuelva a reportar. Repara el equipo cuanto antes.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'PENDIENTE') {
    return (
      <div className="border border-warn/40 bg-warn/5 rounded-lg p-4 flex items-start gap-3">
        <Hourglass size={18} className="text-warn mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-t1">Esperando que tu administrador autorice</p>
          <p className="text-xs text-t2 mt-0.5">Le avisamos que el GPS de tu vehículo no tiene señal. Cuando lo autorice podrás inscribirte con el GPS de tu celular.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-warn/40 bg-warn/5 rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-3">
        {status === 'RECHAZADO' ? <XCircle size={18} className="text-danger mt-0.5 flex-shrink-0" /> : <SatelliteDish size={18} className="text-warn mt-0.5 flex-shrink-0" />}
        <div>
          <p className="text-sm font-semibold text-t1">El GPS de tu vehículo no tiene señal</p>
          <p className="text-xs text-t2 mt-0.5">
            {status === 'RECHAZADO'
              ? 'Tu administrador rechazó la solicitud anterior. Comunícate con él; puedes volver a pedirla.'
              : 'Para inscribirte necesitas que tu administrador autorice usar el GPS de tu celular ya verificado.'}
          </p>
        </div>
      </div>
      <button
        onClick={ask}
        disabled={busy}
        className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors disabled:opacity-50"
      >
        {busy ? 'Enviando…' : 'Pedir autorización para usar el GPS de mi celular'}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
