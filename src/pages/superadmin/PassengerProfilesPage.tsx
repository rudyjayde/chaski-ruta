import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ArrowLeft, Search, Repeat, List, LayoutGrid } from 'lucide-react';
import {
  fetchOrganizations, fetchPassengerProfiles, fetchPassengerDashboard,
  type Organization, type PassengerProfile, type PassengerDashboard,
} from '../../lib/operacion-api';

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  YAPE: 'Yape',
  PLIN: 'Plin',
  TRANSFERENCIA: 'Transferencia',
  QR: 'QR',
};

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' });
}

/** Barra horizontal animada (ancho proporcional al máximo) -- lo mas cercano
 * a un "bar chart race" sin agregar una libreria de graficos entera para un
 * puñado de metricas. Anima de 0 al valor real al montar. */
function RankedBars({ items, colorClass = 'bg-primary' }: { items: { label: string; value: number; sublabel?: string }[]; colorClass?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, [items]);
  const max = Math.max(1, ...items.map(i => i.value));
  if (items.length === 0) return <p className="text-sm text-t2">Sin datos todavía.</p>;
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={item.label + i} className="flex items-center gap-3">
          <div className="w-40 shrink-0 text-xs text-t1 font-medium truncate" title={item.label}>{item.label}</div>
          <div className="flex-1 h-6 bg-bg rounded overflow-hidden">
            <div
              className={`h-full ${colorClass} rounded transition-all duration-700 ease-out`}
              style={{ width: mounted ? `${(item.value / max) * 100}%` : '0%' }}
            />
          </div>
          <div className="w-28 shrink-0 text-xs text-t2 text-right">{item.sublabel ?? item.value}</div>
        </div>
      ))}
    </div>
  );
}

/** Columnas mensuales apiladas (nuevos vs recurrentes), animadas al montar. */
function MonthlyStackedBars({ data }: { data: { month: string; newCount: number; recurrentCount: number }[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, [data]);
  const max = Math.max(1, ...data.map(d => d.newCount + d.recurrentCount));
  if (data.length === 0) return <p className="text-sm text-t2">Sin datos todavía.</p>;
  return (
    <div>
      <div className="flex items-end gap-2 h-40">
        {data.map(d => {
          const total = d.newCount + d.recurrentCount;
          const heightPct = mounted ? (total / max) * 100 : 0;
          const newPct = total === 0 ? 0 : (d.newCount / total) * 100;
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
              <div className="w-full flex-1 flex flex-col justify-end">
                <div className="w-full rounded-t overflow-hidden flex flex-col justify-end transition-all duration-700 ease-out" style={{ height: `${heightPct}%` }}>
                  <div className="w-full bg-ok" style={{ height: `${100 - newPct}%` }} />
                  <div className="w-full bg-primary" style={{ height: `${newPct}%` }} />
                </div>
              </div>
              <span className="text-[10px] text-t2">{monthLabel(d.month)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-t2">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" /> Nuevos</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok inline-block" /> Recurrentes</span>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <p className="text-xs text-t2">{label}</p>
      <p className="text-2xl font-bold text-t1 mt-1">{value}</p>
    </div>
  );
}

function PassengerDashboardView({ dashboard, loading, error }: { dashboard: PassengerDashboard | null; loading: boolean; error: string }) {
  if (loading) return <p className="text-sm text-t2">Calculando dashboard…</p>;
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!dashboard) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Pasajeros conocidos" value={String(dashboard.totals.uniquePassengers)} />
        <KpiCard label="Recurrentes (2+ viajes)" value={String(dashboard.totals.recurrentPassengers)} />
        <KpiCard label="Con correo guardado" value={String(dashboard.totals.withEmail)} />
        <KpiCard label="Días promedio entre viajes" value={dashboard.avgDaysBetweenTrips == null ? '—' : `${dashboard.avgDaysBetweenTrips} d`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-t1 mb-3">Pasajeros con más viajes</h3>
          <RankedBars items={dashboard.topByTrips.map(p => ({ label: p.name, value: p.tripCount, sublabel: `${p.tripCount} viaje(s)` }))} />
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-t1 mb-3">Pasajeros que más ingresos generaron</h3>
          <RankedBars
            items={dashboard.topByRevenue.map(p => ({ label: p.name, value: p.totalFare, sublabel: `S/ ${p.totalFare.toFixed(2)}` }))}
            colorClass="bg-ok"
          />
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-t1 mb-3">Método de pago preferido</h3>
          <RankedBars
            items={dashboard.paymentMethods.map(p => ({ label: PAYMENT_METHOD_LABEL[p.method] ?? p.method, value: p.count, sublabel: `${p.count} · S/ ${p.totalFare.toFixed(2)}` }))}
            colorClass="bg-warn"
          />
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-t1 mb-3">Dirección de viaje preferida</h3>
          <RankedBars items={dashboard.directions.map(d => ({ label: d.label, value: d.count }))} colorClass="bg-primary" />
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-t1 mb-3">Pasajeros nuevos vs recurrentes por mes</h3>
          <MonthlyStackedBars data={dashboard.monthly} />
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-t1 mb-3">% con correo guardado, por mes de viaje</h3>
          <RankedBars items={dashboard.emailCaptureByMonth.map(e => ({ label: monthLabel(e.month), value: e.pct, sublabel: `${e.pct}%` }))} colorClass="bg-ok" />
          <p className="text-[11px] text-muted mt-3">Calculado con el estado actual del correo guardado de cada pasajero, no con lo que tenía guardado en ese momento.</p>
        </div>
      </div>
    </div>
  );
}

// CRM de pasajeros (12 sept 2026, decidido con Jayde): lista de las
// asociaciones reales -> entrar a una -> pasajeros conocidos por DNI, con
// cuántas veces viajó y su correo (si alguna vez un conductor lo guardó), y
// un dashboard con lo que más se puede analizar de datos reales (ranking de
// viajes, ingresos, metodo de pago, direccion preferida, nuevos vs
// recurrentes por mes, captura de correo) -- nada inventado, todo calculado
// del backend a partir de manifiestos reales.
export default function PassengerProfilesPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [view, setView] = useState<'lista' | 'dashboard'>('lista');
  const [profiles, setProfiles] = useState<PassengerProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dashboard, setDashboard] = useState<PassengerDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');

  useEffect(() => {
    fetchOrganizations().then(setOrgs).catch(() => { /* se degrada a lista vacia */ });
  }, []);

  const loadProfiles = useCallback((org: Organization) => {
    setLoading(true);
    setError('');
    fetchPassengerProfiles(org.id)
      .then(setProfiles)
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo cargar los pasajeros.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectOrg = (org: Organization) => {
    setSelectedOrg(org);
    setSearch('');
    setView('lista');
    setDashboard(null);
    loadProfiles(org);
  };

  // Carga el dashboard recien cuando se abre esa pestaña (evita el calculo
  // mas pesado -- trae todas las filas de Passenger -- si nunca se mira).
  useEffect(() => {
    if (!selectedOrg || view !== 'dashboard' || dashboard) return;
    setDashboardLoading(true);
    setDashboardError('');
    fetchPassengerDashboard(selectedOrg.id)
      .then(setDashboard)
      .catch(err => setDashboardError(err instanceof Error ? err.message : 'No se pudo calcular el dashboard.'))
      .finally(() => setDashboardLoading(false));
  }, [selectedOrg, view, dashboard]);

  const filtered = profiles.filter(p => {
    const q = search.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.dni.includes(q) || (p.email ?? '').toLowerCase().includes(q);
  });
  const recurrentCount = profiles.filter(p => p.tripCount >= 2).length;
  const withEmailCount = profiles.filter(p => !!p.email).length;

  if (!selectedOrg) {
    return (
      <div className="p-6 lg:p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-t1">Pasajeros por asociación</h1>
          <p className="text-sm text-t2 mt-0.5">Recurrencia real de pasajeros (identificados por DNI), su correo y un dashboard de análisis. Elige una asociación.</p>
        </div>
        <div className="bg-surface border border-border rounded-lg divide-y divide-border max-w-xl">
          {orgs.map(o => (
            <button
              key={o.id}
              onClick={() => handleSelectOrg(o)}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-hover text-left"
            >
              <div>
                <p className="font-medium text-t1">{o.name}</p>
                <p className="text-sm text-t2">{o.plan}</p>
              </div>
              <ChevronRight size={16} className="text-muted" />
            </button>
          ))}
          {orgs.length === 0 && <p className="px-4 py-6 text-sm text-t2">Sin asociaciones registradas.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <button onClick={() => setSelectedOrg(null)} className="flex items-center gap-1.5 text-sm text-t2 hover:text-t1">
        <ArrowLeft size={14} /> Volver a asociaciones
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-t1">Pasajeros · {selectedOrg.name}</h1>
          <p className="text-sm text-t2 mt-0.5">
            {profiles.length} pasajero(s) conocido(s) · {recurrentCount} recurrente(s) (2+ viajes) · {withEmailCount} con correo guardado
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-bg border border-border rounded-lg p-0.5">
            <button
              onClick={() => setView('lista')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${view === 'lista' ? 'bg-surface shadow-sm text-t1' : 'text-t2 hover:text-t1'}`}
            >
              <List size={13} /> Lista
            </button>
            <button
              onClick={() => setView('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${view === 'dashboard' ? 'bg-surface shadow-sm text-t1' : 'text-t2 hover:text-t1'}`}
            >
              <LayoutGrid size={13} /> Dashboard
            </button>
          </div>
          {view === 'lista' && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                placeholder="Nombre, DNI o correo…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-64"
              />
            </div>
          )}
        </div>
      </div>

      {view === 'dashboard' ? (
        <PassengerDashboardView dashboard={dashboard} loading={dashboardLoading} error={dashboardError} />
      ) : loading ? (
        <p className="text-sm text-t2">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm" aria-label="Pasajeros por asociación">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-3 py-2.5 text-t2 font-medium">Nombre</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium">DNI</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium">Correo</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium">Viajes</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium">Último viaje</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-hover">
                  <td className="px-3 py-2.5 font-medium text-t1">{p.name}</td>
                  <td className="px-3 py-2.5 font-mono text-t2">{p.dni}</td>
                  <td className="px-3 py-2.5 text-t2">{p.email ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium ${p.tripCount >= 2 ? 'bg-ok/10 text-ok' : 'bg-t2/10 text-t2'}`}>
                      {p.tripCount >= 2 && <Repeat size={11} />} {p.tripCount}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-t2">{p.lastTripAt ? new Date(p.lastTripAt).toLocaleDateString('es-PE') : '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-t2">{profiles.length === 0 ? 'Todavía no hay pasajeros registrados en un manifiesto.' : 'Sin resultados para esa búsqueda.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
