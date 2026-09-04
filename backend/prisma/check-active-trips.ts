// Diagnostico de solo lectura: lista todos los viajes con estado ACTIVO,
// para entender por que una unidad no puede inscribirse en cola.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const trips = await prisma.trip.findMany({
    where: { status: 'ACTIVO' },
    include: { vehicle: true, driver: true },
    orderBy: { actualDeparture: 'asc' },
  });

  if (trips.length === 0) {
    console.log('No hay ningun viaje ACTIVO en este momento.');
    return;
  }

  console.log(`Viajes ACTIVOS encontrados: ${trips.length}\n`);
  for (const t of trips) {
    console.log(
      `- Unidad ${t.vehicle.code} (${t.vehicle.plate}) · ruta ${t.route} · conductor ${t.driver?.name ?? '—'} · ` +
      `salida real ${t.actualDeparture?.toISOString() ?? '—'} · tripId ${t.id}`
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
