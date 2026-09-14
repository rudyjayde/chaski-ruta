import { useEffect, useState } from 'react';
import { Search, ShieldCheck } from 'lucide-react';
import type { AuditEntry } from '../../types';
import { fetchAudit } from '../../lib/operacion-api';
import { useAdminDemo } from './AdminApp';

const maskPersonalData = (text: string | undefined) => {
  if (!text) return '—';
  return text.replace(/\b\d{8}\b/g, '****').replace(/\b(DNI|dni)\s*:?\s*\d+/g, 'DNI: ****');
};

export default function AuditPage() {
  const { org } = useAdminDemo();
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    fetchAudit()
      .then(data => { if (!cancelled) setEntries(data); })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el registro de auditoría.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const ACTIONS = [...new Set(entries.map(a => a.action))];

  const filtered = entries.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.actor.toLowerCase().includes(q) || a.action.toLowerCase().includes(q) || a.resource.toLowerCase().includes(q);
    const matchAction = !filterAction || a.action === filterAction;
    return matchSearch && matchAction;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center gap-3">
        <ShieldCheck size={16} className="text-t2" />
        <div>
          <h1 className="text-2xl font-bold text-t1">Auditoría</h1>
          <p className="text-sm text-t2 mt-0.5">Registro de acciones — {org?.name ?? 'tu asociación'}</p>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-border bg-surface flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Actor, acción o recurso…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-full"
            aria-label="Buscar en auditoría"
          />
        </div>
        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filtrar por acción"
        >
          <option value="">Todas las acciones</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-sm text-t2 ml-auto">{filtered.length} registros</span>
      </div>

      {loadError && (
        <div className="px-6 py-3 bg-danger/5 border-b border-danger/20 text-sm text-danger">{loadError}</div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-10 text-center text-sm text-t2">Cargando auditoría…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-t2">No hay registros que coincidan con los filtros.</div>
        ) : (
        <table className="w-full text-sm" aria-label="Registro de auditoría">
          <thead className="sticky top-0">
            <tr className="border-b border-border bg-bg">
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Fecha / Hora</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Actor</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Rol</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Acción</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Recurso</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Antes</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Después</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} className="border-b border-border last:border-0 hover:bg-hover">
                <td className="px-4 py-3 font-mono text-t2 whitespace-nowrap">
                  {new Date(a.timestamp).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3 text-t1 font-medium">{a.actor}</td>
                <td className="px-4 py-3 text-t2">{a.actorRole}</td>
                <td className="px-4 py-3 font-mono text-primary font-medium">{a.action}</td>
                <td className="px-4 py-3 text-t2">{a.resource}</td>
                <td className="px-4 py-3 text-t2 max-w-[120px] truncate" title={maskPersonalData(a.before)}>{maskPersonalData(a.before)}</td>
                <td className="px-4 py-3 text-t2 max-w-[120px] truncate" title={maskPersonalData(a.after)}>{maskPersonalData(a.after)}</td>
                <td className="px-4 py-3 text-t2 max-w-[140px] truncate" title={a.reason}>{a.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
