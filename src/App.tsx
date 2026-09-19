import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { AuthProvider, useAuth, resetPasswordApi, type ProfileOption } from './contexts/AuthContext';
import Landing from './pages/Landing';
import LegalPage from './pages/LegalPage';
import AboutPage from './pages/AboutPage';
import ComplaintBookPage from './pages/ComplaintBookPage';
import { LEGAL_PAGE_SLUGS, type LegalPageSlug } from './lib/landing-content-api';
import Login from './pages/Login';
import AssociationPortal from '../AssociationPortal';
import AdminApp from './pages/admin/AdminApp';
import DriverApp from './pages/driver/DriverApp';
import PartnerApp from './pages/partner/PartnerApp';
import SuperAdminApp from './pages/superadmin/SuperAdminApp';
import VisitorAccountPage from './pages/VisitorAccountPage';
import { setVisitorToken } from './lib/visitor-auth-api';
import { verifyManifestPublic, type ManifestPublicVerification } from './lib/operacion-api';
import { getActingOrgId, getActingOrgName, setActingOrg } from './lib/acting-org';
import { passwordProblem, PASSWORD_HINT } from './lib/validators';

function useRouter() {
  const [path, setPath] = useState(() => window.location.pathname);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to);
    // `path` solo debe llevar la ruta (sin query string) para que comparaciones
    // como `path === '/'` sigan funcionando cuando `to` trae parametros, ej.
    // navigate('/?account=1') -- la URL real (con query) queda en la barra de
    // direcciones via pushState; quien la necesite la lee de window.location.search.
    setPath(new URL(to, window.location.origin).pathname);
  }, []);

  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  return { path, navigate };
}

function Platform({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  // Modo "Entrar como administrador": el Super Admin puede operar temporalmente
  // el panel de una asociacion especifica (reutiliza AdminApp tal cual, no una
  // pantalla aparte) -- ver acting-org.ts para el detalle de por que es seguro.
  const [actingOrg, setActingOrgState] = useState<{ id: string; name: string } | null>(() => {
    const id = getActingOrgId();
    const name = getActingOrgName();
    return id && name ? { id, name } : null;
  });
  if (!user) return null;

  const enterAsAdmin = (org: { id: string; name: string }) => {
    setActingOrg(org);
    setActingOrgState(org);
  };
  const exitActingOrg = () => {
    setActingOrg(null);
    setActingOrgState(null);
  };

  switch (user.role) {
    case 'admin': return <AdminApp onLogout={onLogout} />;
    case 'driver': return <DriverApp onLogout={onLogout} />;
    case 'partner': return <PartnerApp onLogout={onLogout} />;
    case 'superadmin':
      return actingOrg
        ? <AdminApp onLogout={onLogout} superAdminActingOrg={actingOrg} onExitActingOrg={exitActingOrg} />
        : <SuperAdminApp onLogout={onLogout} onEnterAsAdmin={enterAsAdmin} />;
  }
}


const CHASKI_WORDMARK_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/v1788027352/chaski-AI-nombre_1_1.png';
const ATIPCAR_WORDMARK_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/v1788058385/ATIPCAR-LOGO-NOMBre.png';

function ManifestVerificationPage({ token }: { token: string }) {
  const [record, setRecord] = useState<ManifestPublicVerification | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setRecord(undefined);
    verifyManifestPublic(token).then((result) => {
      if (!cancelled) setRecord(result);
    });
    return () => { cancelled = true; };
  }, [token]);

  if (record === undefined) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] flex items-center justify-center p-6">
        <p className="text-sm text-[#667085]">Verificando manifiesto…</p>
      </main>
    );
  }

  if (!record) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] flex items-center justify-center p-6">
        <section className="w-full max-w-xl bg-white border border-[#d8dee9] p-8 text-center">
          <img src={CHASKI_WORDMARK_URL} alt="CHASKI AI" className="h-7 mx-auto object-contain" />
          <h1 className="text-xl font-semibold text-[#101828] mt-8">Manifiesto no verificado</h1>
          <p className="text-sm text-[#667085] mt-2">El código no existe, fue revocado o no corresponde a un manifiesto emitido.</p>
          <p className="font-mono text-xs text-[#98a2b3] mt-5 break-all">{token}</p>
        </section>
      </main>
    );
  }

  const routeLabel = record.route === 'JULI_PUNO' ? 'Juli → Puno' : 'Puno → Juli';
  const total = record.passengers.reduce((sum, passenger) => sum + passenger.fare, 0);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#101828]">
      <header className="h-16 bg-white border-b border-[#d8dee9] flex items-center justify-between px-5 md:px-10">
        <img src={CHASKI_WORDMARK_URL} alt="CHASKI AI" className="h-7 md:h-8 w-auto object-contain" />
        <span className="text-xs font-medium text-[#475467]">Verificación pública de documentos</span>
      </header>
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        <section className="bg-white border border-[#d8dee9]">
          <div className="p-6 md:p-8 border-b border-[#d8dee9] flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#067647] bg-[#ecfdf3] px-3 py-1.5 border border-[#abefc6]">
                <span className="w-2 h-2 rounded-full bg-[#12b76a]" /> Manifiesto válido
              </p>
              <h1 className="text-2xl font-semibold mt-4">Manifiesto de pasajeros</h1>
              <p className="font-mono text-sm text-[#475467] mt-1">{record.number}</p>
            </div>
            <img src={ATIPCAR_WORDMARK_URL} alt="ATIPCAR" className="h-16 md:h-20 max-w-[260px] object-contain object-right" />
          </div>

          <div className="grid md:grid-cols-2 border-b border-[#d8dee9]">
            <div className="p-6 md:p-8 md:border-r border-[#d8dee9]">
              <h2 className="text-xs font-semibold text-[#155eef] uppercase">Información del viaje</h2>
              <dl className="mt-4 grid grid-cols-[130px_1fr] gap-y-3 text-sm">
                <dt className="text-[#667085]">Ruta</dt><dd className="font-medium">{routeLabel}</dd>
                <dt className="text-[#667085]">Salida</dt><dd>{record.date} {record.departureTime}</dd>
                <dt className="text-[#667085]">Llegada / cierre</dt><dd>{record.arrivalTime ?? 'Pendiente de cierre'}</dd>
                <dt className="text-[#667085]">Conductor</dt><dd>{record.driver}</dd>
              </dl>
            </div>
            <div className="p-6 md:p-8">
              <h2 className="text-xs font-semibold text-[#155eef] uppercase">Unidad y organización</h2>
              <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-3 text-sm">
                <dt className="text-[#667085]">Unidad</dt><dd className="font-semibold">{record.code}</dd>
                <dt className="text-[#667085]">Placa</dt><dd>{record.plate}</dd>
                <dt className="text-[#667085]">Modelo</dt><dd>{record.model}</dd>
                <dt className="text-[#667085]">Capacidad</dt><dd>{record.capacity} asientos</dd>
                <dt className="text-[#667085]">Asociación</dt><dd>{record.association}</dd>
                <dt className="text-[#667085]">Empresa</dt><dd>{record.company}</dd>
              </dl>
            </div>
          </div>

          <div className="p-6 md:p-8">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-xs font-semibold text-[#155eef] uppercase">Lista de pasajeros</h2>
              <span className="text-xs text-[#667085]">{record.passengers.length} de {record.capacity} asientos</span>
            </div>
            <div className="overflow-x-auto border border-[#d8dee9]">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-[#155eef] text-white">
                  <tr>
                    <th className="text-left px-3 py-2.5">N°</th><th className="text-left px-3 py-2.5">Asiento</th>
                    <th className="text-left px-3 py-2.5">Nombre completo</th><th className="text-left px-3 py-2.5">DNI</th>
                    <th className="text-left px-3 py-2.5">Origen</th><th className="text-left px-3 py-2.5">Destino</th>
                    <th className="text-right px-3 py-2.5">S/</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eaecf0]">
                  {record.passengers.map((passenger, index) => (
                    <tr key={String(passenger.seat) + passenger.dni}>
                      <td className="px-3 py-2.5">{index + 1}</td><td className="px-3 py-2.5 font-medium">{passenger.seat}</td>
                      <td className="px-3 py-2.5">{passenger.name}</td><td className="px-3 py-2.5 font-mono">{passenger.dni}</td>
                      <td className="px-3 py-2.5">{passenger.origin}</td><td className="px-3 py-2.5">{passenger.destination}</td>
                      <td className="px-3 py-2.5 text-right">{passenger.fare.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="font-semibold">Total recaudado: S/ {total.toFixed(2)}</p>
            </div>
          </div>
        </section>
        <p className="text-center text-xs text-[#667085] mt-5">Código de verificación: <span className="font-mono break-all">{token}</span></p>
      </div>
    </main>
  );
}

const AUTH_ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: 'Super Admin',
  ADMINISTRADOR: 'Administrador',
  SOCIO: 'Socio',
  CONDUCTOR: 'Conductor',
};

function AuthCallbackPage({ navigate }: { navigate: (to: string) => void }) {
  const { loginWithToken, fetchProfileOptions, loginWithSelectedProfile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // Si el correo tiene mas de una cuenta (Socio + Conductor), el backend no
  // entrega token directo — entrega un selectToken y aqui se muestra la
  // pantalla "¿A cual panel quieres entrar?" antes de completar el login.
  const [profiles, setProfiles] = useState<ProfileOption[] | null>(null);
  const [selectToken, setSelectToken] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  // Si vino del boton de la landing (?flow=landing), el destino tras el login
  // es la misma landing (Landing.tsx refleja el estado real solo, sin abrir
  // nada por su cuenta) -- nunca otra pantalla aparte. El login interno de
  // /ingresar sigue entrando directo a /portal como siempre.
  const [destination, setDestination] = useState('/portal');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const select = params.get('select');
    const token = params.get('token');
    const visitorToken = params.get('visitorToken');
    const dest = params.get('flow') === 'landing' ? '/' : '/portal';
    setDestination(dest);

    if (visitorToken) {
      setVisitorToken(visitorToken);
      navigate('/');
      return;
    }

    if (select) {
      setSelectToken(select);
      fetchProfileOptions(select)
        .then(setProfiles)
        .catch(err => setError(err instanceof Error ? err.message : 'No se pudieron cargar tus cuentas.'));
      return;
    }

    if (!token) {
      setError('No se recibió un token de acceso. Intenta de nuevo.');
      return;
    }
    loginWithToken(token)
      .then(() => navigate(dest))
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChoose = async (personId: string) => {
    if (!selectToken || choosing) return;
    setChoosing(true);
    setError(null);
    try {
      await loginWithSelectedProfile(selectToken, personId);
      navigate(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
      setChoosing(false);
    }
  };

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-danger text-sm mb-4">{error}</p>
          <button
            onClick={() => navigate('/ingresar')}
            className="text-primary text-sm font-medium hover:underline"
          >
            Volver a intentar
          </button>
        </div>
      </main>
    );
  }

  if (profiles) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-lg font-semibold text-t1 text-center mb-1">¿A cuál panel quieres entrar?</h1>
          <p className="text-xs text-t2 text-center mb-6">Este correo tiene más de una cuenta registrada.</p>
          <div className="space-y-2">
            {profiles.map(p => (
              <button
                key={p.id}
                onClick={() => handleChoose(p.id)}
                disabled={choosing}
                className="w-full text-left px-4 py-3 bg-surface border border-border rounded-lg hover:border-primary hover:bg-hover transition-colors disabled:opacity-50"
              >
                <p className="text-sm font-medium text-t1">{AUTH_ROLE_LABEL[p.role] ?? p.role}</p>
                <p className="text-xs text-t2 mt-0.5">{p.name}{p.company ? ` · ${p.company}` : ''}</p>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-t2">Verificando tu cuenta…</p>
    </main>
  );
}

// Pantalla que abre el enlace del correo de "Recuperar acceso" (ver
// MailService.sendPasswordResetEmail / POST /auth/reset-password). El token
// viaja en el query string, nunca en el path, para no quedar en logs de
// servidor tan facilmente como un path si algo lo registrara por error.
function ResetPasswordPage({ navigate }: { navigate: (to: string) => void }) {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await resetPasswordApi(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-danger">Enlace inválido o incompleto. Solicita uno nuevo desde "Recuperar acceso".</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-lg p-6 shadow-sm">
        <h1 className="text-base font-semibold text-t1 mb-5">Define tu contraseña</h1>

        {done ? (
          <>
            <p className="text-sm text-t2 mb-5">Tu contraseña quedó guardada. Ya puedes ingresar con tu correo y esa contraseña.</p>
            <button
              onClick={() => navigate('/ingresar')}
              className="w-full h-10 bg-primary hover:bg-primary-h text-white rounded-lg text-sm font-medium transition-colors"
            >
              Ir a iniciar sesión
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label htmlFor="new-password" className="block text-sm font-medium text-t1 mb-1">Contraseña</label>
              <p className="text-[11px] text-muted mb-1">{PASSWORD_HINT}</p>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full h-10 px-3 border border-border rounded-lg text-sm text-t1 bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-t1 mb-1">Confirmar contraseña</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                minLength={8}
                className="w-full h-10 px-3 border border-border rounded-lg text-sm text-t1 bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            {error && <p className="text-danger text-sm mb-4">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-primary hover:bg-primary-h text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {loading ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function Router() {
  const { user, restoring, logout } = useAuth();
  const { path, navigate } = useRouter();

  useEffect(() => {
    // Mientras se está restaurando la sesión desde el token guardado (justo
    // después de un refresh de página) todavía no sabemos si hay usuario o
    // no — no decidir ninguna redirección hasta que eso termine.
    if (restoring || !user) return;
    if (path === '/ingresar') {
      navigate(user.role === 'superadmin' ? '/app' : '/portal');
      return;
    }
    if (user.role === 'superadmin' && path === '/portal') {
      navigate('/app');
    }
  }, [user, restoring, path, navigate]);

  if (path.startsWith('/verificar/manifiesto/')) {
    const token = decodeURIComponent(path.slice('/verificar/manifiesto/'.length));
    return <ManifestVerificationPage token={token} />;
  }

  // Paginas legales y Libro de Reclamaciones -- publicas, sin cuenta ni
  // asociacion, por eso se resuelven aqui arriba, antes de esperar a que
  // termine de restaurarse la sesion o de saber si hay usuario.
  if (path.startsWith('/legal/')) {
    const slug = path.slice('/legal/'.length).replace(/\/$/, '');
    if (slug in LEGAL_PAGE_SLUGS) {
      return <LegalPage slug={slug as LegalPageSlug} onBack={() => navigate('/')} />;
    }
  }
  if (path === '/libro-de-reclamaciones') {
    return <ComplaintBookPage onBack={() => navigate('/')} />;
  }
  if (path === '/empresa') {
    return <AboutPage onBack={() => navigate('/')} />;
  }

  if (path === '/auth/callback') {
    return <AuthCallbackPage navigate={navigate} />;
  }

  if (path === '/restablecer-contrasena') {
    return <ResetPasswordPage navigate={navigate} />;
  }

  // Al refrescar la página, React vuelve a montar todo con user=null mientras
  // AuthContext valida el token guardado contra el backend (restoring=true).
  // Antes, este componente decidía "no hay usuario todavía" en ese instante y
  // mandaba a /ingresar — y al terminar la restauración, el useEffect de
  // arriba veía path==='/ingresar' y empujaba a cualquier cuenta no-superadmin
  // a /portal, perdiendo la pantalla en la que la persona estaba. Ahora se
  // espera a que restoring termine antes de decidir cualquier redirección.
  if (restoring) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-t2">Verificando tu cuenta…</p>
      </main>
    );
  }

  if (path === '/' || path === '') {
    return <Landing onNavigateToLogin={() => navigate('/ingresar')} navigate={navigate} />;
  }

  if (path === '/ingresar') {
    return (
      <Login
        onNavigateToApp={() => navigate('/portal')}
        onNavigateToLanding={() => navigate('/')}
      />
    );
  }

  if (path === '/mi-cuenta') {
    return <VisitorAccountPage navigate={navigate} />;
  }

  if (path === '/portal') {
    if (!user) {
      navigate('/ingresar');
      return null;
    }
    // Superadmin no pertenece a ninguna asociacion — pasa directo al panel.
    // Cualquier otra cuenta (admin, socio, conductor) SIEMPRE ve primero esta
    // pantalla de bienvenida con SU UNICA asociacion (resuelta por el backend
    // desde el login, aislada por organizationId). No es un selector: el
    // backend nunca permite listar ni operar sobre ninguna otra asociacion —
    // por eso AssociationPortal solo muestra la propia, nunca una lista para
    // elegir. Esta regla de aislamiento aplica para toda asociacion y todo rol.
    if (user.role === 'superadmin') {
      navigate('/app');
      return null;
    }
    return (
      <AssociationPortal
        onEnterAssociation={() => navigate('/app')}
        onLogout={() => {
          logout();
          navigate('/ingresar');
        }}
      />
    );
  }
  if (path.startsWith('/app')) {
    if (!user) {
      navigate('/ingresar');
      return null;
    }
    return (
      <Platform
        onLogout={() => {
          logout();
          navigate('/ingresar');
        }}
      />
    );
  }

  return <Landing onNavigateToLogin={() => navigate('/ingresar')} navigate={navigate} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
