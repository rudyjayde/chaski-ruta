import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  sendAssistantMessage, fetchAssistantConversations, fetchAssistantConversation, deleteAssistantConversation,
  type AssistantChatTurn, type AssistantConversationSummary,
} from '../../lib/operacion-api';

// Estado compartido del asistente conversacional (plan-pro.md #6): tanto la
// pestaña dedicada "Asistente AI" como el widget flotante que acompaña en
// cualquier pantalla del panel leen y escriben la MISMA conversacion, para
// que no se pierda el hilo al pasar de uno a otro.
//
// Historial "como ChatGPT" (2 nov 2026): cada conversacion se guarda en el
// backend. Al entrar al panel el chat arranca limpio; las anteriores se
// abren desde la lista de conversaciones.
interface AssistantChatCtx {
  assistantName: string;
  messages: AssistantChatTurn[];
  conversationId: string | null;
  sending: boolean;
  loadingConversation: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  newConversation: () => void;
  conversations: AssistantConversationSummary[] | null;
  loadConversations: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
}

const AssistantChatContext = createContext<AssistantChatCtx | null>(null);

export function AssistantChatProvider({ orgName, children }: { orgName?: string | null; children: ReactNode }) {
  const assistantName = orgName ? `${orgName} AI` : 'Asistente';
  const [messages, setMessages] = useState<AssistantChatTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AssistantConversationSummary[] | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await fetchAssistantConversations());
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar el historial.');
    }
  }, []);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setSending(true);
    try {
      const res = await sendAssistantMessage(trimmed, conversationId);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      setConversationId(res.conversationId);
      // La conversacion recien usada pasa al tope de la lista, igual que el backend la ordena.
      setConversations((prev) => prev && [
        { id: res.conversationId, title: res.title, updatedAt: new Date().toISOString() },
        ...prev.filter((c) => c.id !== res.conversationId),
      ]);
    } catch (err: any) {
      setError(err?.message || 'No se pudo contactar al asistente.');
    } finally {
      setSending(false);
    }
  }

  function newConversation() {
    if (sending) return;
    setMessages([]);
    setConversationId(null);
    setError(null);
  }

  async function openConversation(id: string) {
    if (sending || id === conversationId) return;
    setError(null);
    setLoadingConversation(true);
    try {
      const conv = await fetchAssistantConversation(id);
      setMessages(conv.messages);
      setConversationId(conv.id);
    } catch (err: any) {
      setError(err?.message || 'No se pudo abrir la conversación.');
    } finally {
      setLoadingConversation(false);
    }
  }

  async function removeConversation(id: string) {
    try {
      await deleteAssistantConversation(id);
      setConversations((prev) => prev && prev.filter((c) => c.id !== id));
      if (id === conversationId) newConversation();
    } catch (err: any) {
      setError(err?.message || 'No se pudo borrar la conversación.');
    }
  }

  return (
    <AssistantChatContext.Provider
      value={{
        assistantName, messages, conversationId, sending, loadingConversation, error, send, newConversation,
        conversations, loadConversations, openConversation, removeConversation,
      }}
    >
      {children}
    </AssistantChatContext.Provider>
  );
}

export function useAssistantChat(): AssistantChatCtx {
  const ctx = useContext(AssistantChatContext);
  if (!ctx) throw new Error('useAssistantChat debe usarse dentro de <AssistantChatProvider>');
  return ctx;
}
