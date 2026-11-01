/**
 * src/utils/tacticalPersistence.ts
 *
 * DÓNDE SE GUARDA UN ANÁLISIS DE TACTICAL PRO. Funciones puras, sin React.
 *
 * EL DEFECTO QUE CORRIGE
 * ----------------------
 * El análisis solo se incorporaba al partido cuando existía copia local:
 *
 *     if (result.trim() && localCopyId) { ...setMatch... }
 *
 * Un partido abierto ÚNICAMENTE desde el historial remoto —registrado en la
 * tablet, consultado desde el Mac— no tiene copia local, así que entraba en
 * el `else` invisible: el informe se veía en pantalla, pero el `matchData`
 * que recibía el exportador seguía sin `tacticalAnalysis` y el PDF salía sin
 * él. Nadie podía notar la diferencia hasta abrir el archivo.
 *
 * LA REGLA
 * --------
 * La MEMORIA se actualiza siempre que el informe esté completo. Es lo único
 * que hace falta para poder exportarlo, y no depende de ninguna red:
 *
 *     memoria  ← siempre (si hay texto y está completo)
 *     local    ← si existe copia local
 *     remoto   ← si se puede resolver un id remoto
 *
 * Los tres son independientes. Que falle el último no deshace los dos
 * primeros: el informe ya está, y volver a pedírselo a Anthropic por un fallo
 * de red costaría dinero para traer lo mismo.
 *
 * QUÉ NO SE GUARDA NUNCA
 * ----------------------
 * Un informe incompleto. `streamTacticalReport` solo resuelve al recibir el
 * fin de transmisión, así que un texto a medias llega por la rama de error —
 * cancelación, tiempo agotado, `AbortError`, transmisión cortada— y ahí no se
 * toca ni la memoria, ni la copia local, ni el remoto.
 */
import { LocalFinalCopy } from "../services/matchSnapshotService";

/** Aviso exacto cuando el análisis se generó pero no se pudo sincronizar. */
export const TACTICAL_SYNC_FAILED_MESSAGE =
  "Informe generado, pero no se pudo sincronizar. Puedes exportarlo ahora.";

export type TacticalTargets = {
  /** Copia local a actualizar, o null si el partido se abrió desde remoto. */
  localCopyId: string | null;
  /** Fila remota a actualizar, o null si el partido nunca se sincronizó. */
  remoteId: string | null;
};

/**
 * A dónde hay que escribir el análisis de ESTE partido.
 *
 * Los dos casos que el encargo pide resolver:
 *
 *   · abierto por su `remoteId` → no hay copia local, el id de la ruta ES el
 *     remoto;
 *   · abierto por una copia local sincronizada → la copia manda, y su
 *     `remoteId` es el destino remoto.
 *
 * Una copia local SIN sincronizar devuelve `remoteId: null`: no hay fila que
 * actualizar y no se inventa ninguna.
 */
export function resolveTacticalTargets(
  local: LocalFinalCopy | null | undefined,
  routeId: string | null | undefined,
): TacticalTargets {
  if (local) {
    return { localCopyId: local.id, remoteId: local.remoteId ?? null };
  }
  const id = (routeId ?? "").trim();
  return { localCopyId: null, remoteId: id ? id : null };
}

/**
 * ¿Es este un informe COMPLETO que merece guardarse?
 *
 * Un texto vacío no sustituye a uno anterior —sería borrar lo bueno sin haber
 * traído nada mejor— y un informe que no llegó entero no se guarda jamás.
 */
export function isPersistableAnalysis(text: string | null | undefined, partial = false): boolean {
  if (partial) return false;
  return !!text && text.trim().length > 0;
}

export type TacticalSyncState =
  /** No hay nada remoto que actualizar: el partido solo vive aquí. */
  | "sin-remoto"
  /** Guardado también en el historial remoto. */
  | "sincronizado"
  /** Generado y disponible, pero el remoto no lo recibió. */
  | "fallo";

/**
 * Cómo se le cuenta al usuario el estado de la sincronización.
 *
 * `fallo` NO es «informe incompleto»: el informe está entero y se puede
 * exportar ahora mismo. Confundir las dos cosas llevaría a regenerarlo, que
 * es exactamente lo que no hay que hacer.
 */
export function describeTacticalSync(state: TacticalSyncState): string | null {
  return state === "fallo" ? TACTICAL_SYNC_FAILED_MESSAGE : null;
}
