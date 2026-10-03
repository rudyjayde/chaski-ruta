import { useEffect, useState } from 'react';
import { Headphones, Send, Image as ImageIcon, X, Clock } from 'lucide-react';
import {
  fetchSupportTickets, createSupportTicket, uploadImage, ticketSlaState,
  type SupportTicket, type SupportTicketStatus, type SupportTicketType, type SupportTicketCategory,
  type SupportTicketImpact, type SupportTicketUrgency, type SlaState,
} from '../../lib/operacion-api';
import { useAdminDemo } from './AdminApp';

const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  ABIERTO: 'Abierto',
  EN_ANALISIS: 'En análisis',
  ESCALADO: 'Escalado',
  EN_ESPERA: 'En espera',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
};
const STATUS_STYLE: Record<SupportTicketStatus, string> = {
  ABIERTO: 'bg-warn/10 text-warn',
  EN_ANALISIS: 'bg-primary/10 text-primary',
  ESCALADO: 'bg-danger/10 text-danger',
  EN_ESPERA: 'bg-muted/20 text-t2',
  RESUELTO: 'bg-ok/10 text-ok',
  CERRADO: 'bg-muted/20 text-t2',
};
const PRIORITY_STYLE: Record<string, string> = {
  P1: 'bg-danger/10 text-danger',
  P2: 'bg-warn/10 text-warn',
  P3: 'bg-primary/10 text-primary',
  P4: 'bg-muted/20 text-t2',
};
const SLA_LABEL: Record<SlaState, string> = { ok: 'Dentro de SLA', riesgo: 'SLA por vencer', vencido: 'SLA vencido', sin_limite: 'Sin límite de SLA' };
const SLA_STYLE: Record<SlaState, string> = { ok: 'bg-ok/10 text-ok', riesgo: 'bg-warn/10 text-warn', vencido: 'bg-danger/10 text-danger', sin_limite: 'bg-muted/20 text-t2' };

const TYPE_LABEL: Record<SupportTicketType, string> = { INCIDENTE: 'Incidente', SOLICITUD: 'Solicitud' };
const CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  ACCESO: 'Acceso', COLA: 'Cola', MANIFIESTO: 'Manifiesto', GPS: 'GPS', ASISTENTE_IA: 'Asistente IA', REPORTES: 'Reportes', OTRO: 'Otro',
};
const IMPACT_LABEL: Record<SupportTicketImpact, string> = { ALTO: 'Alto', MEDIO: 'Medio', BAJO: 'Bajo' };
const URGENCY_LABEL: Record<SupportTicketUrgency, string> = { ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' };

// Redimensiona la captura de pantalla antes de subirla -- mismo motivo que el
// logo de la asociacion: una foto de varios MB supera el limite del body.
function resizeImageFile(file: File, maxDimension = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('El archivo no parece ser una imagen válida'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('No se pudo procesar la imagen')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

// Pantalla de "Soporte" del Administrador (2 oct 2026, rehecha para ITIL 4 --
// OE4 tesis): reporta un incidente/solicitud clasificado, Super Admin
// clasifica/escala/resuelve desde su propio panel cruzando asociaciones.
export default function SupportPage() {
  const { org } = useAdminDemo();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<SupportTicketType>('INCIDENTE');
  const [category, setCategory] = useState<SupportTicketCategory>('OTRO');
  const [impact, setImpact] = useState<SupportTicketImpact>('MEDIO');
  const [urgency, setUrgency] = useState<SupportTicketUrgency>('MEDIA');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [uploading, setUploading] = useState(false);
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

  const handleScreenshot = async (file: File) => {
    setSendError('');
    if (file.size > 8 * 1024 * 1024) { setSendError('La imagen pesa demasiado (máximo 8 MB).'); return; }
    setUploading(true);
    try {
      const resized = await resizeImageFile(file);
      const { url } = await uploadImage(resized, 'soporte');
      setEvidenceUrl(url);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'No se pudo subir la captura.');
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !message.trim() || sending) return;
    setSending(true);
    setSendError('');
    try {
      const created = await createSupportTicket({
        subject: subject.trim(), message: message.trim(), type, category, impact, urgency,
        evidenceUrl: evidenceUrl || undefined,
      });
      setTickets(prev => [created, ...prev]);
      setSubject('');
      setMessage('');
      setType('INCIDENTE');
      setCategory('OTRO');
      setImpact('MEDIO');
      setUrgency('MEDIA');
      setEvidenceUrl('');
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
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Tipo</label>
              <select value={type} onChange={e => setType(e.target.value as SupportTicketType)} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Categoría</label>
              <select value={category} onChange={e => setCategory(e.target.value as SupportTicketCategory)} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Impacto</label>
              <select value={impact} onChange={e => setImpact(e.target.value as SupportTicketImpact)} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {Object.entries(IMPACT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-t1 mb-1">Urgencia</label>
              <select value={urgency} onChange={e => setUrgency(e.target.value as SupportTicketUrgency)} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {Object.entries(URGENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
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
          <div>
            <label className="block text-sm font-medium text-t1 mb-1">Captura de pantalla (opcional)</label>
            {evidenceUrl ? (
              <div className="flex items-center gap-3">
                <img src={evidenceUrl} alt="Captura adjunta" className="h-16 rounded-lg border border-border object-contain" />
                <button type="button" onClick={() => setEvidenceUrl('')} className="flex items-center gap-1 text-sm text-danger hover:underline">
                  <X size={14} /> Quitar
                </button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-lg cursor-pointer hover:bg-hover w-fit">
                <ImageIcon size={14} />
                {uploading ? 'Subiendo…' : 'Adjuntar captura'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) handleScreenshot(f); e.target.value = ''; }} />
              </label>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={sending || uploading || !subject.trim() || !message.trim()}
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
            {tickets.map(t => {
              const sla = ticketSlaState(t);
              return (
                <div key={t.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-t2 shrink-0">{t.code}</span>
                      <h3 className="text-sm font-semibold text-t1 truncate">{t.subject}</h3>
                    </div>
                    <span className="text-xs text-t2 shrink-0">{new Date(t.createdAt).toLocaleString('es-PE')}</span>
                  </div>
                  <p className="text-sm text-t2 mt-1 whitespace-pre-wrap">{t.message}</p>
                  {t.evidenceUrl && <img src={t.evidenceUrl} alt="Captura adjunta" className="mt-2 h-20 rounded-lg border border-border object-contain" />}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${SLA_STYLE[sla]}`}><Clock size={11} />{SLA_LABEL[sla]}</span>
                    {t.assigneeName && <span className="text-xs text-t2">Asignado a {t.assigneeName}</span>}
                  </div>
                  {sla !== 'sin_limite' && <p className="text-[11px] text-muted mt-1">SLA medido en horas calendario, no horas hábiles.</p>}
                  {t.resolution && (
                    <div className="mt-3 bg-bg border border-border rounded-lg p-3">
                      <p className="text-xs font-medium text-t1 mb-1">Resolución de CHASKI AI{t.assigneeName ? ` · ${t.assigneeName}` : ''}</p>
                      <p className="text-sm text-t2 whitespace-pre-wrap">{t.resolution}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
