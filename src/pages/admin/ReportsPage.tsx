import { useState, useEffect, useCallback } from 'react';
import { BarChart2, Download, CheckCircle, Wrench, ArrowLeftRight, Gauge } from 'lucide-react';
import {
  fetchTrips, fetchManifests, fetchCompanies, routeLabel, routeLabelShort, type CompanyOption,
  fetchHourlyQueuePattern, type HourlyQueuePattern,
  fetchTurnaroundEfficiency, type TurnaroundEfficiency,
  fetchDrivingEventCounts, type DrivingEventsResult,
  fetchVehicles, fetchGpsLive, setVehicleMaintenance, type LiveVehiclePosition,
} from '../../lib/operacion-api';
import type { Trip, Manifest, Unit } from '../../types';
import { useAdminDemo } from './AdminApp';

const REPORT_TYPES = [
  { id: 'viajes', label: 'Viajes' },
  { id: 'manifiestos', label: 'Manifiestos' },
  { id: 'pasajeros', label: 'Pasajeros y recaudación' },
  { id: 'cola', label: 'Reporte de cola' },
  { id: 'reubicaciones', label: 'Sugerencia de reubicación' },
  { id: 'eficiencia', label: 'Eficiencia por ruta/empresa' },
  { id: 'mantenimiento', label: 'Mantenimiento predictivo' },
  { id: 'conduccion', label: 'Eventos de conducción (evidencia)' },
  { id: 'produccion', label: 'Producción por unidad' },
  { id: 'recaudacion-empresa', label: 'Recaudación por empresa', pro: true },
  { id: 'gps', label: 'GPS PRO', pro: true },
];

export default function ReportsPage() {
  const { isPRO, org } = useAdminDemo();
  const [reportType, setReportType] = useState('viajes');
  const [dateFrom, setDateFrom] = useState('2026-08-29');
  const [dateTo, setDateTo] = useState('2026-08-29');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterRoute, setFilterRoute] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCode, setFilterCode] = useState('');
  const [generated, setGenerated] = useState(false);
  const [exportToast, setExportToast] = useState('');

  const [trips, setTrips] = useState<Trip[]>([]);
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');

  // 11.3 / 11.4 / 11.2 (plan-pro.md §11) — se cargan bajo demanda al generar,
  // no en el mount inicial, porque cada uno hace su propia consulta agregada.
  const [queuePattern, setQueuePattern] = useState<HourlyQueuePattern | null>(null);
  const [turnaround, setTurnaround] = useState<TurnaroundEfficiency | null>(null);
  const [drivingEvents, setDrivingEvents] = useState<DrivingEventsResult | null>(null);
  const [maintenanceVehicles, setMaintenanceVehicles] = useState<Unit[]>([]);
  const [maintenanceLive, setMaintenanceLive] = useState<LiveVehiclePosition[]>([]);
  const [extraLoading, setExtraLoading] = useState(false);
  const [extraError, setExtraError] = useState('');
  const [maintenanceDraft, setMaintenanceDraft] = useState<{ vehicleId: string; lastServiceKm: string; serviceIntervalKm: string } | null>(null);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    setDataError('');
    try {
      const [tripsData, manifestsData, companiesData] = await Promise.all([
        fetchTrips(),
        fetchManifests(),
        fetchCompanies(),
      ]);
      setTrips(tripsData);
      setManifests(manifestsData);
      setCompanies(companiesData);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'No se pudieron cargar los datos');
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleGenerate = async () => {
    setGenerated(true);
    if (reportType === 'reubicaciones' || reportType === 'eficiencia' || reportType === 'conduccion' || reportType === 'mantenimiento') {
      setExtraLoading(true);
      setExtraError('');
      try {
        if (reportType === 'reubicaciones') setQueuePattern(await fetchHourlyQueuePattern());
        else if (reportType === 'eficiencia') setTurnaround(await fetchTurnaroundEfficiency());
        else if (reportType === 'conduccion') setDrivingEvents(await fetchDrivingEventCounts());
        else if (reportType === 'mantenimiento') {
          const [vehicles, live] = await Promise.all([fetchVehicles(), fetchGpsLive()]);
          setMaintenanceVehicles(vehicles);
          setMaintenanceLive(live);
        }
      } catch (err) {
        setExtraError(err instanceof Error ? err.message : 'No se pudo generar este reporte.');
      } finally {
        setExtraLoading(false);
      }
    }
  };

  const handleSaveMaintenance = async () => {
    if (!maintenanceDraft) return;
    setMaintenanceSaving(true);
    try {
      await setVehicleMaintenance(
        maintenanceDraft.vehicleId,
        maintenanceDraft.lastServiceKm ? Number(maintenanceDraft.lastServiceKm) : undefined,
        maintenanceDraft.serviceIntervalKm ? Number(maintenanceDraft.serviceIntervalKm) : undefined,
      );
      const vehicles = await fetchVehicles();
      setMaintenanceVehicles(vehicles);
      setMaintenanceDraft(null);
    } catch (err) {
      setExtraError(err instanceof Error ? err.message : 'No se pudo guardar el mantenimiento.');
    } finally {
      setMaintenanceSaving(false);
    }
  };

  const filteredTrips = trips.filter(t => (!filterRoute || t.route === filterRoute) && (!filterCode || t.code.includes(filterCode)) && (!filterStatus || t.status === filterStatus) && (!filterCompany || t.company === filterCompany));
  const filteredManifests = manifests.filter(m => (!filterCompany || m.company === filterCompany) && (!filterCode || m.code.includes(filterCode)));

  function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const handleExportExcel = () => {
    if (reportType === 'viajes') {
      downloadCsv(`viajes-${dateFrom}.csv`, ['Código', 'Placa', 'Conductor', 'Empresa', 'Ruta', 'Salida real', 'GPS', 'Estado'],
        filteredTrips.map(t => [t.code, t.plate, t.driverName, t.company, routeLabelShort(t.route, org), t.actualDeparture ?? t.scheduledDeparture, t.gpsStatus === 'GPS_PRO_DEMO' ? 'GPS PRO' : t.gpsStatus === 'REGISTRO_MOVIL' ? 'Móvil' : 'Sin GPS', t.status]));
    } else if (reportType === 'pasajeros') {
      downloadCsv(`manifiestos-${dateFrom}.csv`, ['Manifiesto', 'Código', 'Ruta', 'Pasajeros', 'Capacidad', 'Recaudación', 'Estado'],
        filteredManifests.map(m => [m.number, m.code, routeLabelShort(m.route, org), m.passengers.length, m.capacity, m.passengers.reduce((s, p) => s + p.fare, 0), m.status]));
    } else if (reportType === 'recaudacion-empresa') {
      downloadCsv(`recaudacion-por-empresa-${dateFrom}.csv`, ['Empresa', 'Pasajeros', 'Recaudación total'],
        revenueByCompanyRows.map(r => [r.company, r.passengers, r.revenue]));
    } else {
      setExportToast('La exportación a Excel para este reporte todavía no está implementada.');
      setTimeout(() => setExportToast(''), 3000);
    }
  };

  const handleExportPdf = () => {
    setExportToast('La exportación a PDF todavía no está implementada. Usa Excel (CSV) mientras tanto.');
    setTimeout(() => setExportToast(''), 3000);
  };

  const totalPassengers = manifests.reduce((s, m) => s + m.passengers.length, 0);
  const totalRevenue = manifests.reduce((s, m) => s + m.passengers.reduce((a, p) => a + p.fare, 0), 0);
  const completedTrips = trips.filter(t => t.status === 'COMPLETADO').length;

  const visibleTypes = isPRO ? REPORT_TYPES : REPORT_TYPES.filter(r => !r.pro);

  // Recaudación por Empresa (plan-pro.md §7) -- vista PRO consolidada, agrupada
  // por empresa miembro en vez de por vehículo individual. Se calcula sobre los
  // mismos manifiestos ya filtrados (respeta el filtro de empresa/código), nunca
  // sobre datos inventados.
  const revenueByCompany = filteredManifests.reduce((acc, m) => {
    const row = acc.get(m.company) ?? { company: m.company, passengers: 0, revenue: 0, byMethod: {} as Record<string, number> };
    row.passengers += m.passengers.length;
    for (const p of m.passengers) {
      row.revenue += p.fare;
      row.byMethod[p.paymentMethod] = (row.byMethod[p.paymentMethod] ?? 0) + p.fare;
    }
    acc.set(m.company, row);
    return acc;
  }, new Map<string, { company: string; passengers: number; revenue: number; byMethod: Record<string, number> }>());
  const revenueByCompanyRows = Array.from(revenueByCompany.values()).sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-t1">Reportes</h1>
        <p className="text-sm text-t2 mt-0.5">ATIPCAR · Exportar resultados en PDF o Excel</p>
      </div>

      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-base font-semibold text-t1 mb-4">Filtros</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-5">
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Tipo de reporte</label>
            <select value={reportType} onChange={e => { setReportType(e.target.value); setGenerated(false); }} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              {visibleTypes.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-t1 mb-1">Desde</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setGenerated(false); }} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-t1 mb-1">Hasta</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setGenerated(false); }} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Empresa</label>
            <select value={filterCompany} onChange={e => { setFilterCompany(e.target.value); setGenerated(false); }} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Todas las empresas</option>
              {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Ruta</label>
            <select value={filterRoute} onChange={e => { setFilterRoute(e.target.value); setGenerated(false); }} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Todas las rutas</option>
              <option value="JULI_PUNO">{routeLabel('JULI_PUNO', org)}</option>
              <option value="PUNO_JULI">{routeLabel('PUNO_JULI', org)}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Código de unidad</label>
            <input value={filterCode} onChange={e => { setFilterCode(e.target.value); setGenerated(false); }} placeholder="Ej. 007" className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Estado</label>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setGenerated(false); }} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Todos los estados</option>
              <option value="PROGRAMADO">Programado</option>
              <option value="ACTIVO">En ruta</option>
              <option value="COMPLETADO">Completado</option>
              <option value="CON_INCIDENCIA">Con incidencia</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={dataLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-60"
          >
            <BarChart2 size={14} />
            Generar reporte
          </button>
          {dataLoading && <span className="text-sm text-t2">Cargando datos…</span>}
        </div>
        {dataError && <p className="text-sm text-danger mt-2">{dataError}</p>}
      </div>

      {exportToast && (
        <div className="flex items-center gap-2 p-3 bg-ok/5 border border-ok/30 rounded-lg text-sm text-ok">
          <CheckCircle size={13} />
          {exportToast}
        </div>
      )}

      {generated && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-base font-semibold text-t1">
              {visibleTypes.find(r => r.id === reportType)?.label}
              {' · '}{dateFrom === dateTo ? dateFrom : `${dateFrom} — ${dateTo}`}
              {filterCompany && ` · ${filterCompany}`}
              {filterRoute === 'JULI_PUNO' ? ` · ${routeLabelShort('JULI_PUNO', org)}` : filterRoute === 'PUNO_JULI' ? ` · ${routeLabelShort('PUNO_JULI', org)}` : ''}
            </h3>
            <div className="flex items-center gap-2">
              <button onClick={handleExportPdf} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                <Download size={13} /> PDF
              </button>
              <span className="text-border">|</span>
              <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                <Download size={13} /> Excel
              </button>
            </div>
          </div>
          <div className="p-5">
            {reportType === 'viajes' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Completados', value: completedTrips },
                    { label: 'En ruta', value: trips.filter(t => t.status === 'ACTIVO').length },
                    { label: 'Con incidencia', value: trips.filter(t => t.status === 'CON_INCIDENCIA').length },
                    { label: 'Programados', value: trips.filter(t => t.status === 'PROGRAMADO').length },
                  ].map(item => (
                    <div key={item.label} className="bg-bg rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-t1">{item.value}</div>
                      <div className="text-sm text-t2 mt-0.5">{item.label}</div>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm border border-border rounded-lg overflow-hidden" aria-label="Reporte de viajes">
                  <thead>
                    <tr className="bg-bg border-b border-border">
                      {['Cód.', 'Placa', 'Conductor', 'Empresa', 'Ruta', 'Salida real', 'GPS', 'Estado'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-t2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTrips.map(t => (
                      <tr key={t.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-semibold text-t1">{t.code}</td>
                        <td className="px-3 py-2 font-mono text-t1">{t.plate}</td>
                        <td className="px-3 py-2 text-t1">{t.driverName}</td>
                        <td className="px-3 py-2 text-t2">{t.company}</td>
                        <td className="px-3 py-2 text-t2">{routeLabelShort(t.route, org)}</td>
                        <td className="px-3 py-2 font-mono text-t1">{t.actualDeparture ?? t.scheduledDeparture}</td>
                        <td className="px-3 py-2 text-t2">{t.gpsStatus === 'GPS_PRO_DEMO' ? 'GPS PRO' : t.gpsStatus === 'REGISTRO_MOVIL' ? 'Móvil' : 'Sin GPS'}</td>
                        <td className="px-3 py-2 text-t2">{t.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {reportType === 'pasajeros' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Total pasajeros', value: String(totalPassengers) },
                    { label: 'Recaudación total', value: `S/ ${totalRevenue.toLocaleString()}` },
                    { label: 'Promedio por viaje', value: `S/ ${Math.round(totalRevenue / (manifests.length || 1))}` },
                  ].map(item => (
                    <div key={item.label} className="bg-bg rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-t1">{item.value}</div>
                      <div className="text-sm text-t2 mt-0.5">{item.label}</div>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm border border-border rounded-lg overflow-hidden" aria-label="Manifiestos">
                  <thead>
                    <tr className="bg-bg border-b border-border">
                      {['Manifiesto', 'Código', 'Ruta', 'Pasajeros', 'Recaudación', 'Estado'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-t2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredManifests.map(m => (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-mono text-t1">{m.number}</td>
                        <td className="px-3 py-2 font-semibold text-t1">{m.code}</td>
                        <td className="px-3 py-2 text-t2">{routeLabelShort(m.route, org)}</td>
                        <td className="px-3 py-2 text-t1">{m.passengers.length}/{m.capacity}</td>
                        <td className="px-3 py-2 text-ok font-medium">S/ {m.passengers.reduce((s, p) => s + p.fare, 0)}</td>
                        <td className="px-3 py-2 text-t2">{m.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {reportType === 'recaudacion-empresa' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Empresas', value: String(revenueByCompanyRows.length) },
                    { label: 'Recaudación total', value: `S/ ${revenueByCompanyRows.reduce((s, r) => s + r.revenue, 0).toLocaleString()}` },
                    { label: 'Pasajeros', value: String(revenueByCompanyRows.reduce((s, r) => s + r.passengers, 0)) },
                  ].map(item => (
                    <div key={item.label} className="bg-bg rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-t1">{item.value}</div>
                      <div className="text-sm text-t2 mt-0.5">{item.label}</div>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-border rounded-lg overflow-hidden" aria-label="Recaudación por empresa">
                    <thead>
                      <tr className="bg-bg border-b border-border">
                        {['Empresa', 'Pasajeros', 'Efectivo', 'Yape', 'Plin', 'Total'].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-t2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {revenueByCompanyRows.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-t2">Sin manifiestos en el rango filtrado.</td></tr>
                      ) : revenueByCompanyRows.map(r => (
                        <tr key={r.company} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-semibold text-t1">{r.company}</td>
                          <td className="px-3 py-2 text-t1">{r.passengers}</td>
                          <td className="px-3 py-2 text-t2">S/ {(r.byMethod.EFECTIVO ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-t2">S/ {(r.byMethod.YAPE ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-t2">S/ {(r.byMethod.PLIN ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-ok font-medium">S/ {r.revenue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {extraLoading && ['reubicaciones', 'eficiencia', 'conduccion', 'mantenimiento'].includes(reportType) && (
              <p className="text-sm text-t2 text-center py-6">Calculando sobre datos reales…</p>
            )}
            {extraError && <p className="text-sm text-danger text-center py-2">{extraError}</p>}

            {!extraLoading && reportType === 'reubicaciones' && queuePattern && (
              <div className="space-y-4">
                <p className="text-xs text-t2 flex items-center gap-1.5">
                  <ArrowLeftRight size={13} /> Compara la cola actual de cada terminal contra el promedio histórico real de esta hora ({queuePattern.hour}:00), sobre los últimos {queuePattern.windowDays} días. El administrador decide si reubica — el sistema nunca ejecuta nada solo.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {queuePattern.terminals.map(t => (
                    <div key={t.route} className="bg-bg rounded-lg p-4">
                      <p className="text-sm font-semibold text-t1">{routeLabel(t.route, org)}</p>
                      <p className="text-2xl font-bold text-t1 mt-1">{t.currentCount} <span className="text-sm font-normal text-t2">en cola ahora</span></p>
                      <p className="text-sm text-t2 mt-0.5">Promedio histórico a esta hora: {t.historicalAverageThisHour}</p>
                    </div>
                  ))}
                </div>
                {queuePattern.suggestedRelocation ? (
                  <div className="bg-accent/5 border border-accent/30 rounded-lg p-4 text-sm text-t1">
                    Considera reubicar <strong>{queuePattern.suggestedRelocation.units}</strong> unidad(es) de {routeLabel(queuePattern.suggestedRelocation.from, org)} hacia {routeLabel(queuePattern.suggestedRelocation.to, org)}.
                  </div>
                ) : (
                  <p className="text-sm text-t2">No hay un desbalance claro frente al patrón histórico ahora mismo.</p>
                )}
              </div>
            )}

            {!extraLoading && reportType === 'eficiencia' && turnaround && (
              <div className="space-y-4">
                <p className="text-xs text-t2">Tiempos de vuelta reales (viajes completados, últimos {turnaround.windowDays} días) por empresa, comparados contra el promedio del corredor. Es evidencia para conversar con la empresa, no una sanción.</p>
                {turnaround.corridorAverageMinutes == null ? (
                  <p className="text-sm text-t2">Todavía no hay viajes completados con salida y llegada registradas en este rango.</p>
                ) : (
                  <>
                    <div className="bg-bg rounded-lg p-3 text-center w-fit px-6">
                      <div className="text-2xl font-bold text-t1">{turnaround.corridorAverageMinutes} min</div>
                      <div className="text-sm text-t2 mt-0.5">Promedio del corredor</div>
                    </div>
                    <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-bg border-b border-border">
                          {['Empresa', 'Viajes', 'Promedio de vuelta'].map(h => <th key={h} className="text-left px-3 py-2 text-t2 font-medium">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {turnaround.companies.map(c => (
                          <tr key={c.companyId} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 font-semibold text-t1">{c.companyName}</td>
                            <td className="px-3 py-2 text-t2">{c.tripCount}</td>
                            <td className={`px-3 py-2 ${c.averageMinutes > turnaround.corridorAverageMinutes! ? 'text-warn font-medium' : 'text-t1'}`}>{c.averageMinutes} min</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}

            {!extraLoading && reportType === 'conduccion' && drivingEvents && (
              <div className="space-y-4">
                <div className="bg-warn/5 border border-warn/30 rounded-lg p-3 text-sm text-t1 flex items-start gap-2">
                  <Gauge size={15} className="mt-0.5 flex-shrink-0" />
                  <span>Solo conteo de eventos reales de frenada brusca por conductor (últimos {drivingEvents.windowDays} días) — <strong>no es un puntaje ni un ranking</strong>. Con pocas semanas de datos no alcanza para saber qué es normal en este corredor; úsalo solo como evidencia inicial, nunca para sancionar.</span>
                </div>
                {drivingEvents.drivers.length === 0 ? (
                  <p className="text-sm text-t2">Sin eventos detectados en el rango (o sin unidades con GPS real vinculado).</p>
                ) : (
                  <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-bg border-b border-border">
                        {['Conductor', 'Frenadas bruscas detectadas'].map(h => <th key={h} className="text-left px-3 py-2 text-t2 font-medium">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {drivingEvents.drivers.map(d => (
                        <tr key={d.driverId} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-semibold text-t1">{d.driverName}</td>
                          <td className="px-3 py-2 text-t1">{d.harshBrakingCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {!extraLoading && reportType === 'mantenimiento' && (
              <div className="space-y-4">
                <p className="text-xs text-t2 flex items-center gap-1.5">
                  <Wrench size={13} /> El intervalo lo defines tú según la realidad de tu flota — el sistema solo compara contra el kilometraje real que reporta el GPS.
                </p>
                <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-bg border-b border-border">
                      {['Unidad', 'Kilometraje actual', 'Último servicio (km)', 'Intervalo (km)', 'Estado', ''].map(h => <th key={h} className="text-left px-3 py-2 text-t2 font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceVehicles.map(v => {
                      const live = maintenanceLive.find(p => p.vehicleId === v.id);
                      const currentKm = live?.odometerKm ?? null;
                      const due = currentKm != null && v.lastServiceKm != null && v.serviceIntervalKm != null
                        ? currentKm - v.lastServiceKm - v.serviceIntervalKm
                        : null;
                      const editing = maintenanceDraft?.vehicleId === v.id;
                      return (
                        <tr key={v.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-semibold text-t1">{v.code}</td>
                          <td className="px-3 py-2 text-t2">{currentKm != null ? `${currentKm.toLocaleString('es-PE')} km` : 'Sin dato GPS'}</td>
                          <td className="px-3 py-2">
                            {editing ? (
                              <input type="number" value={maintenanceDraft!.lastServiceKm} onChange={e => setMaintenanceDraft(d => d && { ...d, lastServiceKm: e.target.value })} className="w-24 h-8 px-2 border border-border rounded text-sm" />
                            ) : (v.lastServiceKm != null ? `${v.lastServiceKm.toLocaleString('es-PE')} km` : '—')}
                          </td>
                          <td className="px-3 py-2">
                            {editing ? (
                              <input type="number" value={maintenanceDraft!.serviceIntervalKm} onChange={e => setMaintenanceDraft(d => d && { ...d, serviceIntervalKm: e.target.value })} className="w-24 h-8 px-2 border border-border rounded text-sm" />
                            ) : (v.serviceIntervalKm != null ? `${v.serviceIntervalKm.toLocaleString('es-PE')} km` : '—')}
                          </td>
                          <td className="px-3 py-2">
                            {due == null ? <span className="text-t2">Sin configurar</span> : due >= 0 ? <span className="text-danger font-medium">Toca servicio ({Math.round(due)} km de más)</span> : <span className="text-ok">Al día ({Math.round(-due)} km restantes)</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {editing ? (
                              <div className="flex gap-1.5 justify-end">
                                <button onClick={handleSaveMaintenance} disabled={maintenanceSaving} className="px-2.5 py-1 text-xs font-medium bg-primary text-white rounded hover:bg-primary-h disabled:opacity-50">{maintenanceSaving ? 'Guardando…' : 'Guardar'}</button>
                                <button onClick={() => setMaintenanceDraft(null)} disabled={maintenanceSaving} className="px-2.5 py-1 text-xs font-medium text-t2 border border-border rounded hover:bg-hover">Cancelar</button>
                              </div>
                            ) : (
                              <button onClick={() => setMaintenanceDraft({ vehicleId: v.id, lastServiceKm: v.lastServiceKm != null ? String(v.lastServiceKm) : '', serviceIntervalKm: v.serviceIntervalKm != null ? String(v.serviceIntervalKm) : '' })} className="px-2.5 py-1 text-xs font-medium text-primary border border-primary/30 rounded hover:bg-primary/5">Configurar</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'gps' && (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🛰</div>
                <p className="text-sm font-medium text-t1">Reporte GPS PRO</p>
                <p className="text-sm text-t2 mt-1 max-w-sm mx-auto">Recorridos, velocidades, paradas y pérdidas de señal por unidad.</p>
              </div>
            )}

            {!['viajes', 'pasajeros', 'recaudacion-empresa', 'gps', 'reubicaciones', 'eficiencia', 'conduccion', 'mantenimiento'].includes(reportType) && (
              <div className="text-center py-12 text-t2">
                <BarChart2 size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Reporte generado</p>
                <p className="text-sm text-muted mt-1">Los datos reales se mostrarían al conectar el sistema productivo.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
