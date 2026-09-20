import { Prisma } from '@prisma/client';

// Numeros correlativos que son UNICOS en todo el sistema (manifiestos, ordenes
// de reubicacion, reclamos). Bug real (19 sept 2026): el siguiente numero se
// calculaba solo con las filas de la PROPIA asociacion, pero la restriccion
// unica de la base de datos es global -- asi que cualquier asociacion nueva
// intentaba su primer numero (…-0001), chocaba con el de otra asociacion y
// terminaba en error 500 (sin manifiesto nadie puede marcar salida).
//
// Aqui se toma el MAXIMO numerico ya usado por cualquiera (no un conteo de
// filas ni un orden de texto: como texto "9999" > "10000", y un conteo se
// desincroniza en cuanto hay un hueco).
type Db = { $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T> };

export async function nextSequenceNumber(db: Db, table: string, column: string, prefix: string, width = 4): Promise<string> {
  // table/column son constantes del codigo (nunca datos del usuario); el prefijo va como parametro.
  const col = Prisma.raw(`"${column}"`);
  const tbl = Prisma.raw(`"${table}"`);
  const from = Prisma.raw(String(prefix.length + 1));
  const rows = await db.$queryRaw<{ max: number | null }[]>(
    Prisma.sql`SELECT MAX(CAST(SUBSTRING(${col} FROM ${from}) AS INTEGER)) AS max FROM ${tbl} WHERE ${col} LIKE ${prefix + '%'}`,
  );
  const max = Number(rows[0]?.max ?? 0);
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}
