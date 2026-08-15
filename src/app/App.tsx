import { RouterProvider } from 'react-router';
import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { LocaleProvider } from './i18n';
import { DispositivosFleetProvider } from './DispositivosFleetContext';
import { router } from './routes';
import { Toaster } from './components/ui/sonner';
import { WhatsAppFloatingButton } from './components/WhatsAppFloatingButton';

export default function App() {
  return (
    <LocaleProvider>
      <ThemeProvider>
        <AuthProvider>
          <DispositivosFleetProvider>
            <RouterProvider router={router} />
            <WhatsAppFloatingButton />
            <Toaster richColors position="top-right" />
          </DispositivosFleetProvider>
        </AuthProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
