import { useState, useEffect } from 'react';
import { Filter, Download, Repeat } from 'lucide-react';
import { fetchTrips, fetchManifests, routeLabel, type Organization } from '../lib/operacion-api';
import { localDateStr } from '../lib/dates';
import type { RouteDir, TripStatus } from '../types';

// Reporte de produccion/recaudacion compartido entre Conductor y Socio (12
// sept 2026, decidido con Jayde): el conductor lo usa para rendirle cuentas
// a su socio (cuanto recaudo, por que metodo de pago) al cierre del dia/
// semana; el socio ve EXACTAMENTE el mismo calculo para controlar que lo
// que el conductor le entrega coincide con lo que el sistema registro. Por
// eso es un solo componente compartido -- si cada panel calculara "vueltas"
// o la recaudacion por su cuenta, podrian mostrar numeros distintos y la
// rendicion de cuentas dejaria de servir para controlar nada.
//
// Definicion real de "vuelta" (ya usada por el asistente AI en
// assistant.service.ts toolContarVueltas, aqui replicada para que ambos
// paneles la vean sin depender de Plan PRO): un tramo completado (Trip
// status COMPLETADO) es medio viaje. Dos tramos = 1 vuelta. Un tramo suelto
// sin su par = "media vuelta extra" (ej. fue a Puno y se quedo, sin volver
// todavia). Nunca cuenta un viaje ACTIVO/en curso como tramo completado.
type Period = 'hoy' | '7dias' | 'mes' | 'personalizado';
type RouteFilterValue = 'todas' | RouteDir;
type StatusFilterValue = 'todos' | TripStatus;

interface ReportRow {
  id: string; date: string; route: RouteDir; status: TripStatus;
  departure: string; arrival: string; passengers: number;
  efectivo: number; yape: number; plin: number; transferencia: number; qr: number; manifest: string;
}

function pdfSafeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function createPdfBlob(lines: string[]) {
  const textCommands = lines.slice(0, 45).map((line, index) =>
    (index === 0 ? '' : 'T* ') + '(' + pdfSafeText(line) + ') Tj'
  ).join('\n');
  const stream = 'BT\n/F1 10 Tf\n50 790 Td\n14 TL\n' + textCommands + '\nET';
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    '5 0 obj << /Length ' + stream.length + ' >> stream\n' + stream + '\nendstream\nendobj',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(object => {
    offsets.push(pdf.length);
    pdf += object + '\n';
  });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n';
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach(offset => {
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += 'trailer << /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\n';
  pdf += 'startxref\n' + xref + '\n%%EOF';
  return new Blob([pdf], { type: 'application/pdf' });
}

function downloadBrowserFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    ACTIVO: 'bg-ok/10 text-ok',
    PROGRAMADO: 'bg-t2/10 text-t2',
    COMPLETADO: 'bg-primary/10 text-primary',
    CON_INCIDENCIA: 'bg-danger/10 text-danger',
    CANCELADO: 'bg-t2/10 text-t2',
  };
  const labels: Record<string, string> = {
    ACTIVO: 'En ruta', PROGRAMADO: 'Programado', COMPLETADO: 'Completado',
    CON_INCIDENCIA: 'Con incidencia', CANCELADO: 'Cancelado',
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${map[s] ?? 'bg-t2/10 text-t2'}`}>
      {labels[s] ?? s}
    </span>
  );
}

export default function ProductionReportView({
  code,
  orgName,
  org,
  personName,
  personLabel,
  defaultRoute = 'todas',
}: {
  code: string;
  orgName?: string;
  // La asociacion, para mostrar SUS nombres de ruta (ida y retorno).
  org?: Organization | null;
  personName?: string;
  // Como se llama en el encabezado del PDF/CSV -- "Conductor" o "Socio".
  personLabel: string;
  defaultRoute?: RouteFilterValue;
}) {
  const [period, setPeriod] = useState<Period>('7dias');
  const [routeFilter, setRouteFilter] = useState<RouteFilterValue>(defaultRoute);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('todos');
  const today = localDateStr();
  const weekAgo = localDateStr(new Date(Date.now() - 7 * 24 * 3600 * 1000));
  const monthAgo = localDateStr(new Date(Date.now() - 30 * 24 * 3600 * 1000));
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [downloadMsg, setDownloadMsg] = useState('');
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTrips(), fetchManifests()])
      .then(([trips, manifests]) => {
        if (cancelled) return;
        const manifestById = new Map(manifests.map(m => [m.id, m]));
        const built: ReportRow[] = trips
          .filter(t => t.code === code)
          .map(t => {
            const manifest = t.manifestId ? manifestById.get(t.manifestId) : undefined;
            const dateISO = t.actualDepartureISO ?? t.scheduledDepartureISO;
            const fareBy = (method: string) =>
              manifest ? manifest.passengers.filter(p => p.paymentMethod === method).reduce((s, p) => s + p.fare, 0) : 0;
            return {
              id: t.id,
              date: dateISO ? localDateStr(new Date(dateISO)) : (manifest?.date ?? ''),
              route: t.route,
              status: t.status,
              departure: t.actualDeparture ?? t.scheduledDeparture,
              arrival: t.actualArrival ?? t.scheduledArrival ?? '—',
              passengers: manifest?.passengers.length ?? 0,
              efectivo: fareBy('EFECTIVO'),
              yape: fareBy('YAPE'),
              plin: fareBy('PLIN'),
              transferencia: fareBy('TRANSFERENCIA'),
              qr: fareBy('QR'),
              manifest: manifest?.number ?? 'Sin manifiesto',
            };
          });
        setRows(built);
      })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar los viajes.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [code]);

  const filtered = rows.filter(t => {
    if (routeFilter !== 'todas' && t.route !== routeFilter) return false;
    if (statusFilter !== 'todos' && t.status !== statusFilter) return false;
    if (!t.date) return true; // sin fecha real (viaje sin manifiesto todavia) -- nunca se oculta por un filtro de fecha que no puede evaluar
    if (period === 'hoy') return t.date === today;
    if (period === '7dias') return t.date >= weekAgo;
    if (period === 'mes') return t.date >= monthAgo;
    if (period === 'personalizado') return t.date >= dateFrom && t.date <= dateTo;
    return true;
  });

  // Solo tramos REALMENTE completados cuentan para vueltas -- un viaje ACTIVO
  // (todavia en curso) no es un tramo cerrado, y contarlo inflaria la cifra.
  const tramosCompletados = filtered.filter(t => t.status === 'COMPLETADO').length;
  const vueltasCompletas = Math.floor(tramosCompletados / 2);
  const mediaVueltaExtra = tramosCompletados % 2 === 1;

  const report = {
    tramosCompletados,
    vueltasCompletas,
    mediaVueltaExtra,
    pasajeros: filtered.reduce((s, t) => s + t.passengers, 0),
    efectivo: filtered.reduce((s, t) => s + t.efectivo, 0),
    yape: filtered.reduce((s, t) => s + t.yape, 0),
    plin: filtered.reduce((s, t) => s + t.plin, 0),
    transferencia: filtered.reduce((s, t) => s + t.transferencia, 0),
    qr: filtered.reduce((s, t) => s + t.qr, 0),
  };
  const totalRecaudado = report.efectivo + report.yape + report.plin + report.transferencia + report.qr;
  const vueltasLabel = `${report.vueltasCompletas}${report.mediaVueltaExtra ? ' y media' : ''}`;

  const handleDownload = (fmt: 'PDF' | 'CSV') => {
    const routeName = routeFilter === 'todas' ? 'Todas' : routeLabel(routeFilter, org);
    const fileBase = 'reporte-produccion-' + code.toLowerCase();
    if (fmt === 'CSV') {
      const header = 'Fecha,Ruta,Salida,Llegada,Pasajeros,Efectivo,Yape,Plin,Transferencia,QR,Total,Estado,Manifiesto';
      const csvRows = filtered.map(t => [
        t.date, t.route, t.departure, t.arrival, t.passengers,
        t.efectivo, t.yape, t.plin, t.transferencia, t.qr,
        t.efectivo + t.yape + t.plin + t.transferencia + t.qr,
        t.status, t.manifest,
      ].join(','));
      downloadBrowserFile(new Blob([[header, ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8' }), fileBase + '.csv');
    } else {
      const lines = [
        (orgName ?? 'CHASKI AI') + ' - REPORTE DE PRODUCCION',
        personLabel + ': ' + (personName ?? 'Sin dato'),
        'Unidad: ' + code,
        'Ruta filtrada: ' + routeName,
        'Periodo: ' + period,
        '',
        ...filtered.map(t => t.date + ' | ' + routeLabel(t.route, org) + ' | ' + t.departure + '-' + t.arrival + ' | ' + t.passengers + ' pasajeros | S/ ' + (t.efectivo + t.yape + t.plin + t.transferencia + t.qr) + ' | ' + t.status),
        '',
        'Vueltas completas: ' + vueltasLabel,
        'Pasajeros: ' + report.pasajeros,
        'Efectivo: S/ ' + report.efectivo,
        'Yape: S/ ' + report.yape,
        'Plin: S/ ' + report.plin,
        'Transferencia: S/ ' + report.transferencia,
        'QR: S/ ' + report.qr,
        'Recaudacion total: S/ ' + totalRecaudado,
      ];
      downloadBrowserFile(createPdfBlob(lines), fileBase + '.pdf');
    }
    setDownloadsOpen(false);
    setDownloadMsg('Descarga ' + fmt + ' iniciada');
    setTimeout(() => setDownloadMsg(''), 3000);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-t2">
          <Filter size={13} /> Filtros
        </div>
        <div className="flex items-center gap-2">
          {downloadMsg && <span className="text-xs text-ok">{downloadMsg}</span>}
          <div className="relative">
            <button onClick={() => setDownloadsOpen(open => !open)} aria-expanded={downloadsOpen} className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-t1 hover:bg-hover">
              <Download size={14} /> Descargar reporte
            </button>
            <div className={`absolute right-0 mt-1 w-36 bg-surface border border-border rounded-lg shadow-lg z-10 py-1 ${downloadsOpen ? 'block' : 'hidden'}`}>
              <button onClick={() => handleDownload('PDF')} className="w-full text-left px-3 py-2 text-xs hover:bg-hover">Descargar PDF</button>
              <button onClick={() => handleDownload('CSV')} className="w-full text-left px-3 py-2 text-xs hover:bg-hover">Descargar CSV</button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-[11px] text-muted mb-1">Periodo</label>
            <div className="flex gap-1">
              {([['hoy', 'Hoy'], ['7dias', 'Últ. 7 días'], ['mes', 'Este mes'], ['personalizado', 'Personalizado']] as [Period, string][]).map(([v, l]) => (
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
          <div>
            <label className="block text-[11px] text-muted mb-1">Ruta</label>
            <select
              value={routeFilter}
              onChange={e => setRouteFilter(e.target.value as RouteFilterValue)}
              className="h-8 px-2 border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="todas">Todas</option>
              <option value="JULI_PUNO">{routeLabel('JULI_PUNO', org)}</option>
              <option value="PUNO_JULI">{routeLabel('PUNO_JULI', org)}</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted mb-1">Estado</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilterValue)}
              className="h-8 px-2 border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="todos">Todos</option>
              <option value="ACTIVO">En ruta</option>
              <option value="COMPLETADO">Completado</option>
              <option value="CANCELADO">Cancelado</option>
              <option value="CON_INCIDENCIA">Con incidencia</option>
            </select>
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
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Vueltas', value: vueltasLabel, cls: 'text-t1', icon: true },
          { label: 'Pasajeros', value: String(report.pasajeros), cls: 'text-t1' },
          { label: 'Efectivo', value: `S/ ${report.efectivo}`, cls: 'text-t1' },
          { label: 'Yape', value: `S/ ${report.yape}`, cls: 'text-t1' },
          { label: 'Plin', value: `S/ ${report.plin}`, cls: 'text-t1' },
          { label: 'Transferencia / QR', value: `S/ ${report.transferencia + report.qr}`, cls: 'text-t1' },
          { label: 'Recaudación total', value: `S/ ${totalRecaudado}`, cls: 'text-ok font-semibold' },
        ].map(stat => (
          <div key={stat.label} className="bg-surface border border-border rounded-lg px-3 py-3 text-center">
            <p className={`text-base font-bold flex items-center justify-center gap-1 ${stat.cls}`}>
              {stat.icon && <Repeat size={13} />} {stat.value}
            </p>
            <p className="text-[11px] text-t2 mt-0.5 leading-tight">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label="Tabla de producción">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-3 py-2.5 text-t2 font-medium whitespace-nowrap">Fecha</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium whitespace-nowrap">Ruta</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium whitespace-nowrap">Salida</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium whitespace-nowrap">Llegada</th>
                <th className="text-right px-3 py-2.5 text-t2 font-medium whitespace-nowrap">Pas.</th>
                <th className="text-right px-3 py-2.5 text-t2 font-medium whitespace-nowrap">Efectivo</th>
                <th className="text-right px-3 py-2.5 text-t2 font-medium whitespace-nowrap">Yape</th>
                <th className="text-right px-3 py-2.5 text-t2 font-medium whitespace-nowrap">Plin</th>
                <th className="text-right px-3 py-2.5 text-t2 font-medium whitespace-nowrap">Transf./QR</th>
                <th className="text-right px-3 py-2.5 text-t2 font-medium whitespace-nowrap">Total</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium whitespace-nowrap">Estado</th>
                <th className="text-left px-3 py-2.5 text-t2 font-medium whitespace-nowrap">Manifiesto</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-t2">Cargando…</td></tr>
              ) : loadError ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-danger">{loadError}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-t2">Sin viajes con los filtros seleccionados</td></tr>
              ) : filtered.map(t => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-hover/50">
                  <td className="px-3 py-2.5 font-mono text-t2 whitespace-nowrap">{t.date.slice(5)}</td>
                  <td className="px-3 py-2.5 text-t1 whitespace-nowrap">{routeLabel(t.route, org)}</td>
                  <td className="px-3 py-2.5 font-mono text-t2">{t.departure}</td>
                  <td className="px-3 py-2.5 font-mono text-t2">{t.status === 'ACTIVO' ? '—' : t.arrival}</td>
                  <td className="px-3 py-2.5 text-right text-t1">{t.passengers}</td>
                  <td className="px-3 py-2.5 text-right text-t1">S/{t.efectivo}</td>
                  <td className="px-3 py-2.5 text-right text-t1">S/{t.yape}</td>
                  <td className="px-3 py-2.5 text-right text-t1">S/{t.plin}</td>
                  <td className="px-3 py-2.5 text-right text-t1">S/{t.transferencia + t.qr}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-ok">S/{t.efectivo + t.yape + t.plin + t.transferencia + t.qr}</td>
                  <td className="px-3 py-2.5">{statusBadge(t.status)}</td>
                  <td className="px-3 py-2.5 font-mono text-muted text-[11px]">{t.manifest}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-muted text-center">1 vuelta = ida + vuelta completa (2 tramos). Un tramo suelto sin su par se muestra como "y media".</p>
    </div>
  );
}
