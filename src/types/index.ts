export type Role = 'admin' | 'driver' | 'partner' | 'superadmin';

export interface AuthUser {
  id?: string;
  email: string;
  name: string;
  role: Role;
  org: string;
  orgId: string;
  code?: string;
}

export type QueueStatus =
  | 'PREINSCRITO'
  | 'INSCRITO'
  | 'LLAMADO'
  | 'EN TERMINAL'
  | 'EMBARCANDO'
  | 'LISTO'
  | 'SALIO'
  | 'AUSENTE'
  | 'RETIRADO';

export type EvidenceType =
  | 'REGISTRO_MOVIL'
  | 'PRESENCIA_TERMINAL'
  | 'VEHICULO_VERIFICADO'
  | 'SIN_EVIDENCIA';

export type VehicleType = 'SPRINTER' | 'HIACE' | 'MASTER';
export type RouteDir = 'JULI_PUNO' | 'PUNO_JULI';
export type ManifestStatus = 'BORRADOR' | 'CERRADO' | 'CON_INCIDENCIA' | 'CORREGIDO';
export type TripStatus = 'PROGRAMADO' | 'ACTIVO' | 'COMPLETADO' | 'CON_INCIDENCIA';
export type RelocationStatus = 'DETECTADO' | 'PROPUESTA' | 'AUTORIZADA' | 'EN_TRASLADO' | 'COMPLETADA';
export type PaymentMethod = 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TRANSFERENCIA' | 'QR';

export interface QueueEntry {
  id: string;
  position: number;
  code: string;
  company: string;
  vehicleType: VehicleType;
  plate: string;
  driverName: string;
  partnerName: string;
  partnerDni: string;
  phone: string;
  registeredAt: string;
  status: QueueStatus;
  evidence: EvidenceType;
}

export interface Passenger {
  id: string;
  name: string;
  dni: string;
  seat: number;
  fare: number;
  paymentMethod: PaymentMethod;
  origin: string;
  destination: string;
}

export interface Manifest {
  id: string;
  number: string;
  status: ManifestStatus;
  route: RouteDir;
  code: string;
  plate: string;
  vehicleType: VehicleType;
  driverName: string;
  operator: string;
  company: string;
  date: string;
  departureTime: string;
  arrivalTime?: string;
  passengers: Passenger[];
  capacity: number;
  version: number;
  correctionReason?: string;
  pdfGenerated: boolean;
  paperBackup?: boolean;
  pendingDigitize?: boolean;
  tripId?: string;
}

export interface Trip {
  id: string;
  code: string;
  plate: string;
  vehicleType: VehicleType;
  driverName: string;
  company: string;
  route: RouteDir;
  status: TripStatus;
  scheduledDeparture: string;
  actualDeparture?: string;
  scheduledArrival?: string;
  actualArrival?: string;
  manifestId?: string;
  gpsStatus: 'SIN_GPS' | 'REGISTRO_MOVIL' | 'GPS_PRO_DEMO';
  incidentNote?: string;
  scheduledDepartureISO?: string;
  actualDepartureISO?: string;
  scheduledArrivalISO?: string;
}

export interface RelocationUnit {
  code: string;
  plate: string;
  driverName: string;
  accepted: boolean;
  vehicleId?: string;
}

export interface RelocationOrder {
  id: string;
  status: RelocationStatus;
  fromTerminal: 'PUNO' | 'JULI';
  toTerminal: 'PUNO' | 'JULI';
  reason: string;
  units: RelocationUnit[];
  window: string;
  compensation: string;
  internalOrder: string;
  createdAt: string;
  updatedAt: string;
  confirmedBy?: string;
}

export type DelayedRegistrationStatus = 'PENDIENTE' | 'AUTORIZADO' | 'RESUELTO';
export type DelayedRegistrationResolution = 'LLAMAR_PREDECESOR' | 'AUTORIZAR_DIRECTO';

// Excepcion 3 (plan-operacion.md, Jayde 4 sept 2026): "Inscripcion retrasada" --
// un conductor bloqueado por el candado de orden real de salida avisa al
// administrador, que resuelve manualmente.
export interface DelayedRegistrationRequest {
  id: string;
  route: RouteDir;
  status: DelayedRegistrationStatus;
  resolution: DelayedRegistrationResolution | null;
  requestingVehicleCode: string;
  requestingDriverName: string;
  blockedByVehicleCode: string | null;
  resolvedByName: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Unit {
  id: string;
  code: string;
  company: string;
  partnerName: string;
  partnerDni: string;
  partnerCode: string;
  vehicleType: VehicleType;
  plate: string;
  model: string;
  year: number;
  status: 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO';
  currentDriverName: string;
  plateHistory: Array<{ plate: string; from: string; to?: string }>;
  route: RouteDir | 'AMBAS';
  partnerId?: string;
  currentDriverId?: string;
  // GPS PRO / GPS Vehicular: uniqueId del dispositivo Traccar vinculado a esta
  // unidad (normalmente el IMEI del Teltonika). Undefined = sin GPS real todavia.
  traccarDeviceId?: string;
}

export interface Company {
  id: string;
  name: string;
  ruc: string;
  legalRep: string;
  phone: string;
  email: string;
  status: 'ACTIVA' | 'OBSERVADA' | 'SUSPENDIDA';
  units: number;
  partners: number;
  routes: RouteDir[];
}

export interface Person {
  id: string;
  name: string;
  dni: string;
  email: string;
  phone: string;
  role: 'CONDUCTOR' | 'SOCIO' | 'ADMINISTRADOR';
  company?: string;
  code?: string;
  status: 'ACTIVO' | 'PENDIENTE' | 'SUSPENDIDO';
  linkedUnit?: string;
  boundDeviceId?: string | null;
}

export interface AuditEntry {
  id: string;
  actor: string;
  actorRole: string;
  org: string;
  action: string;
  resource: string;
  resourceId: string;
  timestamp: string;
  before?: string;
  after?: string;
  reason?: string;
  evidence?: string;
}

export interface Organization {
  id: string;
  name: string;
  ruc: string;
  status: 'ACTIVA' | 'EN_CONFIGURACION' | 'SUSPENDIDA' | 'CON_INCIDENCIA';
  plan: string;
  modules: string[];
  adminEmail: string;
  adminName: string;
  routes: string[];
  terminals: string[];
  createdAt: string;
  units: number;
  partners: number;
  driverLiveMapEnabled: boolean;
}

export type SubscriptionStatus =
  | 'BORRADOR'
  | 'PENDIENTE_PAGO'
  | 'PAGO_EN_REVISION'
  | 'PROGRAMADA'
  | 'ACTIVA'
  | 'PERIODO_GRACIA'
  | 'SUSPENDIDA'
  | 'CANCELADA';

export type PlanType = 'OPERACION' | 'PRO';
export type SubscriptionPeriodType = 'MENSUAL' | 'ANUAL';
export type ActivationType = 'NORMAL' | 'PRUEBA_GRATUITA' | 'CORTESIA' | 'ADMINISTRATIVA';

export interface Subscription {
  id: string;
  orgId: string;
  orgName: string;
  plan: PlanType;
  status: SubscriptionStatus;
  period: SubscriptionPeriodType;
  units: number;
  gpsUnits: number;
  agreedPrice: number;
  discount: number;
  currency: 'PEN' | 'USD';
  startDate?: string;
  endDate?: string;
  gracePeriodDays: number;
  activationType?: ActivationType;
  activatedBy?: string;
  activationReason?: string;
  features: string[];
  hardwareCost?: number;
  installCost?: number;
  simCost?: number;
  serviceCost?: number;
  createdAt: string;
  updatedAt: string;
}

export type PaymentStatus =
  | 'PENDIENTE'
  | 'EN_REVISION'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'CORRECCION_SOLICITADA';

export type CommercialPaymentMethod = 'TRANSFERENCIA' | 'DEPOSITO' | 'OTRO';

export interface Payment {
  id: string;
  orgId: string;
  orgName: string;
  subscriptionId: string;
  concept: string;
  quoteNumber?: string;
  amount: number;
  currency: 'PEN' | 'USD';
  method: CommercialPaymentMethod;
  bank?: string;
  operationNumber?: string;
  paymentDate: string;
  status: PaymentStatus;
  observations?: string;
  reviewedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export type CommercialRequestStatus = 'NUEVA' | 'EN_PROCESO' | 'PROPUESTA_ENVIADA' | 'CERRADA';

export interface CommercialRequest {
  id: string;
  orgName: string;
  ruc?: string;
  city: string;
  routes: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  totalUnits: number;
  gpsUnits: number;
  period: SubscriptionPeriodType;
  comments?: string;
  status: CommercialRequestStatus;
  createdAt: string;
}

export type GPSDeviceStatus = 'PENDIENTE' | 'INSTALADO' | 'EN_LINEA' | 'SIN_SENAL' | 'DESCONECTADO';

export interface GPSDevice {
  id: string;
  imei: string;
  model: string;
  orgId: string;
  orgName: string;
  unitCode?: string;
  plate?: string;
  simNumber?: string;
  status: GPSDeviceStatus;
  installedAt?: string;
  lastSignal?: string;
  firmwareVersion?: string;
}
