import { SavedMatch } from "../types/futsal";
import { LocalFinalCopy } from "./matchSnapshotService";

export type MatchHistoryEntry = SavedMatch & {
  historySource: "remote" | "local" | "both";
  syncStatus: "synced" | "pending" | "local";
  localStorageId?: string;
  remoteId?: string;
};

function goals(match: SavedMatch, opponent: boolean): number {
  return (match.events || []).filter((e) => {
    const isGoal = e.type === "GOAL" || e.type === "GOAL_CONCEDED";
    return isGoal && !!e.metadata?.isOpponent === opponent;
  }).length;
}

/** Firma estable suficiente para deduplicar copia local + remoto del mismo final. */
export function matchHistorySignature(match: SavedMatch): string {
  return [
    match.timestamp || "",
    match.teamName || "",
    match.opponentName || "",
    goals(match, false),
    goals(match, true),
    match.events?.length || 0,
  ].join("|");
}

export function combineMatchHistory(remote: SavedMatch[], local: LocalFinalCopy[]): MatchHistoryEntry[] {
  const result: MatchHistoryEntry[] = [];
  const remoteById = new Map(remote.map((m) => [m.id, m]));
  const remoteBySig = new Map(remote.map((m) => [matchHistorySignature(m), m]));
  const consumedRemote = new Set<string>();

  for (const copy of local) {
    const localSaved: SavedMatch = { ...copy.matchData, id: copy.id };
    const remoteMatch = (copy.remoteId && remoteById.get(copy.remoteId)) || remoteBySig.get(matchHistorySignature(localSaved));
    if (remoteMatch) {
      consumedRemote.add(remoteMatch.id);
      result.push({
        ...remoteMatch,
        // El análisis de TACTICAL PRO se genera DESPUÉS de guardar el partido
        // en el servidor, y no existe ninguna forma de actualizar el registro
        // remoto: `partidosService` solo sabe crear, leer y borrar. Así que el
        // texto vive únicamente en la copia local, y al preferir la versión
        // remota se perdía en el Historial de todos los partidos sincronizados.
        //
        // Se rellena el HUECO, no se sustituye el dato: si la copia remota ya
        // trae análisis, manda la remota. Y como el emparejamiento ya se ha
        // hecho por `remoteId` o por firma, el texto solo puede venir del
        // mismo partido.
        ...(remoteMatch.tacticalAnalysis?.trim()
          ? {}
          : copy.matchData.tacticalAnalysis?.trim()
            ? { tacticalAnalysis: copy.matchData.tacticalAnalysis }
            : {}),
        historySource: "both",
        syncStatus: "synced",
        localStorageId: copy.id,
        remoteId: remoteMatch.id,
      });
    } else {
      result.push({
        ...localSaved,
        historySource: "local",
        syncStatus: copy.syncStatus === "synced" ? "local" : copy.syncStatus,
        localStorageId: copy.id,
        remoteId: copy.remoteId,
      });
    }
  }

  for (const match of remote) {
    if (consumedRemote.has(match.id)) continue;
    result.push({ ...match, historySource: "remote", syncStatus: "synced", remoteId: match.id });
  }

  return result.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
}
