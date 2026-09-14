import { useEffect, useState } from 'react';
import { Headphones, Send } from 'lucide-react';
import { fetchSupportTickets, createSupportTicket, type SupportTicket, type SupportTicketStatus } from '../../lib/operacion-api';
import { useAdminDemo } from './AdminApp';

const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  ABIERTO: 'Abierto',
  EN_PROGRESO: 'En progreso',
  RESUELTO: 'Resuelto',
};
const STATUS_STYLE: Record<SupportTicketStatus, string> = {
  ABIERTO: 'bg-warn/10 text-warn',
  EN_PROGRESO: 'bg-primary/10 text-primary',
  RESUELTO: 'bg-ok/10 text-ok',
};

// Reemplaza el placeholder fijo que antes tenía Super Admin en "Soporte" (13
// sept 2026, decidido con Jayde) -- el Administrador reporta un problema real
// desde aquí y Super Admin responde desde su propio panel, cruzando todas las
// asociaciones.
export default function SupportPage() {
  const { org } = useAdminDemo();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    fetchSupportTickets()
      .then(setTickets)
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudieron cargar tus tickets.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSend = async () => {
    if (!subject.trim() || !message.trim() || sending) return;
    setSending(true);
    setSendError('');
    try {
      const created = await createSupportTicket(subject.trim(), message.trim());
      setTickets(prev => [created, ...prev]);
      setSubject('');
      setMessage('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'No se pudo enviar el ticket.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-t1">Soporte</h1>
        <p className="text-sm text-t2 mt-0.5">{org?.name ?? 'Tu asociación'} · Reporta un problema real y el equipo de CHASKI AI te responde aquí mismo.</p>
      </div>

      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-base font-semibold text-t1 mb-4">Reportar un problema</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Asunto</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Ej. No puedo vincular el GPS de la unidad 004"
              className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Detalle</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              placeholder="Cuéntanos qué pasó, desde cuándo y qué esperabas ver…"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !message.trim()}
            className="flex items-center gap-2 h-9 px-4 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-60"
          >
            <Send size={14} />
            {sending ? 'Enviando…' : 'Enviar ticket'}
          </button>
          {sendError && <p className="text-sm text-danger">{sendError}</p>}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-t1">Tus tickets</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-t2">Cargando tickets…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-danger">{error}</div>
        ) : tickets.length === 0 ? (
          <div className="p-8 text-center text-sm text-t2">
            <Headphones size={28} className="mx-auto mb-2 opacity-30" />
            Todavía no has reportado ningún problema.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tickets.map(t => (
              <div key={t.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-t1">{t.subject}</h3>
                  <span className="text-xs text-t2 shrink-0">{new Date(t.createdAt).toLocaleString('es-PE')}</span>
                </div>
                <p className="text-sm text-t2 mt-1 whitespace-pre-wrap">{t.message}</p>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-2 ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                {t.response && (
                  <div className="mt-3 bg-bg border border-border rounded-lg p-3">
                    <p className="text-xs font-medium text-t1 mb-1">Respuesta de CHASKI AI{t.respondedBy ? ` · ${t.respondedBy}` : ''}</p>
                    <p className="text-sm text-t2 whitespace-pre-wrap">{t.response}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
