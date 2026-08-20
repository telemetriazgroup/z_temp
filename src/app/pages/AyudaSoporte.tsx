import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../AuthContext';
import { userIsSuperAdmin, resolveUserCategory } from '../modules/usuario';
import {
  fetchAyudaSoporte,
  saveAyudaSoporte,
  defaultAyudaSoporteContent,
  newAyudaId,
  LUPAMAPE_LINKEDIN,
  resolveManualRole,
  type AyudaSoporteContent,
  type AyudaLinkItem,
  type AyudaFaqItem,
} from '../modules/ayuda';
import { ManualUsuarioPanel } from '../components/ManualUsuarioPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Mail,
  Phone,
  MessageCircle,
  FileText,
  Video,
  HelpCircle,
  Pencil,
  Save,
  X,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  Info,
} from 'lucide-react';
import { useT } from '../i18n';

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function mailHref(email: string): string {
  return `mailto:${email.trim()}`;
}

function waHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

function openUrl(url: string) {
  const u = url.trim();
  if (!u) {
    toast.message('Este recurso aún no tiene enlace configurado');
    return;
  }
  window.open(u.startsWith('http') ? u : `https://${u}`, '_blank', 'noopener,noreferrer');
}

export default function AyudaSoporte() {
  const t = useT();
  const { user } = useAuth();
  const canEdit = userIsSuperAdmin(user);
  const manualRole = useMemo(
    () =>
      resolveManualRole({
        superUser: user?.superUser,
        category: resolveUserCategory(user),
      }),
    [user]
  );
  const [content, setContent] = useState<AyudaSoporteContent>(defaultAyudaSoporteContent);
  const [draft, setDraft] = useState<AyudaSoporteContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const editing = draft != null;
  const view = draft ?? content;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAyudaSoporte();
      setContent(data);
      setDraft(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar ayuda');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = () => {
    setDraft(structuredClone(content));
  };

  const cancelEdit = () => {
    setDraft(null);
  };

  const handleSave = async () => {
    if (draft == null || !user?.username) return;
    setSaving(true);
    try {
      const saved = await saveAyudaSoporte(draft, user.username);
      setContent(saved);
      setDraft(null);
      toast.success('Ayuda y Soporte actualizado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const updateContacto = (patch: Partial<AyudaSoporteContent['contacto']>) => {
    if (!draft) return;
    setDraft({ ...draft, contacto: { ...draft.contacto, ...patch } });
  };

  const updateSistema = (patch: Partial<AyudaSoporteContent['sistema']>) => {
    if (!draft) return;
    setDraft({ ...draft, sistema: { ...draft.sistema, ...patch } });
  };

  const updateLink = (
    key: 'documentacion' | 'videos',
    id: string,
    patch: Partial<AyudaLinkItem>
  ) => {
    if (!draft) return;
    setDraft({
      ...draft,
      [key]: draft[key].map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  };

  const addLink = (key: 'documentacion' | 'videos') => {
    if (!draft) return;
    const item: AyudaLinkItem = {
      id: newAyudaId(key === 'documentacion' ? 'doc' : 'vid'),
      titulo: key === 'documentacion' ? 'Nuevo documento' : 'Nuevo video',
      url: '',
    };
    setDraft({ ...draft, [key]: [...draft[key], item] });
  };

  const removeLink = (key: 'documentacion' | 'videos', id: string) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: draft[key].filter((item) => item.id !== id) });
  };

  const updateFaq = (id: string, patch: Partial<AyudaFaqItem>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      faqs: draft.faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  };

  const addFaq = () => {
    if (!draft) return;
    setDraft({
      ...draft,
      faqs: [
        ...draft.faqs,
        {
          id: newAyudaId('faq'),
          pregunta: 'Nueva pregunta',
          respuesta: '',
        },
      ],
    });
  };

  const removeFaq = (id: string) => {
    if (!draft) return;
    setDraft({ ...draft, faqs: draft.faqs.filter((f) => f.id !== id) });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Cargando ayuda…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('ayuda.title')}</h1>
          <p className="text-muted-foreground mt-1">
            Centro de ayuda, manual por tipo de usuario, contacto y recursos
          </p>
          {content.updatedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Última edición:{' '}
              {new Date(content.updatedAt).toLocaleString('es-PE')}
              {content.updatedBy ? ` · ${content.updatedBy}` : ''}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {!editing ? (
              <Button onClick={startEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar contenido
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
                <Button onClick={() => void handleSave()} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {editing && (
        <Badge variant="secondary" className="text-xs">
          Modo edición (solo superadmin)
        </Badge>
      )}

      <ManualUsuarioPanel
        userRole={manualRole}
        canBrowseAllRoles={canEdit}
      />

      {/* Contacto */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-5 w-5 text-blue-600" />
              Teléfono
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Etiqueta</Label>
                  <Input
                    value={view.contacto.telefonoLabel}
                    onChange={(e) => updateContacto({ telefonoLabel: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Número</Label>
                  <Input
                    value={view.contacto.telefono}
                    onChange={(e) => updateContacto({ telefono: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{view.contacto.telefonoLabel}</p>
                <p className="font-medium">{view.contacto.telefono}</p>
                <Button className="w-full" variant="outline" asChild>
                  <a href={telHref(view.contacto.telefono)}>Llamar ahora</a>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-5 w-5 text-blue-600" />
              Email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Etiqueta</Label>
                  <Input
                    value={view.contacto.emailLabel}
                    onChange={(e) => updateContacto({ emailLabel: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Correo</Label>
                  <Input
                    type="email"
                    value={view.contacto.email}
                    onChange={(e) => updateContacto({ email: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{view.contacto.emailLabel}</p>
                <p className="font-medium break-all">{view.contacto.email}</p>
                <Button className="w-full" variant="outline" asChild>
                  <a href={mailHref(view.contacto.email)}>Enviar email</a>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-5 w-5 text-emerald-600" />
              WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Etiqueta</Label>
                  <Input
                    value={view.contacto.whatsappLabel}
                    onChange={(e) => updateContacto({ whatsappLabel: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Número (con código país)</Label>
                  <Input
                    value={view.contacto.whatsapp}
                    onChange={(e) => updateContacto({ whatsapp: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{view.contacto.whatsappLabel}</p>
                <p className="font-medium">{view.contacto.whatsapp}</p>
                <Button className="w-full" variant="outline" asChild>
                  <a
                    href={waHref(view.contacto.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir chat
                  </a>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Docs + Videos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5" />
                Documentación
              </CardTitle>
              <CardDescription>Manuales y guías de usuario</CardDescription>
            </div>
            {editing && (
              <Button type="button" size="sm" variant="outline" onClick={() => addLink('documentacion')}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {view.documentacion.map((item) =>
              editing ? (
                <div key={item.id} className="rounded-md border p-3 space-y-2">
                  <Input
                    value={item.titulo}
                    onChange={(e) =>
                      updateLink('documentacion', item.id, { titulo: e.target.value })
                    }
                    placeholder="Título"
                  />
                  <Input
                    value={item.url}
                    onChange={(e) =>
                      updateLink('documentacion', item.id, { url: e.target.value })
                    }
                    placeholder="https://…"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => removeLink('documentacion', item.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Quitar
                  </Button>
                </div>
              ) : (
                <Button
                  key={item.id}
                  variant="ghost"
                  className="w-full justify-between"
                  onClick={() => openUrl(item.url)}
                >
                  <span className="truncate text-left">→ {item.titulo}</span>
                  {item.url ? <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" /> : null}
                </Button>
              )
            )}
            {view.documentacion.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin documentos publicados</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Video className="h-5 w-5" />
                Videos tutoriales
              </CardTitle>
              <CardDescription>Aprende paso a paso</CardDescription>
            </div>
            {editing && (
              <Button type="button" size="sm" variant="outline" onClick={() => addLink('videos')}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {view.videos.map((item) =>
              editing ? (
                <div key={item.id} className="rounded-md border p-3 space-y-2">
                  <Input
                    value={item.titulo}
                    onChange={(e) => updateLink('videos', item.id, { titulo: e.target.value })}
                    placeholder="Título"
                  />
                  <Input
                    value={item.url}
                    onChange={(e) => updateLink('videos', item.id, { url: e.target.value })}
                    placeholder="https://youtube.com/…"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => removeLink('videos', item.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Quitar
                  </Button>
                </div>
              ) : (
                <Button
                  key={item.id}
                  variant="ghost"
                  className="w-full justify-between"
                  onClick={() => openUrl(item.url)}
                >
                  <span className="truncate text-left">→ {item.titulo}</span>
                  {item.url ? <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" /> : null}
                </Button>
              )
            )}
            {view.videos.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin videos publicados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="h-5 w-5" />
              Preguntas frecuentes
            </CardTitle>
            <CardDescription>Respuestas a las dudas más comunes</CardDescription>
          </div>
          {editing && (
            <Button type="button" size="sm" variant="outline" onClick={addFaq}>
              <Plus className="h-4 w-4 mr-1" />
              FAQ
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-4">
              {view.faqs.map((faq) => (
                <div key={faq.id} className="rounded-md border p-3 space-y-2">
                  <Input
                    value={faq.pregunta}
                    onChange={(e) => updateFaq(faq.id, { pregunta: e.target.value })}
                    placeholder="Pregunta"
                  />
                  <Textarea
                    rows={3}
                    value={faq.respuesta}
                    onChange={(e) => updateFaq(faq.id, { respuesta: e.target.value })}
                    placeholder="Respuesta"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => removeFaq(faq.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {view.faqs.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger>{faq.pregunta}</AccordionTrigger>
                  <AccordionContent className="whitespace-pre-wrap text-muted-foreground">
                    {faq.respuesta}
                  </AccordionContent>
                </AccordionItem>
              ))}
              {view.faqs.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">Sin preguntas publicadas</p>
              )}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Sistema */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-5 w-5" />
            Información del sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Versión</Label>
                <Input
                  value={view.sistema.version}
                  onChange={(e) => updateSistema({ version: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Última actualización</Label>
                <Input
                  value={view.sistema.ultimaActualizacion}
                  onChange={(e) => updateSistema({ ultimaActualizacion: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Servidor</Label>
                <Input
                  value={view.sistema.servidor}
                  onChange={(e) => updateSistema({ servidor: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tiempo de actividad</Label>
                <Input
                  value={view.sistema.tiempoActividad}
                  onChange={(e) => updateSistema({ tiempoActividad: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Notas</Label>
                <Textarea
                  rows={2}
                  value={view.sistema.notas ?? ''}
                  onChange={(e) => updateSistema({ notas: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Versión:</span>
                <span className="ml-2 font-medium">{view.sistema.version}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Última actualización:</span>
                <span className="ml-2 font-medium">{view.sistema.ultimaActualizacion}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Servidor:</span>
                <span className="ml-2 font-medium">{view.sistema.servidor}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tiempo de actividad:</span>
                <span className="ml-2 font-medium">{view.sistema.tiempoActividad}</span>
              </div>
              {view.sistema.notas?.trim() && (
                <div className="col-span-2 text-muted-foreground">{view.sistema.notas}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Crédito */}
      <div className="border-t pt-6 pb-2 text-center text-sm text-muted-foreground">
        Desarrollado por{' '}
        <a
          href={LUPAMAPE_LINKEDIN}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Lupamape
        </a>
      </div>
    </div>
  );
}
