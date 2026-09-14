import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { fetchLegalPage, type LegalPageSlug } from '../lib/landing-content-api';

interface Props {
  slug: LegalPageSlug;
  onBack: () => void;
}

export default function LegalPage({ slug, onBack }: Props) {
  const [page, setPage] = useState<{ title: string; body: string; updatedAt: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchLegalPage(slug).then(data => { if (active) { setPage(data); setLoading(false); } });
    return () => { active = false; };
  }, [slug]);

  return (
    <div className="min-h-screen bg-surface text-t1">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-t2 hover:text-t1">
            <ArrowLeft size={16} /> Volver a CHASKI AI
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-16">
        {loading ? (
          <p className="text-sm text-t2">Cargando…</p>
        ) : page ? (
          <>
            <h1 className="text-2xl font-semibold text-t1 mb-2">{page.title}</h1>
            {page.updatedAt && (
              <p className="text-xs text-muted mb-8">
                Última actualización: {new Date(page.updatedAt).toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
            <div className="text-sm text-t2 leading-relaxed whitespace-pre-line space-y-4">{page.body}</div>
          </>
        ) : (
          <p className="text-sm text-danger">No se pudo cargar esta página. Intenta nuevamente más tarde.</p>
        )}
      </main>
    </div>
  );
}
