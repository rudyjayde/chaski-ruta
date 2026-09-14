import { useState, useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Bell, RefreshCw, LogOut, ChevronDown, User, Sun, Moon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchMyOrganization, fetchNoticesUnreadCount, markNoticesRead } from '../../lib/operacion-api';

const NOTICES_POLL_MS = 30000;


const CHASKI_LOGO_URL = 'https://res.cloudinary.com/sgf8nwgk/image/upload/e_trim,f_png,q_auto/v1788027352/chaski-AI-nombre_1_1.png';

// Logo de CUALQUIER asociacion (org.logoUrl, configurado por el Super Admin) --
// nunca un logo fijo para una sola asociacion. src viene de fetchMyOrganization()
// mas abajo; si no hay logo cargado o la imagen falla, cae al nombre en texto.
function BrandLogo({ src, alt, compact = false }: { src: string; alt: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="font-semibold text-sm text-t1">{alt}</span>;
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="block object-contain object-left max-w-full"
      style={{ height: compact ? 26 : 34, width: 'auto', maxWidth: compact ? 140 : 180 }}
    />
  );
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  children?: NavItem[];
}

interface ShellProps {
  navItems: NavItem[];
  activeSection: string;
  onNavigate: (id: string) => void;
  children: ReactNode;
  isSuperAdmin?: boolean;
  onLogout?: () => void;
  // Reemplaza la etiqueta de plan por defecto (derivada de Organization.plan)
  // -- lo usan Socio/Conductor cuando SU unidad especifica tiene GPS
  // Vehicular contratado aparte, aunque la asociacion siga en Plan Operación
  // (plan-gps-vehicular.md: es un complemento por unidad, no un plan de la
  // asociacion completa, asi que Organization.plan solo no alcanza para
  // saber esto).
  planLabelOverride?: string;
}

export default function Shell({ navItems, activeSection, onNavigate, children, isSuperAdmin = false, onLogout, planLabelOverride }: ShellProps) {
  const { user, logout } = useAuth();
  const handleLogout = onLogout ?? logout;
  const [collapsed, setCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  // Modo oscuro/claro dentro de la asociación (Admin/Conductor/Socio/SuperAdmin).
  // Independiente del toggle de la Landing — este solo aplica dentro de Shell.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('chaski-theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('chaski-theme', theme);
    } catch {
      // localStorage puede fallar (modo privado, cuotas) — no bloquea el toggle visual
    }
  }, [theme]);

  const roleLabel: Record<string, string> = {
    admin: 'Administrador',
    driver: 'Conductor',
    partner: 'Socio',
    superadmin: 'Super Admin',
  };

  const orgDisplay = isSuperAdmin ? 'CHASKI AI' : user?.org ?? '';
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [orgPlan, setOrgPlan] = useState<'OPERACION' | 'PRO' | null>(null);
  useEffect(() => {
    if (isSuperAdmin) return;
    let cancelled = false;
    fetchMyOrganization()
      .then(org => {
        if (cancelled) return;
        setOrgLogoUrl(org?.logoUrl ?? null);
        setOrgPlan(org?.plan ?? null);
      })
      .catch(() => { /* se degrada al nombre en texto, sin etiqueta de plan */ });
    return () => { cancelled = true; };
  }, [isSuperAdmin]);
  const logoSrc = isSuperAdmin ? CHASKI_LOGO_URL : orgLogoUrl;

  // Etiqueta de plan (12 sept 2026): antes solo se veia el rol (Administrador/
  // Socio/Conductor), sin ninguna pista de si la asociacion tiene PRO,
  // Operación, o (para una unidad puntual) GPS Vehicular.
  const planLabel = planLabelOverride ?? (orgPlan === 'PRO' ? 'Plan PRO' : orgPlan === 'OPERACION' ? 'Plan Operación' : null);

  // Campanita real (12 sept 2026): cuenta avisos privados sin leer (ej.
  // resultado de una solicitud de bloqueo de motor) -- antes esto era
  // decorativo, siempre mostraba el punto rojo sin ningun dato real detras.
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetchNoticesUnreadCount()
        .then(({ count }) => { if (!cancelled) setUnreadCount(count); })
        .catch(() => { /* se degrada a 0, nunca inventa un numero */ });
    };
    poll();
    const id = setInterval(poll, NOTICES_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const hasAvisos = navItems.some(item => item.id === 'avisos');
  const handleBellClick = () => {
    markNoticesRead().then(() => setUnreadCount(0)).catch(() => { /* reintenta en el proximo poll */ });
    if (hasAvisos) onNavigate('avisos');
  };

  return (
    <div className="flex h-full bg-bg">
      {/* Sidebar */}
      <aside
        className="flex flex-col bg-surface border-r border-border flex-shrink-0 transition-all duration-200"
        style={{ width: collapsed ? 72 : 248 }}
        aria-label="Navegación principal"
      >
        {/* Logo */}
        <div className={`h-16 flex items-center border-b border-border px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              {logoSrc ? <BrandLogo src={logoSrc} alt={orgDisplay} /> : <span className="font-semibold text-sm text-t1">{orgDisplay}</span>}
              {isSuperAdmin && <p className="text-xs text-t2 leading-tight mt-0.5">Intelligent Platforms for Modern Operations</p>}
            </div>
          )}
          {collapsed && (
            <div className="w-7 h-7 bg-primary rounded flex items-center justify-center">
              <span className="text-white font-bold text-xs">{orgDisplay.charAt(0) || 'A'}</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(v => !v)}
            className={`text-muted hover:text-t1 ${collapsed ? 'mt-0' : ''}`}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative ${
                  active
                    ? 'bg-selected text-primary font-medium'
                    : 'text-t2 hover:bg-hover hover:text-t1'
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r" />}
                <Icon size={18} className="flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="bg-accent text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                        {item.badge}
                      </span>
                    ) : null}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Collapse toggle bottom */}
        <div className="border-t border-border p-3" />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-surface border-b border-border flex items-center px-6 gap-4 flex-shrink-0">
          <div className="flex-1 flex items-center gap-3 min-w-0">
            {logoSrc ? <BrandLogo src={logoSrc} alt={orgDisplay} compact /> : <span className="text-sm font-medium text-t1 truncate">{orgDisplay}</span>}
            <span className="text-border">·</span>
            <span className="text-sm text-t2">{roleLabel[user?.role ?? '']}</span>
            {planLabel && (
              <>
                <span className="text-border">·</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${planLabel === 'Plan PRO' ? 'bg-ok/10 text-ok' : planLabel === 'Plan GPS Vehicular' ? 'bg-primary/10 text-primary' : 'bg-t2/10 text-t2'}`}>
                  {planLabel}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Sync indicator */}
            <div className="hidden sm:flex items-center gap-1.5 text-sm text-ok bg-ok/10 px-2.5 py-1 rounded-full">
              <RefreshCw size={13} />
              <span>En línea</span>
            </div>

            {/* Notifications */}
            <button onClick={handleBellClick} className="relative text-t2 hover:text-t1 p-1" aria-label="Notificaciones" title={unreadCount > 0 ? `${unreadCount} sin leer` : 'Notificaciones'}>
              <Bell size={18} />
              {unreadCount > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-accent rounded-full" />}
            </button>

            {/* Account menu */}
            <div className="relative">
              <button
                onClick={() => setAccountOpen(v => !v)}
                className="flex items-center gap-2 hover:bg-hover rounded-lg px-2 py-1 transition-colors"
                aria-haspopup="true"
                aria-expanded={accountOpen}
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                  {user?.name?.[0] ?? 'U'}
                </div>
                <span className="text-sm font-medium text-t1 hidden md:block max-w-[140px] truncate">{user?.name}</span>
                <ChevronDown size={14} className="text-muted" />
              </button>

              {accountOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded-lg shadow-lg z-50 py-1" role="menu">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium text-t1 truncate">{user?.name}</p>
                    <p className="text-xs text-t2 truncate">{user?.email}</p>
                  </div>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-t2 hover:bg-hover"
                    role="menuitem"
                    onClick={() => { setAccountOpen(false); }}
                  >
                    <User size={14} />
                    Mi cuenta
                  </button>
                  <div className="border-t border-border mt-1 pt-1">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/5"
                      role="menuitem"
                      onClick={() => { setAccountOpen(false); handleLogout(); }}
                    >
                      <LogOut size={14} />
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Toggle modo oscuro/claro — flotante, esquina inferior derecha */}
      <button
        onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
        className="fixed bottom-5 right-5 z-50 w-11 h-11 rounded-full bg-surface border border-border shadow-lg flex items-center justify-center text-t2 hover:text-t1 hover:bg-hover transition-colors"
        aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </div>
  );
}
