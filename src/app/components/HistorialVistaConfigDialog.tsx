import React, { useMemo, useState } from 'react';
import {
  PRESET_ORDER,
  HISTORIAL_PRESETS,
  chartableFields,
  tableableFields,
  prefsFromPreset,
  type HistorialFieldDef,
  type HistorialPresetId,
  type HistorialVistaPrefs,
} from '../modules/historialVista';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Loader2, Search } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: HistorialVistaPrefs;
  saving?: boolean;
  onSave: (prefs: HistorialVistaPrefs) => void | Promise<void>;
};

function matchesSearch(f: HistorialFieldDef, q: string): boolean {
  if (!q) return true;
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return (
    f.label.toLowerCase().includes(n) ||
    f.key.toLowerCase().includes(n) ||
    (f.axis != null && f.axis.toLowerCase().includes(n))
  );
}

function colorForField(
  draft: HistorialVistaPrefs,
  f: HistorialFieldDef
): string {
  return draft.chartColors?.[f.key] ?? f.color ?? '#757575';
}

export function HistorialVistaConfigDialog({
  open,
  onOpenChange,
  initial,
  saving = false,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<HistorialVistaPrefs>(initial);
  const [chartSearch, setChartSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');

  React.useEffect(() => {
    if (open) {
      setDraft(initial);
      setChartSearch('');
      setTableSearch('');
    }
  }, [open, initial]);

  const chartFields = useMemo(() => chartableFields(), []);
  const tableFields = useMemo(() => tableableFields(), []);

  const chartFiltered = useMemo(
    () => chartFields.filter((f) => matchesSearch(f, chartSearch)),
    [chartFields, chartSearch]
  );
  const tableFiltered = useMemo(
    () => tableFields.filter((f) => matchesSearch(f, tableSearch)),
    [tableFields, tableSearch]
  );

  const setPreset = (preset: HistorialPresetId) => {
    if (preset === 'CUSTOM') {
      setDraft((d) => ({ ...d, preset: 'CUSTOM' }));
      return;
    }
    setDraft((d) => ({
      ...prefsFromPreset(preset),
      chartColors: d.chartColors,
    }));
  };

  const toggleChart = (key: string, on: boolean) => {
    setDraft((d) => {
      const set = new Set(d.chartKeys);
      const labels = new Set(d.labelKeys ?? []);
      if (on) set.add(key);
      else {
        set.delete(key);
        labels.delete(key);
      }
      return {
        ...d,
        preset: 'CUSTOM',
        chartKeys: [...set],
        labelKeys: [...labels],
      };
    });
  };

  const toggleTable = (key: string, on: boolean) => {
    setDraft((d) => {
      const set = new Set(d.tableKeys);
      if (on) set.add(key);
      else set.delete(key);
      return { ...d, preset: 'CUSTOM', tableKeys: [...set] };
    });
  };

  const toggleLabel = (key: string, on: boolean) => {
    setDraft((d) => {
      const labels = new Set(d.labelKeys ?? []);
      const chart = new Set(d.chartKeys);
      if (on) {
        labels.add(key);
        chart.add(key);
      } else {
        labels.delete(key);
      }
      return {
        ...d,
        preset: 'CUSTOM',
        chartKeys: [...chart],
        labelKeys: [...labels],
      };
    });
  };

  const setChartColor = (key: string, color: string) => {
    setDraft((d) => ({
      ...d,
      chartColors: { ...(d.chartColors ?? {}), [key]: color },
    }));
  };

  const setChartKeysBulk = (keys: string[], on: boolean) => {
    setDraft((d) => {
      const set = new Set(d.chartKeys);
      const labels = new Set(d.labelKeys ?? []);
      for (const key of keys) {
        if (on) set.add(key);
        else {
          set.delete(key);
          labels.delete(key);
        }
      }
      return {
        ...d,
        preset: 'CUSTOM',
        chartKeys: [...set],
        labelKeys: [...labels],
      };
    });
  };

  const setTableKeysBulk = (keys: string[], on: boolean) => {
    setDraft((d) => {
      const set = new Set(d.tableKeys);
      for (const key of keys) {
        if (on) set.add(key);
        else set.delete(key);
      }
      return { ...d, preset: 'CUSTOM', tableKeys: [...set] };
    });
  };

  const chartFilteredKeys = chartFiltered.map((f) => f.key);
  const tableFilteredKeys = tableFiltered.map((f) => f.key);
  const chartAllOn =
    chartFilteredKeys.length > 0 &&
    chartFilteredKeys.every((k) => draft.chartKeys.includes(k));
  const tableAllOn =
    tableFilteredKeys.length > 0 &&
    tableFilteredKeys.every((k) => draft.tableKeys.includes(k));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar vista de historial</DialogTitle>
          <DialogDescription>
            Elija un perfil de máquina (Reefer, Túnel, Madurador) o personalice
            qué series ver en la gráfica y qué columnas en la tabla. Puede
            buscar campos, marcar todos, elegir color y activar etiquetas de
            valor. Se guarda por su usuario y este equipo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-2">
            <Label>Perfil</Label>
            <Select
              value={draft.preset}
              onValueChange={(v) => setPreset(v as HistorialPresetId)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESET_ORDER.map((id) => (
                  <SelectItem key={id} value={id}>
                    {HISTORIAL_PRESETS[id].label}
                  </SelectItem>
                ))}
                <SelectItem value="CUSTOM">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">En gráfica</p>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={chartFilteredKeys.length === 0}
                  onClick={() => setChartKeysBulk(chartFilteredKeys, true)}
                >
                  Todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={chartFilteredKeys.length === 0}
                  onClick={() => setChartKeysBulk(chartFilteredKeys, false)}
                >
                  Ninguno
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={chartFilteredKeys.length === 0}
                  onClick={() =>
                    setChartKeysBulk(chartFilteredKeys, !chartAllOn)
                  }
                >
                  {chartAllOn ? 'Ocultar filtrados' : 'Mostrar filtrados'}
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={chartSearch}
                onChange={(e) => setChartSearch(e.target.value)}
                placeholder="Buscar campo (ej. humedad, USDA, co2)…"
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto rounded-md border p-2">
              {chartFiltered.length === 0 ? (
                <p className="col-span-full text-xs text-muted-foreground py-4 text-center">
                  Ningún campo coincide con la búsqueda.
                </p>
              ) : (
                <>
                  <div className="col-span-full flex items-center justify-end gap-3 px-1 text-[10px] text-muted-foreground">
                    <span>Serie</span>
                    <span className="w-10 text-center">Valores</span>
                    <span className="w-7 text-center">Color</span>
                  </div>
                  {chartFiltered.map((f) => {
                    const color = colorForField(draft, f);
                    const inChart = draft.chartKeys.includes(f.key);
                    const hasLabel = (draft.labelKeys ?? []).includes(f.key);
                    return (
                      <div
                        key={f.key}
                        className="flex items-center gap-2 text-xs min-w-0"
                      >
                        <Checkbox
                          checked={inChart}
                          onCheckedChange={(v) =>
                            toggleChart(f.key, v === true)
                          }
                          id={`chart-${f.key}`}
                        />
                        <label
                          htmlFor={`chart-${f.key}`}
                          className="flex-1 min-w-0 cursor-pointer truncate"
                          title={`${f.label} (${f.key})`}
                        >
                          {f.label}
                          <span className="text-muted-foreground ml-1">
                            ({f.axis})
                          </span>
                        </label>
                        <Checkbox
                          checked={hasLabel}
                          disabled={!inChart}
                          onCheckedChange={(v) =>
                            toggleLabel(f.key, v === true)
                          }
                          aria-label={`Etiquetas de ${f.label}`}
                          title="Mostrar etiquetas de valor"
                          className="mx-1"
                        />
                        <input
                          type="color"
                          value={color}
                          title={`Color de ${f.label}`}
                          aria-label={`Color de ${f.label}`}
                          className="h-6 w-7 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
                          onChange={(e) => setChartColor(f.key, e.target.value)}
                        />
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">En tabla</p>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={tableFilteredKeys.length === 0}
                  onClick={() => setTableKeysBulk(tableFilteredKeys, true)}
                >
                  Todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={tableFilteredKeys.length === 0}
                  onClick={() => setTableKeysBulk(tableFilteredKeys, false)}
                >
                  Ninguno
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={tableFilteredKeys.length === 0}
                  onClick={() =>
                    setTableKeysBulk(tableFilteredKeys, !tableAllOn)
                  }
                >
                  {tableAllOn ? 'Ocultar filtrados' : 'Mostrar filtrados'}
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Buscar columna (ej. voltaje, alarma, etileno)…"
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto rounded-md border p-2">
              {tableFiltered.length === 0 ? (
                <p className="col-span-full text-xs text-muted-foreground py-4 text-center">
                  Ninguna columna coincide con la búsqueda.
                </p>
              ) : (
                tableFiltered.map((f) => (
                  <label
                    key={f.key}
                    className="flex items-center gap-2 text-xs cursor-pointer min-w-0"
                    title={f.key}
                  >
                    <Checkbox
                      checked={draft.tableKeys.includes(f.key)}
                      onCheckedChange={(v) => toggleTable(f.key, v === true)}
                    />
                    <span className="truncate">{f.label}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving || draft.chartKeys.length === 0}
            onClick={() => void onSave(draft)}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
