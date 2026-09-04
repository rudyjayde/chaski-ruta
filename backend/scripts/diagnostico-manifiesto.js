/**
 * Diagnostico de SOLO LECTURA -- no cambia nada en la base de datos.
 * Muestra todos los viajes (Trip) y manifiestos (Manifest) de una unidad,
 * para entender por que el panel conductor dice "Este viaje ya tiene un
 * manifiesto" al presionar "Abrir manifiesto".
 *
 * Uso:
 *   node scripts/diagnostico-manifiesto.js --org="ATIPCAR" --vehicle=001
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { org: null, vehicle: null };
  for (const arg of args) {
    if (arg.startsWith('--org=')) out.org = arg.slice('--org='.length);
    else if (arg.startsWith('--vehicle=')) out.vehicle = arg.slice('--vehicle='.length);
  }
  return out;
}

async function findOrganization(orgArg) {
  if (!orgArg) {
    console.error('Falta --org="nombre o RUC de la asociacion"');
    process.exit(1);
  }
  const byRuc = await prisma.organization.findUnique({ where: { ruc: orgArg } });
  if (byRuc) return byRuc;
  const matches = await prisma.organization.findMany({ where: { name: { contains: orgArg, mode: 'insensitive' } } });
  if (matches.length === 1) return matches[0];
  console.error(`No se encontro una asociacion unica que coincida con "${orgArg}".`);
  process.exit(1);
}

async function main() {
  const { org: orgArg, vehicle: vehicleCode } = parseArgs();
  const org = await findOrganization(orgArg);

  const vehicle = await prisma.vehicle.findFirst({
    where: { organizationId: org.id, code: vehicleCode },
    include: { currentDriver: true },
  });
  if (!vehicle) {
    console.error(`No se encontro la unidad ${vehicleCode} en ${org.name}.`);
    process.exit(1);
  }

  console.log(`Unidad: ${vehicle.code} | ${vehicle.plate} | conductor: ${vehicle.currentDriver?.name ?? '(sin conductor)'}\n`);

  const trips = await prisma.trip.findMany({
    where: { organizationId: org.id, vehicleId: vehicle.id },
    include: { manifest: true },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Viajes (${trips.length}), mas reciente primero:`);
  for (const t of trips) {
    console.log(`  - id=${t.id}`);
    console.log(`    ruta=${t.route} estado=${t.status} salida=${t.actualDeparture ?? '-'} llegada=${t.actualArrival ?? '-'} creado=${t.createdAt.toISOString()}`);
    console.log(`    manifiesto vinculado: ${t.manifest ? `id=${t.manifest.id} numero=${t.manifest.number} estado=${t.manifest.status}` : '(ninguno)'}`);
  }

  const queueEntries = await prisma.queueEntry.findMany({
    where: { organizationId: org.id, vehicleId: vehicle.id },
    orderBy: { registeredAt: 'desc' },
  });
  console.log(`\nEntradas de cola activas (${queueEntries.length}):`);
  for (const q of queueEntries) {
    console.log(`  - id=${q.id} ruta=${q.route} estado=${q.status} posicion=${q.position} inscrito=${q.registeredAt.toISOString()}`);
  }

  const manifestsByVehicle = await prisma.manifest.findMany({
    where: { organizationId: org.id, vehicleId: vehicle.id },
    orderBy: { date: 'desc' },
  });
  console.log(`\nTodos los manifiestos de esta unidad (${manifestsByVehicle.length}):`);
  for (const m of manifestsByVehicle) {
    console.log(`  - id=${m.id} numero=${m.number} tripId=${m.tripId} estado=${m.status} pendingDigitize=${m.pendingDigitize} fecha=${m.date.toISOString()}`);
  }
}

main()
  .catch((err) => {
    console.error('Algo fallo:');
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
