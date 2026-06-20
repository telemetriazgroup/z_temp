import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import { userIsIffRestrictedNavigation } from './modules/usuario';
import { fetchServerGrupos, syncDeviceNamesToServer } from './modules/correo/correoServerApi';
import { userHasCorreoIncidentAccess } from './modules/correo/incidentAccess';
import { Button } from './components/ui/button';
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
} from 'lucide-react';
import type { GrupoCorreo } from './modules/correo/types';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [gruposCorreo, setGruposCorreo] = useState<GrupoCorreo[]>([]);
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const soloListadoIff = userIsIffRestrictedNavigation(user);
  const verIncidentesCorreo = userHasCorreoIncidentAccess(user, gruposCorreo);

  useEffect(() => {
    if (user == null) return;
    fetchServerGrupos()
      .then(setGruposCorreo)
      .catch(() => setGruposCorreo([]));
    if (user.deviceNames && Object.keys(user.deviceNames).length > 0) {
      void syncDeviceNamesToServer(user.deviceNames).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!user || !soloListadoIff) return;
    const permitido =
      location.pathname === '/listado' ||
      location.pathname.startsWith('/listado/') ||
      location.pathname === '/alarmas' ||
      location.pathname === '/catalogo-alarmas' ||
      location.pathname === '/control-auditoria' ||
      location.pathname === '/incidentes-correo';
    if (!permitido) {
      navigate('/listado', { replace: true });
    }
  }, [user, soloListadoIff, location.pathname, navigate]);

  const menuItems = useMemo(() => {
    const incidentesItem = verIncidentesCorreo
      ? [{ path: '/incidentes-correo' as const, label: 'Incidentes correo', icon: Inbox }]
      : [];

    if (soloListadoIff) {
      return [
        { path: '/listado', label: 'Listado', icon: List },
        { path: '/control-auditoria', label: 'Control / Auditoría', icon: History },
        { path: '/alarmas', label: 'Alarmas', icon: Bell },
        { path: '/catalogo-alarmas', label: 'Catálogo Alarmas', icon: BookOpen },
        ...incidentesItem,
      ];
    }

    return [
      { path: '/', label: 'Inicio', icon: Home },
      { path: '/listado', label: 'Listado', icon: List },
      { path: '/administracion', label: 'Administración', icon: Settings },
      ...(user?.superUser === true
        ? [{ path: '/usuarios' as const, label: 'Usuarios', icon: Shield }]
        : []),
      { path: '/monitoreo', label: 'Monitoreo', icon: Monitor },
      { path: '/control-auditoria', label: 'Control / Auditoría', icon: History },
      { path: '/alarmas', label: 'Alarmas', icon: Bell },
      { path: '/catalogo-alarmas', label: 'Catálogo Alarmas', icon: BookOpen },
      {
        path: '/configuracion-alarmas',
        label: 'Configuración Alarmas',
        icon: BellPlus,
      },
      {
        path: '/configuracion-correo',
        label: 'Correo',
        icon: Mail,
      },
      ...incidentesItem,
      { path: '/ubicanos', label: 'Ubícanos', icon: MapPin },
      { path: '/ayuda', label: 'Ayuda/Soporte', icon: HelpCircle },
    ];
  }, [soloListadoIff, user?.superUser, verIncidentesCorreo]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside 
        className={`bg-white border-r transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-0 md:w-16'
        } flex flex-col`}
      >
        {/* Header */}
        <div className="h-16 border-b flex items-center justify-between px-4">
          {sidebarOpen && (
            <div className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-xl">
              ZTRACK
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                  isActive 
                    ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' 
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarOpen && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="border-t p-4">
          {sidebarOpen ? (
            <div className="space-y-2">
              <div className="text-sm">
                <div className="font-medium">{user?.username}</div>
                <div className="text-xs text-gray-500">
              {user?.superUser === true ? 'Superusuario' : user?.role}
            </div>
              </div>
              <Button 
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar Sesión
              </Button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-gray-100 rounded-lg w-full flex justify-center"
            >
              <LogOut className="h-5 w-5" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b flex items-center justify-between px-6">
          <div>
            <h2 className="text-lg font-semibold">
              Plataforma de Monitoreo de Temperaturas
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">
              {new Date().toLocaleDateString('es-ES', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}