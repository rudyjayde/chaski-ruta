// Cliente publico del Libro de Reclamaciones virtual (requisito legal
// INDECOPI, Ley 29571). Igual que commercial-requests-api.ts, NO requiere
// autenticacion -- cualquier persona reclama, tenga o no cuenta.
export interface ComplaintInput {
  type: 'RECLAMO' | 'QUEJA';
  consumerName: string;
  consumerDocument: string;
  consumerDocumentType?: 'DNI' | 'CE' | 'PASAPORTE' | 'RUC';
  consumerAddress?: string;
  consumerEmail: string;
  consumerPhone?: string;
  isMinor?: boolean;
  guardianName?: string;
  serviceDescription: string;
  claimedAmount?: number;
  detail: string;
  consumerRequest: string;
  // Campo trampa anti-robots: siempre vacio en una persona real.
  website?: string;
}

function apiUrl(): string {
  const url = import.meta.env.VITE_API_URL as string | undefined;
  if (!url) throw new Error('Falta configurar VITE_API_URL');
  return url;
}

export async function submitComplaint(input: ComplaintInput): Promise<{ number: string; id: string }> {
  const res = await fetch(`${apiUrl()}/complaint-book`, {
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
  return res.json();
}
