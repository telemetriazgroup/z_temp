import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router';
import Layout from './Layout';
import { useAuth } from './AuthContext';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import Listado from './pages/Listado';
import Monitoreo from './pages/Monitoreo';
import Alarmas from './pages/Alarmas';
import ConfiguracionAlarmas from './pages/ConfiguracionAlarmas';
import Ubicanos from './pages/Ubicanos';
import AyudaSoporte from './pages/AyudaSoporte';
import Usuarios from './pages/Usuarios';
import MiPerfil from './pages/MiPerfil';

function RequireAuth() {
  const { user } = useAuth();
  const loc = useLocation();
  if (user == null) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <Outlet />;
}

function UsuariosGate() {
  const { user } = useAuth();
  if (user?.superUser !== true) {
    return <Navigate to="/inicio" replace />;
  }
  return <Usuarios />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Navigate to="/inicio" replace /> },
          { path: 'inicio', element: <Inicio /> },
          { path: 'listado', element: <Listado /> },
          { path: 'monitoreo', element: <Monitoreo /> },
          { path: 'alarmas', element: <Alarmas /> },
          { path: 'configuracion-alarmas', element: <ConfiguracionAlarmas /> },
          { path: 'ubicanos', element: <Ubicanos /> },
          { path: 'ayuda-soporte', element: <AyudaSoporte /> },
          { path: 'mi-cuenta', element: <MiPerfil /> },
          { path: 'usuarios', element: <UsuariosGate /> },
        ],
      },
    ],
  },
]);
