import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { fetchAboutPage } from '../lib/landing-content-api';

interface Props {
  onBack: () => void;
}

// "Sobre nosotros" (footer -> Empresa -> Sobre nosotros) -- mismo patron
// visual que LegalPage.tsx, pero sin el aviso de "borrador legal" porque no
// es un documento vinculante, es contenido institucional editable desde
// Super Admin (ver landing-content.service.ts, clave ABOUT).
export default function AboutPage({ onBack }: Props) {
  const [page, setPage] = useState<{ title: string; body: string; updatedAt: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAboutPage().then(data => { if (active) { setPage(data); setLoading(false); } });
    return () => { active = false; };
  }, []);

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
            <h1 className="text-2xl font-semibold text-t1 mb-8">{page.title}</h1>
            <div className="text-sm text-t2 leading-relaxed whitespace-pre-line space-y-4">{page.body}</div>
          </>
        ) : (
          <p className="text-sm text-danger">No se pudo cargar esta página. Intenta nuevamente más tarde.</p>
        )}
      </main>
    </div>
  );
}
