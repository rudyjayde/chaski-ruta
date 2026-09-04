/**
 * Limpieza de unidades/conductores de prueba.
 *
 * Elimina TODAS las unidades (vehículos) de una asociación excepto las que
 * indiques en --keep (por defecto "001"), junto con todo lo que tengan en
 * cola, viajes, manifiestos y pasajeros, más los conductores (Person con rol
 * CONDUCTOR) que manejan esas unidades.
 *
 * NO borra: socios (rol SOCIO), administradores, empresas, ni el historial de
 * auditoría (AuditEntry) — si un conductor eliminado aparece como actor en
 * una auditoría, esa fila de auditoría se conserva, solo se le quita la
 * referencia a la persona (el "actorRole" y la descripción del cambio quedan
 * intactos, como debe ser: nunca se debe perder ese historial).
 *
 * Tampoco toca a un conductor que también maneje una unidad que SÍ se
 * conserva — a esa persona nunca se le borra la cuenta, aunque también haya
 * manejado unidades eliminadas.
 *
 * MODO SEGURO POR DEFECTO: sin --confirm, solo IMPRIME qué se borraría (dry
 * run) — no toca la base de datos. Revisa la lista con calma antes de correr
 * con --confirm.
 *
 * Uso:
 *   node scripts/limpiar-unidades-prueba.js --org="ATIPCAR"                  (vista previa)
 *   node scripts/limpiar-unidades-prueba.js --org="ATIPCAR" --keep=001,002   (conservar varias)
 *   node scripts/limpiar-unidades-prueba.js --org="ATIPCAR" --confirm        (ejecuta el borrado)
 *
 * --org acepta el nombre (coincidencia parcial, sin distinguir mayúsculas) o
 * el RUC exacto de la asociación. Es obligatorio, para nunca borrar la
 * asociación equivocada por accidente.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { confirm: false, org: null, keep: ['001'] };
  for (const arg of args) {
    if (arg === '--confirm') out.confirm = true;
    else if (arg.startsWith('--org=')) out.org = arg.slice('--org='.length);
    else if (arg.startsWith('--keep=')) {
      out.keep = arg
        .slice('--keep='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return out;
}

async function findOrganization(orgArg) {
  if (!orgArg) {
    console.error('Falta --org="nombre o RUC de la asociacion". Ejemplo: --org="ATIPCAR"');
    const all = await prisma.organization.findMany({ select: { id: true, name: true, ruc: true } });
    console.error('\nAsociaciones existentes:');
    for (const o of all) console.error(`  - ${o.name} (RUC ${o.ruc})`);
    process.exit(1);
  }
  const byRuc = await prisma.organization.findUnique({ where: { ruc: orgArg } });
  if (byRuc) return byRuc;

  const matches = await prisma.organization.findMany({
    where: { name: { contains: orgArg, mode: 'insensitive' } },
  });
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    console.error(`No se encontro ninguna asociacion que coincida con "${orgArg}".`);
    process.exit(1);
  }
  console.error(`Hay ${matches.length} asociaciones que coinciden con "${orgArg}" — se mas especifico:`);
  for (const o of matches) console.error(`  - ${o.name} (RUC ${o.ruc})`);
  process.exit(1);
}

async function main() {
  const { confirm, org: orgArg, keep } = parseArgs();
  const org = await findOrganization(orgArg);

  console.log(`Asociacion: ${org.name} (RUC ${org.ruc})`);
  console.log(`Unidades que se CONSERVAN: ${keep.join(', ')}\n`);

  const allVehicles = await prisma.vehicle.findMany({
    where: { organizationId: org.id },
    include: { currentDriver: true, partner: true, company: true },
  });

  const keepVehicles = allVehicles.filter((v) => keep.includes(v.code));
  const deleteVehicles = allVehicles.filter((v) => !keep.includes(v.code));

  if (deleteVehicles.length === 0) {
    console.log('No hay unidades para eliminar (todas coinciden con --keep). Nada que hacer.');
    return;
  }

  const deleteVehicleIds = deleteVehicles.map((v) => v.id);

  // Personas que quedan protegidas porque manejan o son socias de una unidad conservada.
  const protectedPersonIds = new Set(
    keepVehicles.flatMap((v) => [v.currentDriverId, v.partnerId].filter(Boolean)),
  );

  const driverIdsOfDeletedVehicles = [
    ...new Set(deleteVehicles.map((v) => v.currentDriverId).filter(Boolean)),
  ];
  const conductorsToDelete = driverIdsOfDeletedVehicles.length
    ? await prisma.person.findMany({
        where: {
          id: { in: driverIdsOfDeletedVehicles },
          role: 'CONDUCTOR',
          NOT: { id: { in: [...protectedPersonIds] } },
        },
      })
    : [];

  const [queueEntries, trips, manifests, plateHistory, relocationUnits] = await Promise.all([
    prisma.queueEntry.count({ where: { vehicleId: { in: deleteVehicleIds } } }),
    prisma.trip.findMany({ where: { vehicleId: { in: deleteVehicleIds } }, select: { id: true } }),
    prisma.manifest.findMany({ where: { vehicleId: { in: deleteVehicleIds } }, select: { id: true } }),
    prisma.vehiclePlateHistory.count({ where: { vehicleId: { in: deleteVehicleIds } } }),
    prisma.relocationUnit.count({ where: { vehicleId: { in: deleteVehicleIds } } }),
  ]);
  const tripIds = trips.map((t) => t.id);
  const manifestIds = manifests.map((m) => m.id);
  const passengers = manifestIds.length
    ? await prisma.passenger.count({ where: { manifestId: { in: manifestIds } } })
    : 0;

  console.log(`Unidades a ELIMINAR (${deleteVehicles.length}):`);
  for (const v of deleteVehicles) {
    console.log(
      `  - ${v.code} | ${v.plate} | ${v.model} | empresa: ${v.company?.name ?? '-'} | conductor: ${
        v.currentDriver?.name ?? '(sin conductor)'
      }`,
    );
  }

  console.log(`\nConductores a ELIMINAR (${conductorsToDelete.length}):`);
  for (const p of conductorsToDelete) {
    console.log(`  - ${p.name} | ${p.email} | DNI ${p.dni ?? '-'}`);
  }
  if (driverIdsOfDeletedVehicles.length > conductorsToDelete.length) {
    console.log(
      `  (nota: algun conductor de una unidad eliminada NO se borra porque tambien maneja o es socio de una unidad conservada)`,
    );
  }

  console.log('\nRegistros relacionados que tambien se eliminan:');
  console.log(`  - Entradas de cola: ${queueEntries}`);
  console.log(`  - Viajes: ${tripIds.length}`);
  console.log(`  - Manifiestos: ${manifestIds.length}`);
  console.log(`  - Pasajeros: ${passengers}`);
  console.log(`  - Historial de placas: ${plateHistory}`);
  console.log(`  - Unidades en ordenes de reubicacion: ${relocationUnits}`);
  console.log('\n(El historial de auditoria NUNCA se borra — solo se le quita la referencia a los conductores eliminados.)');

  if (!confirm) {
    console.log('\n--- MODO VISTA PREVIA (dry run) --- no se borro nada.');
    console.log('Si esta lista es correcta, vuelve a correr el mismo comando agregando --confirm al final.');
    return;
  }

  console.log('\n--confirm detectado — ejecutando el borrado...');

  await prisma.$transaction(async (tx) => {
    if (passengers > 0) {
      await tx.passenger.deleteMany({ where: { manifestId: { in: manifestIds } } });
    }
    if (manifestIds.length > 0) {
      await tx.manifest.deleteMany({ where: { id: { in: manifestIds } } });
    }
    await tx.relocationUnit.deleteMany({ where: { vehicleId: { in: deleteVehicleIds } } });

    // Evita romper la cadena de predecesores (§3.5) si algun viaje conservado
    // apunta a un viaje que se va a borrar.
    if (tripIds.length > 0) {
      await tx.trip.updateMany({
        where: { predecessorTripId: { in: tripIds } },
        data: { predecessorTripId: null },
      });
      await tx.trip.deleteMany({ where: { id: { in: tripIds } } });
    }

    await tx.queueEntry.deleteMany({ where: { vehicleId: { in: deleteVehicleIds } } });
    await tx.vehiclePlateHistory.deleteMany({ where: { vehicleId: { in: deleteVehicleIds } } });

    if (conductorsToDelete.length > 0) {
      const conductorIds = conductorsToDelete.map((p) => p.id);
      await tx.auditEntry.updateMany({
        where: { actorId: { in: conductorIds } },
        data: { actorId: null },
      });
    }

    await tx.vehicle.deleteMany({ where: { id: { in: deleteVehicleIds } } });

    if (conductorsToDelete.length > 0) {
      await tx.person.deleteMany({ where: { id: { in: conductorsToDelete.map((p) => p.id) } } });
    }
  });

  console.log('\nListo. Se eliminaron las unidades, sus conductores y todo lo relacionado.');
  console.log(`Quedaron activas: ${keep.join(', ')}`);
}

main()
  .catch((err) => {
    console.error('\nAlgo fallo, no se confirma que se haya borrado nada parcialmente sin avisar:');
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
