#!/usr/bin/env python3
"""Una página cuando el periodo no tiene telemetría. No es un error del informe."""

from __future__ import annotations

import json
import sys

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def main() -> int:
    with open(sys.argv[1], encoding="utf-8") as fh:
        spec = json.load(fh)
    c = canvas.Canvas(spec["salida"], pagesize=A4)
    w, h = A4
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, h - 56, "Sin datos")
    c.setFont("Helvetica", 11)
    c.drawString(40, h - 84, str(spec.get("nombre") or "")[:90])
    c.setFont("Helvetica", 10)
    desde = spec.get("desde") or ""
    hasta = spec.get("hasta") or ""
    periodo = desde if desde == hasta else f"{desde} a {hasta}"
    c.drawString(40, h - 104, f"Periodo: {periodo}")
    c.drawString(40, h - 128, "No hay telemetría en este periodo.")
    c.save()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
