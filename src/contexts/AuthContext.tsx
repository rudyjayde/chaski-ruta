import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { AuthUser, Role } from '../types';

const TOKEN_KEY = 'chaski-auth-token';

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

// Resultado de un login por contraseña: entra directo (accessToken), o el
// correo tiene mas de una cuenta y hace falta elegir panel primero
// (selectToken, mismo flujo de "¿A cual panel quieres entrar?" que Google).
export type LoginResult =
  | { ok: true }
  | { ok: false; error?: string; selectToken?: string };

interface AuthContextValue {
  user: AuthUser | null;
  restoring: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  loginWithToken: (token: string) => Promise<void>;
  fetchProfileOptions: (selectToken: string) => Promise<ProfileOption[]>;
  loginWithSelectedProfile: (selectToken: string, personId: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

// Login real por correo + contraseña (POST /auth/login, ver backend
// AuthService.loginWithPassword). Devuelve lo mismo que el login de Google:
// token directo, o un selectToken si el correo tiene mas de una cuenta.
async function loginWithPasswordApi(email: string, password: string): Promise<
  | { accessToken: string }
  | { selectToken: string }
> {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!apiUrl) {
    throw new Error('Falta configurar VITE_API_URL.');
  }
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    let message = 'Usuario o contraseña incorrectos.';
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      // sin cuerpo JSON, se usa el mensaje generico
    }
    throw new Error(message);
  }
  return res.json();
}

// Solicita el enlace de "definir/restablecer contraseña" (POST /auth/forgot-password).
// Siempre resuelve igual exista o no la cuenta -- el backend nunca revela cual es el caso.
export async function requestPasswordResetApi(email: string): Promise<void> {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!apiUrl) throw new Error('Falta configurar VITE_API_URL.');
  const res = await fetch(`${apiUrl}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error('No se pudo procesar la solicitud. Intenta de nuevo.');
}

// Confirma el enlace recibido por correo y guarda la nueva contraseña (POST /auth/reset-password).
export async function resetPasswordApi(token: string, password: string): Promise<void> {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!apiUrl) throw new Error('Falta configurar VITE_API_URL.');
  const res = await fetch(`${apiUrl}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    let message = 'El enlace expiró o no es válido. Solicita uno nuevo.';
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      // sin cuerpo JSON, se usa el mensaje generico
    }
    throw new Error(message);
  }
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

  // Login real por correo + contraseña (alternativa a Google). Si el correo
  // tiene mas de una cuenta, en vez de entrar directo devuelve selectToken
  // para que la pantalla de login muestre "¿A cual panel quieres entrar?"
  // (mismo componente que ya usa el login de Google, ver AuthCallbackPage).
  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const result = await loginWithPasswordApi(email, password);
      if ('selectToken' in result) {
        return { ok: false, selectToken: result.selectToken };
      }
      await loginWithToken(result.accessToken);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <AuthContext.Provider value={{ user, restoring, login, loginWithToken, fetchProfileOptions, loginWithSelectedProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
