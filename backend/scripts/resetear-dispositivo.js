/**
 * Resetea la vinculacion de dispositivo de un conductor (plan-operacion.md §3.2).
 * Limpia Person.boundDeviceId / boundDeviceSetAt -- nada mas -- para que la
 * cuenta pueda volver a vincularse al proximo dispositivo (o navegador/modo
 * incognito) que use. No borra ni toca ningun otro dato del conductor.
 *
 * Uso:
 *   node scripts/resetear-dispositivo.js --org="ATIPCAR" --vehicle=001
 *   node scripts/resetear-dispositivo.js --org="ATIPCAR" --email=roberto@correo.com
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { org: null, vehicle: null, email: null };
  for (const arg of args) {
    if (arg.startsWith('--org=')) out.org = arg.slice('--org='.length);
    else if (arg.startsWith('--vehicle=')) out.vehicle = arg.slice('--vehicle='.length);
    else if (arg.startsWith('--email=')) out.email = arg.slice('--email='.length);
  }
  return out;
}

async function findOrganization(orgArg) {
  if (!orgArg) {
    console.error('Falta --org="nombre o RUC de la asociacion". Ejemplo: --org="ATIPCAR"');
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
  const { org: orgArg, vehicle: vehicleCode, email } = parseArgs();
  const org = await findOrganization(orgArg);

  let person = null;

  if (vehicleCode) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { organizationId: org.id, code: vehicleCode },
      include: { currentDriver: true },
    });
    if (!vehicle) {
      console.error(`No se encontro la unidad ${vehicleCode} en ${org.name}.`);
      process.exit(1);
    }
    if (!vehicle.currentDriver) {
      console.error(`La unidad ${vehicleCode} no tiene conductor asignado ahora mismo.`);
      process.exit(1);
    }
    person = vehicle.currentDriver;
  } else if (email) {
    person = await prisma.person.findFirst({ where: { organizationId: org.id, email } });
    if (!person) {
      console.error(`No se encontro ningun conductor con el correo "${email}" en ${org.name}.`);
      process.exit(1);
    }
  } else {
    console.error('Falta --vehicle=CODIGO o --email=correo para identificar al conductor.');
    process.exit(1);
  }

  console.log(`Conductor: ${person.name} (${person.email})`);
  console.log(`Dispositivo vinculado actual: ${person.boundDeviceId ?? '(ninguno)'}`);

  if (!person.boundDeviceId) {
    console.log('Ya no tiene ningun dispositivo vinculado — no hay nada que hacer.');
    return;
  }

  await prisma.person.update({
    where: { id: person.id },
    data: { boundDeviceId: null, boundDeviceSetAt: null },
  });

  console.log('\nListo — se limpio la vinculacion.');
  console.log('La proxima vez que esta cuenta se use para inscribirse en una cola, se volvera a vincular al dispositivo/navegador desde el que se haga.');
}

main()
  .catch((err) => {
    console.error('\nAlgo fallo, no se confirma que se haya cambiado nada:');
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
