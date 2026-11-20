#!/usr/bin/env python3
"""
ztrack_main.py
==============
Programa principal.

Uso:
    python3 ztrack_main.py                          # usa config.json
    python3 ztrack_main.py --config mi_config.json
    python3 ztrack_main.py --solo SACRAMENTO1       # procesa un solo equipo
    python3 ztrack_main.py --desde 2026-03-01 --hasta 2026-03-31
    python3 ztrack_main.py --idioma ambos           # espanol e ingles (por defecto)
    python3 ztrack_main.py --idioma en              # solo ingles
    python3 ztrack_main.py --hueco-min 120           # reconstruir huecos > 2 h

Salidas (en la carpeta `salida` de la configuracion):
    Informe_<NOMBRE>.pdf              PDF en espanol
    Report_<NOMBRE>.pdf               PDF en ingles
    datos_completados_<NOMBRE>.csv    telemetria + tendencia de datos
    resumen_diario_<NOMBRE>.csv       metricas dia por dia
    huecos_<NOMBRE>.csv               tramos sin informacion detectados
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

import pandas as pd

from ztrack_core import (TEMP_MAX_VALIDA, TEMP_MIN_VALIDA, analisis_diario,
                         aplicar_ajustes_dia, cargar_csv, detectar_defrost,
                         limitar_horas_fuera,
                         detectar_huecos, estadistica_regimen, horario_defrost,
                         intervalo_nominal, limpiar_temperaturas, mascara_defrost,
                         mascara_preparacion, normalizar_zona, pesos_tiempo,
                         reconstruir_huecos, resumen_horario)
from ztrack_i18n import get_textos, normalizar_idiomas
from ztrack_informe import InformePDF, grafica_dia, quitar_telefonos

CONFIG_POR_DEFECTO = {
    "archivos": [
        "PROYECTOZTRACKAPI_SACRAMENTO1_OFICIAL_2026.csv",
        "PROYECTOZTRACKAPI_SACRAMENTO2_OFICIAL_2026.csv",
    ],
    "salida": "salida",
    # zona_csv: en que zona estan las horas del archivo
    # zona_informe / zona_horaria: en que zona se muestra el PDF
    "zona_csv": "UTC",
    "zona_informe": "America/Lima",
    "zona_horaria": "America/Lima",
    "idioma": "ambos",

    "tolerancia": 9.0,
    "sensor_control": "return_air",
    "sensores_acotados_a_banda": ["return_air"],
    "hueco_min_min": 120.0,

    "defrost_umbral_inicio": -8.0,
    "defrost_umbral_fin": -14.0,
    "defrost_duracion_max_min": 60.0,

    "reconstruir": True,
    "hueco_max_reconstruible_h": None,
    "semilla": 20260101,

    "dpi_grafica": 120,
    "logo": "logo_2.png",
    "marca": "ZTRACK",
    "empresa": "ZGROUP SAC - Monitoreo de cadena de frio",
    "pie_izquierdo": "ZGROUP SAC | Plataforma Ztrack de telemetria",
    "pie_centro": "Telemetria en vivo",

    # Mapa imei_original -> nombre personalizado (PDF y nombres de archivo)
    "nombres_equipos": {},
}


def cargar_config(ruta):
    cfg = dict(CONFIG_POR_DEFECTO)
    if ruta and os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as fh:
            cfg.update(json.load(fh))
    cfg["nombres_equipos"] = dict(cfg.get("nombres_equipos") or {})
    return cfg


def nombre_equipo(imei: str, cfg: dict) -> str:
    """Devuelve el nombre personalizado del equipo, o el IMEI si no hay alias."""
    mapa = cfg.get("nombres_equipos") or {}
    return str(mapa.get(imei, mapa.get(str(imei).upper(), imei)))


def slug_archivo(nombre: str) -> str:
    """Nombre seguro para archivos de salida."""
    s = re.sub(r"[^\w.\-]+", "_", str(nombre).strip(), flags=re.UNICODE)
    s = re.sub(r"_+", "_", s).strip("._")
    return s or "equipo"


def procesar(ruta_csv, cfg, desde=None, hasta=None, nombre_override=None,
             log=print):
    """Procesa un CSV y genera PDFs/CSV. Devuelve un dict con rutas y metricas."""
    log(f"\n=== {os.path.basename(ruta_csv)}")
    zona_csv = normalizar_zona(cfg.get("zona_csv"), "UTC")
    zona_informe = normalizar_zona(
        cfg.get("zona_informe") or cfg.get("zona_horaria"), "America/Lima")
    tmin = float(cfg.get("temp_min_valida", TEMP_MIN_VALIDA))
    tmax = float(cfg.get("temp_max_valida", TEMP_MAX_VALIDA))
    df = cargar_csv(ruta_csv, zona_informe=zona_informe, zona_csv=zona_csv,
                    sensor_min=tmin, sensor_max=tmax)
    df = aplicar_ajustes_dia(df, cfg.get("ajustes_dia") or [], float(cfg["tolerancia"]))
    if df.empty or df["set_point"].dropna().empty:
        raise ValueError("El archivo no tiene datos termicos utilizables (set_point vacio).")
    imei = str(df["imei"].iloc[0])
    if nombre_override:
        cfg = dict(cfg)
        cfg["nombres_equipos"] = dict(cfg.get("nombres_equipos") or {})
        cfg["nombres_equipos"][imei] = str(nombre_override).strip()
    unidad = quitar_telefonos(nombre_equipo(imei, cfg))
    etiqueta = slug_archivo(unidad)
    intervalo = intervalo_nominal(df)
    set_point = float(df["set_point"].median())
    log(f"    imei={imei}  nombre={unidad}  registros={len(df)}  "
        f"intervalo={intervalo:.2f} min  set_point={set_point:.1f} C")
    log(f"    zona_csv={zona_csv}  zona_informe={zona_informe}  "
        f"primera_marca={df['fecha'].iloc[0]}")
    log(f"    temperaturas validas: {tmin:.0f} a {tmax:.0f} C "
        f"(outliers excluidos de analisis y graficas)")

    # --- comportamiento del equipo ---
    banda = (set_point - cfg["tolerancia"], set_point + cfg["tolerancia"])
    eventos = detectar_defrost(df,
                               cfg["defrost_umbral_inicio"],
                               cfg["defrost_umbral_fin"],
                               cfg["defrost_duracion_max_min"],
                               sensor_recuperacion=cfg["sensor_control"],
                               banda=banda)
    mask = mascara_defrost(df["fecha"], eventos)
    perfil = horario_defrost(eventos)
    estad = estadistica_regimen(df, mask)
    log(f"    defrost reales={len(eventos)}  periodo={perfil['periodo_h']:.2f} h  "
        f"duracion mediana={perfil['duracion_med_min']:.0f} min")

    # --- huecos ---
    huecos = detectar_huecos(df, cfg["hueco_min_min"])
    log(f"    huecos > {cfg['hueco_min_min']:.0f} min = {len(huecos)}  "
        f"({huecos['duracion_h'].sum():.1f} h)" if len(huecos) else "    sin huecos")

    # --- reconstruccion ---
    lim = cfg.get("hueco_max_reconstruible_h")
    a_rellenar = huecos if not lim else huecos[huecos["duracion_h"] <= lim]
    if lim and len(a_rellenar) < len(huecos):
        log(f"    [aviso] {len(huecos)-len(a_rellenar)} hueco(s) superan el limite de "
            f"{lim} h y NO se reconstruyen")

    filas_recon = 0
    if cfg["reconstruir"] and len(a_rellenar):
        try:
            nuevos = reconstruir_huecos(df, a_rellenar, eventos, mask, intervalo,
                                        cfg["sensor_control"], cfg["tolerancia"],
                                        set_point, cfg["sensores_acotados_a_banda"],
                                        estad, cfg["semilla"])
            filas_recon = len(nuevos)
            log(f"    filas reconstruidas={filas_recon}")
            df = (pd.concat([df, nuevos], ignore_index=True)
                    .sort_values("fecha").reset_index(drop=True))
            eventos = detectar_defrost(df,
                                       cfg["defrost_umbral_inicio"],
                                       cfg["defrost_umbral_fin"],
                                       cfg["defrost_duracion_max_min"],
                                       sensor_recuperacion=cfg["sensor_control"],
                                       banda=banda)
            mask = mascara_defrost(df["fecha"], eventos)
        except RuntimeError as exc:
            log(f"    [aviso] no se pudo reconstruir: {exc}")

    # Reaplicar limpieza por si la tendencia genero valores fuera de rango
    df = limpiar_temperaturas(df, sensor_min=tmin, sensor_max=tmax)

    # --- filtro de periodo ---
    if desde:
        df = df[df["fecha"].dt.date >= pd.Timestamp(desde).date()]
    if hasta:
        df = df[df["fecha"].dt.date <= pd.Timestamp(hasta).date()]
    df = df.reset_index(drop=True)
    if df.empty or df["set_point"].dropna().empty:
        raise ValueError("No hay telemetría oficial en ese rango para este equipo")
    mask = mascara_defrost(df["fecha"], eventos)
    mask_prep = mascara_preparacion(
        df, cfg["sensor_control"], cfg["tolerancia"], set_point,
        gap_min_min=float(cfg.get("hueco_min_min", 60.0)),
        duracion_max_h=float(cfg.get("preparacion_max_h", 8.0)),
    )
    h_prep = float(pesos_tiempo(df["fecha"])[mask_prep].sum())
    log(f"    preparacion (arranque)={h_prep:.2f} h excluidas del cumplimiento")

    # Perfil de defrost para el informe: sin falsos positivos del arranque
    if len(eventos) and mask_prep.any():
        keep_ev = []
        for _, e in eventos.iterrows():
            m = ((df["fecha"] >= e["inicio"]) & (df["fecha"] <= e["fin"])).to_numpy()
            keep_ev.append(True if not m.any() else float(mask_prep[m].mean()) < 0.5)
        eventos_inf = eventos.loc[keep_ev].reset_index(drop=True)
    else:
        eventos_inf = eventos
    perfil = horario_defrost(eventos_inf)

    df = limitar_horas_fuera(
        df, cfg.get("ajustes_dia") or [], float(cfg["tolerancia"]), mask, mask_prep
    )
    # --- analisis diario ---
    resumen = analisis_diario(df, eventos_inf, mask, cfg["sensor_control"],
                              cfg["tolerancia"], intervalo, mask_prep=mask_prep)
    umbral = cfg.get("umbral_horas_fuera")
    resumen["pendiente"] = False
    if umbral not in (None, ""):
        resumen["pendiente"] = resumen["horas_fuera_rango"] > float(umbral)
    n_pend = int(resumen["pendiente"].sum()) if len(resumen) else 0
    log(f"    dias analizados={len(resumen)}  "
        f"promedio horas en rango/dia={resumen['horas_en_rango'].mean():.2f} h  "
        f"cumplimiento={resumen['pct_en_rango'].mean():.2f} %  "
        f"pendientes={n_pend}")

    # --- salidas ---
    os.makedirs(cfg["salida"], exist_ok=True)
    rutas = {
        "datos": f"{cfg['salida']}/datos_completados_{etiqueta}.csv",
        "resumen": f"{cfg['salida']}/resumen_diario_{etiqueta}.csv",
        "pdfs": [],
    }
    df.to_csv(rutas["datos"], index=False)
    resumen.to_csv(rutas["resumen"], index=False)
    if len(huecos):
        rutas["huecos"] = f"{cfg['salida']}/huecos_{etiqueta}.csv"
        huecos.to_csv(rutas["huecos"], index=False)

    # --- informes PDF: portada por mes + pagina por dia (es y/o en) ---
    idiomas = normalizar_idiomas(cfg.get("idioma"))
    res = resumen.copy()
    res["_ym"] = pd.to_datetime(res["dia"]).dt.to_period("M")
    periodos = sorted(res["_ym"].unique())
    total = len(periodos) + len(res)

    for idioma in idiomas:
        cfg_lang = dict(cfg)
        cfg_lang["idioma"] = idioma
        tx = get_textos(idioma)
        if idioma == "en":
            if cfg_lang.get("pie_centro") in (
                None, "", CONFIG_POR_DEFECTO["pie_centro"], "Telemetria en vivo",
                "Informe preliminar - documento generado automaticamente",
            ):
                cfg_lang["pie_centro"] = tx["pie_centro_default"]
            if cfg_lang.get("pie_izquierdo") in (
                None, "", CONFIG_POR_DEFECTO["pie_izquierdo"],
            ):
                cfg_lang["pie_izquierdo"] = tx["pie_izq_default"]
            if cfg_lang.get("empresa") in (None, "", CONFIG_POR_DEFECTO["empresa"]):
                cfg_lang["empresa"] = tx["empresa_default"]
        else:
            if cfg_lang.get("pie_centro") in (
                None, "", "Live telemetry",
                "Preliminary report - automatically generated document",
            ):
                cfg_lang["pie_centro"] = tx["pie_centro_default"]

        prefijo = "Report" if idioma == "en" else "Informe"
        ruta_pdf = f"{cfg['salida']}/{prefijo}_{etiqueta}.pdf"
        pdf = InformePDF(ruta_pdf, cfg_lang)

        escribio = False
        for periodo in periodos:
            mes_df = res[res["_ym"] == periodo].drop(columns="_ym")
            publicado = mes_df[~mes_df["pendiente"].astype(bool)]
            if publicado.empty:
                continue
            escribio = True
            pdf.portada_mensual(unidad, periodo.year, periodo.month, publicado,
                                perfil, cfg_lang, total)
            for _, fila in publicado.iterrows():
                dia = fila["dia"]
                rh = resumen_horario(df, mask, dia, cfg["sensor_control"],
                                     cfg["tolerancia"], intervalo,
                                     mask_prep=mask_prep)
                png = grafica_dia(df, mask, dia, cfg["sensor_control"],
                                  cfg["tolerancia"], intervalo,
                                  dpi=cfg["dpi_grafica"], idioma=idioma,
                                  mask_prep=mask_prep)
                pdf.pagina_dia(unidad, dia, png, fila, rh, total)
        if not escribio and idioma == "es" and len(res):
            dia0 = pd.Timestamp(res["dia"].iloc[0]).to_pydatetime()
            pdf.pagina_pendiente(unidad, dia0, total)
            escribio = True
        if escribio:
            pdf.guardar()
            rutas["pdfs"].append(ruta_pdf)
            log(f"    -> {ruta_pdf}  ({total} paginas, {len(periodos)} meses, idioma={idioma})")

        if idioma == "es":
            for _, fila in res[res["pendiente"].astype(bool)].iterrows():
                dia = pd.Timestamp(fila["dia"]).to_pydatetime()
                marca = pd.Timestamp(fila["dia"]).strftime("%Y-%m-%d")
                ruta_p = f"{cfg['salida']}/Pendiente_{etiqueta}_{marca}.pdf"
                blanco = InformePDF(ruta_p, cfg_lang)
                blanco.pagina_pendiente(unidad, dia, 1)
                blanco.guardar()
                rutas["pdfs"].append(ruta_p)
                log(f"    -> {ruta_p}  (dia retenido)")

    return {
        "imei": imei,
        "nombre": unidad,
        "etiqueta": etiqueta,
        "registros": int(len(df)),
        "set_point": set_point,
        "dias": int(len(resumen)),
        "meses": int(len(periodos)),
        "paginas": int(total),
        "filas_reconstruidas": int(filas_recon),
        "huecos": int(len(huecos)),
        "cumplimiento": float(resumen["pct_en_rango"].mean()),
        "horas_en_rango_prom": float(resumen["horas_en_rango"].mean()),
        "horas_fuera_rango": float(resumen["horas_fuera_rango"].sum()) if len(resumen) else 0.0,
        "horas_defrost": float(resumen["horas_defrost"].sum()) if len(resumen) else 0.0,
        "dias_detalle": [
            {
                "dia": pd.Timestamp(r["dia"]).strftime("%Y-%m-%d"),
                "horas_fuera_rango": float(r["horas_fuera_rango"]),
                "horas_defrost": float(r["horas_defrost"]),
                "horas_fuera_total": float(r["horas_fuera_rango"]) + float(r["horas_defrost"]),
                "pendiente": bool(r["pendiente"]),
            }
            for _, r in resumen.iterrows()
        ],
        "archivos": rutas,
        "idiomas": idiomas,
    }


def resolver_ruta_csv(ruta: str) -> str:
    """Busca el CSV en la ruta dada, en ./data o en ./uploads."""
    candidatos = [
        ruta,
        os.path.join("data", os.path.basename(ruta)),
        os.path.join("uploads", os.path.basename(ruta)),
        os.path.join("data", ruta),
        os.path.join("uploads", ruta),
    ]
    for c in candidatos:
        if c and os.path.exists(c):
            return c
    raise FileNotFoundError(f"No se encontro el archivo CSV: {ruta}")


def main():
    ap = argparse.ArgumentParser(description="Analisis de telemetria Ztrack")
    ap.add_argument("--config", default="config.json")
    ap.add_argument("--archivo", default=None,
                    help="CSV concreto a procesar (ruta o nombre en data/)")
    ap.add_argument("--solo", default=None, help="procesar solo el equipo indicado")
    ap.add_argument("--desde", default=None)
    ap.add_argument("--hasta", default=None)
    ap.add_argument("--sin-reconstruir", action="store_true")
    ap.add_argument("--idioma", choices=["es", "en", "ambos"], default=None,
                    help="idioma del informe PDF (es|en|ambos)")
    ap.add_argument("--hueco-min", type=float, default=None,
                    help="minutos minimos de hueco a reconstruir (ej. 120 = 2 h)")
    ap.add_argument("--nombre", action="append", default=None, metavar="IMEI=NOMBRE",
                    help="alias de equipo, repetible: --nombre SACRAMENTO1='Cold Room A'")
    ap.add_argument("--nombre-equipo", default=None,
                    help="nombre personalizado del equipo del --archivo")
    ap.add_argument("--zona-csv", default=None,
                    help="zona horaria de las marcas del CSV (ej. UTC, America/Lima, GMT-5)")
    ap.add_argument("--zona-informe", default=None,
                    help="zona horaria del PDF (ej. America/Lima, GMT-5)")
    args = ap.parse_args()

    cfg = cargar_config(args.config)
    if args.sin_reconstruir:
        cfg["reconstruir"] = False
    if args.idioma:
        cfg["idioma"] = args.idioma
    if args.hueco_min is not None:
        cfg["hueco_min_min"] = float(args.hueco_min)
    if args.zona_csv:
        cfg["zona_csv"] = args.zona_csv
    if args.zona_informe:
        cfg["zona_informe"] = args.zona_informe
        cfg["zona_horaria"] = args.zona_informe
    if args.nombre:
        for item in args.nombre:
            if "=" not in item:
                sys.exit(f"Formato invalido en --nombre: {item!r}. Use IMEI=NOMBRE")
            imei, nom = item.split("=", 1)
            cfg["nombres_equipos"][imei.strip()] = nom.strip()

    normalizar_idiomas(cfg.get("idioma"))

    if args.archivo:
        ruta = resolver_ruta_csv(args.archivo)
        procesar(ruta, cfg, args.desde, args.hasta,
                 nombre_override=args.nombre_equipo)
        return

    archivos = [a for a in cfg["archivos"]
                if args.solo is None or args.solo.upper() in a.upper()]
    if not archivos:
        sys.exit("No hay archivos que procesar.")

    for a in archivos:
        try:
            ruta = resolver_ruta_csv(a)
        except FileNotFoundError:
            print(f"[aviso] no existe: {a}")
            continue
        procesar(ruta, cfg, args.desde, args.hasta)


if __name__ == "__main__":
    main()
