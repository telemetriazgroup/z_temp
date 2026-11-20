#!/usr/bin/env python3
"""Resumen de una campaña: horas fuera de rango, sin los días retenidos."""

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
    y = h - 48
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y, "Resumen de campaña")
    y -= 18
    c.setFont("Helvetica", 10)
    c.drawString(40, y, f"{spec['cliente']}   {spec['desde']} a {spec['hasta']}")
    y -= 16
    c.setFont("Helvetica", 8)
    c.drawString(
        40,
        y,
        "Horas fuera de rango sin defrost, y el total (esas horas más el defrost). "
        "Los días retenidos no entran en este resumen.",
    )
    y -= 22
    c.setFont("Helvetica-Bold", 8)
    c.drawString(40, y, "Equipo")
    c.drawString(280, y, "Fuera sin defrost")
    c.drawString(400, y, "Fuera total")
    c.drawString(500, y, "Días")
    y -= 8
    c.line(40, y, w - 40, y)
    y -= 14
    c.setFont("Helvetica", 8)
    for fila in spec["filas"]:
        if y < 60:
            c.showPage()
            y = h - 48
            c.setFont("Helvetica", 8)
        c.drawString(40, y, str(fila["nombre"])[:42])
        c.drawRightString(370, y, f"{fila['horas_sin_defrost']:.1f} h")
        c.drawRightString(470, y, f"{fila['horas_total']:.1f} h")
        c.drawRightString(545, y, str(fila["dias"]))
        y -= 14
    y -= 8
    c.setFont("Helvetica-Bold", 9)
    c.drawString(40, y, "Total campaña")
    c.drawRightString(370, y, f"{spec['total_sin_defrost']:.1f} h")
    c.drawRightString(470, y, f"{spec['total']:.1f} h")
    c.save()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
