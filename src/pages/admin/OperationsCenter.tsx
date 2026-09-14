import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertTriangle, ArrowRight, Clock, CheckCircle, AlertCircle,
  TrendingUp, Truck, Users, MapPin, Wifi, WifiOff, Sparkles,
} from 'lucide-react';
import type { QueueEntry, Trip, Manifest, RelocationOrder } from '../../types';
import { useAdminDemo } from './AdminApp';
import { getQueueDisplayOrder, getOperationalPosition } from '../../lib/queue-ui';
import {
  fetchQueue, fetchTrips, fetchManifests, fetchRelocations, advanceQueueEntry, routeLabel, routeLabelShort, terminalName,
  fetchGpsLive, fetchOperationalConfig, type LiveVehiclePosition, type OperationalConfig,
  fetchDailyDigest, type DailyDigestFacts, fetchVehicles, fetchGpsDevices, type VehicleGpsStatus,
} from '../../lib/operacion-api';
import LiveFleetMap, { ROUTE_COLOR } from '../../components/LiveFleetMap';
import GpsAlertBanner from '../../components/GpsAlertBanner';

const GPS_WIDGET_REFRESH_MS = 15000;

function QueueSummary({ title, entries, dir, onCallNext }: {
  title: string; entries: QueueEntry[]; dir: 'jp' | 'pj';
  onCallNext?: () => void;
}) {
  const waiting = entries.filter(e => ['INSCRITO', 'PREINSCRITO'].includes(e.status)).length;
  const active = entries.filter(e => ['LLAMADO', 'EN TERMINAL', 'EMBARCANDO', 'LISTO'].includes(e.status)).length;
  const gone = entries.filter(e => e.status === 'SALIO').length;

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden flex-1">
      <div className={`px-5 py-3.5 border-b border-border flex items-center justify-between ${dir === 'jp' ? 'bg-primary/5' : 'bg-teal/5'}`}>
        <h3 className={`text-base font-semibold ${dir === 'jp' ? 'text-primary' : 'text-teal'}`}>{title}</h3>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${dir === 'jp' ? 'bg-primary/10 text-primary' : 'bg-teal/10 text-teal'}`}>
          Jornada abierta
        </span>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-t1">{waiting}</div>
            <div className="text-sm text-t2 mt-1">En espera</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-accent">{active}</div>
            <div className="text-sm text-t2 mt-1">Activos</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-t2">{gone}</div>
            <div className="text-sm text-t2 mt-1">Salidos</div>
          </div>
        </div>
        <div className="space-y-2">
          {getQueueDisplayOrder(entries).slice(0, 5).map(({ entry: e, displayPos }) => {
            const op = getOperationalPosition(e, entries);
            return (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-t2 text-right font-mono">{displayPos ?? '—'}</span>
                <span className="font-medium text-t1 w-8">{e.code}</span>
                <span className="flex-1 text-t2 truncate">{e.driverName}</span>
                <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${op.className}`}>{op.label}</span>
              </div>
            );
          })}
          {entries.length > 5 && (
            <p className="text-sm text-t2 pt-1">+{entries.length - 5} más en cola</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface Props { onNavigate: (s: string) => void; }

export default function OperationsCenter({ onNavigate }: Props) {
  const { isPRO, org } = useAdminDemo();
  const [callConfirm, setCallConfirm] = useState(false);
  const [queueJP, setQueueJP] = useState<QueueEntry[]>([]);
  const [queuePJ, setQueuePJ] = useState<QueueEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [relocations, setRelocations] = useState<RelocationOrder[]>([]);
  const [now, setNow] = useState(new Date());
  const [version, setVersion] = useState(0);
  const [gpsPositions, setGpsPositions] = useState<LiveVehiclePosition[] | null>(null);
  const [gpsConfig, setGpsConfig] = useState<OperationalConfig | null>(null);
  const [digestSummary, setDigestSummary] = useState<string | null>(null);
  const [digestFacts, setDigestFacts] = useState<DailyDigestFacts | null>(null);
  const [digestLoading, setDigestLoading] = useState(true);
  const [totalUnits, setTotalUnits] = useState<number | null>(null);
  const [offlineDevice, setOfflineDevice] = useState<VehicleGpsStatus | null>(null);

  // Resumen diario para el gerente (ia-aplicada.md §2.3) -- se pide una vez al
  // abrir el panel, no en cada refresco de las colas. Best-effort: si falla o
  // Claude no esta configurado, la tarjeta simplemente no aparece (nunca
  // bloquea ni rompe el resto del panel).
  useEffect(() => {
    let cancelled = false;
    fetchDailyDigest()
      .then(res => {
        if (cancelled) return;
        setDigestFacts(res.facts);
        setDigestSummary(res.summary);
      })
      .catch(() => { /* se degrada sin mostrar la tarjeta */ })
      .finally(() => { if (!cancelled) setDigestLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  // Mismo mapa real (GPS PRO) que la pantalla completa -- se pide solo si el
  // widget de abajo va a mostrarse, para no gastar cuota de Traccar/Maps en
  // asociaciones que estan en Plan Operacion.
  const refreshGps = useCallback(() => {
    if (!isPRO) return;
    fetchGpsLive().then(setGpsPositions).catch(() => { /* el mapa se queda mostrando lo ultimo que tenia */ });
  }, [isPRO]);

  useEffect(() => {
    if (!isPRO) return;
    fetchOperationalConfig().then(setGpsConfig).catch(() => { /* se queda con el centro por defecto del mapa */ });
    refreshGps();
    const id = setInterval(refreshGps, GPS_WIDGET_REFRESH_MS);
    return () => clearInterval(id);
  }, [isPRO, refreshGps]);

  // Tarjeta de alerta GPS del resumen: solo aparece si de verdad hay una
  // unidad vinculada sin señal -- nunca un texto fijo (ia-aplicada.md §2.6).
  useEffect(() => {
    if (!isPRO) return;
    let cancelled = false;
    fetchGpsDevices()
      .then(list => { if (!cancelled) setOfflineDevice(list.find(d => d.linked && d.online === 'offline') ?? null); })
      .catch(() => { /* se degrada sin mostrar la tarjeta */ });
    return () => { cancelled = true; };
  }, [isPRO]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchQueue('JULI_PUNO'), fetchQueue('PUNO_JULI'), fetchTrips(), fetchManifests(), fetchRelocations()])
      .then(([jp, pj, tripsList, manifestsList, relocationsList]) => {
        if (cancelled) return;
        setQueueJP(jp);
        setQueuePJ(pj);
        setTrips(tripsList);
        setManifests(manifestsList);
        setRelocations(relocationsList);
      })
      .catch(() => { /* se degrada a listas vacias mientras tanto */ });
    return () => { cancelled = true; };
  }, [version]);

  useEffect(() => {
    let cancelled = false;
    fetchVehicles().then(list => { if (!cancelled) setTotalUnits(list.length); }).catch(() => { /* se degrada sin mostrar el total */ });
    return () => { cancelled = true; };
  }, []);

  const todayLabel = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeLabel = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });

  const activeRelocation = relocations.find(r => r.status !== 'COMPLETADA');
  const incidentManifest = manifests.find(m => m.status === 'CON_INCIDENCIA');

  const FLEET_JP_TERMINAL = useMemo(() => queueJP.filter(e => ['PREINSCRITO', 'INSCRITO', 'LISTO', 'EMBARCANDO', 'LLAMADO', 'EN TERMINAL'].includes(e.status)), [queueJP]);
  const FLEET_PJ_TERMINAL = useMemo(() => queuePJ.filter(e => ['PREINSCRITO', 'INSCRITO', 'LISTO', 'LLAMADO', 'EN TERMINAL'].includes(e.status)), [queuePJ]);
  const FLEET_EN_RUTA_JP = useMemo(() => trips.filter(t => t.route === 'JULI_PUNO' && t.status === 'ACTIVO'), [trips]);
  const FLEET_EN_RUTA_PJ = useMemo(() => trips.filter(t => t.route === 'PUNO_JULI' && ['ACTIVO', 'CON_INCIDENCIA'].includes(t.status)), [trips]);

  const nextToCall = queueJP.find(e => e.status === 'INSCRITO');
  const activeTrips = trips.filter(t => t.status === 'ACTIVO');
  const openManifests = manifests.filter(m => m.status === 'BORRADOR').length;
  const totalPassengers = manifests.reduce((s, m) => s + m.passengers.length, 0);
  const totalRevenue = manifests.reduce((s, m) => s + m.passengers.reduce((a, p) => a + p.fare, 0), 0);

  const handleCallNext = async () => {
    if (!nextToCall) return;
    try {
      await advanceQueueEntry(nextToCall.id, 'LLAMADO');
      setVersion(v => v + 1);
    } finally {
      setCallConfirm(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-bold text-t1">Centro de Operaciones</h1>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2 text-sm font-medium text-ok bg-ok/10 px-3.5 py-1.5 rounded-full">
            <CheckCircle size={14} />
            Jornada activa
          </div>
          <p className="text-sm text-t2">
            <span className="font-mono font-semibold text-t1">{timeLabel}</span> · {todayLabel} — Jornada Mañana
          </p>
        </div>
      </div>

      {isPRO && <GpsAlertBanner />}

      {/* Resumen diario IA (ia-aplicada.md §2.3) -- las cifras ya las calculo
          el backend con Prisma; Claude solo las redacta. Si no hay resumen en
          prosa (Claude no configurado o fallo puntual), se arma una version
          simple con los mismos `facts` en vez de ocultar la tarjeta entera. */}
      {!digestLoading && digestFacts && (
        <div className="bg-gradient-to-r from-primary/5 to-transparent border border-primary/20 rounded-lg px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Resumen del día (IA)</p>
            <p className="text-sm text-t1 leading-relaxed">
              {digestSummary ?? [
                `Hoy se completaron ${digestFacts.vueltasCompletadasHoy} vuelta(s), con ${digestFacts.pasajerosTransportadosHoy} pasajero(s) transportado(s) y S/ ${digestFacts.recaudacionHoy} recaudados.`,
                digestFacts.manifiestosPendientesDeDigitalizar > 0
                  ? `Hay ${digestFacts.manifiestosPendientesDeDigitalizar} manifiesto(s) pendiente(s) de digitalizar.`
                  : '',
                digestFacts.inscripcionesRetrasadasPendientesAhora > 0
                  ? `Hay ${digestFacts.inscripcionesRetrasadasPendientesAhora} inscripción(es) retrasada(s) esperando resolución.`
                  : '',
                digestFacts.anomaliasRecaudacionHoy.length > 0
                  ? `${digestFacts.anomaliasRecaudacionHoy.length} manifiesto(s) quedaron marcados para revisar por una caída de recaudación frente a su historial (no es una acusación).`
                  : '',
              ].filter(Boolean).join(' ')}
            </p>
          </div>
        </div>
      )}

      {/* Day totals */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Pasajeros hoy', value: totalPassengers, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Recaudación', value: `S/ ${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-ok', bg: 'bg-ok/10' },
          { label: 'Viajes activos', value: activeTrips.length, icon: Truck, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'Manifiestos abiertos', value: openManifests, icon: AlertCircle, color: 'text-warn', bg: 'bg-warn/10' },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-border rounded-lg px-5 py-4 flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${item.bg}`}>
              <item.icon size={22} className={item.color} />
            </div>
            <div>
              <div className="text-2xl font-bold text-t1 leading-tight">{item.value}</div>
              <div className="text-sm text-t2 mt-0.5">{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Fleet Distribution */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-t1">Distribución de flota</h2>
          <span className="text-sm text-muted">Mostrando {queueJP.length + queuePJ.length + activeTrips.length + FLEET_EN_RUTA_PJ.length + (activeRelocation?.units.length ?? 0)} de {totalUnits ?? '—'} unidades</span>
        </div>
        <div className="grid grid-cols-7 gap-3">
          {[
            {
              label: `En ${terminalName('JULI', org)}`,
              sublabel: `Terminal ${terminalName('JULI', org)}`,
              count: FLEET_JP_TERMINAL.length,
              bg: 'bg-primary/5 border-primary/20',
              textColor: 'text-primary',
              detail: `${FLEET_JP_TERMINAL.filter(e => ['LLAMADO','EN TERMINAL','EMBARCANDO'].includes(e.status)).length} activos, ${FLEET_JP_TERMINAL.filter(e => ['INSCRITO','PREINSCRITO'].includes(e.status)).length} en espera`,
            },
            {
              label: `Ruta ${routeLabelShort('JULI_PUNO', org)}`,
              sublabel: routeLabel('JULI_PUNO', org).replace(' → ', ' a '),
              count: FLEET_EN_RUTA_JP.length,
              bg: 'bg-ok/5 border-ok/20',
              textColor: 'text-ok',
              detail: FLEET_EN_RUTA_JP.map(t => t.code).join(', ') || '—',
            },
            {
              label: `En ${terminalName('PUNO', org)}`,
              sublabel: `Terminal ${terminalName('PUNO', org)}`,
              count: FLEET_PJ_TERMINAL.length,
              bg: 'bg-teal/5 border-teal/20',
              textColor: 'text-teal',
              detail: `${FLEET_PJ_TERMINAL.filter(e => ['LLAMADO','EN TERMINAL'].includes(e.status)).length} activos, ${FLEET_PJ_TERMINAL.filter(e => ['INSCRITO','PREINSCRITO'].includes(e.status)).length} en espera`,
            },
            {
              label: `Ruta ${routeLabelShort('PUNO_JULI', org)}`,
              sublabel: routeLabel('PUNO_JULI', org).replace(' → ', ' a '),
              count: FLEET_EN_RUTA_PJ.length,
              bg: 'bg-ok/5 border-ok/20',
              textColor: 'text-ok',
              detail: FLEET_EN_RUTA_PJ.map(t => t.code).join(', ') || '—',
            },
            {
              label: 'Reubicación',
              sublabel: 'En traslado',
              count: activeRelocation?.units.length ?? 0,
              bg: 'bg-accent/5 border-accent/20',
              textColor: 'text-accent',
              detail: activeRelocation ? `Orden ${activeRelocation.internalOrder}` : 'Sin reubicaciones activas',
            },
            {
              label: 'Ausente',
              sublabel: 'No confirmado',
              count: queuePJ.filter(e => e.status === 'AUSENTE').length,
              bg: 'bg-danger/5 border-danger/20',
              textColor: 'text-danger',
              detail: 'Requiere revisión',
            },
            {
              label: 'Sin confirmar',
              sublabel: 'Preinscrito',
              count: [...queueJP, ...queuePJ].filter(e => e.status === 'PREINSCRITO').length,
              bg: 'bg-border/30 border-border',
              textColor: 'text-t2',
              detail: 'Solo registro móvil',
            },
          ].map(item => (
            <div key={item.label} className={`rounded-lg border p-4 ${item.bg}`}>
              <div className={`text-3xl font-bold ${item.textColor}`}>{item.count}</div>
              <div className="text-sm font-semibold text-t1 mt-1.5">{item.label}</div>
              <div className="text-xs text-t2 mt-0.5">{item.sublabel}</div>
              <div className="text-xs text-t2 mt-2 leading-snug">{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mapa real de GPS PRO (mismo componente que la pantalla completa) */}
      {isPRO && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-ok" />
              <h3 className="text-base font-semibold text-t1">GPS en vivo</h3>
              <span className="text-[11px] font-bold bg-ok/10 text-ok px-1.5 py-0.5 rounded uppercase">PRO</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-t2 flex items-center gap-1.5">
                <Wifi size={13} className="text-ok" /> {gpsPositions?.length ?? 0} con señal
              </span>
              <button onClick={() => onNavigate('gps-live')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                Ver completo <ArrowRight size={14} />
              </button>
            </div>
          </div>
          <div className="flex flex-col md:flex-row">
            <div className="md:w-1/2 flex-shrink-0">
              <LiveFleetMap positions={gpsPositions} config={gpsConfig} org={org} heightClass="h-56" compact />
            </div>
            <div className="md:w-1/2 border-t md:border-t-0 md:border-l border-border flex flex-col">
              <div className="px-4 py-2 border-b border-border flex-shrink-0">
                <h4 className="text-sm font-semibold text-t2">Unidades con señal</h4>
              </div>
              <div className="flex-1 overflow-y-auto md:h-56">
                {(gpsPositions ?? []).length === 0 ? (
                  <p className="px-4 py-6 text-sm text-t2 text-center">
                    {gpsPositions === null ? 'Cargando…' : 'Ninguna unidad con señal GPS ahora.'}
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {gpsPositions!.map(p => (
                      <div key={p.vehicleId} className="px-4 py-2 flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-semibold text-t1 flex-shrink-0">{p.code}</span>
                          <span className="text-t2 truncate">{p.companyName}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {p.route ? (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white"
                              style={{ backgroundColor: ROUTE_COLOR[p.route] }}
                            >
                              {routeLabelShort(p.route, org)}
                            </span>
                          ) : (
                            <span className="text-t2 text-xs">Sin ruta</span>
                          )}
                          <span className="text-t2 text-xs w-14 text-right">{p.speedKmh > 0 ? `${p.speedKmh} km/h` : '—'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Queues side by side */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-t1">Colas activas</h2>
          <button onClick={() => onNavigate('colas')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
            Ver detalle <ArrowRight size={14} />
          </button>
        </div>
        <div className="flex gap-4">
          <QueueSummary title={routeLabel('JULI_PUNO', org)} entries={queueJP} dir="jp" />
          <QueueSummary title={routeLabel('PUNO_JULI', org)} entries={queuePJ} dir="pj" />
        </div>
      </div>

      {/* Next departures + Alerts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <Clock size={15} className="text-t2" />
            <h3 className="text-base font-semibold text-t1">Próximas salidas</h3>
          </div>
          <table className="w-full text-sm" aria-label="Próximas salidas">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Cód.</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Ruta</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Conductor</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Salida</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {trips.filter(t => ['PROGRAMADO', 'ACTIVO'].includes(t.status)).slice(0, 5).map(t => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-hover">
                  <td className="px-4 py-3 font-medium text-t1">{t.code}</td>
                  <td className="px-4 py-3 text-t2">{routeLabelShort(t.route, org)}</td>
                  <td className="px-4 py-3 text-t1 truncate max-w-[100px]">{t.driverName.split(' ')[0]}</td>
                  <td className="px-4 py-3 font-mono text-t1">{t.scheduledDeparture}</td>
                  <td className="px-4 py-3">
                    {isPRO && t.gpsStatus === 'GPS_PRO_DEMO'
                      ? <span className="text-ok flex items-center gap-1"><Wifi size={11} /> GPS</span>
                      : <span className="text-t2">{t.gpsStatus === 'REGISTRO_MOVIL' ? 'Móvil' : 'Manual'}</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <AlertTriangle size={15} className="text-warn" />
            <h3 className="text-base font-semibold text-t1">Alertas y decisiones pendientes</h3>
          </div>
          <div className="p-4 space-y-3">
            {activeRelocation && (
              <div className="flex items-start gap-3 p-3.5 rounded-lg border border-warn/30 bg-warn/5">
                <AlertTriangle size={16} className="text-warn mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-t1">Desequilibrio de flota detectado</p>
                  <p className="text-sm text-t2 mt-0.5">{activeRelocation.reason.split('.')[0]}.</p>
                  <button
                    onClick={() => onNavigate('reubicaciones')}
                    className="flex items-center gap-1 mt-2.5 px-3 py-1.5 text-sm font-medium text-warn border border-warn/40 rounded-lg bg-white hover:bg-warn/10 transition-colors"
                  >
                    Revisar reubicación <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}
            {incidentManifest && (
              <div className="flex items-start gap-3 p-3.5 rounded-lg border border-danger/30 bg-danger/5">
                <AlertCircle size={16} className="text-danger mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-t1">Manifiesto con incidencia — {incidentManifest.number}</p>
                  <p className="text-sm text-t2 mt-0.5">Código {incidentManifest.code} · {incidentManifest.correctionReason || 'Requiere revisión.'}</p>
                  <button
                    onClick={() => onNavigate('manifiestos')}
                    className="flex items-center gap-1 mt-2.5 px-3 py-1.5 text-sm font-medium text-danger border border-danger/40 rounded-lg bg-white hover:bg-danger/10 transition-colors"
                  >
                    Ver manifiesto <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}
            {!activeRelocation && !incidentManifest && !nextToCall && !(isPRO && offlineDevice) && (
              <p className="text-sm text-t2 py-2">Sin alertas ni decisiones pendientes por ahora.</p>
            )}
            {nextToCall && (
              <div className="flex items-start gap-3 p-3.5 rounded-lg border border-primary/30 bg-primary/5">
                <Clock size={16} className="text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-t1">Cola {routeLabelShort('JULI_PUNO', org)}: listo para llamar</p>
                  <p className="text-sm text-t2 mt-0.5">Siguiente: Código {nextToCall.code} — {nextToCall.driverName}</p>
                  <button
                    onClick={() => setCallConfirm(true)}
                    className="mt-2.5 px-3 py-1.5 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-h transition-colors"
                  >
                    Llamar siguiente
                  </button>
                </div>
              </div>
            )}
            {isPRO && offlineDevice && (
              <div className="flex items-start gap-3 p-3.5 rounded-lg border border-t2/20 bg-t2/5">
                <WifiOff size={16} className="text-muted mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-t1">GPS PRO — Alerta de señal</p>
                  <p className="text-sm text-t2 mt-0.5">
                    Unidad {offlineDevice.code} sin señal
                    {offlineDevice.lastUpdate ? ` desde ${new Date(offlineDevice.lastUpdate).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}. Requiere revisión técnica.
                  </p>
                  <button
                    onClick={() => onNavigate('gps-alerts')}
                    className="flex items-center gap-1 mt-2.5 px-3 py-1.5 text-sm font-medium text-t1 border border-border rounded-lg bg-white hover:bg-hover transition-colors"
                  >
                    Ver alertas GPS <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vehicles in transit */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
          <Truck size={15} className="text-t2" />
          <h3 className="text-base font-semibold text-t1">Vehículos en ruta</h3>
          <span className="ml-auto text-sm text-t2">{activeTrips.length} activos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Vehículos en ruta">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Cód.</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Placa</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Conductor</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Ruta</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Salida real</th>
                {!isPRO && <th className="text-left px-4 py-2.5 text-t2 font-medium">Fuente</th>}
                {isPRO && <th className="text-left px-4 py-2.5 text-t2 font-medium">GPS PRO</th>}
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {trips.filter(t => ['ACTIVO', 'CON_INCIDENCIA'].includes(t.status)).map(t => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-hover">
                  <td className="px-4 py-3.5 font-medium text-t1">{t.code}</td>
                  <td className="px-4 py-3.5 font-mono text-t1">{t.plate}</td>
                  <td className="px-4 py-3.5 text-t1 truncate max-w-[140px]">{t.driverName}</td>
                  <td className="px-4 py-3.5 text-t2">{routeLabel(t.route, org)}</td>
                  <td className="px-4 py-3.5 font-mono text-t1">{t.actualDeparture ?? t.scheduledDeparture}</td>
                  {!isPRO && (
                    <td className="px-4 py-3.5 text-t2">
                      {t.gpsStatus === 'REGISTRO_MOVIL' ? 'Registro móvil' : 'Sin GPS'}
                    </td>
                  )}
                  {isPRO && (
                    <td className="px-4 py-3.5">
                      <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 w-fit font-medium ${
                        t.gpsStatus === 'GPS_PRO_DEMO' ? 'bg-ok/10 text-ok' :
                        t.gpsStatus === 'REGISTRO_MOVIL' ? 'bg-primary/10 text-primary' :
                        'bg-border text-muted'
                      }`}>
                        {t.gpsStatus === 'GPS_PRO_DEMO' ? <><Wifi size={10} /> En línea</> :
                         t.gpsStatus === 'REGISTRO_MOVIL' ? 'Reg. móvil' : <><WifiOff size={10} /> Sin señal</>}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2 py-1 rounded font-medium ${
                      t.status === 'ACTIVO' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'
                    }`}>
                      {t.status === 'ACTIVO' ? 'En ruta' : 'Con incidencia'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Call confirmation modal */}
      {callConfirm && nextToCall && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-t1 mb-2">Confirmar llamado</h3>
            <p className="text-sm text-t2 mb-4">
              ¿Llamar al código <strong className="text-t1">{nextToCall.code}</strong> — {nextToCall.driverName}?
            </p>
            <p className="text-sm text-t2 mb-4">Esta acción quedará registrada en auditoría.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCallConfirm(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">
                Cancelar
              </button>
              <button onClick={handleCallNext} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h">
                Confirmar llamado
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
