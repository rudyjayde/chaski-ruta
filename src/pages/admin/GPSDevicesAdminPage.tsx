import { useState, useEffect } from 'react';
import { Cpu, Search, Wifi, WifiOff, HelpCircle } from 'lucide-react';
import { fetchGpsDevices, type VehicleGpsStatus } from '../../lib/operacion-api';

// Enmascara el identificador Traccar en pantalla (igual que antes con el IMEI) --
// no hay razon para mostrarlo completo en una tabla que cualquier admin puede ver.
const maskStr = (s: string) => (s.length <= 7 ? s : s.slice(0, 4) + '****' + s.slice(-3));

type DisplayStatus = 'SIN_DISPOSITIVO' | 'DESCONOCIDO' | 'EN_LINEA' | 'SIN_SENAL';

const STATUS_STYLE: Record<DisplayStatus, string> = {
  SIN_DISPOSITIVO: 'bg-border text-muted',
  DESCONOCIDO: 'bg-warn/10 text-warn',
  EN_LINEA: 'bg-ok/10 text-ok',
  SIN_SENAL: 'bg-danger/10 text-danger',
};

const STATUS_LABEL: Record<DisplayStatus, string> = {
  SIN_DISPOSITIVO: 'Sin dispositivo',
  DESCONOCIDO: 'Desconocido',
  EN_LINEA: 'En línea',
  SIN_SENAL: 'Sin señal',
};

function displayStatus(d: VehicleGpsStatus): DisplayStatus {
  if (!d.linked) return 'SIN_DISPOSITIVO';
  if (d.online === 'online') return 'EN_LINEA';
  if (d.online === 'offline') return 'SIN_SENAL';
  return 'DESCONOCIDO';
}

function StatusIcon({ status }: { status: DisplayStatus }) {
  if (status === 'EN_LINEA') return <Wifi size={13} className="text-ok" />;
  if (status === 'SIN_SENAL') return <WifiOff size={13} className="text-danger" />;
  if (status === 'DESCONOCIDO') return <HelpCircle size={13} className="text-warn" />;
  return <WifiOff size={13} className="text-muted" />;
}

export default function GPSDevicesAdminPage() {
  const [devices, setDevices] = useState<VehicleGpsStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<DisplayStatus | ''>('');

  useEffect(() => {
    let cancelled = false;
    fetchGpsDevices()
      .then(result => { if (!cancelled) setDevices(result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el estado de los dispositivos.'); });
    return () => { cancelled = true; };
  }, []);

  const rows = (devices ?? []).map(d => ({ ...d, status: displayStatus(d) }));
  const filtered = rows.filter(d => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || d.code.toLowerCase().includes(q) || d.plate.toLowerCase().includes(q) || d.companyName.toLowerCase().includes(q);
    const matchStatus = !filterStatus || d.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const counts = (Object.keys(STATUS_LABEL) as DisplayStatus[])
    .map(s => ({ status: s, count: rows.filter(d => d.status === s).length }))
    .filter(x => x.count > 0);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-t2" />
            <h1 className="text-2xl font-bold text-t1">Dispositivos GPS</h1>
            <span className="text-[11px] font-bold bg-ok/10 text-ok px-2 py-0.5 rounded uppercase tracking-wide">PRO</span>
          </div>
          <p className="text-sm text-t2 mt-0.5">Estado real de los dispositivos Traccar vinculados a tus unidades. Solo lectura.</p>
        </div>
      </div>

      {error && (
        <div className="px-6 py-3">
          <p className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2">{error}</p>
        </div>
      )}

      {!error && (
        <>
          {/* Status counts */}
          {counts.length > 0 && (
            <div className="px-6 py-3 border-b border-border bg-surface flex gap-3 flex-wrap">
              {counts.map(c => (
                <span
                  key={c.status}
                  className={`text-xs px-2 py-1 rounded cursor-pointer ${c.status === filterStatus ? 'ring-2 ring-primary' : ''} ${STATUS_STYLE[c.status]}`}
                  onClick={() => setFilterStatus(filterStatus === c.status ? '' : c.status)}
                >
                  {STATUS_LABEL[c.status]}: {c.count}
                </span>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="px-6 py-3 border-b border-border bg-surface flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                placeholder="Unidad, placa o empresa…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-64"
              />
            </div>
            <span className="text-sm text-t2 ml-auto">
              {devices === null ? 'Cargando…' : `${filtered.length} unidades`}
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm" aria-label="Dispositivos GPS">
              <thead className="sticky top-0">
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Unidad</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Placa</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Empresa</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">ID Traccar</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Última señal</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.vehicleId} className="border-b border-border last:border-0 hover:bg-hover">
                    <td className="px-4 py-3 font-bold text-t1">{d.code}</td>
                    <td className="px-4 py-3 font-mono text-t1">{d.plate}</td>
                    <td className="px-4 py-3 text-t2">{d.companyName}</td>
                    <td className="px-4 py-3 font-mono text-t2">{d.traccarDeviceId ? maskStr(d.traccarDeviceId) : '—'}</td>
                    <td className="px-4 py-3 font-mono text-t2">{d.lastUpdate ? d.lastUpdate.replace('T', ' ').slice(0, 16) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded font-medium ${STATUS_STYLE[d.status]}`}>
                        <StatusIcon status={d.status} /> {STATUS_LABEL[d.status]}
                      </span>
                    </td>
                  </tr>
                ))}
                {devices !== null && filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-t2">Sin unidades que coincidan con el filtro</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-2 border-t border-border text-[11px] text-muted text-center">
            ID Traccar enmascarado. Para registrar o cambiar el dispositivo de una unidad, contacta al equipo técnico de CHASKI AI (se configura desde Flota → GPS).
          </div>
        </>
      )}
    </div>
  );
}
