// Uso unico: la cuenta admin sembrada tenia un correo de prueba
// (admin@acceso.atipcar.test) que no es un Gmail real, asi que no se podia
// entrar con "Sign in with Google". Este script la actualiza al Gmail real
// que Jayde va a usar para probar como administrador de ATIPCAR.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.person.update({
    where: { email_role: { email: 'admin@acceso.atipcar.test', role: 'ADMINISTRADOR' } },
    data: { email: 'importstarperuvian@gmail.com' },
  });
  console.log(`Actualizado: ${updated.name} -> ${updated.email} (status: ${updated.status}, rol: ${updated.role})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
