/**
 * src/services/matchSnapshotService.ts
 *
 * Capa de seguridad LOCAL, independiente del backend remoto.
 * Guarda snapshots del partido en curso en localStorage para poder
 * recuperarlo si el navegador se cierra, se recarga o el guardado
 * remoto falla. No sustituye a partidosService (Netlify Database):
 * es una red de seguridad adicional, de menor dependencia externa.
 *
 * Funciones puras / con efectos mínimos y aislados, fáciles de testear.
 */
import { MatchData, Period } from "../types/futsal";

const SNAPSHOT_KEY = "futsal_active_match_snapshot_v1";
const FINAL_COPY_PREFIX = "futsal_final_copy_v1_"; // + timestamp

export type MatchSnapshot = {
  matchData: MatchData;
  savedAt: string; // ISO
};

/** Guarda (sobrescribe) el snapshot del partido activo. Nunca lanza. */
export function saveMatchSnapshot(matchData: MatchData): void {
  try {
    const snapshot: MatchSnapshot = {
      matchData,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (err) {
    // No debe interrumpir el partido si localStorage falla (cuota, modo
    // privado, etc.) — es una red de seguridad, no el flujo principal.
    console.warn("No se pudo guardar la copia local del partido:", err);
  }
}

/** Lee el snapshot del partido activo, si existe y es legible. */
export function loadMatchSnapshot(): MatchSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.matchData) return null;
    return parsed as MatchSnapshot;
  } catch (err) {
    console.warn("Copia local del partido ilegible, se descarta:", err);
    return null;
  }
}

/** Elimina el snapshot del partido activo (tras finalizar o descartar). */
export function clearMatchSnapshot(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch (err) {
    console.warn("No se pudo limpiar la copia local del partido:", err);
  }
}

/**
 * ¿Hay un partido recuperable? (existe snapshot y no está ya FINISHED).
 * Un partido FINISHED ya se congeló y se movió a copia final; no debe
 * ofrecerse como "partido sin terminar".
 */
export function hasRecoverableMatch(): boolean {
  const snap = loadMatchSnapshot();
  return !!snap && snap.matchData.period !== Period.FINISHED;
}

/**
 * Guarda una copia final local (post-finalización), con clave propia por
 * timestamp para no colisionar entre partidos y poder listarlas todas.
 * Se usa como fuente de verdad del Historial cuando el backend remoto
 * no está disponible.
 */
export function saveFinalLocalCopy(matchData: MatchData): string {
  // Sufijo aleatorio además del timestamp: evita colisión de clave si dos
  // copias finales se guardan en el mismo milisegundo.
  const id = `${FINAL_COPY_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    localStorage.setItem(id, JSON.stringify(matchData));
  } catch (err) {
    console.warn("No se pudo guardar la copia final local del partido:", err);
  }
  return id;
}

/** Lista todas las copias finales locales guardadas (más reciente primero). */
export function listFinalLocalCopies(): { id: string; matchData: MatchData }[] {
  const out: { id: string; matchData: MatchData }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(FINAL_COPY_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        out.push({ id: key, matchData: JSON.parse(raw) as MatchData });
      } catch {
        // copia individual corrupta: se omite, no rompe el listado completo
      }
    }
  } catch (err) {
    console.warn("No se pudieron listar las copias finales locales:", err);
  }
  return out.sort((a, b) => (b.matchData.timestamp || "").localeCompare(a.matchData.timestamp || ""));
}

/**
 * Firma corta de los campos que deben forzar un guardado INMEDIATO
 * (no throttled): nº de eventos, período, si el reloj corre, faltas,
 * y composición de jugadores en pista (sustituciones). Cambios que no
 * afectan a esta firma (tick de reloj, TOT/ROT acumulando) se consideran
 * "no urgentes" y respetan el throttle normal.
 */
export function importantChangeSignature(matchData: MatchData): string {
  const onPitchIds = matchData.players
    .filter((p) => p.isOnPitch)
    .map((p) => p.id)
    .sort()
    .join(",");
  return [
    matchData.events.length,
    matchData.period,
    matchData.isClockRunning ? 1 : 0,
    matchData.fouls.team,
    matchData.fouls.opponent,
    onPitchIds,
  ].join("|");
}
