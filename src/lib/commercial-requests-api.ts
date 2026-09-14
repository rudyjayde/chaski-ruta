// Cliente publico del endpoint de solicitudes comerciales (landing).
// A diferencia de operacion-api.ts, este NO requiere autenticacion: lo usa
// cualquier visitante interesado en cotizar, antes de tener cuenta, usuario
// o asociacion en el sistema. Ver
// docs/planes/landing-publica-y-solicitudes-comerciales.md.
export type CommercialSolution = 'OPERACION' | 'PRO' | 'GPS_VEHICULAR';

export interface CommercialRequestInput {
  solution: CommercialSolution;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  orgName?: string;
  ruc?: string;
  answers: Record<string, unknown>;
}

function apiUrl(): string {
  const url = import.meta.env.VITE_API_URL as string | undefined;
  if (!url) throw new Error('Falta configurar VITE_API_URL');
  return url;
}

export async function submitCommercialRequest(input: CommercialRequestInput): Promise<void> {
  const res = await fetch(`${apiUrl()}/commercial-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
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
}
