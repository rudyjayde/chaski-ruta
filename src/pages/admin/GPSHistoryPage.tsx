import { useState, useEffect } from 'react';
import { Search, History, MapPin, Loader2, AlertCircle } from 'lucide-react';
import { fetchVehicles, fetchTrips, fetchGpsHistory, routeLabel, type GpsHistoryPoint, type Organization } from '../../lib/operacion-api';
import { localDateStr } from '../../lib/dates';
import type { Unit, Trip } from '../../types';
import { useAdminDemo } from './AdminApp';

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Umbral de "posible perdida de señal" entre dos fixes consecutivos -- mismo
// espiritu que accident-detection.service.ts (heuristica declarada, no un
// evento de desconexion real reportado por el dispositivo).
const SIGNAL_GAP_MINUTES = 15;

function TripDetail({ trip, unit, org, onClose }: { trip: Trip; unit: Unit | undefined; org: Organization | null; onClose: () => void }) {
  const [points, setPoints] = useState<GpsHistoryPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!trip.vehicleId || !trip.actualDepartureISO) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchGpsHistory(trip.vehicleId, trip.actualDepartureISO, trip.actualArrivalISO ?? new Date().toISOString())
      .then(list => { if (!cancelled) setPoints(list); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el recorrido'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [trip.vehicleId, trip.actualDepartureISO, trip.actualArrivalISO]);

  const distanceKm = points && points.length > 1
    ? points.reduce((sum, p, i) => i === 0 ? 0 : sum + haversineMeters(points[i - 1], p), 0) / 1000
    : null;

  let maxGapMinutes = 0;
  if (points && points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const gap = (new Date(points[i].fixTime).getTime() - new Date(points[i - 1].fixTime).getTime()) / 60000;
      if (gap > maxGapMinutes) maxGapMinutes = gap;
    }
  }

  return (
    <aside className="fixed inset-0 z-40 w-full md:static md:inset-auto md:z-auto md:w-72 md:flex-shrink-0 bg-surface p-4 overflow-auto border-l border-border" aria-label="Detalle del recorrido">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-t1">Recorrido GPS — Unidad {trip.code}</h3>
        <button onClick={onClose} className="text-muted hover:text-t1 text-sm">✕</button>
      </div>
      {!unit?.traccarDeviceId ? (
        <p className="text-sm text-t2">Esta unidad no tiene dispositivo GPS vinculado — sin historial de posiciones real disponible.</p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-t2"><Loader2 size={14} className="animate-spin" /> Cargando…</div>
      ) : error ? (
        <div className="bg-danger/10 text-danger text-sm px-3 py-2.5 rounded-lg flex items-center gap-2"><AlertCircle size={13} /> {error}</div>
      ) : !points || points.length === 0 ? (
        <p className="text-sm text-t2">Traccar no reportó posiciones para este viaje.</p>
      ) : (
        <div className="space-y-2 text-sm">
          {[
            { label: 'Ruta', value: routeLabel(trip.route, org) },
            { label: 'Inicio', value: trip.actualDeparture ?? trip.scheduledDeparture },
            { label: 'Fin', value: trip.actualArrival ?? 'En curso' },
            { label: 'Puntos GPS registrados', value: String(points.length) },
            { label: 'Distancia recorrida (estimada)', value: distanceKm != null ? `${distanceKm.toFixed(1)} km` : '—' },
          ].map(r => (
            <div key={r.label} className="flex justify-between border-b border-border pb-1">
              <span className="text-t2">{r.label}</span>
              <span className="font-medium text-t1">{r.value}</span>
            </div>
          ))}
          {maxGapMinutes > SIGNAL_GAP_MINUTES && (
            <div className="mt-3 p-2.5 bg-warn/5 border border-warn/20 rounded-lg text-sm text-warn">
              Posible pérdida de señal: hubo un vacío de {Math.round(maxGapMinutes)} min sin reportar posición. Sin posición inventada — se conserva el último punto conocido.
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

export default function GPSHistoryPage() {
  const { org } = useAdminDemo();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => localDateStr(new Date(Date.now() - 3 * 86400000)));
  const [dateTo, setDateTo] = useState(() => localDateStr());
  const [unitFilter, setUnitFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const [units, setUnits] = useState<Unit[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchVehicles(), fetchTrips()])
      .then(([u, t]) => { if (!cancelled) { setUnits(u); setTrips(t); } })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el historial GPS'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const unitsWithGps = units.filter(u => u.traccarDeviceId);
  const unitByCode = new Map(units.map(u => [u.code, u]));

  const filtered = trips.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.code.includes(q) || t.plate.toLowerCase().includes(q) || t.driverName.toLowerCase().includes(q);
    const matchUnit = !unitFilter || t.code === unitFilter;
    const tripDate = (t.actualDepartureISO ?? t.scheduledDepartureISO ?? '').slice(0, 10);
    const matchDate = !tripDate || (tripDate >= dateFrom && tripDate <= dateTo);
    const hasGps = Boolean(unitByCode.get(t.code)?.traccarDeviceId);
    return matchSearch && matchUnit && matchDate && hasGps;
  });

  const selectedTrip = trips.find(t => t.id === selected);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center gap-2">
        <History size={16} className="text-t2" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-t1">Historial GPS</h1>
            <span className="text-[11px] font-bold bg-ok/10 text-ok px-2 py-0.5 rounded uppercase tracking-wide">PRO</span>
          </div>
          <p className="text-sm text-t2 mt-0.5">Viajes reales de unidades con GPS vinculado, por fecha.</p>
        </div>
      </div>

      <div className="px-4 md:px-6 py-3 border-b border-border bg-surface flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" placeholder="Unidad, placa o conductor…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-56" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-t2">
          <span>Desde</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <span>hasta</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <select value={unitFilter} onChange={e => setUnitFilter(e.target.value)} className="h-9 px-3 max-w-full border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Todas las unidades con GPS</option>
          {unitsWithGps.map(u => <option key={u.id} value={u.code}>{u.code} — {u.plate}</option>)}
        </select>
        <span className="text-sm text-t2 ml-auto">{filtered.length} registros</span>
      </div>

      {loadError && (
        <div className="px-6 py-3 bg-danger/5 border-b border-danger/20 text-sm text-danger">{loadError}</div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selectedTrip ? 'border-r border-border' : ''}`}>
          {loading ? (
            <p className="p-10 text-center text-sm text-t2">Cargando…</p>
          ) : unitsWithGps.length === 0 ? (
            <p className="p-10 text-center text-sm text-t2">Ninguna unidad tiene un dispositivo GPS vinculado todavía.</p>
          ) : (
          <table className="w-full text-sm" aria-label="Historial GPS">
            <thead className="sticky top-0">
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Fecha</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Unidad</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Conductor</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Ruta</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Inicio</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Fin</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr
                  key={t.id}
                  className={`border-b border-border last:border-0 hover:bg-hover cursor-pointer ${selected === t.id ? 'bg-hover' : ''}`}
                  onClick={() => setSelected(selected === t.id ? null : t.id)}
                >
                  <td className="px-4 py-3 font-mono text-t2">{(t.actualDepartureISO ?? t.scheduledDepartureISO ?? '').slice(0, 10) || '—'}</td>
                  <td className="px-4 py-3 font-bold text-t1">{t.code}</td>
                  <td className="px-4 py-3 text-t1">{t.driverName}</td>
                  <td className="px-4 py-3 text-t2">{routeLabel(t.route, org)}</td>
                  <td className="px-4 py-3 font-mono text-t1">{t.actualDeparture ?? t.scheduledDeparture}</td>
                  <td className="px-4 py-3 font-mono text-t1">{t.actualArrival ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                      t.status === 'CON_INCIDENCIA' ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>

        {selectedTrip && <TripDetail trip={selectedTrip} unit={unitByCode.get(selectedTrip.code)} org={org} onClose={() => setSelected(null)} />}
      </div>

      <div className="px-6 py-2 border-t border-border text-[11px] text-muted text-center">
        GPS PRO — Sin señal: no se inventa posición. Se conserva la última posición registrada.
      </div>
    </div>
  );
}
