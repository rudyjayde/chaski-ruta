import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { fetchRouteRisk, fetchOperationalConfig, type RouteRiskPoint, type OperationalConfig } from '../../lib/operacion-api';
import RouteRiskMap from '../../components/RouteRiskMap';

const WINDOW_OPTIONS = [7, 30, 90];

// Mapa de riesgo de ruta (docs/planes/ia-aplicada.md §3.2) -- version basica
// confirmada por Jayde (9 sept 2026) aunque el documento advierte que no
// tiene mucho sentido todavia con una sola flota chica: agrega frenadas
// bruscas y paradas anomalas del historial GPS real de la flota, agrupadas
// por zona. Util recien cuando haya suficiente historial acumulado -- por
// eso el disclaimer es explicito sobre las limitaciones actuales.
export default function RouteRiskPage() {
  const [points, setPoints] = useState<RouteRiskPoint[] | null>(null);
  const [config, setConfig] = useState<OperationalConfig | null>(null);
  const [vehiclesAnalyzed, setVehiclesAnalyzed] = useState(0);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOperationalConfig().then(setConfig).catch(() => { /* se queda con el centro por defecto */ });
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchRouteRisk(days)
      .then((result) => {
        setPoints(result.points);
        setVehiclesAnalyzed(result.vehiclesAnalyzed);
        setError(null);
      })
      .catch((err) => setError(err?.message || 'No se pudo calcular el mapa de riesgo.'))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-t1">Mapa de riesgo de ruta</h1>
            <span className="text-[11px] font-bold bg-ok/10 text-ok px-2 py-0.5 rounded uppercase tracking-wide">PRO</span>
          </div>
          <p className="text-sm text-t2 mt-0.5">Frenadas bruscas y paradas anómalas detectadas por GPS, agrupadas por zona.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {WINDOW_OPTIONS.map((d) => <option key={d} value={d}>Últimos {d} días</option>)}
          </select>
          <button onClick={refresh} className="h-9 px-3 border border-border rounded-lg text-sm text-t2 hover:bg-hover flex items-center gap-1.5">
            <RefreshCw size={13} /> Recalcular
          </button>
        </div>
      </div>

      <div className="mx-6 mt-3 p-3 bg-warn/5 border border-warn/20 rounded-lg flex items-start gap-2 text-sm text-warn">
        <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
        <span>
          Esto agrupa un patrón de velocidad + posición (no un sensor de choque real), y solo cubre unidades con GPS físico
          vinculado. Con una flota chica y poco historial, estos puntos todavía dicen poco — se vuelve más útil con más
          unidades y más tiempo acumulado. La ventana disponible también depende de cuánto historial conserve el servidor GPS.
        </span>
      </div>

      <div className="px-6 py-4 bg-bg flex-shrink-0">
        <div className="relative bg-surface border border-border rounded-lg overflow-hidden h-[60vh] max-h-[520px] min-h-[320px]">
          <RouteRiskMap points={points} config={config} heightClass="h-full" />
          {error && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-danger/10 border border-danger/30 rounded-lg px-4 py-2 text-sm text-danger max-w-md text-center">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-2 border-b border-border bg-surface text-sm text-t2">
        {loading ? 'Calculando…' : `${vehiclesAnalyzed} unidad(es) con GPS analizada(s) · ${points?.length ?? 0} punto(s) de riesgo`}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm" aria-label="Puntos de riesgo">
          <thead className="sticky top-0">
            <tr className="border-b border-border bg-bg">
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Ubicación</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Eventos totales</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Frenadas bruscas</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Paradas anómalas</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Última vez</th>
            </tr>
          </thead>
          <tbody>
            {(points ?? []).map((p, i) => (
              <tr key={`${p.lat}:${p.lng}:${i}`} className="border-b border-border last:border-0 hover:bg-hover">
                <td className="px-4 py-3 font-mono text-t2">
                  <a
                    href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                  </a>
                </td>
                <td className="px-4 py-3 font-bold text-t1">{p.totalEvents}</td>
                <td className="px-4 py-3 text-t1">{p.harshBrakingCount}</td>
                <td className="px-4 py-3 text-t1">{p.anomalousStopCount}</td>
                <td className="px-4 py-3 font-mono text-t2">{new Date(p.lastSeen).toLocaleString('es-PE')}</td>
              </tr>
            ))}
            {(points ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-t2">
                  {loading ? 'Calculando…' : 'Ningún punto de riesgo detectado en esta ventana.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-2 border-t border-border text-[11px] text-muted text-center">
        Evidencia para revisión, no una condena automática — ningún punto aquí sanciona a un conductor o vehículo.
      </div>
    </div>
  );
}
