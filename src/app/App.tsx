import { RouterProvider } from 'react-router';
import { AuthProvider } from './AuthContext';
import { router } from './routes';
import { Toaster } from './components/ui/sonner';
import { CorreoAlertRunner } from './modules/correo';

export default function App() {
  return (
    <AuthProvider>
      <CorreoAlertRunner />
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}
