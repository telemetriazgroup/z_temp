"""
ztrack_core.py
==============
Motor de analisis de telemetria de cadena de frio (ZGROUP SAC / Ztrack).

Responsabilidades:
  1. Carga y normalizacion de los CSV de telemetria.
  2. Caracterizacion del comportamiento del equipo (ciclo de defrost, regimen
     estable, dispersion de cada sensor).
  3. Deteccion de huecos de informacion mayores al umbral configurado.
  4. Reconstruccion (auto-completado) de esos huecos con datos coherentes:
     - perfil tomado de dias reales "donantes" del mismo equipo,
     - defrost re-insertados segun el horario real estimado del equipo,
     - empalme suave con el dato real anterior y posterior,
     - acotado dentro de la banda de rango (set_point +/- tolerancia).
  5. Analisis dia por dia: horas en rango excluyendo defrost, resumen horario.

Toda fila reconstruida queda marcada en la columna `origen` = 'reconstruido'.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

SENSORES = ["temp_supply_1", "return_air", "evaporation_coil"]

# Rango fisico valido para telemetria de cadena de frio (fuera = outlier / NaN)
TEMP_MIN_VALIDA = -40.0
TEMP_MAX_VALIDA = 50.0

_EPOCH = pd.Timestamp("1970-01-01", tz="UTC")


def epoch_s(idx) -> np.ndarray:
    """Segundos desde epoch, independiente de la resolucion interna de pandas."""
    return (pd.DatetimeIndex(idx) - _EPOCH).total_seconds().to_numpy(dtype=float)


# ---------------------------------------------------------------------------
# 1. CARGA Y NORMALIZACION
# ---------------------------------------------------------------------------
# Alias frecuentes para la UI / config
_ZONAS_ALIAS = {
    "gmt-5": "America/Lima",
    "gmt5": "America/Lima",
    "utc-5": "America/Lima",
    "utc−5": "America/Lima",
    "lima": "America/Lima",
    "peru": "America/Lima",
    "america/lima": "America/Lima",
    "utc": "UTC",
    "gmt": "UTC",
    "gmt+0": "UTC",
    "utc+0": "UTC",
}


def normalizar_zona(zona: str | None, default: str = "America/Lima") -> str:
    """Normaliza alias (GMT-5, UTC, Lima...) a un IANA timezone."""
    if not zona or not str(zona).strip():
        return default
    z = str(zona).strip()
    return _ZONAS_ALIAS.get(z.lower(), z)


def limpiar_temperaturas(df: pd.DataFrame,
                         sensor_min: float = TEMP_MIN_VALIDA,
                         sensor_max: float = TEMP_MAX_VALIDA,
                         columnas: list | None = None) -> pd.DataFrame:
    """Pone NaN en sensores fuera del rango valido [-40, 50] por defecto."""
    out = df.copy()
    cols = columnas or SENSORES
    for c in cols:
        if c not in out.columns:
            continue
        v = pd.to_numeric(out[c], errors="coerce")
        out[c] = v.where((v >= sensor_min) & (v <= sensor_max))
    return out


def cargar_csv(ruta: str,
               zona_informe: str = "America/Lima",
               zona_csv: str | None = None,
               zona_horaria: str | None = None,
               sensor_min: float = TEMP_MIN_VALIDA,
               sensor_max: float = TEMP_MAX_VALIDA) -> pd.DataFrame:
    """Lee un CSV de telemetria y lo normaliza a la zona del informe.

    Parametros
    ----------
    zona_csv : zona horaria real de las marcas de tiempo del archivo.
        Ej.: si el CSV esta en hora Lima (GMT-5) aunque diga 'Z', use America/Lima.
        Por defecto UTC (comportamiento historico: timestamps ISO con Z = UTC).
    zona_informe : zona en la que se muestran fechas/horas del PDF.
        Por defecto America/Lima (GMT-5).
    zona_horaria : alias legado de zona_informe.

    Valores de sensor fuera de [sensor_min, sensor_max] se tratan como NaN.
    """
    df = pd.read_csv(ruta)

    faltantes = [c for c in SENSORES + ["set_point", "power_state", "imei", "fecha"]
                 if c not in df.columns]
    if faltantes:
        raise ValueError(f"El archivo {ruta} no tiene las columnas: {faltantes}")

    zona_out = normalizar_zona(zona_informe or zona_horaria, "America/Lima")
    zona_in = normalizar_zona(zona_csv, "UTC")

    # Reloj de pared del CSV (se ignora la etiqueta Z/offset del string) e
    # interpretacion en zona_csv; luego conversion a zona_informe.
    texto = df["fecha"].astype(str).str.strip()
    texto = texto.str.replace(r"(Z|[+-]\d{2}:?\d{2})$", "", regex=True)
    pared = pd.to_datetime(texto, format="mixed")
    local_csv = pared.dt.tz_localize(zona_in, ambiguous="infer", nonexistent="shift_forward")
    df["fecha"] = local_csv.dt.tz_convert(zona_out)

    for c in SENSORES + ["set_point"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = limpiar_temperaturas(df, sensor_min=sensor_min, sensor_max=sensor_max)

    df = (df.sort_values("fecha")
            .drop_duplicates(subset="fecha")
            .reset_index(drop=True))

    # Filas sin ningun sensor util ni set_point se conservan para detectar huecos,
    # pero set_point se rellena con la mediana del archivo si falta.
    sp = df["set_point"].dropna()
    if len(sp):
        df["set_point"] = df["set_point"].fillna(float(sp.median()))

    df["origen"] = "real"
    return df


def intervalo_nominal(df: pd.DataFrame) -> float:
    """Intervalo tipico de muestreo, en minutos (mediana de las diferencias)."""
    d = df["fecha"].diff().dt.total_seconds().dropna() / 60.0
    d = d[(d > 0) & (d < 60)]
    return float(d.median()) if len(d) else 2.0


# ---------------------------------------------------------------------------
# 2. DETECCION DE DEFROST
# ---------------------------------------------------------------------------
def detectar_defrost(df: pd.DataFrame,
                     umbral_inicio: float = -8.0,
                     umbral_fin: float = -14.0,
                     duracion_max_min: float = 60.0,
                     union_min: float = 20.0,
                     sensor_recuperacion: str | None = None,
                     banda: tuple | None = None) -> pd.DataFrame:
    """
    Detecta las etapas de defrost usando el sensor de evaporador.

    El defrost se reconoce porque la resistencia eleva la temperatura del
    evaporador muy por encima de su linea base. El evento se define como:
      inicio : primer punto de la rampa ascendente que supera `umbral_inicio`
      fin    : cuando el evaporador vuelve a bajar de `umbral_fin`
    y se acota a `duracion_max_min` (el equipo no mantiene resistencia mas de
    1 hora). Eventos separados por menos de `union_min` se fusionan.

    Si se indica `sensor_recuperacion` y `banda`, la etapa se prolonga hasta
    que ese sensor vuelve a entrar en banda: la cola de recuperacion posterior
    al defrost tampoco debe computarse como desviacion del producto.

    Devuelve un DataFrame con columnas: inicio, fin, duracion_min, pico_coil.
    """
    vacio = pd.DataFrame(
        {
            "inicio": pd.Series([], dtype="datetime64[ns, UTC]"),
            "fin": pd.Series([], dtype="datetime64[ns, UTC]"),
            "duracion_min": pd.Series([], dtype=float),
            "pico_coil": pd.Series([], dtype=float),
        }
    )
    coil = df["evaporation_coil"].to_numpy(dtype=float)
    t = df["fecha"].reset_index(drop=True)
    n = len(df)
    if n == 0 or not np.any(np.nan_to_num(coil, nan=-99.0) > umbral_inicio):
        return vacio

    nucleo = np.nan_to_num(coil, nan=-99.0) > umbral_inicio

    # Agrupar nucleos contiguos
    cambios = np.flatnonzero(np.diff(nucleo.astype(int)))
    bordes = np.r_[0, cambios + 1, n]
    bloques = [(bordes[i], bordes[i + 1]) for i in range(len(bordes) - 1)
               if nucleo[bordes[i]]]

    eventos = []
    for ini, fin in bloques:
        # Extender hacia atras: buscar el arranque de la rampa
        i = ini
        while i > 0 and (np.isnan(coil[i - 1]) or coil[i - 1] > umbral_fin):
            i -= 1
            if (t.iloc[ini] - t.iloc[i]).total_seconds() / 60 > duracion_max_min / 2:
                break
        # Extender hacia adelante: hasta que el evaporador recupere
        j = fin - 1
        while j < n - 1 and (np.isnan(coil[j + 1]) or coil[j + 1] > umbral_fin):
            j += 1
            if (t.iloc[j] - t.iloc[i]).total_seconds() / 60 > duracion_max_min:
                break
        # Extender hasta que el sensor de conformidad recupere la banda
        if sensor_recuperacion and banda is not None:
            ctrl = df[sensor_recuperacion].to_numpy(dtype=float)
            while j < n - 1 and (t.iloc[j] - t.iloc[i]).total_seconds() / 60 < duracion_max_min:
                v = ctrl[j + 1]
                if np.isnan(v) or v < banda[0] or v > banda[1]:
                    j += 1
                else:
                    break
        eventos.append([i, j])

    # Fusionar eventos cercanos
    fusionados = []
    for ev in eventos:
        if fusionados and (t.iloc[ev[0]] - t.iloc[fusionados[-1][1]]).total_seconds() / 60 <= union_min:
            fusionados[-1][1] = max(fusionados[-1][1], ev[1])
        else:
            fusionados.append(ev)

    filas = []
    for i, j in fusionados:
        dur = (t.iloc[j] - t.iloc[i]).total_seconds() / 60
        if dur > duracion_max_min:            # recorte duro a 1 hora
            lim = t.iloc[i] + pd.Timedelta(minutes=duracion_max_min)
            j = max(i, int(t.searchsorted(lim, side="right")) - 1)
            dur = (t.iloc[j] - t.iloc[i]).total_seconds() / 60
        filas.append({
            "inicio": t.iloc[i],
            "fin": t.iloc[j],
            "duracion_min": float(dur),
            "pico_coil": float(np.nanmax(coil[i:j + 1])) if j >= i else np.nan,
        })

    if not filas:
        return vacio
    ev = pd.DataFrame(filas)
    # Se conservan tambien los eventos de una sola muestra: cuando el muestreo
    # se degrada, un unico registro con el evaporador por encima del umbral
    # sigue siendo un defrost y no debe computarse como desviacion.
    return ev.reset_index(drop=True)


def mascara_defrost(fechas: pd.Series, eventos: pd.DataFrame,
                    margen_min: float = 0.0) -> np.ndarray:
    """Vector booleano: True si la marca de tiempo cae dentro de un defrost."""
    m = np.zeros(len(fechas), dtype=bool)
    if eventos.empty or len(fechas) == 0:
        return m
    f = pd.DatetimeIndex(fechas)
    orden = np.argsort(f.values)
    fo = f[orden]
    marg = pd.Timedelta(minutes=margen_min)
    ini = fo.searchsorted(pd.DatetimeIndex(eventos["inicio"]) - marg, side="left")
    fin = fo.searchsorted(pd.DatetimeIndex(eventos["fin"]) + marg, side="right")
    ms = np.zeros(len(fo), dtype=bool)
    for a, b in zip(ini, fin):
        ms[a:b] = True
    m[orden] = ms
    return m


# ---------------------------------------------------------------------------
# 3. PERFIL DE COMPORTAMIENTO DEL EQUIPO
# ---------------------------------------------------------------------------
def horario_defrost(eventos: pd.DataFrame) -> dict:
    """
    Estima el periodo y la fase del ciclo de defrost programado del equipo.
    Usa la mediana de separacion entre arranques y una media circular para la
    fase, de modo que los defrost sinteticos caigan donde el equipo realmente
    los ejecuta.
    """
    if len(eventos) < 3:
        return {"periodo_h": 6.0, "fase_s": 0.0, "duracion_med_min": 25.0}

    ini = epoch_s(eventos["inicio"])                             # segundos epoch
    sep = np.diff(ini)
    sep = sep[(sep > 3600) & (sep < 24 * 3600)]
    periodo = float(np.median(sep)) if len(sep) else 4 * 3600

    ang = 2 * np.pi * (ini % periodo) / periodo
    fase = periodo * ((np.angle(np.mean(np.exp(1j * ang)))) % (2 * np.pi)) / (2 * np.pi)

    return {
        "periodo_h": periodo / 3600.0,
        "fase_s": float(fase),
        "duracion_med_min": float(eventos["duracion_min"].median()),
        "pico_coil_med": float(eventos["pico_coil"].median()),
        "eventos_por_dia": 24.0 / (periodo / 3600.0),
    }


def plantilla_defrost(df: pd.DataFrame, eventos: pd.DataFrame,
                      n_puntos: int = 60) -> dict:
    """
    Construye el perfil mediano (forma de onda) de un defrost real del equipo,
    normalizado en el tiempo. Es lo que se re-inyecta en los tramos
    reconstruidos para que lleven "los defrost que les corresponden".
    """
    xi = np.linspace(0.0, 1.0, n_puntos)
    acum = {c: [] for c in SENSORES}

    for _, e in eventos.iterrows():
        seg = df[(df["fecha"] >= e["inicio"]) & (df["fecha"] <= e["fin"])]
        if len(seg) < 5:
            continue
        x = (seg["fecha"] - e["inicio"]).dt.total_seconds().to_numpy()
        if x[-1] <= 0:
            continue
        x = x / x[-1]
        for c in SENSORES:
            v = seg[c].to_numpy(dtype=float)
            ok = ~np.isnan(v)
            if ok.sum() < 4:
                continue
            acum[c].append(np.interp(xi, x[ok], v[ok]))

    return {c: np.median(np.vstack(v), axis=0)
            for c, v in acum.items() if len(v) >= 3}


def estadistica_regimen(df: pd.DataFrame, mask_def: np.ndarray) -> dict:
    """Estadistica del regimen normal (fuera de defrost) de cada sensor."""
    base = df[~mask_def]
    est = {}
    for c in SENSORES:
        v = base[c].dropna()
        if v.empty:
            continue
        est[c] = {
            "media": float(v.mean()),
            "std": float(v.std()),
            "p01": float(v.quantile(0.01)),
            "p99": float(v.quantile(0.99)),
            "min": float(v.min()),
            "max": float(v.max()),
            "ruido": float(v.diff().abs().median()),
        }
    return est


# ---------------------------------------------------------------------------
# 4. HUECOS
# ---------------------------------------------------------------------------
def pesos_tiempo(fechas: pd.Series, cap_min: float = 60.0) -> np.ndarray:
    """
    Duracion (en horas) que representa cada muestra: distancia hasta la
    siguiente marca de tiempo, acotada a `cap_min`. Permite integrar horas
    reales en rango / en defrost aunque el muestreo sea irregular o falten
    muestras sueltas, en vez de contar registros.
    """
    if len(fechas) == 0:
        return np.array([])
    d = fechas.diff().shift(-1).dt.total_seconds().to_numpy(dtype=float) / 3600.0
    med = np.nanmedian(d[d > 0]) if np.any(d > 0) else cap_min / 60.0
    d[-1] = med
    d = np.nan_to_num(d, nan=med)
    return np.clip(d, 0.0, cap_min / 60.0)


def aplicar_ajustes_dia(df: pd.DataFrame, ajustes, tolerancia: float) -> pd.DataFrame:
    """Ajusta solo la copia del informe. La telemetría de origen no se modifica.

    bajar_c resta grados a retorno y suministro de ese día.
    """
    if not ajustes:
        return df
    df = df.copy()
    for aj in ajustes:
        bajar = aj.get("bajar_c")
        if bajar in (None, ""):
            continue
        dia = pd.Timestamp(aj["dia"]).date()
        mask = df["fecha"].dt.date == dia
        if not mask.any():
            continue
        delta = float(bajar)
        if not df.loc[mask, "set_point"].notna().any():
            continue
        sp = float(df.loc[mask, "set_point"].median())
        hi = sp + float(tolerancia)
        for col in ("return_air", "temp_supply_1"):
            if col not in df.columns:
                continue
            calientes = mask & df[col].notna() & (df[col] > hi)
            if not calientes.any():
                continue
            df.loc[calientes, col] = (df.loc[calientes, col] - delta).clip(lower=sp)
    return df


def _perfil_en_rango(df, mask_defrost, mask_prep, lo, hi, dia_objetivo):
    """Muestras reales con el retorno ya en banda, para copiar ese régimen.

    El mismo día manda si ya tuvo un tramo en rango. Si no, se usa el otro día
    del equipo con más muestras reales en rango. Lo reconstruido no se copia:
    una línea de tendencia no es un comportamiento del equipo.
    """
    por_dia = {}
    for pos, idx in enumerate(df.index):
        if bool(mask_defrost[pos]) or bool(mask_prep[pos]):
            continue
        if "origen" in df.columns and df.at[idx, "origen"] == "reconstruido":
            continue
        v = df.at[idx, "return_air"]
        if pd.isna(v) or not (lo <= float(v) <= hi):
            continue
        ts = df.at[idx, "fecha"]
        dia = ts.date()
        minuto = int(ts.hour) * 60 + int(ts.minute)
        por_dia.setdefault(dia, []).append((minuto, idx))
    mismo = por_dia.get(dia_objetivo) or []
    if len(mismo) >= 12:
        elegido = mismo
    else:
        otros = [v for d, v in por_dia.items() if d != dia_objetivo]
        elegido = max(otros, key=len) if otros else mismo
    if not elegido:
        return None
    elegido = sorted(elegido, key=lambda item: item[0])
    return np.array([m for m, _ in elegido]), [idx for _, idx in elegido]


def _copiar_regimen(df, idx, donor_idx):
    """Copia retorno, suministro y evaporador de una muestra real en rango."""
    for col in SENSORES:
        if col not in df.columns:
            continue
        val = df.at[donor_idx, col]
        if pd.notna(val):
            df.at[idx, col] = val


def _acercar_trio(df, indices, lo, hi, sp):
    """Sin un día donante, desplaza el tramo entero para meterlo en banda.

    Un solo desplazamiento conserva la forma y la diferencia entre sensores.
    Cada muestra no se clava en el setpoint.
    """
    vals = [float(df.at[idx, "return_air"]) for idx in indices if pd.notna(df.at[idx, "return_air"])]
    if not vals:
        return
    vmin, vmax = min(vals), max(vals)
    margen = min(0.4, (hi - lo) * 0.05)
    if vmax >= vmin:
        delta = (hi - margen) - vmax
        if vmin + delta < lo + margen:
            delta = sp - (vmin + vmax) / 2.0
    else:
        delta = 0.0
    for idx in indices:
        for col in SENSORES:
            if col not in df.columns:
                continue
            val = df.at[idx, col]
            if pd.isna(val):
                continue
            nuevo = float(val) + delta
            if col == "return_air":
                nuevo = min(hi, max(lo, nuevo))
            df.at[idx, col] = nuevo


def limitar_horas_fuera(df, ajustes, tolerancia, mask_defrost, mask_prep):
    """Recorta horas fuera de rango de un día, sin tocar defrost ni arranque.

    Las muestras que se meten en banda copian el retorno, el suministro y el
    evaporador de un tramo real en rango del mismo equipo, a la misma hora.
    Lo que ya estaba en rango no se toca, aunque el suministro o el evaporador
    estén fuera.
    """
    if not ajustes or "return_air" not in df.columns or not df["set_point"].notna().any():
        return df
    df = df.copy()
    w = pesos_tiempo(df["fecha"])
    posiciones = {idx: pos for pos, idx in enumerate(df.index)}
    for aj in ajustes:
        tope = aj.get("horas_fuera_max")
        if tope in (None, ""):
            continue
        tope = float(tope)
        dia = pd.Timestamp(aj["dia"]).date()
        del_dia = df["fecha"].dt.date == dia
        if not del_dia.any() or not df.loc[del_dia, "set_point"].notna().any():
            continue
        sp = float(df.loc[del_dia, "set_point"].median())
        lo, hi = sp - tolerancia, sp + tolerancia
        perfil = _perfil_en_rango(df, mask_defrost, mask_prep, lo, hi, dia)
        fuera = []
        for idx in df.index[del_dia]:
            pos = posiciones[idx]
            if bool(mask_defrost[pos]) or bool(mask_prep[pos]):
                continue
            v = df.at[idx, "return_air"]
            if pd.isna(v) or lo <= float(v) <= hi:
                continue
            fuera.append((abs(float(v) - sp), idx, float(w[pos])))
        fuera.sort()
        acum = sum(item[2] for item in fuera)
        traer = []
        for _, idx, wi in fuera:
            if acum <= tope + 1e-6:
                break
            traer.append(idx)
            acum -= wi
        minutos = None if perfil is None else perfil[0]
        donantes = None if perfil is None else perfil[1]
        if minutos is not None and len(minutos):
            sin_copia = []
            for idx in traer:
                ts = df.at[idx, "fecha"]
                minuto = int(ts.hour) * 60 + int(ts.minute)
                i = int(np.searchsorted(minutos, minuto))
                cand = []
                if i < len(minutos):
                    cand.append(i)
                if i > 0:
                    cand.append(i - 1)
                cand.extend((0, len(minutos) - 1))

                def dist(k, minuto=minuto):
                    d = abs(int(minutos[k]) - minuto)
                    return min(d, 1440 - d)

                donor = donantes[min(cand, key=dist)]
                if donor != idx:
                    _copiar_regimen(df, idx, donor)
                else:
                    sin_copia.append(idx)
            if sin_copia:
                _acercar_trio(df, sin_copia, lo, hi, sp)
        elif traer:
            _acercar_trio(df, traer, lo, hi, sp)
    return df


def detectar_huecos(df: pd.DataFrame, minutos: float = 60.0) -> pd.DataFrame:
    """Tramos sin informacion de duracion mayor al umbral (minutos)."""
    f = df["fecha"]
    d = f.diff().dt.total_seconds() / 60.0
    idx = d[d > minutos].index
    filas = [{"desde": f.iloc[i - 1], "hasta": f.iloc[i],
              "duracion_min": float(d.loc[i]),
              "duracion_h": float(d.loc[i]) / 60.0} for i in idx]
    return pd.DataFrame(filas)


# ---------------------------------------------------------------------------
# 5. RECONSTRUCCION DE HUECOS
# ---------------------------------------------------------------------------
def _dias_donantes(df: pd.DataFrame, mask_def: np.ndarray, intervalo: float,
                   sensor_control: str, banda: tuple,
                   completitud_min: float = 0.90) -> list:
    """
    Selecciona los dias reales que sirven como molde: dias con alta
    completitud y con el sensor de control dentro de banda fuera de defrost.
    """
    esperadas = (24 * 60) / intervalo
    tmp = df.assign(_def=mask_def, _dia=df["fecha"].dt.date)
    buenos = []
    for dia, g in tmp.groupby("_dia"):
        if len(g) < completitud_min * esperadas:
            continue
        base = g[~g["_def"]][sensor_control].dropna()
        if base.empty:
            continue
        if ((base >= banda[0]) & (base <= banda[1])).mean() < 0.98:
            continue
        buenos.append(dia)
    return sorted(buenos)


def _perfil_dia(df: pd.DataFrame, dia, mask_def: np.ndarray,
                intervalo: float) -> pd.DataFrame:
    """
    Extrae el perfil de 24 h de un dia donante en una malla regular,
    con los defrost del donante removidos e interpolados (solo el regimen
    normal). Los defrost se vuelven a inyectar despues segun horario.
    """
    tmp = df.assign(_def=mask_def)
    g = tmp[tmp["fecha"].dt.date == dia].copy()
    if g.empty:
        return pd.DataFrame()

    tz = g["fecha"].dt.tz
    inicio = pd.Timestamp(dia, tz=tz)
    malla = pd.date_range(inicio, periods=int(24 * 60 / intervalo),
                          freq=pd.Timedelta(minutes=intervalo))
    seg = pd.DataFrame({"fecha": malla})
    x_dst = (seg["fecha"] - inicio).dt.total_seconds().to_numpy()

    limpio = g[~g["_def"]]
    for c in SENSORES:
        v = limpio[c].to_numpy(dtype=float)
        xs = (limpio["fecha"] - inicio).dt.total_seconds().to_numpy()
        ok = ~np.isnan(v)
        if ok.sum() < 10:
            seg[c] = np.nan
        else:
            seg[c] = np.interp(x_dst, xs[ok], v[ok])
    return seg


def reconstruir_huecos(df: pd.DataFrame,
                       huecos: pd.DataFrame,
                       eventos: pd.DataFrame,
                       mask_def: np.ndarray,
                       intervalo: float,
                       sensor_control: str,
                       tolerancia: float,
                       set_point: float,
                       sensores_acotados: list,
                       estad: dict,
                       semilla: int = 20260101) -> pd.DataFrame:
    """
    Genera las filas sinteticas para cada hueco y devuelve un DataFrame con
    las mismas columnas del original y origen='reconstruido'.
    """
    rng = np.random.default_rng(semilla)
    if huecos.empty:
        return pd.DataFrame(columns=df.columns)

    banda = (set_point - tolerancia, set_point + tolerancia)
    horario = horario_defrost(eventos)
    plantilla = plantilla_defrost(df, eventos)
    donantes = _dias_donantes(df, mask_def, intervalo, sensor_control, banda)
    if not donantes:
        raise RuntimeError("No hay dias donantes suficientes para reconstruir.")

    # Cache de perfiles de donantes
    cache = {}

    def perfil(dia):
        if dia not in cache:
            cache[dia] = _perfil_dia(df, dia, mask_def, intervalo)
        return cache[dia]

    tz = df["fecha"].dt.tz
    imei = df["imei"].iloc[0]
    dur_def_s = horario["duracion_med_min"] * 60.0
    per_s = horario["periodo_h"] * 3600.0
    fase_s = horario["fase_s"]
    n_pl = len(next(iter(plantilla.values()))) if plantilla else 0

    salida = []
    for _, h in huecos.iterrows():
        t0, t1 = h["desde"], h["hasta"]

        # --- malla temporal sintetica (con jitter realista) ---
        paso = pd.Timedelta(minutes=intervalo)
        n = int((t1 - t0) / paso) - 1
        if n <= 0:
            continue
        base_t = t0 + paso * np.arange(1, n + 1)
        jitter = pd.to_timedelta(rng.normal(0, intervalo * 3, n).clip(-20, 20), unit="s")
        fechas = pd.DatetimeIndex(base_t) + jitter
        fechas = fechas[(fechas > t0) & (fechas < t1)].sort_values()
        if len(fechas) == 0:
            continue

        # --- valores base tomados del dia donante mas cercano ---
        vals = {c: np.full(len(fechas), np.nan) for c in SENSORES}
        dias_hueco = sorted({d.date() for d in fechas})
        for dia in dias_hueco:
            donante = min(donantes, key=lambda d: abs((d - dia).days))
            p = perfil(donante)
            if p.empty:
                continue
            sel = np.array([d.date() == dia for d in fechas])
            hh = np.array([d.hour * 3600 + d.minute * 60 + d.second for d in fechas[sel]])
            xs = ((p["fecha"] - p["fecha"].iloc[0]).dt.total_seconds().to_numpy())
            for c in SENSORES:
                v = p[c].to_numpy(dtype=float)
                ok = ~np.isnan(v)
                if ok.sum() < 10:
                    continue
                vals[c][sel] = np.interp(hh, xs[ok], v[ok], period=86400)

        # --- ruido de medicion ---
        for c in SENSORES:
            s = estad.get(c, {}).get("ruido", 0.1) or 0.1
            vals[c] = vals[c] + rng.normal(0, s * 0.8, len(fechas))

        # --- inyeccion de los defrost que corresponden al tramo ---
        epoch = epoch_s(fechas)
        e0, e1 = epoch[0], epoch[-1]
        k0 = int(np.floor((e0 - fase_s) / per_s)) - 1
        k1 = int(np.ceil((e1 - fase_s) / per_s)) + 1
        marcas = []
        for k in range(k0, k1 + 1):
            ini = fase_s + k * per_s
            if ini + dur_def_s < e0 or ini > e1:
                continue
            marcas.append(ini)
            if n_pl:
                dentro = (epoch >= ini) & (epoch <= ini + dur_def_s)
                if dentro.any():
                    frac = (epoch[dentro] - ini) / dur_def_s
                    xp = np.linspace(0, 1, n_pl)
                    for c, tpl in plantilla.items():
                        vals[c][dentro] = np.interp(frac, xp, tpl) + \
                            rng.normal(0, 0.15, dentro.sum())

        en_defrost = np.zeros(len(fechas), dtype=bool)
        for ini in marcas:
            en_defrost |= (epoch >= ini) & (epoch <= ini + dur_def_s)

        # --- empalme suave con el dato real anterior y posterior ---
        prev = df[df["fecha"] <= t0].tail(1)
        post = df[df["fecha"] >= t1].head(1)
        tau = 30 * 60.0                                   # 30 min de mezcla
        for c in SENSORES:
            if prev.empty or np.isnan(prev[c].iloc[0]) or en_defrost[0]:
                pass
            else:
                off = float(prev[c].iloc[0]) - vals[c][0]
                vals[c] += off * np.exp(-(epoch - e0) / tau) * (~en_defrost)
            if not post.empty and not np.isnan(post[c].iloc[0]) and not en_defrost[-1]:
                off = float(post[c].iloc[0]) - vals[c][-1]
                vals[c] += off * np.exp(-(e1 - epoch) / tau) * (~en_defrost)

        # --- acotado: primero banda de conformidad, luego rango fisico real ---
        for c in sensores_acotados:
            if c in vals:
                vals[c][~en_defrost] = np.clip(vals[c][~en_defrost], banda[0], banda[1])
        for c in SENSORES:
            if c in estad:                       # rango fisico del regimen normal
                vals[c][~en_defrost] = np.clip(vals[c][~en_defrost],
                                               estad[c]["min"], estad[c]["max"])
        for c, tpl in plantilla.items():         # rango fisico durante defrost
            if en_defrost.any():
                vals[c][en_defrost] = np.clip(vals[c][en_defrost],
                                              float(tpl.min()) - 2.0,
                                              float(tpl.max()) + 2.0)

        bloque = pd.DataFrame({
            "temp_supply_1": np.round(vals["temp_supply_1"], 1),
            "return_air": np.round(vals["return_air"], 1),
            "evaporation_coil": np.round(vals["evaporation_coil"], 1),
            "set_point": set_point,
            "power_state": 1,
            "imei": imei,
            "fecha": fechas,
            "origen": "reconstruido",
        })
        salida.append(bloque)

    if not salida:
        return pd.DataFrame(columns=df.columns)
    return pd.concat(salida, ignore_index=True)[df.columns]


# ---------------------------------------------------------------------------
# 6. PREPARACION (arranque / enfriamiento inicial)
# ---------------------------------------------------------------------------
def mascara_preparacion(df: pd.DataFrame,
                        sensor_control: str,
                        tolerancia: float,
                        set_point: float | None = None,
                        gap_min_min: float = 60.0,
                        duracion_max_h: float = 8.0) -> np.ndarray:
    """
    Detecta la fase de preparacion al encender el equipo.

    Tras el inicio del registro o un hueco largo, mientras el sensor de control
    permanece fuera de banda por temperatura de arranque (caliente en equipos
    de frio), se marca preparacion hasta la primera entrada en banda.
    Esa etapa no cuenta como horas en rango ni fuera de rango.
    """
    n = len(df)
    m = np.zeros(n, dtype=bool)
    if n == 0 or sensor_control not in df.columns:
        return m

    sp = float(df["set_point"].median() if set_point is None else set_point)
    lo, hi = sp - tolerancia, sp + tolerancia
    ctrl = pd.to_numeric(df[sensor_control], errors="coerce").to_numpy(dtype=float)
    fechas = df["fecha"].reset_index(drop=True)
    deltas = fechas.diff().dt.total_seconds().fillna(0) / 60.0

    # Inicios de segmento: primera muestra o tras hueco
    inicios = [0] + [i for i in range(1, n) if deltas.iloc[i] > gap_min_min]
    max_s = duracion_max_h * 3600.0

    for i0 in inicios:
        t0 = fechas.iloc[i0]
        for i in range(i0, n):
            if i > i0 and deltas.iloc[i] > gap_min_min:
                break
            if (fechas.iloc[i] - t0).total_seconds() > max_s:
                break
            v = ctrl[i]
            if np.isnan(v):
                m[i] = True
                continue
            en_banda = (v >= lo) and (v <= hi)
            if en_banda:
                break
            # Arranque tipico en frio: sensor caliente por encima de la banda
            if sp <= 0 and v > hi:
                m[i] = True
            elif sp > 0 and v < lo:
                m[i] = True
            else:
                # Fuera de banda pero no tipico de arranque -> fin de preparacion
                break
    return m


# ---------------------------------------------------------------------------
# 7. ANALISIS DIARIO
# ---------------------------------------------------------------------------
def analisis_diario(df: pd.DataFrame, eventos: pd.DataFrame,
                    mask_def: np.ndarray, sensor_control: str,
                    tolerancia: float, intervalo: float,
                    cap_min: float = 60.0,
                    mask_prep: np.ndarray | None = None) -> pd.DataFrame:
    """
    Resumen por dia calendario, integrado en el tiempo (no por conteo de
    muestras), de modo que las horas reportadas sean horas reales:

        horas_defrost + horas_preparacion + horas_evaluadas + horas_sin_dato = 24
        horas_evaluadas = horas_en_rango + horas_fuera_rango

    La preparacion (arranque) y el defrost se excluyen del cumplimiento.
    """
    if mask_prep is None:
        mask_prep = np.zeros(len(df), dtype=bool)
    # Preparacion (arranque) tiene prioridad sobre defrost si coinciden
    prep = np.asarray(mask_prep, dtype=bool)
    deff = np.asarray(mask_def, dtype=bool) & ~prep
    d = df.assign(_def=deff,
                  _prep=prep,
                  _dia=df["fecha"].dt.date,
                  _w=pesos_tiempo(df["fecha"], cap_min))
    sp = float(df["set_point"].median())
    lo, hi = sp - tolerancia, sp + tolerancia

    filas = []
    for dia, g in d.groupby("_dia"):
        n = len(g)
        n_rec = int((g["origen"] == "reconstruido").sum())
        excl = g["_def"] | g["_prep"]
        base = g[~excl]
        valido = base[sensor_control].notna()
        base = base[valido]
        ctrl = base[sensor_control]
        en_rango = (ctrl >= lo) & (ctrl <= hi)

        h_def = float(g.loc[g["_def"], "_w"].sum())
        h_prep = float(g.loc[g["_prep"], "_w"].sum())
        h_base = float(base["_w"].sum())
        h_rango = float(base.loc[en_rango, "_w"].sum())
        h_fuera = h_base - h_rango
        h_total = h_def + h_prep + h_base

        # No contar como defrost los eventos mayoritariamente en preparacion
        if len(eventos) and pd.api.types.is_datetime64_any_dtype(eventos["inicio"]):
            ev_dia = eventos[eventos["inicio"].dt.date == dia]
        else:
            ev_dia = eventos.iloc[0:0]
        if len(ev_dia) and prep.any():
            fechas = df["fecha"]
            keep = []
            for _, e in ev_dia.iterrows():
                m = ((fechas >= e["inicio"]) & (fechas <= e["fin"])).to_numpy()
                if not m.any():
                    keep.append(True)
                else:
                    keep.append(float(prep[m].mean()) < 0.5)
            ev_dia = ev_dia.loc[keep]

        fila = {
            "dia": dia,
            "muestras": n,
            "muestras_reales": n - n_rec,
            "muestras_reconstruidas": n_rec,
            "pct_reconstruido": 100.0 * n_rec / n if n else 0.0,
            "completitud_pct": min(100.0, 100.0 * h_total / 24.0),
            "horas_sin_dato": max(0.0, 24.0 - h_total),
            "defrost_eventos": int(len(ev_dia)),
            "defrost_dur_med_min": float(ev_dia["duracion_min"].mean()) if len(ev_dia) else 0.0,
            "horas_defrost": h_def,
            "horas_preparacion": h_prep,
            "horas_evaluadas": h_base,
            "horas_en_rango": h_rango,
            "horas_fuera_rango": h_fuera,
            "pct_en_rango": 100.0 * h_rango / h_base if h_base else np.nan,
            "set_point": sp,
        }
        for c in SENSORES:
            v = base[c].dropna()
            fila[f"{c}_med"] = float(v.mean()) if len(v) else np.nan
            fila[f"{c}_min"] = float(v.min()) if len(v) else np.nan
            fila[f"{c}_max"] = float(v.max()) if len(v) else np.nan
        filas.append(fila)

    return pd.DataFrame(filas).sort_values("dia").reset_index(drop=True)


def resumen_horario(df: pd.DataFrame, mask_def: np.ndarray, dia,
                    sensor_control: str, tolerancia: float,
                    intervalo: float,
                    mask_prep: np.ndarray | None = None) -> pd.DataFrame:
    """
    Dato representativo por cada hora del dia (24 filas):
    media / minimo / maximo de cada sensor excluyendo defrost y preparacion,
    minutos de defrost/preparacion y estado resultante.
    """
    if mask_prep is None:
        mask_prep = np.zeros(len(df), dtype=bool)
    prep = np.asarray(mask_prep, dtype=bool)
    deff = np.asarray(mask_def, dtype=bool) & ~prep
    d = df.assign(_def=deff, _prep=prep, _w=pesos_tiempo(df["fecha"]))
    g = d[d["fecha"].dt.date == dia]
    sp = float(df["set_point"].median())
    lo, hi = sp - tolerancia, sp + tolerancia

    filas = []
    for h in range(24):
        gh = g[g["fecha"].dt.hour == h]
        base = gh[~(gh["_def"] | gh["_prep"])]
        f = {"hora": h, "muestras": len(gh),
             "min_defrost": float(gh.loc[gh["_def"], "_w"].sum()) * 60.0,
             "min_preparacion": float(gh.loc[gh["_prep"], "_w"].sum()) * 60.0,
             "reconstruido": bool(len(gh) and (gh["origen"] == "reconstruido").all())}
        for c in SENSORES:
            v = base[c].dropna()
            f[f"{c}_med"] = float(v.mean()) if len(v) else np.nan
            f[f"{c}_min"] = float(v.min()) if len(v) else np.nan
            f[f"{c}_max"] = float(v.max()) if len(v) else np.nan
        ctrl = base[sensor_control].dropna()
        w_prep = float(gh.loc[gh["_prep"], "_w"].sum()) if len(gh) else 0.0
        w_def = float(gh.loc[gh["_def"], "_w"].sum()) if len(gh) else 0.0
        w_tot = float(gh["_w"].sum()) if len(gh) else 0.0
        if len(gh) == 0:
            f["estado"] = "SIN DATO"
        elif w_tot > 0 and w_prep / w_tot >= 0.5:
            f["estado"] = "PREPARACION"
        elif len(ctrl) == 0 or (w_tot > 0 and w_def / w_tot >= 0.5):
            f["estado"] = "DEFROST"
        elif ((ctrl >= lo) & (ctrl <= hi)).all():
            f["estado"] = "EN RANGO"
        else:
            f["estado"] = "FUERA"
        f["pct_en_rango"] = (100.0 * ((ctrl >= lo) & (ctrl <= hi)).mean()
                             if len(ctrl) else np.nan)
        filas.append(f)
    return pd.DataFrame(filas)
