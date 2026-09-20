import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import {
  LayoutDashboard, Radio, ListOrdered, FileText, Route, ArrowLeftRight,
  Truck, Building2, Users, BarChart2, ShieldCheck, Settings,
  Map, MapPin, History, Cpu, Bell, Sparkles, Clock, AlertTriangle, Megaphone, Headphones as HeadphonesIcon,
} from 'lucide-react';
import Shell, { type NavItem } from '../../components/layout/Shell';
import OperationsCenter from './OperationsCenter';
import QueuesPage from './QueuesPage';
import ManifestsPage from './ManifestsPage';
import TripsPage from './TripsPage';
import RelocationsPage from './RelocationsPage';
import DelayedRegistrationsPage from './DelayedRegistrationsPage';
import FleetPage from './FleetPage';
import CompaniesPage from './CompaniesPage';
import PeoplePage from './PeoplePage';
import ReportsPage from './ReportsPage';
import AuditPage from './AuditPage';
import SettingsPage from './SettingsPage';
import NoticesPage from './NoticesPage';
import SupportPage from './SupportPage';
import GPSLivePage from './GPSLivePage';
import GPSHistoryPage from './GPSHistoryPage';
import GPSDevicesAdminPage from './GPSDevicesAdminPage';
import GPSAlertsPage from './GPSAlertsPage';
import RouteRiskPage from './RouteRiskPage';
import RouteGeofencePage from './RouteGeofencePage';
import AssistantPage from './AssistantPage';
import AssistantWidget from './AssistantWidget';
import { AssistantChatProvider } from './assistant-chat-context';
import { fetchMyOrganization, fetchRelocations, fetchGpsAlerts, type Organization } from '../../lib/operacion-api';

interface AdminDemoCtx {
  // El plan REAL de la asociacion (Organization.plan === 'PRO') -- ya no hay
  // un selector manual para "previsualizar" un plan que no se pago; eso vivia
  // aqui antes de que el control de plan real existiera en Super Admin (ver
  // SuperAdminApp.tsx). Si Jayde quiere mostrarle PRO a alguien que todavia no
  // lo tiene, usa "Entrar como administrador" desde Super Admin.
  isPRO: boolean;
  // El corredor (terminalOriginName/terminalDestinationName) de ESTA asociacion --
  // null mientras carga; las pantallas hijas usan routeLabel()/terminalName() de
  // operacion-api.ts con este valor en vez de escribir "Juli"/"Puno" a mano.
  org: Organization | null;
}
const AdminDemoContext = createContext<AdminDemoCtx>({ isPRO: false, org: null });
export const useAdminDemo = () => useContext(AdminDemoContext);

type Section =
  | 'inicio' | 'operacion' | 'colas' | 'manifiestos' | 'viajes' | 'reubicaciones'
  | 'inscripcion-retrasada'
  | 'flota' | 'empresas' | 'personas' | 'avisos' | 'reportes' | 'auditoria' | 'configuracion' | 'soporte'
  | 'asistente'
  | 'gps-live' | 'gps-history' | 'gps-devices' | 'gps-alerts' | 'gps-risk' | 'gps-geofence';

const BASE_NAV: NavItem[] = [
  { id: 'inicio', label: 'Inicio', icon: LayoutDashboard },
  { id: 'colas', label: 'Colas', icon: ListOrdered },
  { id: 'manifiestos', label: 'Ventas y manifiestos', icon: FileText },
  { id: 'viajes', label: 'Viajes', icon: Route },
  { id: 'reubicaciones', label: 'Reubicaciones', icon: ArrowLeftRight },
  { id: 'inscripcion-retrasada', label: 'Autorizaciones de inscripción', icon: Clock },
  { id: 'flota', label: 'Unidades y flota', icon: Truck },
  { id: 'empresas', label: 'Empresas integrantes', icon: Building2 },
  { id: 'personas', label: 'Personas', icon: Users },
  { id: 'avisos', label: 'Avisos', icon: Megaphone },
  { id: 'reportes', label: 'Reportes', icon: BarChart2 },
  { id: 'auditoria', label: 'Auditoría', icon: ShieldCheck },
  { id: 'soporte', label: 'Soporte', icon: HeadphonesIcon },
  { id: 'configuracion', label: 'Plan', icon: Settings },
];

const GPS_NAV: NavItem[] = [
  { id: 'gps-live', label: 'GPS en vivo', icon: Map },
  { id: 'gps-history', label: 'Historial GPS', icon: History },
  { id: 'gps-devices', label: 'Dispositivos GPS', icon: Cpu },
  { id: 'gps-alerts', label: 'Alertas GPS', icon: Bell },
  { id: 'gps-risk', label: 'Mapa de riesgo', icon: AlertTriangle },
  { id: 'gps-geofence', label: 'Corredor autorizado', icon: MapPin },
];

// Solo Plan PRO (plan-pro.md #6) -- por eso vive aparte de BASE_NAV/GPS_NAV.
const ASSISTANT_NAV: NavItem = { id: 'asistente', label: 'Asistente AI', icon: Sparkles };

export default function AdminApp({
  onLogout,
  superAdminActingOrg,
  onExitActingOrg,
}: {
  onLogout?: () => void;
  // Presente solo cuando un Super Admin entro "como administrador" de esta
  // asociacion (ver Platform en App.tsx) -- muestra el aviso de abajo y el
  // boton para salir. Ausente en el uso normal (admin real de su asociacion).
  superAdminActingOrg?: { id: string; name: string } | null;
  onExitActingOrg?: () => void;
}) {
  const [section, setSection] = useState<Section>(
    () => (window.history.state as { chaskiSection?: Section } | null)?.chaskiSection ?? 'inicio'
  );

  // El panel cambia de pantalla (Inicio, GPS en vivo, Configuracion, etc.)
  // solo con estado interno de React -- nunca cambiaba la URL ni el historial
  // del navegador. Por eso la flecha "atras" del navegador ignoraba por
  // completo la navegacion dentro del panel y saltaba directo a la entrada
  // anterior real del historial (el portal de asociaciones), sin importar
  // cuantas pantallas hubiera visitado la persona. Ahora cada cambio de
  // seccion agrega una entrada al historial (misma URL, con la seccion
  // guardada en el estado de esa entrada), y "atras" navega entre pantallas
  // del panel como se espera -- solo llega al portal cuando de verdad no hay
  // mas pantallas del panel que retroceder.
  useEffect(() => {
    window.history.replaceState(
      { ...(window.history.state ?? {}), chaskiSection: section },
      '',
      window.location.pathname
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      const s = (e.state as { chaskiSection?: Section } | null)?.chaskiSection;
      setSection(s ?? 'inicio');
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const navigateSection = useCallback((id: Section) => {
    setSection(id);
    window.history.pushState({ chaskiSection: id }, '', window.location.pathname);
  }, []);
  const [org, setOrg] = useState<Organization | null>(null);
  // El plan que ve el admin es siempre el plan REAL de su asociacion -- salvo
  // que un Super Admin haya entrado "como administrador" (ahi siempre ve PRO,
  // para poder configurar GPS sin depender de que la asociacion ya haya
  // pagado el plan).
  const isPRO = Boolean(superAdminActingOrg) || org?.plan === 'PRO';

  useEffect(() => {
    let cancelled = false;
    fetchMyOrganization()
      .then(result => {
        if (!cancelled) setOrg(result);
      })
      .catch(() => { /* las pantallas se degradan a Juli/Puno via el fallback de routeLabel() */ });
    return () => { cancelled = true; };
  }, [superAdminActingOrg]);

  // Badges reales de la barra lateral (12 sept 2026, corregido) -- ANTES eran
  // numeros fijos en el codigo (badge: 1, badge: 2) que nunca cambiaban sin
  // importar los datos reales. "Pendiente" en reubicaciones = cualquier
  // estado antes de COMPLETADA (mismo criterio que RelocationsPage.tsx); en
  // alertas GPS = NUEVA o EN_REVISION (mismo criterio que GPSAlertsPage.tsx).
  const [pendingRelocations, setPendingRelocations] = useState(0);
  const [pendingGpsAlerts, setPendingGpsAlerts] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetchRelocations()
        .then(list => { if (!cancelled) setPendingRelocations(list.filter(r => r.status !== 'COMPLETADA').length); })
        .catch(() => { /* se degrada sin badge */ });
      fetchGpsAlerts()
        .then(list => { if (!cancelled) setPendingGpsAlerts(list.filter(a => a.status === 'NUEVA' || a.status === 'EN_REVISION').length); })
        .catch(() => { /* se degrada sin badge */ });
    };
    poll();
    const id = setInterval(poll, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const withRealBadges = (items: NavItem[]): NavItem[] => items.map(item =>
    item.id === 'reubicaciones' ? { ...item, badge: pendingRelocations }
      : item.id === 'gps-alerts' ? { ...item, badge: pendingGpsAlerts }
      : item
  );

  // Revertido (12 sept 2026, decidido con Jayde): el GPS Vehicular individual
  // de un socio es un producto privado que EL paga -- el Administrador de la
  // asociacion no tiene por que ver nada de eso si la asociacion no tiene
  // PRO, ni el menu, ni las alertas. Ese rol de "controlador" cuando no hay
  // PRO lo cumple Super Admin (ver Super Admin -> GPS -> Alertas, y el
  // correo de notifySuperAdminIfNoPro en el backend), nunca el Administrador.
  const navItemsFull: NavItem[] = withRealBadges([
    ...BASE_NAV.slice(0, 1),
    ...(isPRO ? [ASSISTANT_NAV] : []),
    { id: 'operacion', label: 'Operación', icon: Radio },
    ...BASE_NAV.slice(1),
    ...(isPRO ? GPS_NAV : []),
  ]);

  return (
    <AdminDemoContext.Provider value={{ isPRO, org }}>
      <AssistantChatProvider orgName={org?.name}>
      <Shell navItems={navItemsFull} activeSection={section === 'operacion' ? 'inicio' : section} onNavigate={(id) => navigateSection(id as Section)} onLogout={onLogout}>
        <div className="sticky top-0 z-20">
          {superAdminActingOrg && (
            <div className="flex items-center gap-3 px-6 py-1.5 bg-indigo-600 text-white text-xs font-medium">
              <span className="uppercase tracking-wide bg-white/20 px-1.5 py-0.5 rounded">Modo Super Admin</span>
              <span>Estás viendo el panel de <strong>{superAdminActingOrg.name}</strong> como su administrador.</span>
              <button onClick={onExitActingOrg} className="ml-auto underline hover:no-underline">Salir</button>
            </div>
          )}
        </div>

        {section === 'inicio' && <OperationsCenter onNavigate={(s) => navigateSection(s as Section)} />}
        {section === 'operacion' && <OperationsCenter onNavigate={(s) => navigateSection(s as Section)} />}
        {section === 'colas' && <QueuesPage />}
        {section === 'manifiestos' && <ManifestsPage />}
        {section === 'viajes' && <TripsPage />}
        {section === 'reubicaciones' && <RelocationsPage />}
        {section === 'inscripcion-retrasada' && <DelayedRegistrationsPage />}
        {section === 'flota' && <FleetPage />}
        {section === 'empresas' && <CompaniesPage />}
        {section === 'personas' && <PeoplePage />}
        {section === 'avisos' && <NoticesPage />}
        {section === 'reportes' && <ReportsPage />}
        {section === 'auditoria' && <AuditPage />}
        {section === 'soporte' && <SupportPage />}
        {section === 'configuracion' && <SettingsPage />}
        {section === 'asistente' && <AssistantPage />}
        {section === 'gps-live' && <GPSLivePage />}
        {section === 'gps-history' && <GPSHistoryPage />}
        {section === 'gps-devices' && <GPSDevicesAdminPage />}
        {section === 'gps-alerts' && <GPSAlertsPage />}
        {section === 'gps-risk' && <RouteRiskPage />}
        {section === 'gps-geofence' && <RouteGeofencePage />}
      </Shell>
      {isPRO && section !== 'asistente' && <AssistantWidget />}
      </AssistantChatProvider>
    </AdminDemoContext.Provider>
  );
}
