import { createBrowserRouter, Navigate } from "react-router";
import { useAuth } from "./AuthContext";
import Layout from "./Layout";
import Login from "./pages/Login";
import Inicio from "./pages/Inicio";
import Listado from "./pages/Listado";
import EquipoDetalle from "./pages/EquipoDetalle";
import Administracion from "./pages/Administracion";
import Usuarios from "./pages/Usuarios";
import Monitoreo from "./pages/Monitoreo";
import Alarmas from "./pages/Alarmas";
import CatalogoAlarmas from "./pages/CatalogoAlarmas";
import ControlAuditoria from "./pages/ControlAuditoria";
import ConfiguracionAlarmas from "./pages/ConfiguracionAlarmas";
import ConfiguracionCorreo from "./pages/ConfiguracionCorreo";
import IncidentesCorreo from "./pages/IncidentesCorreo";
import Ubicanos from "./pages/Ubicanos";
import AyudaSoporte from "./pages/AyudaSoporte";
import Perfil from "./pages/Perfil";
import Empresas from "./pages/Empresas";
import AuditoriaUsuarios from "./pages/AuditoriaUsuarios";
import AnalisisSenal from "./pages/AnalisisSenal";
import {
  appBasenameNoSlash,
  ensureBasenameTrailingSlash,
} from "./lib/basenameUrl";

/** Protege rutas: al cerrar sesión (user=null) redirige a /login. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();

  if (!authReady) {
    const hasStored = localStorage.getItem("ztrack_user") !== null;
    if (!hasStored) {
      return <Navigate to="/login" replace />;
    }
    return <>{children}</>;
  }

  if (user == null) {
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
        path: "catalogo-alarmas",
        element: <CatalogoAlarmas />,
      },
      {
        path: "control-auditoria",
        element: <ControlAuditoria />,
      },
      {
        path: "configuracion-alarmas",
        element: <ConfiguracionAlarmas />,
      },
      {
        path: "configuracion-correo",
        element: <ConfiguracionCorreo />,
      },
      {
        path: "incidentes-correo",
        element: <IncidentesCorreo />,
      },
      {
        path: "ubicanos",
        element: <Ubicanos />,
      },
      {
        path: "ayuda",
        element: <AyudaSoporte />,
      },
      {
        path: "perfil",
        element: <Perfil />,
      },
      {
        path: "empresas",
        element: <Empresas />,
      },
      {
        path: "auditoria",
        element: <AuditoriaUsuarios />,
      },
      {
        path: "analisis-senal",
        element: <AnalisisSenal />,
      },
      {
        path: "analisis-senal/:imei",
        element: <AnalisisSenal />,
      },
    ],
  },
];

// Corregir `/reefer` → `/reefer/` antes de montar el router (F5 / enlace sin slash).
ensureBasenameTrailingSlash();

const appBasename = appBasenameNoSlash();
const routerOptions =
  appBasename !== '' && appBasename !== '/'
    ? { basename: appBasename }
    : {};

export const router = createBrowserRouter(routeTree, routerOptions);

// Tras cada navegación, RR puede dejar `/reefer` sin slash en la home.
router.subscribe(() => {
  ensureBasenameTrailingSlash();
});
