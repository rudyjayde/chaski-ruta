import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { subscribeErrorNotice } from '../lib/error-notice';

// Ventana unica de "No se pudo completar la accion", montada una sola vez en
// main.tsx para que funcione en todos los paneles. Si llegan varios errores se
// muestran de a uno, y el mismo mensaje repetido no se vuelve a apilar.
export default function ErrorNoticeHost() {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(
    () => subscribeErrorNotice((message) => setMessages((prev) => (prev.includes(message) ? prev : [...prev, message]))),
    [],
  );

  const current = messages[0];
  const accept = () => setMessages((prev) => prev.slice(1));

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') accept();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[3000] bg-black/40 flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="error-notice-title"
      aria-describedby="error-notice-message"
    >
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-danger/10 text-danger flex items-center justify-center flex-shrink-0">
            <AlertCircle size={22} />
          </div>
          <div className="min-w-0">
            <h2 id="error-notice-title" className="text-base font-semibold text-t1">No se pudo completar la acción</h2>
            <p id="error-notice-message" className="text-sm text-t2 mt-1.5 whitespace-pre-line break-words">{current}</p>
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <button
            autoFocus
            onClick={accept}
            className="px-5 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-h transition-colors"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
