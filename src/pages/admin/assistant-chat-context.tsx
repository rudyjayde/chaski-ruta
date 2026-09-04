import { createContext, useContext, useState, type ReactNode } from 'react';
import { sendAssistantMessage, type AssistantChatTurn } from '../../lib/operacion-api';

// Estado compartido del asistente conversacional (plan-pro.md #6): tanto la
// pestaña dedicada "Asistente AI" como el widget flotante que acompaña en
// cualquier pantalla del panel leen y escriben la MISMA conversacion, para
// que no se pierda el hilo al pasar de uno a otro.
interface AssistantChatCtx {
  assistantName: string;
  messages: AssistantChatTurn[];
  sending: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
}

const AssistantChatContext = createContext<AssistantChatCtx | null>(null);

export function AssistantChatProvider({ orgName, children }: { orgName?: string | null; children: ReactNode }) {
  const assistantName = orgName ? `${orgName} AI` : 'Asistente';
  const [messages, setMessages] = useState<AssistantChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    const history = messages;
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setSending(true);
    try {
      const res = await sendAssistantMessage(trimmed, history);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err: any) {
      setError(err?.message || 'No se pudo contactar al asistente.');
    } finally {
      setSending(false);
    }
  }

  return (
    <AssistantChatContext.Provider value={{ assistantName, messages, sending, error, send }}>
      {children}
    </AssistantChatContext.Provider>
  );
}

export function useAssistantChat(): AssistantChatCtx {
  const ctx = useContext(AssistantChatContext);
  if (!ctx) throw new Error('useAssistantChat debe usarse dentro de <AssistantChatProvider>');
  return ctx;
}
