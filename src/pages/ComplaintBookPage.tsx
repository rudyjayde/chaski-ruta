import { useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import DocumentField from '../components/DocumentField';
import { submitComplaint } from '../lib/complaint-book-api';
import { PHONE_ERROR, phoneInputProps, sanitizePhone, isValidOptionalPhone, COMPLAINT_DOCUMENT_TYPES, isValidDocument, documentError, type DocumentType } from '../lib/validators';

interface Props {
  onBack: () => void;
}

const inputCls = 'w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-xs font-medium text-t1 mb-1';

export default function ComplaintBookPage({ onBack }: Props) {
  const [form, setForm] = useState({
    type: 'RECLAMO' as 'RECLAMO' | 'QUEJA',
    consumerName: '', consumerDocumentType: 'DNI' as DocumentType, consumerDocument: '', consumerAddress: '', consumerEmail: '', consumerPhone: '',
    isMinor: false, guardianName: '',
    serviceDescription: '', claimedAmount: '',
    detail: '', consumerRequest: '',
  });
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ number: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidDocument(form.consumerDocumentType, form.consumerDocument)) {
      setError(documentError(form.consumerDocumentType));
      return;
    }
    if (!isValidOptionalPhone(form.consumerPhone)) {
      setError(PHONE_ERROR);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await submitComplaint({
        type: form.type,
        consumerName: form.consumerName,
        consumerDocument: form.consumerDocument,
        consumerDocumentType: form.consumerDocumentType,
        consumerAddress: form.consumerAddress || undefined,
        consumerEmail: form.consumerEmail,
        consumerPhone: form.consumerPhone || undefined,
        isMinor: form.isMinor,
        guardianName: form.isMinor ? form.guardianName : undefined,
        serviceDescription: form.serviceDescription,
        claimedAmount: form.claimedAmount ? Number(form.claimedAmount) : undefined,
        detail: form.detail,
        consumerRequest: form.consumerRequest,
        website: website || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el reclamo. Intenta nuevamente.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-t1">
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-t2 hover:text-t1">
            <ArrowLeft size={16} /> Volver a CHASKI AI
          </button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-t1 mb-2">Libro de Reclamaciones</h1>
        <p className="text-sm text-t2 mb-8 leading-relaxed">
          Conforme al Código de Protección y Defensa del Consumidor (Ley N° 29571), este es el Libro de Reclamaciones virtual de IMPORT STAR PERUVIAN EIRL (CHASKI AI). Aquí puedes registrar un <strong className="text-t1">reclamo</strong> (disconformidad relacionada a los productos o servicios) o una <strong className="text-t1">queja</strong> (disconformidad no relacionada, o malestar respecto a la atención).
        </p>

        {result ? (
          <div className="border border-border rounded-lg p-8 text-center">
            <CheckCircle size={34} className="text-ok mx-auto mb-4" />
            <p className="text-sm font-semibold text-t1 mb-2">Reclamo N.º {result.number} registrado</p>
            <p className="text-sm text-t2">Tienes derecho a recibir una respuesta dentro de los 30 días calendario siguientes. Guarda este número como constancia.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}><label>Sitio web<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label></div>
            <div>
              <label className={labelCls}>Tipo *</label>
              <div className="flex gap-3">
                {(['RECLAMO', 'QUEJA'] as const).map(t => (
                  <button key={t} type="button" onClick={() => set('type', t)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${form.type === t ? 'bg-primary text-white border-primary' : 'border-border text-t2 hover:bg-hover'}`}>
                    {t === 'RECLAMO' ? 'Reclamo' : 'Queja'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Nombre completo *</label>
                <input required maxLength={120} value={form.consumerName} onChange={e => set('consumerName', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Documento de identidad *</label>
                <DocumentField types={COMPLAINT_DOCUMENT_TYPES} docType={form.consumerDocumentType} value={form.consumerDocument}
                  onDocType={t => set('consumerDocumentType', t)} onValue={v => set('consumerDocument', v)} />
              </div>
              <div>
                <label className={labelCls}>Teléfono</label>
                <input {...phoneInputProps} value={form.consumerPhone} onChange={e => set('consumerPhone', sanitizePhone(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Correo *</label>
                <input required type="email" value={form.consumerEmail} onChange={e => set('consumerEmail', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Domicilio</label>
                <input maxLength={200} value={form.consumerAddress} onChange={e => set('consumerAddress', e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-t1">
                <input type="checkbox" checked={form.isMinor} onChange={e => set('isMinor', e.target.checked)} />
                El reclamante es menor de edad
              </label>
              {form.isMinor && (
                <div className="mt-2">
                  <label className={labelCls}>Nombre del padre, madre o apoderado *</label>
                  <input required value={form.guardianName} onChange={e => set('guardianName', e.target.value)} className={inputCls} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Bien o servicio contratado *</label>
                <input required maxLength={300} value={form.serviceDescription} onChange={e => set('serviceDescription', e.target.value)} placeholder="Ej. Plan Operación de CHASKI RUTA" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Monto reclamado (S/, opcional)</label>
                <input type="number" min="0" max="1000000" step="0.01" value={form.claimedAmount} onChange={e => set('claimedAmount', e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Detalle del reclamo o queja *</label>
              <textarea required rows={4} minLength={10} maxLength={3000} value={form.detail} onChange={e => set('detail', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className={labelCls}>¿Qué solicitas? *</label>
              <textarea required rows={2} maxLength={1000} value={form.consumerRequest} onChange={e => set('consumerRequest', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            {error && <p className="text-xs text-danger" role="alert">{error}</p>}

            <button type="submit" disabled={sending}
              className="w-full h-10 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-60 flex items-center justify-center gap-2">
              {sending && <Loader2 size={14} className="animate-spin" />}
              {sending ? 'Enviando…' : 'Registrar reclamo'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
