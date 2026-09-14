// Cuentas de visitante de la landing publica -- separadas del login real de
// Person/Organization (operacion-api.ts). Sirven solo para cosas de bajo
// riesgo (ver estado de una cotizacion propia). Token guardado en una llave
// de localStorage DISTINTA a la del login real, para no mezclar sesiones.
const VISITOR_TOKEN_KEY = 'chaski-visitor-token';

function apiUrl(): string {
  const url = import.meta.env.VITE_API_URL as string | undefined;
  if (!url) throw new Error('Falta configurar VITE_API_URL');
  return url;
}

export function getVisitorToken(): string | null {
  return localStorage.getItem(VISITOR_TOKEN_KEY);
}

export function setVisitorToken(token: string): void {
  localStorage.setItem(VISITOR_TOKEN_KEY, token);
}

export function clearVisitorToken(): void {
  localStorage.removeItem(VISITOR_TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getVisitorToken();
  const res = await fetch(`${apiUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      // sin cuerpo JSON, se usa el mensaje generico
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

// Link para "Continuar con Google" desde la landing -- mismo callback de
// Google ya registrado (?flow=landing viaja como `state` de OAuth, ver
// backend/src/auth/google-auth.guard.ts). Nunca rechaza un correo
// desconocido: lo convierte en visitante en vez de dar error.
export function visitorGoogleLoginUrl(): string {
  return `${apiUrl()}/auth/google?flow=landing`;
}

export async function registerVisitor(email: string, password: string, name?: string): Promise<{ token: string }> {
  return request<{ token: string }>('/visitor-auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

export async function loginVisitor(email: string, password: string): Promise<{ token: string }> {
  return request<{ token: string }>('/visitor-auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export type CommercialRequestStatus = 'NUEVA' | 'CONTACTADA' | 'COTIZADA' | 'CONVERTIDA' | 'DESCARTADA';

export interface VisitorCommercialRequest {
  id: string;
  solution: 'OPERACION' | 'PRO' | 'GPS_VEHICULAR';
  status: CommercialRequestStatus;
  orgName: string | null;
  createdAt: string;
}

export interface VisitorMe {
  id: string;
  email: string;
  name: string | null;
  commercialRequests: VisitorCommercialRequest[];
}

export async function fetchVisitorMe(): Promise<VisitorMe | null> {
  return request<VisitorMe | null>('/visitor-auth/me');
}
