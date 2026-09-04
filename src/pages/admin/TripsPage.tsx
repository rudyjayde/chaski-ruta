import { useState, useEffect, useCallback } from 'react';
import { Search, MapPin, AlertCircle, Loader2, CheckCircle2, FilePlus2, X } from 'lucide-react';
import { fetchTrips, completeTrip, openManifest, routeLabel } from '../../lib/operacion-api';
import type { Trip, TripStatus } from '../../types';
import { useAdminDemo } from './AdminApp';

const STATUS_STYLE: Record<TripStatus, { label: string; cls: string }> = {
  PROGRAMADO: { label: 'Programado', cls: 'bg-t2/10 text-t2' },
  ACTIVO: { label: 'En ruta', cls: 'bg-ok/10 text-ok' },
  COMPLETADO: { label: 'Completado', cls: 'bg-primary/10 text-primary' },
  CON_INCIDENCIA: { label: 'Con incidencia', cls: 'bg-danger/10 text-danger' },
};

const GPS_STYLE: Record<string, string> = {
  GPS_PRO_DEMO: 'text-ok',
  REGISTRO_MOVIL: 'text-primary',
  SIN_GPS: 'text-muted',
};

export default function TripsPage() {
  const { org } = useAdminDemo();
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Trip | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyTripId, setBusyTripId] = useState<string | null>(null);
  const [manifestTrip, setManifestTrip] = useState<Trip | null>(null);
  const [capacityInput, setCapacityInput] = useState('19');
  const [openingManifest, setOpeningManifest] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await fetchTrips();
      setTrips(list);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar los viajes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleComplete = async (trip: Trip) => {
    setLoadError('');
    setBusyTripId(trip.id);
    try {
      await completeTrip(trip.id);
      await reload();
      setSelected(prev => (prev?.id === trip.id ? null : prev));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo completar el viaje');
    } finally {
      setBusyTripId(null);
    }
  };

  const handleOpenManifest = async () => {
    if (!manifestTrip) return;
    const capacity = Number(capacityInput);
    if (!Number.isInteger(capacity) || capacity <= 0) {
      setLoadError('La capacidad tiene que ser un número entero mayor a 0');
      return;
    }
    setOpeningManifest(true);
    setLoadError('');
    try {
      await openManifest(manifestTrip.id, capacity);
      await reload();
      setManifestTrip(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo abrir el manifiesto');
    } finally {
      setOpeningManifest(false);
    }
  };

  const filtered = trips.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.code.includes(q) || t.plate.toLowerCase().includes(q) || t.driverName.toLowerCase().includes(q);
    const matchStatus = !filterStatus || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const STATUSES: TripStatus[] = ['PROGRAMADO', 'ACTIVO', 'COMPLETADO', 'CON_INCIDENCIA'];

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface">
        <h1 className="text-2xl font-bold text-t1">Viajes</h1>
        <p className="text-sm text-t2 mt-0.5">Jornada {new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
      </div>

      {loadError && (
        <div className="px-6 py-2 bg-danger/5 border-b border-danger/20 text-sm text-danger">{loadError}</div>
      )}

      <div className="px-6 py-3 border-b border-border bg-surface flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Código, placa o conductor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-64"
            aria-label="Buscar viajes"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          {STATUSES.map(s => {
            const count = trips.filter(t => t.status === s).length;
            return count > 0 ? (
              <span key={s} className={`text-xs px-2 py-1 rounded ${STATUS_STYLE[s].cls}`}>
                {STATUS_STYLE[s].label}: {count}
              </span>
            ) : null;
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-t2">
            <Loader2 size={24} className="mb-2 animate-spin" />
            <p className="text-sm">Cargando viajes…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-t2">
            <Search size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Sin resultados</p>
          </div>
        ) : (
        <table className="w-full text-sm" aria-label="Tabla de viajes">
          <thead className="sticky top-0">
            <tr className="border-b border-border bg-bg text-sm">
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Cód.</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Placa</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Conductor</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Empresa</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Ruta</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Salida prog.</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Salida real</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Llegada</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">GPS</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr
                key={t.id}
                className="border-b border-border last:border-0 hover:bg-hover cursor-pointer"
                onClick={() => setSelected(t === selected ? null : t)}
              >
                <td className="px-4 py-3 font-semibold text-t1 text-sm">{t.code}</td>
                <td className="px-4 py-3 font-mono text-t1 text-sm">{t.plate}</td>
                <td className="px-4 py-3 text-t1 text-sm">{t.driverName}</td>
                <td className="px-4 py-3 text-t2 text-sm">{t.company}</td>
                <td className="px-4 py-3 text-t2 text-sm">{routeLabel(t.route, org)}</td>
                <td className="px-4 py-3 font-mono text-t1 text-sm">{t.scheduledDeparture}</td>
                <td className="px-4 py-3 font-mono text-t1 text-sm">{t.actualDeparture ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-t2 text-sm">{t.actualArrival ?? t.scheduledArrival ?? '—'}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={GPS_STYLE[t.gpsStatus] + ' flex items-center gap-1'}>
                    <MapPin size={11} />
                    {t.gpsStatus === 'GPS_PRO_DEMO' ? 'GPS PRO' : t.gpsStatus === 'REGISTRO_MOVIL' ? 'Reg. móvil' : 'Sin GPS'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${STATUS_STYLE[t.status].cls}`}>
                    {STATUS_STYLE[t.status].label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {t.status === 'ACTIVO' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleComplete(t); }}
                        disabled={busyTripId === t.id}
                        className="flex items-center gap-1.5 px-2 py-1 border border-ok text-ok rounded text-xs font-medium hover:bg-ok/5 disabled:opacity-50"
                        title="Marcar como completado — el viaje llegó a destino"
                      >
                        <CheckCircle2 size={12} />
                        Completar
                      </button>
                    )}
                    {!t.manifestId && (
                      <button
                        onClick={e => { e.stopPropagation(); setManifestTrip(t); setCapacityInput(String(t.vehicleType === 'SPRINTER' ? 20 : 15)); }}
                        className="flex items-center gap-1.5 px-2 py-1 border border-primary text-primary rounded text-xs font-medium hover:bg-primary/5"
                        title="Abrir el manifiesto de este viaje"
                      >
                        <FilePlus2 size={12} />
                        Manifiesto
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {selected && selected.incidentNote && (
        <div className="px-6 py-3 border-t border-border bg-danger/5 flex items-start gap-2">
          <AlertCircle size={14} className="text-danger mt-0.5 flex-shrink-0" />
          <p className="text-sm text-danger">{selected.incidentNote}</p>
        </div>
      )}

      {manifestTrip && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-t1">Abrir manifiesto</h3>
              <button onClick={() => setManifestTrip(null)} className="text-muted hover:text-t1" aria-label="Cerrar"><X size={16} /></button>
            </div>
            <p className="text-sm text-t2 mb-4">
              Código {manifestTrip.code} — {manifestTrip.driverName} · {routeLabel(manifestTrip.route, org)}
            </p>
            <label className="block text-sm font-medium text-t1 mb-1">Capacidad vendible <span className="text-danger">*</span></label>
            <input
              type="number"
              min={1}
              value={capacityInput}
              onChange={e => setCapacityInput(e.target.value)}
              className="w-full h-9 px-3 border border-border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setManifestTrip(null)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button
                onClick={handleOpenManifest}
                disabled={openingManifest}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50"
              >
                {openingManifest ? 'Abriendo…' : 'Abrir manifiesto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
