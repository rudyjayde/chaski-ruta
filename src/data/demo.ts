import type {
  QueueEntry, Manifest, Trip, RelocationOrder, Unit, Company,
  AuditEntry, Organization, Passenger,
  Subscription, Payment, CommercialRequest, GPSDevice,
} from '../types';

export const COMPANIES: Company[] = [
  { id: 'c1', name: 'Virgen de Fátima', ruc: '20601234567', legalRep: 'Aurelio Ticona Callo', phone: '951234001', email: 'fatima@atipcar.test', status: 'ACTIVA', units: 15, partners: 15, routes: ['JULI_PUNO', 'PUNO_JULI'] },
  { id: 'c2', name: 'San Francisco de Borja', ruc: '20601234568', legalRep: 'Gregorio Mamani Ticona', phone: '951234002', email: 'borja@atipcar.test', status: 'ACTIVA', units: 12, partners: 12, routes: ['JULI_PUNO', 'PUNO_JULI'] },
  { id: 'c3', name: 'Sur Andino', ruc: '20601234569', legalRep: 'Elena Quispe Flores', phone: '951234003', email: 'surandino@atipcar.test', status: 'ACTIVA', units: 11, partners: 11, routes: ['JULI_PUNO', 'PUNO_JULI'] },
  { id: 'c4', name: 'Litoral', ruc: '20601234570', legalRep: 'Bernardo Cruz Apaza', phone: '951234004', email: 'litoral@atipcar.test', status: 'OBSERVADA', units: 10, partners: 10, routes: ['JULI_PUNO'] },
  { id: 'c5', name: 'San Miguel', ruc: '20601234571', legalRep: 'Felicitas Ramos Condori', phone: '951234005', email: 'sanmiguel@atipcar.test', status: 'ACTIVA', units: 12, partners: 12, routes: ['JULI_PUNO', 'PUNO_JULI'] },
];

const makePassengers = (count: number, capacity: number, origin = 'Juli', destination = 'Puno'): Passenger[] => {
  const names = ['Ana Torres','Carlos Mamani','Luis Ticona','María Condori','Pedro Apaza','Rosa Cruz','Juan Ramos','Elena Flores','Miguel Huanca','Sofía Quispe','David Callo','Laura Mamani','Roberto Torres','Carmen Apaza','Diego Ramos'];
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i+1}`,
    name: names[i % names.length],
    dni: `4${String(i+1).padStart(7,'0')}`,
    seat: i + 1,
    fare: 10,
    paymentMethod: (['EFECTIVO','YAPE','PLIN'] as const)[i % 3],
    origin: i % 3 === 0 ? origin : origin,
    destination,
  }));
};

export const MANIFESTS: Manifest[] = [
  {
    id: 'm1', number: 'MAN-2026-0847', status: 'CERRADO', route: 'JULI_PUNO',
    code: '003', plate: 'Z2C-412', vehicleType: 'SPRINTER', driverName: 'Héctor Apaza Condori',
    operator: 'admin@acceso.atipcar.test', company: 'Virgen de Fátima',
    date: '2026-08-29', departureTime: '05:15', arrivalTime: '07:45',
    passengers: makePassengers(18, 20), capacity: 20, version: 1, pdfGenerated: true,
  },
  {
    id: 'm2', number: 'MAN-2026-0848', status: 'CERRADO', route: 'PUNO_JULI',
    code: '011', plate: 'Z3A-201', vehicleType: 'HIACE', driverName: 'Samuel Ramos Flores',
    operator: 'admin@acceso.atipcar.test', company: 'Sur Andino',
    date: '2026-08-29', departureTime: '05:30', arrivalTime: '08:10',
    passengers: makePassengers(13, 15), capacity: 15, version: 1, pdfGenerated: true,
  },
  {
    id: 'm3', number: 'MAN-2026-0849', status: 'BORRADOR', route: 'JULI_PUNO',
    code: '007', plate: 'Z4B-318', vehicleType: 'MASTER', driverName: 'José Quispe Mamani',
    operator: 'pepito@acceso.atipcar.test', company: 'Sur Andino',
    date: '2026-08-29', departureTime: '06:00', arrivalTime: undefined,
    passengers: makePassengers(9, 15), capacity: 15, version: 1, pdfGenerated: false,
  },
  {
    id: 'm4', number: 'MAN-2026-0850', status: 'BORRADOR', route: 'JULI_PUNO',
    code: '015', plate: 'Z5C-444', vehicleType: 'SPRINTER', driverName: 'José "Pepito" Quispe Mamani',
    operator: 'pepito@acceso.atipcar.test', company: 'San Miguel',
    date: '2026-08-29', departureTime: '06:45', arrivalTime: undefined,
    passengers: makePassengers(12, 20), capacity: 20, version: 1, pdfGenerated: false,
  },
  {
    id: 'm5', number: 'MAN-2026-0845', status: 'CON_INCIDENCIA', route: 'PUNO_JULI',
    code: '022', plate: 'Z1D-567', vehicleType: 'HIACE', driverName: 'Pablo Cruz Mamani',
    operator: 'admin@acceso.atipcar.test', company: 'Litoral',
    date: '2026-08-29', departureTime: '04:30', arrivalTime: '07:15',
    passengers: makePassengers(15, 15), capacity: 15, version: 1, pdfGenerated: true,
  },
  {
    id: 'm6', number: 'MAN-2026-0840', status: 'CORREGIDO', route: 'JULI_PUNO',
    code: '008', plate: 'Z2A-903', vehicleType: 'SPRINTER', driverName: 'Antonio Ticona Ramos',
    operator: 'admin@acceso.atipcar.test', company: 'San Francisco de Borja',
    date: '2026-08-28', departureTime: '05:00', arrivalTime: '07:30',
    passengers: makePassengers(19, 20), capacity: 20, version: 2,
    correctionReason: 'Corrección de DNI de pasajero en asiento 07', pdfGenerated: true,
  },
  {
    id: 'm7', number: 'MAN-2026-0851', status: 'BORRADOR', route: 'PUNO_JULI',
    code: '031', plate: 'Z6B-112', vehicleType: 'MASTER', driverName: 'Rodolfo Mamani Cruz',
    operator: 'pepito@acceso.atipcar.test', company: 'Virgen de Fátima',
    date: '2026-08-29', departureTime: '07:15', arrivalTime: undefined,
    passengers: makePassengers(6, 15), capacity: 15, version: 1, pdfGenerated: false,
  },
  {
    id: 'm-test-041', number: 'MAN-TEST-041', status: 'BORRADOR', route: 'JULI_PUNO',
    code: '041', plate: 'T1A-041', vehicleType: 'SPRINTER', driverName: 'Lucía Quispe Condori',
    operator: 'conductor.jp1@acceso.atipcar.test', company: 'Virgen de Fátima',
    date: '2026-08-29', departureTime: '07:30', arrivalTime: undefined,
    passengers: makePassengers(4, 20, 'Juli', 'Puno'), capacity: 20, version: 1, pdfGenerated: false,
  },
  {
    id: 'm-test-042', number: 'MAN-TEST-042', status: 'BORRADOR', route: 'JULI_PUNO',
    code: '042', plate: 'T2B-042', vehicleType: 'HIACE', driverName: 'Daniel Mamani Apaza',
    operator: 'conductor.jp2@acceso.atipcar.test', company: 'San Francisco de Borja',
    date: '2026-08-29', departureTime: '07:40', arrivalTime: undefined,
    passengers: makePassengers(3, 15, 'Juli', 'Puno'), capacity: 15, version: 1, pdfGenerated: false,
  },
  {
    id: 'm-test-043', number: 'MAN-TEST-043', status: 'BORRADOR', route: 'PUNO_JULI',
    code: '043', plate: 'T3C-043', vehicleType: 'SPRINTER', driverName: 'Elena Torres Callo',
    operator: 'conductor.pj1@acceso.atipcar.test', company: 'Sur Andino',
    date: '2026-08-29', departureTime: '07:35', arrivalTime: undefined,
    passengers: makePassengers(5, 20, 'Puno', 'Juli'), capacity: 20, version: 1, pdfGenerated: false,
  },
  {
    id: 'm-test-044', number: 'MAN-TEST-044', status: 'BORRADOR', route: 'PUNO_JULI',
    code: '044', plate: 'T4D-044', vehicleType: 'HIACE', driverName: 'Miguel Ramos Flores',
    operator: 'conductor.pj2@acceso.atipcar.test', company: 'San Miguel',
    date: '2026-08-29', departureTime: '07:45', arrivalTime: undefined,
    passengers: makePassengers(2, 15, 'Puno', 'Juli'), capacity: 15, version: 1, pdfGenerated: false,
  },
];

export const TRIPS: Trip[] = [
  { id: 't1', code: '003', plate: 'Z2C-412', vehicleType: 'SPRINTER', driverName: 'Héctor Apaza Condori', company: 'Virgen de Fátima', route: 'JULI_PUNO', status: 'COMPLETADO', scheduledDeparture: '05:15', actualDeparture: '05:18', scheduledArrival: '07:45', actualArrival: '07:52', manifestId: 'm1', gpsStatus: 'REGISTRO_MOVIL' },
  { id: 't2', code: '011', plate: 'Z3A-201', vehicleType: 'HIACE', driverName: 'Samuel Ramos Flores', company: 'Sur Andino', route: 'PUNO_JULI', status: 'COMPLETADO', scheduledDeparture: '05:30', actualDeparture: '05:33', scheduledArrival: '08:10', actualArrival: '08:05', manifestId: 'm2', gpsStatus: 'GPS_PRO_DEMO' },
  { id: 't3', code: '007', plate: 'Z4B-318', vehicleType: 'MASTER', driverName: 'José Quispe Mamani', company: 'Sur Andino', route: 'JULI_PUNO', status: 'ACTIVO', scheduledDeparture: '06:00', actualDeparture: '06:04', gpsStatus: 'REGISTRO_MOVIL', manifestId: 'm3' },
  { id: 't4', code: '015', plate: 'Z5C-444', vehicleType: 'SPRINTER', driverName: 'José "Pepito" Quispe Mamani', company: 'San Miguel', route: 'JULI_PUNO', status: 'ACTIVO', scheduledDeparture: '06:45', actualDeparture: '06:47', gpsStatus: 'SIN_GPS', manifestId: 'm4' },
  { id: 't5', code: '022', plate: 'Z1D-567', vehicleType: 'HIACE', driverName: 'Pablo Cruz Mamani', company: 'Litoral', route: 'PUNO_JULI', status: 'CON_INCIDENCIA', scheduledDeparture: '04:30', actualDeparture: '04:35', scheduledArrival: '07:15', actualArrival: '07:15', manifestId: 'm5', gpsStatus: 'SIN_GPS', incidentNote: 'Pasajero reportó cobro incorrecto. Manifiesto bajo revisión.' },
  { id: 't6', code: '019', plate: 'Z7A-890', vehicleType: 'SPRINTER', driverName: 'Fidel Condori Apaza', company: 'San Miguel', route: 'PUNO_JULI', status: 'PROGRAMADO', scheduledDeparture: '08:30', gpsStatus: 'SIN_GPS' },
  { id: 't7', code: '025', plate: 'Z8C-334', vehicleType: 'HIACE', driverName: 'Norberto Quispe Cruz', company: 'Virgen de Fátima', route: 'JULI_PUNO', status: 'PROGRAMADO', scheduledDeparture: '09:00', gpsStatus: 'SIN_GPS' },
];

export const QUEUE_JULI_PUNO: QueueEntry[] = [
  { id: 'q1', position: 1, code: '004', company: 'Virgen de Fátima', vehicleType: 'SPRINTER', plate: 'Z1A-123', driverName: 'Carlos Ticona Mamani', partnerName: 'Luisa Ticona Callo', partnerDni: '40123001', phone: '951001001', registeredAt: '04:12', status: 'LLAMADO', evidence: 'PRESENCIA_TERMINAL' },
  { id: 'q2', position: 2, code: '006', company: 'San Francisco de Borja', vehicleType: 'HIACE', plate: 'Z2B-234', driverName: 'Marco Ramos Apaza', partnerName: 'Marco Ramos Apaza', partnerDni: '40123002', phone: '951001002', registeredAt: '04:18', status: 'EN TERMINAL', evidence: 'PRESENCIA_TERMINAL' },
  { id: 'q3', position: 3, code: '009', company: 'Sur Andino', vehicleType: 'MASTER', plate: 'Z3C-345', driverName: 'Eulogio Cruz Ticona', partnerName: 'Eulogio Cruz Ticona', partnerDni: '40123003', phone: '951001003', registeredAt: '04:25', status: 'EMBARCANDO', evidence: 'VEHICULO_VERIFICADO' },
  { id: 'q4', position: 4, code: '012', company: 'Litoral', vehicleType: 'SPRINTER', plate: 'Z4A-456', driverName: 'Rafael Mamani Flores', partnerName: 'Rafael Mamani Flores', partnerDni: '40123004', phone: '951001004', registeredAt: '04:30', status: 'LISTO', evidence: 'PRESENCIA_TERMINAL' },
  { id: 'q5', position: 5, code: '014', company: 'San Miguel', vehicleType: 'HIACE', plate: 'Z5B-567', driverName: 'Benigno Apaza Cruz', partnerName: 'Benigno Apaza Cruz', partnerDni: '40123005', phone: '951001005', registeredAt: '04:42', status: 'INSCRITO', evidence: 'REGISTRO_MOVIL' },
  { id: 'q6', position: 6, code: '016', company: 'Virgen de Fátima', vehicleType: 'SPRINTER', plate: 'Z6C-678', driverName: 'Teófilo Condori Ramos', partnerName: 'Teófilo Condori Ramos', partnerDni: '40123006', phone: '951001006', registeredAt: '04:55', status: 'INSCRITO', evidence: 'REGISTRO_MOVIL' },
  { id: 'q7', position: 7, code: '018', company: 'San Francisco de Borja', vehicleType: 'MASTER', plate: 'Z7A-789', driverName: 'Narciso Quispe Mamani', partnerName: 'Narciso Quispe Mamani', partnerDni: '40123007', phone: '951001007', registeredAt: '05:02', status: 'INSCRITO', evidence: 'SIN_EVIDENCIA' },
  { id: 'q8', position: 8, code: '020', company: 'Sur Andino', vehicleType: 'HIACE', plate: 'Z8B-890', driverName: 'Valentín Torres Callo', partnerName: 'Valentín Torres Callo', partnerDni: '40123008', phone: '951001008', registeredAt: '05:10', status: 'PREINSCRITO', evidence: 'SIN_EVIDENCIA' },
  { id: 'q9', position: 9, code: '023', company: 'San Miguel', vehicleType: 'SPRINTER', plate: 'Z9C-901', driverName: 'Cleto Mamani Ramos', partnerName: 'Cleto Mamani Ramos', partnerDni: '40123009', phone: '951001009', registeredAt: '05:18', status: 'PREINSCRITO', evidence: 'SIN_EVIDENCIA' },
  { id: 'q10', position: 10, code: '025', company: 'Litoral', vehicleType: 'HIACE', plate: 'Z0A-012', driverName: 'Norberto Quispe Cruz', partnerName: 'Norberto Quispe Cruz', partnerDni: '40123010', phone: '951001010', registeredAt: '05:25', status: 'PREINSCRITO', evidence: 'SIN_EVIDENCIA' },
  { id: 'q11', position: 11, code: '028', company: 'Virgen de Fátima', vehicleType: 'SPRINTER', plate: 'Z1C-113', driverName: 'Crisólogo Apaza Flores', partnerName: 'Crisólogo Apaza Flores', partnerDni: '40123011', phone: '951001011', registeredAt: '05:31', status: 'PREINSCRITO', evidence: 'SIN_EVIDENCIA' },
  { id: 'q12', position: 12, code: '031', company: 'San Francisco de Borja', vehicleType: 'MASTER', plate: 'Z2A-224', driverName: 'Anastasio Condori Mamani', partnerName: 'Anastasio Condori Mamani', partnerDni: '40123012', phone: '951001012', registeredAt: '05:40', status: 'PREINSCRITO', evidence: 'SIN_EVIDENCIA' },
  { id: 'q-test-041', position: 13, code: '041', company: 'Virgen de Fátima', vehicleType: 'SPRINTER', plate: 'T1A-041', driverName: 'Lucía Quispe Condori', partnerName: 'Socio prueba 041', partnerDni: '48001041', phone: '999100041', registeredAt: '05:48', status: 'INSCRITO', evidence: 'REGISTRO_MOVIL' },
];

export const QUEUE_PUNO_JULI: QueueEntry[] = [
  { id: 'p1', position: 1, code: '002', company: 'Sur Andino', vehicleType: 'HIACE', plate: 'Z1B-445', driverName: 'Isidro Mamani Callo', partnerName: 'Isidro Mamani Callo', partnerDni: '40124001', phone: '951002001', registeredAt: '04:05', status: 'LLAMADO', evidence: 'PRESENCIA_TERMINAL' },
  { id: 'p2', position: 2, code: '005', company: 'San Miguel', vehicleType: 'SPRINTER', plate: 'Z2C-556', driverName: 'Feliciano Torres Apaza', partnerName: 'Feliciano Torres Apaza', partnerDni: '40124002', phone: '951002002', registeredAt: '04:15', status: 'EN TERMINAL', evidence: 'PRESENCIA_TERMINAL' },
  { id: 'p3', position: 3, code: '007', company: 'Sur Andino', vehicleType: 'MASTER', plate: 'Z4B-318', driverName: 'José Quispe Mamani', partnerName: 'Mario Condori Apaza', partnerDni: '40124003', phone: '951002003', registeredAt: '04:22', status: 'INSCRITO', evidence: 'REGISTRO_MOVIL' },
  { id: 'p4', position: 4, code: '008', company: 'San Francisco de Borja', vehicleType: 'SPRINTER', plate: 'Z2A-903', driverName: 'Antonio Ticona Ramos', partnerName: 'Antonio Ticona Ramos', partnerDni: '40124004', phone: '951002004', registeredAt: '04:28', status: 'INSCRITO', evidence: 'REGISTRO_MOVIL' },
  { id: 'p5', position: 5, code: '009', company: 'Virgen de Fátima', vehicleType: 'HIACE', plate: 'Z5A-667', driverName: 'Macario Ramos Cruz', partnerName: 'Macario Ramos Cruz', partnerDni: '40124005', phone: '951002005', registeredAt: '04:35', status: 'INSCRITO', evidence: 'REGISTRO_MOVIL' },
  { id: 'p6', position: 6, code: '013', company: 'Litoral', vehicleType: 'SPRINTER', plate: 'Z6C-778', driverName: 'Honorio Flores Condori', partnerName: 'Honorio Flores Condori', partnerDni: '40124006', phone: '951002006', registeredAt: '04:48', status: 'PREINSCRITO', evidence: 'SIN_EVIDENCIA' },
  { id: 'p7', position: 7, code: '017', company: 'San Miguel', vehicleType: 'HIACE', plate: 'Z7B-889', driverName: 'Gregorio Callo Mamani', partnerName: 'Gregorio Callo Mamani', partnerDni: '40124007', phone: '951002007', registeredAt: '04:55', status: 'PREINSCRITO', evidence: 'SIN_EVIDENCIA' },
  { id: 'p8', position: 8, code: '021', company: 'Sur Andino', vehicleType: 'MASTER', plate: 'Z8A-990', driverName: 'Abundio Torres Ticona', partnerName: 'Abundio Torres Ticona', partnerDni: '40124008', phone: '951002008', registeredAt: '05:05', status: 'PREINSCRITO', evidence: 'SIN_EVIDENCIA' },
  { id: 'p9', position: 9, code: '024', company: 'Virgen de Fátima', vehicleType: 'SPRINTER', plate: 'Z9C-001', driverName: 'Emiliano Apaza Ramos', partnerName: 'Emiliano Apaza Ramos', partnerDni: '40124009', phone: '951002009', registeredAt: '05:15', status: 'PREINSCRITO', evidence: 'SIN_EVIDENCIA' },
  { id: 'p10', position: 10, code: '026', company: 'San Francisco de Borja', vehicleType: 'HIACE', plate: 'Z0B-112', driverName: 'Saturnino Condori Cruz', partnerName: 'Saturnino Condori Cruz', partnerDni: '40124010', phone: '951002010', registeredAt: '05:22', status: 'AUSENTE', evidence: 'SIN_EVIDENCIA' },
  { id: 'p-test-043', position: 11, code: '043', company: 'Sur Andino', vehicleType: 'SPRINTER', plate: 'T3C-043', driverName: 'Elena Torres Callo', partnerName: 'Socio prueba 043', partnerDni: '48001043', phone: '999100043', registeredAt: '05:31', status: 'INSCRITO', evidence: 'REGISTRO_MOVIL' },
];

export const RELOCATION: RelocationOrder = {
  id: 'rel1',
  status: 'PROPUESTA',
  fromTerminal: 'PUNO',
  toTerminal: 'JULI',
  reason: 'Desequilibrio de flota. Puno acumula 10 vehículos sin demanda inmediata. Juli reporta 3 pasajeros en espera sin unidades disponibles.',
  units: [
    { code: '007', plate: 'Z4B-318', driverName: 'José Quispe Mamani', accepted: false },
    { code: '008', plate: 'Z2A-903', driverName: 'Antonio Ticona Ramos', accepted: false },
    { code: '009', plate: 'Z5A-667', driverName: 'Macario Ramos Cruz', accepted: false },
  ],
  window: '07:30 – 09:00',
  compensation: 'S/ 15.00 por unidad (traslado vacío)',
  internalOrder: 'ORD-REL-2026-0042',
  createdAt: '2026-08-29T06:45:00',
  updatedAt: '2026-08-29T06:45:00',
};

export const UNITS: Unit[] = [
  { id: 'u1', code: '001', company: 'Virgen de Fátima', partnerName: 'Aurelio Ticona Callo', partnerDni: '29100001', partnerCode: '001', vehicleType: 'SPRINTER', plate: 'Z0A-001', model: 'Mercedes Benz Sprinter 519', year: 2021, status: 'ACTIVO', currentDriverName: 'Roberto Mamani Apaza', plateHistory: [{ plate: 'Z0A-001', from: '2021-03-10' }], route: 'AMBAS' },
  { id: 'u2', code: '002', company: 'Sur Andino', partnerName: 'Isidro Mamani Callo', partnerDni: '29100002', partnerCode: '002', vehicleType: 'HIACE', plate: 'Z1B-445', model: 'Toyota Hiace Commuter', year: 2020, status: 'ACTIVO', currentDriverName: 'Isidro Mamani Callo', plateHistory: [{ plate: 'Z1B-445', from: '2020-06-01' }], route: 'PUNO_JULI' },
  { id: 'u3', code: '003', company: 'Virgen de Fátima', partnerName: 'Luisa Ticona Callo', partnerDni: '29100003', partnerCode: '003', vehicleType: 'SPRINTER', plate: 'Z2C-412', model: 'Mercedes Benz Sprinter 519', year: 2022, status: 'ACTIVO', currentDriverName: 'Héctor Apaza Condori', plateHistory: [{ plate: 'Z2C-412', from: '2022-01-15' }], route: 'AMBAS' },
  { id: 'u4', code: '004', company: 'Virgen de Fátima', partnerName: 'Luisa Ticona Callo', partnerDni: '29100003', partnerCode: '004', vehicleType: 'SPRINTER', plate: 'Z1A-123', model: 'Mercedes Benz Sprinter 516', year: 2019, status: 'ACTIVO', currentDriverName: 'Carlos Ticona Mamani', plateHistory: [{ plate: 'Z9C-089', from: '2019-05-01', to: '2023-11-30' }, { plate: 'Z1A-123', from: '2023-12-01' }], route: 'AMBAS' },
  { id: 'u5', code: '005', company: 'San Miguel', partnerName: 'Felicitas Ramos Condori', partnerDni: '29100005', partnerCode: '005', vehicleType: 'SPRINTER', plate: 'Z2C-556', model: 'Mercedes Benz Sprinter 519', year: 2023, status: 'ACTIVO', currentDriverName: 'Feliciano Torres Apaza', plateHistory: [{ plate: 'Z2C-556', from: '2023-08-20' }], route: 'PUNO_JULI' },
  { id: 'u6', code: '006', company: 'San Francisco de Borja', partnerName: 'Gregorio Mamani Ticona', partnerDni: '29100006', partnerCode: '006', vehicleType: 'HIACE', plate: 'Z2B-234', model: 'Toyota Hiace Commuter', year: 2021, status: 'ACTIVO', currentDriverName: 'Marco Ramos Apaza', plateHistory: [{ plate: 'Z2B-234', from: '2021-07-10' }], route: 'AMBAS' },
  { id: 'u7', code: '007', company: 'Sur Andino', partnerName: 'Mario Condori Apaza', partnerDni: '29100007', partnerCode: '007', vehicleType: 'MASTER', plate: 'Z4B-318', model: 'Renault Master Minibus', year: 2020, status: 'ACTIVO', currentDriverName: 'José Quispe Mamani', plateHistory: [{ plate: 'Z4B-318', from: '2020-09-01' }], route: 'AMBAS' },
  { id: 'u8', code: '008', company: 'San Francisco de Borja', partnerName: 'Antonio Ticona Ramos', partnerDni: '29100008', partnerCode: '008', vehicleType: 'SPRINTER', plate: 'Z2A-903', model: 'Mercedes Benz Sprinter 519', year: 2022, status: 'ACTIVO', currentDriverName: 'Antonio Ticona Ramos', plateHistory: [{ plate: 'Z2A-903', from: '2022-03-15' }], route: 'AMBAS' },
  { id: 'u15', code: '015', company: 'San Miguel', partnerName: 'Mario Condori Apaza', partnerDni: '29100015', partnerCode: '015', vehicleType: 'SPRINTER', plate: 'Z5C-444', model: 'Mercedes Benz Sprinter 519', year: 2023, status: 'ACTIVO', currentDriverName: 'José "Pepito" Quispe Mamani', plateHistory: [{ plate: 'Z5C-444', from: '2023-05-10' }], route: 'AMBAS' },
  { id: 'u22', code: '022', company: 'Litoral', partnerName: 'Bernardo Cruz Apaza', partnerDni: '29100022', partnerCode: '022', vehicleType: 'HIACE', plate: 'Z1D-567', model: 'Toyota Hiace Commuter', year: 2019, status: 'ACTIVO', currentDriverName: 'Pablo Cruz Mamani', plateHistory: [{ plate: 'Z1D-567', from: '2019-11-20' }], route: 'PUNO_JULI' },
  { id: 'u41', code: '041', company: 'Virgen de Fátima', partnerName: 'Socio prueba 041', partnerDni: '48001041', partnerCode: '041', vehicleType: 'SPRINTER', plate: 'T1A-041', model: 'Mercedes Benz Sprinter 519', year: 2024, status: 'ACTIVO', currentDriverName: 'Lucía Quispe Condori', plateHistory: [{ plate: 'T1A-041', from: '2026-01-10' }], route: 'JULI_PUNO' },
  { id: 'u42', code: '042', company: 'San Francisco de Borja', partnerName: 'Socio prueba 042', partnerDni: '48001042', partnerCode: '042', vehicleType: 'HIACE', plate: 'T2B-042', model: 'Toyota Hiace Commuter', year: 2023, status: 'ACTIVO', currentDriverName: 'Daniel Mamani Apaza', plateHistory: [{ plate: 'T2B-042', from: '2026-02-12' }], route: 'JULI_PUNO' },
  { id: 'u43', code: '043', company: 'Sur Andino', partnerName: 'Socio prueba 043', partnerDni: '48001043', partnerCode: '043', vehicleType: 'SPRINTER', plate: 'T3C-043', model: 'Mercedes Benz Sprinter 516', year: 2022, status: 'ACTIVO', currentDriverName: 'Elena Torres Callo', plateHistory: [{ plate: 'T3C-043', from: '2026-03-15' }], route: 'PUNO_JULI' },
  { id: 'u44', code: '044', company: 'San Miguel', partnerName: 'Socio prueba 044', partnerDni: '48001044', partnerCode: '044', vehicleType: 'HIACE', plate: 'T4D-044', model: 'Toyota Hiace Commuter', year: 2024, status: 'ACTIVO', currentDriverName: 'Miguel Ramos Flores', plateHistory: [{ plate: 'T4D-044', from: '2026-04-18' }], route: 'PUNO_JULI' },
  { id: 'u45', code: '045', company: 'Litoral', partnerName: 'Ricardo Mamani Condori', partnerDni: '48002045', partnerCode: '045', vehicleType: 'HIACE', plate: 'T5E-045', model: 'Toyota Hiace Commuter', year: 2024, status: 'ACTIVO', currentDriverName: 'Alonso Quispe Flores', plateHistory: [{ plate: 'T5E-045', from: '2026-05-20' }], route: 'AMBAS' },
];

export const AUDIT_LOG: AuditEntry[] = [
  { id: 'a1', actor: 'Rosa Huanca Flores', actorRole: 'ADMINISTRADOR', org: 'ATIPCAR', action: 'LLAMAR_SIGUIENTE', resource: 'Cola JULI→PUNO', resourceId: 'q-jp-pos-1', timestamp: '2026-08-29T05:02:00', before: 'Posición 1: INSCRITO', after: 'Posición 1: LLAMADO', reason: 'Turno regular', evidence: 'Terminal Juli' },
  { id: 'a2', actor: 'pepito@acceso.atipcar.test', actorRole: 'CONDUCTOR', org: 'ATIPCAR', action: 'ABRIR_MANIFIESTO', resource: 'Manifiesto', resourceId: 'MAN-2026-0850', timestamp: '2026-08-29T06:40:00', before: undefined, after: 'BORRADOR', reason: 'Inicio de viaje' },
  { id: 'a3', actor: 'Rosa Huanca Flores', actorRole: 'ADMINISTRADOR', org: 'ATIPCAR', action: 'EXCEPCION_COLA', resource: 'Cola PUNO→JULI', resourceId: 'q-pj-pos-10', timestamp: '2026-08-29T05:48:00', before: 'INSCRITO', after: 'AUSENTE', reason: 'Conductor no se presentó al llamado a los 10 minutos.' },
  { id: 'a4', actor: 'Rosa Huanca Flores', actorRole: 'ADMINISTRADOR', org: 'ATIPCAR', action: 'INICIAR_REUBICACION', resource: 'Orden de reubicación', resourceId: 'ORD-REL-2026-0042', timestamp: '2026-08-29T06:45:00', before: undefined, after: 'PROPUESTA', reason: 'Desequilibrio detectado: Puno +10 vehículos, Juli sin unidades' },
  { id: 'a5', actor: 'Rosa Huanca Flores', actorRole: 'ADMINISTRADOR', org: 'ATIPCAR', action: 'CERRAR_MANIFIESTO', resource: 'Manifiesto', resourceId: 'MAN-2026-0847', timestamp: '2026-08-29T07:53:00', before: 'BORRADOR', after: 'CERRADO', reason: 'Viaje completado con éxito' },
  { id: 'a6', actor: 'Rosa Huanca Flores', actorRole: 'ADMINISTRADOR', org: 'ATIPCAR', action: 'CORREGIR_MANIFIESTO', resource: 'Manifiesto', resourceId: 'MAN-2026-0840', timestamp: '2026-08-28T18:22:00', before: 'v1 - DNI 40000007 asiento 07', after: 'v2 - DNI 40100789 asiento 07', reason: 'Corrección de DNI de pasajero en asiento 07' },
];

export const ORGANIZATIONS: Organization[] = [
  { id: 'atipcar', name: 'ATIPCAR', ruc: '20601000001', status: 'ACTIVA', plan: 'PRO', modules: ['COLAS', 'MANIFIESTOS', 'VIAJES', 'REUBICACIONES', 'FLOTA', 'REPORTES', 'AUDITORIA'], adminEmail: 'admin@acceso.atipcar.test', adminName: 'Rosa Huanca Flores', routes: ['Juli → Puno', 'Puno → Juli'], terminals: ['Terminal Juli', 'Terminal Puno'], createdAt: '2025-11-01', units: 60, partners: 60, driverLiveMapEnabled: true },
  { id: 'transtiti', name: 'TRANSTITI', ruc: '20601000002', status: 'EN_CONFIGURACION', plan: 'BÁSICO', modules: ['COLAS', 'MANIFIESTOS'], adminEmail: 'admin@transtiti.test', adminName: 'Jorge Pilco Mamani', routes: ['Puno → Juliaca'], terminals: ['Terminal Puno'], createdAt: '2026-08-15', units: 0, partners: 0, driverLiveMapEnabled: true },
  { id: 'turismo_altiplano', name: 'Turismo Altiplano', ruc: '20601000003', status: 'SUSPENDIDA', plan: 'PRO', modules: ['COLAS', 'MANIFIESTOS', 'VIAJES', 'FLOTA'], adminEmail: 'admin@altiplano.test', adminName: 'Elvira Condori Ramos', routes: ['Puno → Desaguadero'], terminals: ['Terminal Puno', 'Terminal Desaguadero'], createdAt: '2025-06-10', units: 22, partners: 22, driverLiveMapEnabled: true },
  { id: 'asotrans_ilave', name: 'ASOTRANS ILAVE', ruc: '20601000004', status: 'CON_INCIDENCIA', plan: 'PRO', modules: ['COLAS', 'MANIFIESTOS', 'VIAJES', 'REUBICACIONES'], adminEmail: 'admin@ilave.test', adminName: 'Timoteo Flores Apaza', routes: ['Ilave → Puno', 'Puno → Ilave'], terminals: ['Terminal Ilave', 'Terminal Puno'], createdAt: '2025-09-20', units: 35, partners: 35, driverLiveMapEnabled: true },
];

export const TODAY = '29 de agosto de 2026';
export const TODAY_ISO = '2026-08-29';
export const OPERATIONAL_DATE = 'Jornada 29/08/2026 – Turno Mañana';

export const SUBSCRIPTIONS: Subscription[] = [
  {
    id: 'sub-001', orgId: 'atipcar', orgName: 'ATIPCAR', plan: 'PRO', status: 'ACTIVA',
    period: 'ANUAL', units: 60, gpsUnits: 20, agreedPrice: 2400, discount: 10, currency: 'PEN',
    startDate: '2026-01-01', endDate: '2026-12-31', gracePeriodDays: 15,
    activationType: 'NORMAL', activatedBy: 'superadmin@acceso.chaski.test', activationReason: 'Contrato anual firmado',
    features: ['GPS en vivo', 'Historial GPS', 'Dispositivos GPS', 'Geocercas', 'Alertas GPS', 'Estado técnico', 'Reportes avanzados'],
    hardwareCost: 4000, installCost: 1200, simCost: 240, serviceCost: 2400,
    createdAt: '2025-12-15', updatedAt: '2026-01-01',
  },
  {
    id: 'sub-002', orgId: 'transtiti', orgName: 'TRANSTITI', plan: 'OPERACION', status: 'BORRADOR',
    period: 'MENSUAL', units: 0, gpsUnits: 0, agreedPrice: 0, discount: 0, currency: 'PEN',
    gracePeriodDays: 7,
    features: [],
    createdAt: '2026-08-15', updatedAt: '2026-08-15',
  },
  {
    id: 'sub-003', orgId: 'turismo_altiplano', orgName: 'Turismo Altiplano', plan: 'PRO', status: 'SUSPENDIDA',
    period: 'ANUAL', units: 22, gpsUnits: 10, agreedPrice: 1800, discount: 0, currency: 'PEN',
    startDate: '2025-06-10', endDate: '2026-06-09', gracePeriodDays: 15,
    features: ['GPS en vivo', 'Historial GPS', 'Dispositivos GPS', 'Geocercas', 'Alertas GPS', 'Estado técnico', 'Reportes avanzados'],
    createdAt: '2025-06-05', updatedAt: '2026-07-01',
  },
  {
    id: 'sub-004', orgId: 'asotrans_ilave', orgName: 'ASOTRANS ILAVE', plan: 'PRO', status: 'PAGO_EN_REVISION',
    period: 'MENSUAL', units: 35, gpsUnits: 15, agreedPrice: 350, discount: 5, currency: 'PEN',
    startDate: '2026-08-01', gracePeriodDays: 10,
    features: ['GPS en vivo', 'Historial GPS', 'Dispositivos GPS', 'Geocercas', 'Alertas GPS', 'Estado técnico', 'Reportes avanzados'],
    hardwareCost: 3000, installCost: 900, simCost: 180, serviceCost: 350,
    createdAt: '2026-07-25', updatedAt: '2026-08-28',
  },
];

export const PAYMENTS: Payment[] = [
  {
    id: 'pay-001', orgId: 'atipcar', orgName: 'ATIPCAR', subscriptionId: 'sub-001',
    concept: 'Suscripción anual PRO 2026 + Hardware GPS (20 unidades)',
    quoteNumber: 'COT-2025-0042',
    amount: 7840, currency: 'PEN', method: 'TRANSFERENCIA', bank: 'BCP',
    operationNumber: '04562319', paymentDate: '2025-12-28',
    status: 'APROBADO', observations: 'Pago en dos partes: S/4000 hardware + S/3840 servicio anual con 10% descuento.',
    reviewedBy: 'superadmin@acceso.chaski.test', approvedAt: '2025-12-30',
    createdAt: '2025-12-28',
  },
  {
    id: 'pay-002', orgId: 'asotrans_ilave', orgName: 'ASOTRANS ILAVE', subscriptionId: 'sub-004',
    concept: 'Suscripción mensual PRO agosto 2026 + 15 kits GPS',
    quoteNumber: 'COT-2026-0078',
    amount: 4427, currency: 'PEN', method: 'DEPOSITO', bank: 'Interbank',
    operationNumber: '78901234', paymentDate: '2026-08-27',
    status: 'EN_REVISION', observations: 'Adjuntan voucher escaneado. Pendiente verificación de número de operación.',
    createdAt: '2026-08-28',
  },
  {
    id: 'pay-003', orgId: 'transtiti', orgName: 'TRANSTITI', subscriptionId: 'sub-002',
    concept: 'Suscripción mensual Operación — primer mes',
    amount: 150, currency: 'PEN', method: 'TRANSFERENCIA', bank: 'BBVA',
    operationNumber: '12345678', paymentDate: '2026-08-20',
    status: 'PENDIENTE', observations: '',
    createdAt: '2026-08-20',
  },
];

export const COMMERCIAL_REQUESTS: CommercialRequest[] = [
  {
    id: 'cr-001', orgName: 'ASOTRANS NORTE S.A.', ruc: '20601000099',
    city: 'Puno', routes: 'Puno → Juliaca, Juliaca → Puno',
    contactName: 'Martín Quispe Apaza', contactEmail: 'mquispe@asotrasnorte.pe', contactPhone: '987654321',
    totalUnits: 45, gpsUnits: 20, period: 'ANUAL', comments: 'Operamos 6 días. Necesitamos kiosco digital.',
    status: 'EN_PROCESO', createdAt: '2026-08-22',
  },
  {
    id: 'cr-002', orgName: 'Transportes del Sur', ruc: '',
    city: 'Desaguadero', routes: 'Desaguadero → Puno',
    contactName: 'Elvira Mamani Torres', contactEmail: 'elvira@transsur.pe', contactPhone: '951234567',
    totalUnits: 18, gpsUnits: 0, period: 'MENSUAL', comments: '',
    status: 'NUEVA', createdAt: '2026-08-29',
  },
  {
    id: 'cr-003', orgName: 'Flota Altiplano E.I.R.L.', ruc: '20601000055',
    city: 'Juliaca', routes: 'Juliaca → Puno → Juli',
    contactName: 'Roberto Condori', contactEmail: 'r.condori@flotaaltiplano.pe', contactPhone: '966321456',
    totalUnits: 30, gpsUnits: 30, period: 'ANUAL', comments: 'Necesitamos GPS en todas las unidades.',
    status: 'PROPUESTA_ENVIADA', createdAt: '2026-08-10',
  },
];

export const GPS_DEVICES: GPSDevice[] = [
  { id: 'gps-001', imei: '354301234500001', model: 'Teltonika FMB920', orgId: 'atipcar', orgName: 'ATIPCAR', unitCode: 'U-012', plate: 'B4K-123', simNumber: '51987000001', status: 'EN_LINEA', installedAt: '2026-01-15', lastSignal: '2026-08-29T06:52:00', firmwareVersion: '03.27.14' },
  { id: 'gps-002', imei: '354301234500002', model: 'Teltonika FMB920', orgId: 'atipcar', orgName: 'ATIPCAR', unitCode: 'U-007', plate: 'C2M-891', simNumber: '51987000002', status: 'EN_LINEA', installedAt: '2026-01-15', lastSignal: '2026-08-29T06:48:00', firmwareVersion: '03.27.14' },
  { id: 'gps-003', imei: '354301234500003', model: 'Teltonika FMB920', orgId: 'atipcar', orgName: 'ATIPCAR', unitCode: 'U-003', plate: 'A9F-561', simNumber: '51987000003', status: 'SIN_SENAL', installedAt: '2026-01-20', lastSignal: '2026-08-27T14:20:00', firmwareVersion: '03.27.14' },
  { id: 'gps-004', imei: '354301234500004', model: 'Teltonika FMB140', orgId: 'asotrans_ilave', orgName: 'ASOTRANS ILAVE', status: 'PENDIENTE', firmwareVersion: '03.25.00' },
  { id: 'gps-005', imei: '354301234500005', model: 'Teltonika FMB140', orgId: 'asotrans_ilave', orgName: 'ASOTRANS ILAVE', status: 'PENDIENTE', firmwareVersion: '03.25.00' },
  { id: 'gps-045', imei: '866194070000045', model: 'Teltonika FMC130', orgId: 'atipcar', orgName: 'ATIPCAR', unitCode: '045', plate: 'T5E-045', simNumber: '51969450045', status: 'EN_LINEA', installedAt: '2026-08-20', lastSignal: '2026-08-29T08:42:00', firmwareVersion: '03.29.00' },
];
