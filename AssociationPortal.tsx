import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle, LogOut, Route as RouteIcon } from 'lucide-react';
import { useAuth } from './src/contexts/AuthContext';
import {
  fetchMyOrganization,
  fetchOrganizationsDirectory,
  type Organization,
  type OrganizationDirectoryEntry,
} from './src/lib/operacion-api';

const CHASKI_WORDMARK_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/e_trim,f_png,q_auto/v1788027352/chaski-AI-nombre_1_1.png';

// Las rutas habilitadas (maximo 2: ida y retorno) las escribe el Super Admin a
// mano; aqui solo se muestran las que ya estan completas.
type RouteNames = {
  routeOriginName?: string | null;
  routeDestinationName?: string | null;
  returnOriginName?: string | null;
  returnDestinationName?: string | null;
};
function enabledRoutes(o?: RouteNames | null): string[] {
  const out: string[] = [];
  const a = o?.routeOriginName?.trim(), b = o?.routeDestinationName?.trim();
  const c = o?.returnOriginName?.trim(), d = o?.returnDestinationName?.trim();
  if (a && b) out.push(`${a} → ${b}`);
  if (c && d) out.push(`${c} → ${d}`);
  return out;
}

// Nombre del terminal 1 y del terminal 2, uno por linea (como en el ejemplo DORADO).
function TerminalBox({ origin, destination, center = true }: { origin?: string; destination?: string; center?: boolean }) {
  return (
    <div className={`mt-3 w-full max-w-xs rounded-md border border-border bg-hover px-3 py-2 flex items-center gap-2 ${center ? 'mx-auto' : ''}`}>
      <RouteIcon size={12} className="text-t2 flex-shrink-0" />
      <div className="min-w-0 text-left">
        <p className="text-xs font-medium text-t1">{origin}</p>
        <p className="text-xs font-medium text-t1 mt-1">{destination}</p>
      </div>
    </div>
  );
}

function roleName(role: string) {
  if (role === 'driver') return 'Conductor';
  if (role === 'partner') return 'Socio';
  if (role === 'admin') return 'Administrador';
  return 'Super Admin';
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Logo real de la asociacion si lo subio el Super Admin; si no, iniciales --
// nunca un logo de relleno o de otra asociacion.
function OrgAvatar({ name, logoUrl, size }: { name: string; logoUrl?: string | null; size: number }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`Logo de ${name}`}
        className="block object-contain mx-auto"
        style={{ height: size, width: 'auto', maxWidth: size * 3.5 }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-hover grid place-items-center font-semibold text-t1 mx-auto"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initialsOf(name)}
    </div>
  );
}

function RouteBadges({ routes, center = true }: { routes: string[]; center?: boolean }) {
  return (
    <div className={`flex items-center flex-wrap gap-2 mt-3 ${center ? 'justify-center' : 'justify-center md:justify-start'}`}>
      {routes.map(route => (
        <span
          key={route}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-hover text-[11px] font-medium text-t1"
        >
          <RouteIcon size={12} className="text-t2" />
          {route}
        </span>
      ))}
    </div>
  );
}

interface Props {
  onEnterAssociation: () => void;
  onLogout: () => void;
}

// Pantalla de bienvenida que se muestra justo despues del login (antes de
// entrar al panel), para admin, socio y conductor — el super admin no pasa por
// aqui (no pertenece a ninguna asociacion cliente, ver App.tsx). Muestra SU
// asociacion (resuelta por el backend en el login, aislamiento estricto por
// organizationId — ver docs/planes §10) y, a modo de vitrina, las demas
// asociaciones ACTIVAS que tambien usan CHASKI AI (solo nombre/RUC/rutas
// publicas via GET /organizations/directory). No es un selector: no se puede
// hacer clic para "entrar" a ninguna asociacion ajena — el backend jamas deja
// operar ni ver datos de ninguna que no sea la propia.
export default function AssociationPortal({ onEnterAssociation, onLogout }: Props) {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [otherOrgs, setOtherOrgs] = useState<OrganizationDirectoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchMyOrganization()
      .then(result => { if (!cancelled) setOrg(result); })
      .catch(() => { /* se degrada al nombre ya resuelto en el login (user.org) */ });
    fetchOrganizationsDirectory()
      .then(result => { if (!cancelled) setOtherOrgs(result); })
      .catch(() => { /* la vitrina de otras asociaciones es informativa, no bloquea el ingreso */ });
    return () => { cancelled = true; };
  }, []);

  const orgName = org?.name ?? user?.org ?? '';
  const visibleOtherOrgs = otherOrgs.filter(o => o.id !== (org?.id ?? user?.orgId));

  return (
    <div className="min-h-screen bg-bg text-t1">
      <header className="h-16 bg-surface border-b border-border">
        <div className="h-full max-w-[1180px] mx-auto px-5 flex items-center justify-between gap-6">
          <img
            src={CHASKI_WORDMARK_URL}
            alt="CHASKI AI"
            className="block object-contain object-left"
            style={{ width: 248, height: 28 }}
          />

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-hover grid place-items-center text-sm font-semibold text-t1">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block min-w-0">
              <p className="text-sm font-semibold text-t1 truncate max-w-[220px]">{user?.name}</p>
              <p className="text-xs text-t2">{roleName(user?.role ?? '')}</p>
            </div>
            <button
              onClick={onLogout}
              className="h-9 px-3 border border-border rounded-md text-sm text-t1 hover:bg-hover flex items-center gap-2"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1180px] mx-auto px-5 py-10 md:py-12">
        <div className="pb-5 border-b border-border mb-8">
          <p className="text-xs font-semibold text-primary uppercase">Portal CHASKI AI</p>
          <h1 className="text-2xl md:text-3xl font-semibold text-t1 mt-2">Portal de asociaciones</h1>
          <p className="text-sm text-t2 mt-2">Selecciona la asociación de transporte a la que deseas ingresar.</p>
        </div>

        {orgName ? (
          <section className="border border-primary bg-surface rounded-lg p-6 md:p-7 flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-shrink-0 flex justify-center md:justify-start">
              {org?.logoUrl ? (
                <img
                  src={org.logoUrl}
                  alt={`Logo de ${orgName}`}
                  className="block object-contain"
                  style={{ height: 112, width: 'auto', maxWidth: 300 }}
                />
              ) : (
                <OrgAvatar name={orgName} logoUrl={null} size={96} />
              )}
            </div>

            <div className="flex-1 min-w-0 text-center md:text-left">
              <div className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
                <h2 className="text-xl font-semibold text-t1">{orgName}</h2>
                <span className="px-2 py-1 rounded text-[10px] font-semibold uppercase bg-primary text-white">
                  Tu asociación
                </span>
              </div>
              <p className="text-xs font-semibold text-ok mt-2.5 flex items-center justify-center md:justify-start gap-1.5 uppercase">
                <CheckCircle size={14} />
                Acceso activo · {roleName(user?.role ?? '')}
              </p>
              <TerminalBox origin={org?.terminalOriginName} destination={org?.terminalDestinationName} center={false} />
              <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mt-3">Rutas habilitadas</p>
              {enabledRoutes(org).length > 0
                ? <RouteBadges routes={enabledRoutes(org)} center={false} />
                : <p className="text-xs text-t2 mt-2">Rutas por configurar</p>}
            </div>

            <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
              <button
                onClick={onEnterAssociation}
                className="h-11 px-6 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-h inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                Ingresar al panel
                <ArrowRight size={17} />
              </button>
              <p className="text-xs text-t2">Acceso disponible</p>
            </div>
          </section>
        ) : (
          <section className="border border-warn/35 bg-warn/5 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-t1">No tienes una asociación vinculada</h2>
            <p className="text-sm text-t2 mt-1">
              Tu cuenta está activa, pero un administrador debe asignarte a una asociación antes de ingresar a un panel.
            </p>
          </section>
        )}

        {visibleOtherOrgs.length > 0 && (
          <div className="mt-10">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-semibold text-t1">Otras asociaciones</h3>
              <p className="text-xs text-t2">Consulta la información de otras empresas</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
              {visibleOtherOrgs.map(other => (
                <div key={other.id} className="border border-border bg-surface rounded-lg p-5 text-center flex flex-col items-center">
                  <OrgAvatar name={other.name} logoUrl={other.logoUrl} size={72} />
                  <p className="text-sm font-semibold text-t1 mt-3">{other.name}</p>
                  <p className="text-xs text-t2 mt-1">Información disponible</p>
                  <TerminalBox origin={other.terminalOriginName} destination={other.terminalDestinationName} />
                  <p className="text-[11px] font-semibold text-t2 uppercase tracking-wide mt-3">Rutas habilitadas</p>
                  {enabledRoutes(other).length > 0
                    ? <RouteBadges routes={enabledRoutes(other)} />
                    : <p className="text-xs text-t2 mt-2">Rutas por configurar</p>}
                  <span className="mt-4 h-9 px-3 border border-border rounded-md text-sm font-medium text-t1 inline-flex items-center justify-center gap-2">
                    Ver información
                    <ArrowRight size={14} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-sm text-t2 mt-10">
          El acceso está limitado a tu asociación. Si necesitas trabajar con otra, contacta al administrador de CHASKI AI.
        </p>
      </main>
    </div>
  );
}
