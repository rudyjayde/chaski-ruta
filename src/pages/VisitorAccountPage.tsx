import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getVisitorToken, setVisitorToken, clearVisitorToken, fetchVisitorMe, registerVisitor, loginVisitor, visitorGoogleLoginUrl,
  type VisitorMe, type CommercialRequestStatus,
} from '../lib/visitor-auth-api';
import { passwordProblem, capitalizeWords } from '../lib/validators';

const STATUS_LABEL: Record<CommercialRequestStatus, string> = {
  NUEVA: 'Recibida',
  CONTACTADA: 'En contacto',
  COTIZADA: 'Cotización enviada',
  CONVERTIDA: 'Convertida en cliente',
  DESCARTADA: 'Descartada',
};

const SOLUTION_LABEL: Record<VisitorMe['commercialRequests'][number]['solution'], string> = {
  OPERACION: 'Plan Operación',
  PRO: 'Plan PRO',
  GPS_VEHICULAR: 'GPS Vehicular',
};

function VisitorAuthForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'register') {
      const problem = passwordProblem(password);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setLoading(true);
    try {
      const { token } = mode === 'login'
        ? await loginVisitor(email, password)
        : await registerVisitor(email, password, name || undefined, website || undefined);
      setVisitorToken(token);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <h1 className="text-lg font-semibold text-t1 text-center mb-1">Mi cuenta</h1>
      <p className="text-sm text-t2 text-center mb-6">
        {mode === 'login' ? 'Inicia sesión para ver el estado de tu cotización.' : 'Regístrate para ver el estado de tu cotización.'}
      </p>

      <a
        href={visitorGoogleLoginUrl()}
        className="w-full flex items-center justify-center gap-2 h-10 border border-border rounded-lg text-sm font-medium text-t1 hover:bg-hover transition-colors mb-4"
      >
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
          <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
          <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
          <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
        </svg>
        Continuar con Google
      </a>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted">o con correo</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}><label>Sitio web<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label></div>
        {mode === 'register' && (
          <input
            value={name}
            onChange={e => setName(capitalizeWords(e.target.value))}
            placeholder="Tu nombre"
            className="w-full h-10 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        )}
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Correo"
          className="w-full h-10 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          type="password"
          required
          minLength={mode === 'register' ? 8 : undefined}
          maxLength={72}
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder={mode === 'register' ? 'Contraseña (8 o más, con letras y números)' : 'Contraseña'}
          className="w-full h-10 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50"
        >
          {loading ? 'Un momento…' : mode === 'login' ? 'Iniciar sesión' : 'Registrarme'}
        </button>
      </form>

      <p className="text-center text-sm text-t2 mt-4">
        {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          className="text-primary font-medium hover:underline"
        >
          {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
        </button>
      </p>
    </div>
  );
}

function VisitorDashboard({ visitor, onLogout }: { visitor: VisitorMe; onLogout: () => void }) {
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-t1">Hola{visitor.name ? `, ${visitor.name}` : ''}</h1>
          <p className="text-sm text-t2">{visitor.email}</p>
        </div>
        <button onClick={onLogout} className="text-sm text-t2 hover:text-t1">Cerrar sesión</button>
      </div>

      <h2 className="text-sm font-semibold text-t2 uppercase tracking-wide mb-3">Tus cotizaciones</h2>
      {visitor.commercialRequests.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-6 text-center text-sm text-t2">
          Todavía no has enviado ninguna cotización.
        </div>
      ) : (
        <div className="space-y-2">
          {visitor.commercialRequests.map(r => (
            <div key={r.id} className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-t1">{r.orgName || SOLUTION_LABEL[r.solution]}</span>
                <span className="text-[11px] px-2 py-0.5 rounded font-medium bg-primary/10 text-primary">
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              <p className="text-sm text-t2">{SOLUTION_LABEL[r.solution]}</p>
              <p className="text-xs text-muted mt-1">Enviada el {new Date(r.createdAt).toLocaleDateString('es-PE')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Contenido reusable: se muestra dentro de un modal encima de la landing
// (AccountModal en Landing.tsx) o en la pantalla completa /mi-cuenta -- misma
// logica, dos formas de mostrarla. Si `user` (sesion real de Person) ya esta
// activa, significa que la cuenta SI pertenece a una asociacion real: aparece
// el boton "Ingresar a la plataforma". Si no, se resuelve como visitante.
export function AccountPanelContent({ navigate }: { navigate: (to: string) => void }) {
  const { user, logout } = useAuth();
  const [visitor, setVisitor] = useState<VisitorMe | null>(null);
  const [loadingVisitor, setLoadingVisitor] = useState(true);

  const loadVisitor = () => {
    const token = getVisitorToken();
    if (!token) { setLoadingVisitor(false); return; }
    fetchVisitorMe()
      .then(v => setVisitor(v))
      .catch(() => clearVisitorToken())
      .finally(() => setLoadingVisitor(false));
  };

  useEffect(() => {
    if (user) { setLoadingVisitor(false); return; }
    loadVisitor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (user) {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="text-lg font-semibold text-t1 mb-1">Hola, {user.name}</h1>
        <p className="text-sm text-t2 mb-6">Tu cuenta pertenece a {user.org}.</p>
        <button
          onClick={() => navigate(user.role === 'superadmin' ? '/app' : '/portal')}
          className="w-full h-11 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h mb-3"
        >
          Ingresar a la plataforma
        </button>
        <button onClick={() => { logout(); navigate('/'); }} className="text-sm text-t2 hover:text-t1">
          Cerrar sesión
        </button>
      </div>
    );
  }

  if (loadingVisitor) return <p className="text-sm text-t2">Cargando…</p>;

  if (visitor) {
    return <VisitorDashboard visitor={visitor} onLogout={() => { clearVisitorToken(); setVisitor(null); }} />;
  }

  return <VisitorAuthForm onAuthenticated={loadVisitor} />;
}

export default function VisitorAccountPage({ navigate }: { navigate: (to: string) => void }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <button onClick={() => navigate('/')} className="text-sm text-t2 hover:text-t1 mb-8">← Volver al sitio</button>
      <AccountPanelContent navigate={navigate} />
    </main>
  );
}
