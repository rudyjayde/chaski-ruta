import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, X } from 'lucide-react';
import { useAssistantChat } from './assistant-chat-context';

// Widget flotante que acompaña al administrador en cualquier pantalla del
// panel (Colas, Manifiestos, Flota, etc.) -- comparte la misma conversacion
// que la pestaña dedicada "Asistente AI" via AssistantChatProvider, para que
// no se pierda el hilo al pasar de uno a otro.
const SUGGESTIONS = [
  '¿Dónde está el vehículo 001?',
  '¿Cómo va la cola Juli → Puno?',
  'Dame el resumen de hoy',
];

export default function AssistantWidget() {
  const { assistantName, messages, sending, error, send } = useAssistantChat();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, open]);

  function submit(text: string) {
    send(text);
    setInput('');
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[380px] max-w-[calc(100vw-2.5rem)] h-[540px] max-h-[70vh] bg-surface border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-bg flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles size={16} className="text-primary flex-shrink-0" />
              <span className="text-sm font-semibold text-t1 truncate">{assistantName}</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-t2 hover:text-t1 p-1 rounded hover:bg-hover flex-shrink-0"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-2">
                <Sparkles size={24} className="text-primary/60" />
                <p className="text-xs text-t2">Pregúntame por unidades, conductores, la cola o el resumen de hoy.</p>
                <div className="flex flex-col gap-1.5 w-full">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="text-xs text-left px-2.5 py-1.5 rounded-lg border border-border text-t2 hover:bg-hover hover:text-t1 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-primary text-white' : 'bg-bg text-t1 border border-border'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs bg-bg border border-border text-t2 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Consultando...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && (
            <div className="px-3 py-1.5 text-[11px] text-danger bg-danger/5 border-t border-danger/20 flex-shrink-0">{error}</div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); submit(input); }}
            className="flex items-center gap-1.5 p-2.5 border-t border-border flex-shrink-0"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Pregúntale a ${assistantName}...`}
              className="flex-1 text-xs border border-border rounded-lg px-2.5 py-2 bg-bg text-t1 outline-none focus:border-primary"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="p-2 rounded-lg bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors flex-shrink-0"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-24 z-50 w-12 h-12 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        aria-label={open ? `Cerrar ${assistantName}` : `Abrir ${assistantName}`}
        title={assistantName}
      >
        {open ? <X size={20} /> : <Sparkles size={20} />}
      </button>
    </>
  );
}
