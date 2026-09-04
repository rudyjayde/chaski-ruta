import { PrismaClient, PersonRole, VehicleType, VehicleRouteAssignment, CompanyStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// 1. Super Admin de CHASKI AI (PENDIENTE — se activa con el primer login real
//    de Google, mismo flujo que cualquier persona invitada). Ver AuthService.
// ---------------------------------------------------------------------------
async function seedSuperAdmin() {
  const email = 'chaskiai7@gmail.com';
  const existing = await prisma.person.findFirst({ where: { email, role: PersonRole.SUPERADMIN } });
  if (existing) {
    console.log(`Super Admin ya existe (${email}), no se crea de nuevo.`);
    return;
  }
  const superadmin = await prisma.person.create({
    data: { email, name: 'CHASKI AI', role: PersonRole.SUPERADMIN, status: 'PENDIENTE', organizationId: null },
  });
  console.log('Super Admin creado:', superadmin.email, '- inicia sesion con Google para activarlo.');
}

// ---------------------------------------------------------------------------
// 2. ATIPCAR: organizacion real (primer cliente), con sus 5 empresas miembro
//    y una flota inicial de unidades — datos tomados del prototipo ya validado
//    en docs/planes/plan-operacion.md. TODAS las personas quedan PENDIENTE:
//    en el sistema real nadie ha iniciado sesion con Google todavia (a
//    diferencia del prototipo de UI, que las mostraba como ACTIVO por demo).
//    Las colas, manifiestos, viajes y reubicaciones NO se siembran aqui —
//    esos nacen del uso real de la plataforma, no de datos inventados.
// ---------------------------------------------------------------------------

const COMPANIES = [
  { key: 'fatima', name: 'Virgen de Fátima', ruc: '20601234567', legalRep: 'Aurelio Ticona Callo', phone: '951234001', email: 'fatima@atipcar.test', status: CompanyStatus.ACTIVA },
  { key: 'borja', name: 'San Francisco de Borja', ruc: '20601234568', legalRep: 'Gregorio Mamani Ticona', phone: '951234002', email: 'borja@atipcar.test', status: CompanyStatus.ACTIVA },
  { key: 'surandino', name: 'Sur Andino', ruc: '20601234569', legalRep: 'Elena Quispe Flores', phone: '951234003', email: 'surandino@atipcar.test', status: CompanyStatus.ACTIVA },
  { key: 'litoral', name: 'Litoral', ruc: '20601234570', legalRep: 'Bernardo Cruz Apaza', phone: '951234004', email: 'litoral@atipcar.test', status: CompanyStatus.OBSERVADA },
  { key: 'sanmiguel', name: 'San Miguel', ruc: '20601234571', legalRep: 'Felicitas Ramos Condori', phone: '951234005', email: 'sanmiguel@atipcar.test', status: CompanyStatus.ACTIVA },
] as const;

const PEOPLE = [
  { key: 'admin', name: 'Rosa Huanca Flores', email: 'importstarperuvian@gmail.com', dni: '45678903', phone: '951099001', role: PersonRole.ADMINISTRADOR },

  { key: 'driver-001', name: 'Roberto Mamani Apaza', email: 'nagmacmc@gmail.com', dni: '40100001', phone: '951001001', role: PersonRole.CONDUCTOR },
  { key: 'partner-001', name: 'Aurelio Ticona Callo', email: 'a.ticona@atipcar.test', dni: '29100001', phone: '951234001', role: PersonRole.SOCIO },

  { key: 'driver-002', name: 'Isidro Mamani Callo', email: 'i.mamani@atipcar.test', dni: '40124001', phone: '951002001', role: PersonRole.CONDUCTOR }, // dueño-conductor: también es el socio de su unidad

  { key: 'driver-003', name: 'Héctor Apaza Condori', email: 'h.apaza@atipcar.test', dni: '40100004', phone: '951001004', role: PersonRole.CONDUCTOR },
  { key: 'driver-004', name: 'Carlos Ticona Mamani', email: 'c.ticona@atipcar.test', dni: '40100006', phone: '951001006', role: PersonRole.CONDUCTOR },
  { key: 'partner-003-004', name: 'Luisa Ticona Callo', email: 'l.ticona@atipcar.test', dni: '29100003', phone: '951234006', role: PersonRole.SOCIO }, // socia de las unidades 003 y 004

  { key: 'driver-005', name: 'Feliciano Torres Apaza', email: 'f.torres@atipcar.test', dni: '40124002', phone: '951002002', role: PersonRole.CONDUCTOR },
  { key: 'partner-005', name: 'Felicitas Ramos Condori', email: 'f.ramos@atipcar.test', dni: '29100005', phone: '951234005', role: PersonRole.SOCIO },

  { key: 'driver-006', name: 'Marco Ramos Apaza', email: 'm.ramos@atipcar.test', dni: '40100007', phone: '951001007', role: PersonRole.CONDUCTOR },
  { key: 'partner-006', name: 'Gregorio Mamani Ticona', email: 'g.mamani@atipcar.test', dni: '29100006', phone: '951234002', role: PersonRole.SOCIO },

  { key: 'driver-007', name: 'José Quispe Mamani', email: 'j.quispe@atipcar.test', dni: '40100010', phone: '951001010', role: PersonRole.CONDUCTOR },
  { key: 'partner-007-015', name: 'Mario Condori Apaza', email: 'socio@acceso.atipcar.test', dni: '45678902', phone: '951015002', role: PersonRole.SOCIO }, // socio de las unidades 007 y 015

  { key: 'driver-008', name: 'Antonio Ticona Ramos', email: 'a.ticona.ramos@atipcar.test', dni: '29100008', phone: '951001008', role: PersonRole.CONDUCTOR }, // dueño-conductor

  { key: 'driver-015', name: 'José "Pepito" Quispe Mamani', email: 'pepito@acceso.atipcar.test', dni: '45678901', phone: '951015001', role: PersonRole.CONDUCTOR },

  { key: 'driver-022', name: 'Pablo Cruz Mamani', email: 'p.cruz@atipcar.test', dni: '40100008', phone: '951001008', role: PersonRole.CONDUCTOR },
  { key: 'partner-022', name: 'Bernardo Cruz Apaza', email: 'b.cruz@atipcar.test', dni: '29100022', phone: '951234004', role: PersonRole.SOCIO },

  { key: 'driver-041', name: 'Lucía Quispe Condori', email: 'conductor.jp1@acceso.atipcar.test', dni: '48000041', phone: '999100041', role: PersonRole.CONDUCTOR },
  { key: 'partner-041', name: 'Socio prueba 041', email: 'socio041@acceso.atipcar.test', dni: '48001041', phone: '999200041', role: PersonRole.SOCIO },

  { key: 'driver-042', name: 'Daniel Mamani Apaza', email: 'conductor.jp2@acceso.atipcar.test', dni: '48000042', phone: '999100042', role: PersonRole.CONDUCTOR },
  { key: 'partner-042', name: 'Socio prueba 042', email: 'socio042@acceso.atipcar.test', dni: '48001042', phone: '999200042', role: PersonRole.SOCIO },

  { key: 'driver-043', name: 'Elena Torres Callo', email: 'conductor.pj1@acceso.atipcar.test', dni: '48000043', phone: '999100043', role: PersonRole.CONDUCTOR },
  { key: 'partner-043', name: 'Socio prueba 043', email: 'socio043@acceso.atipcar.test', dni: '48001043', phone: '999200043', role: PersonRole.SOCIO },

  { key: 'driver-044', name: 'Miguel Ramos Flores', email: 'conductor.pj2@acceso.atipcar.test', dni: '48000044', phone: '999100044', role: PersonRole.CONDUCTOR },
  { key: 'partner-044', name: 'Socio prueba 044', email: 'socio044@acceso.atipcar.test', dni: '48001044', phone: '999200044', role: PersonRole.SOCIO },

  { key: 'driver-045', name: 'Alonso Quispe Flores', email: 'conductor.gps@acceso.atipcar.test', dni: '48000045', phone: '969450002', role: PersonRole.CONDUCTOR },
  { key: 'partner-045', name: 'Ricardo Mamani Condori', email: 'socio.gps@acceso.atipcar.test', dni: '48002045', phone: '969450001', role: PersonRole.SOCIO },
] as const;

const VEHICLES = [
  { code: '001', company: 'fatima', vehicleType: VehicleType.SPRINTER, plate: 'Z0A-001', model: 'Mercedes Benz Sprinter 519', year: 2021, route: VehicleRouteAssignment.AMBAS, driver: 'driver-001', partner: 'partner-001' },
  { code: '002', company: 'surandino', vehicleType: VehicleType.HIACE, plate: 'Z1B-445', model: 'Toyota Hiace Commuter', year: 2020, route: VehicleRouteAssignment.PUNO_JULI, driver: 'driver-002', partner: 'driver-002' },
  { code: '003', company: 'fatima', vehicleType: VehicleType.SPRINTER, plate: 'Z2C-412', model: 'Mercedes Benz Sprinter 519', year: 2022, route: VehicleRouteAssignment.AMBAS, driver: 'driver-003', partner: 'partner-003-004' },
  { code: '004', company: 'fatima', vehicleType: VehicleType.SPRINTER, plate: 'Z1A-123', model: 'Mercedes Benz Sprinter 516', year: 2019, route: VehicleRouteAssignment.AMBAS, driver: 'driver-004', partner: 'partner-003-004' },
  { code: '005', company: 'sanmiguel', vehicleType: VehicleType.SPRINTER, plate: 'Z2C-556', model: 'Mercedes Benz Sprinter 519', year: 2023, route: VehicleRouteAssignment.PUNO_JULI, driver: 'driver-005', partner: 'partner-005' },
  { code: '006', company: 'borja', vehicleType: VehicleType.HIACE, plate: 'Z2B-234', model: 'Toyota Hiace Commuter', year: 2021, route: VehicleRouteAssignment.AMBAS, driver: 'driver-006', partner: 'partner-006' },
  { code: '007', company: 'surandino', vehicleType: VehicleType.MASTER, plate: 'Z4B-318', model: 'Renault Master Minibus', year: 2020, route: VehicleRouteAssignment.AMBAS, driver: 'driver-007', partner: 'partner-007-015' },
  { code: '008', company: 'borja', vehicleType: VehicleType.SPRINTER, plate: 'Z2A-903', model: 'Mercedes Benz Sprinter 519', year: 2022, route: VehicleRouteAssignment.AMBAS, driver: 'driver-008', partner: 'driver-008' },
  { code: '015', company: 'sanmiguel', vehicleType: VehicleType.SPRINTER, plate: 'Z5C-444', model: 'Mercedes Benz Sprinter 519', year: 2023, route: VehicleRouteAssignment.AMBAS, driver: 'driver-015', partner: 'partner-007-015' },
  { code: '022', company: 'litoral', vehicleType: VehicleType.HIACE, plate: 'Z1D-567', model: 'Toyota Hiace Commuter', year: 2019, route: VehicleRouteAssignment.PUNO_JULI, driver: 'driver-022', partner: 'partner-022' },
  { code: '041', company: 'fatima', vehicleType: VehicleType.SPRINTER, plate: 'T1A-041', model: 'Mercedes Benz Sprinter 519', year: 2024, route: VehicleRouteAssignment.JULI_PUNO, driver: 'driver-041', partner: 'partner-041' },
  { code: '042', company: 'borja', vehicleType: VehicleType.HIACE, plate: 'T2B-042', model: 'Toyota Hiace Commuter', year: 2023, route: VehicleRouteAssignment.JULI_PUNO, driver: 'driver-042', partner: 'partner-042' },
  { code: '043', company: 'surandino', vehicleType: VehicleType.SPRINTER, plate: 'T3C-043', model: 'Mercedes Benz Sprinter 516', year: 2022, route: VehicleRouteAssignment.PUNO_JULI, driver: 'driver-043', partner: 'partner-043' },
  { code: '044', company: 'sanmiguel', vehicleType: VehicleType.HIACE, plate: 'T4D-044', model: 'Toyota Hiace Commuter', year: 2024, route: VehicleRouteAssignment.PUNO_JULI, driver: 'driver-044', partner: 'partner-044' },
  { code: '045', company: 'litoral', vehicleType: VehicleType.HIACE, plate: 'T5E-045', model: 'Toyota Hiace Commuter', year: 2024, route: VehicleRouteAssignment.AMBAS, driver: 'driver-045', partner: 'partner-045' },
] as const;

async function seedAtipcar() {
  const org = await prisma.organization.upsert({
    where: { ruc: '20601000001' },
    update: {},
    create: {
      name: 'ATIPCAR',
      ruc: '20601000001',
      status: 'ACTIVA',
      plan: 'OPERACION',
      driverLiveMapEnabled: true,
      whatsappAssistantEnabled: false,
    },
  });

  await prisma.operationalConfig.upsert({
    where: { organizationId: org.id },
    update: {},
    create: { organizationId: org.id },
  });

  const companyIds: Record<string, string> = {};
  for (const c of COMPANIES) {
    const company = await prisma.company.upsert({
      where: { organizationId_ruc: { organizationId: org.id, ruc: c.ruc } },
      update: {},
      create: {
        organizationId: org.id,
        name: c.name,
        ruc: c.ruc,
        legalRep: c.legalRep,
        phone: c.phone,
        email: c.email,
        status: c.status,
      },
    });
    companyIds[c.key] = company.id;
  }

  const personIds: Record<string, string> = {};
  for (const p of PEOPLE) {
    const person = await prisma.person.upsert({
      where: { email_role: { email: p.email, role: p.role } },
      update: {},
      create: {
        organizationId: org.id,
        name: p.name,
        email: p.email,
        dni: p.dni,
        phone: p.phone,
        role: p.role,
        status: 'PENDIENTE',
      },
    });
    personIds[p.key] = person.id;
  }

  for (const v of VEHICLES) {
    const vehicle = await prisma.vehicle.upsert({
      where: { organizationId_code: { organizationId: org.id, code: v.code } },
      update: {},
      create: {
        organizationId: org.id,
        code: v.code,
        companyId: companyIds[v.company],
        vehicleType: v.vehicleType,
        plate: v.plate,
        model: v.model,
        year: v.year,
        status: 'ACTIVO',
        routeAssignment: v.route,
        currentDriverId: personIds[v.driver],
        partnerId: personIds[v.partner],
      },
    });

    // El codigo de unidad se refleja tambien en el Person del conductor asignado
    // (Person.code / Person.company / Person.linkedUnit) — es lo que el
    // frontend real usa para saber "cual es mi vehiculo" cuando el conductor
    // entra por Google OAuth (ver src/pages/driver/DriverApp.tsx, DriverQueue).
    if (personIds[v.driver]) {
      const companyName = COMPANIES.find(c => c.key === v.company)?.name ?? null;
      await prisma.person.update({
        where: { id: personIds[v.driver] },
        data: { code: v.code, company: companyName, linkedUnit: v.code },
      });
    }

    const existingPlate = await prisma.vehiclePlateHistory.findFirst({
      where: { vehicleId: vehicle.id, plate: v.plate },
    });
    if (!existingPlate) {
      await prisma.vehiclePlateHistory.create({
        data: { vehicleId: vehicle.id, plate: v.plate, fromDate: new Date() },
      });
    }
  }

  console.log(`ATIPCAR sembrado: ${COMPANIES.length} empresas, ${VEHICLES.length} vehículos, ${PEOPLE.length} personas (todas PENDIENTE).`);
}

async function main() {
  await seedSuperAdmin();
  await seedAtipcar();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
