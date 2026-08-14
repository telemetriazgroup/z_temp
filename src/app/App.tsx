import { RouterProvider } from 'react-router';
import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { DispositivosFleetProvider } from './DispositivosFleetContext';
import { router } from './routes';
import { Toaster } from './components/ui/sonner';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DispositivosFleetProvider>
          <RouterProvider router={router} />
          <Toaster richColors position="top-right" />
        </DispositivosFleetProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
