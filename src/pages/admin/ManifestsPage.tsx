import { useState, useEffect, useCallback } from 'react';
import { Search, FileText, Download, X, AlertCircle, CheckCircle, FileWarning, FilePen, Loader2, UserPlus, Lock, Save } from 'lucide-react';
import { fetchManifests, correctManifest, addManifestPassenger, closeManifest, routeLabel, terminalName } from '../../lib/operacion-api';
import SeatMap from '../../components/SeatMap';
import type { Manifest, ManifestStatus, PaymentMethod } from '../../types';
import { useAdminDemo } from './AdminApp';
import DocumentField from '../../components/DocumentField';
import { isValidDocument, type DocumentType } from '../../lib/validators';

const STATUS_STYLE: Record<ManifestStatus, { label: string; cls: string }> = {
  BORRADOR: { label: 'Borrador', cls: 'bg-t2/10 text-t2' },
  CERRADO: { label: 'Cerrado', cls: 'bg-ok/10 text-ok' },
  CON_INCIDENCIA: { label: 'Con incidencia', cls: 'bg-danger/10 text-danger' },
  CORREGIDO: { label: 'Corregido', cls: 'bg-primary/10 text-primary' },
};

// Generador minimo de PDF (mismo enfoque liviano que ya usa DriverApp.tsx
// para el manifiesto impreso): un solo bloque de texto, sin imagenes ni
// dependencias externas -- suficiente para que "Descargar PDF" (antes sin
// ningun onClick) entregue un documento real con los datos del manifiesto.
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
  const textCommands = lines.slice(0, 55).map((line, index) =>
    (index === 0 ? '' : 'T* ') + '(' + pdfSafeText(line) + ') Tj'
  ).join('\n');
  const stream = 'BT\n/F1 9 Tf\n50 800 Td\n13 TL\n' + textCommands + '\nET';
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    '5 0 obj << /Length ' + stream.length + ' >> stream\n' + stream + '\nendstream\nendobj',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(object => { offsets.push(pdf.length); pdf += object + '\n'; });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  offsets.slice(1).forEach(offset => { pdf += String(offset).padStart(10, '0') + ' 00000 n \n'; });
  pdf += 'trailer << /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return new Blob([pdf], { type: 'application/pdf' });
}

function downloadManifestPdf(m: Manifest, orgName: string) {
  const total = m.passengers.reduce((s, p) => s + p.fare, 0);
  const lines = [
    (orgName || 'CHASKI AI') + ' - MANIFIESTO ' + m.number,
    'Ruta: ' + (m.route === 'JULI_PUNO' ? 'Juli -> Puno' : 'Puno -> Juli') + '   Fecha: ' + m.date + '   Salida: ' + m.departureTime,
    'Unidad: ' + m.code + '   Placa: ' + m.plate + '   Empresa: ' + m.company + '   Conductor: ' + m.driverName,
    'Estado: ' + m.status + '   Capacidad: ' + m.capacity,
    '',
    'Asiento | Pasajero | DNI | Origen | Destino | Tarifa | Pago',
    ...m.passengers
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map(p => `${p.seat} | ${p.name} | ${p.dni} | ${p.origin} | ${p.destination} | S/ ${p.fare} | ${p.paymentMethod}`),
    '',
    'Total pasajeros: ' + m.passengers.length,
    'Recaudacion total: S/ ' + total,
  ];
  const blob = createPdfBlob(lines);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `manifiesto-${m.number}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ManifestDetail({
  m, onClose, onCorrect, onAddPassenger, onCloseManifest, addingPassenger, closingManifest,
}: {
  m: Manifest;
  onClose: () => void;
  onCorrect: () => void;
  onAddPassenger: (p: { name: string; dni: string; documentType?: DocumentType; seat: number; fare: number; paymentMethod: PaymentMethod; origin: string; destination: string }) => Promise<void>;
  onCloseManifest: () => void;
  addingPassenger: boolean;
  closingManifest: boolean;
}) {
  const totalRevenue = m.passengers.reduce((s, p) => s + p.fare, 0);
  const METHODS = ['EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA', 'QR'] as const;
  const byMethod = Object.fromEntries(
    METHODS.map(method => {
      const matching = m.passengers.filter(p => p.paymentMethod === method);
      return [method, { count: matching.length, total: matching.reduce((s, p) => s + p.fare, 0) }];
    }),
  ) as Record<(typeof METHODS)[number], { count: number; total: number }>;
  const [showAdd, setShowAdd] = useState(false);
  const [pNombres, setPNombres] = useState('');
  const [pApellidos, setPApellidos] = useState('');
  const [pDni, setPDni] = useState('');
  const [pDocType, setPDocType] = useState<DocumentType>('DNI');
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [pFare, setPFare] = useState('10');
  const [pMethod, setPMethod] = useState<PaymentMethod>('EFECTIVO');
  const { org } = useAdminDemo();
  const [pOrigin, setPOrigin] = useState(terminalName(m.route === 'JULI_PUNO' ? 'JULI' : 'PUNO', org));
  const [pDestination, setPDestination] = useState(terminalName(m.route === 'JULI_PUNO' ? 'PUNO' : 'JULI', org));
  const occupiedSeats = m.passengers.map(p => p.seat);
  // DNI = 8 números; carné de extranjería y pasaporte tienen su propio formato.
  const dniValid = isValidDocument(pDocType, pDni);

  const resetAddForm = () => {
    setPNombres(''); setPApellidos(''); setPDni(''); setPDocType('DNI'); setSelectedSeat(null); setPFare('10'); setPMethod('EFECTIVO');
  };

  const handleAdd = async () => {
    const fare = Number(pFare);
    if (!pNombres || !pApellidos || !dniValid || selectedSeat === null || !Number.isFinite(fare) || fare < 0) return;
    await onAddPassenger({ name: `${pNombres.trim()} ${pApellidos.trim()}`, dni: pDni, documentType: pDocType, seat: selectedSeat, fare, paymentMethod: pMethod, origin: pOrigin, destination: pDestination });
    resetAddForm();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-auto" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-base font-semibold text-t1">{m.number}</h3>
            <p className="text-sm text-t2 mt-0.5">{routeLabel(m.route, org)} · {m.date} · {m.departureTime}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_STYLE[m.status].cls}`}>
              {STATUS_STYLE[m.status].label}
            </span>
            <button onClick={onClose} className="text-muted hover:text-t1" aria-label="Cerrar"><X size={18} /></button>
          </div>
        </div>

        <div className="overflow-auto flex-1 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-t2 uppercase tracking-wide">Unidad</h4>
              <div className="text-sm space-y-1.5">
                {[
                  ['Asociación', org?.name ?? 'Sin dato'],
                  ['Empresa', m.company],
                  ['Código', m.code],
                  ['Vehículo', m.vehicleType],
                  ['Placa', m.plate],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-t2">{k}</span>
                    <span className="text-t1 font-medium font-mono">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-t2 uppercase tracking-wide">Operación</h4>
              <div className="text-sm space-y-1.5">
                {[
                  ['Conductor', m.driverName],
                  ['Operador', m.operator],
                  ['Salida', m.departureTime],
                  ['Llegada', m.arrivalTime ?? '—'],
                  ['Versión', `v${m.version}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-t2">{k}</span>
                    <span className="text-t1 font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {m.correctionReason && (
            <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-2">
              <FilePen size={13} className="text-primary mt-0.5" />
              <p className="text-sm text-primary"><strong>Motivo de corrección:</strong> {m.correctionReason}</p>
            </div>
          )}

          {/* Revenue summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Pasajeros', value: m.passengers.length },
              { label: 'Capacidad', value: m.capacity },
              { label: 'Recaudación', value: `S/ ${totalRevenue}` },
              { label: 'Ocup.', value: `${Math.round((m.passengers.length / m.capacity) * 100)}%` },
            ].map(item => (
              <div key={item.label} className="bg-bg rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-t1">{item.value}</div>
                <div className="text-sm text-t2">{item.label}</div>
              </div>
            ))}
          </div>

          {/* Payment breakdown */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-t2 uppercase tracking-wide mb-3">Por método de pago</h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Object.entries(byMethod).map(([method, stats]) => (
                <div key={method} className="border border-border rounded-lg p-3">
                  <div className="text-sm font-semibold text-t1">{stats.count}</div>
                  <div className="text-sm text-t2">{method}</div>
                  <div className="text-sm text-ok">S/ {stats.total}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Passengers list */}
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-t2 uppercase tracking-wide">Pasajeros ({m.passengers.length} / {m.capacity})</h4>
            {(m.status === 'BORRADOR' || m.status === 'CORREGIDO') && (
              <button
                onClick={() => setShowAdd(v => !v)}
                className="flex items-center gap-1.5 px-2 py-1 border border-primary text-primary rounded text-xs font-medium hover:bg-primary/5"
              >
                <UserPlus size={12} /> Agregar pasajero
              </button>
            )}
          </div>

          {showAdd && (
            <div className="border border-primary/30 bg-primary/5 rounded-lg p-3 mb-3">
              <p className="text-sm font-medium text-t1 mb-2">
                {selectedSeat !== null ? `Asiento ${String(selectedSeat).padStart(2, '0')} seleccionado` : 'Toca un asiento libre en el mapa'}
              </p>
              <div className="bg-surface border border-border rounded-lg p-3 mb-3 overflow-x-auto">
                <SeatMap
                  vehicleType={m.vehicleType}
                  occupiedSeats={occupiedSeats}
                  selectedSeats={selectedSeat !== null ? [selectedSeat] : []}
                  onSeatClick={seat => setSelectedSeat(seat)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Nombres" value={pNombres} onChange={e => setPNombres(e.target.value)} className="h-8 px-2 border border-border rounded text-sm" />
                <input placeholder="Apellidos" value={pApellidos} onChange={e => setPApellidos(e.target.value)} className="h-8 px-2 border border-border rounded text-sm" />
                <div className="col-span-2">
                  <DocumentField size="sm" docType={pDocType} value={pDni} onDocType={setPDocType} onValue={setPDni} />
                </div>
                <input placeholder="Tarifa (S/)" type="number" min={0} value={pFare} onChange={e => setPFare(e.target.value)} className="h-8 px-2 border border-border rounded text-sm" />
                <select value={pMethod} onChange={e => setPMethod(e.target.value as PaymentMethod)} className="h-8 px-2 border border-border rounded text-sm">
                  {(['EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA', 'QR'] as const).map(pm => <option key={pm} value={pm}>{pm}</option>)}
                </select>
                <input placeholder="Origen" value={pOrigin} onChange={e => setPOrigin(e.target.value)} className="h-8 px-2 border border-border rounded text-sm" />
                <input placeholder="Destino" value={pDestination} onChange={e => setPDestination(e.target.value)} className="h-8 px-2 border border-border rounded text-sm" />
                <div className="col-span-2 flex justify-end gap-2 mt-1">
                  <button onClick={() => { setShowAdd(false); resetAddForm(); }} className="px-3 py-1.5 text-sm border border-border rounded hover:bg-hover">Cancelar</button>
                  <button
                    onClick={handleAdd}
                    disabled={addingPassenger || !pNombres || !pApellidos || !dniValid || selectedSeat === null}
                    className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary-h disabled:opacity-50"
                  >
                    {addingPassenger ? 'Agregando…' : 'Agregar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm" aria-label="Lista de pasajeros">
              <thead>
                <tr className="bg-bg border-b border-border">
                  <th className="text-left px-3 py-2 text-t2 font-medium">Asiento</th>
                  <th className="text-left px-3 py-2 text-t2 font-medium">Nombre</th>
                  <th className="text-left px-3 py-2 text-t2 font-medium">DNI</th>
                  <th className="text-left px-3 py-2 text-t2 font-medium">Pago</th>
                  <th className="text-left px-3 py-2 text-t2 font-medium">Tarifa</th>
                </tr>
              </thead>
              <tbody>
                {m.passengers.map(p => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-hover">
                    <td className="px-3 py-2 font-mono text-center">{String(p.seat).padStart(2, '0')}</td>
                    <td className="px-3 py-2 text-t1">{p.name}</td>
                    <td className="px-3 py-2 font-mono text-t2">{p.dni}</td>
                    <td className="px-3 py-2 text-t2">{p.paymentMethod}</td>
                    <td className="px-3 py-2 text-ok font-medium">S/ {p.fare}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-t2">
            {m.pdfGenerated ? <><CheckCircle size={13} className="text-ok" /> PDF generado</> : <><AlertCircle size={13} className="text-muted" /> Sin PDF</>}
          </div>
          <div className="flex gap-2">
            {m.status === 'BORRADOR' && (
              <button
                onClick={onCloseManifest}
                disabled={closingManifest}
                className="px-3 py-1.5 text-sm bg-ok text-white rounded hover:bg-ok/90 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Lock size={12} /> {closingManifest ? 'Cerrando…' : 'Cerrar manifiesto'}
              </button>
            )}
            {m.status === 'CORREGIDO' && (
              <button onClick={onClose} className="px-3 py-1.5 text-sm bg-ok text-white rounded hover:bg-ok/90 flex items-center gap-1.5">
                <Save size={12} /> Guardar cambios
              </button>
            )}
            {(m.status === 'CERRADO' || m.status === 'CORREGIDO' || m.status === 'CON_INCIDENCIA') && (
              <button onClick={onCorrect} className="px-3 py-1.5 text-sm border border-warn text-warn rounded hover:bg-warn/5 flex items-center gap-1.5">
                <FilePen size={12} /> {m.status === 'CORREGIDO' ? 'Corregir de nuevo' : 'Corregir'}
              </button>
            )}
            {m.pdfGenerated && (
              <button onClick={() => downloadManifestPdf(m, org?.name ?? '')} className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary-h flex items-center gap-1.5">
                <Download size={12} /> Descargar PDF
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManifestsPage() {
  const { org } = useAdminDemo();
  const [tab, setTab] = useState<ManifestStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Manifest | null>(null);
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCorrectModal, setShowCorrectModal] = useState(false);
  const [correctReason, setCorrectReason] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [addingPassenger, setAddingPassenger] = useState(false);
  const [closingManifest, setClosingManifest] = useState(false);
  const [showPaperBackup, setShowPaperBackup] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await fetchManifests();
      setManifests(list);
      setSelected(prev => (prev ? list.find(m => m.id === prev.id) ?? null : prev));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar los manifiestos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const TABS = [
    { id: 'ALL', label: 'Todos' },
    { id: 'BORRADOR', label: 'Borradores', icon: FilePen },
    { id: 'CERRADO', label: 'Cerrados', icon: CheckCircle },
    { id: 'CON_INCIDENCIA', label: 'Con incidencia', icon: AlertCircle },
    { id: 'CORREGIDO', label: 'Corregidos', icon: FileWarning },
  ];

  const filtered = manifests.filter(m => {
    const matchTab = tab === 'ALL' || m.status === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || m.number.toLowerCase().includes(q) || m.code.includes(q) || m.plate.toLowerCase().includes(q) || m.driverName.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const handleCorrect = async () => {
    if (!selected || !correctReason) return;
    setCorrecting(true);
    try {
      await correctManifest(selected.id, correctReason);
      await reload();
      setSelected(null);
      setShowCorrectModal(false);
      setCorrectReason('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo corregir el manifiesto');
    } finally {
      setCorrecting(false);
    }
  };

  const handleAddPassenger = async (p: { name: string; dni: string; documentType?: DocumentType; seat: number; fare: number; paymentMethod: Manifest['passengers'][number]['paymentMethod']; origin: string; destination: string }) => {
    if (!selected) return;
    setAddingPassenger(true);
    setLoadError('');
    try {
      await addManifestPassenger(selected.id, p);
      await reload();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo agregar el pasajero');
    } finally {
      setAddingPassenger(false);
    }
  };

  const doCloseManifest = async (paperBackupConfirmed?: boolean) => {
    if (!selected) return;
    setClosingManifest(true);
    setLoadError('');
    try {
      await closeManifest(selected.id, undefined, paperBackupConfirmed);
      await reload();
      setShowPaperBackup(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cerrar el manifiesto');
    } finally {
      setClosingManifest(false);
    }
  };

  const handleCloseManifest = () => {
    if (!selected) return;
    if (selected.passengers.length === 0) {
      setShowPaperBackup(true);
      return;
    }
    doCloseManifest();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface">
        <h1 className="text-2xl font-bold text-t1">Ventas y manifiestos</h1>
        <p className="text-sm text-t2 mt-0.5">Jornada {new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
      </div>

      {loadError && (
        <div className="px-6 py-2 bg-danger/5 border-b border-danger/20 text-sm text-danger">{loadError}</div>
      )}

      <div className="border-b border-border bg-surface">
        <div className="flex px-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as ManifestStatus | 'ALL')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-t2 hover:text-t1'}`}
            >
              {t.label}
              <span className="ml-1.5 text-sm text-muted">
                ({manifests.filter(m => t.id === 'ALL' || m.status === t.id).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-3 border-b border-border bg-surface">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Número, código, placa o conductor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-full"
            aria-label="Buscar manifiestos"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-t2">
            <Loader2 size={24} className="mb-2 animate-spin" />
            <p className="text-sm">Cargando manifiestos…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-t2">
            <Search size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Sin resultados</p>
          </div>
        ) : (
        <table className="w-full text-sm" aria-label="Tabla de manifiestos">
          <thead className="sticky top-0">
            <tr className="border-b border-border bg-bg text-sm">
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Número</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Ruta</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Cód.</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Placa</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Conductor</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Empresa</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Pasajeros</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Recaudación</th>
              <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const revenue = m.passengers.reduce((s, p) => s + p.fare, 0);
              return (
                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-hover cursor-pointer" onClick={() => setSelected(m)}>
                  <td className="px-4 py-3 font-mono text-sm text-t1 font-medium">{m.number}</td>
                  <td className="px-4 py-3 text-sm text-t2">{routeLabel(m.route, org)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-t1">{m.code}</td>
                  <td className="px-4 py-3 font-mono text-sm text-t1">{m.plate}</td>
                  <td className="px-4 py-3 text-sm text-t1">{m.driverName}</td>
                  <td className="px-4 py-3 text-sm text-t2">{m.company}</td>
                  <td className="px-4 py-3 text-sm text-t1">{m.passengers.length} / {m.capacity}</td>
                  <td className="px-4 py-3 text-sm text-ok font-medium">S/ {revenue}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${STATUS_STYLE[m.status].cls}`}>
                      {STATUS_STYLE[m.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {m.pdfGenerated && <FileText size={14} className="text-t2" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>

      {selected && (
        <ManifestDetail
          m={selected}
          onClose={() => setSelected(null)}
          onCorrect={() => setShowCorrectModal(true)}
          onAddPassenger={handleAddPassenger}
          onCloseManifest={handleCloseManifest}
          addingPassenger={addingPassenger}
          closingManifest={closingManifest}
        />
      )}

      {showPaperBackup && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-t1 mb-2">Cerrar manifiesto vacío</h3>
            <p className="text-sm text-t2 mb-4">
              {selected.number} no tiene pasajeros cargados. Esto es normal cuando el registro se hizo en papel por falta de señal —
              el manifiesto queda marcado como "pendiente de digitalizar" en vez de perderse.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowPaperBackup(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button
                onClick={() => doCloseManifest(true)}
                disabled={closingManifest}
                className="px-4 py-2 text-sm bg-warn text-white rounded-lg hover:bg-warn/80 disabled:opacity-50"
              >
                {closingManifest ? 'Cerrando…' : 'Confirmar — se registró en papel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCorrectModal && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-t1 mb-2">Corregir manifiesto</h3>
            <p className="text-sm text-t2 mb-4">{selected.number} — Esto creará una nueva versión v{selected.version + 1}. El manifiesto original no se modifica.</p>
            <label className="block text-sm font-medium text-t1 mb-1">Motivo de corrección <span className="text-danger">*</span></label>
            <textarea
              value={correctReason}
              onChange={e => setCorrectReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none mb-4"
              placeholder="Describe la corrección necesaria…"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowCorrectModal(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button onClick={handleCorrect} disabled={!correctReason || correcting} className="px-4 py-2 text-sm bg-warn text-white rounded-lg hover:bg-warn/80 disabled:opacity-50">
                {correcting ? 'Creando…' : 'Crear corrección'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
