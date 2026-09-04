// Uso unico: vincula al conductor de prueba (unidad 001, Roberto Mamani Apaza)
// a un Gmail real para poder probar "Sign in with Google" como conductor.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.person.update({
    where: { email_role: { email: 'r.mamani@atipcar.test', role: 'CONDUCTOR' } },
    data: { email: 'nagmacmc@gmail.com' },
  });
  console.log(`Actualizado: ${updated.name} -> ${updated.email} (status: ${updated.status}, rol: ${updated.role}, unidad: ${updated.code})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
