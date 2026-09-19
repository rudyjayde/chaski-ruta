import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, AlertCircle, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth, requestPasswordResetApi, type ProfileOption } from '../contexts/AuthContext';

const WORDMARK_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/e_trim,f_png,q_auto/v1788027352/chaski-AI-nombre_1_1.png';
const TAGLINE = 'Plataformas inteligentes para modernas operaciones';

const AUTH_ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: 'Super Admin',
  ADMINISTRADOR: 'Administrador',
  SOCIO: 'Socio',
  CONDUCTOR: 'Conductor',
};

function WordmarkImg() {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="font-semibold text-t1 text-xl">CHASKI AI</span>;
  return (
    <img
      src={WORDMARK_URL}
      alt="CHASKI AI"
      height={28}
      style={{ height: 28, objectFit: 'contain', display: 'block' }}
      onError={() => setFailed(true)}
    />
  );
}

interface Props {
  onNavigateToApp: () => void;
  onNavigateToLanding: () => void;
}

export default function Login({ onNavigateToApp, onNavigateToLanding }: Props) {
  const { login, fetchProfileOptions, loginWithSelectedProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cuando el correo tiene mas de una cuenta (Socio + Conductor), login()
  // devuelve un selectToken en vez de entrar directo -- se muestra este
  // selector antes de completar el ingreso (mismo flujo que el login de
  // Google, ver AuthCallbackPage en App.tsx).
  const [selectToken, setSelectToken] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileOption[] | null>(null);
  const [choosing, setChoosing] = useState(false);

  // "Recuperar acceso": mismo formulario, cambia a un mini-flujo de
  // "te mandamos un enlace" en vez de navegar a otra pantalla aparte.
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.ok) {
      onNavigateToApp();
      return;
    }
    if (result.selectToken) {
      setSelectToken(result.selectToken);
      try {
        setProfiles(await fetchProfileOptions(result.selectToken));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar tus cuentas.');
      }
      return;
    }
    setError(result.error ?? 'Error de conexión');
  };

  const handleChooseProfile = async (personId: string) => {
    if (!selectToken || choosing) return;
    setChoosing(true);
    setError('');
    try {
      await loginWithSelectedProfile(selectToken, personId);
      onNavigateToApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
      setChoosing(false);
    }
  };

  const handleForgotSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotLoading(true);
    try {
      await requestPasswordResetApi(forgotEmail);
      setForgotSent(true);
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'No se pudo procesar la solicitud.');
    } finally {
      setForgotLoading(false);
    }
  };

  const backToLogin = () => {
    setView('login');
    setForgotSent(false);
    setForgotError('');
    setForgotEmail('');
  };

  // Login real con Google: redirige al backend, que arma el flujo OAuth completo
  // (ver GET /auth/google en backend/src/auth/auth.controller.ts) y al volver
  // entrega un JWT en /auth/callback?token=... — ver AuthCallbackPage en App.tsx.
  const handleGoogleLogin = () => {
    const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
    if (!apiUrl) {
      setError('Falta configurar VITE_API_URL para iniciar sesión con Google.');
      return;
    }
    window.location.href = `${apiUrl}/auth/google`;
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Back to landing */}
      <div className="px-6 py-4">
        <button
          onClick={onNavigateToLanding}
          className="flex items-center gap-2 text-sm text-t2 hover:text-t1 transition-colors"
        >
          <ArrowLeft size={15} />
          Volver al inicio
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-12">
        <div className="w-full max-w-sm">
          {/* Brand */}
          <div className="mb-8 text-center flex flex-col items-center">
            <div className="mb-3">
              <WordmarkImg />
            </div>
            <p className="text-sm text-t2">{TAGLINE}</p>
          </div>

          {/* Card */}
          <div className="bg-surface border border-border rounded-lg p-6 shadow-sm">
            {profiles ? (
              <>
                <h1 className="text-base font-semibold text-t1 mb-1">¿A cuál panel quieres entrar?</h1>
                <p className="text-xs text-t2 mb-5">Este correo tiene más de una cuenta registrada.</p>
                {error && (
                  <div role="alert" className="flex items-center gap-2 mb-4 text-danger text-sm">
                    <AlertCircle size={14} />
                    <span>{error}</span>
                  </div>
                )}
                <div className="space-y-2">
                  {profiles.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleChooseProfile(p.id)}
                      disabled={choosing}
                      className="w-full text-left px-4 py-3 border border-border rounded-lg hover:border-primary hover:bg-hover transition-colors disabled:opacity-50"
                    >
                      <p className="text-sm font-medium text-t1">{AUTH_ROLE_LABEL[p.role] ?? p.role}</p>
                      <p className="text-xs text-t2 mt-0.5">{p.name}{p.company ? ` · ${p.company}` : ''}</p>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => { setProfiles(null); setSelectToken(null); }}
                  className="w-full text-center text-xs text-t2 hover:text-t1 mt-4"
                >
                  Volver
                </button>
              </>
            ) : view === 'forgot' ? (
              <>
                <h1 className="text-base font-semibold text-t1 mb-1">Recuperar acceso</h1>
                <p className="text-xs text-t2 mb-5">Te enviamos un enlace para definir tu contraseña.</p>

                {forgotSent ? (
                  <div className="flex items-start gap-2 p-3 bg-[#ECFDF3] border border-[#ABEFC6] rounded-lg text-sm text-[#067647]">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                    <span>Si el correo está registrado, te enviamos un enlace para continuar. Revisa tu bandeja de entrada.</span>
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit} noValidate>
                    <div className="mb-4">
                      <label htmlFor="forgot-email" className="block text-sm font-medium text-t1 mb-1">
                        Correo
                      </label>
                      <input
                        id="forgot-email"
                        type="email"
                        autoComplete="username"
                        value={forgotEmail}
                        onChange={e => { setForgotEmail(e.target.value); setForgotError(''); }}
                        required
                        placeholder="correo@ejemplo.com"
                        className="w-full h-10 px-3 border border-border rounded-lg text-sm text-t1 bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-muted"
                      />
                    </div>
                    {forgotError && (
                      <div role="alert" className="flex items-center gap-2 mb-3 text-danger text-sm">
                        <AlertCircle size={14} />
                        <span>{forgotError}</span>
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full h-10 bg-primary hover:bg-primary-h text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {forgotLoading ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : 'Enviar enlace'}
                    </button>
                  </form>
                )}

                <button
                  type="button"
                  onClick={backToLogin}
                  className="w-full text-center text-xs text-t2 hover:text-t1 mt-4"
                >
                  Volver a iniciar sesión
                </button>
              </>
            ) : (
              <>
                <h1 className="text-base font-semibold text-t1 mb-5">Acceso a la plataforma</h1>

                <form onSubmit={handleSubmit} noValidate>
                  <div className="mb-4">
                    <label htmlFor="email" className="block text-sm font-medium text-t1 mb-1">
                      Correo
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError(''); }}
                      required
                      placeholder="correo@ejemplo.com"
                      className="w-full h-10 px-3 border border-border rounded-lg text-sm text-t1 bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-muted"
                    />
                  </div>

                  <div className="mb-1">
                    <label htmlFor="password" className="block text-sm font-medium text-t1 mb-1">
                      Contraseña
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPw ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(''); }}
                        required
                        placeholder="••••••••"
                        className="w-full h-10 px-3 pr-10 border border-border rounded-lg text-sm text-t1 bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-muted"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw(v => !v)}
                        aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-t2"
                      >
                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div role="alert" className="flex items-center gap-2 mt-3 text-danger text-sm">
                      <AlertCircle size={14} />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex justify-end mt-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setView('forgot')}
                      className="px-2.5 py-1 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
                    >
                      Recuperar acceso
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-10 bg-primary hover:bg-primary-h text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Verificando…</> : 'Ingresar'}
                  </button>
                </form>

                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted">o</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full h-10 border border-border rounded-lg text-sm text-t1 flex items-center justify-center gap-3 hover:bg-hover transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continuar con Google
                </button>
              </>
            )}
          </div>

          <p className="text-center text-xs text-muted mt-4">
            CHASKI RUTA
          </p>
        </div>
      </div>
    </div>
  );
}
