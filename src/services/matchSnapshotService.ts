/**
 * Seguridad local de partido y copias finales.
 *
 * Objetivo: que un fallo de red/auth/IA nunca implique perder un partido.
 * La copia local es independiente del backend remoto y se mantiene incluso
 * después de sincronizar correctamente.
 */
import { GameState, MatchData, Period } from "../types/futsal";

const SNAPSHOT_KEY = "futsal_active_match_snapshot_v1";
export const FINAL_COPY_PREFIX = "futsal_final_copy_v1_";

export type MatchSnapshotUiState = {
  isFieldFlipped?: boolean;
  gameState?: GameState;
  rivalGameState?: GameState;
  isDataLocked?: boolean;
};

export type MatchSnapshot = {
  matchData: MatchData;
  savedAt: string;
  uiState?: MatchSnapshotUiState;
};

export type LocalFinalCopy = {
  id: string;
  matchData: MatchData;
  syncStatus: "local" | "pending" | "synced";
  remoteId?: string;
  savedAt?: string;
};

type StoredFinalCopyV2 = {
  version: 2;
  matchData: MatchData;
  syncStatus: "local" | "pending" | "synced";
  remoteId?: string;
  savedAt: string;
};

export function saveMatchSnapshot(matchData: MatchData, uiState?: MatchSnapshotUiState): void {
  try {
    // Si el guardado throttled del reloj no trae uiState, conserva el último
    // estado visual/táctico persistido en vez de borrarlo.
    const previousUiState = uiState === undefined ? loadMatchSnapshot()?.uiState : undefined;
    const snapshot: MatchSnapshot = {
      matchData,
      savedAt: new Date().toISOString(),
      uiState: uiState ?? previousUiState,
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn("No se pudo guardar la copia local del partido:", err);
  }
}

export function loadMatchSnapshot(): MatchSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.matchData) return null;
    return parsed as MatchSnapshot;
  } catch (err) {
    console.warn("Copia local del partido ilegible:", err);
    return null;
  }
}

export function clearMatchSnapshot(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch (err) {
    console.warn("No se pudo limpiar la copia local del partido:", err);
  }
}

export function isMeaningfulActiveMatch(matchData: MatchData): boolean {
  return (
    matchData.period !== Period.FIRST ||
    matchData.matchClock > 0 ||
    matchData.events.length > 0 ||
    matchData.players.some((p) => p.individualTimeSeconds > 0)
  );
}

export function hasRecoverableMatch(): boolean {
  const snap = loadMatchSnapshot();
  return !!snap && snap.matchData.period !== Period.FINISHED && isMeaningfulActiveMatch(snap.matchData);
}

/**
 * Guarda una copia final local. Por defecto queda pendiente de sincronizar;
 * si luego el POST remoto funciona se marca como synced sin eliminarla.
 */
export function saveFinalLocalCopy(matchData: MatchData): string {
  const id = `${FINAL_COPY_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const payload: StoredFinalCopyV2 = {
      version: 2,
      matchData,
      syncStatus: "pending",
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(id, JSON.stringify(payload));
  } catch (err) {
    console.warn("No se pudo guardar la copia final local del partido:", err);
  }
  return id;
}

function parseStoredFinalCopy(id: string, raw: string): LocalFinalCopy | null {
  try {
    const parsed = JSON.parse(raw);
    // v2 actual
    if (parsed?.version === 2 && parsed.matchData) {
      return {
        id,
        matchData: parsed.matchData as MatchData,
        syncStatus: parsed.syncStatus === "synced" ? "synced" : parsed.syncStatus === "local" ? "local" : "pending",
        remoteId: parsed.remoteId,
        savedAt: parsed.savedAt,
      };
    }
    // Compatibilidad con las copias creadas por la primera versión del módulo,
    // donde se almacenaba MatchData directamente.
    if (parsed && typeof parsed === "object" && parsed.teamName && parsed.players && parsed.events) {
      return { id, matchData: parsed as MatchData, syncStatus: "local" };
    }
    return null;
  } catch {
    return null;
  }
}

export function listFinalLocalCopies(): LocalFinalCopy[] {
  const out: LocalFinalCopy[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(FINAL_COPY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const copy = parseStoredFinalCopy(key, raw);
      if (copy) out.push(copy);
    }
  } catch (err) {
    console.warn("No se pudieron listar las copias finales locales:", err);
  }
  return out.sort((a, b) => (b.matchData.timestamp || b.savedAt || "").localeCompare(a.matchData.timestamp || a.savedAt || ""));
}

export function getFinalLocalCopy(id: string): LocalFinalCopy | null {
  if (!id.startsWith(FINAL_COPY_PREFIX)) return null;
  try {
    const raw = localStorage.getItem(id);
    return raw ? parseStoredFinalCopy(id, raw) : null;
  } catch {
    return null;
  }
}

/** Marca como sincronizada, pero conserva siempre la copia local. */
export function markFinalLocalCopySynced(id: string, remoteId: string): void {
  const copy = getFinalLocalCopy(id);
  if (!copy) return;
  try {
    const payload: StoredFinalCopyV2 = {
      version: 2,
      matchData: copy.matchData,
      syncStatus: "synced",
      remoteId,
      savedAt: copy.savedAt || new Date().toISOString(),
    };
    localStorage.setItem(id, JSON.stringify(payload));
  } catch (err) {
    console.warn("No se pudo marcar la copia local como sincronizada:", err);
  }
}

/** Permite marcar explícitamente una copia como local/pending sin borrarla. */
export function updateFinalLocalCopyMatchData(id: string, matchData: MatchData): void {
  const copy = getFinalLocalCopy(id);
  if (!copy) return;
  try {
    const payload: StoredFinalCopyV2 = {
      version: 2,
      matchData,
      syncStatus: copy.syncStatus,
      remoteId: copy.remoteId,
      savedAt: copy.savedAt || new Date().toISOString(),
    };
    localStorage.setItem(id, JSON.stringify(payload));
  } catch (err) {
    console.warn("No se pudo actualizar la copia final local:", err);
  }
}

export function markFinalLocalCopyPending(id: string): void {
  const copy = getFinalLocalCopy(id);
  if (!copy) return;
  try {
    const payload: StoredFinalCopyV2 = {
      version: 2,
      matchData: copy.matchData,
      syncStatus: "pending",
      remoteId: copy.remoteId,
      savedAt: copy.savedAt || new Date().toISOString(),
    };
    localStorage.setItem(id, JSON.stringify(payload));
  } catch (err) {
    console.warn("No se pudo actualizar el estado de sincronización:", err);
  }
}

/**
 * Firma de cambios que fuerzan snapshot inmediato. El reloj/TOT/ROT por sí
 * solos no cambian la firma y respetan el throttle de MatchTracker.
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
