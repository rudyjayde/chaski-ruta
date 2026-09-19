import { useEffect, useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { fetchNotices, createNotice, type Notice, type NoticeAudience } from '../../lib/operacion-api';
import { useAdminDemo } from './AdminApp';

const AUDIENCE_LABEL: Record<NoticeAudience, string> = {
  CONDUCTORES: 'Conductores',
  SOCIOS: 'Socios',
  AMBOS: 'Conductores y socios',
  // Solo se ve como recibido -- nunca seleccionable en este formulario: es
  // el aviso masivo de Super Admin dirigido solo al administrador (ver
  // SABroadcastNotice en SuperAdminApp.tsx).
  ADMINISTRADORES: 'Solo administrador',
};

// El propio Administrador SIEMPRE ve cualquier aviso de su asociacion, sin
// importar la audiencia elegida (notices.service.ts findForRole) -- por eso
// las 3 opciones normales de este formulario lo incluyen en su etiqueta.
const AUDIENCE_OPTION_LABEL: Record<'AMBOS' | 'CONDUCTORES' | 'SOCIOS', string> = {
  AMBOS: 'Conductores, socios y tú (administrador)',
  CONDUCTORES: 'Solo conductores (y tú, administrador)',
  SOCIOS: 'Solo socios (y tú, administrador)',
};

export default function NoticesPage() {
  const { org } = useAdminDemo();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<NoticeAudience>('AMBOS');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    fetchNotices()
      .then(setNotices)
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudieron cargar los avisos.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSend = async () => {
    if (!title.trim() || !body.trim() || sending) return;
    setSending(true);
    setSendError('');
    try {
      const created = await createNotice({ title: title.trim(), body: body.trim(), audience });
      setNotices(prev => [created, ...prev]);
      setTitle('');
      setBody('');
      setAudience('AMBOS');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'No se pudo enviar el aviso.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-t1">Avisos</h1>
        <p className="text-sm text-t2 mt-0.5">{org?.name ?? 'Tu asociación'} · Se entregan dentro de la plataforma, nunca por WhatsApp.</p>
      </div>

      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-base font-semibold text-t1 mb-4">Redactar aviso</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Título</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ej. Corte de vía en el terminal de Puno"
              className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Mensaje</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={3}
              placeholder="Escribe el detalle del aviso…"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Dirigido a</label>
              <select
                value={audience}
                onChange={e => setAudience(e.target.value as NoticeAudience)}
                className="h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="AMBOS">{AUDIENCE_OPTION_LABEL.AMBOS}</option>
                <option value="CONDUCTORES">{AUDIENCE_OPTION_LABEL.CONDUCTORES}</option>
                <option value="SOCIOS">{AUDIENCE_OPTION_LABEL.SOCIOS}</option>
              </select>
            </div>
            <button
              onClick={handleSend}
              disabled={sending || !title.trim() || !body.trim()}
              className="flex items-center gap-2 h-9 px-4 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-60"
            >
              <Send size={14} />
              {sending ? 'Enviando…' : 'Enviar aviso'}
            </button>
          </div>
          {sendError && <p className="text-sm text-danger">{sendError}</p>}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-t1">Historial de avisos</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-t2">Cargando avisos…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-danger">{error}</div>
        ) : notices.length === 0 ? (
          <div className="p-8 text-center text-sm text-t2">
            <Megaphone size={28} className="mx-auto mb-2 opacity-30" />
            Todavía no se ha enviado ningún aviso.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notices.map(n => (
              <div key={n.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-t1">{n.title}</h3>
                  <span className="text-xs text-t2 shrink-0">{new Date(n.createdAt).toLocaleString('es-PE')}</span>
                </div>
                <p className="text-sm text-t2 mt-1 whitespace-pre-wrap">{n.body}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">{AUDIENCE_LABEL[n.audience]}</span>
                  <span className="text-xs text-t2">Por {n.authorName}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
