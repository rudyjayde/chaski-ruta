import { useEffect, useState, useCallback } from 'react';
import { LayoutDashboard, Truck, Route, FileText, TrendingUp, AlertTriangle, MapPin, History, Bell, CreditCard, WifiOff, Radio } from 'lucide-react';
import Shell, { type NavItem } from '../../components/layout/Shell';
import { useAuth } from '../../contexts/AuthContext';
import type { Person, Unit, Trip, Manifest, QueueEntry } from '../../types';
import { fetchPeople, fetchVehicles, fetchTrips, fetchManifests, fetchQueue, fetchMyOrganization, routeLabel, routeLabelShort, type Organization } from '../../lib/operacion-api';

type PartnerPerson = Person;
type PartnerUnit = Unit;

/** Datos reales del socio autenticado: su perfil (por id de cuenta), las
 * unidades de las que figura como propietario (Vehicle.partnerId), y el
 * corredor (org) de SU asociacion -- para traducir codigos de ruta a los
 * nombres reales en vez de "Juli"/"Puno" fijos. */
function usePartnerData() {
  const { user } = useAuth();
  const [people, setPeople] = useState<PartnerPerson[]>([]);
  const [units, setUnits] = useState<PartnerUnit[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPeople(), fetchVehicles(), fetchMyOrganization()])
      .then(([peopleList, unitsList, orgResult]) => {
        if (cancelled) return;
        setPeople(peopleList);
        setUnits(unitsList);
        setOrg(orgResult);
      })
      .catch(() => { /* se degrada a listas vacias mientras tanto */ });
    return () => { cancelled = true; };
  }, [user?.id]);

  const profile = people.find(person => person.role === 'SOCIO' && Boolean(user?.id) && person.id === user!.id)
    ?? people.find(person => person.role === 'SOCIO' && Boolean(user?.email) && person.email.toLowerCase() === user!.email.toLowerCase());
  const myUnits = units.filter(unit => profile ? unit.partnerId === profile.id : unit.code === user?.code);

  return { profile, myUnits, mainCode: myUnits[0]?.code || user?.code, org };
}

type Section = 'resumen' | 'unidades' | 'viajes' | 'manifiestos' | 'produccion' | 'incidencias' | 'gps-vivo' | 'gps-historial' | 'gps-alertas' | 'gps-plan';

const NAV_ITEMS: NavItem[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'unidades', label: 'Mis unidades', icon: Truck },
  { id: 'viajes', label: 'Viajes', icon: Route },
  { id: 'manifiestos', label: 'Manifiestos', icon: FileText },
  { id: 'produccion', label: 'Producción', icon: TrendingUp },
  { id: 'incidencias', label: 'Incidencias', icon: AlertTriangle },
  { id: 'gps-vivo', label: 'GPS de mis unidades', icon: MapPin },
  { id: 'gps-historial', label: 'Historial GPS', icon: History },
  { id: 'gps-alertas', label: 'Alertas GPS', icon: Bell },
  { id: 'gps-plan', label: 'Plan GPS', icon: CreditCard },
];

function PartnerSummary() {
  const { user } = useAuth();
  const { myUnits, mainCode } = usePartnerData();
  const myUnit = myUnits[0];
  const hasVehicleGPS = ['015', '045'].includes(mainCode || '');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [queueJP, setQueueJP] = useState<QueueEntry[]>([]);

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

  const myTrip = trips.find(t => t.code === mainCode);
  const myManifests = manifests.filter(m => m.code === mainCode);
  const myQueueEntry = queueJP.find(e => e.code === mainCode);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-t1">Hola, {user?.name?.split(' ')[0]}</h1>
        <p className="text-sm text-t2 mt-0.5">ATIPCAR · Socio · Código {mainCode ?? user?.code ?? '—'} · {new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
      </div>

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
              <Radio size={15} className="text-ok" />
              <p className="text-sm font-semibold text-t1">GPS Vehicular activo</p>
            </div>
            <p className="text-sm text-t2 mt-1">La unidad {myUnit.code} está en línea. {myUnit.currentDriverName} recibe las funciones GPS operativas mientras permanezca asignado.</p>
          </div>
          <span className="text-sm font-medium text-primary">Plan particular por unidad</span>
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

function ReadonlySection({ title, description }: { title: string; description: string }) {
  const { mainCode, org } = usePartnerData();
  const [allManifests, setAllManifests] = useState<Manifest[]>([]);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchManifests(), fetchTrips()])
      .then(([manifestsList, tripsList]) => {
        if (cancelled) return;
        setAllManifests(manifestsList);
        setAllTrips(tripsList);
      })
      .catch(() => { /* se degrada a listas vacias mientras tanto */ });
    return () => { cancelled = true; };
  }, []);

  const manifests = allManifests.filter(m => m.code === mainCode);
  const trips = allTrips.filter(t => t.code === mainCode);

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <h1 className="text-2xl font-bold text-t1">{title}</h1>
      <p className="text-sm text-t2">{description}</p>
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
      {(title === 'Producción' || title === 'Incidencias') && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center">
          <p className="text-sm text-t2">Datos disponibles próximamente.</p>
        </div>
      )}
    </div>
  );
}


function usePartnerGPSUnit() {
  const { user } = useAuth();
  const { profile, myUnits, mainCode } = usePartnerData();
  const unit = myUnits[0];
  return { user, profile, unit, code: unit?.code || mainCode || user?.code || '—' };
}

function GPSDemoNotice() {
  return (
    <div className="bg-warn/5 border border-warn/30 px-4 py-3 text-sm text-t2 flex items-start gap-2">
      <AlertTriangle size={15} className="text-warn mt-0.5 flex-shrink-0" />
      <span>Vista de prueba: la posición presentada no proviene de un dispositivo conectado.</span>
    </div>
  );
}

function PartnerGPSLive() {
  const { unit, code } = usePartnerGPSUnit();
  const [signalView, setSignalView] = useState<'ACTUAL' | 'SIN_SENAL'>('ACTUAL');
  const online = signalView === 'ACTUAL';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-t1">GPS de mi unidad</h1>
          <p className="text-sm text-t2 mt-0.5">Unidad {code} · {unit?.plate || 'Sin placa'} · Teltonika FMC130</p>
        </div>
        <span className="inline-flex items-center gap-1.5 bg-ok/10 text-ok text-xs font-medium px-2.5 py-1 rounded">
          <span className="w-1.5 h-1.5 bg-ok rounded-full" /> Plan GPS activo
        </span>
      </div>

      <GPSDemoNotice />

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        <div className="bg-surface border border-border overflow-hidden">
          <div className="h-80 bg-bg relative" aria-label="Minimapa GPS del socio">
            <div className="absolute inset-x-5 top-4 flex items-center justify-between text-[11px] text-muted">
              <span>RECORRIDO JULI → PUNO</span><span>{online ? 'Última señal: ahora' : 'Última señal: 08:42'}</span>
            </div>
            <div className="absolute left-16 right-16 top-1/2 h-1 bg-primary/20" />
            <div className="absolute left-12 top-[calc(50%-16px)] w-8 h-8 rounded-full border-2 border-primary bg-surface flex items-center justify-center text-[10px] font-bold text-primary">JULI</div>
            <div className="absolute right-12 top-[calc(50%-16px)] w-8 h-8 rounded-full border-2 border-primary bg-surface flex items-center justify-center text-[10px] font-bold text-primary">PUNO</div>
            {online ? (
              <div className="absolute left-[54%] top-[calc(50%-20px)] w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow">
                <Truck size={17} />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="mt-24 bg-surface border border-warn/40 px-4 py-2 text-xs text-warn flex items-center gap-2">
                  <WifiOff size={14} /> Sin señal. No se muestra ni se inventa una posición.
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-border px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-t2">Teltonika FMC130 → Traccar → CHASKI AI</span>
            <div className="flex gap-2">
              <button onClick={() => setSignalView('ACTUAL')} className={'h-9 px-3 text-sm rounded-lg border ' + (online ? 'border-ok/40 bg-ok/10 text-ok' : 'border-border text-t2')}>Señal actual</button>
              <button onClick={() => setSignalView('SIN_SENAL')} className={'h-9 px-3 text-sm rounded-lg border ' + (!online ? 'border-warn/40 bg-warn/10 text-warn' : 'border-border text-t2')}>Ver pérdida de señal</button>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border divide-y divide-border">
          <div className="p-4">
            <p className="text-xs text-t2 uppercase mb-2">Estado del vehículo</p>
            <div className="flex items-center gap-2">
              {online ? <Radio size={16} className="text-ok" /> : <WifiOff size={16} className="text-warn" />}
              <span className={'text-sm font-semibold ' + (online ? 'text-ok' : 'text-warn')}>{online ? 'En línea' : 'Sin señal'}</span>
            </div>
          </div>
          {[
            ['Unidad', code],
            ['Placa', unit?.plate || 'Sin placa'],
            ['Conductor actual', unit?.currentDriverName || 'Sin conductor'],
            ['Ignición', online ? 'Encendida' : 'Sin dato reciente'],
            ['Distancia de jornada', online ? '61 km' : 'Último dato: 61 km'],
            ['Plan', 'GPS Vehicular particular'],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-3 text-sm flex justify-between gap-3">
              <span className="text-t2">{label}</span><strong className="text-t1 text-right">{value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-surface border border-border p-4">
          <h2 className="text-base font-semibold text-t1">Actividad de hoy</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-t2">Inicio de jornada</span><strong className="text-t1">06:42</strong></div>
            <div className="flex justify-between"><span className="text-t2">Tiempo en movimiento</span><strong className="text-t1">1 h 08 min</strong></div>
            <div className="flex justify-between"><span className="text-t2">Paradas detectadas</span><strong className="text-t1">2</strong></div>
            <div className="flex justify-between"><span className="text-t2">Estado</span><strong className="text-ok">En recorrido</strong></div>
          </div>
        </div>
        <div className="bg-primary/5 border border-primary/25 p-4">
          <h2 className="text-base font-semibold text-t1">Beneficio para el conductor asignado</h2>
          <p className="text-sm text-t2 mt-2 leading-relaxed">{unit?.currentDriverName || 'El conductor'} puede ver esta jornada, el estado de señal y los recorridos realizados por él. No puede administrar tu plan ni consultar el historial de otros conductores.</p>
          <span className="inline-flex mt-3 text-sm font-medium text-primary">Acceso derivado de la unidad {code}</span>
        </div>
      </div>
    </div>
  );
}

function PartnerGPSHistory() {
  const { unit, code } = usePartnerGPSUnit();
  const records = [
    { date: '29/08/2026', driver: unit?.currentDriverName || 'Conductor asignado', route: 'Juli → Puno', start: '06:42', end: '08:18', duration: '1 h 36 min', km: '84 km', stops: '2' },
    { date: '28/08/2026', driver: unit?.currentDriverName || 'Conductor asignado', route: 'Puno → Juli', start: '14:08', end: '15:46', duration: '1 h 38 min', km: '86 km', stops: '3' },
    { date: '27/08/2026', driver: unit?.currentDriverName || 'Conductor asignado', route: 'Juli → Puno', start: '07:01', end: '08:39', duration: '1 h 38 min', km: '85 km', stops: '2' },
  ];
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div><h1 className="text-2xl font-bold text-t1">Historial GPS</h1><p className="text-sm text-t2 mt-0.5">Historial completo de la unidad {code} · {unit?.plate || 'Sin placa'}</p></div>
      <GPSDemoNotice />
      <div className="flex gap-2 flex-wrap">
        <input type="date" defaultValue="2026-08-27" className="h-9 px-3 border border-border rounded-lg text-sm bg-surface" />
        <input type="date" defaultValue="2026-08-29" className="h-9 px-3 border border-border rounded-lg text-sm bg-surface" />
        <select className="h-9 px-3 border border-border rounded-lg text-sm bg-surface"><option>Unidad {code} · {unit?.plate}</option></select>
        <button className="h-9 px-3 bg-primary text-white rounded-lg text-sm font-medium">Aplicar filtros</button>
        <button className="h-9 px-3 border border-border text-t1 rounded-lg text-sm font-medium">Descargar reporte</button>
      </div>
      <div className="bg-surface border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead><tr className="bg-bg border-b border-border">
            {['Fecha','Conductor','Ruta','Inicio','Fin','Duración','Distancia','Paradas','Acción'].map(label => <th key={label} className="px-4 py-2.5 text-left text-t2 font-medium">{label}</th>)}
          </tr></thead>
          <tbody>{records.map(row => (
            <tr key={row.date} className="border-b border-border last:border-0">
              <td className="px-4 py-3 text-t1">{row.date}</td><td className="px-4 py-3 text-t1">{row.driver}</td><td className="px-4 py-3 text-t1">{row.route}</td>
              <td className="px-4 py-3 font-mono text-t2">{row.start}</td><td className="px-4 py-3 font-mono text-t2">{row.end}</td>
              <td className="px-4 py-3 text-t2">{row.duration}</td><td className="px-4 py-3 text-t2">{row.km}</td><td className="px-4 py-3 text-t2">{row.stops}</td>
              <td className="px-4 py-3"><button className="px-2.5 py-1 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">Ver recorrido</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {[['Kilómetros','255 km'],['Tiempo en movimiento','4 h 52 min'],['Paradas detectadas','7']].map(([label,value]) => (
          <div key={label} className="border border-border bg-surface p-4"><p className="text-sm text-t2">{label}</p><p className="text-2xl font-bold text-t1 mt-1">{value}</p></div>
        ))}
      </div>
    </div>
  );
}

function PartnerGPSAlerts() {
  const { unit, code } = usePartnerGPSUnit();
  const [settings, setSettings] = useState({ disconnected: true, ignition: true, geofence: true, power: true });
  const toggle = (key: keyof typeof settings) => setSettings(current => ({ ...current, [key]: !current[key] }));
  const items: Array<[keyof typeof settings, string, string]> = [
    ['disconnected', 'Dispositivo sin señal', 'Avisar después del tiempo de tolerancia configurado.'],
    ['ignition', 'Encendido fuera de horario', 'Notificar cuando se detecte ignición fuera de la jornada.'],
    ['geofence', 'Entrada o salida de terminal', 'Avisar al entrar o salir de las zonas de Juli y Puno.'],
    ['power', 'Desconexión de alimentación', 'Avisar si el equipo deja de recibir energía principal.'],
  ];
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div><h1 className="text-2xl font-bold text-t1">Alertas GPS</h1><p className="text-sm text-t2 mt-0.5">Preferencias del propietario para la unidad {code} · {unit?.plate}</p></div>
      <GPSDemoNotice />
      <div className="bg-surface border border-border divide-y divide-border">
        {items.map(([key,label,description]) => (
          <div key={key} className="p-4 flex items-center justify-between gap-4">
            <div><p className="text-sm font-medium text-t1">{label}</p><p className="text-sm text-t2 mt-0.5">{description}</p></div>
            <button onClick={() => toggle(key)} aria-label={label} className={'w-10 h-5 rounded-full relative transition-colors ' + (settings[key] ? 'bg-primary' : 'bg-border')}>
              <span className={'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ' + (settings[key] ? 'left-5' : 'left-0.5')} />
            </button>
          </div>
        ))}
      </div>
      <div className="bg-surface border border-border p-4">
        <p className="text-sm font-semibold text-t1 mb-3">Últimos eventos de la unidad</p>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><span className="text-t1">Salida de Terminal Juli</span><span className="text-t2">Hoy 06:42</span></div>
          <div className="flex justify-between gap-4"><span className="text-t1">Ignición encendida</span><span className="text-t2">Hoy 06:39</span></div>
          <div className="flex justify-between gap-4"><span className="text-t1">Señal GPS estable</span><span className="text-t2">Ahora</span></div>
        </div>
      </div>
      <p className="text-sm text-muted">Las alertas informan; no generan sanciones automáticas.</p>
    </div>
  );
}

function PartnerGPSPlan() {
  const { profile, unit, code } = usePartnerGPSUnit();
  const [coverage, setCoverage] = useState<'INDIVIDUAL' | 'ASOCIACION'>('INDIVIDUAL');
  const associationCovered = coverage === 'ASOCIACION';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div><h1 className="text-2xl font-bold text-t1">Plan GPS Vehicular</h1><p className="text-sm text-t2 mt-0.5">Suscripción vinculada a la unidad {code} · {unit?.plate || 'Sin placa'}</p></div>
      <div className="bg-surface border border-border overflow-hidden">
        <div className="p-5 border-b border-border flex items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-t1">CHASKI GPS Vehicular</p><p className="text-sm text-t2 mt-1">{associationCovered ? 'Cubierto por el plan PRO de ATIPCAR' : 'Contratación individual del socio'}</p></div>
          <span className="bg-ok/10 text-ok text-xs px-2 py-0.5 rounded font-medium">ACTIVO</span>
        </div>
        <div className="divide-y divide-border text-sm">
          <div className="px-5 py-3 flex justify-between"><span className="text-t2">Titular</span><strong className="text-t1">{profile?.name || unit?.partnerName || 'Socio propietario'}</strong></div>
          <div className="px-5 py-3 flex justify-between"><span className="text-t2">Unidad cubierta</span><strong className="text-t1">{code} · {unit?.plate}</strong></div>
          <div className="px-5 py-3 flex justify-between"><span className="text-t2">Conductor asignado</span><strong className="text-t1">{unit?.currentDriverName || 'Sin conductor'}</strong></div>
          <div className="px-5 py-3 flex justify-between"><span className="text-t2">Dispositivo</span><strong className="text-t1">Teltonika FMC130 · IMEI ••••0045</strong></div>
          <div className="px-5 py-3 flex justify-between"><span className="text-t2">Facturación</span><strong className="text-t1">{associationCovered ? 'Cubierta por asociación' : 'Mensual por unidad'}</strong></div>
          <div className="px-5 py-3 flex justify-between"><span className="text-t2">Próxima renovación</span><strong className="text-t1">{associationCovered ? 'No aplica al socio' : '29/09/2026'}</strong></div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-primary/25 bg-primary/5 p-4">
          <p className="text-sm font-medium text-t1">Acceso del socio propietario</p>
          <p className="text-sm text-t2 mt-2 leading-relaxed">Ubicación, historial completo, conductores asignados, alertas, reportes y administración de la suscripción.</p>
        </div>
        <div className="border border-border bg-surface p-4">
          <p className="text-sm font-medium text-t1">Acceso del conductor asignado</p>
          <p className="text-sm text-t2 mt-2 leading-relaxed">Viaje actual, señal GPS, eventos de su jornada y recorridos realizados por él. El acceso termina al desvincularlo de la unidad.</p>
        </div>
      </div>

      <div className="border border-border p-4">
        <p className="text-sm font-medium text-t1">Transición sin doble cobro</p>
        <p className="text-sm text-t2 mt-2 leading-relaxed">Si ATIPCAR contrata PRO, el dispositivo y su historial se conservan. La suscripción pasa a estar cubierta por la asociación y se aplica el ajuste comercial correspondiente.</p>
        <button onClick={() => setCoverage(associationCovered ? 'INDIVIDUAL' : 'ASOCIACION')} className="mt-4 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium">
          {associationCovered ? 'Volver a contratación individual' : 'Ver cobertura por asociación'}
        </button>
      </div>

      <div className="text-sm text-t2 border border-border p-4">El Super Admin verifica el pago, crea la orden de instalación y configura el equipo, la SIM y la conexión con Traccar.</div>
    </div>
  );
}

export default function PartnerApp({ onLogout }: { onLogout?: () => void }) {
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

  return (
    <Shell navItems={NAV_ITEMS} activeSection={section} onNavigate={(id) => navigateSection(id as Section)} onLogout={onLogout}>
      {section === 'resumen' && <PartnerSummary />}
      {section === 'unidades' && <PartnerUnits />}
      {section === 'viajes' && <ReadonlySection title="Viajes" description="Historial de viajes de tu unidad." />}
      {section === 'manifiestos' && <ReadonlySection title="Manifiestos" description="Manifiestos de tu unidad autorizados para consulta." />}
      {section === 'produccion' && <ReadonlySection title="Producción" description="Producción y recaudación de tu unidad." />}
      {section === 'incidencias' && <ReadonlySection title="Incidencias" description="Incidencias y reubicaciones de tu unidad." />}
      {section === 'gps-vivo' && <PartnerGPSLive />}
      {section === 'gps-historial' && <PartnerGPSHistory />}
      {section === 'gps-alertas' && <PartnerGPSAlerts />}
      {section === 'gps-plan' && <PartnerGPSPlan />}
    </Shell>
  );
}
