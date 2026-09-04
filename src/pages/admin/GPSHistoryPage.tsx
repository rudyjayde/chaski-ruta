import { useState } from 'react';
import { Search, History, MapPin } from 'lucide-react';
import { UNITS } from '../../data/demo';

const HISTORY_ENTRIES = [
  { id: 'h1', unit: '007', plate: 'Z4B-318', driver: 'José Quispe Mamani', date: '2026-08-29', route: 'Juli → Puno', start: '06:04', end: '08:35', distance: '95 km', stops: 2, gaps: 0, status: 'Completado' },
  { id: 'h2', unit: '002', plate: 'Z1B-445', driver: 'Isidro Mamani Callo', date: '2026-08-29', route: 'Puno → Juli', start: '04:05', end: '06:45', distance: '95 km', stops: 1, gaps: 0, status: 'Completado' },
  { id: 'h3', unit: '003', plate: 'Z2C-412', driver: 'Héctor Apaza Condori', date: '2026-08-27', route: 'Juli → Puno', start: '05:15', end: '08:10', distance: '95 km', stops: 3, gaps: 1, status: 'Pérdida de señal' },
  { id: 'h4', unit: '005', plate: 'Z2C-556', driver: 'Feliciano Torres Apaza', date: '2026-08-28', route: 'Puno → Juli', start: '05:30', end: '07:55', distance: '95 km', stops: 0, gaps: 0, status: 'Completado' },
];

export default function GPSHistoryPage() {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('2026-08-27');
  const [dateTo, setDateTo] = useState('2026-08-29');
  const [unitFilter, setUnitFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = HISTORY_ENTRIES.filter(h => {
    const q = search.toLowerCase();
    const matchSearch = !q || h.unit.includes(q) || h.plate.toLowerCase().includes(q) || h.driver.toLowerCase().includes(q);
    const matchUnit = !unitFilter || h.unit === unitFilter;
    const matchDate = h.date >= dateFrom && h.date <= dateTo;
    return matchSearch && matchUnit && matchDate;
  });

  const selectedEntry = HISTORY_ENTRIES.find(h => h.id === selected);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center gap-2">
        <History size={16} className="text-t2" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-t1">Historial GPS</h1>
            <span className="text-[11px] font-bold bg-ok/10 text-ok px-2 py-0.5 rounded uppercase tracking-wide">PRO</span>
          </div>
          <p className="text-sm text-t2 mt-0.5">Recorridos, paradas y pérdidas de señal por fecha.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border bg-surface flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" placeholder="Unidad, placa o conductor…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-56" />
        </div>
        <div className="flex items-center gap-2 text-sm text-t2">
          <span>Desde</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <span>hasta</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <select value={unitFilter} onChange={e => setUnitFilter(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Todas las unidades</option>
          {UNITS.filter(u => parseInt(u.code) <= 7).map(u => <option key={u.id} value={u.code}>{u.code} — {u.plate}</option>)}
        </select>
        <span className="text-sm text-t2 ml-auto">{filtered.length} registros</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selectedEntry ? 'border-r border-border' : ''}`}>
          <table className="w-full text-sm" aria-label="Historial GPS">
            <thead className="sticky top-0">
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Fecha</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Unidad</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Conductor</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Ruta</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Inicio</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Fin</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Distancia</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Paradas</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(h => (
                <tr
                  key={h.id}
                  className={`border-b border-border last:border-0 hover:bg-hover cursor-pointer ${selected === h.id ? 'bg-hover' : ''}`}
                  onClick={() => setSelected(selected === h.id ? null : h.id)}
                >
                  <td className="px-4 py-3 font-mono text-t2">{h.date}</td>
                  <td className="px-4 py-3 font-bold text-t1">{h.unit}</td>
                  <td className="px-4 py-3 text-t1">{h.driver}</td>
                  <td className="px-4 py-3 text-t2">{h.route}</td>
                  <td className="px-4 py-3 font-mono text-t1">{h.start}</td>
                  <td className="px-4 py-3 font-mono text-t1">{h.end}</td>
                  <td className="px-4 py-3 text-t2">{h.distance}</td>
                  <td className="px-4 py-3 text-t2">{h.stops}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                      h.gaps > 0 ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok'
                    }`}>
                      {h.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedEntry && (
          <aside className="w-72 flex-shrink-0 bg-surface p-4 overflow-auto" aria-label="Detalle del recorrido">
            <h3 className="text-base font-semibold text-t1 mb-3">Recorrido GPS — Unidad {selectedEntry.unit}</h3>
            <div className="relative h-32 bg-gradient-to-br from-[#e0ead0] to-[#b0c898] rounded-lg mb-3 flex items-center justify-center">
              <div className="text-center text-sm text-[#2d5030]">
                <MapPin size={20} className="mx-auto mb-1 text-[#2d5030]" />
                <p>Recorrido registrado</p>
                <p className="text-[11px] opacity-70">GPS PRO</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Ruta', value: selectedEntry.route },
                { label: 'Inicio', value: selectedEntry.start },
                { label: 'Fin', value: selectedEntry.end },
                { label: 'Distancia', value: selectedEntry.distance },
                { label: 'Paradas', value: String(selectedEntry.stops) },
                { label: 'Pérdidas de señal', value: String(selectedEntry.gaps) },
              ].map(r => (
                <div key={r.label} className="flex justify-between border-b border-border pb-1">
                  <span className="text-t2">{r.label}</span>
                  <span className="font-medium text-t1">{r.value}</span>
                </div>
              ))}
            </div>
            {selectedEntry.gaps > 0 && (
              <div className="mt-3 p-2.5 bg-warn/5 border border-warn/20 rounded-lg text-sm text-warn">
                Pérdida de señal detectada a las 06:52. Sin posición inventada — última posición conocida registrada.
              </div>
            )}
          </aside>
        )}
      </div>

      <div className="px-6 py-2 border-t border-border text-[11px] text-muted text-center">
        GPS PRO — Sin señal: no se inventa posición. Se conserva la última posición registrada.
      </div>
    </div>
  );
}
