import { useState } from 'react';
import { Bell, AlertTriangle, X, Search, CheckCircle } from 'lucide-react';

type AlertType =
  | 'DESCONEXION' | 'ENERGIA_CORTADA' | 'ENTRADA_TERMINAL' | 'SALIDA_TERMINAL'
  | 'DESVIO' | 'PARADA_PROLONGADA' | 'MOVIMIENTO_SIN_VIAJE';

type AlertStatus = 'NUEVA' | 'EN_REVISION' | 'REVISADA' | 'DESCARTADA';

interface GPSAlert {
  id: string;
  type: AlertType;
  unitCode: string;
  plate: string;
  driver: string;
  timestamp: string;
  description: string;
  status: AlertStatus;
}

const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  DESCONEXION: 'Desconexión',
  ENERGIA_CORTADA: 'Energía cortada',
  ENTRADA_TERMINAL: 'Entrada a terminal',
  SALIDA_TERMINAL: 'Salida de terminal',
  DESVIO: 'Desvío de ruta',
  PARADA_PROLONGADA: 'Parada prolongada',
  MOVIMIENTO_SIN_VIAJE: 'Movimiento sin viaje',
};

const ALERT_TYPE_STYLE: Record<AlertType, string> = {
  DESCONEXION: 'bg-danger/10 text-danger',
  ENERGIA_CORTADA: 'bg-danger/20 text-danger',
  ENTRADA_TERMINAL: 'bg-ok/10 text-ok',
  SALIDA_TERMINAL: 'bg-primary/10 text-primary',
  DESVIO: 'bg-warn/20 text-warn',
  PARADA_PROLONGADA: 'bg-warn/10 text-warn',
  MOVIMIENTO_SIN_VIAJE: 'bg-accent/10 text-accent',
};

const STATUS_STYLE: Record<AlertStatus, string> = {
  NUEVA: 'bg-danger/10 text-danger',
  EN_REVISION: 'bg-warn/10 text-warn',
  REVISADA: 'bg-ok/10 text-ok',
  DESCARTADA: 'bg-t2/10 text-t2',
};

const INITIAL_ALERTS: GPSAlert[] = [
  { id: 'a1', type: 'SIN_SENAL' as unknown as AlertType, unitCode: '003', plate: 'Z2C-412', driver: 'Héctor Apaza Condori', timestamp: '2026-08-27T14:20', description: 'Dispositivo sin señal por más de 2 días. Última posición: km 34 Juli-Puno.', status: 'NUEVA' },
  { id: 'a2', type: 'DESCONEXION', unitCode: '003', plate: 'Z2C-412', driver: 'Héctor Apaza Condori', timestamp: '2026-08-27T14:18', description: 'Dispositivo Teltonika FMB140 desconectado abruptamente.', status: 'EN_REVISION' },
  { id: 'a3', type: 'MOVIMIENTO_SIN_VIAJE', unitCode: '004', plate: 'Z1A-123', driver: 'Carlos Ticona Mamani', timestamp: '2026-08-29T03:45', description: 'Movimiento detectado a las 03:45 sin viaje activo en el sistema.', status: 'NUEVA' },
  { id: 'a4', type: 'DESVIO', unitCode: '002', plate: 'Z1B-445', driver: 'Isidro Mamani Callo', timestamp: '2026-08-28T06:12', description: 'Desvío de ruta detectado en km 52. El conductor reportó vía alternativa por cierre.', status: 'REVISADA' },
  { id: 'a5', type: 'PARADA_PROLONGADA', unitCode: '007', plate: 'Z4B-318', driver: 'José Quispe Mamani', timestamp: '2026-08-28T07:30', description: 'Parada de 25 minutos en km 80 sin justificación registrada.', status: 'DESCARTADA' },
  { id: 'a6', type: 'ENTRADA_TERMINAL', unitCode: '005', plate: 'Z2C-556', driver: 'Feliciano Torres Apaza', timestamp: '2026-08-29T04:05', description: 'Unidad detectada en geocerca Terminal Puno.', status: 'REVISADA' },
  { id: 'a7', type: 'ENERGIA_CORTADA', unitCode: '001', plate: 'Z0A-001', driver: 'Roberto Mamani Apaza', timestamp: '2026-08-26T18:55', description: 'Interrupción de alimentación eléctrica del dispositivo detectada.', status: 'REVISADA' },
];

export default function GPSAlertsPage() {
  const [alerts, setAlerts] = useState(INITIAL_ALERTS.map(a => ({
    ...a,
    type: a.type === ('SIN_SENAL' as string) ? 'DESCONEXION' as AlertType : a.type,
  })));
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<GPSAlert | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const updateStatus = (id: string, status: AlertStatus, note: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
    showToast(`Alerta ${status.toLowerCase()}. Registro en auditoría. Nota: "${note || 'Sin nota'}".`);
    setReviewNote('');
  };

  const filtered = alerts.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.unitCode.includes(q) || a.plate.toLowerCase().includes(q) || a.driver.toLowerCase().includes(q);
    const matchType = !filterType || a.type === filterType;
    const matchStatus = !filterStatus || a.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  const newCount = alerts.filter(a => a.status === 'NUEVA').length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-t2" />
            <h1 className="text-2xl font-bold text-t1">Alertas GPS</h1>
            <span className="text-[11px] font-bold bg-ok/10 text-ok px-2 py-0.5 rounded uppercase tracking-wide">PRO</span>
            {newCount > 0 && (
              <span className="text-[11px] font-bold bg-danger text-white px-2 py-0.5 rounded-full">{newCount} nuevas</span>
            )}
          </div>
          <p className="text-sm text-t2 mt-0.5">Toda alerta requiere revisión. No se generan sanciones automáticas.</p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mx-6 mt-3 p-3 bg-warn/5 border border-warn/20 rounded-lg flex items-start gap-2 text-sm text-warn">
        <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
        <span>Toda alerta requiere revisión manual antes de tomar acciones. No se generan sanciones automáticas. La señal se valida con telemetría recibida.</span>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mx-6 mt-2 p-2.5 bg-ok/5 border border-ok/30 rounded-lg flex items-center gap-2 text-sm text-ok">
          <CheckCircle size={12} />
          {toast}
        </div>
      )}

      {/* Filters */}
      <div className="px-6 py-3 mt-3 border-b border-border bg-surface flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" placeholder="Unidad, placa o conductor…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-56" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Todos los tipos</option>
          {Object.entries(ALERT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Todos los estados</option>
          {['NUEVA', 'EN_REVISION', 'REVISADA', 'DESCARTADA'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-t2 ml-auto">{filtered.length} alertas</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selected ? 'border-r border-border' : ''}`}>
          <table className="w-full text-sm" aria-label="Alertas GPS">
            <thead className="sticky top-0">
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Fecha / Hora</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Unidad</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Conductor</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Tipo</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Descripción</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr
                  key={a.id}
                  className={`border-b border-border last:border-0 hover:bg-hover cursor-pointer ${selected?.id === a.id ? 'bg-hover' : ''}`}
                  onClick={() => setSelected(selected?.id === a.id ? null : a)}
                >
                  <td className="px-4 py-3 font-mono text-t2 whitespace-nowrap">
                    {new Date(a.timestamp).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 font-bold text-t1">{a.unitCode}</td>
                  <td className="px-4 py-3 text-t1">{a.driver}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${ALERT_TYPE_STYLE[a.type]}`}>
                      {ALERT_TYPE_LABEL[a.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-t2 max-w-[200px] truncate" title={a.description}>{a.description}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${STATUS_STYLE[a.status]}`}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Side panel */}
        {selected && (
          <aside className="w-80 flex-shrink-0 bg-surface p-4 overflow-auto" aria-label="Detalle de alerta">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-t1">Detalle de alerta</h3>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-t1 p-1" aria-label="Cerrar"><X size={16} /></button>
            </div>

            <div className="space-y-3 text-sm">
              <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${ALERT_TYPE_STYLE[selected.type]}`}>
                {ALERT_TYPE_LABEL[selected.type]}
              </span>

              <div className="border border-border rounded-lg divide-y divide-border">
                {[
                  { label: 'Unidad', value: selected.unitCode },
                  { label: 'Placa', value: selected.plate, mono: true },
                  { label: 'Conductor', value: selected.driver },
                  { label: 'Fecha/Hora', value: new Date(selected.timestamp).toLocaleString('es-PE') },
                  { label: 'Estado', value: selected.status },
                ].map(r => (
                  <div key={r.label} className="flex justify-between px-3 py-2">
                    <span className="text-t2">{r.label}</span>
                    <span className={`text-t1 font-medium ${(r as Record<string, unknown>).mono ? 'font-mono' : ''}`}>{r.value}</span>
                  </div>
                ))}
              </div>

              <div className="p-2.5 border border-border rounded-lg text-t2 leading-relaxed">
                {selected.description}
              </div>

              <div className="p-2.5 bg-warn/5 border border-warn/20 rounded-lg text-warn">
                Toda alerta requiere revisión manual. No se generan sanciones automáticas.
              </div>

              <div>
                <label className="block text-sm font-medium text-t1 mb-1">Nota de revisión</label>
                <textarea
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  rows={2}
                  placeholder="Observación del administrador…"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              {selected.status !== 'REVISADA' && selected.status !== 'DESCARTADA' && (
                <div className="space-y-2">
                  <button
                    onClick={() => updateStatus(selected.id, 'EN_REVISION', reviewNote)}
                    className="w-full h-8 border border-warn text-warn rounded-lg text-sm hover:bg-warn/5"
                  >
                    Marcar en revisión
                  </button>
                  <button
                    onClick={() => updateStatus(selected.id, 'REVISADA', reviewNote)}
                    className="w-full h-8 bg-ok text-white rounded-lg text-sm hover:bg-ok/80"
                  >
                    Marcar como revisada
                  </button>
                  <button
                    onClick={() => updateStatus(selected.id, 'DESCARTADA', reviewNote)}
                    className="w-full h-8 border border-border text-t2 rounded-lg text-sm hover:bg-hover"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      <div className="px-6 py-2 border-t border-border text-[11px] text-muted text-center">
        GPS PRO — Sin sanciones automáticas. Toda acción queda registrada en auditoría.
      </div>
    </div>
  );
}
