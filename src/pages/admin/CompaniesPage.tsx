import { useEffect, useState } from 'react';
import { Building2, ChevronRight, X } from 'lucide-react';
import { fetchCompanies, fetchVehicles, routeLabel } from '../../lib/operacion-api';
import type { CompanyOption } from '../../lib/operacion-api';
import type { Company, RouteDir } from '../../types';
import { useAdminDemo } from './AdminApp';

const STATUS_STYLE: Record<string, string> = {
  ACTIVA: 'bg-ok/10 text-ok',
  OBSERVADA: 'bg-warn/10 text-warn',
  SUSPENDIDA: 'bg-danger/10 text-danger',
};

function deriveCompanies(companies: CompanyOption[], units: Awaited<ReturnType<typeof fetchVehicles>>): Company[] {
  return companies.map((c) => {
    const companyUnits = units.filter(u => u.company === c.name);
    const partnerNames = new Set(companyUnits.map(u => u.partnerName).filter((name): name is string => !!name));
    const routes = new Set<RouteDir>();
    companyUnits.forEach((u) => {
      if (u.route === 'JULI_PUNO' || u.route === 'AMBAS') routes.add('JULI_PUNO');
      if (u.route === 'PUNO_JULI' || u.route === 'AMBAS') routes.add('PUNO_JULI');
    });
    return {
      id: c.id,
      name: c.name,
      ruc: c.ruc ?? '',
      legalRep: c.legalRep ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      status: c.status ?? 'ACTIVA',
      units: companyUnits.length,
      partners: partnerNames.size,
      routes: Array.from(routes),
    };
  });
}

export default function CompaniesPage() {
  const { org } = useAdminDemo();
  const [selected, setSelected] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([fetchCompanies(), fetchVehicles()])
      .then(([c, v]) => {
        if (cancelled) return;
        setCompanies(deriveCompanies(c, v));
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar la información.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface">
        <h1 className="text-2xl font-bold text-t1">Empresas integrantes</h1>
        <p className="text-sm text-t2 mt-0.5">ATIPCAR · {companies.length} empresas</p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-t2">Cargando empresas…</div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-danger">{error}</div>
      ) : (
      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selected ? 'border-r border-border' : ''}`}>
          <table className="w-full text-sm" aria-label="Empresas integrantes">
            <thead className="sticky top-0">
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Empresa</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">RUC</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Representante legal</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Unidades</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Socios</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Rutas</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {companies.map(c => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-0 hover:bg-hover cursor-pointer"
                  onClick={() => setSelected(c === selected ? null : c)}
                >
                  <td className="px-4 py-3 font-medium text-t1">
                    <div className="flex items-center gap-2">
                      <Building2 size={14} className="text-t2" />
                      {c.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-t2">{c.ruc}</td>
                  <td className="px-4 py-3 text-t1">{c.legalRep}</td>
                  <td className="px-4 py-3 text-t1 font-medium">{c.units}</td>
                  <td className="px-4 py-3 text-t1 font-medium">{c.partners}</td>
                  <td className="px-4 py-3 text-t2">{c.routes.map(r => routeLabel(r, org)).join(', ')}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3"><ChevronRight size={14} className="text-muted" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <aside className="w-72 flex-shrink-0 overflow-auto p-4 bg-surface" aria-label="Detalle empresa">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-t1">{selected.name}</h3>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-t1" aria-label="Cerrar"><X size={16} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <span className={`inline-block text-[11px] px-2 py-0.5 rounded font-medium ${STATUS_STYLE[selected.status]}`}>{selected.status}</span>
              <div className="border border-border rounded-lg divide-y divide-border">
                {[
                  { label: 'RUC', value: selected.ruc, mono: true },
                  { label: 'Rep. legal', value: selected.legalRep },
                  { label: 'Teléfono', value: selected.phone },
                  { label: 'Correo', value: selected.email },
                  { label: 'Unidades', value: String(selected.units) },
                  { label: 'Socios', value: String(selected.partners) },
                ].map(row => (
                  <div key={row.label} className="flex justify-between px-3 py-2">
                    <span className="text-t2">{row.label}</span>
                    <span className={`text-t1 font-medium ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
                  </div>
                ))}
              </div>
              <div>
                <h4 className="text-[11px] font-semibold text-t2 uppercase tracking-wide mb-2">Rutas autorizadas</h4>
                <div className="space-y-1">
                  {selected.routes.map(r => (
                    <div key={r} className="bg-primary/5 text-primary text-sm px-2 py-1 rounded">{routeLabel(r, org)}</div>
                  ))}
                </div>
              </div>
              <div className="border border-border rounded-lg p-4">
                <p className="text-[11px] font-semibold text-t2 mb-1">Documentos de la empresa</p>
                <p className="text-t2">Estatutos vigentes · Padrón de socios · Autorización MTC</p>
                <p className="text-[11px] text-muted mt-1">Documentación referencial pendiente de validación</p>
              </div>
            </div>
          </aside>
        )}
      </div>
      )}
    </div>
  );
}
