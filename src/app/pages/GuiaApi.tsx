import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

interface SeccionGuia {
  titulo: string;
  parrafos: string[];
  codigo?: string;
}

export function GuiaApi({ base }: { base: string }) {
  const [secciones, setSecciones] = useState<SeccionGuia[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${base}/guia`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || body.ok === false) throw new Error(body.error || 'No se pudo leer la guía');
        setSecciones(body.secciones || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo leer la guía'));
  }, [base]);

  async function descargar() {
    const res = await fetch(`${base}/guia?formato=texto`);
    const texto = await res.text();
    const blob = new Blob([texto], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guia-api-ztrack.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Guía de uso de la API</CardTitle>
        <Button type="button" variant="outline" onClick={descargar}>
          Descargar guía
        </Button>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <p className="text-muted-foreground">
          Entregue esta guía junto con la clave. El programa del cliente usa la base{' '}
          <code className="text-xs">{base}</code> y no llama a las fuentes de telemetría.
        </p>
        {error && <p className="text-red-600">{error}</p>}
        {secciones.map((seccion) => (
          <section key={seccion.titulo} className="space-y-2">
            <h2 className="text-base font-semibold">{seccion.titulo}</h2>
            {seccion.parrafos.map((parrafo) => (
              <p key={parrafo}>{parrafo}</p>
            ))}
            {seccion.codigo && (
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-5 whitespace-pre-wrap">
                {seccion.codigo}
              </pre>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
