/**
 * src/utils/lineupIntegrity.ts
 *
 * Reglas de integridad de alineación, independientes de dónde se originan
 * los datos (PreMatch al iniciar partido, o el propio MatchTracker al
 * renderizar). Funciones puras y deterministas, sin efectos secundarios.
 *
 * PRINCIPIOS (fijados por el encargo):
 * - La identidad del jugador es player.id. pitchPosition es solo posición
 *   de pista, nunca identidad.
 * - Un slot solo puede representar un player.id; un player.id solo puede
 *   ocupar un slot.
 * - Staff (COACH/DELEGATE) nunca puede tener pitchPosition.
 * - Solo un portero puede estar activo como portero.
 */
import { Role } from "../types/futsal";

// slot 0 es siempre el del portero en todos los GameState de MatchTracker
// (PITCH_SYSTEMS[*][0].label === "POR"), y el resto de sistemas usan como
// máximo 5 slots (1 portero + hasta 4 jugadores de campo).
export const GOALKEEPER_SLOT_INDEX = 0;
export const MAX_OWN_TEAM_SLOTS = 5;

export type LineupCandidate = {
  id: string;
  role: Role;
  /** ¿Este candidato "quiere" estar en pista? (isStarter en PreMatch, o
   *  isOnPitch actual en una re-normalización de un matchData existente). */
  wantsOnPitch: boolean;
};

export type NormalizedLineupEntry = {
  id: string;
  isOnPitch: boolean;
  pitchPosition: number | undefined;
};

/**
 * Normaliza una lista de candidatos de UN equipo a una alineación válida:
 * - staff (COACH/DELEGATE) siempre isOnPitch:false, pitchPosition:undefined,
 *   sin importar wantsOnPitch;
 * - como mucho 1 portero activo: el PRIMER candidato con role=GOALKEEPER y
 *   wantsOnPitch=true (en el orden de la lista de entrada) ocupa el slot 0;
 *   cualquier portero adicional que también quisiera estar en pista queda
 *   en banquillo (isOnPitch:false) — se conserva en la lista devuelta, solo
 *   cambia su estado. Regla determinista y documentada: "primero en la
 *   lista, primero en pista" (normalmente coincide con el orden en que
 *   aparecen en la plantilla/PreMatch).
 * - como mucho 4 jugadores de campo activos, pitchPosition 1-4, en el mismo
 *   orden de aparición;
 * - el resto queda en banquillo;
 * - jamás se repite un pitchPosition ni se asigna fuera de 0-4.
 */
export function normalizeLineup(candidates: LineupCandidate[]): NormalizedLineupEntry[] {
  const result: NormalizedLineupEntry[] = [];
  let goalkeeperAssigned = false;
  let nextFieldSlot = GOALKEEPER_SLOT_INDEX + 1;

  for (const c of candidates) {
    if (c.role === Role.COACH || c.role === Role.DELEGATE) {
      result.push({ id: c.id, isOnPitch: false, pitchPosition: undefined });
      continue;
    }
    if (!c.wantsOnPitch) {
      result.push({ id: c.id, isOnPitch: false, pitchPosition: undefined });
      continue;
    }
    if (c.role === Role.GOALKEEPER) {
      if (!goalkeeperAssigned) {
        result.push({ id: c.id, isOnPitch: true, pitchPosition: GOALKEEPER_SLOT_INDEX });
        goalkeeperAssigned = true;
      } else {
        // Segundo (o más) portero candidato: se conserva en la plantilla,
        // pero no puede compartir el slot de portero — banquillo.
        result.push({ id: c.id, isOnPitch: false, pitchPosition: undefined });
      }
      continue;
    }
    // Jugador de campo.
    if (nextFieldSlot < MAX_OWN_TEAM_SLOTS) {
      result.push({ id: c.id, isOnPitch: true, pitchPosition: nextFieldSlot });
      nextFieldSlot++;
    } else {
      result.push({ id: c.id, isOnPitch: false, pitchPosition: undefined });
    }
  }
  return result;
}

/**
 * ¿Puede este rol ocupar este slot?
 * - Slot 0 (portero): SOLO Role.GOALKEEPER.
 * - Resto de slots (1..slotsLength-1): nunca GOALKEEPER, nunca COACH,
 *   nunca DELEGATE.
 */
export function isRoleAllowedInSlot(role: Role, slotIndex: number): boolean {
  if (role === Role.COACH || role === Role.DELEGATE) return false;
  if (slotIndex === GOALKEEPER_SLOT_INDEX) return role === Role.GOALKEEPER;
  return role !== Role.GOALKEEPER;
}

/**
 * Busca un slot libre COMPATIBLE con el rol dado, entre los slots ya
 * ocupados (occupiedIndices). Reemplaza cualquier bucle "primer slot
 * libre 0..4" que no distinguía portero/jugador de campo:
 * - GOALKEEPER: solo el slot 0, y solo si está libre.
 * - COACH/DELEGATE: nunca hay slot (siempre undefined) — staff no entra
 *   en pista por esta vía.
 * - Resto (jugador de campo): el primer slot libre entre 1..slotsLength-1.
 * Devuelve undefined si no hay slot disponible (equipo completo o rol sin
 * hueco), en cuyo caso el llamante NO debe introducir al jugador en pista.
 */
export function findAvailableSlotForRole(
  role: Role,
  occupiedIndices: Set<number>,
  slotsLength: number = MAX_OWN_TEAM_SLOTS,
): number | undefined {
  if (role === Role.COACH || role === Role.DELEGATE) return undefined;
  if (role === Role.GOALKEEPER) {
    return occupiedIndices.has(GOALKEEPER_SLOT_INDEX) ? undefined : GOALKEEPER_SLOT_INDEX;
  }
  for (let i = GOALKEEPER_SLOT_INDEX + 1; i < slotsLength; i++) {
    if (!occupiedIndices.has(i)) return i;
  }
  return undefined;
}

export type RuntimeLineupPlayer = {
  id: string;
  role: Role;
  isOnPitch: boolean;
  pitchPosition?: number;
};

/**
 * Revalida/normaliza el estado runtime YA EXISTENTE de un equipo (p.ej. al
 * ingerir un matchSetup o un snapshot recuperado, que pudieran contener
 * datos corruptos o de una versión anterior sin estas garantías).
 * Reutiliza normalizeLineup: el estado actual (isOnPitch) se trata como
 * "quiere estar en pista", y se aplican las mismas reglas deterministas
 * (1 portero, máx. 4 de campo, sin duplicados, staff nunca en pista, sin
 * segundo sistema de validación paralelo).
 */
export function normalizeRuntimeLineup(players: RuntimeLineupPlayer[]): NormalizedLineupEntry[] {
  const candidates: LineupCandidate[] = players.map((p) => ({
    id: p.id,
    role: p.role,
    wantsOnPitch: p.isOnPitch,
  }));
  return normalizeLineup(candidates);
}

/**
 * Normaliza un array completo de jugadores (ambos equipos, local + rival)
 * preservando el orden original y CUALQUIER otro campo del objeto (stats,
 * nombre, etc.) — solo corrige isOnPitch/pitchPosition. Pensada para los
 * puntos de INGESTIÓN de datos externos/no confiables (matchSetup desde
 * PreMatch, o un snapshot recuperado tras un cierre inesperado), no para
 * cada actualización en caliente (esas ya se validan en cada handler).
 */
export function normalizeMatchPlayers<
  T extends RuntimeLineupPlayer & { isOpponent: boolean },
>(players: T[]): T[] {
  const local = players.filter((p) => !p.isOpponent);
  const rival = players.filter((p) => p.isOpponent);

  const applyFix = (group: T[]): T[] => {
    const normalized = new Map(normalizeRuntimeLineup(group).map((n) => [n.id, n]));
    return group.map((p) => {
      const n = normalized.get(p.id);
      if (!n) return p;
      return { ...p, isOnPitch: n.isOnPitch, pitchPosition: n.pitchPosition };
    });
  };

  const fixedById = new Map(
    [...applyFix(local), ...applyFix(rival)].map((p) => [p.id, p]),
  );
  return players.map((p) => fixedById.get(p.id) ?? p);
}

/**
 * Índice de slot EFECTIVO para un pitchPosition dado.
 *
 * DECISIÓN DE DISEÑO (revisada a petición explícita): la versión anterior
 * devolvía 0 (el slot del portero) para cualquier posición inválida, lo
 * que podía canalizar datos corruptos/legacy silenciosamente hacia el
 * slot POR. Ahora devuelve `null` -- el llamante debe tratarlo como "no
 * renderizable" (omitir esa tarjeta) en lugar de asumir el slot 0. Con
 * los guardas de escritura añadidos en cada handler (isRoleAllowedInSlot/
 * findAvailableSlotForRole) y la normalización aplicada al ingerir
 * matchSetup/snapshots (normalizeRuntimeLineup), un pitchPosition inválido
 * no debería producirse ya en uso normal; esto es la última línea de
 * defensa para datos legacy/corruptos que se hubieran colado igualmente.
 */
export function effectiveSlotIndex(
  pitchPosition: number | undefined,
  slotsLength: number,
): number | null {
  if (
    pitchPosition !== undefined &&
    Number.isInteger(pitchPosition) &&
    pitchPosition >= 0 &&
    pitchPosition < slotsLength
  ) {
    return pitchPosition;
  }
  return null;
}
