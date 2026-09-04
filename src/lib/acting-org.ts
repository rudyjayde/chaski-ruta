// Modo "Entrar como administrador": permite que un Super Admin actue temporalmente
// como si fuera el admin de una asociacion especifica, reutilizando el mismo
// AdminApp que usan los administradores reales -- evita duplicar pantallas
// (Flota, Colas, Reportes, etc. ya existen, no hace falta una vista aparte).
//
// El backend ya esta preparado para esto: resolveOrgId() en tenant.ts acepta
// ?organizationId= en la query cuando quien pregunta es SUPERADMIN (para
// cualquier otro rol lo ignora y usa siempre su propia asociacion -- nunca es
// un riesgo de seguridad). Este modulo solo guarda cual asociacion esta
// "actuando" ahora mismo; ver withActingOrg() en operacion-api.ts, que se lo
// agrega automaticamente a todas las llamadas al backend.
const ORG_ID_KEY = 'chaski-acting-org-id';
const ORG_NAME_KEY = 'chaski-acting-org-name';

export function getActingOrgId(): string | null {
  return sessionStorage.getItem(ORG_ID_KEY);
}

export function getActingOrgName(): string | null {
  return sessionStorage.getItem(ORG_NAME_KEY);
}

export function setActingOrg(org: { id: string; name: string } | null): void {
  if (org) {
    sessionStorage.setItem(ORG_ID_KEY, org.id);
    sessionStorage.setItem(ORG_NAME_KEY, org.name);
  } else {
    sessionStorage.removeItem(ORG_ID_KEY);
    sessionStorage.removeItem(ORG_NAME_KEY);
  }
}
