import { ForbiddenException } from '@nestjs/common';
import { JwtPayload } from '../auth/jwt.strategy';

/**
 * Regla dura del sistema (doc maestro §10): toda consulta o mutacion sobre datos
 * de una asociacion debe verificar que quien pregunta pertenece a esa asociacion,
 * salvo el Super Admin de CHASKI AI, que puede ver cualquiera.
 * Cada servicio que toque datos de una organizationId especifica debe llamar esto
 * ANTES de tocar la base de datos — nunca confiar en un organizationId que venga
 * del body/query de la request, siempre el del JWT.
 */
export function assertOrgAccess(user: JwtPayload, targetOrgId: string): void {
  if (user.role === 'SUPERADMIN') return;
  if (user.organizationId !== targetOrgId) {
    throw new ForbiddenException('No tienes acceso a los datos de esta asociacion');
  }
}

/**
 * Resuelve el organizationId sobre el que va a operar la request:
 * - Persona de una asociacion (ADMINISTRADOR/SOCIO/CONDUCTOR): siempre la suya,
 *   ignora cualquier organizationId que venga en la query (nunca se confia en eso).
 * - SUPERADMIN: exige el organizationId por query, porque el no pertenece a ninguna.
 */
export function resolveOrgId(user: JwtPayload, queryOrgId?: string): string {
  if (user.organizationId) return user.organizationId;
  if (user.role === 'SUPERADMIN' && queryOrgId) return queryOrgId;
  throw new ForbiddenException(
    user.role === 'SUPERADMIN'
      ? 'Falta indicar organizationId en la consulta'
      : 'Esta cuenta no pertenece a ninguna asociacion',
  );
}
