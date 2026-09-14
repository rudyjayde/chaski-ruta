import { useEffect, useState, useCallback } from 'react';
import { LayoutDashboard, Truck, Route, FileText, TrendingUp, AlertTriangle, MapPin, History, Bell, CreditCard, WifiOff, Radio, Megaphone, Lock, Loader2 } from 'lucide-react';
import Shell, { type NavItem } from '../../components/layout/Shell';
import GpsAlertBanner from '../../components/GpsAlertBanner';
import ProductionReportView from '../../components/ProductionReportView';
import GpsRouteHistoryView from '../../components/GpsRouteHistoryView';
import { useAuth } from '../../contexts/AuthContext';
import type { Unit, Trip, Manifest, QueueEntry, RelocationOrder } from '../../types';
import {
  fetchVehicles, fetchTrips, fetchManifests, fetchQueue, fetchMyOrganization, routeLabel, routeLabelShort, type Organization,
  fetchNotices, type Notice,
  fetchGpsLive, fetchGpsDevices, fetchGpsAlerts,
  type LiveVehiclePosition, type VehicleGpsStatus, type GpsAlert,
  fetchRelocations,
  fetchEngineLockRequests, requestEngineLock, type EngineLockRequest,
} from '../../lib/operacion-api';
import { localDateStr } from '../../lib/dates';

type PartnerUnit = Unit;

/** Datos reales del socio autenticado: las unidades de las que figura como
 * propietario (Vehicle.partnerId), y el corredor (org) de SU asociacion --
 * para traducir codigos de ruta a los nombres reales en vez de "Juli"/"Puno"
 * fijos.
 *
 * Corregido (12 sept 2026): esto YA NO llama a fetchPeople() -- ese endpoint
 * es solo ADMINISTRADOR/SUPERADMIN (people.controller.ts), asi que un Socio
 * real recibia 403 y, como estaba dentro de un Promise.all(), TODO el bloque
 * (incluido fetchVehicles(), que si tenia permiso) se perdia silenciosamente
 * -- por eso "Mis unidades" salia vacio aunque el socio SI tuviera una unidad
 * real asignada. user.id YA ES el Person.id (viene de GET /auth/me, mismo
 * valor que el backend usa en JwtPayload.sub para filtrar partnerId/
 * currentDriverId -- ver gps-alerts.controller.ts) asi que no hace falta
 * buscarlo en ninguna lista. */
function usePartnerData() {
  const { user } = useAuth();
  const [units, setUnits] = useState<PartnerUnit[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchVehicles(), fetchMyOrganization()])
      .then(([unitsList, orgResult]) => {
        if (cancelled) return;
        setUnits(unitsList);
        setOrg(orgResult);
      })
      .catch(() => { /* se degrada a listas vacias mientras tanto */ });
    return () => { cancelled = true; };
  }, [user?.id]);

  const myUnits = units.filter(unit => user?.id ? unit.partnerId === user.id : unit.code === user?.code);
  const myUnit = myUnits[0];
  // GPS Vehicular real (plan-pro.md / plan-gps-vehicular.md): la unidad tiene
  // GPS si tiene un dispositivo Traccar realmente vinculado -- nunca por un
  // codigo de unidad "hardcodeado". Aplica igual si la asociacion es PRO
  // (dispositivo vino con el plan) o Operacion (GPS Vehicular contratado
  // aparte para esa unidad puntual) -- el backend ya no distingue por plan,
  // solo por si el vehiculo tiene traccarDeviceId real (ver gps.controller.ts).
  //
  // Corregido (12 sept 2026): antes esto solo miraba la PRIMERA unidad
  // (myUnit) -- un socio con 2 o 3 unidades donde la primera no tenia GPS
  // pero la segunda si, se quedaba sin ver el menu de GPS por completo. Ahora
  // revisa TODAS sus unidades.
  //
  // Corregido (13 sept 2026): si la asociacion no es PRO, ademas del
  // hardware (traccarDeviceId) la unidad necesita el Plan GPS Vehicular
  // individual ACTIVO (gpsVehicularActivo) -- si Super Admin lo desactivo
  // por falta de pago, el socio deja de ver GPS aunque el equipo siga
  // instalado. En PRO el GPS viene incluido, el flag no aplica.
  const gpsUnits = myUnits.filter(u => Boolean(u.traccarDeviceId) && (org?.plan === 'PRO' || u.gpsVehicularActivo !== false));
  const hasVehicleGPS = gpsUnits.length > 0;

  return { profile: user, myUnits, myUnit, gpsUnits, mainCode: myUnits[0]?.code || user?.code, org, hasVehicleGPS };
}

type Section = 'resumen' | 'unidades' | 'viajes' | 'manifiestos' | 'produccion' | 'incidencias' | 'avisos' | 'gps-vivo' | 'gps-historial' | 'gps-alertas' | 'gps-plan' | 'gps-bloqueo';

const BASE_NAV_ITEMS: NavItem[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'unidades', label: 'Mis unidades', icon: Truck },
  { id: 'viajes', label: 'Viajes', icon: Route },
  { id: 'manifiestos', label: 'Manifiestos', icon: FileText },
  { id: 'produccion', label: 'Producción', icon: TrendingUp },
  { id: 'incidencias', label: 'Incidencias', icon: AlertTriangle },
  { id: 'avisos', label: 'Avisos', icon: Megaphone },
];

const GPS_NAV_ITEMS: NavItem[] = [
  { id: 'gps-vivo', label: 'GPS de mi unidad', icon: MapPin },
  { id: 'gps-historial', label: 'Historial GPS', icon: History },
  { id: 'gps-alertas', label: 'Alertas GPS', icon: Bell },
  { id: 'gps-bloqueo', label: 'Bloqueo de motor', icon: Lock },
  { id: 'gps-plan', label: 'Plan GPS', icon: CreditCard },
];

// ─── Avisos (plan-pro.md §9) ───────────────────────────────────────────────────
// Solo lectura: los redacta el administrador desde su panel. Nunca llegan por
// WhatsApp, solo aqui dentro de la plataforma.
function PartnerNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchNotices()
      .then(result => { if (!cancelled) setNotices(result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los avisos.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-t1">Avisos</h1>
        <p className="text-sm text-t2 mt-0.5">Comunicados de tu administrador.</p>
      </div>
      {loading ? (
        <div className="text-center py-10 text-sm text-t2">Cargando avisos…</div>
      ) : error ? (
        <div className="text-center py-10 text-sm text-danger">{error}</div>
      ) : notices.length === 0 ? (
        <div className="text-center py-10 text-sm text-t2">
          <Megaphone size={28} className="mx-auto mb-2 opacity-30" />
          Todavía no tienes avisos.
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map(n => (
            <div key={n.id} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-t1">{n.title}</h3>
                <span className="text-xs text-t2 shrink-0">{new Date(n.createdAt).toLocaleDateString('es-PE')}</span>
              </div>
              <p className="text-sm text-t2 mt-1 whitespace-pre-wrap">{n.body}</p>
              <p className="text-xs text-t2 mt-2">Por {n.authorName}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PartnerSummary() {
  const { user } = useAuth();
  const { myUnit, mainCode, org, hasVehicleGPS } = usePartnerData();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [queueJP, setQueueJP] = useState<QueueEntry[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<VehicleGpsStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTrips(), fetchManifests(), fetchQueue('JULI_PUNO')])
      .then(([tripsList, manifestsList, queueList]) => {
        if (cancelled) return;
        setTrips(tripsList);
        setManifests(manifestsList);
        setQueueJP(queueList);
      })
      .catch(() => { /* se degrada a listas vacias mientras tanto */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hasVehicleGPS || !myUnit) return;
    let cancelled = false;
    // Corregido (12 sept 2026): antes tomaba el primer dispositivo de la
    // lista sin importar si era el de esta unidad -- con 2+ unidades podia
    // mostrar el estado de OTRA unidad por error. Esta es solo la tarjeta
    // resumen de "Inicio" (una unidad, la principal) -- el detalle completo
    // con selector de las demas unidades vive en GPS de mi unidad.
    fetchGpsDevices().then(list => { if (!cancelled) setDeviceStatus(list.find(d => d.vehicleId === myUnit.id) ?? null); }).catch(() => { /* se degrada sin estado de dispositivo */ });
    return () => { cancelled = true; };
  }, [hasVehicleGPS, myUnit]);

  const myTrip = trips.find(t => t.code === mainCode);
  const myManifests = manifests.filter(m => m.code === mainCode);
  const myQueueEntry = queueJP.find(e => e.code === mainCode);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-t1">Hola, {user?.name?.split(' ')[0]}</h1>
        <p className="text-sm text-t2 mt-0.5">{org?.name ?? 'Tu asociación'} · Socio · Código {mainCode ?? user?.code ?? '—'} · {new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
      </div>

      <GpsAlertBanner enabled={hasVehicleGPS} />

      {/* My unit at a glance */}
      {myUnit && (
        <div className="bg-surface border border-border rounded-lg p-5 max-w-2xl">
          <h2 className="text-sm font-semibold text-t2 uppercase tracking-wide mb-4">Mi unidad</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {[
              { label: 'Código', value: myUnit.code, bold: true },
              { label: 'Empresa', value: myUnit.company },
              { label: 'Vehículo', value: myUnit.vehicleType },
              { label: 'Placa', value: myUnit.plate, mono: true },
              { label: 'Conductor', value: myUnit.currentDriverName },
              { label: 'Ruta', value: myUnit.route },
            ].map(row => (
              <div key={row.label} className="flex justify-between border-b border-border pb-2">
                <span className="text-t2">{row.label}</span>
                <span className={`text-t1 ${row.bold ? 'font-bold' : 'font-medium'} ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasVehicleGPS && myUnit && (
        <div className="border border-primary/25 bg-primary/5 p-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Radio size={15} className={deviceStatus?.online === 'online' ? 'text-ok' : 'text-t2'} />
              <p className="text-sm font-semibold text-t1">GPS Vehicular {deviceStatus?.online === 'online' ? 'en línea' : deviceStatus?.online === 'offline' ? 'sin señal' : 'vinculado'}</p>
            </div>
            <p className="text-sm text-t2 mt-1">La unidad {myUnit.code} tiene un dispositivo GPS real vinculado. {myUnit.currentDriverName} también puede ver la señal mientras permanezca asignado.</p>
          </div>
          <span className="text-sm font-medium text-primary">{org?.plan === 'PRO' ? 'Incluido en Plan PRO' : 'GPS Vehicular por unidad'}</span>
        </div>
      )}

      {/* Status grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-lg px-4 py-3">
          <div className="text-sm text-t2 mb-1">Estado en cola</div>
          <div className={`text-sm font-semibold ${myQueueEntry ? 'text-primary' : 'text-t2'}`}>
            {myQueueEntry ? `Pos. #${myQueueEntry.position} · ${myQueueEntry.status}` : 'No inscrito'}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-lg px-4 py-3">
          <div className="text-sm text-t2 mb-1">Viaje activo</div>
          <div className={`text-sm font-semibold ${myTrip?.status === 'ACTIVO' ? 'text-ok' : 'text-t2'}`}>
            {myTrip?.status === 'ACTIVO' ? 'En ruta' : 'Ninguno'}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-lg px-4 py-3">
          <div className="text-sm text-t2 mb-1">Manifiestos hoy</div>
          <div className="text-sm font-semibold text-t1">{myManifests.length}</div>
        </div>
      </div>

      {/* Today revenue */}
      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-t2 uppercase tracking-wide mb-4">Recaudación del día</h2>
        {myManifests.length === 0 ? (
          <p className="text-sm text-t2">Sin manifiestos cerrados hoy.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Pasajeros', value: myManifests.reduce((s, m) => s + m.passengers.length, 0) },
              { label: 'Recaudado', value: `S/ ${myManifests.reduce((s, m) => s + m.passengers.reduce((a, p) => a + p.fare, 0), 0)}` },
              { label: 'Viajes', value: myManifests.length },
            ].map(item => (
              <div key={item.label} className="text-center">
                <div className="text-2xl font-bold text-t1">{item.value}</div>
                <div className="text-sm text-t2">{item.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-bg border border-border rounded-lg p-4">
        <p className="text-sm text-t2">
          Como socio, tienes acceso de lectura a los datos de tu unidad. Para modificar inscripciones, confirmar presencia o registrar llegadas, usa tu dispositivo Android autorizado.
        </p>
      </div>
    </div>
  );
}

function PartnerUnits() {
  const { myUnits } = usePartnerData();
  return (
    <div className="p-6 lg:p-8 space-y-4">
      <h1 className="text-2xl font-bold text-t1">Mis unidades</h1>
      {myUnits.map(u => (
        <div key={u.id} className="bg-surface border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xl font-bold text-t1">Código {u.code}</span>
              <p className="text-sm text-t2 mt-0.5">{u.company}</p>
            </div>
            <span className="text-xs px-2 py-1 rounded bg-ok/10 text-ok">{u.status}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm border-t border-border pt-4">
            {[
              { label: 'Vehículo', value: u.vehicleType },
              { label: 'Placa actual', value: u.plate, mono: true },
              { label: 'Modelo', value: u.model },
              { label: 'Año', value: String(u.year) },
              { label: 'Conductor', value: u.currentDriverName },
              { label: 'Ruta', value: u.route },
            ].map(row => (
              <div key={row.label}>
                <span className="text-sm text-t2">{row.label}</span>
                <p className={`text-t1 font-medium ${row.mono ? 'font-mono' : ''}`}>{row.value}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-sm font-semibold text-t2 mb-2">Historial de placas</p>
            <div className="space-y-1">
              {(u.plateHistory ?? []).map((h, i) => (
                <div key={i} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-1.5">
                  <span className="font-mono text-t1">{h.plate}</span>
                  <span className="text-t2">{h.from}{h.to ? ` → ${h.to}` : ' → actual'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Reporte compartido con el Conductor (12 sept 2026, decidido con Jayde) --
// ver ProductionReportView.tsx: el conductor rinde cuentas con esto, el
// socio controla con el MISMO calculo (mismas vueltas, mismo desglose por
// metodo de pago) -- nunca dos formulas distintas para el mismo dato.
function PartnerProduction() {
  const { myUnits, mainCode, profile, org } = usePartnerData();
  const [selectedCode, setSelectedCode] = useState(mainCode ?? '');
  useEffect(() => { if (mainCode && !selectedCode) setSelectedCode(mainCode); }, [mainCode, selectedCode]);
  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-t1 mb-1">Producción</h1>
      <p className="text-sm text-t2 mb-4">Producción y recaudación real de tu unidad, con el mismo cálculo que usa tu conductor para rendirte cuentas.</p>
      <UnitTabs units={myUnits} selected={selectedCode} onSelect={setSelectedCode} />
      {selectedCode ? (
        <ProductionReportView code={selectedCode} orgName={org?.name} personName={profile?.name} personLabel="Socio" />
      ) : (
        <p className="text-sm text-t2">No tienes ninguna unidad vinculada todavía.</p>
      )}
    </div>
  );
}

// Selector de unidad (12 sept 2026, decidido con Jayde): un socio puede
// tener 1, 2 o mas unidades -- antes estas pantallas solo mostraban SIEMPRE
// la primera (mainCode), la segunda o tercera quedaban invisibles sin ningun
// aviso. Con 1 sola unidad no se muestra nada (no hay nada que elegir).
function UnitTabs({ units, selected, onSelect }: { units: PartnerUnit[]; selected: string; onSelect: (code: string) => void }) {
  if (units.length <= 1) return null;
  return (
    <div className="flex items-center gap-1.5 bg-bg border border-border rounded-lg p-1 mb-4 w-fit flex-wrap">
      {units.map(u => (
        <button
          key={u.id}
          onClick={() => onSelect(u.code)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${selected === u.code ? 'bg-surface shadow-sm text-t1' : 'text-t2 hover:text-t1'}`}
        >
          Unidad {u.code}
        </button>
      ))}
    </div>
  );
}

type SocioReportPeriod = 'todos' | 'hoy' | '7dias' | 'mes' | 'personalizado';

function ReadonlySection({ title, description }: { title: string; description: string }) {
  const { myUnits, mainCode, org } = usePartnerData();
  const [selectedCode, setSelectedCode] = useState(mainCode ?? '');
  useEffect(() => { if (mainCode && !selectedCode) setSelectedCode(mainCode); }, [mainCode, selectedCode]);
  const [allManifests, setAllManifests] = useState<Manifest[]>([]);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [allRelocations, setAllRelocations] = useState<RelocationOrder[]>([]);

  // Filtro de fecha para "Viajes" (12 sept 2026) -- mismo patron que ya usa
  // Producción, para no mostrar SIEMPRE todo el historial sin poder acotarlo.
  const today = localDateStr();
  const weekAgo = localDateStr(new Date(Date.now() - 7 * 24 * 3600 * 1000));
  const monthAgo = localDateStr(new Date(Date.now() - 30 * 24 * 3600 * 1000));
  const [period, setPeriod] = useState<SocioReportPeriod>('todos');
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchManifests(), fetchTrips(), fetchRelocations()])
      .then(([manifestsList, tripsList, relocationsList]) => {
        if (cancelled) return;
        setAllManifests(manifestsList);
        setAllTrips(tripsList);
        setAllRelocations(relocationsList);
      })
      .catch(() => { /* se degrada a listas vacias mientras tanto */ });
    return () => { cancelled = true; };
  }, []);

  // Filtro de fecha compartido entre "Viajes" y "Manifiestos" -- en las demas
  // pantallas (Incidencias) no se aplica, para no ocultar historial que no
  // tiene su propio selector visible.
  const matchesPeriod = (d: string | undefined) => {
    if (!d) return true; // sin fecha real todavia -- nunca se oculta por un filtro que no puede evaluar
    if (period === 'todos') return true;
    if (period === 'hoy') return d === today;
    if (period === '7dias') return d >= weekAgo;
    if (period === 'mes') return d >= monthAgo;
    if (period === 'personalizado') return d >= dateFrom && d <= dateTo;
    return true;
  };
  const manifests = allManifests.filter(m => {
    if (m.code !== selectedCode) return false;
    if (title !== 'Manifiestos') return true;
    return matchesPeriod(m.date);
  });
  const tripDate = (t: Trip) => {
    const iso = t.actualDepartureISO ?? t.scheduledDepartureISO;
    return iso ? localDateStr(new Date(iso)) : undefined;
  };
  const trips = allTrips.filter(t => {
    if (t.code !== selectedCode) return false;
    if (title !== 'Viajes') return true; // el filtro de fecha solo aplica a "Viajes"
    return matchesPeriod(tripDate(t));
  });
  const incidentTrips = trips.filter(t => t.status === 'CON_INCIDENCIA' || Boolean(t.incidentNote));
  const relocationsForUnit = allRelocations.filter(r => r.units.some(u => u.code === selectedCode));

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <h1 className="text-2xl font-bold text-t1">{title}</h1>
      <p className="text-sm text-t2">{description}</p>
      <UnitTabs units={myUnits} selected={selectedCode} onSelect={setSelectedCode} />
      {(title === 'Viajes' || title === 'Manifiestos') && (
        <div className="flex flex-wrap gap-3 items-end bg-surface border border-border rounded-lg p-4">
          <div>
            <label className="block text-[11px] text-muted mb-1">Periodo</label>
            <div className="flex gap-1">
              {([['todos', 'Todos'], ['hoy', 'Hoy'], ['7dias', 'Últ. 7 días'], ['mes', 'Este mes'], ['personalizado', 'Personalizado']] as [SocioReportPeriod, string][]).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setPeriod(v)}
                  className={`px-2.5 py-1.5 text-xs rounded border transition-colors ${period === v ? 'bg-primary text-white border-primary' : 'border-border text-t2 hover:bg-hover'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {period === 'personalizado' && (
            <>
              <div>
                <label className="block text-[11px] text-muted mb-1">Desde</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="h-8 px-2 border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-[11px] text-muted mb-1">Hasta</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="h-8 px-2 border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </>
          )}
        </div>
      )}
      {title === 'Manifiestos' && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm" aria-label="Mis manifiestos">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Número</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Ruta</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Pasajeros</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Total</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {manifests.map(m => (
                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-hover">
                  <td className="px-4 py-3 font-mono text-t1">{m.number}</td>
                  <td className="px-4 py-3 text-t2">{routeLabelShort(m.route, org)}</td>
                  <td className="px-4 py-3 text-t1">{m.passengers.length}/{m.capacity}</td>
                  <td className="px-4 py-3 text-ok font-medium">S/ {m.passengers.reduce((s, p) => s + p.fare, 0)}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded bg-t2/10 text-t2">{m.status}</span></td>
                </tr>
              ))}
              {manifests.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-t2">Sin manifiestos</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {title === 'Viajes' && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm" aria-label="Mis viajes">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Ruta</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Conductor</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Salida</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {trips.map(t => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-t1">{routeLabel(t.route, org)}</td>
                  <td className="px-4 py-3 text-t1">{t.driverName}</td>
                  <td className="px-4 py-3 font-mono text-t1">{t.actualDeparture ?? t.scheduledDeparture}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded bg-t2/10 text-t2">{t.status}</span></td>
                </tr>
              ))}
              {trips.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-t2">Sin viajes</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {title === 'Incidencias' && (
        <>
          <div>
            <h2 className="text-sm font-semibold text-t2 uppercase tracking-wide mb-2">Viajes con incidencia</h2>
            <div className="bg-surface border border-border rounded-lg overflow-hidden mb-4">
              <table className="w-full text-sm" aria-label="Viajes con incidencia">
                <thead>
                  <tr className="border-b border-border bg-bg">
                    <th className="text-left px-4 py-2.5 text-t2 font-medium">Ruta</th>
                    <th className="text-left px-4 py-2.5 text-t2 font-medium">Fecha salida</th>
                    <th className="text-left px-4 py-2.5 text-t2 font-medium">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {incidentTrips.map(t => (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-t1">{routeLabel(t.route, org)}</td>
                      <td className="px-4 py-3 font-mono text-t1">{t.actualDeparture ?? t.scheduledDeparture}</td>
                      <td className="px-4 py-3 text-t2">{t.incidentNote || 'Sin nota'}</td>
                    </tr>
                  ))}
                  {incidentTrips.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-t2">Sin incidencias registradas</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-t2 uppercase tracking-wide mb-2">Reubicaciones que incluyen tu unidad</h2>
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm" aria-label="Reubicaciones">
                <thead>
                  <tr className="border-b border-border bg-bg">
                    <th className="text-left px-4 py-2.5 text-t2 font-medium">Orden</th>
                    <th className="text-left px-4 py-2.5 text-t2 font-medium">De → A</th>
                    <th className="text-left px-4 py-2.5 text-t2 font-medium">Ventana</th>
                    <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {relocationsForUnit.map(r => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-t1">{r.internalOrder}</td>
                      <td className="px-4 py-3 text-t1">{r.fromTerminal} → {r.toTerminal}</td>
                      <td className="px-4 py-3 text-t2">{r.window}</td>
                      <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded bg-t2/10 text-t2">{r.status}</span></td>
                    </tr>
                  ))}
                  {relocationsForUnit.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-t2">Sin reubicaciones para tu unidad</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// selectedCode: cual de las unidades CON GPS real quiere ver (12 sept 2026,
// decidido con Jayde) -- antes esto siempre devolvia la primera unidad del
// socio (myUnit), sin importar si tenia GPS o no. Un socio con 2-3 unidades
// donde la primera no tenia GPS se quedaba sin ver nada, aunque la segunda o
// tercera si tuvieran GPS real. Ahora se elige entre gpsUnits (las que SI
// tienen traccarDeviceId), con la primera de esas como default.
function usePartnerGPSUnit(selectedCode?: string) {
  const { user } = useAuth();
  const { profile, gpsUnits, org, hasVehicleGPS } = usePartnerData();
  const unit = (selectedCode ? gpsUnits.find(u => u.code === selectedCode) : undefined) ?? gpsUnits[0];
  return { user, profile, org, unit, gpsUnits, code: unit?.code || user?.code || '—', hasVehicleGPS };
}

// Estado "sin dispositivo vinculado todavia" -- solo se llega aqui si alguien
// entra a la seccion sin GPS real (por URL directa); el nav ya lo esconde.
function NoGpsNotice() {
  return (
    <div className="p-6 lg:p-8">
      <div className="bg-surface border border-border rounded-lg p-8 text-center">
        <WifiOff size={28} className="mx-auto mb-3 text-t2 opacity-40" />
        <p className="text-sm font-medium text-t1">Tu unidad todavía no tiene un dispositivo GPS vinculado</p>
        <p className="text-sm text-t2 mt-1">Contacta a tu administrador para contratar GPS Vehicular para tu unidad, o consulta si tu asociación tiene Plan PRO.</p>
      </div>
    </div>
  );
}

function PartnerGPSLive() {
  const [selectedCode, setSelectedCode] = useState('');
  const { unit, code, gpsUnits, hasVehicleGPS } = usePartnerGPSUnit(selectedCode);
  useEffect(() => { if (gpsUnits[0] && !selectedCode) setSelectedCode(gpsUnits[0].code); }, [gpsUnits, selectedCode]);
  const [position, setPosition] = useState<LiveVehiclePosition | null>(null);
  const [device, setDevice] = useState<VehicleGpsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasVehicleGPS || !unit) { setLoading(false); return; }
    let cancelled = false;
    Promise.all([fetchGpsLive(), fetchGpsDevices()])
      .then(([positions, devices]) => {
        if (cancelled) return;
        setPosition(positions.find(p => p.vehicleId === unit.id) ?? null);
        setDevice(devices.find(d => d.vehicleId === unit.id) ?? null);
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el GPS.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hasVehicleGPS, unit]);

  if (!hasVehicleGPS) return <NoGpsNotice />;

  const online = device?.online === 'online';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-t1">GPS de mi unidad</h1>
          <p className="text-sm text-t2 mt-0.5">Unidad {code} · {unit?.plate || 'Sin placa'}</p>
          <UnitTabs units={gpsUnits} selected={selectedCode} onSelect={setSelectedCode} />
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded ${online ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-ok' : 'bg-warn'}`} /> {online ? 'En línea' : device?.online === 'offline' ? 'Sin señal' : 'Estado desconocido'}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-t2">Cargando posición…</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <div className="grid lg:grid-cols-[1fr_300px] gap-5">
          <div className="bg-surface border border-border overflow-hidden">
            <div className="h-80 bg-bg relative" aria-label="Última posición conocida">
              {position ? (
                <iframe
                  title="Última posición"
                  className="w-full h-full border-0"
                  src={`https://www.google.com/maps?q=${position.lat},${position.lng}&z=15&output=embed`}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-surface border border-warn/40 px-4 py-2 text-xs text-warn flex items-center gap-2">
                    <WifiOff size={14} /> Sin señal reciente. No se muestra ni se inventa una posición.
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-border px-4 py-3 text-sm text-t2">
              {position ? `Última señal: ${new Date(position.lastUpdate).toLocaleString('es-PE')}` : 'Sin última señal registrada'}
            </div>
          </div>

          <div className="bg-surface border border-border divide-y divide-border">
            {[
              ['Unidad', code],
              ['Placa', unit?.plate || 'Sin placa'],
              ['Conductor actual', unit?.currentDriverName || 'Sin conductor'],
              ['Velocidad', position ? `${position.speedKmh} km/h` : '—'],
              ['Ignición', position?.ignition == null ? 'Sin dato' : position.ignition ? 'Encendido' : 'Apagado'],
              ['Energía (batería del vehículo)', position?.powerVoltage == null ? 'Sin dato' : `${position.powerVoltage.toFixed(1)} V`],
              ['Señal GSM', position?.signal == null ? 'Sin dato' : `${position.signal}/5`],
              ['Kilometraje acumulado', position?.odometerKm == null ? 'Sin dato' : `${position.odometerKm.toLocaleString('es-PE')} km`],
              ['Dispositivo', device?.traccarDeviceId ? `•••• ${device.traccarDeviceId.slice(-4)}` : 'Sin dispositivo'],
            ].map(([label, value]) => (
              <div key={label} className="px-4 py-3 text-sm flex justify-between gap-3">
                <span className="text-t2">{label}</span><strong className="text-t1 text-right">{value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-primary/5 border border-primary/25 p-4">
        <h2 className="text-base font-semibold text-t1">Beneficio para el conductor asignado</h2>
        <p className="text-sm text-t2 mt-2 leading-relaxed">{unit?.currentDriverName || 'El conductor'} puede ver esta misma señal mientras permanezca asignado a la unidad {code}. No puede administrar el GPS ni consultar el de otras unidades.</p>
      </div>
    </div>
  );
}

function PartnerGPSHistory() {
  const [selectedCode, setSelectedCode] = useState('');
  const { unit, code, gpsUnits, hasVehicleGPS } = usePartnerGPSUnit(selectedCode);
  useEffect(() => { if (gpsUnits[0] && !selectedCode) setSelectedCode(gpsUnits[0].code); }, [gpsUnits, selectedCode]);

  if (!hasVehicleGPS) return <NoGpsNotice />;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-t1">Historial GPS</h1>
        <p className="text-sm text-t2 mt-0.5">Recorrido real de la unidad {code} · {unit?.plate || 'Sin placa'}, pintado en el mapa.</p>
        <UnitTabs units={gpsUnits} selected={selectedCode} onSelect={setSelectedCode} />
      </div>
      {unit && <GpsRouteHistoryView vehicleId={unit.id} code={code} plate={unit.plate} />}
    </div>
  );
}

const ALERT_TYPE_LABEL: Record<GpsAlert['type'], string> = {
  DESCONEXION: 'Dispositivo desconectado',
  MOVIMIENTO_SIN_VIAJE: 'Movimiento sin viaje activo',
  CORTE_ENERGIA: 'Corte de energía (batería del vehículo)',
  POSIBLE_REMOLQUE: 'Posible remolque — motor apagado en movimiento',
  BOTON_PANICO: '🆘 Botón de pánico activado',
  FALLA_REPORTADA: 'Falla de GPS reportada',
  POSIBLE_ACCIDENTE: '🆘 Posible accidente detectado',
  FUERA_DE_RUTA: '🆘 Unidad fuera del corredor autorizado',
};

function PartnerGPSAlerts() {
  const [selectedCode, setSelectedCode] = useState('');
  const { unit, code, gpsUnits, hasVehicleGPS } = usePartnerGPSUnit(selectedCode);
  useEffect(() => { if (gpsUnits[0] && !selectedCode) setSelectedCode(gpsUnits[0].code); }, [gpsUnits, selectedCode]);
  const [allAlerts, setAllAlerts] = useState<GpsAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasVehicleGPS) { setLoading(false); return; }
    let cancelled = false;
    fetchGpsAlerts()
      .then(result => { if (!cancelled) setAllAlerts(result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar las alertas.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hasVehicleGPS]);

  if (!hasVehicleGPS) return <NoGpsNotice />;

  // Antes esto mostraba las alertas de TODAS las unidades del socio
  // mezcladas -- ahora se filtra a la unidad elegida en las pestañas.
  const alerts = allAlerts.filter(a => a.unitCode === code);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-t1">Alertas GPS</h1>
        <p className="text-sm text-t2 mt-0.5">Alertas reales de la unidad {code} · {unit?.plate}</p>
        <UnitTabs units={gpsUnits} selected={selectedCode} onSelect={setSelectedCode} />
      </div>
      {loading ? (
        <p className="text-sm text-t2">Cargando alertas…</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <div className="bg-surface border border-border divide-y divide-border">
          {alerts.map(a => (
            <div key={a.id} className={`p-4 flex items-center justify-between gap-4 ${['BOTON_PANICO', 'POSIBLE_ACCIDENTE', 'FUERA_DE_RUTA'].includes(a.type) ? 'bg-danger/10' : ''}`}>
              <div>
                <p className={`text-sm font-medium ${['BOTON_PANICO', 'POSIBLE_ACCIDENTE', 'FUERA_DE_RUTA'].includes(a.type) ? 'text-danger font-bold' : 'text-t1'}`}>{ALERT_TYPE_LABEL[a.type]}</p>
                <p className="text-sm text-t2 mt-0.5">{a.description}</p>
                <p className="text-xs text-t2 mt-1">{new Date(a.detectedAt).toLocaleString('es-PE')}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-t2/10 text-t2 shrink-0">{a.status}</span>
            </div>
          ))}
          {alerts.length === 0 && (
            <div className="p-8 text-center text-sm text-t2">
              <Bell size={24} className="mx-auto mb-2 opacity-30" />
              Sin alertas registradas para tu unidad.
            </div>
          )}
        </div>
      )}
      <p className="text-sm text-muted">Las alertas informan; no generan sanciones automáticas.</p>
    </div>
  );
}

const ENGINE_LOCK_STATUS_LABEL: Record<EngineLockRequest['status'], string> = {
  SOLICITADO: 'Solicitud enviada — esperando confirmación',
  CONFIRMADO: 'Confirmado — se ejecutará apenas la unidad se detenga',
  EJECUTADO: 'Motor bloqueado',
  CANCELADO: 'Cancelado',
  RESTAURADO: 'Bloqueo levantado',
};

/**
 * Bloqueo remoto de motor (12 sept 2026, decidido con Jayde): el Socio SOLO
 * puede solicitar el bloqueo de su propia unidad, con motivo obligatorio.
 * Confirmar, cancelar o restaurar es exclusivo de Super Admin -- este panel
 * nunca ejecuta nada, solo pide y muestra el estado real.
 */
function PartnerEngineLock() {
  const [selectedCode, setSelectedCode] = useState('');
  const { unit, code, gpsUnits, hasVehicleGPS } = usePartnerGPSUnit(selectedCode);
  useEffect(() => { if (gpsUnits[0] && !selectedCode) setSelectedCode(gpsUnits[0].code); }, [gpsUnits, selectedCode]);
  const [requests, setRequests] = useState<EngineLockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const load = useCallback(() => {
    fetchEngineLockRequests()
      .then(result => setRequests(result))
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!hasVehicleGPS) { setLoading(false); return; }
    load();
  }, [hasVehicleGPS, load]);

  if (!hasVehicleGPS) return <NoGpsNotice />;

  const myRequests = requests.filter(r => r.vehicleId === unit?.id);
  const activeRequest = myRequests.find(r => r.status === 'SOLICITADO' || r.status === 'CONFIRMADO' || r.status === 'EJECUTADO');

  const handleSubmit = async () => {
    if (!unit || !reason.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await requestEngineLock(unit.id, reason.trim());
      setReason('');
      load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-t1">Bloqueo de motor</h1>
        <p className="text-sm text-t2 mt-0.5">Unidad {code} · {unit?.plate}</p>
        <UnitTabs units={gpsUnits} selected={selectedCode} onSelect={setSelectedCode} />
      </div>

      <div className="bg-warn/5 border border-warn/30 rounded-lg p-4 text-sm text-t1">
        Úsalo solo en caso de robo u otra emergencia real. La solicitud la revisa y ejecuta directamente CHASKI AI —
        nunca se ejecuta sola. Si la unidad está en movimiento, el corte espera a que se detenga por completo antes de aplicarse, nunca con el vehículo en marcha.
      </div>

      {loading ? (
        <p className="text-sm text-t2">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : activeRequest ? (
        <div className={`border rounded-lg p-5 ${activeRequest.status === 'EJECUTADO' ? 'bg-danger/10 border-danger/30' : 'bg-surface border-border'}`}>
          <p className={`text-sm font-semibold ${activeRequest.status === 'EJECUTADO' ? 'text-danger' : 'text-t1'}`}>
            {ENGINE_LOCK_STATUS_LABEL[activeRequest.status]}
          </p>
          <p className="text-sm text-t2 mt-1">Motivo: {activeRequest.requestReason}</p>
          <p className="text-xs text-t2 mt-1">Solicitado: {new Date(activeRequest.createdAt).toLocaleString('es-PE')}</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
          <label className="block text-sm font-medium text-t1">Motivo del bloqueo (obligatorio)</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Ej. Me robaron la unidad, el conductor me avisó por teléfono…"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {submitError && <p className="text-sm text-danger">{submitError}</p>}
          <button
            onClick={handleSubmit}
            disabled={submitting || !reason.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-danger text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
            Solicitar bloqueo de mi unidad
          </button>
        </div>
      )}

      {myRequests.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-t2 mb-2">Historial</h2>
          <div className="bg-surface border border-border divide-y divide-border">
            {myRequests.map(r => (
              <div key={r.id} className="p-3 text-sm flex items-center justify-between gap-3">
                <div>
                  <p className="text-t1">{ENGINE_LOCK_STATUS_LABEL[r.status]}</p>
                  <p className="text-xs text-t2 mt-0.5">{r.requestReason}</p>
                </div>
                <span className="text-xs text-t2 shrink-0">{new Date(r.createdAt).toLocaleDateString('es-PE')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PartnerGPSPlan() {
  const [selectedCode, setSelectedCode] = useState('');
  const { profile, org, unit, code, gpsUnits, hasVehicleGPS } = usePartnerGPSUnit(selectedCode);
  useEffect(() => { if (gpsUnits[0] && !selectedCode) setSelectedCode(gpsUnits[0].code); }, [gpsUnits, selectedCode]);
  const [device, setDevice] = useState<VehicleGpsStatus | null>(null);

  useEffect(() => {
    if (!hasVehicleGPS || !unit) return;
    let cancelled = false;
    fetchGpsDevices().then(list => { if (!cancelled) setDevice(list.find(d => d.vehicleId === unit.id) ?? null); }).catch(() => { /* se degrada sin dato de dispositivo */ });
    return () => { cancelled = true; };
  }, [hasVehicleGPS, unit]);

  if (!hasVehicleGPS) return <NoGpsNotice />;

  const isPRO = org?.plan === 'PRO';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-t1">Plan GPS</h1>
        <p className="text-sm text-t2 mt-0.5">Estado real vinculado a la unidad {code} · {unit?.plate || 'Sin placa'}</p>
        <UnitTabs units={gpsUnits} selected={selectedCode} onSelect={setSelectedCode} />
      </div>
      <div className="bg-surface border border-border overflow-hidden">
        <div className="p-5 border-b border-border flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-t1">GPS Vehicular</p>
            <p className="text-sm text-t2 mt-1">{isPRO ? `Incluido en el Plan PRO de ${org?.name ?? 'tu asociación'}` : 'Contratación individual para esta unidad'}</p>
          </div>
          <span className="bg-ok/10 text-ok text-xs px-2 py-0.5 rounded font-medium">VINCULADO</span>
        </div>
        <div className="divide-y divide-border text-sm">
          <div className="px-5 py-3 flex justify-between"><span className="text-t2">Titular</span><strong className="text-t1">{profile?.name || unit?.partnerName || 'Socio propietario'}</strong></div>
          <div className="px-5 py-3 flex justify-between"><span className="text-t2">Unidad cubierta</span><strong className="text-t1">{code} · {unit?.plate}</strong></div>
          <div className="px-5 py-3 flex justify-between"><span className="text-t2">Conductor asignado</span><strong className="text-t1">{unit?.currentDriverName || 'Sin conductor'}</strong></div>
          <div className="px-5 py-3 flex justify-between"><span className="text-t2">Dispositivo</span><strong className="text-t1 font-mono">{device?.traccarDeviceId ? `•••• ${device.traccarDeviceId.slice(-4)}` : 'Sin dato'}</strong></div>
          <div className="px-5 py-3 flex justify-between"><span className="text-t2">Estado de señal</span><strong className="text-t1">{device?.online === 'online' ? 'En línea' : device?.online === 'offline' ? 'Sin señal' : 'Desconocido'}</strong></div>
        </div>
      </div>

      <div className="text-sm text-t2 border border-border p-4">
        Los datos de facturación y renovación de la suscripción todavía no están disponibles en la plataforma — consúltalos directamente con tu administrador o con CHASKI AI.
      </div>
    </div>
  );
}

export default function PartnerApp({ onLogout }: { onLogout?: () => void }) {
  const { hasVehicleGPS, org } = usePartnerData();
  // GPS Vehicular es un complemento POR UNIDAD (plan-gps-vehicular.md), no un
  // plan de la asociacion -- si la asociacion sigue en Operación pero esta
  // unidad puntual tiene GPS real, la etiqueta debe decir eso, no "Operación"
  // a secas (que sonaria a que no tiene ningun GPS).
  const planLabelOverride = hasVehicleGPS && org?.plan === 'OPERACION' ? 'Plan GPS Vehicular' : undefined;
  const [section, setSection] = useState<Section>(
    () => (window.history.state as { chaskiSection?: Section } | null)?.chaskiSection ?? 'resumen'
  );

  // Mismo arreglo que en los otros paneles: sin esto "atras" del navegador
  // saltaba directo al portal en vez de a la pantalla anterior.
  useEffect(() => {
    window.history.replaceState(
      { ...(window.history.state ?? {}), chaskiSection: section },
      '',
      window.location.pathname
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      const s = (e.state as { chaskiSection?: Section } | null)?.chaskiSection;
      setSection(s ?? 'resumen');
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const navigateSection = useCallback((id: Section) => {
    setSection(id);
    window.history.pushState({ chaskiSection: id }, '', window.location.pathname);
  }, []);

  // Los links de GPS solo aparecen si la unidad del socio tiene un
  // dispositivo real vinculado (plan PRO o GPS Vehicular individual) --
  // nunca por un codigo de unidad "hardcodeado" (corregido 11 sept 2026).
  const navItems: NavItem[] = hasVehicleGPS ? [...BASE_NAV_ITEMS, ...GPS_NAV_ITEMS] : BASE_NAV_ITEMS;

  return (
    <Shell navItems={navItems} activeSection={section} onNavigate={(id) => navigateSection(id as Section)} onLogout={onLogout} planLabelOverride={planLabelOverride}>
      {section === 'resumen' && <PartnerSummary />}
      {section === 'unidades' && <PartnerUnits />}
      {section === 'viajes' && <ReadonlySection title="Viajes" description="Historial de viajes de tu unidad." />}
      {section === 'manifiestos' && <ReadonlySection title="Manifiestos" description="Manifiestos de tu unidad autorizados para consulta." />}
      {section === 'produccion' && <PartnerProduction />}
      {section === 'incidencias' && <ReadonlySection title="Incidencias" description="Incidencias y reubicaciones de tu unidad." />}
      {section === 'avisos' && <PartnerNotices />}
      {section === 'gps-vivo' && <PartnerGPSLive />}
      {section === 'gps-historial' && <PartnerGPSHistory />}
      {section === 'gps-alertas' && <PartnerGPSAlerts />}
      {section === 'gps-bloqueo' && <PartnerEngineLock />}
      {section === 'gps-plan' && <PartnerGPSPlan />}
    </Shell>
  );
}
