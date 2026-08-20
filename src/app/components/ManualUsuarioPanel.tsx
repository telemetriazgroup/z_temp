import React from 'react';
import {
  MANUAL_POR_ROL,
  MANUAL_ROLES_ORDER,
  type ManualRole,
  type ManualSection,
} from '../modules/ayuda/manualPorRol';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { BookOpen, Lightbulb, ListOrdered } from 'lucide-react';

function SectionBody({ section }: { section: ManualSection }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">{section.summary}</p>
      <div>
        <p className="font-medium flex items-center gap-1.5 mb-1.5">
          <ListOrdered className="h-3.5 w-3.5" />
          Cómo hacerlo
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
          {section.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
      {section.example && (
        <div className="rounded-md border bg-muted/40 px-3 py-2">
          <p className="font-medium text-xs mb-1">Ejemplo</p>
          <p className="text-muted-foreground text-xs leading-relaxed">{section.example}</p>
        </div>
      )}
      {section.tips && section.tips.length > 0 && (
        <div>
          <p className="font-medium flex items-center gap-1.5 mb-1.5 text-xs">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
            Consejos
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
            {section.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type Props = {
  /** Rol del usuario autenticado (guía por defecto). */
  userRole: ManualRole;
  /** Si true, permite ver las tres guías (superadmin). */
  canBrowseAllRoles?: boolean;
};

export function ManualUsuarioPanel({ userRole, canBrowseAllRoles = false }: Props) {
  const roles = canBrowseAllRoles ? MANUAL_ROLES_ORDER : [userRole];
  const defaultTab = userRole;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-5 w-5 text-sky-600" />
          Manual por tipo de usuario
        </CardTitle>
        <CardDescription>
          Guía didáctica de cada módulo y la dinámica Listado → telemetría. Contenido
          alineado con <code className="text-[11px]">Ayuda_usuario.md</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab} key={defaultTab}>
          {roles.length > 1 && (
            <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
              {roles.map((r) => (
                <TabsTrigger key={r} value={r} className="text-xs">
                  {MANUAL_POR_ROL[r].label}
                </TabsTrigger>
              ))}
            </TabsList>
          )}
          {roles.map((r) => {
            const guide = MANUAL_POR_ROL[r];
            return (
              <TabsContent key={r} value={r} className="space-y-4 mt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={r === userRole ? 'default' : 'secondary'}>
                    {guide.label}
                  </Badge>
                  {r === userRole && (
                    <span className="text-xs text-muted-foreground">Su perfil actual</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{guide.intro}</p>
                <Accordion type="multiple" defaultValue={[guide.sections[0]?.id].filter(Boolean)}>
                  {guide.sections.map((section) => (
                    <AccordionItem key={section.id} value={section.id}>
                      <AccordionTrigger className="text-left text-sm font-medium">
                        {section.title}
                      </AccordionTrigger>
                      <AccordionContent>
                        <SectionBody section={section} />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
