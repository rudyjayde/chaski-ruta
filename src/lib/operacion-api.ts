// Cliente real del motor de Operacion (backend NestJS) — reemplaza los datos
// estaticos de src/data/demo.ts para colas, manifiestos y viajes.
// Cada funcion devuelve datos ya adaptados a los tipos que usa el frontend
// (src/types) para no tener que tocar la UI existente, solo la fuente de datos.
import type {
  QueueEntry, QueueStatus, EvidenceType, Manifest, Passenger, Trip, TripStatus,
  RouteDir, PaymentMethod, VehicleType, Unit, Person, AuditEntry, RelocationOrder, RelocationStatus,
  DelayedRegistrationRequest, DelayedRegistrationStatus, DelayedRegistrationResolution,
} from '../types';
import { getActingOrgId } from './acting-org';

const TOKEN_KEY = 'chaski-auth-token';
const DEVICE_ID_KEY = 'chaski-device-id';

// Identificador estable de este navegador/dispositivo, para el vinculo
// cuenta-dispositivo del conductor (plan-operacion.md §3.2). Se genera una
// sola vez y se persiste en localStorage — no es un fingerprint de hardware,
// solo un token opaco por instalacion/navegador.
export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function apiUrl(): string {
  const url = import.meta.env.VITE_API_URL as string | undefined;
  if (!url) throw new Error('Falta configurar VITE_API_URL');
  return url;
}

// Modo "Entrar como administrador" (Super Admin actuando sobre una asociacion
// especifica, ver acting-org.ts): si esta activo, se agrega organizationId a
// TODAS las llamadas -- el backend (resolveOrgId en tenant.ts) lo respeta solo
// cuando quien pregunta es SUPERADMIN; para cualquier otro rol lo ignora y usa
// siempre su propia asociacion, asi que esto nunca es un riesgo de seguridad.
function withActingOrg(path: string): string {
  // Si el path ya trae su propio organizationId explicito (p. ej. Super Admin
  // operando sobre una asociacion puntual desde Asociaciones, sin haber
  // entrado "como administrador"), nunca lo pisamos ni lo duplicamos.
  if (path.includes('organizationId=')) return path;
  const actingOrgId = getActingOrgId();
  if (!actingOrgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}organizationId=${encodeURIComponent(actingOrgId)}`;
}

// Error del servidor con los datos extra que manda (por ejemplo `code` y
// `companyId` cuando una empresa eliminada coincide con la que se quiere crear).
export class ApiError extends Error {
  code?: string;
  data: Record<string, unknown>;
  constructor(message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.code = typeof data.code === 'string' ? data.code : undefined;
    this.data = data;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${apiUrl()}${withActingOrg(path)}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Error ${res.status}`;
    let data: Record<string, unknown> = {};
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      if (body && typeof body === 'object') data = body;
    } catch {
      // sin cuerpo JSON, se usa el mensaje generico
    }
    throw new ApiError(message, data);
  }
  if (res.status === 204) return undefined as T;
  // Un GET que devuelve null (ej. "todavia no hay corredor dibujado para
  // esta asociacion") llega con el cuerpo vacio incluso en 200 -- res.json()
  // truena con "Unexpected end of JSON input" sobre texto vacio. Se lee como
  // texto primero para nunca romper una pantalla solo porque el recurso
  // legitimamente no existe todavia.
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export type ManifestPublicVerification = {
  number: string;
  route: RouteDir;
  date: string;
  departureTime: string;
  arrivalTime: string | null;
  code: string;
  plate: string;
  model: string;
  vehicleType: VehicleType;
  capacity: number;
  association: string;
  company: string;
  driver: string;
  passengers: {
    seat: number;
    name: string;
    dni: string;
    origin: string;
    destination: string;
    fare: number;
    paymentMethod: PaymentMethod;
  }[];
};

// Verificacion PUBLICA de un manifiesto (quien escanea el QR de un manifiesto
// impreso puede no tener cuenta ni token) -- por eso NO usa request(), que
// siempre agrega Authorization/organizationId; es un fetch directo y simple.
export async function verifyManifestPublic(token: string): Promise<ManifestPublicVerification | null> {
  const res = await fetch(`${apiUrl()}/manifests-public/verify/${encodeURIComponent(token)}`);
  if (!res.ok) return null;
  return (await res.json()) as ManifestPublicVerification;
}

function formatTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

// La cola de Operacion (frontend) usa 'EN TERMINAL' con espacio por compatibilidad
// con el prototipo de UI original — el backend usa EN_TERMINAL (un enum real).
function mapQueueStatus(status: string): QueueStatus {
  return status === 'EN_TERMINAL' ? 'EN TERMINAL' : (status as QueueStatus);
}
function unmapQueueStatusForAdvance(status: 'LLAMADO' | 'EN TERMINAL' | 'EMBARCANDO' | 'LISTO') {
  return status === 'EN TERMINAL' ? 'EN_TERMINAL' : status;
}

function mapGpsStatus(status: string): Trip['gpsStatus'] {
  if (status === 'GPS_FISICO') return 'GPS_PRO_DEMO';
  if (status === 'REGISTRO_MOVIL') return 'REGISTRO_MOVIL';
  return 'SIN_GPS';
}

// ---------------------------------------------------------------------------
// Formas crudas que devuelve el backend (con relaciones incluidas) — solo lo
// que estos adaptadores necesitan leer, no el modelo Prisma completo.
// ---------------------------------------------------------------------------
interface RawVehicle {
  id: string;
  code: string;
  plate: string;
  model: string;
  year: number;
  status: string;
  routeAssignment: string;
  vehicleType: VehicleType;
  company?: { name: string } | null;
  partner?: { id: string; name: string; dni: string | null; code: string | null } | null;
  currentDriver?: { id: string; name: string } | null;
  plateHistory?: { plate: string; fromDate: string; toDate: string | null }[];
  traccarDeviceId?: string | null;
  simOperator?: string | null;
  simNumber?: string | null;
  gpsVehicularActivo?: boolean;
  gpsVehicularVenceEn?: string | null;
  lastServiceKm?: number | null;
  serviceIntervalKm?: number | null;
  lastServiceAt?: string | null;
}
interface RawPerson {
  id: string;
  name: string;
  dni: string | null;
  phone: string | null;
  email: string;
}
interface RawQueueEntry {
  id: string;
  route: RouteDir;
  position: number;
  status: string;
  evidence: EvidenceType;
  registeredAt: string;
  vehicle: RawVehicle;
  driver: RawPerson;
}
interface RawPassenger {
  id: string;
  name: string;
  dni: string;
  documentType?: string | null;
  seat: number;
  fare: number;
  paymentMethod: PaymentMethod;
  origin: string;
  destination: string;
  email?: string | null;
}
interface RawManifest {
  id: string;
  number: string;
  status: Manifest['status'];
  route: RouteDir;
  date: string;
  departureTime: string;
  arrivalTime: string | null;
  capacity: number;
  version: number;
  correctionReason: string | null;
  pdfGenerated: boolean;
  paperBackup: boolean;
  pendingDigitize: boolean;
  passengers: RawPassenger[];
  vehicle: RawVehicle;
  driver: RawPerson;
  company?: { name: string } | null;
  operator?: RawPerson | null;
  tripId: string | null;
}
interface RawTrip {
  id: string;
  route: RouteDir;
  status: TripStatus;
  scheduledDeparture: string | null;
  actualDeparture: string | null;
  scheduledArrival: string | null;
  actualArrival: string | null;
  gpsStatus: string;
  incidentNote: string | null;
  vehicle: RawVehicle;
  driver: RawPerson;
  manifest?: { id: string } | null;
}

function mapQueueEntry(raw: RawQueueEntry): QueueEntry {
  return {
    id: raw.id,
    position: raw.position,
    code: raw.vehicle?.code ?? '—',
    company: raw.vehicle?.company?.name ?? '',
    vehicleType: raw.vehicle?.vehicleType ?? 'SPRINTER',
    plate: raw.vehicle?.plate ?? '—',
    driverName: raw.driver?.name ?? '',
    partnerName: raw.vehicle?.partner?.name ?? raw.driver?.name ?? '',
    partnerDni: raw.vehicle?.partner?.dni ?? raw.driver?.dni ?? '',
    phone: raw.driver?.phone ?? '',
    registeredAt: formatTime(raw.registeredAt),
    status: mapQueueStatus(raw.status),
    evidence: raw.evidence,
  };
}

function mapPassenger(raw: RawPassenger): Passenger {
  return { id: raw.id, name: raw.name, dni: raw.dni, documentType: (raw.documentType as Passenger['documentType']) ?? 'DNI', seat: raw.seat, fare: raw.fare, paymentMethod: raw.paymentMethod, origin: raw.origin, destination: raw.destination, email: raw.email ?? undefined };
}

function mapManifest(raw: RawManifest): Manifest {
  return {
    id: raw.id,
    number: raw.number,
    status: raw.status,
    route: raw.route,
    code: raw.vehicle?.code ?? '—',
    plate: raw.vehicle?.plate ?? '—',
    vehicleType: raw.vehicle?.vehicleType ?? 'SPRINTER',
    driverName: raw.driver?.name ?? '',
    operator: raw.operator?.email ?? '',
    company: raw.company?.name ?? '',
    date: formatDate(raw.date),
    departureTime: raw.departureTime,
    arrivalTime: raw.arrivalTime ?? undefined,
    passengers: raw.passengers.map(mapPassenger),
    capacity: raw.capacity,
    version: raw.version,
    correctionReason: raw.correctionReason ?? undefined,
    pdfGenerated: raw.pdfGenerated,
    paperBackup: raw.paperBackup,
    pendingDigitize: raw.pendingDigitize,
    tripId: raw.tripId ?? undefined,
  };
}

function mapTrip(raw: RawTrip): Trip {
  return {
    id: raw.id,
    vehicleId: raw.vehicle?.id,
    code: raw.vehicle?.code ?? '—',
    plate: raw.vehicle?.plate ?? '—',
    vehicleType: raw.vehicle?.vehicleType ?? 'SPRINTER',
    driverName: raw.driver?.name ?? '',
    company: raw.vehicle?.company?.name ?? '',
    route: raw.route,
    status: raw.status,
    scheduledDeparture: formatTime(raw.scheduledDeparture) || '—',
    actualDeparture: raw.actualDeparture ? formatTime(raw.actualDeparture) : undefined,
    scheduledArrival: raw.scheduledArrival ? formatTime(raw.scheduledArrival) : undefined,
    actualArrival: raw.actualArrival ? formatTime(raw.actualArrival) : undefined,
    manifestId: raw.manifest?.id,
    gpsStatus: mapGpsStatus(raw.gpsStatus),
    incidentNote: raw.incidentNote ?? undefined,
    scheduledDepartureISO: raw.scheduledDeparture ?? undefined,
    actualDepartureISO: raw.actualDeparture ?? undefined,
    scheduledArrivalISO: raw.scheduledArrival ?? undefined,
    actualArrivalISO: raw.actualArrival ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Colas
// ---------------------------------------------------------------------------
export async function fetchQueue(route: RouteDir): Promise<QueueEntry[]> {
  const raw = await request<RawQueueEntry[]>(`/queues/${route}`);
  return raw.map(mapQueueEntry);
}

// lat/lng: ubicacion del celular al momento de "Inscribirme" (§3.3), chequeo
// puntual (nunca rastreo continuo). Confirma la llegada como parte del mismo
// paso -- ya no existe un boton "Marcar llegada" ni "Confirmar llegada" separados.
export async function joinQueue(route: RouteDir, vehicleId: string, deviceId?: string, isRelocation?: boolean, lat?: number, lng?: number): Promise<void> {
  await request(`/queues/${route}/join`, { method: 'POST', body: JSON.stringify({ vehicleId, deviceId, isRelocation, lat, lng }) });
}

export async function confirmArrival(entryId: string, lat: number, lng: number): Promise<void> {
  await request(`/queues/entries/${entryId}/confirm-arrival`, { method: 'POST', body: JSON.stringify({ lat, lng }) });
}

export async function advanceQueueEntry(entryId: string, toStatus: 'LLAMADO' | 'EN TERMINAL' | 'EMBARCANDO' | 'LISTO'): Promise<void> {
  await request(`/queues/entries/${entryId}/advance`, {
    method: 'POST',
    body: JSON.stringify({ toStatus: unmapQueueStatusForAdvance(toStatus) }),
  });
}

export async function declareLater(entryId: string): Promise<void> {
  await request(`/queues/entries/${entryId}/declare-later`, { method: 'POST' });
}

export async function overrideQueueEntry(entryId: string, action: 'AUSENTE' | 'RETIRADO' | 'REQUEUE', reason: string): Promise<void> {
  await request(`/queues/entries/${entryId}/override`, { method: 'POST', body: JSON.stringify({ action, reason }) });
}

export async function departQueueEntry(entryId: string): Promise<Trip> {
  const raw = await request<RawTrip>(`/queues/entries/${entryId}/depart`, { method: 'POST' });
  return mapTrip(raw);
}

// Prepara el viaje (PROGRAMADO) que necesita el conductor para poder abrir su
// manifiesto antes de salir -- ver plan-flujo-colas-hardware.md §4.
export async function prepareTripForEntry(entryId: string): Promise<Trip> {
  const raw = await request<RawTrip>(`/queues/entries/${entryId}/prepare-trip`, { method: 'POST' });
  return mapTrip(raw);
}

// ---------------------------------------------------------------------------
// Manifiestos
// ---------------------------------------------------------------------------
export async function fetchManifests(): Promise<Manifest[]> {
  const raw = await request<RawManifest[]>('/manifests');
  return raw.map(mapManifest);
}

export async function openManifest(tripId: string, capacity: number): Promise<Manifest> {
  const raw = await request<RawManifest>('/manifests', { method: 'POST', body: JSON.stringify({ tripId, capacity }) });
  return mapManifest(raw);
}

export async function addManifestPassenger(manifestId: string, passenger: Omit<Passenger, 'id'>): Promise<void> {
  await request(`/manifests/${manifestId}/passengers`, { method: 'POST', body: JSON.stringify(passenger) });
}

export async function closeManifest(manifestId: string, arrivalTime?: string, paperBackupConfirmed?: boolean): Promise<Manifest> {
  const raw = await request<RawManifest>(`/manifests/${manifestId}/close`, {
    method: 'POST',
    body: JSON.stringify({ arrivalTime, paperBackupConfirmed }),
  });
  return mapManifest(raw);
}

// IA con vision (ia-aplicada.md §2.2): lee la foto del respaldo en papel y
// devuelve una SUGERENCIA de pasajeros -- no guarda nada, quien llama debe
// revisar/editar y recien despues confirmar con digitizeManifest() arriba.
export interface DigitizeSuggestResult {
  suggested: Omit<Passenger, 'id'>[];
  skipped: number;
  total: number;
}

export async function digitizeSuggest(manifestId: string, imageBase64: string, mediaType: string): Promise<DigitizeSuggestResult> {
  return request<DigitizeSuggestResult>(`/manifests/${manifestId}/digitize-suggest`, {
    method: 'POST',
    body: JSON.stringify({ imageBase64, mediaType }),
  });
}

// ---------------------------------------------------------------------------
// Resumen diario para el gerente (ia-aplicada.md §2.3)
// ---------------------------------------------------------------------------
// Todas las cifras las calcula el backend con Prisma antes de llamar a la IA
// -- `summary` es solo la redaccion en prosa de esos mismos numeros, nunca un
// calculo propio. `summary` puede venir null (Claude no configurado o fallo
// puntual) -- en ese caso el panel se apoya en `facts` directamente.
export interface DailyDigestFacts {
  fecha: string;
  vueltasCompletadasHoy: number;
  viajesEnCurso: number;
  pasajerosTransportadosHoy: number;
  recaudacionHoy: number;
  manifiestosPendientesDeDigitalizar: number;
  inscripcionesRetrasadasResueltasHoy: number;
  inscripcionesRetrasadasPendientesAhora: number;
  incidentesHoy: Array<{ unidad: string; ruta: string; nota: string | null }>;
  // Anomalias de recaudacion (ia-aplicada.md §2.4) -- manifiestos marcados
  // CON_INCIDENCIA hoy por una caida fuerte de ingresos frente al propio
  // historial de esa unidad. Evidencia para revisar, nunca una acusacion.
  anomaliasRecaudacionHoy: Array<{ manifiesto: string; unidad: string; nota: string | null }>;
}

export async function fetchDailyDigest(): Promise<{ facts: DailyDigestFacts; summary: string | null }> {
  return request(`/digest/today`);
}

export async function digitizeManifest(manifestId: string, passengers: Omit<Passenger, 'id'>[]): Promise<Manifest> {
  const raw = await request<RawManifest>(`/manifests/${manifestId}/digitize`, {
    method: 'POST',
    body: JSON.stringify({ passengers }),
  });
  return mapManifest(raw);
}

export async function correctManifest(manifestId: string, reason: string): Promise<Manifest> {
  const raw = await request<RawManifest>(`/manifests/${manifestId}/correct`, { method: 'POST', body: JSON.stringify({ reason }) });
  return mapManifest(raw);
}

// ---------------------------------------------------------------------------
// Viajes
// ---------------------------------------------------------------------------
export async function fetchTrips(params?: { route?: RouteDir; status?: TripStatus }): Promise<Trip[]> {
  const query = new URLSearchParams();
  if (params?.route) query.set('route', params.route);
  if (params?.status) query.set('status', params.status);
  const qs = query.toString();
  const raw = await request<RawTrip[]>(`/trips${qs ? `?${qs}` : ''}`);
  return raw.map(mapTrip);
}

// "Marcar llegada": en Plan Operacion (o una unidad PRO sin hardware
// vinculado todavia) pasa lat/lng del celular; con hardware vinculado, el
// backend lee la posicion real del vehiculo y estos parametros se ignoran.
export async function completeTrip(tripId: string, coords?: { lat: number; lng: number }): Promise<Trip> {
  const raw = await request<RawTrip>(`/trips/${tripId}/complete`, {
    method: 'POST',
    body: JSON.stringify(coords ?? {}),
  });
  return mapTrip(raw);
}

export async function alertTrip(tripId: string, note: string): Promise<Trip> {
  const raw = await request<RawTrip>(`/trips/${tripId}/alert`, { method: 'POST', body: JSON.stringify({ note }) });
  return mapTrip(raw);
}

// "Anular viaje" (admin/superadmin): para un viaje Programado atascado que
// el conductor nunca despacho (se equivoco de unidad/ruta, se arrepintio,
// etc.). Motivo obligatorio, igual que las demas excepciones manuales.
export async function cancelTrip(tripId: string, reason: string): Promise<Trip> {
  const raw = await request<RawTrip>(`/trips/${tripId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
  return mapTrip(raw);
}

export async function resolveTripIncident(tripId: string, resolution: 'ACTIVO' | 'COMPLETADO', reason: string): Promise<Trip> {
  const raw = await request<RawTrip>(`/trips/${tripId}/resolve-incident`, {
    method: 'POST',
    body: JSON.stringify({ resolution, reason }),
  });
  return mapTrip(raw);
}

// ---------------------------------------------------------------------------
// Vehiculos (para el selector "inscribir unidad en cola")
// ---------------------------------------------------------------------------
// organizationId es solo para Super Admin viendo una asociacion puntual desde
// su propio panel (nunca "actuando como" -- ver acting-org.ts) -- cualquier
// otro rol lo ignora en el backend (resolveOrgId siempre usa el suyo propio).
// Las unidades dadas de baja solo se piden desde Unidades y flota (includeRetired);
// en colas, reportes, GPS, conductor y socio nunca deben aparecer.
export async function fetchVehicles(route?: RouteDir, organizationId?: string, includeRetired = false): Promise<Unit[]> {
  const params = new URLSearchParams();
  if (route) params.set('route', route);
  if (organizationId) params.set('organizationId', organizationId);
  const qs = params.toString();
  const raw = await request<RawVehicle[]>(`/vehicles${qs ? `?${qs}` : ''}`);
  return raw.filter((v) => includeRetired || v.status !== 'BAJA').map((v) => ({
    id: v.id,
    code: v.code,
    company: v.company?.name ?? '',
    partnerName: v.partner?.name ?? '',
    partnerDni: v.partner?.dni ?? '',
    partnerCode: v.partner?.code ?? '',
    vehicleType: v.vehicleType,
    plate: v.plate,
    model: v.model,
    year: v.year,
    status: v.status as Unit['status'],
    currentDriverName: v.currentDriver?.name ?? '',
    plateHistory: (v.plateHistory ?? []).map(h => ({ plate: h.plate, from: formatDate(h.fromDate), to: h.toDate ? formatDate(h.toDate) : undefined })),
    route: v.routeAssignment as Unit['route'],
    partnerId: v.partner?.id,
    currentDriverId: v.currentDriver?.id,
    traccarDeviceId: v.traccarDeviceId ?? undefined,
    simOperator: v.simOperator ?? undefined,
    simNumber: v.simNumber ?? undefined,
    gpsVehicularActivo: v.gpsVehicularActivo ?? true,
    gpsVehicularVenceEn: v.gpsVehicularVenceEn ?? null,
    lastServiceKm: v.lastServiceKm ?? undefined,
    serviceIntervalKm: v.serviceIntervalKm ?? undefined,
    lastServiceAt: v.lastServiceAt ?? undefined,
  }));
}

// Mantenimiento predictivo (plan-pro.md §11.1): el administrador define el
// intervalo real de su flota -- nunca un numero inventado por el sistema.
export async function setVehicleMaintenance(vehicleId: string, lastServiceKm?: number, serviceIntervalKm?: number, organizationId?: string): Promise<void> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  await request(`/vehicles/${vehicleId}/maintenance${qs}`, {
    method: 'POST',
    body: JSON.stringify({ lastServiceKm, serviceIntervalKm }),
  });
}

// ─── Flota (Unidades) — panel admin ──────────────────────────────────────────
export interface CompanyOption {
  id: string;
  name: string;
  ruc?: string;
  legalRep?: string;
  phone?: string;
  email?: string;
  status?: 'ACTIVA' | 'OBSERVADA' | 'SUSPENDIDA';
}

interface RawCompany {
  id: string;
  name: string;
  ruc?: string | null;
  legalRep?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string | null;
}

function mapRawCompany(c: RawCompany): CompanyOption {
  return {
    id: c.id,
    name: c.name,
    ruc: c.ruc ?? undefined,
    legalRep: c.legalRep ?? undefined,
    phone: c.phone ?? undefined,
    email: c.email ?? undefined,
    status: (c.status as CompanyOption['status']) ?? undefined,
  };
}

export async function fetchCompanies(organizationId?: string): Promise<CompanyOption[]> {
  const raw = await request<RawCompany[]>(
    organizationId ? `/companies?organizationId=${encodeURIComponent(organizationId)}` : '/companies',
  );
  return raw.map(mapRawCompany);
}

export interface CreateCompanyInput {
  name: string;
  ruc?: string;
  legalRep?: string;
  phone?: string;
  email?: string;
}

// Solo Super Admin puede crear/editar empresas por ahora (el backend lo valida
// igual por rol) -- mismo patron de organizationId explicito que operational-config.
export async function createCompany(input: CreateCompanyInput, organizationId?: string): Promise<CompanyOption> {
  const raw = await request<RawCompany>(
    organizationId ? `/companies?organizationId=${encodeURIComponent(organizationId)}` : '/companies',
    { method: 'POST', body: JSON.stringify(input) },
  );
  return mapRawCompany(raw);
}

// Eliminar empresa (dejo de operar): se oculta en todos los paneles, no se
// borra nada. Solo Super Admin; motivo obligatorio.
export async function deleteCompany(id: string, reason: string, organizationId?: string): Promise<void> {
  await request<RawCompany>(
    organizationId ? `/companies/${id}/delete?organizationId=${encodeURIComponent(organizationId)}` : `/companies/${id}/delete`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export async function restoreCompany(id: string, organizationId?: string): Promise<void> {
  await request<RawCompany>(
    organizationId ? `/companies/${id}/restore?organizationId=${encodeURIComponent(organizationId)}` : `/companies/${id}/restore`,
    { method: 'POST' },
  );
}

export async function updateCompany(
  id: string,
  patch: Partial<CreateCompanyInput> & { status?: CompanyOption['status'] },
  organizationId?: string,
): Promise<CompanyOption> {
  const raw = await request<RawCompany>(
    organizationId ? `/companies/${id}?organizationId=${encodeURIComponent(organizationId)}` : `/companies/${id}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
  return mapRawCompany(raw);
}

export interface CreateVehicleInput {
  // Opcional (MEJ-002): si no se manda, el backend asigna el siguiente
  // correlativo de 3 dígitos de la asociación.
  code?: string;
  companyId: string;
  vehicleType: VehicleType;
  plate: string;
  model: string;
  year: number;
  routeAssignment?: 'JULI_PUNO' | 'PUNO_JULI' | 'AMBAS';
  partnerId?: string;
  currentDriverId?: string;
}

export async function createVehicle(input: CreateVehicleInput): Promise<{ code: string }> {
  const raw = await request<RawVehicle>('/vehicles', { method: 'POST', body: JSON.stringify(input) });
  return { code: raw.code };
}

export async function changeVehicleDriver(vehicleId: string, currentDriverId: string, reason?: string): Promise<void> {
  await request<RawVehicle>(`/vehicles/${vehicleId}/change-driver`, {
    method: 'POST',
    body: JSON.stringify({ currentDriverId, reason }),
  });
}

export async function changeVehiclePartner(vehicleId: string, partnerId: string, reason?: string): Promise<void> {
  await request<RawVehicle>(`/vehicles/${vehicleId}/change-partner`, {
    method: 'POST',
    body: JSON.stringify({ partnerId, reason }),
  });
}

// Dar de baja: la unidad ya no opera (vendida, error de registro). Nada se
// borra y se puede restaurar. Motivo obligatorio.
export async function retireVehicle(vehicleId: string, reason: string): Promise<void> {
  await request<RawVehicle>(`/vehicles/${vehicleId}/retire`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export interface RetireVehiclesResult {
  retired: string[];
  failed: { code: string; message: string }[];
}

// Baja de varias unidades con un solo motivo; las que no se puedan vienen en `failed`.
export async function retireVehicles(ids: string[], reason: string): Promise<RetireVehiclesResult> {
  return request<RetireVehiclesResult>('/vehicles/retire-bulk', {
    method: 'POST',
    body: JSON.stringify({ ids, reason }),
  });
}

export async function restoreVehicle(vehicleId: string): Promise<void> {
  await request<RawVehicle>(`/vehicles/${vehicleId}/restore`, { method: 'POST' });
}

export async function deactivateVehicle(vehicleId: string, reason: string): Promise<void> {
  await request<RawVehicle>(`/vehicles/${vehicleId}/deactivate`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/**
 * Vincula (o, con cadena vacia, desvincula) el dispositivo GPS real (Traccar)
 * de la unidad. Solo Super Admin -- ver comentario en vehicles.controller.ts
 * sobre por que el IMEI nunca lo define el admin de la asociacion.
 * organizationId es obligatorio para Super Admin viendo una asociacion
 * puntual desde su propio panel (nunca tiene organizationId propio).
 */
export async function setVehicleGpsDevice(
  vehicleId: string,
  traccarDeviceId: string,
  organizationId?: string,
  simOperator?: string,
  simNumber?: string,
): Promise<void> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  await request<RawVehicle>(`/vehicles/${vehicleId}/gps-device${qs}`, {
    method: 'POST',
    body: JSON.stringify({ traccarDeviceId, simOperator, simNumber }),
  });
}

/**
 * Prende/apaga el Plan GPS Vehicular individual de la unidad (13 sept 2026)
 * -- nunca toca el IMEI/traccarDeviceId, solo si el socio pago el servicio.
 * Solo Super Admin, motivo obligatorio (mismo criterio que gps-device).
 */
export async function setVehicleGpsVehicularPlan(
  vehicleId: string,
  activo: boolean,
  reason: string,
  organizationId?: string,
  venceEn?: string | null,
): Promise<void> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  await request<RawVehicle>(`/vehicles/${vehicleId}/gps-vehicular-plan${qs}`, {
    method: 'POST',
    body: JSON.stringify({ activo, reason, venceEn }),
  });
}


// ─── Personas (cuentas reales: Administrador / Socio / Conductor) ────────────
// Alta de cuentas real, contra backend/src/people. Un mismo correo puede tener
// hasta 2 cuentas (una Socio, una Conductor) — nunca dos con el mismo rol; el
// backend valida ese duplicado y responde con error si ya existe.
export interface CreatePersonInput {
  name: string;
  email: string;
  role: 'ADMINISTRADOR' | 'SOCIO' | 'CONDUCTOR';
  documentType?: 'DNI' | 'CE';
  dni?: string;
  phone?: string;
  code?: string;
  company?: string;
  // Solo para CONDUCTOR: licencia "Q12345678", categoria y vencimiento "AAAA-MM-DD".
  license?: string;
  licenseCategory?: string;
  licenseIssuedAt?: string;
  licenseExpiry?: string;
}

export async function fetchPeople(organizationId?: string): Promise<Person[]> {
  return request<Person[]>(organizationId ? `/people?organizationId=${encodeURIComponent(organizationId)}` : '/people');
}

// Autoservicio (people.controller.ts GET /people/me): a diferencia de
// fetchPeople(), esto lo puede llamar CUALQUIER rol autenticado -- devuelve
// solo el propio registro (dni, telefono, licencia, etc.), nunca el
// directorio completo de la asociacion. Socio/Conductor deben usar esto para
// leer su propio perfil, nunca fetchPeople().
export async function fetchMyPersonProfile(): Promise<Person> {
  return request<Person>('/people/me');
}

// "Mi cuenta": la persona corrige SUS datos (nunca correo, rol ni asociacion).
export interface UpdateMyProfileInput {
  name?: string;
  documentType?: 'DNI' | 'CE';
  dni?: string;
  phone?: string;
  license?: string;
  licenseCategory?: string;
  licenseIssuedAt?: string;
  licenseExpiry?: string;
}

export async function updateMyProfile(input: UpdateMyProfileInput): Promise<Person> {
  return request<Person>('/people/me', { method: 'PATCH', body: JSON.stringify(input) });
}

export async function createPerson(input: CreatePersonInput, organizationId?: string): Promise<Person> {
  return request<Person>(
    organizationId ? `/people?organizationId=${encodeURIComponent(organizationId)}` : '/people',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

// Registrar o corregir la licencia de un conductor que ya existe.
export async function updatePersonLicense(
  personId: string,
  data: { license: string; licenseCategory: string; licenseIssuedAt: string; licenseExpiry: string },
  organizationId?: string,
): Promise<Person> {
  return request<Person>(
    organizationId ? `/people/${personId}/license?organizationId=${encodeURIComponent(organizationId)}` : `/people/${personId}/license`,
    { method: 'POST', body: JSON.stringify(data) },
  );
}

// Eliminar una cuenta (baja definitiva; el historial se conserva). Motivo obligatorio.
export async function deletePerson(personId: string, reason: string, organizationId?: string): Promise<void> {
  await request<{ ok: boolean }>(
    organizationId ? `/people/${personId}/delete?organizationId=${encodeURIComponent(organizationId)}` : `/people/${personId}/delete`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export async function updatePersonStatus(personId: string, status: 'ACTIVO' | 'SUSPENDIDO', reason?: string, organizationId?: string): Promise<Person> {
  return request<Person>(
    organizationId ? `/people/${personId}/status?organizationId=${encodeURIComponent(organizationId)}` : `/people/${personId}/status`,
    { method: 'POST', body: JSON.stringify({ status, reason }) },
  );
}

// Excepcion 2 (plan-operacion.md §3.2): el administrador libera la vinculacion
// cuenta-dispositivo de un conductor/socio -- equipo perdido, robado o cambiado.
export async function resetPersonDevice(personId: string, reason?: string, organizationId?: string): Promise<Person> {
  return request<Person>(
    organizationId ? `/people/${personId}/reset-device?organizationId=${encodeURIComponent(organizationId)}` : `/people/${personId}/reset-device`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

// ─── Organizaciones (panel Super Admin) ──────────────────────────────────────
export interface Organization {
  id: string;
  name: string;
  ruc: string;
  logoUrl?: string | null;
  status: 'EN_CONFIGURACION' | 'ACTIVA' | 'SUSPENDIDA';
  plan: 'OPERACION' | 'PRO';
  driverLiveMapEnabled: boolean;
  whatsappAssistantEnabled: boolean;
  // Dias de gracia del Plan GPS Vehicular al bajar de PRO a Operacion (13
  // sept 2026) -- editable por Super Admin en el tab "Plan GPS Vehicular".
  gpsVehicularGraceDays: number;
  createdAt: string;
  // Datos institucionales (paso 0 del wizard "Nueva asociacion"). El correo
  // institucional (contactEmail) es distinto del correo del gerente -- ese
  // vive en Person y se ve/gestiona desde Personas.
  city?: string | null;
  legalRepName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  // Corredor PROPIO de esta asociacion (nunca compartido con otras) -- nombre
  // de los dos terminales de su ruta de ida/vuelta. Siempre presentes (el
  // backend aplica 'Juli'/'Puno' como default si la asociacion aun no
  // configuro los suyos).
  terminalOriginName: string;
  terminalDestinationName: string;
  // Nombres de las rutas habilitadas (distintos del nombre del terminal); si
  // vienen vacios se usa el nombre del terminal.
  routeOriginName?: string | null;
  routeDestinationName?: string | null;
}

export interface CreateOrganizationInput {
  name: string;
  ruc: string;
  adminEmail: string;
  adminName: string;
  plan?: 'OPERACION' | 'PRO';
  driverLiveMapEnabled?: boolean;
  logoUrl?: string;
  city?: string;
  legalRepName?: string;
  contactPhone?: string;
  contactEmail?: string;
  terminalOriginName?: string;
  terminalOriginAddress?: string;
  terminalDestinationName?: string;
  terminalDestinationAddress?: string;
  routeOriginName?: string;
  routeDestinationName?: string;
}

export async function fetchOrganizations(): Promise<Organization[]> {
  return request<Organization[]>('/organizations');
}

export async function fetchMyOrganization(): Promise<Organization | null> {
  return request<Organization | null>('/organizations/me');
}

// Directorio publico de otras asociaciones ACTIVAS (solo nombre y RUC) — visible
// para cualquier cuenta autenticada, se usa en la pantalla de bienvenida post-login.
export interface OrganizationDirectoryEntry {
  id: string;
  name: string;
  ruc: string;
  logoUrl?: string | null;
  terminalOriginName: string;
  terminalDestinationName: string;
  terminalOriginAddress?: string | null;
  terminalDestinationAddress?: string | null;
  routeOriginName?: string | null;
  routeDestinationName?: string | null;
}

// ─── Etiquetas de ruta/terminal por asociacion ──────────────────────────────
// Cada asociacion tiene su propio corredor (terminalOriginName/terminalDestinationName).
// JULI_PUNO/PUNO_JULI y JULI/PUNO siguen siendo solo CODIGOS INTERNOS de
// direccion ('ruta de ida'/'ruta de vuelta', 'terminal de origen'/'terminal de
// destino') -- estas funciones son el UNICO lugar que debe traducirlos a texto,
// para no volver a repetir "Juli"/"Puno" a mano en cada pantalla.
type CorridorNames = Pick<Organization, 'terminalOriginName' | 'terminalDestinationName' | 'routeOriginName' | 'routeDestinationName'> | null | undefined;

function names(org: CorridorNames): { origin: string; destination: string } {
  return {
    origin: org?.routeOriginName?.trim() || org?.terminalOriginName?.trim() || 'Juli',
    destination: org?.routeDestinationName?.trim() || org?.terminalDestinationName?.trim() || 'Puno',
  };
}

/** "Puno → Juliaca" / "Juliaca → Puno" (o "Ambas rutas" si viene 'AMBAS'). */
export function routeLabel(route: RouteDir | 'AMBAS', org: CorridorNames): string {
  const { origin, destination } = names(org);
  if (route === 'AMBAS') return 'Ambas rutas';
  return route === 'JULI_PUNO' ? `${origin} → ${destination}` : `${destination} → ${origin}`;
}

/** Version corta para tablas angostas: "P→J" a partir de las iniciales reales. */
export function routeLabelShort(route: RouteDir, org: CorridorNames): string {
  const { origin, destination } = names(org);
  const o = origin.charAt(0).toUpperCase();
  const d = destination.charAt(0).toUpperCase();
  return route === 'JULI_PUNO' ? `${o}→${d}` : `${d}→${o}`;
}

/** Nombre de un solo terminal ('JULI' = terminal de origen, 'PUNO' = terminal de destino). */
export function terminalName(terminal: 'JULI' | 'PUNO', org: CorridorNames): string {
  const { origin, destination } = names(org);
  return terminal === 'JULI' ? origin : destination;
}

export async function fetchOrganizationsDirectory(): Promise<OrganizationDirectoryEntry[]> {
  return request<OrganizationDirectoryEntry[]>('/organizations/directory');
}

export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  return request<Organization>('/organizations', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateOrganization(id: string, patch: { name?: string; ruc?: string; city?: string; legalRepName?: string; contactPhone?: string; contactEmail?: string; driverLiveMapEnabled?: boolean; status?: Organization['status']; logoUrl?: string; plan?: Organization['plan']; reason?: string; gpsVehicularGraceDays?: number }): Promise<Organization> {
  return request<Organization>(`/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

// Eliminar una asociacion completa: es una baja, no un borrado -- el historial
// se conserva. Solo Super Admin; motivo obligatorio.
export async function deleteOrganization(id: string, reason: string): Promise<void> {
  await request<{ ok: boolean }>(`/organizations/${id}/delete`, { method: 'POST', body: JSON.stringify({ reason }) });
}

/**
 * Sube una imagen (la que el usuario elige con "Adjuntar imagen") a Cloudinary
 * a traves del backend y devuelve la URL final ya optimizada (formato/calidad
 * automaticos). Nunca se guarda la imagen en base64: solo esta URL corta.
 * `folder` agrupa el asset en Cloudinary, p. ej. 'logos', 'wallets'.
 */
export async function uploadImage(dataUrl: string, folder: string): Promise<{ url: string; publicId: string }> {
  return request<{ url: string; publicId: string }>('/uploads/image', {
    method: 'POST',
    body: JSON.stringify({ dataUrl, folder }),
  });
}

// ─── Asistente conversacional ("{Asociacion} AI", plan-pro.md #6) ───────────
export interface AssistantChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantChatResponse {
  reply: string;
  assistantName: string;
}

/**
 * Envia un mensaje al asistente del panel admin. `history` es la conversacion
 * previa (el backend no guarda memoria entre requests): se manda completa cada
 * vez para que el asistente pueda seguir el hilo ("y el otro vehiculo?").
 */
export async function sendAssistantMessage(message: string, history: AssistantChatTurn[]): Promise<AssistantChatResponse> {
  return request<AssistantChatResponse>('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history }),
  });
}

// ─── GPS en vivo (GPS PRO / GPS Vehicular, plan-gps-vehicular.md) ───────────
export interface LiveVehiclePosition {
  vehicleId: string;
  code: string;
  companyName: string;
  lat: number;
  lng: number;
  speedKmh: number;
  course: number;
  lastUpdate: string;
  route: 'JULI_PUNO' | 'PUNO_JULI' | null;
  traccarStatus: string;
  // null = el equipo todavia no reporta ese dato (firmware sin ese I/O
  // habilitado) -- nunca se muestra un valor inventado en su lugar.
  ignition: boolean | null;
  motion: boolean | null;
  powerVoltage: number | null;
  batteryVoltage: number | null;
  signal: number | null;
  odometerKm: number | null;
  panicAlarm: boolean;
}

/**
 * Posiciones en vivo de las unidades que ya tienen un dispositivo Traccar real
 * vinculado. Nunca incluye una unidad sin senal real (el backend lo garantiza).
 * Solo Plan PRO -- el backend rechaza la llamada si la asociacion esta en
 * Operacion (salvo Super Admin).
 */
export async function fetchGpsLive(organizationId?: string): Promise<LiveVehiclePosition[]> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  return request<LiveVehiclePosition[]>(`/gps/live${qs}`);
}

// Fila de la pantalla "Dispositivos GPS" (solo lectura) -- a diferencia de
// fetchGpsLive(), incluye TODAS las unidades (con o sin dispositivo vinculado,
// con o sin senal), para que el admin vea el estado real de su flota.
export interface VehicleGpsStatus {
  vehicleId: string;
  code: string;
  plate: string;
  companyName: string;
  traccarDeviceId: string | null;
  linked: boolean;
  online: 'online' | 'offline' | 'unknown' | null;
  lastUpdate: string | null;
}

export async function fetchGpsDevices(organizationId?: string): Promise<VehicleGpsStatus[]> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  return request<VehicleGpsStatus[]>(`/gps/devices${qs}`);
}

export type GpsAlertType = 'DESCONEXION' | 'MOVIMIENTO_SIN_VIAJE' | 'CORTE_ENERGIA' | 'POSIBLE_REMOLQUE' | 'BOTON_PANICO' | 'FALLA_REPORTADA' | 'POSIBLE_ACCIDENTE' | 'FUERA_DE_RUTA';
export type GpsAlertStatus = 'NUEVA' | 'EN_REVISION' | 'REVISADA' | 'DESCARTADA';

interface RawGpsAlert {
  id: string;
  type: GpsAlertType;
  status: GpsAlertStatus;
  description: string;
  detectedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  vehicle: { code: string; plate: string; currentDriver: { name: string } | null };
}

export interface GpsAlert {
  id: string;
  type: GpsAlertType;
  status: GpsAlertStatus;
  description: string;
  detectedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  unitCode: string;
  plate: string;
  driver: string;
}

// Alertas GPS (docs/planes/ia-aplicada.md §1): el sistema solo marca
// evidencia, el administrador revisa. Deteccion automatica real por cron
// (backend/src/gps-alerts) -- nunca una alerta inventada en el frontend.
export async function fetchGpsAlerts(organizationId?: string): Promise<GpsAlert[]> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  const raw = await request<RawGpsAlert[]>(`/gps-alerts${qs}`);
  return raw.map((a) => ({
    id: a.id,
    type: a.type,
    status: a.status,
    description: a.description,
    detectedAt: a.detectedAt,
    reviewedAt: a.reviewedAt ?? undefined,
    reviewedBy: a.reviewedBy ?? undefined,
    reviewNote: a.reviewNote ?? undefined,
    unitCode: a.vehicle.code,
    plate: a.vehicle.plate,
    driver: a.vehicle.currentDriver?.name ?? 'Sin conductor',
  }));
}

// Resumen de Super Admin (12 sept 2026): alertas graves abiertas en
// asociaciones SIN Plan PRO -- mismo criterio que decide el correo a Super
// Admin (ver notifySuperAdminIfNoPro en el backend). El Administrador de
// esas asociaciones nunca ve estas alertas, por eso Super Admin necesita su
// propia vista consolidada.
export interface SuperAdminUrgentAlert {
  id: string;
  type: GpsAlertType;
  status: GpsAlertStatus;
  description: string;
  detectedAt: string;
  vehicleCode: string;
  vehiclePlate: string;
  organizationId: string;
  organizationName: string;
}

interface RawSuperAdminUrgentAlert {
  id: string;
  type: GpsAlertType;
  status: GpsAlertStatus;
  description: string;
  detectedAt: string;
  vehicle: { code: string; plate: string };
  organization: { id: string; name: string };
}

export async function fetchSuperAdminUrgentGpsAlerts(): Promise<SuperAdminUrgentAlert[]> {
  const raw = await request<RawSuperAdminUrgentAlert[]>('/gps-alerts/superadmin-urgent');
  return raw.map(a => ({
    id: a.id,
    type: a.type,
    status: a.status,
    description: a.description,
    detectedAt: a.detectedAt,
    vehicleCode: a.vehicle.code,
    vehiclePlate: a.vehicle.plate,
    organizationId: a.organization.id,
    organizationName: a.organization.name,
  }));
}

export async function updateGpsAlertStatus(id: string, status: Exclude<GpsAlertStatus, 'NUEVA'>, note?: string, organizationId?: string): Promise<void> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  await request<RawGpsAlert>(`/gps-alerts/${id}${qs}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note }),
  });
}

// "Reportar falla GPS" / "Reportar emergencia" (12 sept 2026) -- antes eran
// botones decorativos, ahora crean una GpsAlert real sobre la propia unidad
// del conductor/socio (visible al toque en el banner y en "Alertas GPS").
export async function reportGpsAlert(type: 'BOTON_PANICO' | 'FALLA_REPORTADA', note?: string): Promise<void> {
  await request('/gps-alerts/report', {
    method: 'POST',
    body: JSON.stringify({ type, note }),
  });
}

export interface GpsHistoryPoint {
  lat: number;
  lng: number;
  speedKmh: number;
  course: number;
  motion: boolean;
  fixTime: string;
}

// Historial GPS (docs/planes/plan-gps-vehicular.md): serie real de fixes de
// UNA unidad entre dos fechas, via Traccar -- nunca una posicion inventada.
export async function fetchGpsHistory(vehicleId: string, fromISO: string, toISO: string): Promise<GpsHistoryPoint[]> {
  return request<GpsHistoryPoint[]>(`/gps/history?vehicleId=${encodeURIComponent(vehicleId)}&from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`);
}

// ─── Mapa de riesgo de ruta (docs/planes/ia-aplicada.md §3.2, version basica) ─
// Cada punto agrega frenadas bruscas y paradas anomalas detectadas en el
// historial GPS real de la flota, agrupadas por celda de mapa -- nunca
// eventos inventados, solo lo que Traccar reporto de verdad. Depende del
// mismo Plan PRO que el GPS en vivo (hardware real vinculado).
export interface RouteRiskPoint {
  lat: number;
  lng: number;
  totalEvents: number;
  harshBrakingCount: number;
  anomalousStopCount: number;
  lastSeen: string;
}

export interface RouteRiskResult {
  points: RouteRiskPoint[];
  vehiclesAnalyzed: number;
  windowDays: number;
}

export async function fetchRouteRisk(days = 30): Promise<RouteRiskResult> {
  return request<RouteRiskResult>(`/route-risk?days=${days}`);
}

// ─── Reportes de flota (plan-pro.md §11, PENDIENTE DE DECISIÓN hasta el 12
// sept 2026) — 11.3 sugerencia de reubicación y 11.4 eficiencia usan datos
// de cola/viajes que ya existen, no dependen de hardware GPS. ──────────────
export interface HourlyQueueTerminal {
  route: RouteDir;
  currentCount: number;
  historicalAverageThisHour: number;
}
export interface HourlyQueuePattern {
  hour: number;
  windowDays: number;
  terminals: HourlyQueueTerminal[];
  suggestedRelocation: { from: RouteDir; to: RouteDir; units: number } | null;
}
export async function fetchHourlyQueuePattern(days = 30): Promise<HourlyQueuePattern> {
  return request<HourlyQueuePattern>(`/fleet-reports/hourly-queue?days=${days}`);
}

export interface TurnaroundByCompany {
  companyId: string;
  companyName: string;
  tripCount: number;
  averageMinutes: number;
}
export interface TurnaroundEfficiency {
  windowDays: number;
  corridorAverageMinutes: number | null;
  companies: TurnaroundByCompany[];
}
export async function fetchTurnaroundEfficiency(days = 30): Promise<TurnaroundEfficiency> {
  return request<TurnaroundEfficiency>(`/fleet-reports/turnaround?days=${days}`);
}

// 11.2: SOLO conteo crudo de eventos de frenada brusca por conductor —
// deliberadamente sin ningún puntaje ni ranking todavía (ver backend).
export interface DriverEventCount {
  driverId: string;
  driverName: string;
  harshBrakingCount: number;
}
export interface DrivingEventsResult {
  windowDays: number;
  drivers: DriverEventCount[];
}
export async function fetchDrivingEventCounts(days = 30): Promise<DrivingEventsResult> {
  return request<DrivingEventsResult>(`/fleet-reports/driving-events?days=${days}`);
}

// ─── Bloqueo remoto de motor (12 sept 2026, decidido con Jayde) ─────────────
// Socio SOLICITA su propia unidad, Super Admin CONFIRMA/CANCELA/RESTAURA --
// el Administrador de la asociación nunca tiene acceso a esto (ver
// backend/src/engine-lock).
export type EngineLockStatus = 'SOLICITADO' | 'CONFIRMADO' | 'EJECUTADO' | 'CANCELADO' | 'RESTAURADO';

export interface EngineLockRequest {
  id: string;
  vehicleId: string;
  status: EngineLockStatus;
  requestReason: string;
  confirmedAt?: string | null;
  executedAt?: string | null;
  restoredAt?: string | null;
  restoreReason?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  vehicle: { code: string; plate: string };
}

export async function fetchEngineLockRequests(organizationId?: string): Promise<EngineLockRequest[]> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  return request<EngineLockRequest[]>(`/engine-lock${qs}`);
}

export async function requestEngineLock(vehicleId: string, reason: string): Promise<EngineLockRequest> {
  return request<EngineLockRequest>(`/engine-lock/vehicles/${vehicleId}`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// Bloqueo directo por Super Admin (12 sept 2026): para cuando el socio llama
// por teléfono en vez de solicitarlo digitalmente -- el motivo sigue siendo
// obligatorio. Crea la solicitud y la confirma/ejecuta en el mismo paso.
export async function requestEngineLockDirect(vehicleId: string, reason: string, organizationId?: string): Promise<EngineLockRequest> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  return request<EngineLockRequest>(`/engine-lock/vehicles/${vehicleId}/direct${qs}`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function confirmEngineLock(requestId: string, organizationId?: string): Promise<EngineLockRequest> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  return request<EngineLockRequest>(`/engine-lock/${requestId}/confirm${qs}`, { method: 'POST' });
}

export async function cancelEngineLock(requestId: string, reason: string, organizationId?: string): Promise<EngineLockRequest> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  return request<EngineLockRequest>(`/engine-lock/${requestId}/cancel${qs}`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function restoreEngineLock(requestId: string, reason: string, organizationId?: string): Promise<EngineLockRequest> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  return request<EngineLockRequest>(`/engine-lock/${requestId}/restore${qs}`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// Cross-organización, solo Super Admin (12 sept 2026): para mostrar un badge
// en la lista de Asociaciones sin tener que entrar a cada una a revisar.
export async function fetchEngineLockPendingSummary(): Promise<{ organizationId: string; pendingCount: number }[]> {
  return request(`/engine-lock/pending-summary`);
}

// ─── CRM de pasajeros por asociación (12 sept 2026, decidido con Jayde) ────
// Perfil agregado por DNI dentro de cada asociación -- alimentado en cada
// manifiesto real (ManifestsService.recordPassengerAndNotify), nunca
// inventado. Solo Super Admin lo consulta.
export interface PassengerProfile {
  id: string;
  dni: string;
  name: string;
  email: string | null;
  tripCount: number;
  lastTripAt: string | null;
  createdAt: string;
}

export async function fetchPassengerProfiles(organizationId: string): Promise<PassengerProfile[]> {
  return request<PassengerProfile[]>(`/passenger-profiles?organizationId=${encodeURIComponent(organizationId)}`);
}

// Dashboard de pasajeros (12 sept 2026, decidido con Jayde) -- todo calculado
// en el backend a partir de manifiestos y perfiles reales, nunca inventado.
export interface PassengerDashboard {
  totals: { uniquePassengers: number; recurrentPassengers: number; withEmail: number; totalTripRows: number };
  topByTrips: { dni: string; name: string; tripCount: number; email: string | null }[];
  topByRevenue: { dni: string; name: string; totalFare: number }[];
  paymentMethods: { method: PaymentMethod; count: number; totalFare: number }[];
  directions: { label: string; count: number }[];
  monthly: { month: string; newCount: number; recurrentCount: number }[];
  emailCaptureByMonth: { month: string; pct: number }[];
  avgDaysBetweenTrips: number | null;
}

export async function fetchPassengerDashboard(organizationId: string): Promise<PassengerDashboard> {
  return request<PassengerDashboard>(`/passenger-profiles/dashboard?organizationId=${encodeURIComponent(organizationId)}`);
}

// ─── Corredor autorizado (geocerca, 12 sept 2026) ───────────────────────────
// Poligono dibujado A MANO por el administrador sobre el mapa real -- nunca
// generado por el sistema. Cualquier rol lee (para mostrarlo); solo
// Administrador/Super Admin lo guarda.
export interface GeofencePoint {
  lat: number;
  lng: number;
}
export interface RouteGeofence {
  id: string;
  points: GeofencePoint[];
  updatedAt: string;
}
export async function fetchRouteGeofence(organizationId?: string): Promise<RouteGeofence | null> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  return request<RouteGeofence | null>(`/route-geofence${qs}`);
}
export async function saveRouteGeofence(points: GeofencePoint[], organizationId?: string): Promise<RouteGeofence> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  return request<RouteGeofence>(`/route-geofence${qs}`, {
    method: 'PUT',
    body: JSON.stringify({ points }),
  });
}

// ─── Auditoria (solo lectura) ────────────────────────────────────────────────
interface RawAuditEntry {
  id: string;
  actor?: { name: string } | null;
  actorRole: string;
  action: string;
  resource: string;
  resourceId: string;
  before?: string | null;
  after?: string | null;
  reason?: string | null;
  evidence?: string | null;
  createdAt: string;
}

export async function fetchAudit(): Promise<AuditEntry[]> {
  const raw = await request<RawAuditEntry[]>('/audit');
  return raw.map((a) => ({
    id: a.id,
    actor: a.actor?.name ?? 'Sistema',
    actorRole: a.actorRole,
    org: '',
    action: a.action,
    resource: a.resource,
    resourceId: a.resourceId,
    timestamp: a.createdAt,
    before: a.before ?? undefined,
    after: a.after ?? undefined,
    reason: a.reason ?? undefined,
    evidence: a.evidence ?? undefined,
  }));
}

interface RawGlobalAuditEntry extends RawAuditEntry {
  organization?: { name: string } | null;
}

// Panel SaaS de Super Admin: auditoria de todas las asociaciones a la vez.
export async function fetchGlobalAudit(): Promise<AuditEntry[]> {
  const raw = await request<RawGlobalAuditEntry[]>('/audit/all');
  return raw.map((a) => ({
    id: a.id,
    actor: a.actor?.name ?? 'Sistema',
    actorRole: a.actorRole,
    org: a.organization?.name ?? '',
    action: a.action,
    resource: a.resource,
    resourceId: a.resourceId,
    timestamp: a.createdAt,
    before: a.before ?? undefined,
    after: a.after ?? undefined,
    reason: a.reason ?? undefined,
    evidence: a.evidence ?? undefined,
  }));
}

// ─── Configuracion operacional (parametros antifraude) ───────────────────────
// Espejo exacto del modelo OperationalConfig de Prisma (schema.prisma) -- los
// nombres de campo tienen que calzar uno a uno con lo que el backend
// realmente devuelve, si no los valores llegan undefined en silencio (asi
// fallaba antes el centrado del mapa: el tipo aqui tenia nombres que el
// backend nunca mandaba).
export interface OperationalConfig {
  minTripMinutesOutbound: number;
  minTripMinutesReturn: number;
  gpsRadiusMeters: number;
  timeoutMinutes: number;
  anomalySpeedThresholdKmh: number;
  // Nombres genericos (no "Juli"/"Puno" fijos) -- cada asociacion define su
  // propio corredor.
  terminalOriginName: string;
  terminalOriginAddress: string | null;
  terminalDestinationName: string;
  terminalDestinationAddress: string | null;
  routeOriginName: string | null;
  routeDestinationName: string | null;
  terminalOriginLat: number;
  terminalOriginLng: number;
  terminalDestinationLat: number;
  terminalDestinationLng: number;
  initialConfigNotes: string | null;
}

export async function fetchOperationalConfig(organizationId?: string): Promise<OperationalConfig> {
  return request<OperationalConfig>(organizationId ? `/operational-config?organizationId=${encodeURIComponent(organizationId)}` : '/operational-config');
}

// Solo Super Admin puede llamar esto (el backend lo valida igual por rol).
// organizationId explicito: para cuando Super Admin edita una asociacion
// puntual desde Asociaciones sin haber entrado "como administrador" (ver
// withActingOrg, mas arriba en este archivo).
export async function updateOperationalConfig(patch: Partial<OperationalConfig>, organizationId?: string): Promise<OperationalConfig> {
  return request<OperationalConfig>(
    organizationId ? `/operational-config?organizationId=${encodeURIComponent(organizationId)}` : '/operational-config',
    { method: 'POST', body: JSON.stringify(patch) },
  );
}

// ─── Rutas de operacion (adicionales a ida/vuelta, que ya viven en los terminales) ──
export interface Route {
  id: string;
  origin: string;
  destination: string;
}

export async function fetchRoutes(organizationId?: string): Promise<Route[]> {
  return request<Route[]>(organizationId ? `/routes?organizationId=${encodeURIComponent(organizationId)}` : '/routes');
}

export async function createRoute(input: { origin: string; destination: string }, organizationId?: string): Promise<Route> {
  return request<Route>(
    organizationId ? `/routes?organizationId=${encodeURIComponent(organizationId)}` : '/routes',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function deleteRoute(id: string, organizationId?: string): Promise<void> {
  await request<{ ok: boolean }>(
    organizationId ? `/routes/${id}?organizationId=${encodeURIComponent(organizationId)}` : `/routes/${id}`,
    { method: 'DELETE' },
  );
}

// ─── Reubicaciones ────────────────────────────────────────────────────────────
interface RawRelocationUnit {
  vehicleId: string;
  accepted: boolean;
  vehicle: RawVehicle & { currentDriver?: { name: string } | null };
}
interface RawRelocationOrder {
  id: string;
  status: string;
  fromTerminal: 'JULI' | 'PUNO';
  toTerminal: 'JULI' | 'PUNO';
  reason: string;
  windowLabel: string;
  compensation: string;
  internalOrder: string;
  confirmedBy?: { name: string } | null;
  units: RawRelocationUnit[];
  createdAt: string;
  updatedAt: string;
}

function mapRelocationOrder(raw: RawRelocationOrder): RelocationOrder {
  return {
    id: raw.id,
    status: raw.status as RelocationStatus,
    fromTerminal: raw.fromTerminal,
    toTerminal: raw.toTerminal,
    reason: raw.reason,
    units: raw.units.map((u) => ({
      code: u.vehicle.code,
      plate: u.vehicle.plate,
      driverName: u.vehicle.currentDriver?.name ?? 'Sin conductor',
      accepted: u.accepted,
      vehicleId: u.vehicleId,
    })),
    window: raw.windowLabel,
    compensation: raw.compensation,
    internalOrder: raw.internalOrder,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    confirmedBy: raw.confirmedBy?.name,
  };
}

export async function fetchRelocations(): Promise<RelocationOrder[]> {
  const raw = await request<RawRelocationOrder[]>('/relocations');
  return raw.map(mapRelocationOrder);
}

export interface CreateRelocationInput {
  fromTerminal: 'JULI' | 'PUNO';
  toTerminal: 'JULI' | 'PUNO';
  reason: string;
  windowLabel: string;
  compensation: string;
  vehicleIds: string[];
}

export async function createRelocation(input: CreateRelocationInput): Promise<RelocationOrder> {
  const raw = await request<RawRelocationOrder>('/relocations', { method: 'POST', body: JSON.stringify(input) });
  return mapRelocationOrder(raw);
}

export async function authorizeRelocation(id: string): Promise<RelocationOrder> {
  const raw = await request<RawRelocationOrder>(`/relocations/${id}/authorize`, { method: 'POST' });
  return mapRelocationOrder(raw);
}

export async function acceptRelocationUnit(id: string, vehicleId: string): Promise<RelocationOrder> {
  const raw = await request<RawRelocationOrder>(`/relocations/${id}/units/${vehicleId}/accept`, { method: 'POST' });
  return mapRelocationOrder(raw);
}

export async function startRelocation(id: string): Promise<RelocationOrder> {
  const raw = await request<RawRelocationOrder>(`/relocations/${id}/start`, { method: 'POST' });
  return mapRelocationOrder(raw);
}

export async function completeRelocation(id: string): Promise<RelocationOrder> {
  const raw = await request<RawRelocationOrder>(`/relocations/${id}/complete`, { method: 'POST' });
  return mapRelocationOrder(raw);
}

// ─── Inscripcion retrasada (Excepcion 3) ───────────────────────────────────────
interface RawDelayedRegistrationRequest {
  id: string;
  route: RouteDir;
  status: DelayedRegistrationStatus;
  resolution: DelayedRegistrationResolution | null;
  requestingVehicle: RawVehicle & { currentDriver?: { name: string } | null };
  blockedByVehicle?: (RawVehicle & { currentDriver?: { name: string } | null }) | null;
  resolvedBy?: { name: string } | null;
  createdAt: string;
  resolvedAt: string | null;
}

function mapDelayedRegistrationRequest(raw: RawDelayedRegistrationRequest): DelayedRegistrationRequest {
  return {
    id: raw.id,
    route: raw.route,
    status: raw.status,
    resolution: raw.resolution,
    requestingVehicleCode: raw.requestingVehicle.code,
    requestingDriverName: raw.requestingVehicle.currentDriver?.name ?? 'Sin conductor',
    blockedByVehicleCode: raw.blockedByVehicle?.code ?? null,
    resolvedByName: raw.resolvedBy?.name ?? null,
    createdAt: raw.createdAt,
    resolvedAt: raw.resolvedAt,
  };
}

// El propio conductor bloqueado avisa al administrador.
export async function createDelayedRegistrationRequest(route: RouteDir): Promise<DelayedRegistrationRequest> {
  const raw = await request<RawDelayedRegistrationRequest>('/queues/delayed-registration', {
    method: 'POST',
    body: JSON.stringify({ route }),
  });
  return mapDelayedRegistrationRequest(raw);
}

// Panel admin: lista de solicitudes de inscripcion retrasada.
export async function fetchDelayedRegistrationRequests(): Promise<DelayedRegistrationRequest[]> {
  const raw = await request<RawDelayedRegistrationRequest[]>('/queues/delayed-registration/list');
  return raw.map(mapDelayedRegistrationRequest);
}

// El administrador resuelve: LLAMAR_PREDECESOR o AUTORIZAR_DIRECTO.
export async function resolveDelayedRegistrationRequest(id: string, resolution: DelayedRegistrationResolution): Promise<DelayedRegistrationRequest> {
  const raw = await request<RawDelayedRegistrationRequest>(`/queues/delayed-registration/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ resolution }),
  });
  return mapDelayedRegistrationRequest(raw);
}

// ─── Solicitudes comerciales (landing publica) ────────────────────────────
// La landing publica envia estas solicitudes sin autenticacion (ver
// src/lib/commercial-requests-api.ts, endpoint publico). Estas funciones son
// para el panel de Super Admin: listar, ver detalle y marcar atendida. Ver
// docs/planes/landing-publica-y-solicitudes-comerciales.md.
export type CommercialSolution = 'OPERACION' | 'PRO' | 'GPS_VEHICULAR';
export type CommercialRequestStatus = 'NUEVA' | 'CONTACTADA' | 'COTIZADA' | 'CONVERTIDA' | 'DESCARTADA';

export interface CommercialRequest {
  id: string;
  solution: CommercialSolution;
  status: CommercialRequestStatus;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  orgName: string | null;
  ruc: string | null;
  answers: Record<string, unknown>;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export async function fetchCommercialRequests(): Promise<CommercialRequest[]> {
  return request<CommercialRequest[]>('/commercial-requests');
}

export async function fetchCommercialRequest(id: string): Promise<CommercialRequest> {
  return request<CommercialRequest>(`/commercial-requests/${id}`);
}

export async function markCommercialRequestReviewed(id: string, notes?: string): Promise<CommercialRequest> {
  return request<CommercialRequest>(`/commercial-requests/${id}/reviewed`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  });
}

// Triaje automatico (ia-aplicada.md §2.1) -- resumen ejecutivo aparte del
// detalle real de la solicitud, nunca lo reemplaza. summary puede venir
// null (Claude no configurado o fallo puntual).
export async function fetchCommercialRequestTriage(id: string): Promise<{ summary: string | null }> {
  return request(`/commercial-requests/${id}/triage`);
}

// Asistente de onboarding (ia-aplicada.md §2.5) -- sugerencia para pre-llenar
// el wizard "Nueva asociación" a partir de esta solicitud. Nunca crea nada:
// el Super Admin ve estos valores ya escritos en el formulario del wizard y
// los edita o borra libremente antes de confirmar. aiParsed indica si Claude
// pudo interpretar terminales/rutas del texto libre, o si solo se copiaron
// los datos directos del formulario (terminal1/terminal2/routes vienen
// vacíos en ese caso -- nunca un valor inventado).
export interface OnboardingSuggestion {
  name: string | null;
  ruc: string | null;
  city: string | null;
  adminName: string | null;
  adminEmail: string | null;
  adminPhone: string | null;
  plan: 'OPERACION' | 'PRO';
  units: string | null;
  gpsUnits: string | null;
  terminal1: string | null;
  terminal2: string | null;
  routes: { origin: string; destination: string }[];
  configNotes: string | null;
  aiParsed: boolean;
}

export async function fetchCommercialRequestOnboardingSuggestion(id: string): Promise<OnboardingSuggestion> {
  return request(`/commercial-requests/${id}/onboarding-suggestion`);
}

// Edicion de la landing publica desde Super Admin (landing-publica-y-
// solicitudes-comerciales.md §9). El GET publico que consume la landing en
// si (sin auth) vive en landing-content-api.ts -- esto es solo lo protegido.
export async function fetchLandingSection(key: string): Promise<{ key: string; data: unknown; isDefault: boolean }> {
  return request(`/landing-content/${key}`);
}

export async function updateLandingSection(key: string, data: unknown): Promise<void> {
  await request(`/landing-content/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ data }),
  });
}

// Libro de Reclamaciones -- lado Super Admin (el envio publico vive en
// complaint-book-api.ts). Ver backend/src/complaint-book.
export interface ComplaintBookEntry {
  id: string;
  number: string;
  type: 'RECLAMO' | 'QUEJA';
  consumerName: string;
  consumerDocument: string;
  consumerAddress?: string | null;
  consumerEmail: string;
  consumerPhone?: string | null;
  isMinor: boolean;
  guardianName?: string | null;
  serviceDescription: string;
  claimedAmount?: number | null;
  detail: string;
  consumerRequest: string;
  status: 'RECIBIDO' | 'EN_PROCESO' | 'RESPONDIDO';
  providerResponse?: string | null;
  respondedAt?: string | null;
  createdAt: string;
}

export async function fetchComplaints(): Promise<ComplaintBookEntry[]> {
  return request<ComplaintBookEntry[]>('/complaint-book');
}

export async function respondComplaint(id: string, providerResponse: string): Promise<ComplaintBookEntry> {
  return request<ComplaintBookEntry>(`/complaint-book/${id}/respond`, {
    method: 'PATCH',
    body: JSON.stringify({ providerResponse }),
  });
}

// Avisos del administrador a conductores/socios (plan-pro.md §9) -- se
// entregan SOLO dentro de la plataforma, nunca por WhatsApp.
export type NoticeAudience = 'CONDUCTORES' | 'SOCIOS' | 'AMBOS' | 'ADMINISTRADORES';

export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: NoticeAudience;
  authorName: string;
  createdAt: string;
}

// Cada rol ve solo lo que le corresponde -- el backend filtra por audiencia
// segun el rol de quien pregunta (CONDUCTOR/SOCIO), y Administrador/Super
// Admin ven todos como vista de gestion.
export async function fetchNotices(): Promise<Notice[]> {
  return request<Notice[]>('/notices');
}

export async function createNotice(input: { title: string; body: string; audience: NoticeAudience }): Promise<Notice> {
  return request<Notice>('/notices', { method: 'POST', body: JSON.stringify(input) });
}

// Aviso masivo de Super Admin (13 sept 2026) -- ej. mantenimiento
// programado. organizationIds vacio o ausente = todas las asociaciones
// reales, sin importar plan; con IDs = solo esas (filtro real).
export async function broadcastNotice(input: { title: string; body: string; audience: NoticeAudience; organizationIds?: string[] }): Promise<{ sent: number; organizations: string[] }> {
  return request<{ sent: number; organizations: string[] }>('/notices/broadcast', { method: 'POST', body: JSON.stringify(input) });
}

// Campanita real del Shell (12 sept 2026) -- solo cuenta avisos privados
// (creados por el propio backend, ej. engine-lock.service.ts), no los de
// audiencia general.
export async function fetchNoticesUnreadCount(): Promise<{ count: number }> {
  return request<{ count: number }>('/notices/unread-count');
}

export async function markNoticesRead(): Promise<void> {
  await request('/notices/mark-read', { method: 'POST' });
}

// ─── Soporte (13 sept 2026, reemplaza el placeholder de Super Admin) ─────────
// El Administrador reporta un problema desde su propio panel; Super Admin ve
// la cola completa cruzando todas las asociaciones y responde.
export type SupportTicketStatus = 'ABIERTO' | 'EN_PROGRESO' | 'RESUELTO';

export interface SupportTicket {
  id: string;
  organizationId: string;
  organizationName?: string; // solo presente en la vista cruzada de Super Admin
  authorName: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  response: string | null;
  respondedAt: string | null;
  respondedBy: string | null;
  createdAt: string;
}

interface RawSupportTicket extends Omit<SupportTicket, 'organizationName'> {
  organization?: { name: string };
}

function adaptSupportTicket(raw: RawSupportTicket): SupportTicket {
  const { organization, ...rest } = raw;
  return { ...rest, organizationName: organization?.name };
}

export async function fetchSupportTickets(organizationId?: string): Promise<SupportTicket[]> {
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  const raw = await request<RawSupportTicket[]>(`/support-tickets${qs}`);
  return raw.map(adaptSupportTicket);
}

export async function createSupportTicket(subject: string, message: string): Promise<SupportTicket> {
  const raw = await request<RawSupportTicket>('/support-tickets', { method: 'POST', body: JSON.stringify({ subject, message }) });
  return adaptSupportTicket(raw);
}

export async function respondSupportTicket(id: string, status: 'EN_PROGRESO' | 'RESUELTO', response?: string): Promise<SupportTicket> {
  const raw = await request<RawSupportTicket>(`/support-tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status, response }) });
  return adaptSupportTicket(raw);
}

// ─── Métricas de negocio y onboarding (13 sept 2026, Super Admin) ────────────
export interface OrganizationMetrics {
  totalOrganizaciones: number;
  activas: number;
  enConfiguracion: number;
  suspendidas: number;
  pro: number;
  operacion: number;
  nuevasUltimos30Dias: number;
  unidadesConPlanGpsVehicularActivo: number;
  unidadesEnGraciaGpsVehicular: number;
}

export async function fetchOrganizationMetrics(): Promise<OrganizationMetrics> {
  return request<OrganizationMetrics>('/organizations/metrics');
}

export interface OrganizationOnboardingStatus {
  adminActivo: boolean;
  corredorConfigurado: boolean;
  empresasRegistradas: number;
  vehiculosRegistrados: number;
  unidadesConGps: number;
}

export async function fetchOrganizationOnboarding(organizationId: string): Promise<OrganizationOnboardingStatus> {
  return request<OrganizationOnboardingStatus>(`/organizations/${organizationId}/onboarding`);
}

// ─── Salud técnica de CHASKI AI (12 sept 2026, decidido con Jayde) ─────────
// Monitoreo REAL de la propia infraestructura (base de datos, Traccar,
// Resend) -- reemplaza la version anterior que mostraba 5 numeros escritos a
// mano. Solo Super Admin. Nunca es informacion de una asociacion.
export type HealthCheckServiceName = 'BASE_DE_DATOS' | 'TRACCAR' | 'NOTIFICACIONES' | 'CLOUDINARY' | 'ASISTENTE_IA';
export type HealthCheckStatusValue = 'OK' | 'DEGRADADO' | 'CAIDO';

export interface HealthCheckHistoryPoint {
  status: HealthCheckStatusValue;
  checkedAt: string;
}

export interface HealthCheckServiceStatus {
  service: HealthCheckServiceName;
  status: HealthCheckStatusValue | null;
  latencyMs: number | null;
  errorMessage: string | null;
  checkedAt: string | null;
  uptime30d: number | null;
  history: HealthCheckHistoryPoint[];
}

export async function fetchHealthStatus(): Promise<HealthCheckServiceStatus[]> {
  return request<HealthCheckServiceStatus[]>('/health-monitor');
}
