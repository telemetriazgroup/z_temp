import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import { useAppTheme } from './ThemeContext';
import { userIsMonitoreoNavigation, userCanManageUsers, userCanAccessAudit, resolveUserCategory, userHasNoFleetAccess, userIsAdmin, userIsSuperAdmin } from './modules/usuario';
import { useLocale } from './i18n';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import {
  SinEquiposAsignados,
  pathRequiresFleet,
} from './components/SinEquiposAsignados';
import { fetchServerGrupos, syncDeviceNamesToServer } from './modules/correo/correoServerApi';
import { refreshDeviceNamesFromServer } from './lib/deviceLocalNames';
import { userHasCorreoIncidentAccess } from './modules/correo/incidentAccess';
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar';
import { Button } from './components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import {
  Home,
  List,
  Settings,
  Monitor,
  Bell,
  BellPlus,
  MapPin,
  HelpCircle,
  LogOut,
  Menu,
  X,
  BookOpen,
  History,
  Shield,
  Mail,
  Inbox,
  UserCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Building2,
  Sun,
  Moon,
  RadioTower,
} from 'lucide-react';
import type { GrupoCorreo } from './modules/correo/types';
import { cn } from './components/ui/utils';

const SIDEBAR_KEY = 'ztrack_sidebar_expanded';

function readSidebarExpanded(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

function userInitials(user: {
  displayName?: string;
  nombres?: string;
  apellidos?: string;
  username: string;
}): string {
  const base = (
    user.displayName ||
    [user.nombres, user.apellidos].filter(Boolean).join(' ') ||
    user.username ||
    '?'
  ).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

function userTypeLabel(
  user: {
    superUser?: boolean;
    category?: string;
    role?: string;
  } | null,
  t: (key: string) => string
): string {
  if (!user) return '';
  const c = resolveUserCategory(user as import('./types').User);
  if (c === 'superadmin') return t('roles.superadmin');
  if (c === 'admin') return t('roles.admin');
  return t('roles.user');
}

export default function Layout() {
  const [sidebarExpanded, setSidebarExpanded] = useState(readSidebarExpanded);
  const [gruposCorreo, setGruposCorreo] = useState<GrupoCorreo[]>([]);
  const { logout, user } = useAuth();
  const { theme, toggleTheme, setTheme, ready: themeReady } = useAppTheme();
  const { t, intlLocale, locale } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();

  const toggleSidebar = () => {
    setSidebarExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const menuMonitoreo = userIsMonitoreoNavigation(user);
  const verIncidentesCorreo = userHasCorreoIncidentAccess(user, gruposCorreo);
  const displayName =
    user?.displayName?.trim() ||
    [user?.nombres, user?.apellidos].filter(Boolean).join(' ') ||
    user?.username ||
    '';

  useEffect(() => {
    if (user == null) return;
    fetchServerGrupos()
      .then(setGruposCorreo)
      .catch(() => setGruposCorreo([]));
    if (user.deviceNames && Object.keys(user.deviceNames).length > 0) {
      void syncDeviceNamesToServer(user.deviceNames).catch(() => {});
    }
    void refreshDeviceNamesFromServer().catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user || !menuMonitoreo) return;
    const permitido =
      location.pathname === '/' ||
      location.pathname === '/listado' ||
      location.pathname.startsWith('/listado/') ||
      location.pathname === '/alarmas' ||
      location.pathname === '/incidentes-correo' ||
      location.pathname === '/ayuda' ||
      location.pathname === '/perfil';
    if (!permitido) {
      navigate('/', { replace: true });
    }
  }, [user, menuMonitoreo, location.pathname, navigate]);

  useEffect(() => {
    if (!user) return;
    if (userCanAccessAudit(user)) return;
    if (
      location.pathname === '/auditoria' ||
      location.pathname === '/control-auditoria' ||
      location.pathname === '/analisis-senal'
    ) {
      navigate('/', { replace: true });
    }
  }, [user, location.pathname, navigate]);

  useEffect(() => {
    if (!user) return;
    if (userCanManageUsers(user)) return;
    if (location.pathname === '/configuracion-correo') {
      navigate('/', { replace: true });
    }
  }, [user, location.pathname, navigate]);

  /** Admin: sin Monitoreo, Config. alarmas ni Ubícanos (solo superadmin). */
  useEffect(() => {
    if (!user || !userIsAdmin(user) || userIsSuperAdmin(user)) return;
    const blocked =
      location.pathname === '/monitoreo' ||
      location.pathname === '/configuracion-alarmas' ||
      location.pathname === '/ubicanos';
    if (blocked) {
      navigate('/', { replace: true });
    }
  }, [user, location.pathname, navigate]);

  const menuItems = useMemo(() => {
    if (menuMonitoreo) {
      return [
        { path: '/', label: t('nav.home'), icon: Home },
        { path: '/listado', label: t('nav.listado'), icon: List },
        { path: '/alarmas', label: t('nav.alarmas'), icon: Bell },
        { path: '/incidentes-correo', label: t('nav.incidentesCorreo'), icon: Inbox },
        { path: '/ayuda', label: t('nav.ayuda'), icon: HelpCircle },
      ];
    }

    const canManage = userCanManageUsers(user);
    const canAudit = userCanAccessAudit(user);
    const isAdminOnly = userIsAdmin(user) && !userIsSuperAdmin(user);
    const incidentesItem = verIncidentesCorreo
      ? [{ path: '/incidentes-correo' as const, label: t('nav.incidentesCorreo'), icon: Inbox }]
      : [];

    return [
      { path: '/', label: t('nav.home'), icon: Home },
      { path: '/listado', label: t('nav.listado'), icon: List },
      ...(canManage
        ? [{ path: '/administracion' as const, label: t('nav.administracion'), icon: Settings }]
        : []),
      ...(canManage
        ? [{ path: '/usuarios' as const, label: t('nav.usuarios'), icon: Shield }]
        : []),
      ...(userIsSuperAdmin(user)
        ? [{ path: '/empresas' as const, label: t('nav.empresas'), icon: Building2 }]
        : []),
      ...(!isAdminOnly
        ? [{ path: '/monitoreo' as const, label: t('nav.monitoreo'), icon: Monitor }]
        : []),
      ...(canAudit
        ? [
            { path: '/control-auditoria' as const, label: t('nav.controlAuditoria'), icon: History },
            { path: '/auditoria' as const, label: t('nav.auditoriaUsuarios'), icon: History },
            { path: '/analisis-senal' as const, label: t('nav.analisisSenal'), icon: RadioTower },
          ]
        : []),
      { path: '/alarmas', label: t('nav.alarmas'), icon: Bell },
      { path: '/catalogo-alarmas', label: t('nav.catalogoAlarmas'), icon: BookOpen },
      ...(!isAdminOnly
        ? [
            {
              path: '/configuracion-alarmas' as const,
              label: t('nav.configAlarmas'),
              icon: BellPlus,
            },
          ]
        : []),
      ...(canManage
        ? [
            {
              path: '/configuracion-correo' as const,
              label: t('nav.correo'),
              icon: Mail,
            },
          ]
        : []),
      ...incidentesItem,
      ...(!isAdminOnly
        ? [{ path: '/ubicanos' as const, label: t('nav.ubicanos'), icon: MapPin }]
        : []),
      { path: '/ayuda', label: t('nav.ayuda'), icon: HelpCircle },
    ];
  }, [menuMonitoreo, user, verIncidentesCorreo, t, locale]);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside
        className={cn(
          'relative z-50 bg-card border-r border-border transition-[width] duration-300 ease-in-out flex flex-col shrink-0',
          sidebarExpanded ? 'w-64' : 'w-16'
        )}
      >
        <div
          className={cn(
            'border-b border-border flex items-center justify-center',
            sidebarExpanded ? 'h-20 px-4' : 'h-16 px-2'
          )}
        >
          <Link
            to="/"
            className="flex w-full items-center justify-center"
            title="ZTRACK"
          >
            <img
              src={`${import.meta.env.BASE_URL}logo-ztrack.png`}
              alt="ZTRACK"
              className={cn(
                'object-contain transition-all duration-300',
                sidebarExpanded ? 'h-14 w-auto max-w-[200px]' : 'h-9 w-9'
              )}
            />
          </Link>
        </div>

        {/* Flecha siempre visible en el borde para expandir / contraer y ver etiquetas */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarExpanded ? t('layout.collapseMenu') : t('layout.expandMenu')}
          title={sidebarExpanded ? t('layout.collapseMenu') : t('layout.expandMenuHint')}
          className={cn(
            'absolute top-20 z-20 flex h-7 w-7 items-center justify-center rounded-full',
            'border border-border bg-card text-foreground shadow-sm',
            'hover:bg-muted hover:text-primary transition-colors',
            'right-0 translate-x-1/2'
          )}
        >
          {sidebarExpanded ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname === item.path ||
                  location.pathname.startsWith(`${item.path}/`);

            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                className={cn(
                  'flex items-center transition-colors mx-2 my-0.5 rounded-md whitespace-nowrap',
                  sidebarExpanded ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground/80 hover:bg-muted'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span
                  className={cn(
                    'text-sm font-medium truncate transition-opacity duration-200',
                    sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={toggleSidebar}
            title={sidebarExpanded ? t('layout.collapseMenu') : t('layout.expandMenu')}
            className={cn(
              'w-full flex items-center rounded-md py-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
              sidebarExpanded ? 'justify-between px-3 gap-2' : 'justify-center'
            )}
          >
            {sidebarExpanded && (
              <span className="text-xs font-medium">{t('layout.collapse')}</span>
            )}
            {sidebarExpanded ? (
              <ChevronLeft className="h-5 w-5 shrink-0" />
            ) : (
              <ChevronRight className="h-5 w-5 shrink-0" />
            )}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-card border-b border-border flex items-center justify-between gap-4 px-4 sm:px-6">
          <div className="min-w-0 flex items-center gap-2">
            <button
              type="button"
              className="p-2 rounded-md hover:bg-muted shrink-0"
              onClick={toggleSidebar}
              title={sidebarExpanded ? t('layout.collapseMenu') : t('layout.expandMenu')}
            >
              {sidebarExpanded ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <h2 className="text-lg font-semibold truncate">
              {t('layout.platformTitle')}
            </h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="text-sm text-muted-foreground hidden lg:block capitalize">
              {new Date().toLocaleDateString(intlLocale, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>

            <LanguageSwitcher compact className="hidden sm:flex" />

            {themeReady && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                title={theme === 'dark' ? t('layout.lightMode') : t('layout.darkMode')}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            )}

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 hover:bg-muted transition-colors text-left"
                  >
                    <Avatar className="size-9">
                      {user.avatarUrl ? (
                        <AvatarImage src={user.avatarUrl} alt="" />
                      ) : null}
                      <AvatarFallback className="bg-blue-600 text-white text-xs">
                        {userInitials(user)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden sm:block leading-tight min-w-0 max-w-[140px]">
                      <div className="text-sm font-medium truncate">{displayName}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {userTypeLabel(user, t)}
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        @{user.username} · {userTypeLabel(user, t)}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/perfil')}>
                    <UserCircle className="h-4 w-4" />
                    {t('layout.viewProfile')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  >
                    {theme === 'dark' ? (
                      <Sun className="h-4 w-4" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                    {theme === 'dark' ? t('layout.lightMode') : t('layout.darkMode')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 sm:hidden">
                    <LanguageSwitcher />
                  </div>
                  <DropdownMenuSeparator className="sm:hidden" />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={(e) => {
                      e.preventDefault();
                      handleLogout();
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    {t('layout.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-background">
          {userHasNoFleetAccess(user) &&
          pathRequiresFleet(location.pathname) &&
          !userCanManageUsers(user) ? (
            <SinEquiposAsignados />
          ) : userHasNoFleetAccess(user) &&
            pathRequiresFleet(location.pathname) &&
            userCanManageUsers(user) ? (
            <div className="space-y-4">
              <SinEquiposAsignados />
              <p className="text-center text-sm text-muted-foreground">
                {locale === 'en' ? (
                  <>
                    As an administrator you can go to{' '}
                    <Link to="/administracion" className="underline font-medium">
                      {t('nav.administracion')}
                    </Link>{' '}
                    once the superadmin assigns your fleet, or manage users from{' '}
                    <Link to="/usuarios" className="underline font-medium">
                      {t('nav.usuarios')}
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    Como administrador puede ir a{' '}
                    <Link to="/administracion" className="underline font-medium">
                      {t('nav.administracion')}
                    </Link>{' '}
                    cuando el superadmin le asigne flota, o gestionar usuarios desde{' '}
                    <Link to="/usuarios" className="underline font-medium">
                      {t('nav.usuarios')}
                    </Link>
                    .
                  </>
                )}
              </p>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
