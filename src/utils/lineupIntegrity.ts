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
 * Índice de slot EFECTIVO para un pitchPosition dado, exactamente con la
 * misma normalización tanto para decidir "qué slot ocupa este jugador al
 * renderizar" como para decidir "qué slots están ocupados" — evita que un
 * pitchPosition inválido/indefinido/fuera de rango se renderice en un slot
 * (por defecto el 0, el del portero) que a la vez se siga considerando
 * libre por otro cálculo que no aplicase el mismo fallback.
 */
export function effectiveSlotIndex(
  pitchPosition: number | undefined,
  slotsLength: number,
): number {
  if (
    pitchPosition !== undefined &&
    Number.isInteger(pitchPosition) &&
    pitchPosition >= 0 &&
    pitchPosition < slotsLength
  ) {
    return pitchPosition;
  }
  return 0;
}
