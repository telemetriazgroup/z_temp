"""
ztrack_informe.py
=================
Generacion de graficas diarias y del informe PDF:
  - una portada/resumen por mes
  - una pagina por dia del mes
Los tramos sin telemetria decodificada se presentan como "tendencia de datos".
"""

from __future__ import annotations

import io
import os
import re

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas as rl_canvas

from ztrack_core import (TEMP_MAX_VALIDA, TEMP_MIN_VALIDA,
                         limpiar_temperaturas, resumen_horario)
from ztrack_i18n import ESTADO_CLAVE, get_textos, nombre_mes, t

# Paleta
C_SUPPLY = "#1f6feb"
C_RETURN = "#0f9d58"
C_COIL = "#e8710a"
C_BANDA = "#dff0e3"
C_DEFROST = "#ffe2c2"
C_PREP = "#c5dff8"
C_RECON = "#d9d9d9"
C_TXT = colors.HexColor("#1c2b36")
C_LINEA = colors.HexColor("#c8d2da")
C_HEAD = colors.HexColor("#0f3d5c")

# Celular peruano suelto: empieza en 9 y tiene 9 digitos. No va en el titulo.
_TELEFONO = re.compile(r"(?<!\d)9\d{8}(?!\d)")


def quitar_telefonos(nombre: str) -> str:
    s = _TELEFONO.sub(" ", str(nombre or ""))
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+([.,;])", r"\1", s)
    return s.strip(" \t.,;-")


def _ancho(font, size, texto):
    return pdfmetrics.stringWidth(texto or "", font, size)


def _envolver(texto, font, size, max_w, max_lineas=2):
    """Parte el texto en hasta `max_lineas` sin pasar de max_w."""
    palabras = str(texto or "").split()
    if not palabras or max_w <= 8:
        return [str(texto or "")]
    lineas, cur = [], ""
    i = 0
    while i < len(palabras):
        trial = (cur + " " + palabras[i]).strip()
        if not cur or _ancho(font, size, trial) <= max_w:
            cur = trial
            i += 1
            continue
        lineas.append(cur)
        cur = ""
        if len(lineas) >= max_lineas - 1:
            resto = " ".join(palabras[i:])
            if _ancho(font, size, resto) > max_w:
                while resto and _ancho(font, size, resto + "…") > max_w:
                    resto = resto[:-1].rstrip()
                resto = (resto + "…") if resto else "…"
            lineas.append(resto)
            return lineas
    if cur:
        lineas.append(cur)
    return lineas[:max_lineas]


def _serie_limpia(s: pd.Series,
                  tmin: float = TEMP_MIN_VALIDA,
                  tmax: float = TEMP_MAX_VALIDA) -> pd.Series:
    v = pd.to_numeric(s, errors="coerce")
    return v.where((v >= tmin) & (v <= tmax))


def _ylim_temperaturas(*series, sp=None, tolerancia=None,
                       tmin=TEMP_MIN_VALIDA, tmax=TEMP_MAX_VALIDA):
    """Limites de eje Y acotados al rango valido, con margen."""
    vals = []
    for s in series:
        if s is None:
            continue
        v = pd.to_numeric(pd.Series(s), errors="coerce").dropna()
        v = v[(v >= tmin) & (v <= tmax)]
        if len(v):
            vals.extend(v.tolist())
    if sp is not None and tolerancia is not None:
        vals.extend([sp - tolerancia, sp + tolerancia, sp])
    if not vals:
        return tmin, tmax
    lo = max(tmin, min(vals) - 2)
    hi = min(tmax, max(vals) + 2)
    if hi - lo < 4:
        mid = (lo + hi) / 2
        lo, hi = mid - 2, mid + 2
    return lo, hi


# ---------------------------------------------------------------------------
# GRAFICA DIARIA
# ---------------------------------------------------------------------------
def grafica_dia(df, mask_def, dia, sensor_control, tolerancia,
                intervalo, ancho=10.2, alto=3.9, dpi=120, idioma="es",
                mask_prep=None) -> bytes:
    """
    Grafica de 24 h: traza completa de los tres sensores, marcadores con el
    dato representativo de cada hora, banda de rango, sombreado de defrost,
    preparacion y tendencia de datos. Devuelve un PNG en memoria.
    """
    tx = get_textos(idioma)
    if mask_prep is None:
        mask_prep = np.zeros(len(df), dtype=bool)
    prep = np.asarray(mask_prep, dtype=bool)
    deff = np.asarray(mask_def, dtype=bool) & ~prep
    d = limpiar_temperaturas(df.assign(_def=deff, _prep=prep))
    g = d[d["fecha"].dt.date == dia].sort_values("fecha")
    sp = float(df["set_point"].median())
    lo, hi = sp - tolerancia, sp + tolerancia

    tz = df["fecha"].dt.tz
    t0 = pd.Timestamp(dia, tz=tz)
    t1 = t0 + pd.Timedelta(days=1)

    fig, ax = plt.subplots(figsize=(ancho, alto), dpi=dpi)

    ax.axhspan(lo, hi, color=C_BANDA, zorder=0,
               label=t(tx, "banda_rango", lo=lo, hi=hi))
    ax.axhline(sp, color="#2e7d32", ls="--", lw=1.0, zorder=1)

    if len(g):
        rec = (g["origen"] == "reconstruido").to_numpy()
        f = g["fecha"].reset_index(drop=True)
        cam = np.flatnonzero(np.diff(rec.astype(int)))
        bordes = np.r_[0, cam + 1, len(rec)]
        primero = True
        for i in range(len(bordes) - 1):
            a, b = bordes[i], bordes[i + 1] - 1
            if rec[a]:
                ax.axvspan(f.iloc[a], f.iloc[b], color=C_RECON, alpha=0.55, zorder=0,
                           label=tx["tramo_tendencia"] if primero else None)
                primero = False

    primero = True
    for _, e in _tramos_mascara(g, "_prep").iterrows():
        ax.axvspan(e["ini"], e["fin"], color=C_PREP, alpha=0.75, zorder=1,
                   label=tx["etapa_preparacion"] if primero else None)
        primero = False

    primero = True
    for _, e in _tramos_mascara(g, "_def").iterrows():
        ax.axvspan(e["ini"], e["fin"], color=C_DEFROST, alpha=0.85, zorder=1,
                   label=tx["etapa_defrost"] if primero else None)
        primero = False

    trazas = []
    for col, color in [("evaporation_coil", C_COIL),
                       ("temp_supply_1", C_SUPPLY),
                       ("return_air", C_RETURN)]:
        y = _serie_limpia(g[col])
        trazas.append(y)
        ax.plot(g["fecha"], y, color=color, lw=0.75, alpha=0.55, zorder=3)

    rh = resumen_horario(d, deff, dia, sensor_control, tolerancia, intervalo,
                         mask_prep=prep)
    horas = [t0 + pd.Timedelta(minutes=30 + 60 * h) for h in rh["hora"]]
    for col, color, etq in [("evaporation_coil", C_COIL, tx["evaporador"]),
                            ("temp_supply_1", C_SUPPLY, tx["suministro"]),
                            ("return_air", C_RETURN, tx["retorno_control"])]:
        y = _serie_limpia(rh[f"{col}_med"])
        trazas.append(y)
        ax.plot(horas, y, color=color, lw=1.9, marker="o",
                ms=3.4, zorder=4, label=etq)

    ax.set_xlim(t0, t1)
    ymin, ymax = _ylim_temperaturas(*trazas, sp=sp, tolerancia=tolerancia)
    ax.set_ylim(ymin, ymax)
    ax.xaxis.set_major_locator(mdates.HourLocator(interval=2))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%H", tz=tz))
    ax.set_ylabel(tx["temperatura"], fontsize=8)
    ax.set_xlabel(tx["hora_local"], fontsize=8)
    ax.tick_params(labelsize=7.5)
    ax.grid(True, ls=":", lw=0.5, color="#b9c4cc", zorder=0)
    ax.legend(fontsize=6.5, ncol=5, loc="upper center",
              bbox_to_anchor=(0.5, 1.18), frameon=False)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return buf.getvalue()


def grafica_resumen(resumen, tolerancia, ancho=10.2, alto=4.6, dpi=130,
                    idioma="es") -> bytes:
    """Grafica de tendencia del periodo: horas por dia y evolucion termica."""
    tx = get_textos(idioma)
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(ancho, alto), dpi=dpi,
                                 sharex=True, height_ratios=[1, 1])
    x = pd.to_datetime(resumen["dia"])

    h_prep = (resumen["horas_preparacion"]
              if "horas_preparacion" in resumen.columns
              else pd.Series(0.0, index=resumen.index))
    base_def = (resumen["horas_en_rango"] + resumen["horas_fuera_rango"]
                + resumen["horas_defrost"])
    a1.bar(x, resumen["horas_en_rango"], color="#2e9e5b", width=0.85,
           label=tx["horas_en_rango"])
    a1.bar(x, resumen["horas_fuera_rango"], bottom=resumen["horas_en_rango"],
           color="#c0392b", width=0.85, label=tx["horas_fuera"])
    a1.bar(x, resumen["horas_defrost"],
           bottom=resumen["horas_en_rango"] + resumen["horas_fuera_rango"],
           color=C_COIL, width=0.85, label=tx["horas_defrost"])
    a1.bar(x, h_prep, bottom=base_def, color="#5dade2", width=0.85,
           label=tx["horas_preparacion"])
    a1.bar(x, resumen["horas_sin_dato"],
           bottom=base_def + h_prep,
           color="#b0bcc4", width=0.85, label=tx["sin_dato"])
    a1.set_ylim(0, 24.6)
    a1.set_ylabel(tx["horas_por_dia"], fontsize=8)
    a1.legend(fontsize=6.2, ncol=5, loc="lower center", frameon=False)

    sp = float(resumen["set_point"].iloc[0])
    a2.axhspan(sp - tolerancia, sp + tolerancia, color=C_BANDA, zorder=0)
    a2.axhline(sp, color="#2e7d32", ls="--", lw=0.9)
    rmin = _serie_limpia(resumen["return_air_min"])
    rmax = _serie_limpia(resumen["return_air_max"])
    rmed = _serie_limpia(resumen["return_air_med"])
    smed = _serie_limpia(resumen["temp_supply_1_med"])
    a2.fill_between(x, rmin, rmax, color=C_RETURN, alpha=0.22,
                    label=tx["retorno_minmax"])
    a2.plot(x, rmed, color=C_RETURN, lw=1.4, label=tx["retorno_medio"])
    a2.plot(x, smed, color=C_SUPPLY, lw=1.1, label=tx["suministro_medio"])
    ymin, ymax = _ylim_temperaturas(rmin, rmax, rmed, smed,
                                    sp=sp, tolerancia=tolerancia)
    a2.set_ylim(ymin, ymax)
    a2.set_ylabel(tx["temperatura"], fontsize=8)
    a2.legend(fontsize=6.6, ncol=3, loc="lower center", frameon=False)

    rec = resumen["pct_reconstruido"] > 50
    for xi in x[rec]:
        for ax in (a1, a2):
            ax.axvspan(xi - pd.Timedelta(hours=12), xi + pd.Timedelta(hours=12),
                       color=C_RECON, alpha=0.30, zorder=0)

    for ax in (a1, a2):
        ax.grid(True, ls=":", lw=0.5, color="#b9c4cc")
        ax.tick_params(labelsize=7)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
    a2.xaxis.set_major_formatter(mdates.DateFormatter("%d/%m"))
    fig.autofmt_xdate(rotation=0, ha="center")

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return buf.getvalue()


def _tramos_mascara(g: pd.DataFrame, col: str = "_def") -> pd.DataFrame:
    """Convierte una mascara booleana del dia en tramos (ini, fin)."""
    if g.empty or col not in g.columns:
        return pd.DataFrame(columns=["ini", "fin"])
    m = g[col].to_numpy()
    f = g["fecha"].reset_index(drop=True)
    cam = np.flatnonzero(np.diff(m.astype(int)))
    bordes = np.r_[0, cam + 1, len(m)]
    out = []
    for i in range(len(bordes) - 1):
        a, b = bordes[i], bordes[i + 1] - 1
        if m[a]:
            out.append({"ini": f.iloc[a], "fin": f.iloc[b]})
    return pd.DataFrame(out)


def _eventos_del_dia(g: pd.DataFrame) -> pd.DataFrame:
    """Compatibilidad: tramos de defrost del dia."""
    return _tramos_mascara(g, "_def")


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------
class InformePDF:
    """Construye el informe con una pagina por dia."""

    def __init__(self, ruta, cfg):
        self.ruta = ruta
        self.cfg = cfg
        self.idioma = (cfg.get("idioma") or "es").lower().strip()
        self.tx = get_textos(self.idioma)
        self.c = rl_canvas.Canvas(ruta, pagesize=A4)
        self.W, self.H = A4
        self.m = 30
        self.pag = 0
        self.logo = self._cargar_logo(cfg.get("logo"))

    @staticmethod
    def _cargar_logo(ruta):
        """Carga el logo recortando padding transparente para encuadrarlo al texto."""
        if not ruta or not os.path.exists(ruta):
            return None
        try:
            from PIL import Image
            im = Image.open(ruta).convert("RGBA")
            bbox = im.split()[-1].getbbox()
            if bbox:
                im = im.crop(bbox)
            buf = io.BytesIO()
            im.save(buf, format="PNG")
            buf.seek(0)
            return ImageReader(buf)
        except Exception:
            try:
                return ImageReader(ruta)
            except Exception:
                return None

    def _empresa(self):
        return self.cfg.get("empresa") or self.tx["empresa_default"]

    def _pie_izq(self):
        return self.cfg.get("pie_izquierdo") or self.tx["pie_izq_default"]

    def _pie_centro(self):
        return self.cfg.get("pie_centro") or self.tx["pie_centro_default"]

    def cabecera(self, titulo, sub_izq="", sub_der=""):
        """Logo a la izquierda. El nombre ocupa hasta 2 filas y no invade el titulo."""
        c, W, H, m = self.c, self.W, self.H, self.m
        sub_izq = quitar_telefonos(sub_izq)
        if " — " in titulo:
            titulo_a, titulo_b = titulo.split(" — ", 1)
        else:
            titulo_a, titulo_b = titulo, ""
        empresa = self._empresa()
        right_w = max(
            _ancho("Helvetica-Bold", 9.5, titulo_a),
            _ancho("Helvetica-Bold", 9.5, titulo_b),
            _ancho("Helvetica", 7.0, empresa),
        )
        m_top = 16
        y_top = H - m_top

        # Ancho provisional del logo para reservar la columna izquierda.
        logo_h_est = 34
        if self.logo:
            iw, ih = self.logo.getSize()
            logo_w_est = min(150, logo_h_est * iw / ih if ih else 120)
        else:
            logo_w_est = 88
        x_sub = m + logo_w_est + 10
        left_max = (W - m - right_w - 16) - x_sub
        left_max = max(left_max, 120)

        nombre_lineas = _envolver(sub_izq, "Helvetica-Bold", 8, left_max, 2)
        n_filas = max(2, len(nombre_lineas) + (1 if sub_der else 0))
        line_h = 11
        text_h = n_filas * line_h
        band_h = max(34.0, text_h)
        y_base = y_top - band_h
        y_line = y_base - 4

        if self.logo:
            iw, ih = self.logo.getSize()
            logo_h = min(band_h, 40)
            logo_w = logo_h * iw / ih if ih else logo_h
            if logo_w > logo_w_est:
                logo_w = logo_w_est
                logo_h = logo_w * ih / iw if iw else logo_h
            y_logo = y_base + (band_h - logo_h) / 2
            c.drawImage(self.logo, m, y_logo, width=logo_w, height=logo_h,
                        mask="auto", preserveAspectRatio=True)
        else:
            c.setFillColor(C_HEAD)
            c.roundRect(m, y_base, 88, band_h, 3, stroke=0, fill=1)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 11)
            c.drawCentredString(m + 44, y_base + band_h / 2 - 4,
                                self.cfg.get("marca", "ZTRACK"))

        y = y_top - 9
        c.setFillColor(C_TXT)
        c.setFont("Helvetica-Bold", 8)
        for ln in nombre_lineas:
            c.drawString(x_sub, y, ln)
            y -= line_h
        if sub_der:
            c.setFont("Helvetica", 7.2)
            c.setFillColor(colors.HexColor("#5b6b78"))
            c.drawString(x_sub, y, sub_der)

        y_r = y_top - 9
        c.setFillColor(C_TXT)
        c.setFont("Helvetica-Bold", 9.5)
        c.drawRightString(W - m, y_r, titulo_a)
        if titulo_b:
            c.drawRightString(W - m, y_r - line_h, titulo_b)
        c.setFont("Helvetica", 7.0)
        c.setFillColor(colors.HexColor("#5b6b78"))
        c.drawRightString(W - m, y_r - line_h * (2 if titulo_b else 1), empresa)

        c.setStrokeColor(C_HEAD)
        c.setLineWidth(1.1)
        c.line(m, y_line, W - m, y_line)
        return y_line - 8

    def pie(self, total=None):
        c, W, m = self.c, self.W, self.m
        y = self.m + 16
        c.setStrokeColor(C_LINEA)
        c.setLineWidth(0.7)
        c.line(m, y, W - m, y)
        c.setFont("Helvetica", 7.2)
        c.setFillColor(colors.HexColor("#6b7a86"))
        c.drawString(m, y - 10, self._pie_izq())
        c.drawCentredString(W / 2, y - 10, self._pie_centro())
        txt = f"{self.tx['pagina']} {self.pag}"
        if total:
            txt += f" {self.tx['de']} {total}"
        c.drawRightString(W - m, y - 10, txt)

    def kpis(self, y, items, alto=46):
        c, W, m = self.c, self.W, self.m
        ancho = (W - 2 * m - 6 * (len(items) - 1)) / len(items)
        x = m
        for etq, val, tono in items:
            c.setFillColor(colors.HexColor(tono))
            c.roundRect(x, y - alto, ancho, alto, 3.5, stroke=0, fill=1)
            c.setFillColor(colors.HexColor("#44555f"))
            c.setFont("Helvetica", 6.1)
            lineas = _envolver(etq.upper(), "Helvetica", 6.1, ancho - 12, 2)
            yy = y - 11
            for ln in lineas:
                c.drawString(x + 6, yy, ln)
                yy -= 8
            c.setFillColor(C_TXT)
            c.setFont("Helvetica-Bold", 12.5)
            c.drawString(x + 6, y - alto + 8, val)
            x += ancho + 6
        return y - alto - 12

    def tabla_horaria(self, y, rh):
        c, W, m = self.c, self.W, self.m
        tx = self.tx
        cols = [tx["col_h"], tx["col_sum"], tx["col_ret"],
                tx["col_evap"], tx["col_defr"], tx["col_estado"]]
        anchos = [16, 30, 30, 30, 24, 46]
        bw = sum(anchos)
        gap = (W - 2 * m - 2 * bw) / 3
        fila_h = 10.4
        estado_color = {
            "EN RANGO": "#1a7f37", "FUERA": "#c0392b",
            "DEFROST": "#b35309", "PREPARACION": "#1f618d",
            "SIN DATO": "#8a949c",
        }

        def bloque(x0, sub):
            c.setFillColor(C_HEAD)
            c.rect(x0, y - fila_h, bw, fila_h, stroke=0, fill=1)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 6.4)
            x = x0
            for cn, a in zip(cols, anchos):
                c.drawCentredString(x + a / 2, y - fila_h + 3.2, cn)
                x += a
            yy = y - fila_h
            for i, (_, r) in enumerate(sub.iterrows()):
                yy -= fila_h
                if i % 2 == 0:
                    c.setFillColor(colors.HexColor("#f4f7f9"))
                    c.rect(x0, yy, bw, fila_h, stroke=0, fill=1)
                x = x0
                est = r["estado"]
                est_txt = tx[ESTADO_CLAVE[est]]
                vals = [f"{int(r['hora']):02d}",
                        _f(r["temp_supply_1_med"]),
                        _f(r["return_air_med"]),
                        _f(r["evaporation_coil_med"]),
                        f"{r['min_defrost']:.0f}" if r["min_defrost"] > 0 else "-",
                        est_txt]
                for j, (v, a) in enumerate(zip(vals, anchos)):
                    if j == 5:
                        c.setFillColor(colors.HexColor(estado_color[est]))
                        c.setFont("Helvetica-Bold", 6.1)
                    else:
                        c.setFillColor(C_TXT)
                        c.setFont("Helvetica", 6.4)
                    c.drawCentredString(x + a / 2, yy + 3.2, v)
                    x += a
            return yy

        y1 = bloque(m + gap * 0.15, rh.iloc[:12])
        bloque(m + gap * 0.15 + bw + gap * 1.5, rh.iloc[12:])
        return y1 - 6

    def portada_mensual(self, unidad, year, month, resumen_mes, perfil, cfg,
                        total=None):
        """Portada: resumen del mes, analisis y tabla dia a dia."""
        self.pag += 1
        tx = self.tx
        mes_txt = nombre_mes(tx, year, month)
        y = self.cabecera(
            f"{tx['titulo_mensual']} — {mes_txt}",
            unidad,
            f"{tx['periodo']}: {resumen_mes['dia'].min()} {tx['a']} {resumen_mes['dia'].max()}",
        )
        c, W, m = self.c, self.W, self.m

        tot_h = float(resumen_mes["horas_evaluadas"].sum())
        tot_r = float(resumen_mes["horas_en_rango"].sum())
        cumpl = 100 * tot_r / tot_h if tot_h else 0.0
        ret_med = float(resumen_mes["return_air_med"].mean())
        y = self.kpis(y, [
            (tx["kpi_dias"], f"{len(resumen_mes)}", "#eef3f7"),
            (tx["kpi_prom_rango"],
             f"{resumen_mes['horas_en_rango'].mean():.1f} h", "#e7f4ea"),
            (tx["kpi_cumplimiento_global"],
             f"{cumpl:.2f} %" if tot_h else "-", "#e7f4ea"),
            (tx["kpi_defrost_dia"],
             f"{resumen_mes['defrost_eventos'].mean():.1f}", "#fdf0e3"),
            (tx["kpi_retorno_medio"], f"{ret_med:.1f} C", "#eef3f7"),
        ], alto=40)

        sp = float(resumen_mes["set_point"].iloc[0])
        tol = cfg["tolerancia"]

        # Resumen del analisis
        c.setFillColor(C_TXT)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(m, y, tx["resumen_analisis"])
        y -= 12
        c.setFont("Helvetica", 7.6)
        prep_h = float(resumen_mes["horas_preparacion"].sum()
                       if "horas_preparacion" in resumen_mes.columns else 0.0)
        prep_txt = (t(tx, "resumen_prep_txt", prep=prep_h) if prep_h > 0.05
                    else "")
        analisis = t(
            tx, "resumen_analisis_txt",
            mes=mes_txt, dias=len(resumen_mes), cumpl=cumpl, ret=ret_med,
            hr=float(resumen_mes["horas_en_rango"].mean()),
            def_dia=float(resumen_mes["defrost_eventos"].mean()),
            dur=float(perfil["duracion_med_min"]),
            prep_txt=prep_txt,
        )
        for sub in _wrap(analisis, 115):
            c.drawString(m, y, sub)
            y -= 9.5
        y -= 4

        # Nota: defrost = ciclo normal. Alto segun el texto, con aire arriba y abajo.
        nota_lineas = _wrap(tx["nota_defrost_normal"], 105)
        line_h = 11
        # 8 pt arriba del titulo, titulo, aire, lineas y 10 pt bajo la ultima linea.
        alto_nota = 8 + 11 + 6 + line_h * len(nota_lineas) + 10
        c.setFillColor(colors.HexColor("#eef6f2"))
        c.roundRect(m, y - alto_nota, W - 2 * m, alto_nota, 3, stroke=0, fill=1)
        c.setFillColor(colors.HexColor("#1a7f37"))
        c.setFont("Helvetica-Bold", 7.4)
        c.drawString(m + 10, y - 16, tx["kpi_defrost"].upper())
        c.setFillColor(C_TXT)
        c.setFont("Helvetica", 7.2)
        yy = y - 8 - 11 - 6
        for sub in nota_lineas:
            c.drawString(m + 10, yy, sub)
            yy -= line_h
        y -= alto_nota + 12

        c.setFont("Helvetica", 7.2)
        for ln in [
            t(tx, "criterio_sp", sp=sp, tol=tol, lo=sp - tol, hi=sp + tol),
            t(tx, "criterio_defrost",
              periodo=perfil["periodo_h"],
              dur=perfil["duracion_med_min"],
              pico=perfil.get("pico_coil_med", 0)),
        ]:
            for sub in _wrap(ln, 118):
                c.drawString(m, y, sub)
                y -= 9
            y -= 1

        # Grafica compacta del mes
        img = ImageReader(io.BytesIO(
            grafica_resumen(resumen_mes, cfg["tolerancia"], idioma=self.idioma)))
        iw, ih = img.getSize()
        aw = W - 2 * m
        espacio_tabla = 12 + 11 + 9.2 * min(len(resumen_mes), 18) + 20
        ah = min(aw * ih / iw * 0.72, max(90, y - (self.m + espacio_tabla)))
        if ah > 70:
            c.drawImage(img, m, y - ah, width=aw, height=ah, mask="auto")
            y -= ah + 8

        # Resumen por dia (todos los dias del mes; defrost es informativo)
        c.setFillColor(C_TXT)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(m, y, tx["dias_observaciones"])
        y -= 12
        c.setFillColor(C_HEAD)
        c.rect(m, y - 2, W - 2 * m, 11, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 6.8)
        xs = [m + 6, m + 90, m + 200, m + 320, m + 450]
        for xx, tt in zip(xs, [tx["col_dia"], tx["col_cumplimiento"], tx["col_h_rango"],
                               tx["col_h_defrost"], tx["kpi_retorno_medio"]]):
            c.drawString(xx, y + 1.5, tt)
        y -= 11
        c.setFillColor(C_TXT)
        c.setFont("Helvetica", 7)
        if resumen_mes.empty:
            c.drawString(m + 6, y, tx["sin_obs"])
        else:
            for i, (_, r) in enumerate(resumen_mes.iterrows()):
                if i % 2 == 0:
                    c.setFillColor(colors.HexColor("#f4f7f9"))
                    c.rect(m, y - 1.5, W - 2 * m, 9.2, stroke=0, fill=1)
                c.setFillColor(C_TXT)
                vals = [
                    str(r["dia"]),
                    f"{r['pct_en_rango']:.1f} %" if pd.notna(r["pct_en_rango"]) else "-",
                    f"{r['horas_en_rango']:.2f}",
                    f"{r['horas_defrost']:.2f}",
                    f"{r['return_air_med']:.1f}" if pd.notna(r["return_air_med"]) else "-",
                ]
                if bool(r.get("pendiente")):
                    vals = [str(r["dia"]), "Pendiente", "—", "—", "—"]
                for xx, v in zip(xs, vals):
                    c.drawString(xx, y + 1.2, v)
                y -= 9.2
                if y < self.m + 34:
                    c.drawString(m + 6, y, t(tx, "mas_obs", n=len(resumen_mes)))
                    break
        self.pie(total)
        self.c.showPage()

    def pagina_pendiente(self, unidad, dia, total=None):
        """Día retenido: sin temperaturas ni gráfica."""
        self.pag += 1
        tx = self.tx
        y = self.cabecera(
            tx["titulo_diario"],
            unidad,
            f"{tx['fecha']}: {dia:%d/%m/%Y}",
        )
        c, W, m = self.c, self.W, self.m
        alto = 70
        c.setFillColor(colors.HexColor("#f4f7f9"))
        c.roundRect(m, y - alto, W - 2 * m, alto, 6, stroke=0, fill=1)
        c.setFillColor(C_TXT)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(m + 14, y - 28, "Pendiente de procesar")
        c.setFont("Helvetica", 9)
        c.drawString(m + 14, y - 46, "Pendiente de procesar.")
        self.pie(total)
        self.c.showPage()

    def pagina_dia(self, unidad, dia, png, fila, rh, total=None):
        self.pag += 1
        tx = self.tx
        y = self.cabecera(
            tx["titulo_diario"],
            unidad,
            f"{tx['fecha']}: {dia:%d/%m/%Y}  |  Set point {fila['set_point']:.1f} C",
        )
        c, W, m = self.c, self.W, self.m

        y = self.kpis(y, [
            (tx["kpi_horas_rango"], f"{fila['horas_en_rango']:.1f} h", "#e7f4ea"),
            (tx["kpi_cumplimiento"],
             f"{fila['pct_en_rango']:.1f} %" if pd.notna(fila["pct_en_rango"]) else "-",
             "#e7f4ea"),
            (tx["kpi_horas_defrost"], f"{fila['horas_defrost']:.1f} h", "#fdf0e3"),
            (tx["kpi_defrost"], f"{fila['defrost_eventos']}", "#fdf0e3"),
            (tx["kpi_retorno_medio"], f"{fila['return_air_med']:.1f} C", "#eef3f7"),
        ])

        img = ImageReader(io.BytesIO(png))
        iw, ih = img.getSize()
        aw = W - 2 * m
        ah = aw * ih / iw
        c.drawImage(img, m, y - ah, width=aw, height=ah, mask="auto")
        y -= ah + 12

        c.setFillColor(C_TXT)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(m, y, tx["detalle_horario"])
        y -= 6
        y = self.tabla_horaria(y, rh)

        c.setFont("Helvetica", 6.6)
        c.setFillColor(colors.HexColor("#6b7a86"))
        c.drawString(m, max(y, self.m + 30), tx["leyenda_tabla"])
        self.pie(total)
        self.c.showPage()

    def guardar(self):
        self.c.save()


def _f(v):
    return "-" if v is None or (isinstance(v, float) and np.isnan(v)) else f"{v:.1f}"


def _wrap(txt, n):
    palabras, out, cur = txt.split(), [], ""
    for p in palabras:
        if len(cur) + len(p) + 1 > n:
            out.append(cur)
            cur = p
        else:
            cur = (cur + " " + p).strip()
    if cur:
        out.append(cur)
    return out
