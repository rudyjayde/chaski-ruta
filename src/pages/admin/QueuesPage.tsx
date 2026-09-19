import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, ChevronRight, X, AlertTriangle, Phone, Car, Plus, Loader2, MapPinCheck, ArrowRightCircle, Clock3 } from 'lucide-react';
import type { QueueEntry, QueueStatus, EvidenceType, Unit } from '../../types';
import {
  fetchQueue, fetchVehicles, joinQueue, confirmArrival, advanceQueueEntry,
  declareLater, overrideQueueEntry, departQueueEntry, routeLabel,
} from '../../lib/operacion-api';
import { getOperationalState, getOperationalPosition, getQueueDisplayOrder } from '../../lib/queue-ui';
import { useAdminDemo } from './AdminApp';

const OPERATIONAL_DATE = 'Jornada ' + new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Cadena de avance manual OPCIONAL del gerente -- registro fino de
// trazabilidad (LLAMADO -> EN TERMINAL -> EMBARCANDO -> LISTO), pero desde
// la correccion del 3 de septiembre de 2026 (plan-flujo-colas-hardware.md
// §2, Documento Maestro §6.4) YA NO es requisito para que el conductor
// prepare su manifiesto ni marque su salida -- eso se habilita apenas la
// unidad esta LLAMANDO. No incluye SALIO, que se maneja con "Salió a
// viaje" (crea el Trip real) en vez de un avance mas.
const ADVANCE_CHAIN: Record<string, 'LLAMADO' | 'EN TERMINAL' | 'EMBARCANDO' | 'LISTO'> = {
  INSCRITO: 'LLAMADO',
  LLAMADO: 'EN TERMINAL',
  'EN TERMINAL': 'EMBARCANDO',
  EMBARCANDO: 'LISTO',
};

const STATUS_COLOR: Record<QueueStatus, string> = {
  PREINSCRITO: 'bg-[#F4F4F5] text-t2',
  INSCRITO: 'bg-primary/10 text-primary',
  LLAMADO: 'bg-accent/20 text-accent',
  'EN TERMINAL': 'bg-teal/10 text-teal',
  EMBARCANDO: 'bg-warn/20 text-warn',
  LISTO: 'bg-ok/10 text-ok',
  SALIO: 'bg-t2/10 text-t2',
  AUSENTE: 'bg-danger/10 text-danger',
  RETIRADO: 'bg-t2/10 text-t2',
};

const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  REGISTRO_MOVIL: '📱 Registro móvil',
  PRESENCIA_TERMINAL: '🏛 Presencia terminal',
  VEHICULO_VERIFICADO: '✅ Vehículo verificado — PRO',
  SIN_EVIDENCIA: '— Sin evidencia',
};

const EXCEPTION_REASONS = [
  'No se presentó al llamado',
  'Vehículo con falla mecánica',
  'Conductor ausente por enfermedad',
  'Documentos incompletos',
  'Sanción disciplinaria',
  'Otro (especificar)',
];

const POSITION_FILTERS = [
  { value: 'LLAMANDO', label: 'Llamando' },
  { value: 'EN_COLA', label: 'En cola' },
  { value: 'AUSENTE', label: 'Ausente' },
  { value: 'RETIRADO', label: 'Retirado' },
  { value: 'SALIO', label: 'Salió' },
];

function QueueSlot({
  label,
  description,
  entry,
  tone,
  onSelect,
}: {
  label: string;
  description: string;
  entry?: QueueEntry;
  tone: 'calling' | 'ramp' | 'outside';
  onSelect: (entry: QueueEntry) => void;
}) {
  const toneClasses = {
    calling: 'border-cyan-300 bg-cyan-50',
    ramp: 'border-violet-200 bg-surface',
    outside: 'border-amber-200 bg-surface',
  };
  const labelClasses = {
    calling: 'text-cyan-600',
    ramp: 'text-violet-600',
    outside: 'text-amber-600',
  };

  return (
    <button
      type="button"
      disabled={!entry}
      onClick={() => entry && onSelect(entry)}
      className={'min-h-[92px] w-full border rounded-lg p-3 text-left transition-colors disabled:cursor-default ' + toneClasses[tone] + (entry ? ' hover:border-primary' : '')}
    >
      <span className={'text-[11px] font-semibold uppercase ' + labelClasses[tone]}>{label}</span>
      {entry ? (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-base font-mono text-t1">{entry.code}</strong>
            <span className="text-[11px] font-mono text-t2">{entry.plate}</span>
          </div>
          <p className="text-sm text-t1 mt-1 truncate">{entry.driverName}</p>
          <p className="text-[11px] text-t2 mt-0.5">{description}</p>
        </div>
      ) : (
        <div className="h-12 flex items-center justify-center text-sm italic text-muted">Libre</div>
      )}
    </button>
  );
}

function TerminalPositions({
  entries,
  route,
  onSelect,
}: {
  entries: QueueEntry[];
  route: 'jp' | 'pj';
  onSelect: (entry: QueueEntry) => void;
}) {
  const { calling, waiting } = getOperationalState(entries);
  // Nombres genericos (no "Rampa"/"Exterior") — esa zonificacion fisica es una
  // regla propia de ATIPCAR, no algo que se pueda asumir para toda asociacion.
  // Pendiente de definir con Jayde: notificacion de "listos" vs. configuracion
  // por asociacion (ver conversacion de producto, agosto 2026).
  const slots = [
    { label: 'En cola 2', description: 'Siguiente en turno', entry: waiting[0], tone: 'ramp' as const },
    { label: 'En cola 3', description: 'Siguiente en turno', entry: waiting[1], tone: 'ramp' as const },
    { label: 'En cola 4', description: 'En espera', entry: waiting[2], tone: 'outside' as const },
    { label: 'En cola 5', description: 'En espera', entry: waiting[3], tone: 'outside' as const },
  ];
  const generalQueue = waiting.slice(4);
  const { org } = useAdminDemo();
  const [origin, destination] = route === 'jp'
    ? routeLabel('JULI_PUNO', org).split(' → ')
    : routeLabel('PUNO_JULI', org).split(' → ');

  return (
    <section className="px-6 py-4 bg-bg border-b border-border" aria-label={'Posiciones del terminal de ' + origin}>
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Car size={15} className="text-primary" />
            <h2 className="text-base font-semibold text-t1">Posiciones del Terminal {origin}</h2>
          </div>
          <p className="text-sm text-t2 mt-1">Orden físico de salida hacia {destination}. La rotación mantiene el orden FIFO.</p>
        </div>
        <span className="text-sm text-t2">{generalQueue.length} unidades en cola general</span>
      </div>

      <div className="grid lg:grid-cols-[1.15fr_2fr] gap-3">
        <QueueSlot label="Llamando" description="Registrando pasajeros" entry={calling ?? undefined} tone="calling" onSelect={onSelect} />
        <div className="grid grid-cols-2 gap-3">
          {slots.map(slot => <QueueSlot key={slot.label} {...slot} onSelect={onSelect} />)}
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <p className="text-[11px] font-semibold text-t2 uppercase mb-2">Continúan en cola general</p>
        {generalQueue.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {generalQueue.map((entry, index) => (
              <button key={entry.id} type="button" onClick={() => onSelect(entry)} className="h-9 flex-shrink-0 px-3 border border-border bg-surface hover:border-primary rounded text-sm text-t1">
                <span className="text-primary font-semibold mr-2">#{index + 1}</span>
                <span className="font-mono font-semibold">{entry.code}</span>
                <span className="text-t2 ml-2">{entry.driverName.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted italic">No hay unidades adicionales.</p>
        )}
      </div>
    </section>
  );
}

function QueueTable({ entries, allEntries, onSelect }: { entries: QueueEntry[]; allEntries: QueueEntry[]; onSelect: (e: QueueEntry) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Tabla de cola">
        <thead>
          <tr className="border-b border-border bg-bg text-sm">
            <th className="text-left px-4 py-2.5 text-t2 font-medium w-12">Pos.</th>
            <th className="text-left px-4 py-2.5 text-t2 font-medium w-16">Cód.</th>
            <th className="text-left px-4 py-2.5 text-t2 font-medium">Empresa</th>
            <th className="text-left px-4 py-2.5 text-t2 font-medium">Vehículo</th>
            <th className="text-left px-4 py-2.5 text-t2 font-medium">Placa</th>
            <th className="text-left px-4 py-2.5 text-t2 font-medium">Conductor</th>
            <th className="text-left px-4 py-2.5 text-t2 font-medium">Hora</th>
            <th className="text-left px-4 py-2.5 text-t2 font-medium">Evidencia</th>
            <th className="text-left px-4 py-2.5 text-t2 font-medium">Posición operativa</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {(() => {
            // "Pos." muestra el orden real de salida (LLAMANDO = 1), calculado
            // sobre la cola completa (allEntries) y luego filtrado a lo que
            // esta tabla realmente muestra (entries, ya con busqueda/filtro
            // aplicados) — asi el numero no cambia segun el filtro activo.
            const shownIds = new Set(entries.map(e => e.id));
            return getQueueDisplayOrder(allEntries).filter(row => shownIds.has(row.entry.id));
          })().map(({ entry, displayPos }) => (
            <tr
              key={entry.id}
              className="border-b border-border last:border-0 hover:bg-hover cursor-pointer"
              onClick={() => onSelect(entry)}
            >
              <td className="px-4 py-3 text-t2 font-mono text-sm">{displayPos ?? '—'}</td>
              <td className="px-4 py-3 font-semibold text-t1">{entry.code}</td>
              <td className="px-4 py-3 text-t2 text-sm">{entry.company}</td>
              <td className="px-4 py-3 text-t2 text-sm">{entry.vehicleType}</td>
              <td className="px-4 py-3 font-mono text-t1 text-sm">{entry.plate}</td>
              <td className="px-4 py-3 text-t1 text-sm">{entry.driverName}</td>
              <td className="px-4 py-3 font-mono text-t2 text-sm">{entry.registeredAt}</td>
              <td className="px-4 py-3 text-sm text-t2">{EVIDENCE_LABEL[entry.evidence]}</td>
              <td className="px-4 py-3">
                {(() => {
                  const position = getOperationalPosition(entry, allEntries);
                  return <span className={'text-[11px] px-2 py-0.5 rounded font-medium whitespace-nowrap ' + position.className}>{position.label}</span>;
                })()}
              </td>
              <td className="px-4 py-3">
                <ChevronRight size={14} className="text-muted" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function QueuesPage() {
  const { org } = useAdminDemo();
  const [tab, setTab] = useState<'jp' | 'pj'>('jp');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<QueueEntry | null>(null);
  const [queueJP, setQueueJP] = useState<QueueEntry[]>([]);
  const [queuePJ, setQueuePJ] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [showException, setShowException] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [exceptionNote, setExceptionNote] = useState('');
  const [exceptionNewStatus, setExceptionNewStatus] = useState<'AUSENTE' | 'RETIRADO' | 'INSCRITO'>('AUSENTE');
  const [showJoin, setShowJoin] = useState(false);
  const [vehicles, setVehicles] = useState<Unit[]>([]);
  const [joining, setJoining] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setActionError('');
    try {
      const [jp, pj] = await Promise.all([fetchQueue('JULI_PUNO'), fetchQueue('PUNO_JULI')]);
      setQueueJP(jp);
      setQueuePJ(pj);
      setSelected(prev => {
        if (!prev) return prev;
        const fresh = [...jp, ...pj].find(e => e.id === prev.id);
        return fresh ?? null;
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo cargar la cola');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const rawEntries = tab === 'jp' ? queueJP : queuePJ;
  const entries = rawEntries.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.code.includes(q) || e.plate.toLowerCase().includes(q) || e.driverName.toLowerCase().includes(q);
    const matchStatus = !filterStatus || getOperationalPosition(e, rawEntries).filterKey === filterStatus;
    return matchSearch && matchStatus;
  });

  const nextInscrito = rawEntries.find(e => e.status === 'INSCRITO');
  const currentlyLlamado = rawEntries.find(e => e.status === 'LLAMADO');
  const canCallNext = !!nextInscrito && !currentlyLlamado;
  const routeCode = tab === 'jp' ? 'JULI_PUNO' : 'PUNO_JULI';

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    setActionError('');
    try {
      await fn();
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `No se pudo ${label}`);
    }
  };

  const handleCallNext = () => {
    if (!nextInscrito) return;
    runAction('llamar', () => advanceQueueEntry(nextInscrito.id, 'LLAMADO'));
    setShowCallConfirm(false);
  };

  const handleAdvance = (entry: QueueEntry) => {
    const next = ADVANCE_CHAIN[entry.status];
    if (!next) return;
    setBusyEntryId(entry.id);
    runAction('avanzar', () => advanceQueueEntry(entry.id, next)).finally(() => setBusyEntryId(null));
  };

  const handleConfirmArrival = (entry: QueueEntry) => {
    setBusyEntryId(entry.id);
    if (!navigator.geolocation) {
      runAction('confirmar llegada', () => Promise.reject(new Error('Este navegador no puede obtener ubicación'))).finally(() => setBusyEntryId(null));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        runAction('confirmar llegada', () => confirmArrival(entry.id, pos.coords.latitude, pos.coords.longitude)).finally(() => setBusyEntryId(null));
      },
      () => {
        runAction('confirmar llegada', () => Promise.reject(new Error('No se pudo obtener tu ubicación — revisa los permisos del navegador'))).finally(() => setBusyEntryId(null));
      },
    );
  };

  const handleDeclareLater = (entry: QueueEntry) => {
    setBusyEntryId(entry.id);
    runAction('registrar "me inscribo más tarde"', () => declareLater(entry.id)).finally(() => setBusyEntryId(null));
  };

  const handleDepart = (entry: QueueEntry) => {
    setBusyEntryId(entry.id);
    runAction('registrar salida a viaje', () => departQueueEntry(entry.id)).finally(() => { setBusyEntryId(null); setSelected(null); });
  };

  const handleException = () => {
    if (!selected || !exceptionReason) return;
    const action = exceptionNewStatus === 'INSCRITO' ? 'REQUEUE' : exceptionNewStatus;
    const reason = exceptionNote ? `${exceptionReason} — ${exceptionNote}` : exceptionReason;
    runAction('registrar la excepción', () => overrideQueueEntry(selected.id, action, reason));
    setShowException(false);
    setExceptionReason('');
    setExceptionNote('');
  };

  const openJoinModal = async () => {
    setShowJoin(true);
    try {
      const list = await fetchVehicles(routeCode);
      setVehicles(list);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo cargar la lista de vehículos');
    }
  };

  const handleJoin = async (vehicleId: string) => {
    setJoining(true);
    try {
      await joinQueue(routeCode, vehicleId);
      setShowJoin(false);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo inscribir la unidad');
    } finally {
      setJoining(false);
    }
  };

  const alreadyQueuedCodes = new Set(rawEntries.map(e => e.code));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-t1">Colas</h1>
          <p className="text-sm text-t2 mt-0.5">{OPERATIONAL_DATE}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openJoinModal}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-hover transition-colors"
          >
            <Plus size={14} /> Inscribir unidad
          </button>
          {canCallNext && (
            <button
              onClick={() => setShowCallConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors"
            >
              Llamar siguiente
            </button>
          )}
        </div>
      </div>

      {currentlyLlamado && (
        <div className="px-6 py-2 bg-accent/10 border-b border-accent/30 text-sm text-t1">
          <strong>{currentlyLlamado.code}</strong> ya está Llamando — por eso no sale "Llamar siguiente" (normalmente solo una unidad llama a la vez).
          Si {currentlyLlamado.code} ya se fue o quedó atascada de una prueba, ciérrale el manifiesto y márcale salida (o retírala con "Registrar excepción") para liberar el turno.
          Si necesitas llamar a otra unidad puntual sin esperar a que {currentlyLlamado.code} termine, selecciónala en la lista y usa "Avanzar a Llamado" en su panel —
          funciona con cualquier unidad en cualquier posición, pero ten en cuenta que vas a tener dos unidades Llamando a la vez.
        </div>
      )}

      {actionError && (
        <div className="px-6 py-2 bg-danger/5 border-b border-danger/20 text-sm text-danger">{actionError}</div>
      )}

      {/* Tabs */}
      <div className="border-b border-border bg-surface">
        <div className="flex px-4 md:px-6 overflow-x-auto">
          {[{ id: 'jp', label: routeLabel('JULI_PUNO', org) }, { id: 'pj', label: routeLabel('PUNO_JULI', org) }].map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id as 'jp' | 'pj'); setSelected(null); }}
              className={`px-4 py-3 whitespace-nowrap flex-shrink-0 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-t2 hover:text-t1'
              }`}
            >
              {t.label}
              <span className="ml-2 text-sm text-muted">
                ({(t.id === 'jp' ? queueJP : queuePJ).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      <TerminalPositions entries={rawEntries} route={tab} onSelect={setSelected} />

      {/* Filters */}
      <div className="px-6 py-3 bg-surface border-b border-border flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Buscar por código, placa o conductor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-72"
            aria-label="Buscar en cola"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Filtrar por posición"
          >
            <option value="">Todas las posiciones</option>
            {POSITION_FILTERS.map(position => <option key={position.value} value={position.value}>{position.label}</option>)}
          </select>
        </div>
        <span className="text-sm text-t2 ml-auto">{loading ? 'Cargando…' : `${entries.length} entradas`}</span>
      </div>

      {/* Table + Side panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selected ? 'border-r border-border' : ''}`}>
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-t2">
              <Loader2 size={24} className="mb-2 animate-spin" />
              <p className="text-sm">Cargando cola…</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-t2">
              <Search size={32} className="mb-2 opacity-30" />
              <p className="text-sm">Sin resultados</p>
            </div>
          ) : (
            <QueueTable entries={entries} allEntries={rawEntries} onSelect={setSelected} />
          )}
        </div>

        {/* Side panel */}
        {selected && (
          <aside className="fixed inset-0 z-40 w-full md:static md:inset-auto md:z-auto md:w-80 md:flex-shrink-0 overflow-auto p-4 bg-surface" aria-label="Detalle de entrada en cola">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-t1">Detalle — Código {selected.code}</h3>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-t1" aria-label="Cerrar panel">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                {(() => {
                  const position = getOperationalPosition(selected, rawEntries);
                  return <span className={'px-2 py-1 rounded text-xs font-medium ' + position.className}>{position.label}</span>;
                })()}
                <span className="text-[11px] px-2 py-0.5 rounded font-medium bg-bg text-t2">{selected.status}</span>
              </div>
              <div className="border border-border rounded-lg divide-y divide-border text-sm">
                {[
                  { label: 'Empresa', value: selected.company },
                  { label: 'Vehículo', value: selected.vehicleType },
                  { label: 'Placa', value: selected.plate, mono: true },
                  { label: 'Conductor', value: selected.driverName },
                  { label: 'Socio', value: selected.partnerName },
                  { label: 'DNI socio', value: selected.partnerDni, mono: true },
                  { label: 'Registro', value: selected.registeredAt },
                  { label: 'Posición', value: `#${selected.position}` },
                ].map(row => (
                  <div key={row.label} className="flex justify-between px-3 py-2">
                    <span className="text-t2">{row.label}</span>
                    <span className={`text-t1 font-medium ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
                  </div>
                ))}
              </div>

              <div className="border border-border rounded-lg p-3">
                <p className="text-sm font-medium text-t2 mb-1">Evidencia</p>
                <p className="text-sm text-t1">{EVIDENCE_LABEL[selected.evidence]}</p>
              </div>

              <div className="flex items-center gap-2 text-sm text-t2">
                <Phone size={12} />
                <span>{selected.phone}</span>
              </div>

              {/* Actions */}
              <div className="pt-2 space-y-2">
                {selected.status === 'PREINSCRITO' && (
                  <button
                    onClick={() => handleConfirmArrival(selected)}
                    disabled={busyEntryId === selected.id}
                    className="w-full flex items-center justify-center gap-2 h-9 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    <MapPinCheck size={13} />
                    Confirmar llegada (GPS)
                  </button>
                )}
                {ADVANCE_CHAIN[selected.status] && (
                  <button
                    onClick={() => handleAdvance(selected)}
                    disabled={busyEntryId === selected.id}
                    className="w-full flex items-center justify-center gap-2 h-9 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    <ArrowRightCircle size={13} />
                    Avanzar a {ADVANCE_CHAIN[selected.status]}
                  </button>
                )}
                {selected.status === 'LISTO' && (
                  <button
                    onClick={() => handleDepart(selected)}
                    disabled={busyEntryId === selected.id}
                    className="w-full flex items-center justify-center gap-2 h-9 bg-ok text-white rounded-lg text-sm font-medium hover:bg-ok/90 transition-colors disabled:opacity-50"
                  >
                    Salió a viaje
                  </button>
                )}
                {(selected.status === 'INSCRITO' || selected.status === 'LLAMADO') && (
                  <button
                    onClick={() => handleDeclareLater(selected)}
                    disabled={busyEntryId === selected.id}
                    className="w-full flex items-center justify-center gap-2 h-9 border border-border text-t2 rounded-lg text-sm font-medium hover:bg-hover transition-colors disabled:opacity-50"
                  >
                    <Clock3 size={13} />
                    Me inscribo más tarde
                  </button>
                )}
                <button
                  onClick={() => setShowException(true)}
                  className="w-full flex items-center justify-center gap-2 h-9 border border-warn text-warn rounded-lg text-sm font-medium hover:bg-warn/5 transition-colors"
                >
                  <AlertTriangle size={13} />
                  Registrar excepción
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Call next confirmation */}
      {showCallConfirm && nextInscrito && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-t1 mb-2">Llamar siguiente</h3>
            <p className="text-sm text-t2 mb-1">
              Código <strong className="text-t1">{nextInscrito.code}</strong> — {nextInscrito.driverName}
            </p>
            <p className="text-sm text-t2 mb-4">
              Placa <span className="font-mono">{nextInscrito.plate}</span> · {nextInscrito.company}
            </p>
            <p className="text-sm text-muted mb-4">La unidad pasará a <strong>LLAMADO</strong>. Esta acción quedará registrada en auditoría.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowCallConfirm(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">
                Cancelar
              </button>
              <button onClick={handleCallNext} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exception modal */}
      {showException && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-t1 mb-1">Registrar excepción</h3>
            <p className="text-sm text-t2 mb-4">Código {selected.code} — {selected.driverName}</p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-t1 mb-1">Nuevo estado <span className="text-danger">*</span></label>
              <select
                value={exceptionNewStatus}
                onChange={e => setExceptionNewStatus(e.target.value as 'AUSENTE' | 'RETIRADO' | 'INSCRITO')}
                className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {(['AUSENTE', 'RETIRADO', 'INSCRITO'] as const).map(s => (
                  <option key={s} value={s}>{s === 'INSCRITO' ? 'INSCRITO (al final de la cola)' : s}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-t1 mb-1">Motivo <span className="text-danger">*</span></label>
              <select
                value={exceptionReason}
                onChange={e => setExceptionReason(e.target.value)}
                className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Seleccionar motivo…</option>
                {EXCEPTION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-t1 mb-1">Observación adicional</label>
              <textarea
                value={exceptionNote}
                onChange={e => setExceptionNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                placeholder="Detalle opcional…"
              />
            </div>

            <div className="p-3 bg-warn/5 border border-warn/30 rounded-lg mb-4 flex items-start gap-2">
              <AlertTriangle size={13} className="text-warn mt-0.5 flex-shrink-0" />
              <p className="text-sm text-warn">Esta acción queda registrada en auditoría con tu identidad y marca de tiempo.</p>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowException(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">
                Cancelar
              </button>
              <button
                onClick={handleException}
                disabled={!exceptionReason}
                className="px-4 py-2 text-sm bg-warn text-white rounded-lg hover:bg-warn/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirmar excepción
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inscribir unidad modal */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-md p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-t1">Inscribir unidad — {routeLabel(tab === 'jp' ? 'JULI_PUNO' : 'PUNO_JULI', org)}</h3>
              <button onClick={() => setShowJoin(false)} className="text-muted hover:text-t1" aria-label="Cerrar"><X size={16} /></button>
            </div>
            <div className="overflow-auto flex-1 -mx-2 px-2 space-y-1.5">
              {vehicles.length === 0 ? (
                <p className="text-sm text-muted italic py-6 text-center">Cargando vehículos…</p>
              ) : (
                vehicles
                  .filter(v => !alreadyQueuedCodes.has(v.code))
                  .map(v => (
                    <button
                      key={v.id}
                      onClick={() => handleJoin(v.id)}
                      disabled={joining}
                      className="w-full flex items-center justify-between gap-2 p-2.5 border border-border rounded-lg hover:border-primary text-left disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-t1 font-mono">{v.code} <span className="text-t2 font-sans">— {v.currentDriverName}</span></p>
                        <p className="text-sm text-t2 truncate">{v.company} · {v.plate}</p>
                      </div>
                    </button>
                  ))
              )}
              {vehicles.length > 0 && vehicles.filter(v => !alreadyQueuedCodes.has(v.code)).length === 0 && (
                <p className="text-sm text-muted italic py-6 text-center">Todas las unidades ya están en esta cola.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
