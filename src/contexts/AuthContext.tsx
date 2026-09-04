import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { AuthUser, Person, Role } from '../types';
import { DEMO_ACCOUNTS, PEOPLE } from '../data/demo';

const CUSTOM_PEOPLE_KEY = 'atipcar-custom-people-v1';
const PERSON_LINKS_KEY = 'atipcar-person-links-v1';
const TOKEN_KEY = 'chaski-auth-token';

type PersonWithRoles = Person & {
  roles?: Person['role'][];
  accessStatus?: 'INVITADO' | 'ACTIVO' | 'BLOQUEADO';
};

interface AuthorizedIdentity {
  name: string;
  org: string;
  code?: string;
}

// Forma que devuelve el backend real en GET /auth/me (ver backend/src/auth/auth.service.ts getProfile()).
type BackendPersonRole = 'SUPERADMIN' | 'ADMINISTRADOR' | 'SOCIO' | 'CONDUCTOR';
interface BackendProfile {
  id: string;
  email: string;
  name: string;
  role: BackendPersonRole;
  organizationId: string | null;
  organizationName: string | null;
  code: string | null;
  company: string | null;
}

// Una de las cuentas disponibles para un correo cuando tiene mas de una
// (Socio + Conductor) — lo que devuelve GET /auth/profiles?select=... y lo
// que alimenta la pantalla "¿A cual panel quieres entrar?".
export interface ProfileOption {
  id: string;
  role: BackendPersonRole;
  name: string;
  company: string | null;
  organizationName: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  restoring: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginAs: (email: string, requestedRole?: Role, identity?: AuthorizedIdentity) => void;
  loginWithToken: (token: string) => Promise<void>;
  fetchProfileOptions: (selectToken: string) => Promise<ProfileOption[]>;
  loginWithSelectedProfile: (selectToken: string, personId: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredArray<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]; } catch { return []; }
}

function readStoredRecord<T>(key: string): Record<string, T> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, T>; } catch { return {}; }
}

function personRoles(person: PersonWithRoles): Person['role'][] {
  return person.roles?.length ? person.roles : [person.role];
}

function mapRole(role: Person['role']): Role {
  if (role === 'CONDUCTOR') return 'driver';
  if (role === 'SOCIO') return 'partner';
  return 'admin';
}

// Mapeo de roles del backend real (Prisma PersonRole) al tipo Role del frontend.
// SUPERADMIN es el caso que el mapeo de datos demo no necesitaba cubrir.
function mapBackendRole(role: BackendPersonRole): Role {
  if (role === 'SUPERADMIN') return 'superadmin';
  if (role === 'CONDUCTOR') return 'driver';
  if (role === 'SOCIO') return 'partner';
  return 'admin';
}

function buildUserFromBackendProfile(profile: BackendProfile): AuthUser {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: mapBackendRole(profile.role),
    org: profile.organizationName ?? 'CHASKI AI',
    orgId: profile.organizationId ?? 'chaski-ai',
    code: profile.code ?? undefined,
  };
}

async function fetchProfile(token: string): Promise<BackendProfile> {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!apiUrl) {
    throw new Error('Falta configurar VITE_API_URL.');
  }
  const res = await fetch(`${apiUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Tu sesión expiró o no es válida. Inicia sesión de nuevo.');
  }
  return res.json() as Promise<BackendProfile>;
}

// Cuentas disponibles para el selectToken emitido por POST /auth/google/callback
// cuando un correo tiene mas de una cuenta (ver backend AuthService.loginWithGoogle).
async function fetchProfileOptionsApi(selectToken: string): Promise<ProfileOption[]> {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!apiUrl) {
    throw new Error('Falta configurar VITE_API_URL.');
  }
  const res = await fetch(`${apiUrl}/auth/profiles?select=${encodeURIComponent(selectToken)}`);
  if (!res.ok) {
    throw new Error('No se pudieron cargar las cuentas disponibles para este correo. Vuelve a iniciar sesión.');
  }
  return res.json() as Promise<ProfileOption[]>;
}

// Confirma cual cuenta eligio la persona y recien ahi el backend emite el JWT de sesion real.
async function selectProfileApi(selectToken: string, personId: string): Promise<{ accessToken: string }> {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!apiUrl) {
    throw new Error('Falta configurar VITE_API_URL.');
  }
  const res = await fetch(`${apiUrl}/auth/select-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ select: selectToken, personId }),
  });
  if (!res.ok) {
    throw new Error('No se pudo completar el ingreso. Vuelve a intentar.');
  }
  return res.json() as Promise<{ accessToken: string }>;
}

function findAuthorizedPerson(email: string): PersonWithRoles | null {
  const links = readStoredRecord<Partial<PersonWithRoles>>(PERSON_LINKS_KEY);
  const custom = readStoredArray<PersonWithRoles>(CUSTOM_PEOPLE_KEY);
  const people = [...PEOPLE, ...custom].map(person => ({ ...person, ...(links[person.id] ?? {}) })) as PersonWithRoles[];
  const normalized = email.trim().toLowerCase();
  return people.find(person =>
    person.email.toLowerCase() === normalized &&
    person.status === 'ACTIVO' &&
    person.accessStatus !== 'BLOQUEADO'
  ) ?? null;
}

function buildUser(person: PersonWithRoles, requestedRole?: Role): AuthUser {
  const availableRoles = personRoles(person).map(mapRole);
  const role = requestedRole && availableRoles.includes(requestedRole)
    ? requestedRole
    : availableRoles[0];
  return {
    email: person.email,
    name: person.name,
    role,
    org: person.company || 'ATIPCAR',
    orgId: 'atipcar',
    code: person.linkedUnit || person.code,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(true);

  // Al cargar la app, si ya hay un token guardado de un login real por Google, restaura la sesión.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setRestoring(false);
      return;
    }
    fetchProfile(token)
      .then(profile => setUser(buildUserFromBackendProfile(profile)))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setRestoring(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await new Promise(r => setTimeout(r, 800));
    const account = DEMO_ACCOUNTS.find(
      a => a.email.toLowerCase() === email.toLowerCase() && a.password === password
    );
    if (account) {
      setUser({ email: account.email, name: account.name, role: account.role, org: account.org, orgId: account.orgId, code: account.code });
      return { ok: true };
    }

    if (findAuthorizedPerson(email)) {
      return { ok: false, error: 'Este correo está autorizado. Usa Continuar con Google para validar tu identidad.' };
    }
    return { ok: false, error: 'Usuario o contraseña incorrectos' };
  }, []);

  const loginAs = useCallback((email: string, requestedRole?: Role, identity?: AuthorizedIdentity) => {
    const account = DEMO_ACCOUNTS.find(a => a.email.toLowerCase() === email.toLowerCase());
    if (account) {
      setUser({ email: account.email, name: account.name, role: account.role, org: account.org, orgId: account.orgId, code: account.code });
      return;
    }

    if (identity && requestedRole) {
      setUser({
        email,
        name: identity.name,
        role: requestedRole,
        org: identity.org,
        orgId: 'atipcar',
        code: identity.code,
      });
      return;
    }

    const person = findAuthorizedPerson(email);
    if (person) setUser(buildUser(person, requestedRole));
  }, []);

  // Login real: recibe el JWT que el backend emitió tras el OAuth de Google
  // (ver GET /auth/callback en el backend y AuthCallbackPage en App.tsx),
  // lo guarda, y arma la sesión con el perfil real de /auth/me.
  const loginWithToken = useCallback(async (token: string) => {
    const profile = await fetchProfile(token);
    localStorage.setItem(TOKEN_KEY, token);
    setUser(buildUserFromBackendProfile(profile));
  }, []);

  const fetchProfileOptions = useCallback((selectToken: string) => fetchProfileOptionsApi(selectToken), []);

  // Segundo paso del login cuando el correo tiene mas de una cuenta: la persona
  // ya eligio a cual entrar (pantalla "¿A cual panel quieres entrar?"), esto
  // completa el login exactamente igual que loginWithToken.
  const loginWithSelectedProfile = useCallback(async (selectToken: string, personId: string) => {
    const { accessToken } = await selectProfileApi(selectToken, personId);
    const profile = await fetchProfile(accessToken);
    localStorage.setItem(TOKEN_KEY, accessToken);
    setUser(buildUserFromBackendProfile(profile));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, restoring, login, loginAs, loginWithToken, fetchProfileOptions, loginWithSelectedProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
