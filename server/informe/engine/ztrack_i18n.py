"""
ztrack_i18n.py
==============
Cadenas de interfaz del informe PDF y graficas (es / en).
Los tramos completados se presentan al cliente como "tendencia de datos".
"""

from __future__ import annotations

TEXTOS = {
    "es": {
        "titulo_mensual": "RESUMEN MENSUAL",
        "titulo_diario": "REPORTE DIARIO DE TEMPERATURA",
        "informe_preliminar": "Informe preliminar",
        "equipo": "Equipo",
        "mes": "Mes",
        "periodo": "Periodo",
        "fecha": "Fecha",
        "pagina": "Pagina",
        "de": "de",
        "a": "a",
        "meses": [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
        ],
        "kpi_dias": "Dias del mes",
        "kpi_prom_rango": "Prom. horas en rango/dia",
        "kpi_cumplimiento_global": "Cumplimiento del mes",
        "kpi_defrost_dia": "Defrost/dia",
        "kpi_tendencia": "Datos de tendencia",
        "kpi_horas_rango": "Horas en rango",
        "kpi_cumplimiento": "Cumplimiento",
        "kpi_horas_defrost": "Horas en defrost",
        "kpi_defrost": "Defrost",
        "kpi_retorno_medio": "Retorno medio",
        "kpi_completitud": "Completitud",
        "nota_preliminar": "Nota sobre este informe preliminar",
        "criterio_sp": (
            "Set point programado: {sp:.1f} C.  "
            "Banda de conformidad: set point +/- {tol:.0f} C ({lo:.0f} a {hi:.0f} C)."
        ),
        "criterio_sensor": (
            "Sensor de conformidad: {sensor}. El sensor de suministro puede operar "
            "por debajo de la banda sin constituir desviacion (aire de impulsion)."
        ),
        "criterio_defrost": (
            "Ciclo de defrost automatico: cada {periodo:.2f} h, duracion mediana "
            "{dur:.0f} min, pico de evaporador {pico:.1f} C."
        ),
        "criterio_excluye": (
            "Las etapas de defrost se excluyen del computo de horas en rango: la elevacion del "
            "sensor de evaporador es producto de la resistencia, no una desviacion del producto."
        ),
        "nota_defrost_normal": (
            "Importante: el defrost no es una observacion ni una falla de funcionamiento. "
            "Forma parte del ciclo automatico normal de la maquina para garantizar un optimo "
            "funcionamiento y no compromete el producto interno. Por ello se reporta como "
            "informacion operativa y se excluye del calculo de cumplimiento."
        ),
        "resumen_analisis": "Resumen del analisis",
        "resumen_analisis_txt": (
            "En {mes}, el equipo opero {dias} dias con un cumplimiento de {cumpl:.2f} % "
            "(horas en rango excluyendo defrost y preparacion). Retorno medio del mes: "
            "{ret:.1f} C. Promedio de horas en rango/dia: {hr:.1f} h. Defrost automatico: "
            "{def_dia:.1f} eventos/dia (duracion mediana {dur:.0f} min), como parte del "
            "ciclo normal de la maquina. {prep_txt}"
        ),
        "resumen_prep_txt": (
            "Preparacion de arranque excluida del calculo: {prep:.1f} h "
            "(enfriamiento inicial hasta entrar en banda)."
        ),
        "criterio_tendencia": (
            "Algunos tramos se muestran como tendencia de datos, estimada a partir del "
            "comportamiento habitual del equipo. Aparecen sombreados en gris en las graficas "
            "y marcados con 'T' en las tablas."
        ),
        "dias_observaciones": "Resumen por dia",
        "col_dia": "Dia",
        "col_cumplimiento": "Cumplimiento",
        "col_h_rango": "Horas en rango",
        "col_h_defrost": "Horas en defrost",
        "col_h_sin_dato": "Horas sin dato",
        "col_pct_tendencia": "% tendencia",
        "mas_obs": "... ({n} dias en total)",
        "sin_obs": "Sin dias registrados en el periodo.",
        "aviso_tendencia": (
            "TENDENCIA: {pct:.0f} % de los registros de este dia corresponden a "
            "tendencia de datos."
        ),
        "detalle_horario": (
            "Detalle horario (valores medios excluyendo defrost y preparacion, en C)"
        ),
        "leyenda_tabla": (
            "Sum. = suministro | Ret. = retorno (sensor de conformidad) | "
            "Evap. = evaporador | Defr = minutos de defrost en la hora"
        ),
        "col_h": "H",
        "col_sum": "Sum.",
        "col_ret": "Ret.",
        "col_evap": "Evap.",
        "col_defr": "Defr",
        "col_estado": "Estado",
        "estado_en_rango": "EN RANGO",
        "estado_fuera": "FUERA",
        "estado_defrost": "DEFROST",
        "estado_preparacion": "PREPARACION",
        "estado_sin_dato": "SIN DATO",
        "banda_rango": "Banda en rango ({lo:.0f} a {hi:.0f} C)",
        "tramo_tendencia": "Tendencia de datos",
        "etapa_defrost": "Etapa de defrost",
        "etapa_preparacion": "Preparacion",
        "evaporador": "Evaporador",
        "suministro": "Suministro",
        "retorno": "Retorno",
        "retorno_control": "Retorno (control)",
        "temperatura": "Temperatura (C)",
        "hora_local": "Hora local",
        "horas_en_rango": "Horas en rango",
        "horas_fuera": "Horas fuera de rango",
        "horas_defrost": "Horas de defrost",
        "horas_preparacion": "Horas de preparacion",
        "sin_dato": "Sin dato",
        "horas_por_dia": "Horas por dia",
        "retorno_minmax": "Retorno min-max",
        "retorno_medio": "Retorno medio",
        "suministro_medio": "Suministro medio",
        "empresa_default": "ZGROUP SAC - Monitoreo de cadena de frio",
        "pie_izq_default": "ZGROUP SAC | Plataforma Ztrack de telemetria",
        "pie_centro_default": "Telemetria en vivo",
        "marca_tendencia": "T",
    },
    "en": {
        "titulo_mensual": "MONTHLY SUMMARY",
        "titulo_diario": "DAILY TEMPERATURE REPORT",
        "informe_preliminar": "Preliminary report",
        "equipo": "Unit",
        "mes": "Month",
        "periodo": "Period",
        "fecha": "Date",
        "pagina": "Page",
        "de": "of",
        "a": "to",
        "meses": [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ],
        "kpi_dias": "Days in month",
        "kpi_prom_rango": "Avg. hours in range/day",
        "kpi_cumplimiento_global": "Month compliance",
        "kpi_defrost_dia": "Defrost/day",
        "kpi_tendencia": "Trend data",
        "kpi_horas_rango": "Hours in range",
        "kpi_cumplimiento": "Compliance",
        "kpi_horas_defrost": "Hours in defrost",
        "kpi_defrost": "Defrost",
        "kpi_retorno_medio": "Mean return air",
        "kpi_completitud": "Completeness",
        "nota_preliminar": "Note on this preliminary report",
        "criterio_sp": (
            "Programmed set point: {sp:.1f} C.  "
            "Compliance band: set point +/- {tol:.0f} C ({lo:.0f} to {hi:.0f} C)."
        ),
        "criterio_sensor": (
            "Compliance sensor: {sensor}. The supply sensor may operate "
            "below the band without constituting a product deviation (discharge air)."
        ),
        "criterio_defrost": (
            "Automatic defrost cycle: every {periodo:.2f} h, median duration "
            "{dur:.0f} min, evaporator peak {pico:.1f} C."
        ),
        "criterio_excluye": (
            "Defrost stages are excluded from in-range hour counts: the evaporator "
            "temperature rise is caused by the heater, not a product deviation."
        ),
        "nota_defrost_normal": (
            "Important: defrost is not an observation or a malfunction. It is part of the "
            "machine's normal automatic cycle to ensure optimal operation and does not "
            "compromise the internal product. It is reported as operational information "
            "and excluded from the compliance calculation."
        ),
        "resumen_analisis": "Analysis summary",
        "resumen_analisis_txt": (
            "In {mes}, the unit operated {dias} days with {cumpl:.2f} % compliance "
            "(hours in range excluding defrost and startup preparation). Month mean "
            "return air: {ret:.1f} C. Average hours in range/day: {hr:.1f} h. Automatic "
            "defrost: {def_dia:.1f} events/day (median duration {dur:.0f} min), as part "
            "of the machine's normal cycle. {prep_txt}"
        ),
        "resumen_prep_txt": (
            "Startup preparation excluded from the calculation: {prep:.1f} h "
            "(initial cool-down until entering the band)."
        ),
        "criterio_tendencia": (
            "Some segments are shown as trend data, estimated from the unit's usual "
            "behavior. These segments appear shaded in gray on the charts and marked "
            "with 'T' in the tables."
        ),
        "dias_observaciones": "Daily summary",
        "col_dia": "Day",
        "col_cumplimiento": "Compliance",
        "col_h_rango": "Hours in range",
        "col_h_defrost": "Hours in defrost",
        "col_h_sin_dato": "Hours no data",
        "col_pct_tendencia": "% trend",
        "mas_obs": "... ({n} days in total)",
        "sin_obs": "No days recorded in the period.",
        "aviso_tendencia": (
            "TREND: {pct:.0f} % of this day's records are trend data."
        ),
        "detalle_horario": (
            "Hourly detail (mean values excluding defrost and preparation, in C)"
        ),
        "leyenda_tabla": (
            "Sup. = supply | Ret. = return (compliance sensor) | "
            "Evap. = evaporator | Defr = defrost minutes in the hour"
        ),
        "col_h": "H",
        "col_sum": "Sup.",
        "col_ret": "Ret.",
        "col_evap": "Evap.",
        "col_defr": "Defr",
        "col_estado": "Status",
        "estado_en_rango": "IN RANGE",
        "estado_fuera": "OUT",
        "estado_defrost": "DEFROST",
        "estado_preparacion": "PREP",
        "estado_sin_dato": "NO DATA",
        "banda_rango": "In-range band ({lo:.0f} to {hi:.0f} C)",
        "tramo_tendencia": "Trend data",
        "etapa_defrost": "Defrost stage",
        "etapa_preparacion": "Preparation",
        "evaporador": "Evaporator",
        "suministro": "Supply",
        "retorno": "Return",
        "retorno_control": "Return (control)",
        "temperatura": "Temperature (C)",
        "hora_local": "Local time",
        "horas_en_rango": "Hours in range",
        "horas_fuera": "Hours out of range",
        "horas_defrost": "Defrost hours",
        "horas_preparacion": "Preparation hours",
        "sin_dato": "No data",
        "horas_por_dia": "Hours per day",
        "retorno_minmax": "Return min-max",
        "retorno_medio": "Mean return",
        "suministro_medio": "Mean supply",
        "empresa_default": "ZGROUP SAC - Cold chain monitoring",
        "pie_izq_default": "ZGROUP SAC | Ztrack telemetry platform",
        "pie_centro_default": "Live telemetry",
        "marca_tendencia": "T",
    },
}


def normalizar_idiomas(valor) -> list[str]:
    """Acepta 'es', 'en', 'ambos', o lista ['es','en']."""
    if valor is None:
        return ["es", "en"]
    if isinstance(valor, (list, tuple)):
        langs = [str(v).lower().strip() for v in valor]
    else:
        v = str(valor).lower().strip()
        if v in ("ambos", "both", "all", "es,en", "en,es"):
            langs = ["es", "en"]
        else:
            langs = [v]
    out = []
    for lang in langs:
        if lang not in TEXTOS:
            raise ValueError(f"Idioma no soportado: {lang!r}. Use 'es', 'en' o 'ambos'.")
        if lang not in out:
            out.append(lang)
    return out or ["es", "en"]

ESTADO_CLAVE = {
    "EN RANGO": "estado_en_rango",
    "FUERA": "estado_fuera",
    "DEFROST": "estado_defrost",
    "PREPARACION": "estado_preparacion",
    "SIN DATO": "estado_sin_dato",
}


def get_textos(idioma: str) -> dict:
    lang = (idioma or "es").lower().strip()
    if lang not in TEXTOS:
        raise ValueError(f"Idioma no soportado: {idioma!r}. Use 'es' o 'en'.")
    return TEXTOS[lang]


def t(textos: dict, clave: str, **kwargs) -> str:
    s = textos[clave]
    return s.format(**kwargs) if kwargs else s


def nombre_mes(textos: dict, year: int, month: int) -> str:
    return f"{textos['meses'][month - 1]} {year}".capitalize()
