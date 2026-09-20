import { JwtPayload } from '../auth/jwt.strategy';

// Un socio o un conductor ve nombres y codigos de los demas (la cola y la flota
// son compartidas), pero NUNCA su DNI, celular o correo: eso es solo del
// administrador (y de cada persona sobre si misma). Bug real (19 sept 2026):
// las colas, la flota y los viajes devolvian esos datos a cualquier rol.
export const isStaff = (actor: JwtPayload) => actor.role === 'ADMINISTRADOR' || actor.role === 'SUPERADMIN';

export function redactPerson<T extends { id: string } | null | undefined>(person: T, actor: JwtPayload): T {
  if (!person || isStaff(actor) || person.id === actor.sub) return person;
  const p = person as unknown as { id: string; name?: string; code?: string | null };
  return { id: p.id, name: p.name, code: p.code ?? null } as unknown as T;
}
