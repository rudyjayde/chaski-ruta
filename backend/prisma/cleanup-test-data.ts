import { PrismaClient } from '@prisma/client';

// Limpia los datos que dejo test-motor.js (ya borrado) al probar el motor de
// Operacion por API — identifica los registros por los marcadores unicos que
// uso esa prueba, para no tocar nada mas. Se puede borrar despues de correrlo.
const prisma = new PrismaClient();

async function main() {
  // 1. Manifiesto de prueba (pasajero con dni de prueba) + su viaje.
  const testPassenger = await prisma.passenger.findFirst({ where: { dni: '12345678' } });
  if (testPassenger) {
    const manifest = await prisma.manifest.findUnique({ where: { id: testPassenger.manifestId } });
    await prisma.passenger.deleteMany({ where: { manifestId: testPassenger.manifestId } });
    await prisma.manifest.delete({ where: { id: testPassenger.manifestId } });
    if (manifest?.tripId) {
      await prisma.trip.delete({ where: { id: manifest.tripId } });
    }
    console.log('Manifiesto y viaje de prueba eliminados.');
  } else {
    console.log('No se encontro manifiesto de prueba (dni 12345678) — nada que borrar ahi.');
  }

  // 2. Cola de prueba dejada en AUSENTE (unidad 041).
  const staleEntry = await prisma.queueEntry.findFirst({
    where: { vehicle: { code: '041' }, status: 'AUSENTE' },
  });
  if (staleEntry) {
    await prisma.queueEntry.delete({ where: { id: staleEntry.id } });
    console.log('Registro de cola de prueba (unidad 041, AUSENTE) eliminado.');
  }

  // 3. Reubicacion de prueba.
  const testRelocation = await prisma.relocationOrder.findFirst({
    where: { reason: 'Prueba: desequilibrio de flota' },
  });
  if (testRelocation) {
    await prisma.relocationUnit.deleteMany({ where: { relocationOrderId: testRelocation.id } });
    await prisma.relocationOrder.delete({ where: { id: testRelocation.id } });
    console.log('Orden de reubicacion de prueba eliminada.');
  } else {
    console.log('No se encontro reubicacion de prueba — nada que borrar ahi.');
  }

  // 4. Auditoria generada por la prueba (acciones con motivos de prueba).
  const deletedAudit = await prisma.auditEntry.deleteMany({
    where: {
      OR: [
        { reason: { contains: 'Prueba' } },
        { resourceId: staleEntry?.id },
      ],
    },
  });
  console.log(`${deletedAudit.count} registros de auditoria de prueba eliminados.`);

  console.log('Limpieza completa — la base vuelve a tener solo los datos reales sembrados de ATIPCAR.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
