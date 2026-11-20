#!/usr/bin/env python3
"""Genera el informe a partir de un CSV ya armado por la telemetría."""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from ztrack_main import CONFIG_POR_DEFECTO, procesar  # noqa: E402


def main():
    if len(sys.argv) != 3:
        print("uso: run_serie.py <serie.csv> <config.json>", file=sys.stderr)
        return 2
    csv_path, cfg_path = sys.argv[1], sys.argv[2]
    with open(cfg_path, encoding="utf-8") as fh:
        incoming = json.load(fh)
    cfg = dict(CONFIG_POR_DEFECTO)
    cfg.update(incoming)
    desde = cfg.pop("desde", None) or None
    hasta = cfg.pop("hasta", None) or None
    nombre = cfg.pop("nombre_equipo", None) or None

    def log(msg):
        print(msg, flush=True)

    result = procesar(csv_path, cfg, desde=desde, hasta=hasta, nombre_override=nombre, log=log)
    archivos = result.get("archivos") or {}
    pdfs = archivos.get("pdfs") or []
    out = {
        "imei": result.get("imei"),
        "nombre": result.get("nombre"),
        "registros": result.get("registros"),
        "dias": result.get("dias"),
        "paginas": result.get("paginas"),
        "filas_reconstruidas": result.get("filas_reconstruidas"),
        "huecos": result.get("huecos"),
        "cumplimiento": result.get("cumplimiento"),
        "horas_en_rango_prom": result.get("horas_en_rango_prom"),
        "horas_fuera_rango": result.get("horas_fuera_rango"),
        "horas_defrost": result.get("horas_defrost"),
        "dias_detalle": result.get("dias_detalle") or [],
        "set_point": result.get("set_point"),
        "pdfs": [Path(p).name for p in pdfs],
        "datos": Path(archivos["datos"]).name if archivos.get("datos") else None,
        "resumen": Path(archivos["resumen"]).name if archivos.get("resumen") else None,
        "huecos_csv": Path(archivos["huecos"]).name if archivos.get("huecos") else None,
    }
    print("RESULT " + json.dumps(out, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR {exc}", file=sys.stderr, flush=True)
        raise SystemExit(1)
