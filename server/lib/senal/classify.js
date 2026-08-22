/** Wait: 30 min … 24 h. Offline: más de 24 h seguidas. Menos de 30 min no es evento. */
export const WAIT_MIN_MINUTES = 30;
export const OFFLINE_MIN_MINUTES = 24 * 60;
/** Une fragmentos del mismo corte (wait↔offline o parpadeo breve). */
export const MERGE_GAP_MINUTES = 15;

/**
 * @param {number} durationMin
 * @returns {'wait'|'offline'|null}
 */
export function classifySenalTipo(durationMin) {
  const n = Number(durationMin);
  if (!Number.isFinite(n) || n < WAIT_MIN_MINUTES) return null;
  if (n >= OFFLINE_MIN_MINUTES) return 'offline';
  return 'wait';
}

function toMs(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Une cortes contiguos en un lazo y clasifica wait/offline por duración.
 * @param {Array<object>} episodes
 */
export function mergeAndClassifyLazos(episodes = []) {
  const sorted = [...episodes].sort(
    (a, b) => toMs(a.startedAt) - toMs(b.startedAt)
  );
  const merged = [];

  for (const e of sorted) {
    const start = toMs(e.startedAt);
    const end = toMs(e.endedAt);
    if (!Number.isFinite(start)) continue;
    const endSafe = Number.isFinite(end) && end >= start ? end : start;
    const ids = [
      ...(e.episodioIds ?? []),
      e.id,
      e.lazoId,
    ].filter((id) => id != null && id !== '');

    const last = merged[merged.length - 1];
    if (last) {
      const lastEnd = toMs(last.endedAt);
      const gapMin = Number.isFinite(lastEnd)
        ? (start - lastEnd) / 60_000
        : Infinity;
      const sameLazo =
        last.recovered === false ||
        last.open === true ||
        gapMin <= MERGE_GAP_MINUTES;
      if (sameLazo && gapMin < 6 * 60) {
        if (endSafe > lastEnd) last.endedAt = new Date(endSafe).toISOString();
        last.durationMin = Math.max(
          0,
          Math.round((toMs(last.endedAt) - toMs(last.startedAt)) / 60_000)
        );
        last.recovered = Boolean(e.recovered) && !e.open && !last.open;
        last.open = Boolean(last.open || e.open);
        if (e.datosInicio && !last.datosInicio) last.datosInicio = e.datosInicio;
        if (e.datosFin) last.datosFin = e.datosFin;
        last.endHour = e.endHour ?? last.endHour;
        for (const id of ids) {
          if (!last.episodioIds.includes(id)) last.episodioIds.push(id);
        }
        continue;
      }
    }

    merged.push({
      ...e,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(endSafe).toISOString(),
      durationMin: Math.max(0, Math.round((endSafe - start) / 60_000)),
      episodioIds: [...new Set(ids)],
      lazoId: ids[0] ?? e.startedAt,
    });
  }

  const lazos = [];
  for (const e of merged) {
    const tipo = classifySenalTipo(e.durationMin);
    if (!tipo) continue;
    lazos.push({
      ...e,
      tipo,
      lazoId: e.episodioIds[0] ?? e.lazoId ?? e.startedAt,
    });
  }

  return lazos.sort((a, b) => toMs(b.startedAt) - toMs(a.startedAt));
}

export function countLazosByTipo(lazos) {
  const wait = lazos.filter((e) => e.tipo === 'wait');
  const offline = lazos.filter((e) => e.tipo === 'offline');
  const avg = (arr) =>
    arr.length
      ? Math.round(arr.reduce((s, e) => s + e.durationMin, 0) / arr.length)
      : 0;
  return {
    waitEpisodes: wait.length,
    waitRecovered: wait.filter((e) => e.recovered).length,
    waitAvgMin: avg(wait),
    waitTotalMin: wait.reduce((s, e) => s + e.durationMin, 0),
    offlineEpisodes: offline.length,
    offlineRecovered: offline.filter((e) => e.recovered).length,
    offlineAvgMin: avg(offline),
    offlineTotalMin: offline.reduce((s, e) => s + e.durationMin, 0),
  };
}
