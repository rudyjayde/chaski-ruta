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
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      // sin cuerpo JSON, se usa el mensaje generico
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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
  seat: number;
  fare: number;
  paymentMethod: PaymentMethod;
  origin: string;
  destination: string;
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
  return { id: raw.id, name: raw.name, dni: raw.dni, seat: raw.seat, fare: raw.fare, paymentMethod: raw.paymentMethod, origin: raw.origin, destination: raw.destination };
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
  };
}

// ---------------------------------------------------------------------------
// Colas
// ---------------------------------------------------------------------------
export async function fetchQueue(route: RouteDir): Promise<QueueEntry[]> {
  const raw = await request<RawQueueEntry[]>(`/queues/${route}`);
  return raw.map(mapQueueEntry);
}

export async function joinQueue(route: RouteDir, vehicleId: string, deviceId?: string, isRelocation?: boolean): Promise<void> {
  await request(`/queues/${route}/join`, { method: 'POST', body: JSON.stringify({ vehicleId, deviceId, isRelocation }) });
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
export async function fetchVehicles(route?: RouteDir): Promise<Unit[]> {
  const raw = await request<RawVehicle[]>(`/vehicles${route ? `?route=${route}` : ''}`);
  return raw.map((v) => ({
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
  }));
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
  code: string;
  companyId: string;
  vehicleType: VehicleType;
  plate: string;
  model: string;
  year: number;
  routeAssignment?: 'JULI_PUNO' | 'PUNO_JULI' | 'AMBAS';
  partnerId?: string;
  currentDriverId?: string;
}

export async function createVehicle(input: CreateVehicleInput): Promise<void> {
  await request<RawVehicle>('/vehicles', { method: 'POST', body: JSON.stringify(input) });
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

export async function deactivateVehicle(vehicleId: string, reason: string): Promise<void> {
  await request<RawVehicle>(`/vehicles/${vehicleId}/deactivate`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/** Vincula (o, con cadena vacia, desvincula) el dispositivo GPS real (Traccar) de la unidad. */
export async function setVehicleGpsDevice(vehicleId: string, traccarDeviceId: string): Promise<void> {
  await request<RawVehicle>(`/vehicles/${vehicleId}/gps-device`, {
    method: 'POST',
    body: JSON.stringify({ traccarDeviceId }),
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
  dni?: string;
  phone?: string;
  code?: string;
  company?: string;
}

export async function fetchPeople(organizationId?: string): Promise<Person[]> {
  return request<Person[]>(organizationId ? `/people?organizationId=${encodeURIComponent(organizationId)}` : '/people');
}

export async function createPerson(input: CreatePersonInput, organizationId?: string): Promise<Person> {
  return request<Person>(
    organizationId ? `/people?organizationId=${encodeURIComponent(organizationId)}` : '/people',
    { method: 'POST', body: JSON.stringify(input) },
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
}

// ─── Etiquetas de ruta/terminal por asociacion ──────────────────────────────
// Cada asociacion tiene su propio corredor (terminalOriginName/terminalDestinationName).
// JULI_PUNO/PUNO_JULI y JULI/PUNO siguen siendo solo CODIGOS INTERNOS de
// direccion ('ruta de ida'/'ruta de vuelta', 'terminal de origen'/'terminal de
// destino') -- estas funciones son el UNICO lugar que debe traducirlos a texto,
// para no volver a repetir "Juli"/"Puno" a mano en cada pantalla.
type CorridorNames = Pick<Organization, 'terminalOriginName' | 'terminalDestinationName'> | null | undefined;

function names(org: CorridorNames): { origin: string; destination: string } {
  return {
    origin: org?.terminalOriginName?.trim() || 'Juli',
    destination: org?.terminalDestinationName?.trim() || 'Puno',
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

export async function updateOrganization(id: string, patch: { name?: string; ruc?: string; city?: string; legalRepName?: string; contactPhone?: string; contactEmail?: string; driverLiveMapEnabled?: boolean; status?: Organization['status']; logoUrl?: string; plan?: Organization['plan'] }): Promise<Organization> {
  return request<Organization>(`/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
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
}

/**
 * Posiciones en vivo de las unidades que ya tienen un dispositivo Traccar real
 * vinculado. Nunca incluye una unidad sin senal real (el backend lo garantiza).
 * Solo Plan PRO -- el backend rechaza la llamada si la asociacion esta en
 * Operacion (salvo Super Admin).
 */
export async function fetchGpsLive(): Promise<LiveVehiclePosition[]> {
  return request<LiveVehiclePosition[]>('/gps/live');
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

export async function fetchGpsDevices(): Promise<VehicleGpsStatus[]> {
  return request<VehicleGpsStatus[]>('/gps/devices');
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
