import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import {
  Bell,
  HelpCircle,
  LayoutDashboard,
  List,
  LogOut,
  MapPin,
  Settings2,
  Snowflake,
  UserCog,
  Users,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { Button } from './components/ui/button';
import { cn } from './components/ui/utils';
import { Toaster } from './components/ui/sonner';

const navCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
    isActive ? 'bg-slate-200 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-100'
  );

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-100">
          <div className="font-bold text-lg tracking-tight">ZTRACK</div>
          <p className="text-xs text-slate-500 mt-1 truncate" title={user?.correo}>
            {user?.nombre}
          </p>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
          <NavLink to="/inicio" className={navCls}>
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </NavLink>
          <NavLink to="/listado" className={navCls}>
            <List className="h-4 w-4" />
            Listado
          </NavLink>
          <NavLink to="/monitoreo" className={navCls}>
            <Snowflake className="h-4 w-4" />
            Monitoreo
          </NavLink>
          <NavLink to="/alarmas" className={navCls}>
            <Bell className="h-4 w-4" />
            Alarmas
          </NavLink>
          <NavLink to="/configuracion-alarmas" className={navCls}>
            <Settings2 className="h-4 w-4" />
            Config. alarmas
          </NavLink>
          <NavLink to="/ubicanos" className={navCls}>
            <MapPin className="h-4 w-4" />
            Ubícanos
          </NavLink>
          <NavLink to="/ayuda-soporte" className={navCls}>
            <HelpCircle className="h-4 w-4" />
            Ayuda
          </NavLink>
          <div className="my-2 border-t border-slate-100" />
          <NavLink to="/mi-cuenta" className={navCls}>
            <UserCog className="h-4 w-4" />
            Mi cuenta
          </NavLink>
          {user?.superUser === true && (
            <NavLink to="/usuarios" className={navCls}>
              <Users className="h-4 w-4" />
              Usuarios
            </NavLink>
          )}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6 overflow-auto">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
