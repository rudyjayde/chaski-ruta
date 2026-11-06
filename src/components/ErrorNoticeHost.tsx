import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { subscribeErrorNotice, type Notice } from '../lib/error-notice';

// Ventana unica de avisos, montada una sola vez en main.tsx para que funcione
// en todos los paneles. Si llegan varios se muestran de a uno, y el mismo
// mensaje repetido no se vuelve a apilar.
export default function ErrorNoticeHost() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(
    () => subscribeErrorNotice((notice) => setNotices((prev) => (prev.some((n) => n.message === notice.message) ? prev : [...prev, notice]))),
    [],
  );

  const current = notices[0];
  const accept = () => setNotices((prev) => prev.slice(1));

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') accept();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);

  if (!current) return null;

  const isSuccess = current.tone === 'success';

  return (
    <div
      className="fixed inset-0 z-[3000] bg-black/40 flex items-center justify-center p-4"
      role={isSuccess ? 'dialog' : 'alertdialog'}
      aria-modal="true"
      aria-labelledby="error-notice-title"
      aria-describedby="error-notice-message"
    >
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isSuccess ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>
            {isSuccess ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
          </div>
          <div className="min-w-0">
            <h2 id="error-notice-title" className="text-base font-semibold text-t1">{current.title}</h2>
            <p id="error-notice-message" className="text-sm text-t2 mt-1.5 whitespace-pre-line break-words">{current.message}</p>
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <button
            autoFocus
            onClick={accept}
            className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors ${isSuccess ? 'bg-ok hover:bg-ok/90' : 'bg-primary hover:bg-primary-h'}`}
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
