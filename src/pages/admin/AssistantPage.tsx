import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2 } from 'lucide-react';
import { useAssistantChat } from './assistant-chat-context';

const SUGGESTIONS = [
  '¿Dónde está el vehículo 001?',
  '¿Cuántas vueltas hizo hoy la unidad 002?',
  '¿Cómo va la cola Juli → Puno?',
  'Dame el resumen de hoy',
];

export default function AssistantPage() {
  const { assistantName, messages, sending, error, send } = useAssistantChat();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  function submit(text: string) {
    send(text);
    setInput('');
  }

  return (
    <div className="p-6 lg:p-8 flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={20} className="text-primary" />
          <h1 className="text-2xl font-bold text-t1">{assistantName}</h1>
        </div>
        <p className="text-sm text-t2">
          Pregunta por unidades, conductores, la cola en vivo o el resumen del día — responde solo con datos reales de tu asociación.
        </p>
      </div>

      <div className="flex-1 min-h-[60vh] max-h-[70vh] overflow-y-auto border border-border rounded-lg bg-surface p-4 lg:p-6 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-10">
            <Sparkles size={28} className="text-primary/60" />
            <p className="text-sm text-t2 max-w-xs">Hazme una pregunta sobre la operación de hoy. Por ejemplo:</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border text-t2 hover:bg-hover hover:text-t1 transition-colors"
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
              className={`max-w-full sm:max-w-xl lg:max-w-2xl rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-primary text-white' : 'bg-bg text-t1 border border-border'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="max-w-xl rounded-lg px-3.5 py-2.5 text-sm bg-bg border border-border text-t2 flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" /> Consultando...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="text-xs text-danger bg-danger/5 border border-danger/20 rounded px-3 py-1.5">{error}</div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); submit(input); }}
        className="flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Pregúntale algo a ${assistantName}...`}
          className="flex-1 border border-border rounded-lg px-3.5 py-2.5 text-sm bg-surface text-t1 outline-none focus:border-primary"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="p-2.5 rounded-lg bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
