import { useEffect, useState } from 'react';
import { Lock, X, CheckCircle } from 'lucide-react';
import { useAuth, requestPasswordResetApi } from '../../contexts/AuthContext';
import { fetchMyPersonProfile, updateMyProfile } from '../../lib/operacion-api';
import { DNI_ERROR, PHONE_ERROR, LICENSE_ERROR, dniInputProps, phoneInputProps, sanitizeDni, sanitizePhone, sanitizeLicense, isValidOptionalDni, isValidOptionalPhone, isValidLicense, licenseExpiryInputValue, licenseDatesError, todayInputValue } from '../../lib/validators';

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Administrador',
  partner: 'Socio',
  driver: 'Conductor',
};

const inputClass = 'w-full h-9 px-3 border border-border rounded-lg text-sm text-t1 bg-surface focus:outline-none focus:ring-2 focus:ring-primary';

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-t1 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

// "Mi cuenta" (Shell): igual para Super Admin, Administrador, Socio y Conductor.
// El correo, el rol y la asociacion se muestran pero no se editan.
export default function AccountModal({ onClose }: { onClose: () => void }) {
  const { user, refreshUser } = useAuth();
  const isDriver = user?.role === 'driver';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const emptyForm = { name: '', dni: '', phone: '', license: '', licenseCategory: '', licenseIssuedAt: '', licenseExpiry: '' };
  const [form, setForm] = useState(emptyForm);
  const [initial, setInitial] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [pwState, setPwState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    fetchMyPersonProfile()
      .then(p => {
        if (cancelled) return;
        const loaded = {
          name: p.name ?? '',
          dni: p.dni ?? '',
          phone: p.phone ?? '',
          license: p.license ?? '',
          licenseCategory: p.licenseCategory ?? '',
          licenseIssuedAt: licenseExpiryInputValue(p.licenseIssuedAt),
          licenseExpiry: licenseExpiryInputValue(p.licenseExpiry),
        };
        setForm(loaded);
        setInitial(loaded);
      })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar tus datos.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const set = (key: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setSaved(false);
    setError('');
  };

  // La licencia solo se valida y se envia si cambio algo de ella: quien solo
  // corrige su celular no queda bloqueado por una licencia cargada antes.
  const licenseChanged = (['license', 'licenseCategory', 'licenseIssuedAt', 'licenseExpiry'] as const).some(k => form[k] !== initial[k]);

  const validate = (): string => {
    if (!form.name.trim()) return 'Escribe tu nombre.';
    if (!isValidOptionalDni(form.dni)) return DNI_ERROR;
    if (!isValidOptionalPhone(form.phone)) return PHONE_ERROR;
    if (isDriver && licenseChanged) {
      if (!isValidLicense(form.license)) return LICENSE_ERROR;
      if (!form.licenseCategory.trim()) return 'Indica la categoría de tu licencia.';
      const dates = licenseDatesError(form.licenseIssuedAt, form.licenseExpiry);
      if (dates) return dates;
    }
    return '';
  };

  const handleSave = async () => {
    const message = validate();
    if (message) { setError(message); return; }
    setSaving(true);
    setError('');
    try {
      await updateMyProfile({
        name: form.name.trim(),
        dni: form.dni,
        phone: form.phone,
        ...(isDriver && licenseChanged
          ? { license: form.license, licenseCategory: form.licenseCategory.trim(), licenseIssuedAt: form.licenseIssuedAt, licenseExpiry: form.licenseExpiry }
          : {}),
      });
      await refreshUser();
      setInitial(form);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendPasswordLink = async () => {
    if (!user?.email) return;
    setPwState('sending');
    try {
      await requestPasswordResetApi(user.email);
      setPwState('sent');
    } catch {
      setPwState('error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Mi cuenta">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-t1">Mi cuenta</h2>
            <p className="text-xs text-t2 mt-0.5">{ROLE_LABEL[user?.role ?? ''] ?? 'Cuenta'} · {user?.org}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-t1 p-1" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {loading ? (
            <p className="text-sm text-t2 text-center py-8">Cargando tus datos…</p>
          ) : loadError ? (
            <p className="text-sm text-danger text-center py-8">{loadError}</p>
          ) : (
            <>
              <section>
                <h3 className="text-xs font-semibold text-t2 uppercase tracking-wide mb-3">Mis datos</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Field label="Correo" htmlFor="acc-email" hint="Es el correo con el que te invitaron; no se puede cambiar.">
                      <div className="relative">
                        <input id="acc-email" value={user?.email ?? ''} readOnly tabIndex={-1} className={`${inputClass} bg-bg text-t2 pr-9`} />
                        <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                      </div>
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Nombre completo" htmlFor="acc-name">
                      <input id="acc-name" value={form.name} onChange={e => set('name', e.target.value)} maxLength={120} className={inputClass} />
                    </Field>
                  </div>
                  <Field label="DNI" htmlFor="acc-dni" hint="8 números.">
                    <input id="acc-dni" value={form.dni} onChange={e => set('dni', sanitizeDni(e.target.value))} {...dniInputProps} className={`${inputClass} font-mono`} />
                  </Field>
                  <Field label="Celular" htmlFor="acc-phone" hint="9 números.">
                    <input id="acc-phone" value={form.phone} onChange={e => set('phone', sanitizePhone(e.target.value))} {...phoneInputProps} className={`${inputClass} font-mono`} />
                  </Field>
                  {isDriver && (
                    <>
                      <Field label="Licencia de conducir" htmlFor="acc-license" hint="1 letra y 8 números.">
                        <input id="acc-license" value={form.license} onChange={e => set('license', sanitizeLicense(e.target.value))} placeholder="Q12345678" autoComplete="off" className={`${inputClass} font-mono`} />
                      </Field>
                      <Field label="Categoría" htmlFor="acc-license-cat">
                        <input id="acc-license-cat" value={form.licenseCategory} onChange={e => set('licenseCategory', e.target.value)} placeholder="Ej. A-IIb" maxLength={20} className={inputClass} />
                      </Field>
                      <Field label="Fecha de emisión" htmlFor="acc-license-iss" hint={form.license && !form.licenseIssuedAt ? 'Falta registrar la fecha de emisión.' : undefined}>
                        <input id="acc-license-iss" type="date" max={todayInputValue()} value={form.licenseIssuedAt} onChange={e => set('licenseIssuedAt', e.target.value)} className={inputClass} />
                      </Field>
                      <Field label="Vencimiento de la licencia" htmlFor="acc-license-exp">
                        <input id="acc-license-exp" type="date" value={form.licenseExpiry} onChange={e => set('licenseExpiry', e.target.value)} className={inputClass} />
                      </Field>
                    </>
                  )}
                </div>
                {error && <p className="text-xs text-danger mt-3">{error}</p>}
                {saved && (
                  <p className="text-xs text-ok mt-3 flex items-center gap-1.5"><CheckCircle size={13} /> Tus datos se guardaron.</p>
                )}
                <div className="mt-4">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50"
                  >
                    {saving ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              </section>

              <section className="border-t border-border pt-5">
                <h3 className="text-xs font-semibold text-t2 uppercase tracking-wide mb-2">Mi contraseña</h3>
                <p className="text-xs text-t2 mb-3">
                  Puedes ingresar con Google o con tu correo y una contraseña propia. Para crearla o cambiarla te enviamos un enlace a <strong>{user?.email}</strong>.
                </p>
                {pwState === 'sent' ? (
                  <p className="text-xs text-ok flex items-start gap-1.5">
                    <CheckCircle size={13} className="mt-0.5 flex-shrink-0" />
                    <span>Listo. Revisa tu correo: el enlace vale 30 minutos y solo se puede usar una vez.</span>
                  </p>
                ) : (
                  <>
                    <button
                      onClick={handleSendPasswordLink}
                      disabled={pwState === 'sending'}
                      className="px-4 py-2 border border-border rounded-lg text-sm text-t1 hover:bg-hover disabled:opacity-50"
                    >
                      {pwState === 'sending' ? 'Enviando…' : 'Enviarme el enlace'}
                    </button>
                    {pwState === 'error' && <p className="text-xs text-danger mt-2">No se pudo enviar el enlace. Intenta de nuevo en un momento.</p>}
                  </>
                )}
              </section>
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
