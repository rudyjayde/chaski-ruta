import { useEffect } from 'react';
import { Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { useAssistantChat } from './assistant-chat-context';

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
}

// Lista de conversaciones anteriores del asistente -- la usan la pestaña
// "Asistente AI" (panel lateral) y el widget flotante (vista de historial).
export default function AssistantConversationList({ compact = false, onOpen }: { compact?: boolean; onOpen?: () => void }) {
  const { conversations, conversationId, loadConversations, openConversation, removeConversation } = useAssistantChat();

  useEffect(() => {
    if (conversations === null) loadConversations();
  }, [conversations, loadConversations]);

  if (conversations === null) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 size={16} className="animate-spin text-muted" />
      </div>
    );
  }

  // El plazo lo aplica el backend (assistant-retention.service.ts, 60 dias).
  const retentionNote = (
    <p className="text-[11px] text-muted px-2.5 pt-2 pb-1">Las conversaciones se borran solas después de 2 meses sin uso.</p>
  );

  if (conversations.length === 0) {
    return (
      <>
        <p className="text-xs text-t2 px-3 py-4 text-center">Todavía no tienes consultas anteriores.</p>
        {retentionNote}
      </>
    );
  }

  return (
    <>
    <ul className="space-y-0.5">
      {conversations.map((c) => (
        <li key={c.id} className="group relative">
          <button
            onClick={() => { openConversation(c.id); onOpen?.(); }}
            className={`w-full text-left flex items-start gap-2 rounded-lg px-2.5 py-2 pr-8 transition-colors ${
              c.id === conversationId ? 'bg-primary/10 text-t1' : 'text-t2 hover:bg-hover hover:text-t1'
            }`}
          >
            <MessageSquare size={compact ? 12 : 14} className="mt-0.5 flex-shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className={`block truncate ${compact ? 'text-xs' : 'text-sm'}`}>{c.title}</span>
              <span className="block text-[11px] text-muted">{whenLabel(c.updatedAt)}</span>
            </span>
          </button>
          <button
            onClick={() => {
              if (window.confirm(`¿Borrar la conversación "${c.title}"? No se puede deshacer.`)) removeConversation(c.id);
            }}
            className="absolute right-1.5 top-2 p-1 rounded text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger hover:bg-danger/5 transition-opacity"
            aria-label={`Borrar conversación ${c.title}`}
            title="Borrar"
          >
            <Trash2 size={13} />
          </button>
        </li>
      ))}
    </ul>
    {retentionNote}
    </>
  );
}
