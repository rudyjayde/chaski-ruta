import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Home, ListOrdered, FileText, Route, User,
  AlertCircle, CheckCircle, X, Plus, Clock, QrCode,
  ChevronDown, Download, Filter, ArrowRight, RefreshCw, Smartphone,
  MapPin, Car, FileCheck, Eye, RotateCcw, Upload, Trash2, Loader2, Megaphone, WifiOff,
} from 'lucide-react';
import Shell, { type NavItem } from '../../components/layout/Shell';
import DocumentField from '../../components/DocumentField';
import { useAuth } from '../../contexts/AuthContext';
import SeatMap from '../../components/SeatMap';
import GpsAlertBanner from '../../components/GpsAlertBanner';
import ProductionReportView from '../../components/ProductionReportView';
import type { Passenger, PaymentMethod, Person, Unit, QueueEntry, Manifest, Trip, TripStatus, VehicleType, RouteDir } from '../../types';
import {
  fetchQueue, fetchVehicles, joinQueue, confirmArrival, declareLater, getOrCreateDeviceId,
  fetchTrips, fetchManifests, openManifest, addManifestPassenger, closeManifest, digitizeManifest, digitizeSuggest,
  prepareTripForEntry, departQueueEntry, createDelayedRegistrationRequest,
  fetchMyPersonProfile, fetchMyOrganization, type Organization,
  fetchNotices, type Notice,
  fetchGpsLive, fetchGpsDevices, fetchGpsHistory, routeLabelShort, reportGpsAlert,
  type LiveVehiclePosition, type VehicleGpsStatus, type GpsHistoryPoint,
} from '../../lib/operacion-api';
import { getOperationalPosition, getOperationalState, getVehiclesAhead, getQueueDisplayOrder } from '../../lib/queue-ui';
import { localDateStr } from '../../lib/dates';
import { formatLicenseExpiry, isValidDocument, type DocumentType } from '../../lib/validators';

// Estado real de la licencia segun su vencimiento (antes decia "Vigente" y
// "Vence en 585 dias" fijo, sin mirar ningun dato). Los dias se cuentan contra
// la fecha de hoy en Peru (localDateStr), no la de UTC.
function licenseStatusInfo(expiry?: string | null) {
  if (!expiry) return { label: 'No registrada', cls: 'bg-warn/10 text-warn', note: 'Pide a tu administrador que la registre' };
  const days = Math.round((Date.parse(expiry.slice(0, 10)) - Date.parse(localDateStr())) / 86400000);
  const plural = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
  if (days < 0) return { label: 'Vencida', cls: 'bg-danger/10 text-danger', note: `Venció hace ${plural(-days)}` };
  if (days <= 30) return { label: 'Por vencer', cls: 'bg-warn/10 text-warn', note: `Vence en ${plural(days)}` };
  return { label: 'Vigente', cls: 'bg-ok/10 text-ok', note: `Vence en ${plural(days)}` };
}

type Section = 'inicio' | 'cola' | 'manifiesto' | 'viajes' | 'gps' | 'avisos' | 'perfil';


type DriverPerson = Person & {
  roles?: Person['role'][];
};

type DriverUnit = Unit & {
  brand?: string;
  color?: string;
  capacity?: number;
  vendibleCapacity?: number;
  documents?: {
    soat?: string;
    tarjetaPropiedad?: string;
    revisionTecnica?: string;
    permisos?: string;
  };
};

// Identidad real del conductor (docs/planes/ia-aplicada.md): quien es, su
// unidad asignada, su empresa y su ruta -- todo vía fetch real, nunca demo.ts.
// Cada pantalla que llama a este hook hace su propio fetch (mismo patrón que
// usePartnerData() en PartnerApp.tsx), asi que se degrada a listas vacias sin
// romper la app si el backend tarda o falla.
//
// Corregido (12 sept 2026): antes llamaba a fetchPeople() (el directorio
// completo), que es solo ADMINISTRADOR/SUPERADMIN (people.controller.ts) --
// un Conductor real recibia 403 ahi, y como estaba dentro de este mismo
// Promise.all(), TODO el bloque se perdia silenciosamente (incluida la cola
// y las unidades, que si tenian permiso). Ahora usa fetchMyPersonProfile()
// (GET /people/me), el autoservicio que cualquier rol puede leer.
function useDriverContext() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<DriverPerson | null>(null);
  const [units, setUnits] = useState<DriverUnit[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [queueJP, setQueueJP] = useState<QueueEntry[]>([]);
  const [queuePJ, setQueuePJ] = useState<QueueEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyPersonProfile(), fetchVehicles(), fetchMyOrganization(), fetchQueue('JULI_PUNO'), fetchQueue('PUNO_JULI')])
      .then(([myProfile, unitsList, orgResult, jp, pj]) => {
        if (cancelled) return;
        setProfile(myProfile);
        setUnits(unitsList);
        setOrg(orgResult);
        setQueueJP(jp);
        setQueuePJ(pj);
      })
      .catch(() => { /* se degrada a listas vacias mientras tanto */ });
    return () => { cancelled = true; };
  }, [user?.id, user?.email]);

  const driverLiveMapEnabled = Boolean(org?.driverLiveMapEnabled);
  // La unidad asignada es una relacion real del vehiculo (Vehicle.currentDriverId),
  // no un campo de texto en la persona -- linkedUnit es solo un residuo de demo.ts.
  const unit = units.find(item => item.currentDriverId === profile?.id) || units.find(item => item.code === user?.code);
  const code = unit?.code || profile?.code || user?.code || '';
  const company = unit?.company || profile?.company || '';
  const inJuliPuno = queueJP.some(entry => entry.code === code);
  const inPunoJuli = queuePJ.some(entry => entry.code === code);
  const route = inPunoJuli && !inJuliPuno
    ? 'PUNO_JULI' as const
    : unit?.route === 'PUNO_JULI'
      ? 'PUNO_JULI' as const
      : 'JULI_PUNO' as const;

  // GPS Vehicular real (plan-pro.md / plan-gps-vehicular.md): la unidad tiene
  // GPS si tiene un dispositivo Traccar realmente vinculado -- nunca por un
  // codigo de unidad "hardcodeado" (corregido 11 sept 2026). Aplica igual en
  // Plan PRO (dispositivo vino con el plan) o Operacion (GPS Vehicular
  // contratado aparte para esta unidad puntual).
  //
  // Corregido (13 sept 2026): en Operacion, ademas se necesita el Plan GPS
  // Vehicular individual ACTIVO (gpsVehicularActivo) -- si Super Admin lo
  // desactivo por falta de pago del socio, el conductor tambien deja de ver
  // GPS aunque el equipo siga instalado.
  const hasVehicleGPS = Boolean(unit?.traccarDeviceId) && (org?.plan === 'PRO' || unit?.gpsVehicularActivo !== false);

  return { user, profile, unit, code, company, route, driverLiveMapEnabled, org, hasVehicleGPS };
}

const DRIVER_WALLETS_KEY = 'atipcar-driver-wallets-v1';
const YAPE_LOGO_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/v1788068141/2-lgotipo-yape.png';
const PLIN_LOGO_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/v1788068141/Plin_Logo_invertido.webp';

type WalletType = 'YAPE' | 'PLIN';

type WalletConfig = {
  holder: string;
  phone: string;
  qrImage: string;
};

type DriverWallets = Record<WalletType, WalletConfig>;

function useDriverWallets(driverKey: string, defaultHolder: string, defaultPhone: string) {
  const emptyWallets = (): DriverWallets => ({
    YAPE: { holder: defaultHolder, phone: defaultPhone, qrImage: '' },
    PLIN: { holder: defaultHolder, phone: defaultPhone, qrImage: '' },
  });

  const readWallets = (): DriverWallets => {
    try {
      const records = JSON.parse(localStorage.getItem(DRIVER_WALLETS_KEY) ?? '{}') as Record<string, DriverWallets>;
      return records[driverKey] ?? emptyWallets();
    } catch {
      return emptyWallets();
    }
  };

  const [wallets, setWallets] = useState<DriverWallets>(readWallets);
  const [walletError, setWalletError] = useState('');

  useEffect(() => {
    const refresh = (event?: Event) => {
      const detail = (event as CustomEvent<{ driverKey?: string }> | undefined)?.detail;
      if (!detail?.driverKey || detail.driverKey === driverKey) setWallets(readWallets());
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('atipcar-wallets-updated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('atipcar-wallets-updated', refresh);
    };
  }, [driverKey, defaultHolder, defaultPhone]);

  const saveWallet = (type: WalletType, config: WalletConfig) => {
    const normalized: WalletConfig = {
      holder: config.holder.trim(),
      phone: config.phone.trim(),
      qrImage: config.qrImage,
    };
    if (!normalized.holder) {
      setWalletError('Ingresa el nombre del titular.');
      return false;
    }
    if (!/^\d{9}$/.test(normalized.phone)) {
      setWalletError('Ingresa un número de celular válido de 9 dígitos.');
      return false;
    }
    if (!normalized.qrImage) {
      setWalletError('Adjunta la imagen real del código QR.');
      return false;
    }

    try {
      const records = JSON.parse(localStorage.getItem(DRIVER_WALLETS_KEY) ?? '{}') as Record<string, DriverWallets>;
      const current = records[driverKey] ?? readWallets();
      const next = { ...current, [type]: normalized };
      records[driverKey] = next;
      localStorage.setItem(DRIVER_WALLETS_KEY, JSON.stringify(records));
      setWallets(next);
      setWalletError('');
      window.dispatchEvent(new CustomEvent('atipcar-wallets-updated', { detail: { driverKey } }));
      return true;
    } catch {
      setWalletError('No se pudo guardar la configuración en este dispositivo.');
      return false;
    }
  };

  const reportWalletError = (message: string) => setWalletError(message);

  return { wallets, walletError, saveWallet, reportWalletError };
}

function WalletLogo({ type, className = 'h-5 w-auto' }: { type: WalletType; className?: string }) {
  return <img src={type === 'YAPE' ? YAPE_LOGO_URL : PLIN_LOGO_URL} alt={type === 'YAPE' ? 'Yape' : 'Plin'} className={className + ' object-contain'} />;
}

function WalletQrContent({ type, wallet, compact = false }: { type: WalletType; wallet: WalletConfig; compact?: boolean }) {
  const configured = Boolean(wallet.qrImage && wallet.holder.trim() && wallet.phone.trim());
  if (!configured) {
    return (
      <div className="min-h-44 flex flex-col items-center justify-center text-center border border-dashed border-border bg-bg p-5">
        <WalletLogo type={type} className="h-6 w-auto opacity-70" />
        <p className="text-sm font-medium text-t1 mt-3">QR todavía no configurado</p>
        <p className="text-xs text-t2 mt-1">Adjunta el QR real en Mi perfil, sección Cobros.</p>
      </div>
    );
  }
  return (
    <div className="text-center">
      <WalletLogo type={type} className="h-7 w-auto mx-auto" />
      <img src={wallet.qrImage} alt={'Código QR de ' + type} className={(compact ? 'w-44 h-44' : 'w-64 h-64') + ' max-w-full mx-auto mt-4 object-contain bg-white border border-border p-2'} />
      <p className="text-sm font-semibold text-t1 mt-4 uppercase">{wallet.holder}</p>
      <p className="text-base font-mono font-semibold text-primary mt-1">{wallet.phone}</p>
      <p className="text-xs text-t2 mt-2">Confirma el nombre del titular antes de pagar.</p>
    </div>
  );
}

function WalletQrDialog({ wallets, initialType = 'YAPE', onClose }: { wallets: DriverWallets; initialType?: WalletType; onClose: () => void }) {
  const [activeWallet, setActiveWallet] = useState<WalletType>(initialType);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Mostrar QR de cobro">
      <div className="bg-surface w-full sm:max-w-md border border-border shadow-xl sm:rounded-lg max-h-[94vh] overflow-y-auto">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-10">
          <div>
            <h2 className="text-sm font-semibold text-t1">Mostrar QR de cobro</h2>
            <p className="text-xs text-t2 mt-0.5">El pasajero puede escanear desde esta pantalla.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 inline-flex items-center justify-center text-t2 hover:text-t1 hover:bg-hover rounded"><X size={17} /></button>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 border border-border mb-5">
            {(['YAPE', 'PLIN'] as WalletType[]).map(type => (
              <button key={type} onClick={() => setActiveWallet(type)} className={'h-11 flex items-center justify-center border-r last:border-r-0 border-border ' + (activeWallet === type ? 'bg-primary/5 ring-1 ring-inset ring-primary' : 'hover:bg-hover')}>
                <WalletLogo type={type} className="h-6 w-auto" />
              </button>
            ))}
          </div>
          <WalletQrContent type={activeWallet} wallet={wallets[activeWallet]} />
        </div>
      </div>
    </div>
  );
}

const NAV_ITEMS: NavItem[] = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'cola', label: 'Cola', icon: ListOrdered },
  { id: 'manifiesto', label: 'Manifiesto', icon: FileText },
  { id: 'viajes', label: 'Mis viajes', icon: Route },
  { id: 'avisos', label: 'Avisos', icon: Megaphone },
  { id: 'perfil', label: 'Mi perfil', icon: User },
];

function pdfSafeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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


const MANIFEST_RECORDS_KEY = 'atipcar-manifest-verification-v1';
const CHASKI_WORDMARK_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/v1788027352/chaski-AI-nombre_1_1.png';
const ATIPCAR_WORDMARK_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/v1788058385/ATIPCAR-LOGO-NOMBre.png';

type ManifestPdfData = {
  token: string;
  verificationUrl: string;
  number: string;
  issueDate: string;
  route: string;
  departure: string;
  arrival: string;
  downloadedAt: string;
  code: string;
  plate: string;
  model: string;
  capacity: number;
  association: string;
  company: string;
  driver: string;
  dni: string;
  license: string;
  passengers: Passenger[];
  total: number;
  cash: number;
  yape: number;
  plin: number;
};

type PdfJpeg = { binary: string; width: number; height: number };

function manifestVerificationToken(id: string, number: string, code: string) {
  return 'atp_' + btoa(id + '|' + number + '|' + code).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function formatManifestDateTime(date: Date) {
  return date.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function canvasJpeg(canvas: HTMLCanvasElement): PdfJpeg {
  const base64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
  return { binary: atob(base64), width: canvas.width, height: canvas.height };
}

async function loadPdfJpeg(url: string, width: number, height: number, fallbackText: string) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.crossOrigin = 'anonymous';
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = url;
    });
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  } catch {
    context.fillStyle = '#0f172a';
    context.font = 'bold 22px Arial';
    context.textAlign = 'center';
    context.fillText(fallbackText, width / 2, height / 2 + 7);
  }
  return canvasJpeg(canvas);
}

function pdfText(text: string) {
  return pdfSafeText(text);
}

async function createManifestPdfBlob(data: ManifestPdfData) {
  const qrImageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&format=png&data=' + encodeURIComponent(data.verificationUrl);
  const [chaskiLogo, atipcarLogo, verificationQr] = await Promise.all([
    loadPdfJpeg(CHASKI_WORDMARK_URL, 480, 90, 'CHASKI AI'),
    loadPdfJpeg(ATIPCAR_WORDMARK_URL, 560, 150, 'ATIPCAR'),
    loadPdfJpeg(qrImageUrl, 300, 300, 'QR'),
  ]);

  const commands: string[] = [];
  const pageHeight = 842;
  const blue = '0.10 0.34 0.92';
  const dark = '0.06 0.09 0.16';
  const muted = '0.38 0.43 0.52';

  const textLine = (text: string, x: number, top: number, size = 9, bold = false, color = dark) => {
    commands.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + color + ' rg ' + x + ' ' + (pageHeight - top) + ' Td (' + pdfText(text) + ') Tj ET');
  };
  const centered = (text: string, top: number, size = 10, bold = false, color = dark) => {
    const width = pdfText(text).length * size * 0.52;
    textLine(text, Math.max(38, (595 - width) / 2), top, size, bold, color);
  };
  const line = (x1: number, top1: number, x2: number, top2: number, color = '0.82 0.85 0.90', width = 0.7) => {
    commands.push(color + ' RG ' + width + ' w ' + x1 + ' ' + (pageHeight - top1) + ' m ' + x2 + ' ' + (pageHeight - top2) + ' l S');
  };
  const fillRect = (x: number, top: number, width: number, height: number, color: string) => {
    commands.push(color + ' rg ' + x + ' ' + (pageHeight - top - height) + ' ' + width + ' ' + height + ' re f');
  };
  const image = (name: string, x: number, top: number, width: number, height: number) => {
    commands.push('q ' + width + ' 0 0 ' + height + ' ' + x + ' ' + (pageHeight - top - height) + ' cm /' + name + ' Do Q');
  };

  image('Im1', 237, 22, 121, 23);
  image('Im2', 205, 51, 185, 49);
  centered('MANIFIESTO DE PASAJEROS', 118, 15, true);
  centered('N° ' + data.number + '  ·  Emisión: ' + data.issueDate, 136, 8, false, muted);
  line(38, 150, 557, 150, blue, 1.3);

  textLine('INFORMACIÓN DEL VIAJE', 38, 171, 10, true, blue);
  textLine('Ruta:', 38, 193, 9, true); textLine(data.route, 91, 193, 9);
  textLine('Salida:', 38, 210, 9, true); textLine(data.departure, 91, 210, 9);
  textLine('Llegada / cierre:', 38, 227, 9, true); textLine(data.arrival, 125, 227, 9);
  textLine('Descargado:', 38, 244, 9, true); textLine(data.downloadedAt, 103, 244, 9);
  textLine('Conductor:', 38, 268, 9, true); textLine(data.driver, 102, 268, 9);
  textLine('DNI:', 38, 285, 9, true); textLine(data.dni, 102, 285, 9);
  textLine('Licencia:', 38, 302, 9, true); textLine(data.license, 102, 302, 9);

  textLine('Unidad:', 330, 193, 9, true); textLine(data.code, 392, 193, 9);
  textLine('Placa:', 330, 210, 9, true); textLine(data.plate, 392, 210, 9);
  textLine('Modelo:', 330, 227, 9, true); textLine(data.model, 392, 227, 9);
  textLine('Capacidad:', 330, 244, 9, true); textLine(data.capacity + ' asientos', 398, 244, 9);
  textLine('Asociación:', 330, 268, 9, true); textLine(data.association, 402, 268, 9);
  textLine('Empresa:', 330, 285, 9, true); textLine(data.company, 392, 285, 9);
  line(38, 320, 557, 320);

  textLine('LISTA DE PASAJEROS', 38, 343, 10, true, blue);
  fillRect(38, 354, 519, 22, blue);
  const headers: [string, number][] = [
    ['N°', 45], ['Asiento', 73], ['Nombre completo', 119], ['DNI', 300],
    ['Origen', 365], ['Destino', 420], ['S/', 520],
  ];
  headers.forEach(item => textLine(item[0], item[1], 369, 8, true, '1 1 1'));

  let rowTop = 392;
  const visiblePassengers = data.passengers.slice(0, 18);
  if (visiblePassengers.length === 0) {
    centered('Sin pasajeros registrados', rowTop, 9, false, muted);
    rowTop += 18;
  } else {
    visiblePassengers.forEach((passenger, index) => {
      if (index % 2 === 1) fillRect(38, rowTop - 13, 519, 18, '0.96 0.97 0.99');
      textLine(String(index + 1), 47, rowTop, 8);
      textLine(String(passenger.seat).padStart(2, '0'), 81, rowTop, 8);
      textLine(passenger.name.slice(0, 29), 119, rowTop, 8);
      textLine(passenger.dni, 300, rowTop, 8);
      textLine(passenger.origin, 365, rowTop, 8);
      textLine(passenger.destination, 420, rowTop, 8);
      textLine(passenger.fare.toFixed(2), 518, rowTop, 8);
      line(38, rowTop + 6, 557, rowTop + 6, '0.88 0.90 0.94', 0.4);
      rowTop += 18;
    });
  }

  const totalsTop = Math.min(720, rowTop + 17);
  line(38, totalsTop - 15, 557, totalsTop - 15);
  textLine('Total pasajeros: ' + data.passengers.length + ' de ' + data.capacity + ' asientos', 38, totalsTop + 4, 10, true);
  textLine('Total recaudado: S/ ' + data.total.toFixed(2), 343, totalsTop + 4, 10, true);
  textLine('Efectivo: S/ ' + data.cash.toFixed(2) + '   |   Yape: S/ ' + data.yape.toFixed(2) + '   |   Plin: S/ ' + data.plin.toFixed(2), 38, totalsTop + 23, 8, false, muted);
  textLine('Firma del conductor: ________________________________', 38, totalsTop + 51, 9);

  const qrTop = Math.min(716, totalsTop + 34);
  image('Im3', 472, qrTop, 72, 72);
  textLine('Escanee para verificar', 461, qrTop + 84, 7, false, muted);
  textLine('Código: ' + data.token.slice(0, 28), 38, qrTop + 77, 7, false, muted);
  line(38, 810, 557, 810);
  centered('Generado por CHASKI AI · Documento verificable para autoridades', 825, 7, false, muted);

  const content = commands.join('\n');
  const imageObject = (jpeg: PdfJpeg) =>
    '<< /Type /XObject /Subtype /Image /Width ' + jpeg.width + ' /Height ' + jpeg.height +
    ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.binary.length +
    ' >> stream\n' + jpeg.binary + '\nendstream';

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 6 0 R /Im2 7 0 R /Im3 8 0 R >> >> /Contents 9 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    imageObject(chaskiLogo),
    imageObject(atipcarLogo),
    imageObject(verificationQr),
    '<< /Length ' + content.length + ' >> stream\n' + content + '\nendstream',
  ];

  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
  });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  offsets.slice(1).forEach(offset => {
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += 'trailer << /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';

  const bytes = new Uint8Array(pdf.length);
  for (let index = 0; index < pdf.length; index += 1) bytes[index] = pdf.charCodeAt(index) & 255;
  return new Blob([bytes], { type: 'application/pdf' });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Inicio ───────────────────────────────────────────────────────────────────
function DriverHome({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const { user } = useAuth();
  const { profile, company, org, hasVehicleGPS } = useDriverContext();
  const { wallets } = useDriverWallets(user?.email ?? user?.code ?? '', profile?.name ?? user?.name ?? '', profile?.phone ?? '');
  const [showWalletQr, setShowWalletQr] = useState(false);

  const [loading, setLoading] = useState(true);
  const [queueJP, setQueueJP] = useState<QueueEntry[]>([]);
  const [queuePJ, setQueuePJ] = useState<QueueEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [myVehicle, setMyVehicle] = useState<{ plate: string; company: string; vehicleType: VehicleType } | null>(null);
  const [myVehicleId, setMyVehicleId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState('');
  // Acciones de la cola de regreso, disparadas desde Inicio (§2 pasos 7-10):
  // "Inscribirme" contextual, "No saldré ahora" e "Inscripción retrasada".
  const [returnActionBusy, setReturnActionBusy] = useState<'join' | 'later' | 'delayed' | null>(null);
  const [returnActionError, setReturnActionError] = useState('');
  const [returnActionNotice, setReturnActionNotice] = useState('');

  const myCode = user?.code ?? '';

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [jp, pj, tripList, vehicles] = await Promise.all([
        fetchQueue('JULI_PUNO'), fetchQueue('PUNO_JULI'), fetchTrips(), fetchVehicles(),
      ]);
      setQueueJP(jp);
      setQueuePJ(pj);
      setTrips(tripList);
      const mine = vehicles.find(v => v.code === myCode);
      setMyVehicle(mine ? { plate: mine.plate, company: mine.company, vehicleType: mine.vehicleType } : null);
      setMyVehicleId(mine?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, [myCode]);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 15000);
    return () => clearInterval(id);
  }, [reload]);

  const myEntryJP = queueJP.find(e => e.code === myCode) ?? null;
  const myEntryPJ = queuePJ.find(e => e.code === myCode) ?? null;
  // Incluye 'PROGRAMADO': el viaje ya existe (preparado con "Preparar
  // manifiesto") pero todavia no se marco salida -- el conductor debe poder
  // ir a su manifiesto durante toda esa ventana, no solo cuando ya esta ACTIVO.
  const myTrip = trips.find(t => t.code === myCode && (t.status === 'ACTIVO' || t.status === 'PROGRAMADO')) ?? null;
  // El backend guarda en scheduledArrival la hora de salida + el tiempo
  // minimo de viaje (queues.service.ts#depart) -- es el mismo dato que usa
  // para el candado de re-inscripcion en la cola contraria, NO una hora de
  // llegada real (FLUJO_NEGOCIO_ACTUAL.md #6: "no debe mostrarse como
  // llegada estimada"). Por eso el minutero se calcula aqui, no se etiqueta
  // como ETA, y solo se muestra mientras siga en cuenta (> 0).
  const returnEligibleAt = myTrip?.status === 'ACTIVO' && myTrip.scheduledArrivalISO
    ? new Date(myTrip.scheduledArrivalISO).getTime()
    : null;
  const minutesUntilReturnEligible = returnEligibleAt
    ? Math.max(0, Math.ceil((returnEligibleAt - Date.now()) / 60000))
    : null;
  // Direccion contraria al viaje activo -- la cola en la que el conductor
  // podria querer inscribirse desde Inicio (§2 pasos 7-10), sin tener que
  // ir a Cola y elegir el sentido a mano.
  const returnRoute: RouteDir | null = myTrip?.status === 'ACTIVO'
    ? (myTrip.route === 'JULI_PUNO' ? 'PUNO_JULI' : 'JULI_PUNO')
    : null;
  const returnRouteLabel = returnRoute === 'JULI_PUNO' ? 'Juli → Puno' : returnRoute === 'PUNO_JULI' ? 'Puno → Juli' : '';
  const myEntryOpposite = returnRoute === 'JULI_PUNO' ? myEntryJP : returnRoute === 'PUNO_JULI' ? myEntryPJ : null;
  const myTrips = trips.filter(t => t.code === myCode);
  const lastCompletedTrip = myTrips.find(t => t.status === 'COMPLETADO') ?? null; // ya viene ordenado desc
  // Vueltas de HOY (corregido 12 sept 2026 -- antes esto ni filtraba por
  // fecha ni pareaba ida+vuelta, contaba cada tramo suelto como "vuelta").
  // Misma definicion que ProductionReportView.tsx: 2 tramos completados =
  // 1 vuelta, un tramo suelto = "y media".
  const todayStr = localDateStr();
  const tramosHoy = myTrips.filter(t => {
    if (t.status !== 'COMPLETADO') return false;
    const dateISO = t.actualDepartureISO ?? t.scheduledDepartureISO;
    return dateISO ? localDateStr(new Date(dateISO)) === todayStr : false;
  }).length;
  const vueltasHoyLabel = `${Math.floor(tramosHoy / 2)}${tramosHoy % 2 === 1 ? ' y media' : ''}`;

  const activeEntry = myEntryJP ?? myEntryPJ;
  const activeEntryRoute: RouteDir | null = myEntryJP ? 'JULI_PUNO' : myEntryPJ ? 'PUNO_JULI' : null;

  // §3.11: en que terminal esta parado el conductor — inferido con la misma logica
  // que ya usa Plan Operacion (cola activa, o direccion del ultimo viaje completado),
  // nunca GPS fisico ni algo que el conductor tenga que elegir a mano.
  const inferredTerminal: 'Juli' | 'Puno' = myTrip
    ? (myTrip.route === 'JULI_PUNO' ? 'Puno' : 'Juli')
    : activeEntryRoute
      ? (activeEntryRoute === 'JULI_PUNO' ? 'Juli' : 'Puno')
      : lastCompletedTrip
        ? (lastCompletedTrip.route === 'JULI_PUNO' ? 'Puno' : 'Juli')
        : 'Juli';
  const nextRoute: RouteDir = inferredTerminal === 'Juli' ? 'JULI_PUNO' : 'PUNO_JULI';
  const nextRouteLabel = nextRoute === 'JULI_PUNO' ? 'Juli → Puno' : 'Puno → Juli';
  const destinationFor = nextRoute === 'JULI_PUNO' ? 'Puno' : 'Juli';

  // Datos derivados de la cola activa del conductor — se calculan una sola vez
  // aqui para no repetir la busqueda en cada rama del render de abajo.
  const activeRouteEntries = activeEntryRoute === 'JULI_PUNO' ? queueJP : queuePJ;
  const { calling: callingEntry } = getOperationalState(activeRouteEntries);
  const vehiclesAhead = activeEntry ? getVehiclesAhead(activeEntry, activeRouteEntries) : 0;
  const activeDisplayPos = activeEntry
    ? getQueueDisplayOrder(activeRouteEntries).find(row => row.entry.id === activeEntry.id)?.displayPos ?? activeEntry.position
    : null;

  // "Inscribirme" contextual desde Inicio (§2 paso 7): mismo endpoint que usa
  // Cola, pero ya sabe la direccion -- no hace falta ir a elegir el sentido.
  // El GPS se pide aqui mismo porque el backend lo exige en el mismo paso
  // (join() completa la llegada -- §2 paso 8, no hay "Marcar llegada" aparte).
  const handleJoinReturn = () => {
    if (!myVehicleId || !returnRoute) return;
    setReturnActionError('');
    setReturnActionNotice('');
    setReturnActionBusy('join');
    if (!navigator.geolocation) {
      setReturnActionError('No se pudo obtener tu ubicación — revisa los permisos del navegador');
      setReturnActionBusy(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          await joinQueue(returnRoute, myVehicleId, getOrCreateDeviceId(), false, pos.coords.latitude, pos.coords.longitude);
          await reload();
        } catch (err) {
          setReturnActionError(err instanceof Error ? err.message : 'No se pudo inscribir la unidad');
        } finally {
          setReturnActionBusy(null);
        }
      },
      () => {
        setReturnActionError('No se pudo obtener tu ubicación — revisa los permisos del navegador');
        setReturnActionBusy(null);
      },
    );
  };

  // "Inscribirme" desde Inicio cuando NO hay viaje activo ni cola (QA 20 sept
  // 2026): antes este boton solo llevaba a la pantalla Cola, donde habia que
  // apretar OTRO "Inscribirme" -- dos clics para una sola accion. Ahora
  // inscribe directo en la direccion sugerida (nextRoute), con el mismo GPS
  // que pide la pantalla Cola.
  const handleJoinNext = () => {
    if (!myVehicleId) return;
    setReturnActionError('');
    setReturnActionNotice('');
    setReturnActionBusy('join');
    if (!navigator.geolocation) {
      setReturnActionError('No se pudo obtener tu ubicación — revisa los permisos del navegador');
      setReturnActionBusy(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          await joinQueue(nextRoute, myVehicleId, getOrCreateDeviceId(), false, pos.coords.latitude, pos.coords.longitude);
          await reload();
        } catch (err) {
          setReturnActionError(err instanceof Error ? err.message : 'No se pudo inscribir la unidad');
        } finally {
          setReturnActionBusy(null);
        }
      },
      () => {
        setReturnActionError('No se pudo obtener tu ubicación — revisa los permisos del navegador');
        setReturnActionBusy(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  // "No saldré ahora" (§2 paso 9): no existe un estado "pendiente de decidir"
  // aparte -- se inscribe (confirmando la misma evidencia GPS que pediria
  // "Inscribirme") y de inmediato se retira con declareLater(), dejando el
  // registro de que esta unidad SI se resolvio para el candado de la
  // siguiente unidad de la cadena (backend/queues.service.ts#declareLater).
  const handleDeclareLaterFromHome = () => {
    if (!myVehicleId || !returnRoute) return;
    setReturnActionError('');
    setReturnActionNotice('');
    setReturnActionBusy('later');
    if (!navigator.geolocation) {
      setReturnActionError('No se pudo obtener tu ubicación — revisa los permisos del navegador');
      setReturnActionBusy(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          await joinQueue(returnRoute, myVehicleId, getOrCreateDeviceId(), false, pos.coords.latitude, pos.coords.longitude);
          const freshQueue = await fetchQueue(returnRoute);
          const created = freshQueue.find(e => e.code === myCode);
          if (created) await declareLater(created.id);
          setReturnActionNotice('Quedó registrado que no saldrás todavía — el siguiente vehículo de la cadena ya puede inscribirse.');
          await reload();
        } catch (err) {
          setReturnActionError(err instanceof Error ? err.message : 'No se pudo registrar "No saldré ahora"');
        } finally {
          setReturnActionBusy(null);
        }
      },
      () => {
        setReturnActionError('No se pudo obtener tu ubicación — revisa los permisos del navegador');
        setReturnActionBusy(null);
      },
    );
  };

  // "Inscripción retrasada" (§2 paso 10): para cuando la unidad que salio
  // antes en la ida todavia no resolvio su situacion y bloquea a esta -- solo
  // avisa al administrador, nunca se resuelve sola (ver DelayedRegistrationsPage.tsx).
  const handleDelayedRegistrationFromHome = async () => {
    if (!returnRoute) return;
    setReturnActionError('');
    setReturnActionNotice('');
    setReturnActionBusy('delayed');
    try {
      await createDelayedRegistrationRequest(returnRoute);
      setReturnActionNotice('Se avisó al administrador de tu asociación — te desbloqueará o autorizará la inscripción.');
    } catch (err) {
      setReturnActionError(err instanceof Error ? err.message : 'No se pudo avisar al administrador');
    } finally {
      setReturnActionBusy(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-t1">Hola, {(profile?.name || user?.name || 'Conductor').split(' ')[0]}</h1>
          <p className="text-sm font-medium text-t1 mt-1">{myVehicle?.company || company}</p>
          <p className="text-xs text-t2 mt-0.5">Empresa integrante de {org?.name ?? 'tu asociación'} · {new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
        </div>
        <button onClick={() => setShowWalletQr(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-t1 rounded text-xs font-medium hover:bg-hover h-fit">
          <QrCode size={13} /> <span className="hidden sm:inline">Mostrar QR</span><span className="sm:hidden">QR</span>
        </button>
      </div>

      <GpsAlertBanner enabled={hasVehicleGPS} />

      {/* Unit */}
      <div className="bg-surface border border-border rounded-lg p-4 flex flex-wrap gap-4 items-center">
        <Car size={18} className="text-t2 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-t1">{myVehicle?.vehicleType || 'Vehículo asignado'} · <span className="font-mono">{myVehicle?.plate || 'Sin placa'}</span></p>
          <p className="text-xs text-t2">Código {myCode || '—'} · Empresa: {myVehicle?.company || company}</p>
        </div>
        {loading && <RefreshCw size={14} className="animate-spin text-muted flex-shrink-0" />}
      </div>

      {/* Main action card */}
      <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin size={15} className="text-t2" />
          <span className="text-xs text-t2">{myTrip ? 'En ruta' : `Estás en ${inferredTerminal}`}</span>
          {!myTrip && (
            <>
              <ArrowRight size={13} className="text-muted" />
              <span className="text-xs text-t2">Destino: {destinationFor}</span>
            </>
          )}
        </div>

        {myTrip ? (
          <div className="space-y-3">
            <div className="bg-ok/5 border border-ok/20 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle size={15} className="text-ok mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-ok">
                  {myTrip.status === 'ACTIVO' ? 'Viaje en curso' : 'Manifiesto preparado'} — código {myTrip.code}
                </p>
                <p className="text-xs text-t2 mt-1">
                  {myTrip.route === 'JULI_PUNO' ? 'Juli → Puno' : 'Puno → Juli'}
                  {myTrip.manifestId ? ' · manifiesto abierto' : ' · sin manifiesto abierto todavía'}
                </p>
                {minutesUntilReturnEligible !== null && minutesUntilReturnEligible > 0 && (
                  <p className="text-xs text-t2 mt-1">
                    Faltan {minutesUntilReturnEligible} min para poder inscribirte en la cola de regreso
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => onNavigate('manifiesto')}
              className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors flex items-center gap-2"
            >
              <FileText size={14} /> {myTrip.manifestId ? 'Ir al manifiesto' : 'Abrir manifiesto'}
            </button>

            {/* Cola de regreso (§2 pasos 7-10): aparece sola en cuanto se cumple
                el tiempo minimo -- el conductor no tiene que ir a Cola a elegir
                el sentido, el sistema ya sabe que le toca {returnRouteLabel}. */}
            {returnRoute && minutesUntilReturnEligible === 0 && (
              myEntryOpposite ? (
                <p className="text-xs text-t2">
                  Ya estás inscrito en la cola de regreso ({returnRouteLabel}) — posición {myEntryOpposite.position}.{' '}
                  <button onClick={() => onNavigate('cola')} className="underline text-primary">Ver en Cola</button>
                </p>
              ) : (
                <div className="border-t border-border pt-3 space-y-2">
                  <p className="text-xs font-semibold text-t2 uppercase tracking-wide">Cola de regreso — {returnRouteLabel}</p>
                  <button
                    onClick={handleJoinReturn}
                    disabled={returnActionBusy !== null}
                    className="w-full px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Plus size={14} /> {returnActionBusy === 'join' ? 'Inscribiendo…' : `Inscribirme en ${returnRouteLabel}`}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeclareLaterFromHome}
                      disabled={returnActionBusy !== null}
                      className="flex-1 px-3 py-2 border border-border rounded-lg text-xs font-medium text-t1 hover:bg-hover disabled:opacity-50"
                    >
                      {returnActionBusy === 'later' ? 'Guardando…' : 'No saldré ahora'}
                    </button>
                    <button
                      onClick={handleDelayedRegistrationFromHome}
                      disabled={returnActionBusy !== null}
                      className="flex-1 px-3 py-2 border border-border rounded-lg text-xs font-medium text-t2 hover:bg-hover disabled:opacity-50"
                    >
                      {returnActionBusy === 'delayed' ? 'Avisando…' : 'Inscripción retrasada'}
                    </button>
                  </div>
                  {returnActionError && (
                    <div className="bg-danger/10 text-danger text-xs px-3 py-2 rounded-lg flex items-center gap-2">
                      <AlertCircle size={13} /> {returnActionError}
                    </div>
                  )}
                  {returnActionNotice && (
                    <div className="bg-ok/10 text-ok text-xs px-3 py-2 rounded-lg flex items-center gap-2">
                      <CheckCircle size={13} /> {returnActionNotice}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        ) : activeEntry ? (
          <div className="space-y-3">
            <div>
              <p className={'text-3xl font-bold ' + (activeEntry.status === 'LLAMADO' ? 'text-cyan-600' : 'text-primary')}>
                {activeEntry.status === 'LLAMADO'
                  ? '¡Te están llamando!'
                  : vehiclesAhead > 0
                    ? `Te ${vehiclesAhead === 1 ? 'falta 1 vehículo' : `faltan ${vehiclesAhead} vehículos`}`
                    : 'Eres el siguiente'}
              </p>
              <p className="text-xs text-t2 mt-1">
                {activeEntry.status === 'LLAMADO'
                  ? 'Es tu turno — dirígete a registrar pasajeros'
                  : vehiclesAhead > 0 ? 'para salir' : 'en salir — prepárate'}
              </p>
            </div>

            {callingEntry && callingEntry.id !== activeEntry.id && (
              <div className="flex items-center gap-2 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-2">
                <span className="text-[10px] font-semibold uppercase text-cyan-700 flex-shrink-0">Llamando ahora</span>
                <span className="text-sm font-mono text-t1">{callingEntry.code}</span>
                <span className="text-sm text-t2 truncate">{callingEntry.driverName}</span>
              </div>
            )}

            {activeEntry.status === 'PREINSCRITO' ? (
              <>
                <p className="text-sm text-t2">Tu posición en la lista es el {activeDisplayPos}. Confirma tu llegada al terminal desde Cola para activar tu turno.</p>
                <button onClick={() => onNavigate('cola')} className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors flex items-center gap-2">
                  <MapPin size={14} /> Ir a Cola para confirmar llegada
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-t2">
                  Tu posición en la lista es el {activeDisplayPos}.
                  {activeEntry.status === 'LLAMADO' && ' Dirígete a registrar pasajeros y abre tu manifiesto ahora.'}
                  {(activeEntry.status === 'LISTO' || activeEntry.status === 'EMBARCANDO') && ' Te toca salir pronto — prepara tu manifiesto.'}
                </p>
                <button
                  onClick={async () => {
                    setPreparing(true);
                    setPrepareError('');
                    try {
                      // Crea (o reutiliza) el Trip en PROGRAMADO antes de
                      // entrar a la pantalla de Manifiesto -- si no se hace
                      // esto primero, el manifiesto llega sin viaje al que
                      // asociarse (ver backend/queues.service.ts#prepareTrip).
                      await prepareTripForEntry(activeEntry.id);
                      await reload();
                      onNavigate('manifiesto');
                    } catch (err) {
                      setPrepareError(err instanceof Error ? err.message : 'No se pudo preparar el manifiesto');
                    } finally {
                      setPreparing(false);
                    }
                  }}
                  disabled={preparing}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <FileText size={14} /> {preparing ? 'Preparando…' : 'Preparar manifiesto'}
                </button>
                {prepareError && (
                  <div className="bg-danger/10 text-danger text-xs px-3 py-2 rounded-lg flex items-center gap-2">
                    <AlertCircle size={13} /> {prepareError}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-t2">No estás inscrito en ninguna cola. Puedes anotarte para el siguiente turno.</p>
            <button
              onClick={handleJoinNext}
              disabled={returnActionBusy !== null}
              className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Plus size={14} /> {returnActionBusy === 'join' ? 'Inscribiendo…' : `Inscribirme en ${nextRouteLabel}`}
            </button>
            {returnActionError && (
              <div className="bg-danger/10 text-danger text-xs px-3 py-2 rounded-lg flex items-center gap-2">
                <AlertCircle size={13} /> {returnActionError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Today summary */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h2 className="text-xs font-semibold text-t2 uppercase tracking-wide mb-3">Resumen de hoy</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-t1">{vueltasHoyLabel}</p>
            <p className="text-xs text-t2">Vueltas completadas hoy</p>
          </div>
          <div>
            <p className="text-lg font-bold text-t2">—</p>
            <p className="text-xs text-t2">Pasajeros</p>
          </div>
          <div>
            <p className="text-lg font-bold text-t2">—</p>
            <p className="text-xs text-t2">Recaudación bruta</p>
          </div>
        </div>
        <p className="text-[11px] text-muted mt-2">Solo ves el detalle de tus manifiestos abiertos o pendientes de completar — no tu historial ya cerrado, por diseño.</p>
      </div>
      {showWalletQr && <WalletQrDialog wallets={wallets} onClose={() => setShowWalletQr(false)} />}
    </div>
  );
}

// ─── Cola ─────────────────────────────────────────────────────────────────────
function DriverQueue() {
  const { user } = useAuth();
  const code = user?.code ?? '';
  const [errorMsg, setErrorMsg] = useState('');
  const [queueJP, setQueueJP] = useState<QueueEntry[]>([]);
  const [queuePJ, setQueuePJ] = useState<QueueEntry[]>([]);
  const [myVehicleId, setMyVehicleId] = useState<string | null>(null);
  const [myVehicle, setMyVehicle] = useState<{ plate: string; company: string; vehicleType: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [joiningRoute, setJoiningRoute] = useState<'JULI_PUNO' | 'PUNO_JULI' | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [jp, pj, vehicles] = await Promise.all([
        fetchQueue('JULI_PUNO'), fetchQueue('PUNO_JULI'), fetchVehicles(),
      ]);
      setQueueJP(jp);
      setQueuePJ(pj);
      const mine = vehicles.find(v => v.code === code);
      setMyVehicleId(mine?.id ?? null);
      setMyVehicle(mine ? { plate: mine.plate, company: mine.company, vehicleType: mine.vehicleType } : null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo cargar la cola');
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 15000);
    return () => clearInterval(id);
  }, [reload]);

  const myEntryJP = queueJP.find(entry => entry.code === code) ?? null;
  const myEntryPJ = queuePJ.find(entry => entry.code === code) ?? null;
  const isActiveEntry = (entry: QueueEntry | null) => Boolean(entry && entry.status !== 'AUSENTE' && entry.status !== 'RETIRADO');

  // El servidor exige la ubicacion del celular en el mismo paso de "Inscribirme" (confirma que la
  // unidad esta en el terminal). Antes este boton no la enviaba y siempre respondia 400: la primera
  // inscripcion de la jornada, que solo puede hacerse desde aqui, no funcionaba.
  const handleJoin = (route: 'JULI_PUNO' | 'PUNO_JULI') => {
    if (!myVehicleId) return;
    setErrorMsg('');
    setJoiningRoute(route);
    if (!navigator.geolocation) {
      setErrorMsg('Este navegador no puede obtener tu ubicación');
      setJoiningRoute(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          await joinQueue(route, myVehicleId, getOrCreateDeviceId(), false, pos.coords.latitude, pos.coords.longitude);
          await reload();
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'No se pudo inscribir la unidad');
        } finally {
          setJoiningRoute(null);
        }
      },
      () => {
        setErrorMsg('No se pudo obtener tu ubicación — revisa los permisos del navegador');
        setJoiningRoute(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  const handleConfirmArrival = (entry: QueueEntry) => {
    setErrorMsg('');
    setBusyEntryId(entry.id);
    if (!navigator.geolocation) {
      setErrorMsg('Este navegador no puede obtener tu ubicación');
      setBusyEntryId(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          await confirmArrival(entry.id, pos.coords.latitude, pos.coords.longitude);
          await reload();
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'No se pudo confirmar la llegada');
        } finally {
          setBusyEntryId(null);
        }
      },
      () => {
        setErrorMsg('No se pudo obtener tu ubicación — revisa los permisos del navegador');
        setBusyEntryId(null);
      },
    );
  };

  const handleDeclareLater = async (entry: QueueEntry) => {
    setErrorMsg('');
    setBusyEntryId(entry.id);
    try {
      await declareLater(entry.id);
      await reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo registrar "me inscribo más tarde"');
    } finally {
      setBusyEntryId(null);
    }
  };

  const queueCards: Array<{ key: 'JULI_PUNO' | 'PUNO_JULI'; label: string; entries: QueueEntry[]; myEntry: QueueEntry | null; blockedByOther: boolean }> = [
    { key: 'JULI_PUNO', label: 'Juli → Puno', entries: queueJP, myEntry: myEntryJP, blockedByOther: isActiveEntry(myEntryPJ) },
    { key: 'PUNO_JULI', label: 'Puno → Juli', entries: queuePJ, myEntry: myEntryPJ, blockedByOther: isActiveEntry(myEntryJP) },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-t1">Cola de turnos</h1>
          <p className="text-xs text-t2 mt-0.5">
            Unidad {code || '—'}{myVehicle ? ` · ${myVehicle.plate} · ${myVehicle.company}` : ''}
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-2 bg-danger/5 border border-danger/20 rounded-lg text-xs text-danger">{errorMsg}</div>
      )}

      {!myVehicleId && !loading && (
        <div className="px-4 py-3 bg-warn/5 border border-warn/30 rounded-lg text-xs text-warn">
          No encontramos una unidad vinculada a tu cuenta ({code || 'sin código'}). Contacta a tu administrador.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 text-t2 text-sm py-8 justify-center">
          <RefreshCw size={16} className="animate-spin" />Cargando cola…
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {queueCards.map(card => (
            <div key={card.key} className="bg-surface border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-medium text-t1">{card.label}</h3>
                <span className="text-xs text-t2">{card.entries.length} vehículos</span>
              </div>

              <div className="px-4 py-3 border-b border-border bg-bg/50">
                {!card.myEntry ? (
                  <div className="space-y-1.5">
                    <button
                      onClick={() => handleJoin(card.key)}
                      disabled={!myVehicleId || joiningRoute === card.key || card.blockedByOther}
                      className="w-full flex items-center justify-center gap-2 h-9 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-h transition-colors disabled:opacity-50"
                    >
                      {joiningRoute === card.key ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                      Inscribirme en {card.label}
                    </button>
                    {card.blockedByOther && (
                      <p className="text-[11px] text-t2">Ya estás activo en la cola contraria — no puedes inscribirte en las dos a la vez.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-t2 flex items-center gap-1.5 flex-wrap">
                      Tu unidad — posición en la lista <strong className="text-t1">#{(() => {
                        const myRow = getQueueDisplayOrder(card.entries).find(row => row.entry.id === card.myEntry!.id);
                        return myRow?.displayPos ?? '—';
                      })()}</strong> ·
                      {(() => {
                        const opPos = getOperationalPosition(card.myEntry!, card.entries);
                        return <span className={'text-[11px] px-2 py-0.5 rounded font-semibold ' + opPos.className}>{opPos.label}</span>;
                      })()}
                    </p>
                    {card.myEntry.status === 'PREINSCRITO' && (
                      <button
                        onClick={() => handleConfirmArrival(card.myEntry!)}
                        disabled={busyEntryId === card.myEntry.id}
                        className="w-full flex items-center justify-center gap-2 h-9 border border-primary text-primary rounded-lg text-xs font-medium hover:bg-primary/5 transition-colors disabled:opacity-50"
                      >
                        <MapPin size={13} />
                        Confirmar llegada (GPS)
                      </button>
                    )}
                    {(card.myEntry.status === 'INSCRITO' || card.myEntry.status === 'LLAMADO') && (
                      <button
                        onClick={() => handleDeclareLater(card.myEntry!)}
                        disabled={busyEntryId === card.myEntry.id}
                        className="w-full flex items-center justify-center gap-2 h-9 border border-border text-t2 rounded-lg text-xs font-medium hover:bg-hover transition-colors disabled:opacity-50"
                      >
                        <Clock size={13} />
                        Me inscribo más tarde
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs" aria-label={'Cola ' + card.label}>
                  <thead>
                    <tr className="border-b border-border bg-bg">
                      <th className="text-left px-3 py-2.5 text-t2 font-medium">Pos.</th>
                      <th className="text-left px-3 py-2.5 text-t2 font-medium">Código</th>
                      <th className="text-left px-3 py-2.5 text-t2 font-medium">Posición operativa</th>
                      <th className="text-left px-3 py-2.5 text-t2 font-medium">Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getQueueDisplayOrder(card.entries).map(({ entry, displayPos }) => {
                      const isMe = entry.code === code;
                      const opPos = getOperationalPosition(entry, card.entries);
                      return (
                        <tr key={entry.id} className={isMe ? 'border-b border-border bg-primary/5' : 'border-b border-border'}>
                          <td className="px-3 py-2 font-mono text-t2">{displayPos ?? '—'}</td>
                          <td className="px-3 py-2 font-semibold text-t1">
                            {entry.code}
                            {isMe && <span className="ml-1.5 text-[10px] bg-primary/10 text-primary px-1 py-0.5 rounded">Tu unidad</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={'text-[11px] px-2 py-0.5 rounded font-medium whitespace-nowrap ' + opPos.className}>{opPos.label}</span>
                          </td>
                          <td className="px-3 py-2 text-t2 font-mono">{entry.registeredAt || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// ─── Manifiesto (unchanged logic, preserved as-is) ────────────────────────────
function seatMapCapacity(vehicleType: VehicleType) {
  return vehicleType === 'SPRINTER' ? 20 : 15;
}

function PassengerSeatForm({
  vehicleType, occupiedSeats, defaultOrigin, defaultDestination, onSubmit, submitting, submitLabel,
}: {
  vehicleType: VehicleType;
  occupiedSeats: number[];
  defaultOrigin: string;
  defaultDestination: string;
  onSubmit: (p: { name: string; dni: string; documentType?: DocumentType; seat: number; fare: number; paymentMethod: PaymentMethod; origin: string; destination: string; email?: string }) => Promise<void> | void;
  submitting: boolean;
  submitLabel: string;
}) {
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [dni, setDni] = useState('');
  const [docType, setDocType] = useState<DocumentType>('DNI');
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [fare, setFare] = useState('10');
  const [method, setMethod] = useState<PaymentMethod>('EFECTIVO');
  const [email, setEmail] = useState('');
  const dniValid = isValidDocument(docType, dni);
  const emailValid = email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async () => {
    const fareNum = Number(fare);
    if (!nombres || !apellidos || !dniValid || selectedSeat === null || !Number.isFinite(fareNum) || fareNum < 0 || !emailValid) return;
    await onSubmit({
      name: `${nombres.trim()} ${apellidos.trim()}`,
      dni,
      documentType: docType,
      seat: selectedSeat,
      fare: fareNum,
      paymentMethod: method,
      origin: defaultOrigin,
      destination: defaultDestination,
      email: email.trim() || undefined,
    });
    setNombres(''); setApellidos(''); setDni(''); setDocType('DNI'); setSelectedSeat(null); setFare('10'); setMethod('EFECTIVO'); setEmail('');
  };

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-t1 mb-3">Mapa de asientos</h3>
      <SeatMap
        vehicleType={vehicleType}
        occupiedSeats={occupiedSeats}
        selectedSeats={selectedSeat !== null ? [selectedSeat] : []}
        onSeatClick={seat => setSelectedSeat(seat)}
      />
      {selectedSeat !== null && (
        <div className="mt-4 border-t border-border pt-4 space-y-3">
          <p className="text-xs font-medium text-t1">Asiento {String(selectedSeat).padStart(2, '0')} seleccionado</p>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Nombres" value={nombres} onChange={e => setNombres(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm" />
            <input placeholder="Apellidos" value={apellidos} onChange={e => setApellidos(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm" />
            <div className="col-span-2">
              <DocumentField docType={docType} value={dni} onDocType={setDocType} onValue={setDni} />
            </div>
            <input placeholder="Tarifa (S/)" type="number" min={0} value={fare} onChange={e => setFare(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm" />
            <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className="h-9 px-3 border border-border rounded-lg text-sm">
              {(['EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA', 'QR'] as const).map(pm => <option key={pm} value={pm}>{pm}</option>)}
            </select>
            <div className="col-span-2">
              <input
                placeholder="Correo del pasajero (opcional)"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={`h-9 px-3 border rounded-lg text-sm w-full ${email && !emailValid ? 'border-danger' : 'border-border'}`}
              />
              <p className="text-[11px] text-t2 mt-1">Si lo llenas, le llega un boleto de este viaje a su correo.</p>
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || !nombres || !apellidos || !dniValid || !emailValid}
            className="w-full h-9 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus size={14} /> {submitting ? 'Guardando…' : submitLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function DriverManifest() {
  const { user } = useAuth();
  const { profile, company, org } = useDriverContext();
  const { wallets } = useDriverWallets(user?.email ?? user?.code ?? '', profile?.name ?? user?.name ?? '', profile?.phone ?? '');
  const [showPaymentQr, setShowPaymentQr] = useState(false);
  const [paymentQrType] = useState<WalletType>('YAPE');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [manifests, setManifests] = useState<Manifest[]>([]);

  const [addingPassenger, setAddingPassenger] = useState(false);
  const [openingManifest, setOpeningManifest] = useState(false);
  const [closingManifest, setClosingManifest] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showPaperBackup, setShowPaperBackup] = useState(false);
  const [justClosed, setJustClosed] = useState<Manifest | null>(null);
  const [closedAt, setClosedAt] = useState<Date | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [lastDownloadAt, setLastDownloadAt] = useState<Date | null>(null);
  const [myEntryId, setMyEntryId] = useState<string | null>(null);
  const [departing, setDeparting] = useState(false);

  const [digitizing, setDigitizing] = useState<Manifest | null>(null);
  const [digitizePassengers, setDigitizePassengers] = useState<Passenger[]>([]);
  const [digitizeSaving, setDigitizeSaving] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const aiFileInputRef = useRef<HTMLInputElement>(null);

  const myCode = user?.code ?? '';

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [tripList, manifestList, queueJP, queuePJ] = await Promise.all([
        fetchTrips(), fetchManifests(), fetchQueue('JULI_PUNO'), fetchQueue('PUNO_JULI'),
      ]);
      setTrips(tripList);
      setManifests(manifestList);
      // Necesario para "Marcar salida" -- depart() del backend recibe el id
      // de la entrada en cola (QueueEntry), no el del Trip.
      const myEntry = [...queueJP, ...queuePJ].find(e => e.code === myCode) ?? null;
      setMyEntryId(myEntry?.id ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el manifiesto');
    } finally {
      setLoading(false);
    }
  }, [myCode]);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 15000);
    return () => clearInterval(id);
  }, [reload]);

  // Incluye 'PROGRAMADO' -- ver la misma nota en DriverHome mas arriba.
  const myTrip = trips.find(t => t.code === myCode && (t.status === 'ACTIVO' || t.status === 'PROGRAMADO')) ?? null;
  // Solo cuenta como "activo/editable" mientras siga en BORRADOR -- una vez
  // cerrado (o el Trip ya paso a ACTIVO tras "Marcar salida"), no debe
  // volver a ofrecer agregar pasajeros ni "Cerrar manifiesto" sobre el
  // mismo manifiesto.
  const activeManifest = myTrip?.manifestId
    ? manifests.find(m => m.id === myTrip.manifestId && m.status === 'BORRADOR') ?? null
    : null;
  const pendingManifests = manifests.filter(m => m.pendingDigitize && m.id !== activeManifest?.id);

  const routeLabel = (route?: string) => (route === 'PUNO_JULI' ? 'Puno → Juli' : 'Juli → Puno');
  const originFor = (route?: string) => (route === 'PUNO_JULI' ? 'Puno' : 'Juli');
  const destinationFor = (route?: string) => (route === 'PUNO_JULI' ? 'Juli' : 'Puno');

  const handleOpenManifest = async () => {
    if (!myTrip) return;
    setOpeningManifest(true);
    setActionError('');
    try {
      await openManifest(myTrip.id, seatMapCapacity(myTrip.vehicleType));
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo abrir el manifiesto');
    } finally {
      setOpeningManifest(false);
    }
  };

  const handleAddPassenger = async (p: { name: string; dni: string; documentType?: DocumentType; seat: number; fare: number; paymentMethod: PaymentMethod; origin: string; destination: string; email?: string }) => {
    if (!activeManifest) return;
    setAddingPassenger(true);
    setActionError('');
    try {
      await addManifestPassenger(activeManifest.id, p);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo agregar el pasajero');
    } finally {
      setAddingPassenger(false);
    }
  };

  const doClose = async (paperBackupConfirmed?: boolean) => {
    if (!activeManifest) return;
    setClosingManifest(true);
    setActionError('');
    try {
      const result = await closeManifest(activeManifest.id, undefined, paperBackupConfirmed);
      setJustClosed(result);
      setClosedAt(new Date());
      setShowCloseConfirm(false);
      setShowPaperBackup(false);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo cerrar el manifiesto');
    } finally {
      setClosingManifest(false);
    }
  };

  // Correccion (9 sept 2026): antes solo se ofrecia el camino de "respaldo en
  // papel" cuando el manifiesto quedaba en CERO pasajeros -- un cierre
  // PARCIAL (1, 2, o cualquier numero menor a la capacidad) se iba por el
  // cierre normal, sin marcar pendingDigitize, y la seccion "Digitalizar con
  // foto (IA)" nunca llegaba a aparecer para esos casos, aunque el backend
  // ya lo soporta (manifests.service.ts#close, Jayde 3 sept 2026). Ahora
  // cualquier manifiesto que no llegue a la capacidad completa pasa por el
  // mismo camino de respaldo en papel.
  const handleCloseManifest = () => {
    if (!activeManifest) return;
    if (activeManifest.passengers.length < activeManifest.capacity) {
      setShowPaperBackup(true);
    } else {
      setShowCloseConfirm(true);
    }
  };

  const handleDepart = async () => {
    if (!myEntryId) return;
    setDeparting(true);
    setActionError('');
    try {
      await departQueueEntry(myEntryId);
      // No se limpia justClosed: el mismo Trip sigue siendo el "activo" para
      // este conductor (paso de PROGRAMADO a ACTIVO, no uno nuevo), y su
      // manifiesto ya quedo cerrado -- mantener esta vista evita que
      // reaparezcan "Agregar pasajero"/"Cerrar manifiesto" sobre un
      // manifiesto que ya esta CERRADO.
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo marcar la salida');
    } finally {
      setDeparting(false);
    }
  };

  const handleDigitizeSubmit = async () => {
    if (!digitizing || digitizePassengers.length === 0) return;
    setDigitizeSaving(true);
    setActionError('');
    try {
      const result = await digitizeManifest(digitizing.id, digitizePassengers.map(({ id: _id, ...rest }) => rest));
      setJustClosed(result);
      setClosedAt(new Date());
      setDigitizing(null);
      setDigitizePassengers([]);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo completar el manifiesto');
    } finally {
      setDigitizeSaving(false);
    }
  };

  // Achica la foto en el navegador antes de mandarla (fotos de celular sin
  // comprimir son varios MB) -- suficiente resolucion para que la IA lea el
  // papel, sin acercarse al limite de 8mb del body del backend.
  const MAX_AI_IMAGE_DIM = 1600;
  const fileToResizedBase64 = (file: File): Promise<{ base64: string; mediaType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
        img.onload = () => {
          const scale = Math.min(1, MAX_AI_IMAGE_DIM / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('No se pudo procesar la imagen')); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const resized = canvas.toDataURL('image/jpeg', 0.85);
          resolve({ base64: resized.split(',')[1] ?? '', mediaType: 'image/jpeg' });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });

  // Sugerencia de IA (ia-aplicada.md §2.2): solo pre-llena digitizePassengers
  // para revisar -- nunca guarda nada por su cuenta. Nunca pisa un asiento
  // ya agregado a mano o por una foto anterior en esta misma sesion.
  const handleAiPhoto = async (file: File) => {
    if (!digitizing) return;
    setAiSuggesting(true);
    setAiSummary('');
    setActionError('');
    try {
      const { base64, mediaType } = await fileToResizedBase64(file);
      const result = await digitizeSuggest(digitizing.id, base64, mediaType);
      const stagedSeats = new Set(digitizePassengers.map(p => p.seat));
      const toAdd = result.suggested.filter(p => !stagedSeats.has(p.seat));
      setDigitizePassengers(prev => [
        ...prev,
        ...toAdd.map((p, i) => ({ ...p, id: `local-ai-${prev.length + i}-${Date.now()}` })),
      ]);
      const skippedTotal = result.skipped + (result.suggested.length - toAdd.length);
      setAiSummary(
        `La IA leyó ${result.total} fila(s) de la foto: ${toAdd.length} agregada(s) para revisar` +
        (skippedTotal > 0 ? `, ${skippedTotal} omitida(s) por no ser legibles o ya estar ocupadas — agrégalas a mano si hace falta` : '') +
        '. Revisa la lista antes de guardar.',
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo leer la foto con IA');
    } finally {
      setAiSuggesting(false);
    }
  };

  const downloadManifest = async (source: Manifest) => {
    if (downloading) return;
    setDownloading(true);
    try {
      const downloadedAt = new Date();
      const token = manifestVerificationToken(source.id, source.number, source.code);
      const verificationUrl = window.location.origin + '/verificar/manifiesto/' + encodeURIComponent(token);
      const total = source.passengers.reduce((s, p) => s + p.fare, 0);
      const cash = source.passengers.filter(p => p.paymentMethod === 'EFECTIVO').reduce((s, p) => s + p.fare, 0);
      const yape = source.passengers.filter(p => p.paymentMethod === 'YAPE').reduce((s, p) => s + p.fare, 0);
      const plin = source.passengers.filter(p => p.paymentMethod === 'PLIN').reduce((s, p) => s + p.fare, 0);
      const data: ManifestPdfData = {
        token,
        verificationUrl,
        number: source.number,
        issueDate: formatManifestDateTime(downloadedAt),
        route: routeLabel(source.route),
        departure: source.date + ' ' + source.departureTime,
        arrival: closedAt ? formatManifestDateTime(closedAt) : formatManifestDateTime(downloadedAt),
        downloadedAt: formatManifestDateTime(downloadedAt),
        code: source.code,
        plate: source.plate,
        model: source.vehicleType,
        capacity: source.capacity,
        association: org?.name ?? 'Sin dato',
        company: source.company || company,
        driver: profile?.name ?? user?.name ?? 'Sin dato',
        dni: profile?.dni ?? 'No registrado',
        license: profile?.license ?? 'No registrada',
        passengers: source.passengers,
        total, cash, yape, plin,
      };
      const pdfBlob = await createManifestPdfBlob(data);
      const pdfDataUrl = await blobToDataUrl(pdfBlob);
      const records = JSON.parse(localStorage.getItem(MANIFEST_RECORDS_KEY) ?? '{}') as Record<string, unknown>;
      records[token] = { ...data, pdfDataUrl, status: 'VALIDO', storedAt: downloadedAt.toISOString() };
      localStorage.setItem(MANIFEST_RECORDS_KEY, JSON.stringify(records));
      downloadBrowserFile(pdfBlob, 'manifiesto-' + source.number + '.pdf');
      setLastDownloadAt(downloadedAt);
    } finally {
      setDownloading(false);
    }
  };

  if (digitizing) {
    const totalStaged = digitizePassengers.reduce((s, p) => s + p.fare, 0);
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-t1">Completar manifiesto — {digitizing.number}</h1>
            <p className="text-xs text-t2 mt-0.5">{routeLabel(digitizing.route)} · Respaldo en papel pendiente de digitalizar</p>
          </div>
          <button onClick={() => { setDigitizing(null); setDigitizePassengers([]); setAiSummary(''); }} className="text-muted hover:text-t1" aria-label="Cancelar"><X size={18} /></button>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-t1">Digitalizar con foto (IA)</p>
            <p className="text-xs text-t2 mt-0.5">Sube una foto del papel y la IA pre-llena nombres, asientos y tarifas — siempre revisas y confirmas antes de guardar.</p>
            {aiSummary && <p className="text-xs text-t1 mt-1.5">{aiSummary}</p>}
          </div>
          <button
            onClick={() => aiFileInputRef.current?.click()}
            disabled={aiSuggesting}
            className="h-9 px-4 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50 flex items-center gap-2 shrink-0"
          >
            {aiSuggesting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {aiSuggesting ? 'Leyendo…' : 'Subir foto'}
          </button>
          <input
            ref={aiFileInputRef}
            type="file"
            accept="image/*"
            // Sin "capture": asi el celular muestra el selector nativo
            // completo (Camara / Galeria / Archivos) en vez de saltar
            // directo a la camara -- a veces la foto del papel ya la
            // tomaron antes, o la luz del momento no ayuda.
            hidden
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) handleAiPhoto(f);
            }}
          />
        </div>

        {actionError && <div className="bg-danger/10 text-danger text-xs px-3 py-2 rounded-lg flex items-center gap-2"><AlertCircle size={13} /> {actionError}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
          <PassengerSeatForm
            vehicleType={digitizing.vehicleType}
            occupiedSeats={digitizePassengers.map(p => p.seat)}
            defaultOrigin={originFor(digitizing.route)}
            defaultDestination={destinationFor(digitizing.route)}
            onSubmit={p => { setDigitizePassengers(prev => [...prev, { ...p, id: `local-${prev.length}-${Date.now()}` }]); }}
            submitting={false}
            submitLabel="Agregar a la lista"
          />
          <div className="space-y-4">
            {digitizePassengers.length > 0 && (
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-bg border-b border-border flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-t2">Pasajeros del respaldo en papel ({digitizePassengers.length})</h3>
                  <span className="text-xs font-medium text-ok">S/ {totalStaged}</span>
                </div>
                <div className="overflow-auto max-h-64">
                  {digitizePassengers.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-0 text-xs">
                      <span className="w-8 font-mono font-medium text-t1">{String(p.seat).padStart(2, '0')}</span>
                      <span className="flex-1 text-t1">{p.name}</span>
                      <span className="text-t2 font-mono">{p.dni}</span>
                      <span className="text-ok font-medium">S/{p.fare}</span>
                      <button onClick={() => setDigitizePassengers(prev => prev.filter((_, idx) => idx !== i))} className="text-muted hover:text-danger" aria-label="Quitar"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={handleDigitizeSubmit}
              disabled={digitizeSaving || digitizePassengers.length === 0}
              className="w-full h-10 bg-ok text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CheckCircle size={14} /> {digitizeSaving ? 'Guardando…' : 'Guardar y completar manifiesto'}
            </button>
            <p className="text-[11px] text-t2">Se guarda todo junto al confirmar — puedes agregar o quitar pasajeros de la lista antes de guardar.</p>
          </div>
        </div>
      </div>
    );
  }

  const displayManifest = justClosed ?? activeManifest;
  const passengers = displayManifest?.passengers ?? [];
  const totalRevenue = passengers.reduce((s, p) => s + p.fare, 0);
  const capacity = displayManifest?.capacity ?? (myTrip ? seatMapCapacity(myTrip.vehicleType) : 0);
  const byMethod = {
    EFECTIVO: passengers.filter(p => p.paymentMethod === 'EFECTIVO').reduce((s, p) => s + p.fare, 0),
    YAPE: passengers.filter(p => p.paymentMethod === 'YAPE').reduce((s, p) => s + p.fare, 0),
    PLIN: passengers.filter(p => p.paymentMethod === 'PLIN').reduce((s, p) => s + p.fare, 0),
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base font-semibold text-t1">Manifiesto activo</h1>
          <p className="text-xs text-t2 mt-0.5">
            {justClosed
              ? `${justClosed.number} · ${routeLabel(justClosed.route)} · cerrado`
              : activeManifest
                ? `${activeManifest.number} · ${routeLabel(activeManifest.route)} · ${activeManifest.departureTime}`
                : myTrip
                  ? `Viaje activo código ${myTrip.code} · ${routeLabel(myTrip.route)} · sin manifiesto abierto`
                  : 'Sin viaje activo'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowPaymentQr(true)} className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-medium text-t1 hover:bg-hover">
            <QrCode size={14} /> Mostrar QR
          </button>
          {activeManifest && !justClosed && (
            <button
              onClick={handleCloseManifest}
              disabled={closingManifest}
              className="flex items-center gap-2 px-3 py-2 bg-ok text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <CheckCircle size={14} /> {closingManifest ? 'Cerrando…' : 'Cerrar manifiesto'}
            </button>
          )}
          {justClosed && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="text-right">
                <span className="flex items-center gap-2 text-sm text-ok bg-ok/10 px-3 py-2 rounded-lg">
                  <CheckCircle size={14} /> Manifiesto cerrado
                </span>
                {lastDownloadAt && <p className="text-[11px] text-t2 mt-1">Última descarga: {formatManifestDateTime(lastDownloadAt)}</p>}
              </div>
              <button disabled={downloading} onClick={() => downloadManifest(justClosed)} className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-medium text-t1 hover:bg-hover disabled:opacity-50">
                {downloading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                {downloading ? 'Generando PDF…' : 'Descargar PDF verificable'}
              </button>
              {myTrip?.status === 'ACTIVO' ? (
                <span className="flex items-center gap-2 text-sm text-ok bg-ok/10 px-3 py-2 rounded-lg">
                  <ArrowRight size={14} /> Salida marcada — viaje en curso
                </span>
              ) : (
                <button
                  disabled={departing || !myEntryId}
                  onClick={handleDepart}
                  className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50"
                >
                  <ArrowRight size={14} /> {departing ? 'Marcando salida…' : 'Marcar salida'}
                </button>
              )}
              <button onClick={() => setJustClosed(null)} className="text-xs text-t2 hover:text-t1 underline">Volver</button>
            </div>
          )}
        </div>
      </div>

      {loadError && <div className="bg-danger/10 text-danger text-xs px-3 py-2 rounded-lg flex items-center gap-2"><AlertCircle size={13} /> {loadError}</div>}
      {actionError && <div className="bg-danger/10 text-danger text-xs px-3 py-2 rounded-lg flex items-center gap-2"><AlertCircle size={13} /> {actionError}</div>}
      {loading && <div className="text-xs text-t2 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Cargando…</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'Pasajeros', value: passengers.length },
          { label: 'Capacidad', value: capacity },
          { label: 'Total', value: `S/ ${totalRevenue}` },
          { label: 'Libres', value: Math.max(capacity - passengers.length, 0) },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-border rounded-lg px-4 py-3 text-center">
            <div className="text-xl font-bold text-t1">{item.value}</div>
            <div className="text-xs text-t2">{item.label}</div>
          </div>
        ))}
      </div>

      {!justClosed && activeManifest && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
          <PassengerSeatForm
            vehicleType={activeManifest.vehicleType}
            occupiedSeats={activeManifest.passengers.map(p => p.seat)}
            defaultOrigin={originFor(activeManifest.route)}
            defaultDestination={destinationFor(activeManifest.route)}
            onSubmit={handleAddPassenger}
            submitting={addingPassenger}
            submitLabel="Agregar pasajero"
          />
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-t1 mb-3">Recaudación por método</h3>
              <div className="space-y-2">
                {Object.entries(byMethod).map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between text-sm">
                    <span className="text-t2">{method}</span>
                    <span className="font-medium text-ok">S/ {amount}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-semibold border-t border-border pt-2">
                  <span className="text-t1">Total</span>
                  <span className="text-ok">S/ {totalRevenue}</span>
                </div>
              </div>
            </div>
            {passengers.length > 0 && (
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-bg border-b border-border">
                  <h3 className="text-xs font-semibold text-t2">Pasajeros registrados</h3>
                </div>
                <div className="overflow-auto max-h-48">
                  {passengers.map(p => (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-0 text-xs">
                      <span className="w-8 font-mono font-medium text-t1">{String(p.seat).padStart(2, '0')}</span>
                      <span className="flex-1 text-t1">{p.name}</span>
                      <span className="text-t2 font-mono">{p.dni}</span>
                      <span className="text-ok font-medium">S/{p.fare}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!justClosed && !activeManifest && myTrip && !myTrip.manifestId && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center space-y-3">
          <FileCheck size={28} className="mx-auto text-primary" />
          <p className="text-sm text-t1 font-medium">Viaje en curso — código {myTrip.code} · {routeLabel(myTrip.route)}</p>
          <p className="text-xs text-t2">Abre el manifiesto para empezar a registrar pasajeros.</p>
          <button
            onClick={handleOpenManifest}
            disabled={openingManifest}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50"
          >
            <Plus size={14} /> {openingManifest ? 'Abriendo…' : 'Abrir manifiesto'}
          </button>
        </div>
      )}

      {!justClosed && !activeManifest && myTrip && myTrip.manifestId && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center space-y-3">
          <CheckCircle size={28} className="mx-auto text-ok" />
          <div>
            <p className="text-sm text-t1 font-medium">
              {myTrip.status === 'ACTIVO' ? 'Viaje en curso' : 'Manifiesto preparado'} — código {myTrip.code} · {routeLabel(myTrip.route)}
            </p>
            <p className="text-xs text-t2 mt-1">
              El manifiesto de este viaje ya está cerrado{myTrip.status === 'ACTIVO' ? '.' : ' — marca salida cuando estés listo para partir.'}
            </p>
          </div>
          {myTrip.status === 'PROGRAMADO' && (
            <button
              disabled={departing || !myEntryId}
              onClick={handleDepart}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50"
            >
              <ArrowRight size={14} /> {departing ? 'Marcando salida…' : 'Marcar salida'}
            </button>
          )}
        </div>
      )}

      {!justClosed && !myTrip && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center">
          <p className="text-sm text-t2">No tienes un viaje preparado. Cuando tu unidad esté LLAMANDO en la cola, pulsa «Preparar manifiesto» en Inicio para abrirlo aquí.</p>
        </div>
      )}

      {pendingManifests.length > 0 && (
        <div className="bg-warn/5 border border-warn/30 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium text-t1 flex items-center gap-2"><AlertCircle size={14} className="text-warn" /> Manifiestos pendientes de completar</h3>
          <p className="text-xs text-t2">Se cerraron vacíos con respaldo en papel — complétalos con los datos del papel cuanto antes.</p>
          <div className="space-y-2">
            {pendingManifests.map(m => (
              <div key={m.id} className="flex items-center justify-between bg-surface border border-border rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm text-t1 font-medium">{m.number}</p>
                  <p className="text-xs text-t2">{routeLabel(m.route)} · {m.date} · {m.departureTime}</p>
                </div>
                <button
                  onClick={() => { setDigitizing(m); setDigitizePassengers([]); }}
                  className="px-3 py-1.5 text-xs bg-warn text-white rounded hover:bg-warn/90"
                >
                  Completar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCloseConfirm && activeManifest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-t1 mb-2">Cerrar manifiesto</h3>
            <p className="text-sm text-t2 mb-4">{passengers.length} pasajeros · S/ {totalRevenue} recaudados. El manifiesto cerrado no se modifica.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowCloseConfirm(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button onClick={() => doClose(false)} disabled={closingManifest} className="px-4 py-2 text-sm bg-ok text-white rounded-lg hover:opacity-90 disabled:opacity-50">
                {closingManifest ? 'Cerrando…' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaperBackup && activeManifest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-t1 mb-2">
              {activeManifest.passengers.length === 0 ? 'Manifiesto sin pasajeros' : 'Manifiesto incompleto'}
            </h3>
            <p className="text-sm text-t2 mb-4">
              {activeManifest.passengers.length === 0
                ? 'No has registrado pasajeros.'
                : `Solo registraste ${activeManifest.passengers.length} de ${activeManifest.capacity} pasajeros.`}
              {' '}Solo puedes cerrarlo así si existe el respaldo físico en papel que los pasajeros llenaron. Más tarde tendrás que completarlo desde "Manifiestos pendientes".
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowPaperBackup(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button onClick={() => doClose(true)} disabled={closingManifest} className="px-4 py-2 text-sm bg-warn text-white rounded-lg hover:opacity-90 disabled:opacity-50">
                {closingManifest ? 'Cerrando…' : 'Confirmo que existe el respaldo en papel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentQr && <WalletQrDialog wallets={wallets} initialType={paymentQrType} onClose={() => setShowPaymentQr(false)} />}
    </div>
  );
}

// ─── Mis viajes / produccion ────────────────────────────────────────────────
// Reporte compartido con el Socio (12 sept 2026, decidido con Jayde) -- ver
// ProductionReportView.tsx para el porque: el conductor rinde cuentas con
// esto, el socio controla con el MISMO calculo.
function DriverTrips() {
  const { code, profile, org } = useDriverContext();
  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-base font-semibold text-t1 mb-5">Mis viajes / Producción</h1>
      <ProductionReportView code={code} orgName={org?.name} personName={profile?.name} personLabel="Conductor" />
    </div>
  );
}

// ─── Mi perfil ────────────────────────────────────────────────────────────────
type ProfileTab = 'personal' | 'credenciales' | 'unidad' | 'cobros' | 'documentos' | 'mapa';

type DocStatus = 'Vigente' | 'Por vencer' | 'Vencido' | 'Pendiente de revisión';

interface UnitDoc {
  name: string;
  status: DocStatus;
  expires: string;
}

const UNIT_DOCS: UnitDoc[] = [
  { name: 'SOAT', status: 'Vigente', expires: '2027-03-15' },
  { name: 'Tarjeta de identificación vehicular', status: 'Vigente', expires: '2030-01-01' },
  { name: 'Revisión técnica', status: 'Por vencer', expires: '2026-10-20' },
  { name: 'Permiso de operación SUTRAN', status: 'Vigente', expires: '2027-06-30' },
  { name: 'Póliza de responsabilidad civil', status: 'Pendiente de revisión', expires: '—' },
];

function docStatusStyle(s: DocStatus) {
  if (s === 'Vigente') return 'bg-ok/10 text-ok';
  if (s === 'Por vencer') return 'bg-warn/10 text-warn';
  if (s === 'Vencido') return 'bg-danger/10 text-danger';
  return 'bg-t2/10 text-t2';
}

function DriverGPS() {
  const { code, unit, company, profile, org } = useDriverContext();
  const [view, setView] = useState<'actual' | 'actividad'>('actual');
  const [notice, setNotice] = useState('');
  const [position, setPosition] = useState<LiveVehiclePosition | null>(null);
  const [device, setDevice] = useState<VehicleGpsStatus | null>(null);
  const [history, setHistory] = useState<GpsHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchGpsLive(), fetchGpsDevices()])
      .then(([positions, devices]) => {
        if (cancelled) return;
        setPosition(positions[0] ?? null);
        setDevice(devices[0] ?? null);
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el GPS.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (view !== 'actividad' || !unit?.id) return;
    let cancelled = false;
    const to = new Date();
    const from = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    fetchGpsHistory(unit.id, from.toISOString(), to.toISOString())
      .then(points => { if (!cancelled) setHistory(points); })
      .catch(() => { /* se degrada a lista vacia */ });
    return () => { cancelled = true; };
  }, [view, unit?.id]);

  const [reportBusy, setReportBusy] = useState<'BOTON_PANICO' | 'FALLA_REPORTADA' | null>(null);

  // Antes esto solo mostraba un mensaje local ("registrado") sin avisar a
  // nadie (12 sept 2026, corregido) -- ahora crea una GpsAlert real, visible
  // al toque en el banner de Admin/Socio y en "Alertas GPS".
  const report = async (type: 'BOTON_PANICO' | 'FALLA_REPORTADA', successMessage: string) => {
    setReportBusy(type);
    try {
      await reportGpsAlert(type);
      setNotice(successMessage);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo enviar el reporte.');
    } finally {
      setReportBusy(null);
      setTimeout(() => setNotice(''), 3500);
    }
  };

  const online = device?.online === 'online';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-base font-semibold text-t1">GPS de mi unidad</h1>
          <p className="text-xs text-t2 mt-0.5">Beneficio habilitado por el GPS del vehículo que tienes asignado</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded ${online ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-ok' : 'bg-warn'}`} /> {online ? 'En línea' : device?.online === 'offline' ? 'Sin señal' : 'Estado desconocido'}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-t2">Cargando GPS…</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Unidad asignada', code],
              ['Última señal', position ? new Date(position.lastUpdate).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : 'Sin dato'],
              ['Velocidad', position ? `${position.speedKmh} km/h` : '—'],
              ['Ruta', position?.route ? routeLabelShort(position.route, org) : 'Sin viaje activo'],
              ['Ignición', position?.ignition == null ? 'Sin dato' : position.ignition ? 'Encendido' : 'Apagado'],
              ['Energía', position?.powerVoltage == null ? 'Sin dato' : `${position.powerVoltage.toFixed(1)} V`],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface border border-border p-4">
                <p className="text-[11px] text-t2 uppercase">{label}</p>
                <p className="text-sm font-semibold text-t1 mt-1">{value}</p>
              </div>
            ))}
          </div>

          <div className="bg-surface border border-border">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-t1">{unit?.model || unit?.vehicleType || 'Vehículo asignado'}</p>
                <p className="text-xs text-t2 mt-0.5">{company} · Unidad {code} · {unit?.plate || 'Sin placa'}</p>
              </div>
            </div>
            <div className="h-72 bg-bg relative overflow-hidden" aria-label="Última posición conocida">
              {position ? (
                <iframe
                  title="Última posición"
                  className="w-full h-full border-0"
                  src={`https://www.google.com/maps?q=${position.lat},${position.lng}&z=15&output=embed`}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-surface border border-warn/40 px-4 py-2 text-xs text-warn flex items-center gap-2">
                    <WifiOff size={14} /> Sin señal reciente. No se muestra ni se inventa una posición.
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="flex border-b border-border">
        <button onClick={() => setView('actual')} className={'px-4 py-2.5 text-sm border-b-2 -mb-px ' + (view === 'actual' ? 'border-primary text-primary font-medium' : 'border-transparent text-t2')}>Viaje actual</button>
        <button onClick={() => setView('actividad')} className={'px-4 py-2.5 text-sm border-b-2 -mb-px ' + (view === 'actividad' ? 'border-primary text-primary font-medium' : 'border-transparent text-t2')}>Mi actividad GPS</button>
      </div>

      {view === 'actual' ? (
        <div className="bg-surface border border-border p-4">
          <h2 className="text-sm font-semibold text-t1">Acceso asignado</h2>
          <p className="text-xs text-t2 mt-2 leading-relaxed">Puedes consultar el viaje actual y las jornadas realizadas por ti mientras conduzcas esta unidad. El socio conserva la configuración y el historial completo del vehículo.</p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button onClick={() => report('FALLA_REPORTADA', 'Falla de GPS reportada — ya es visible para tu asociación.')} disabled={reportBusy !== null} className="h-9 border border-border text-xs font-medium text-t1 hover:bg-hover disabled:opacity-50">
              {reportBusy === 'FALLA_REPORTADA' ? 'Enviando…' : 'Reportar falla GPS'}
            </button>
            <button onClick={() => report('BOTON_PANICO', 'Emergencia reportada — ya es visible para tu asociación.')} disabled={reportBusy !== null} className="h-9 border border-danger/40 text-xs font-medium text-danger hover:bg-danger/5 disabled:opacity-50">
              {reportBusy === 'BOTON_PANICO' ? 'Enviando…' : 'Reportar emergencia'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-border overflow-x-auto">
          <table className="w-full text-xs min-w-[500px]">
            <thead><tr className="bg-bg border-b border-border">
              {['Hora', 'Latitud', 'Longitud', 'Velocidad'].map(label => <th key={label} className="px-4 py-2.5 text-left text-t2 font-medium">{label}</th>)}
            </tr></thead>
            <tbody>
              {history.slice(-100).reverse().map((p, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-t2">{new Date(p.fixTime).toLocaleString('es-PE')}</td>
                  <td className="px-4 py-3 font-mono text-t2">{p.lat.toFixed(5)}</td>
                  <td className="px-4 py-3 font-mono text-t2">{p.lng.toFixed(5)}</td>
                  <td className="px-4 py-3 text-t1">{p.speedKmh} km/h</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-t2">Sin registros en los últimos 7 días</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {notice && <div className="fixed bottom-5 right-5 bg-t1 text-surface px-4 py-3 text-sm shadow-lg">{notice}</div>}
      <p className="text-xs text-muted">El GPS informa eventos operativos y no genera sanciones automáticas.</p>
    </div>
  );
}

function DriverLiveMapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const watchIdRef = useRef<number | null>(null);
  const [status, setStatus] = useState<'cargando' | 'listo' | 'sin_permiso' | 'sin_senal' | 'sin_api_key' | 'error'>('cargando');
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState('');

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!apiKey) {
      setStatus('sin_api_key');
      return;
    }
    if (!('geolocation' in navigator)) {
      setStatus('error');
      return;
    }

    let cancelled = false;

    function loadGoogleMaps(): Promise<void> {
      const w = window as unknown as { google?: { maps: unknown } };
      if (w.google?.maps) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const existing = document.getElementById('chaski-google-maps-script');
        if (existing) {
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () => reject(new Error('load-error')));
          return;
        }
        const script = document.createElement('script');
        script.id = 'chaski-google-maps-script';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('load-error'));
        document.head.appendChild(script);
      });
    }

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = (window as any).google;
        const map = new g.maps.Map(containerRef.current, {
          zoom: 16,
          center: { lat: -15.8402, lng: -70.0219 },
          disableDefaultUI: true,
          zoomControl: true,
        });
        const marker = new g.maps.Marker({ map, title: 'Mi ubicación' });

        watchIdRef.current = navigator.geolocation.watchPosition(
          pos => {
            if (cancelled) return;
            const { latitude, longitude, speed } = pos.coords;
            const point = { lat: latitude, lng: longitude };
            map.setCenter(point);
            marker.setPosition(point);
            setSpeedKmh(typeof speed === 'number' && speed >= 0 ? Math.round(speed * 3.6) : null);
            setLastUpdate(new Date(pos.timestamp).toLocaleTimeString('es-PE'));
            setStatus('listo');
          },
          err => {
            if (cancelled) return;
            setStatus(err.code === err.PERMISSION_DENIED ? 'sin_permiso' : 'sin_senal');
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  if (status === 'sin_api_key') {
    return (
      <div className="border border-border rounded-lg p-6 text-center space-y-2 bg-surface">
        <MapPin size={22} className="mx-auto text-muted" />
        <p className="text-sm text-t1 font-medium">Mapa en vivo en configuración</p>
        <p className="text-xs text-t2">Esta función está siendo activada por el equipo de CHASKI. Vuelve a intentarlo más tarde.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="w-full h-72 rounded-lg border border-border bg-bg" />
      <p className="text-xs text-t2">
        {status === 'cargando' && 'Obteniendo tu ubicación…'}
        {status === 'listo' && `Actualizado ${lastUpdate}${speedKmh !== null ? ` · ${speedKmh} km/h` : ''}`}
        {status === 'sin_permiso' && 'Activa el permiso de ubicación de tu navegador para ver el mapa.'}
        {status === 'sin_senal' && 'Buscando señal GPS…'}
        {status === 'error' && 'No se pudo cargar el mapa en este dispositivo.'}
      </p>
      <p className="text-[11px] text-muted">Esta ubicación es solo para ti: no se comparte con el administrador ni queda registrada en el sistema.</p>
    </div>
  );
}

function DriverProfile() {
  const { user, profile, unit, code, company, driverLiveMapEnabled, org } = useDriverContext();
  const { wallets, walletError, saveWallet, reportWalletError } = useDriverWallets(user?.email ?? code, profile?.name ?? user?.name ?? '', profile?.phone ?? '');
  const [walletDrafts, setWalletDrafts] = useState<DriverWallets>(wallets);
  const [savedWallet, setSavedWallet] = useState<WalletType | null>(null);
  const [tab, setTab] = useState<ProfileTab>('personal');
  const [requestSent, setRequestSent] = useState<string | null>(null);

  useEffect(() => setWalletDrafts(wallets), [wallets]);
  const unitDocs: UnitDoc[] = unit?.documents ? [
    { name: 'SOAT', status: unit.documents.soat ? 'Vigente' : 'Pendiente de revisión', expires: unit.documents.soat || 'No registrado' },
    { name: 'Tarjeta de propiedad', status: unit.documents.tarjetaPropiedad ? 'Vigente' : 'Pendiente de revisión', expires: unit.documents.tarjetaPropiedad || 'No registrado' },
    { name: 'Revisión técnica', status: unit.documents.revisionTecnica ? 'Vigente' : 'Pendiente de revisión', expires: unit.documents.revisionTecnica || 'No registrado' },
    { name: 'Permiso de operación', status: unit.documents.permisos ? 'Vigente' : 'Pendiente de revisión', expires: unit.documents.permisos || 'No registrado' },
  ] : UNIT_DOCS;

  const tabs: { id: ProfileTab; label: string }[] = [
    { id: 'personal', label: 'Información personal' },
    { id: 'credenciales', label: 'Credenciales' },
    { id: 'unidad', label: 'Unidad asignada' },
    { id: 'cobros', label: 'Cobros' },
    { id: 'documentos', label: 'Documentos de unidad' },
    { id: 'mapa', label: 'Mi ubicación' },
  ];

  const handleRequest = (doc: string) => {
    setRequestSent(doc);
    setTimeout(() => setRequestSent(null), 3000);
  };

  const updateWalletDraft = (type: WalletType, patch: Partial<WalletConfig>) => {
    reportWalletError('');
    setSavedWallet(null);
    setWalletDrafts(current => ({
      ...current,
      [type]: { ...current[type], ...patch },
    }));
  };

  const attachWalletQr = (type: WalletType, file?: File) => {
    if (!file) return;
    reportWalletError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      reportWalletError('Adjunta una imagen PNG, JPG o WEBP.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      reportWalletError('La imagen debe pesar como máximo 3 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateWalletDraft(type, { qrImage: String(reader.result) });
    reader.onerror = () => reportWalletError('No se pudo leer la imagen seleccionada.');
    reader.readAsDataURL(file);
  };

  const handleSaveWallet = (type: WalletType) => {
    if (!saveWallet(type, walletDrafts[type])) return;
    setSavedWallet(type);
    setTimeout(() => setSavedWallet(current => current === type ? null : current), 3000);
  };

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <div>
        <h1 className="text-base font-semibold text-t1">Mi perfil</h1>
        <p className="text-xs text-t2 mt-0.5">Datos personales, unidad y medios de cobro</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm whitespace-nowrap transition-colors border-b-2 -mb-px ${
              tab === t.id ? 'border-primary text-primary font-medium' : 'border-transparent text-t2 hover:text-t1'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'personal' && (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {[
            ['Nombres y apellidos', profile?.name || user?.name || 'Conductor'],
            ['DNI', profile?.dni || 'No registrado'],
            ['Teléfono', profile?.phone || 'No registrado'],
            ['Correo de acceso', profile?.email || user?.email || 'No registrado'],
            ['Asociación', org?.name ?? 'Sin dato'],
            ['Empresa integrante', company],
            ['Código de unidad', code],
            ['Estado de afiliación', profile?.status || 'ACTIVO'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-t2 w-40 flex-shrink-0">{label}</span>
              <span className="text-sm text-t1 font-medium text-right">{value}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'credenciales' && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-bg border-b border-border">
              <h3 className="text-xs font-semibold text-t2 uppercase tracking-wide">Licencia de conducir</h3>
            </div>
            <div className="divide-y divide-border">
              {[
                ['Categoría', profile?.licenseCategory || 'No registrada'],
                ['Número', profile?.license || 'No registrada'],
                ['Fecha de emisión', formatLicenseExpiry(profile?.licenseIssuedAt) || 'No registrada'],
                ['Fecha de vencimiento', formatLicenseExpiry(profile?.licenseExpiry) || 'No registrada'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-t2 w-44 flex-shrink-0">{label}</span>
                  <span className="text-sm text-t1 font-medium">{value}</span>
                </div>
              ))}
            </div>
            {(() => {
              const status = licenseStatusInfo(profile?.licenseExpiry);
              return (
                <div className="px-4 py-2.5 border-t border-border flex items-center justify-between gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${status.cls}`}>{status.label}</span>
                  <span className="text-xs text-muted text-right">{status.note}</span>
                </div>
              );
            })()}
          </div>

          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-bg border-b border-border">
              <h3 className="text-xs font-semibold text-t2 uppercase tracking-wide">Certificado médico</h3>
            </div>
            <div className="divide-y divide-border">
              {[
                ['Número', 'CM-2026-00145'],
                ['Fecha de emisión', '02 ene 2026'],
                ['Fecha de vencimiento', '02 ene 2027'],
                ['Centro emisor', 'ESSALUD Puno'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-t2 w-44 flex-shrink-0">{label}</span>
                  <span className="text-sm text-t1 font-medium">{value}</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-border">
              <span className="text-xs bg-ok/10 text-ok px-2 py-0.5 rounded font-medium">Vigente</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'unidad' && (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {[
            ['Código de unidad', code],
            ['Placa actual', unit?.plate || 'Sin placa'],
            ['Marca y modelo', unit?.model || unit?.vehicleType || 'No registrado'],
            ['Año', String(unit?.year || 'No registrado')],
            ['Capacidad física', unit?.capacity ? unit.capacity + ' asientos' : 'No registrada'],
            ['Capacidad vendible', unit?.vendibleCapacity ? unit.vendibleCapacity + ' pasajeros' : unit?.capacity ? Math.max(unit.capacity - 1, 0) + ' pasajeros' : 'No registrada'],
            ['Empresa integrante', company],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-t2 w-40 flex-shrink-0">{label}</span>
              <span className="text-sm text-t1 font-medium">{value}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'cobros' && (
        <div className="space-y-4">
          <div className="bg-primary/5 border border-primary/20 px-4 py-3">
            <p className="text-sm font-medium text-t1">Códigos QR para cobros</p>
            <p className="text-xs text-t2 mt-1">Configura el titular, celular y la imagen real del QR. Estos datos aparecen al usar Mostrar QR.</p>
          </div>
          {walletError && (
            <div className="bg-danger/5 border border-danger/30 px-4 py-2.5 text-sm text-danger flex items-center gap-2">
              <AlertCircle size={14} /> {walletError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['YAPE', 'PLIN'] as WalletType[]).map(type => {
              const wallet = walletDrafts[type];
              const storedWallet = wallets[type];
              const configured = Boolean(storedWallet.qrImage && storedWallet.holder.trim() && storedWallet.phone.trim());
              return (
                <section key={type} className="bg-surface border border-border">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                    <WalletLogo type={type} className="h-6 w-auto" />
                    <span className={'text-[11px] px-2 py-1 font-medium ' + (configured ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn')}>
                      {configured ? 'Configurado' : 'Pendiente'}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <label htmlFor={type + '-holder'} className="block text-xs font-medium text-t1 mb-1">Titular de la cuenta</label>
                      <input id={type + '-holder'} value={wallet.holder} onChange={event => updateWalletDraft(type, { holder: event.target.value })} placeholder="Nombre que verá el pasajero" className="w-full h-10 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label htmlFor={type + '-phone'} className="block text-xs font-medium text-t1 mb-1">Número de celular</label>
                      <input id={type + '-phone'} inputMode="numeric" maxLength={9} value={wallet.phone} onChange={event => updateWalletDraft(type, { phone: event.target.value.replace(/\D/g, '').slice(0, 9) })} placeholder="999999999" className="w-full h-10 px-3 border border-border rounded-lg text-sm font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <span className="block text-xs font-medium text-t1 mb-1">Imagen del código QR</span>
                      <input id={type + '-qr'} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={event => { attachWalletQr(type, event.target.files?.[0]); event.currentTarget.value = ''; }} />
                      <label htmlFor={type + '-qr'} className="h-10 px-3 border border-border rounded-lg text-sm font-medium text-t1 hover:bg-hover cursor-pointer inline-flex items-center justify-center gap-2 w-full">
                        <Upload size={14} /> {wallet.qrImage ? 'Reemplazar imagen' : 'Adjuntar imagen QR'}
                      </label>
                      <p className="text-[11px] text-muted mt-1">PNG, JPG o WEBP · máximo 3 MB</p>
                    </div>
                    {wallet.qrImage ? (
                      <div className="border border-border bg-bg p-3">
                        <img src={wallet.qrImage} alt={'Vista previa QR ' + type} className="w-44 h-44 max-w-full object-contain bg-white mx-auto" />
                        <button type="button" onClick={() => updateWalletDraft(type, { qrImage: '' })} className="mt-3 w-full h-9 text-sm text-danger border border-danger/30 hover:bg-danger/5 inline-flex items-center justify-center gap-2">
                          <Trash2 size={14} /> Quitar imagen
                        </button>
                      </div>
                    ) : (
                      <div className="h-36 border border-dashed border-border bg-bg flex flex-col items-center justify-center text-center px-4">
                        <QrCode size={24} className="text-muted" />
                        <p className="text-xs text-t2 mt-2">Todavía no hay una imagen adjunta.</p>
                      </div>
                    )}
                    <button type="button" onClick={() => handleSaveWallet(type)} className="w-full h-10 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h inline-flex items-center justify-center gap-2">
                      <CheckCircle size={15} /> Guardar cambios
                    </button>
                    {savedWallet === type && (
                      <p className="text-xs text-ok text-center flex items-center justify-center gap-1.5">
                        <CheckCircle size={13} /> Cambios guardados
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          <p className="text-xs text-muted">El QR solo se actualiza después de pulsar Guardar cambios.</p>
        </div>
      )}

      {tab === 'documentos' && (
        <div className="space-y-3">
          {requestSent && (
            <div className="bg-ok/5 border border-ok/30 rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm text-ok">
              <CheckCircle size={14} /> Solicitud enviada: {requestSent}
            </div>
          )}
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs" aria-label="Documentos de unidad">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Documento</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Vencimiento</th>
                  <th className="text-left px-4 py-2.5 text-t2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {unitDocs.map(doc => (
                  <tr key={doc.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-t1 font-medium">{doc.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${docStatusStyle(doc.status)}`}>
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-t2">{doc.expires}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button className="flex items-center gap-1 text-primary hover:underline text-[11px]">
                          <Eye size={11} /> Ver
                        </button>
                        <button className="flex items-center gap-1 text-t2 hover:text-t1 text-[11px]">
                          <Download size={11} /> Descargar
                        </button>
                        <button
                          onClick={() => handleRequest(doc.name)}
                          className="flex items-center gap-1 text-t2 hover:text-t1 text-[11px]"
                        >
                          <FileCheck size={11} /> Solicitar actualización
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Documentación sujeta a validación.</p>
        </div>
      )}

      {tab === 'mapa' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-t1">Mi ubicación</h2>
            <p className="text-xs text-t2 mt-0.5">Mapa en vivo con tu posición actual, solo visible para ti.</p>
          </div>
          {driverLiveMapEnabled ? (
            <DriverLiveMapView />
          ) : (
            <div className="border border-border rounded-lg p-6 text-center space-y-2 bg-surface">
              <MapPin size={22} className="mx-auto text-muted" />
              <p className="text-sm text-t1 font-medium">Esta opción no está disponible en este momento</p>
              <p className="text-xs text-t2">Tu asociación no tiene habilitado el mapa en vivo. Consulta con tu administrador si necesitas esta función.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Avisos (plan-pro.md §9) ───────────────────────────────────────────────────
// Solo lectura: los redacta el administrador desde su panel. Nunca llegan por
// WhatsApp, solo aqui dentro de la plataforma.
function DriverNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchNotices()
      .then(result => { if (!cancelled) setNotices(result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los avisos.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-t1">Avisos</h1>
        <p className="text-sm text-t2 mt-0.5">Comunicados de tu administrador.</p>
      </div>
      {loading ? (
        <div className="text-center py-10 text-sm text-t2">Cargando avisos…</div>
      ) : error ? (
        <div className="text-center py-10 text-sm text-danger">{error}</div>
      ) : notices.length === 0 ? (
        <div className="text-center py-10 text-sm text-t2">
          <Megaphone size={28} className="mx-auto mb-2 opacity-30" />
          Todavía no tienes avisos.
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map(n => (
            <div key={n.id} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-t1">{n.title}</h3>
                <span className="text-xs text-t2 shrink-0">{new Date(n.createdAt).toLocaleDateString('es-PE')}</span>
              </div>
              <p className="text-sm text-t2 mt-1 whitespace-pre-wrap">{n.body}</p>
              <p className="text-xs text-t2 mt-2">Por {n.authorName}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────
export default function DriverApp({ onLogout }: { onLogout?: () => void }) {
  const [section, setSection] = useState<Section>('inicio');
  const { hasVehicleGPS, org } = useDriverContext();
  const navItems = hasVehicleGPS
    ? [...NAV_ITEMS.slice(0, 4), { id: 'gps', label: 'GPS de mi unidad', icon: MapPin }, ...NAV_ITEMS.slice(4)]
    : NAV_ITEMS;
  // GPS Vehicular es un complemento POR UNIDAD, no un plan de la asociacion
  // (ver mismo comentario en PartnerApp.tsx).
  const planLabelOverride = hasVehicleGPS && org?.plan === 'OPERACION' ? 'Plan GPS Vehicular' : undefined;

  return (
    <Shell navItems={navItems} activeSection={section} onNavigate={(id) => setSection(id as Section)} onLogout={onLogout} planLabelOverride={planLabelOverride}>
      {section === 'inicio' && <DriverHome onNavigate={setSection} />}
      {section === 'cola' && <DriverQueue />}
      {section === 'manifiesto' && <DriverManifest />}
      {section === 'viajes' && <DriverTrips />}
      {section === 'gps' && hasVehicleGPS && <DriverGPS />}
      {section === 'avisos' && <DriverNotices />}
      {section === 'perfil' && <DriverProfile />}
    </Shell>
  );
}
