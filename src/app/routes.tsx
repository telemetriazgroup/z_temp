import { createBrowserRouter, Navigate } from "react-router";
import Layout from "./Layout";
import Login from "./pages/Login";
import Inicio from "./pages/Inicio";
import Listado from "./pages/Listado";
import EquipoDetalle from "./pages/EquipoDetalle";
import Administracion from "./pages/Administracion";
import Usuarios from "./pages/Usuarios";
import Monitoreo from "./pages/Monitoreo";
import Alarmas from "./pages/Alarmas";
import ConfiguracionAlarmas from "./pages/ConfiguracionAlarmas";
import Ubicanos from "./pages/Ubicanos";
import AyudaSoporte from "./pages/AyudaSoporte";

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = localStorage.getItem('ztrack_user') !== null;
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

const routeTree = [
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Inicio />,
      },
      {
        path: "listado",
        element: <Listado />,
      },
      {
        path: "listado/detalle",
        element: <EquipoDetalle />,
      },
      {
        path: "administracion",
        element: <Administracion />,
      },
      {
        path: "usuarios",
        element: <Usuarios />,
      },
      {
        path: "monitoreo",
        element: <Monitoreo />,
      },
      {
        path: "alarmas",
        element: <Alarmas />,
      },
      {
        path: "configuracion-alarmas",
        element: <ConfiguracionAlarmas />,
      },
      {
        path: "ubicanos",
        element: <Ubicanos />,
      },
      {
        path: "ayuda",
        element: <AyudaSoporte />,
      },
    ],
  },
];

const appBasename = import.meta.env.BASE_URL.replace(/\/$/, '');
const routerOptions =
  appBasename !== '' && appBasename !== '/'
    ? { basename: appBasename }
    : {};

export const router = createBrowserRouter(routeTree, routerOptions);
