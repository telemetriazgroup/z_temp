import React, { useMemo, useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { cn } from './ui/utils';

export function EstadoConexionBadge({ estado }: { estado?: string | null }) {
  const s = String(estado ?? '').trim().toLowerCase();
  if (s === 'online') {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px] h-5 px-1.5 shrink-0">
        ONLINE
      </Badge>
    );
  }
  if (s === 'wait') {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] h-5 px-1.5 shrink-0">
        WAIT
      </Badge>
    );
  }
  if (s === 'offline') {
    return (
      <Badge variant="destructive" className="text-[10px] h-5 px-1.5 shrink-0">
        OFFLINE
      </Badge>
    );
  }
  if (!s) return null;
  return (
    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
      {s.toUpperCase()}
    </Badge>
  );
}

export interface DeviceSearchOption {
  rowKey: string;
  label: string;
  /** Texto adicional para filtrar (IMEI, nombre, código). */
  searchText: string;
  estado?: string | null;
  disabled?: boolean;
  disabledReason?: string;
}

interface Props {
  options: DeviceSearchOption[];
  onSelect: (rowKey: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
}

/** Buscador inline (sin popover) — funciona dentro de modales/dialogs. */
export function DeviceSearchPicker({
  options,
  onSelect,
  placeholder = 'Buscar por IMEI, nombre o código…',
  emptyMessage = 'No se encontró ningún dispositivo.',
  className,
}: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...options].sort((a, b) => {
      if (a.disabled === b.disabled) return a.label.localeCompare(b.label);
      return a.disabled ? 1 : -1;
    });
    if (!q) {
      return sorted.filter((o) => !o.disabled).slice(0, 15);
    }
    return sorted.filter((o) => {
      const haystack = `${o.label} ${o.searchText}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  const availableCount = options.filter((o) => !o.disabled).length;

  const handleSelect = (rowKey: string) => {
    const opt = options.find((o) => o.rowKey === rowKey);
    if (opt?.disabled) return;
    onSelect(rowKey);
    setQuery('');
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
          autoComplete="off"
        />
      </div>

      <div className="rounded-md border bg-muted/20 max-h-52 overflow-y-auto">
        {availableCount === 0 && query.trim() === '' && (
          <p className="p-3 text-sm text-muted-foreground text-center">
            Todos los equipos visibles ya están en el grupo.
          </p>
        )}

        {filtered.length === 0 && query.trim() !== '' && (
          <p className="p-3 text-sm text-muted-foreground text-center">{emptyMessage}</p>
        )}

        <ul className="divide-y">
          {filtered.map((opt) => (
            <li key={opt.rowKey}>
              <button
                type="button"
                disabled={opt.disabled}
                onClick={() => handleSelect(opt.rowKey)}
                className={cn(
                  'w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors',
                  opt.disabled
                    ? 'opacity-50 cursor-not-allowed bg-muted/30'
                    : 'hover:bg-accent cursor-pointer'
                )}
              >
                <span className="min-w-0 truncate">{opt.label}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <EstadoConexionBadge estado={opt.estado} />
                {!opt.disabled ? (
                  <Plus className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {opt.disabledReason ?? 'No disponible'}
                  </span>
                )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        {availableCount} equipo(s) disponible(s). Escriba para filtrar y pulse una fila para agregar.
      </p>
    </div>
  );
}
