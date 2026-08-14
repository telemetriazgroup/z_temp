import React from 'react';
import type { AlarmCatalogEntry } from '../modules/alarma';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';

interface AlarmCatalogDetailPanelProps {
  catalog: AlarmCatalogEntry | null;
  alarmCode?: number | null;
  compact?: boolean;
  /** Si true (admin/superadmin), muestra ficha técnica completa. */
  showTechnical?: boolean;
}

export function AlarmCatalogDetailPanel({
  catalog,
  alarmCode,
  compact = false,
  showTechnical = false,
}: AlarmCatalogDetailPanelProps) {
  if (catalog == null) {
    if (alarmCode == null) return null;
    return (
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="pt-4 text-sm text-amber-900">
          Alarma activa con código <strong>{alarmCode}</strong>, sin entrada en el catálogo.
        </CardContent>
      </Card>
    );
  }

  const mensaje =
    catalog.mensajeUsuario?.trim() || catalog.titleEs || `Alarma código ${catalog.code}`;

  if (!showTechnical) {
    if (compact) {
      return (
        <div className="text-sm space-y-1">
          <div className="font-medium">{mensaje}</div>
          <div className="text-muted-foreground">Código {catalog.code}</div>
        </div>
      );
    }
    return (
      <Card className="border-red-200">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{mensaje}</CardTitle>
            <Badge variant="destructive">Código {catalog.code}</Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Mensaje para el operador. El detalle técnico solo está disponible para
          administradores.
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="text-sm space-y-1">
        <div className="font-medium">{catalog.titleEs}</div>
        <div className="text-xs text-muted-foreground">Usuario: {mensaje}</div>
        <div className="text-muted-foreground">
          Código {catalog.code} · {catalog.model}
        </div>
      </div>
    );
  }

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{catalog.titleEs}</CardTitle>
          <Badge variant="destructive">Código {catalog.code}</Badge>
          <Badge variant="outline">{catalog.model}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{catalog.titleEn}</p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section>
          <h4 className="font-semibold mb-1">Mensaje al usuario</h4>
          <p className="whitespace-pre-wrap text-muted-foreground">{mensaje}</p>
        </section>
        <section>
          <h4 className="font-semibold mb-1">Descripción</h4>
          <p className="whitespace-pre-wrap text-muted-foreground">{catalog.descriptionEs}</p>
        </section>
        <section>
          <h4 className="font-semibold mb-1">Acción correctiva</h4>
          <p className="whitespace-pre-wrap text-muted-foreground">
            {catalog.correctiveActionEs}
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
