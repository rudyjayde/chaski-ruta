import { useState, useEffect, useCallback } from 'react';
import { Wifi, Search, RefreshCw } from 'lucide-react';
import { fetchGpsLive, fetchOperationalConfig, routeLabel, type LiveVehiclePosition, type OperationalConfig } from '../../lib/operacion-api';
import LiveFleetMap, { ROUTE_COLOR } from '../../components/LiveFleetMap';
import { useAdminDemo } from './AdminApp';

const REFRESH_MS = 15000;

export default function GPSLivePage() {
  const { org } = useAdminDemo();
  const [positions, setPositions] = useState<LiveVehiclePosition[] | null>(null);
  const [config, setConfig] = useState<OperationalConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchOperationalConfig().then(setConfig).catch(() => { /* se queda con el centro por defecto */ });
  }, []);

  const refresh = useCallback(() => {
    fetchGpsLive()
      .then((data) => { setPositions(data); setError(null); })
      .catch((err) => setError(err?.message || 'No se pudo consultar el GPS.'));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const filtered = (positions ?? []).filter((p) => {
    const q = search.toLowerCase();
    return !q || p.code.toLowerCase().includes(q) || p.companyName.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-t1">GPS en vivo</h1>
            <span className="text-[11px] font-bold bg-ok/10 text-ok px-2 py-0.5 rounded uppercase tracking-wide">PRO</span>
          </div>
          <p className="text-sm text-t2 mt-0.5">Solo se muestra una unidad cuando tiene señal GPS real — nunca una posición inventada.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-ok">
          <Wifi size={14} />
          <span>{positions?.length ?? 0} unidades con señal</span>
        </div>
      </div>

      {/* Mapa real (Google Maps) -- mismo componente que el resumen del Inicio.
          En una tarjeta con margen (no a todo el ancho de la pantalla) y con
          mas alto que ancho relativo, para que no se vea como una franja. */}
      <div className="px-6 py-4 bg-bg flex-shrink-0">
        <div className="relative bg-surface border border-border rounded-lg overflow-hidden h-[70vh] max-h-[560px] min-h-[360px]">
          <LiveFleetMap positions={positions} config={config} org={org} heightClass="h-full" />
          {error && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-danger/10 border border-danger/30 rounded-lg px-4 py-2 text-sm text-danger max-w-md text-center">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="px-6 py-3 border-b border-border bg-surface flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" placeholder="Código o empresa…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-64" />
        </div>
        <button onClick={refresh} className="h-9 px-3 border border-border rounded-lg text-sm text-t2 hover:bg-hover flex items-center gap-1.5">
          <RefreshCw size={13} /> Actualizar
        </button>
        <span className="text-sm text-t2 ml-auto">{filtered.length} unidad(es) con GPS</span>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm" aria-label="GPS en vivo">
          <thead className="sticky top-0">
            <tr className="border-b border-border bg-bg">
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Cód.</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Empresa</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Ruta actual</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Velocidad</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Última señal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.vehicleId} className="border-b border-border last:border-0 hover:bg-hover">
                <td className="px-4 py-3 font-bold text-t1">{p.code}</td>
                <td className="px-4 py-3 text-t1">{p.companyName}</td>
                <td className="px-4 py-3">
                  {p.route ? (
                    <span className="text-[11px] px-2 py-0.5 rounded font-medium text-white" style={{ backgroundColor: ROUTE_COLOR[p.route] }}>
                      {routeLabel(p.route, org)}
                    </span>
                  ) : (
                    <span className="text-t2 text-sm">Sin ruta activa</span>
                  )}
                </td>
                <td className="px-4 py-3 text-t1">{p.speedKmh > 0 ? `${p.speedKmh} km/h` : '—'}</td>
                <td className="px-4 py-3 font-mono text-t2">{new Date(p.lastUpdate).toLocaleTimeString('es-PE')}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-t2">
                  {positions === null ? 'Cargando…' : 'Ninguna unidad con señal GPS por ahora.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-2 border-t border-border text-[11px] text-muted text-center">
        Sin señal real: la unidad no aparece. Nunca se inventa una posición.
      </div>
    </div>
  );
}
