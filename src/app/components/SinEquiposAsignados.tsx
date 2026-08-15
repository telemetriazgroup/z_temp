import React from 'react';
import { Link } from 'react-router';
import { AlertCircle, HelpCircle, Shield } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useT } from '../i18n';

/** Pantalla cuando la cuenta aún no tiene equipos ni grupos asignados. */
export function SinEquiposAsignados() {
  const t = useT();
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-lg w-full border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            {t('emptyFleet.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            {t('emptyFleet.body')}
          </p>
          <p className="font-medium">{t('emptyFleet.askAdmin')}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/ayuda">
                <HelpCircle className="h-4 w-4 mr-2" />
                {t('emptyFleet.help')}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/perfil">
                <Shield className="h-4 w-4 mr-2" />
                {t('emptyFleet.profile')}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Rutas que requieren flota asignada. El resto (ayuda, perfil, admin…) sigue disponible. */
export function pathRequiresFleet(pathname: string): boolean {
  if (pathname === '/') return true;
  if (pathname === '/listado' || pathname.startsWith('/listado/')) return true;
  if (pathname === '/monitoreo') return true;
  if (pathname === '/alarmas') return true;
  if (pathname === '/configuracion-alarmas') return true;
  if (pathname === '/ubicanos') return true;
  if (pathname === '/incidentes-correo') return true;
  if (pathname === '/configuracion-correo') return true;
  return false;
}
