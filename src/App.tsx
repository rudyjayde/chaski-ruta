import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth, type ProfileOption } from './contexts/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import AssociationPortal from '../AssociationPortal';
import AdminApp from './pages/admin/AdminApp';
import DriverApp from './pages/driver/DriverApp';
import PartnerApp from './pages/partner/PartnerApp';
import SuperAdminApp from './pages/superadmin/SuperAdminApp';
import { MANIFESTS } from './data/demo';
import { getActingOrgId, getActingOrgName, setActingOrg } from './lib/acting-org';

function useRouter() {
  const [path, setPath] = useState(() => window.location.pathname);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to);
    setPath(to);
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


const MANIFEST_RECORDS_KEY = 'atipcar-manifest-verification-v1';
const CHASKI_WORDMARK_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/v1788027352/chaski-AI-nombre_1_1.png';
const ATIPCAR_WORDMARK_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/v1788058385/ATIPCAR-LOGO-NOMBre.png';

type VerificationPassenger = {
  seat: number;
  name: string;
  dni: string;
  origin: string;
  destination: string;
  fare: number;
  paymentMethod: string;
};

type StoredManifestRecord = {
  status: string;
  pdfDataUrl?: string;
  number: string;
  route: string;
  departure: string;
  arrival: string;
  downloadedAt: string;
  code: string;
  plate: string;
  model: string;
  capacity: number;
  association: string;
  company: string;
  driver: string;
  dni: string;
  license: string;
  passengers: VerificationPassenger[];
  total: number;
};

function manifestVerificationToken(id: string, number: string, code: string) {
  return 'atp_' + btoa(id + '|' + number + '|' + code).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function ManifestVerificationPage({ token }: { token: string }) {
  const storedRecords = (() => {
    try {
      return JSON.parse(localStorage.getItem(MANIFEST_RECORDS_KEY) ?? '{}') as Record<string, StoredManifestRecord>;
    } catch {
      return {} as Record<string, StoredManifestRecord>;
    }
  })();
  const stored = storedRecords[token];
  const source = MANIFESTS.find(manifest =>
    manifestVerificationToken(manifest.id, manifest.number, manifest.code) === token
  );
  const record: StoredManifestRecord | null = stored ?? (source ? {
    status: 'VALIDO',
    number: source.number,
    route: source.route === 'JULI_PUNO' ? 'Juli → Puno' : 'Puno → Juli',
    departure: source.date + ' ' + source.departureTime,
    arrival: source.arrivalTime ?? 'Pendiente de cierre',
    downloadedAt: 'PDF aún no emitido',
    code: source.code,
    plate: source.plate,
    model: source.vehicleType,
    capacity: source.capacity,
    association: 'ATIPCAR',
    company: source.company,
    driver: source.driverName,
    dni: 'Protegido',
    license: 'Protegida',
    passengers: source.passengers,
    total: source.passengers.reduce((sum, passenger) => sum + passenger.fare, 0),
  } : null);

  if (!record) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] flex items-center justify-center p-6">
        <section className="w-full max-w-xl bg-white border border-[#d8dee9] p-8 text-center">
          <img src={CHASKI_WORDMARK_URL} alt="CHASKI AI" className="h-7 mx-auto object-contain" />
          <h1 className="text-xl font-semibold text-[#101828] mt-8">Manifiesto no verificado</h1>
          <p className="text-sm text-[#667085] mt-2">El código no existe, fue revocado o no corresponde a un manifiesto emitido por ATIPCAR.</p>
          <p className="font-mono text-xs text-[#98a2b3] mt-5 break-all">{token}</p>
        </section>
      </main>
    );
  }

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
                <dt className="text-[#667085]">Ruta</dt><dd className="font-medium">{record.route}</dd>
                <dt className="text-[#667085]">Salida</dt><dd>{record.departure}</dd>
                <dt className="text-[#667085]">Llegada / cierre</dt><dd>{record.arrival}</dd>
                <dt className="text-[#667085]">Descargado</dt><dd>{record.downloadedAt}</dd>
                <dt className="text-[#667085]">Conductor</dt><dd>{record.driver}</dd>
                <dt className="text-[#667085]">DNI</dt><dd>{record.dni}</dd>
                <dt className="text-[#667085]">Licencia</dt><dd>{record.license}</dd>
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
              <p className="font-semibold">Total recaudado: S/ {record.total.toFixed(2)}</p>
              {record.pdfDataUrl ? (
                <a href={record.pdfDataUrl} target="_blank" rel="noreferrer" className="inline-flex justify-center px-4 py-2.5 bg-[#155eef] text-white text-sm font-semibold hover:bg-[#004eeb]">
                  Visualizar PDF emitido
                </a>
              ) : (
                <span className="text-xs text-[#667085]">El PDF estará disponible después de la primera emisión.</span>
              )}
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const select = params.get('select');
    const token = params.get('token');

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
      .then(() => navigate('/portal'))
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChoose = async (personId: string) => {
    if (!selectToken || choosing) return;
    setChoosing(true);
    setError(null);
    try {
      await loginWithSelectedProfile(selectToken, personId);
      navigate('/portal');
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

  if (path === '/auth/callback') {
    return <AuthCallbackPage navigate={navigate} />;
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
    return <Landing onNavigateToLogin={() => navigate('/ingresar')} />;
  }

  if (path === '/ingresar') {
    return (
      <Login
        onNavigateToApp={() => navigate('/portal')}
        onNavigateToLanding={() => navigate('/')}
      />
    );
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

  return <Landing onNavigateToLogin={() => navigate('/ingresar')} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
