import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../AuthContext';
import type { AlarmCatalogEntry } from '../modules/alarma';
import {
  getAlarmCatalogEntries,
  addAlarmCatalogEntry,
  updateAlarmCatalogEntry,
  deleteAlarmCatalogEntry,
  ensureAlarmCatalog,
} from '../modules/alarma';
import { userCanManageUsers } from '../modules/usuario';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { AlarmCatalogDetailPanel } from '../components/AlarmCatalogDetailPanel';
import { BookOpen, Plus, Pencil, Trash2, Search } from 'lucide-react';

const emptyForm = {
  code: '',
  model: 'MP4000',
  mensajeUsuario: '',
  titleEs: '',
  titleEn: '',
  descriptionEs: '',
  descriptionEn: '',
  correctiveActionEs: '',
  correctiveActionEn: '',
  archived: false,
};

function entryToForm(e: AlarmCatalogEntry) {
  return {
    code: String(e.code),
    model: e.model,
    mensajeUsuario: e.mensajeUsuario ?? e.titleEs,
    titleEs: e.titleEs,
    titleEn: e.titleEn,
    descriptionEs: e.descriptionEs,
    descriptionEn: e.descriptionEn,
    correctiveActionEs: e.correctiveActionEs,
    correctiveActionEn: e.correctiveActionEn,
    archived: e.archived,
  };
}

export default function CatalogoAlarmas() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AlarmCatalogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<AlarmCatalogEntry | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const canManage = userCanManageUsers(user);

  const reload = useCallback(() => {
    ensureAlarmCatalog();
    setEntries(
      getAlarmCatalogEntries({ includeArchived: showArchived || undefined })
    );
  }, [showArchived]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        String(e.code).includes(q) ||
        (e.mensajeUsuario ?? '').toLowerCase().includes(q) ||
        e.titleEs.toLowerCase().includes(q) ||
        e.titleEn.toLowerCase().includes(q) ||
        e.model.toLowerCase().includes(q)
    );
  }, [entries, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (e: AlarmCatalogEntry) => {
    setEditingId(e.id);
    setForm(entryToForm(e));
    setError(null);
    setDialogOpen(true);
  };

  const submit = () => {
    setError(null);
    const code = Number(form.code);
    if (!Number.isInteger(code) || code < 0) {
      setError('El código debe ser un entero ≥ 0');
      return;
    }
    if (!form.mensajeUsuario.trim()) {
      setError('El mensaje al usuario es obligatorio');
      return;
    }
    if (!form.titleEs.trim()) {
      setError('El título técnico (ES) es obligatorio');
      return;
    }
    if (!form.model.trim()) {
      setError('El modelo es obligatorio');
      return;
    }

    const payload = {
      code,
      model: form.model.trim(),
      mensajeUsuario: form.mensajeUsuario.trim(),
      titleEs: form.titleEs.trim(),
      titleEn: form.titleEn.trim(),
      descriptionEs: form.descriptionEs.trim(),
      descriptionEn: form.descriptionEn.trim(),
      correctiveActionEs: form.correctiveActionEs.trim(),
      correctiveActionEn: form.correctiveActionEn.trim(),
      archived: form.archived,
    };

    try {
      if (editingId) {
        updateAlarmCatalogEntry(editingId, payload);
      } else {
        addAlarmCatalogEntry(payload);
      }
      setDialogOpen(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    }
  };

  const handleDelete = (e: AlarmCatalogEntry) => {
    const label = e.mensajeUsuario || e.titleEs;
    if (!window.confirm(`¿Eliminar alarma «${label}» (código ${e.code})?`)) return;
    deleteAlarmCatalogEntry(e.id);
    reload();
    if (detailEntry?.id === e.id) setDetailEntry(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-8 w-8" />
            Catálogo de alarmas
          </h1>
          <p className="text-gray-500 mt-1">
            {canManage
              ? 'Gestión del catálogo MP4000. Edite el mensaje al usuario (texto simple) y la ficha técnica completa.'
              : 'Consulta de alarmas: mensaje resumido por código. El detalle técnico es solo para administradores.'}{' '}
            Se relaciona con{' '}
            <code className="text-xs bg-muted px-1 rounded">numero_alarma</code> de cada
            dispositivo.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva alarma
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alarmas registradas</CardTitle>
          <CardDescription>
            {entries.length} entradas en base local (localStorage).
          </CardDescription>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={
                  canManage
                    ? 'Buscar por código, mensaje, título o modelo…'
                    : 'Buscar por código o mensaje…'
                }
                value={search}
                onChange={(ev) => setSearch(ev.target.value)}
              />
            </div>
            {canManage && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={showArchived}
                  onCheckedChange={(c) => setShowArchived(c === true)}
                />
                Incluir archivadas
              </label>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                {canManage && <TableHead>Modelo</TableHead>}
                <TableHead>Mensaje al usuario</TableHead>
                {canManage && <TableHead>Título técnico</TableHead>}
                {canManage && <TableHead>Estado</TableHead>}
                {canManage && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow
                  key={e.id}
                  className="cursor-pointer"
                  onClick={() => setDetailEntry(e)}
                >
                  <TableCell className="font-mono">{e.code}</TableCell>
                  {canManage && <TableCell>{e.model}</TableCell>}
                  <TableCell className="max-w-md truncate font-medium">
                    {e.mensajeUsuario || e.titleEs}
                  </TableCell>
                  {canManage && (
                    <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
                      {e.titleEs}
                    </TableCell>
                  )}
                  {canManage && (
                    <TableCell>
                      {e.archived ? (
                        <Badge variant="secondary">Archivada</Badge>
                      ) : (
                        <Badge>Activa</Badge>
                      )}
                    </TableCell>
                  )}
                  {canManage && (
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openEdit(e);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleDelete(e);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {detailEntry && (
        <AlarmCatalogDetailPanel
          catalog={detailEntry}
          showTechnical={canManage}
        />
      )}

      {canManage && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar alarma' : 'Nueva alarma'}</DialogTitle>
              <DialogDescription>
                El mensaje al usuario es lo que ve el operador. Manténgalo corto y
                claro. El resto es ficha técnica para admin/superadmin.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Código</Label>
                  <Input
                    type="number"
                    value={form.code}
                    onChange={(ev) => setForm((f) => ({ ...f, code: ev.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Modelo</Label>
                  <Input
                    value={form.model}
                    onChange={(ev) => setForm((f) => ({ ...f, model: ev.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-3">
                <Label className="text-amber-950">Mensaje al usuario (obligatorio)</Label>
                <Textarea
                  rows={2}
                  placeholder="Ej. Sensor de suministro desconectado. Revisar cableado."
                  value={form.mensajeUsuario}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, mensajeUsuario: ev.target.value }))
                  }
                />
                <p className="text-xs text-amber-900/80">
                  Texto simple y resumido: es lo único que ve el usuario estándar en
                  listado, detalle y catálogo.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Título técnico (ES)</Label>
                <Input
                  value={form.titleEs}
                  onChange={(ev) => setForm((f) => ({ ...f, titleEs: ev.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Título técnico (EN)</Label>
                <Input
                  value={form.titleEn}
                  onChange={(ev) => setForm((f) => ({ ...f, titleEn: ev.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Descripción (ES)</Label>
                <Textarea
                  rows={4}
                  value={form.descriptionEs}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, descriptionEs: ev.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Descripción (EN)</Label>
                <Textarea
                  rows={3}
                  value={form.descriptionEn}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, descriptionEn: ev.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Acción correctiva (ES)</Label>
                <Textarea
                  rows={4}
                  value={form.correctiveActionEs}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, correctiveActionEs: ev.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Acción correctiva (EN)</Label>
                <Textarea
                  rows={3}
                  value={form.correctiveActionEn}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, correctiveActionEn: ev.target.value }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.archived}
                  onCheckedChange={(c) =>
                    setForm((f) => ({ ...f, archived: c === true }))
                  }
                />
                <span className="text-sm">Archivada (no se muestra por defecto)</span>
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={submit}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
