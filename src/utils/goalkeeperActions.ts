/**
 * src/utils/goalkeeperActions.ts
 *
 * Catálogo único de acciones de portero: taxonomía, etiquetas y predicados.
 * Función pura, sin React y sin DOM.
 *
 * Existe para que captura, estadísticas, mapas, informes y exportaciones
 * clasifiquen y nombren cada acción EXACTAMENTE igual. La auditoría de Fase 4
 * encontró el problema contrario: el mismo evento se rotulaba "PARADA" al
 * capturarlo y "Despeje" al leerlo, porque cada superficie tenía su propia
 * tabla.
 *
 * TAXONOMÍA
 * ---------
 *   SAVE          Parada genérica (botón rápido por defecto)
 *   SAVE_CATCH    Blocaje / atrapada
 *   SAVE_DEFLECT  Despeje / rechace
 *   EXIT          Salida / intervención
 *   SAVE_PARRY    CONGELADO — histórico, nunca se vuelve a producir
 *   GOAL_CONCEDED Histórico; los goles nuevos se derivan del GOAL rival
 *
 * POR QUÉ SAVE_PARRY QUEDA CONGELADO
 * ----------------------------------
 * Hasta Fase 4 era el único tipo producible, y se emitía bajo un botón que
 * decía "PARADA". Sus eventos NO son despejes: son paradas de subtipo
 * desconocido. Reutilizarlo para el despeje habría reetiquetado datos
 * históricos con una información que nadie registró.
 */
import { ActionType, GameEvent, GoalieAction, Player, Role } from "../types/futsal";
import { Zone12Id, isZone12Id, mirrorZone12 } from "./fieldZones";
import { classifyZone } from "./legacyZoneMap";

// ── TAXONOMÍA ───────────────────────────────────────────────────────────

/** Paradas que la captura PUEDE emitir a partir de Fase 4. */
export const PRODUCIBLE_SAVE_TYPES: readonly GoalieAction[] = [
  GoalieAction.SAVE,
  GoalieAction.SAVE_CATCH,
  GoalieAction.SAVE_DEFLECT,
];

/**
 * TODOS los tipos de parada, vivos e históricos. Para consumidores que
 * enumeran tipos en vez de usar un predicado (p. ej. capas de filtro): así
 * añadir un tipo nuevo no se olvida en ninguno.
 */
export const GOALIE_SAVE_TYPES: readonly GoalieAction[] = [
  GoalieAction.SAVE,
  GoalieAction.SAVE_CATCH,
  GoalieAction.SAVE_DEFLECT,
  GoalieAction.SAVE_PARRY,
];

/** Todo lo que la captura puede emitir hoy como acción de portero. */
export const PRODUCIBLE_GOALIE_ACTIONS: readonly GoalieAction[] = [
  ...PRODUCIBLE_SAVE_TYPES,
  GoalieAction.EXIT,
];

/**
 * Tipos que NO deben volver a producirse. Solo se leen, para no romper
 * partidos guardados.
 */
export const FROZEN_GOALIE_ACTIONS: readonly GoalieAction[] = [
  GoalieAction.SAVE_PARRY,
  GoalieAction.GOAL_CONCEDED,
];

export function isProducibleGoalieAction(type: unknown): boolean {
  return PRODUCIBLE_GOALIE_ACTIONS.includes(type as GoalieAction);
}

export function isFrozenGoalieAction(type: unknown): boolean {
  return FROZEN_GOALIE_ACTIONS.includes(type as GoalieAction);
}

// ── ETIQUETAS ───────────────────────────────────────────────────────────
// Única fuente. Ninguna superficie debe tener su propia tabla.

export const GOALIE_ACTION_LABEL: Record<string, string> = {
  [GoalieAction.SAVE]: "Parada",
  [GoalieAction.SAVE_CATCH]: "Blocaje",
  [GoalieAction.SAVE_DEFLECT]: "Despeje",
  [GoalieAction.EXIT]: "Salida",
  // Se nombra por lo que realmente se sabe. No se infiere que fuera despeje.
  [GoalieAction.SAVE_PARRY]: "Parada (subtipo no registrado)",
  [GoalieAction.GOAL_CONCEDED]: "Gol encajado",
  // Un disparo rival detenido registrado sin subtipo de intervención.
  [ActionType.SHOT]: "Parada (sin subtipo registrado)",
  [ActionType.GOAL]: "Gol encajado",
};

export function formatGoalieAction(type: unknown): string {
  return GOALIE_ACTION_LABEL[String(type)] ?? String(type);
}

// ── RESULTADO DE LA SALIDA ──────────────────────────────────────────────

export type ExitOutcome = "success" | "fail";

export const EXIT_OUTCOME_LABEL: Record<ExitOutcome, string> = {
  success: "Éxito",
  fail: "Fallo",
};

export function isExitOutcome(raw: unknown): raw is ExitOutcome {
  return raw === "success" || raw === "fail";
}

/** Resultado declarado de una salida, o null si el evento no lo registró. */
export function exitOutcomeOf(event: GameEvent): ExitOutcome | null {
  const raw = event.metadata?.exitOutcome;
  return isExitOutcome(raw) ? raw : null;
}

/** `"Salida · Éxito"`, o `"Salida (resultado no registrado)"` si falta. */
export function formatExit(event: GameEvent): string {
  const outcome = exitOutcomeOf(event);
  return outcome
    ? `${GOALIE_ACTION_LABEL[GoalieAction.EXIT]} · ${EXIT_OUTCOME_LABEL[outcome]}`
    : "Salida (resultado no registrado)";
}

// ── PREDICADOS ──────────────────────────────────────────────────────────
// Cabecera, mapas e informes deben clasificar cada evento con ESTOS. La
// contradicción "Blocajes 0 · Despejes 0" bajo un mapa lleno de círculos
// verdes venía de que cada uno usaba su propio criterio.

export function isExit(e: GameEvent): boolean {
  return e.type === GoalieAction.EXIT;
}

/** Gol encajado. Incluye ActionType.GOAL: al marcar el rival, el portero
 *  afectado queda añadido al evento como participante. */
export function isConcededGoal(e: GameEvent): boolean {
  return e.type === GoalieAction.GOAL_CONCEDED || e.type === ActionType.GOAL;
}

/** Parada con subtipo explícito registrado (los tres tipos vivos). */
export function isTypedSave(e: GameEvent): boolean {
  return PRODUCIBLE_SAVE_TYPES.includes(e.type as GoalieAction);
}

/**
 * Parada cuyo subtipo NO consta: o bien un SAVE_PARRY histórico, o bien un
 * disparo rival a puerta detenido y registrado como ActionType.SHOT.
 */
export function isUnspecifiedSave(e: GameEvent): boolean {
  if (e.type === GoalieAction.SAVE_PARRY) return true;
  return e.type === ActionType.SHOT && e.destinationGrid?.toUpperCase() !== "OUT";
}

export function isAnySave(e: GameEvent): boolean {
  return isTypedSave(e) || isUnspecifiedSave(e);
}

/** ¿El evento lleva zona de portería, y por tanto el mapa puede dibujarlo? */
export function hasGoalZone(e: GameEvent): boolean {
  return !!(e.destinationGrid || e.metadata?.zone);
}

/** Cualquier acción que cuente como intervención del portero. */
export function isGoalieIntervention(e: GameEvent): boolean {
  return isAnySave(e) || isConcededGoal(e) || isExit(e);
}

// ── PERSPECTIVA DE LOS MAPAS (corrección del problema A) ────────────────

/**
 * Devuelve el sector de ORIGEN DEL TIRO de un evento, expresado siempre en la
 * perspectiva del ATACANTE, que es la que responde a "¿desde dónde me tiran?".
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * Los sectores se guardan en la perspectiva del equipo que EJECUTA la acción.
 * El mapa de origen del portero mezcla dos fuentes:
 *
 *   - Tiros del rival  → perspectiva del rival  → Z4 = portería del portero
 *   - Paradas propias  → perspectiva del portero → Z1 = portería del portero
 *
 * Es decir, un mismo lugar físico caía en Z4 por una fuente y en Z1 por la
 * otra, y el mapa las sumaba. Aquí se espejan los eventos propios del portero
 * para que ambas fuentes hablen el mismo idioma.
 *
 * La corrección es de INTERPRETACIÓN: no se toca ni se migra ningún evento
 * almacenado.
 *
 * Devuelve null si el evento no tiene sector del sistema nuevo — los datos
 * históricos `A1-C3` no se espejan, porque su perspectiva nunca se registró.
 */
export function shotOriginFromAttackerView(
  event: GameEvent,
  goalieIsOpponent: boolean,
): Zone12Id | null {
  const zone = typeof event.originGrid === "string" ? event.originGrid.toUpperCase() : null;
  if (!isZone12Id(zone)) return null;

  // ¿El evento lo ejecutó el equipo del propio portero? Entonces está en la
  // perspectiva contraria a la del atacante y hay que espejarlo.
  const eventIsOwnTeam = !!event.metadata?.isOpponent === goalieIsOpponent;
  return eventIsOwnTeam ? mirrorZone12(zone) : zone;
}

/**
 * Sector de origen tal cual se guardó, sin espejar. Para datos históricos, que
 * se siguen mostrando en su rejilla y con su aviso.
 */
export function rawOriginZone(event: GameEvent): string | null {
  const ref = classifyZone(event.originGrid);
  return ref && ref.kind !== "unknown" ? ref.id : null;
}

/**
 * ¿Esta acción admite zona de intervención del portero?
 *
 * Las paradas con tipo propio y las salidas. Siempre OPCIONAL: omitirla no
 * impide registrar la acción.
 */
export function acceptsGoalkeeperZone(type: unknown): boolean {
  return isProducibleGoalieAction(type);
}

// ── ATRIBUCIÓN A UN PORTERO CONCRETO ────────────────────────────────────

/**
 * ¿Este evento es atribuible a este portero?
 *
 * 1. Si playerIds lo incluye, es suyo sin ambigüedad.
 * 2. Para un disparo/gol del RIVAL, manda onPitchPlayerIds — el dato real del
 *    momento del evento, nunca el estado final `isOnPitch`.
 * 3. Sin onPitchPlayerIds (evento antiguo), solo se atribuye si este portero
 *    era el único relevante de su equipo. Se prefiere infra-contar a
 *    mal-atribuir.
 */
export function isEventAttributableToGoalie(
  event: GameEvent,
  goalie: Pick<Player, "id" | "isOpponent">,
  isOnlyRelevantGoalkeeper: boolean,
): boolean {
  if (event.playerIds.includes(goalie.id)) return true;

  const isRivalEvent = (event.metadata?.isOpponent ?? false) !== goalie.isOpponent;
  if (!isRivalEvent) return false;

  if (event.onPitchPlayerIds) return event.onPitchPlayerIds.includes(goalie.id);
  return isOnlyRelevantGoalkeeper;
}

/**
 * Portero al que se atribuyó un evento, para poder DESHACERLO sobre el mismo.
 *
 * Antes, handleDeleteEvent decidía a quién descontar a partir del rol y del
 * bando ACTUALES del jugador, no de la identidad con la que se registró. Aquí
 * se usa la identidad persistida en el propio evento.
 */
export function attributedGoalieId(
  event: GameEvent,
  players: Pick<Player, "id" | "role" | "isOpponent">[],
): string | null {
  const goalieIds = new Set(
    players.filter((p) => p.role === Role.GOALKEEPER).map((p) => p.id),
  );
  const fromEvent = event.playerIds.find((id) => goalieIds.has(id));
  return fromEvent ?? null;
}

// ── ESTADÍSTICAS DEL PORTERO ────────────────────────────────────────────

export type GoalieStatDelta = {
  saves: number;
  conceded: number;
  exits: number;
  exitsSuccess: number;
};

const NO_DELTA: GoalieStatDelta = { saves: 0, conceded: 0, exits: 0, exitsSuccess: 0 };

/**
 * Cuánto suma un evento a las estadísticas de UN portero concreto.
 *
 * Fuente única para registrar y para deshacer: si una acción suma aquí, al
 * borrarla se resta exactamente lo mismo. Antes eran dos bloques de código
 * distintos y podían desalinearse.
 *
 * DECIDE POR IDENTIDAD, NO POR ROL ACTUAL
 * ---------------------------------------
 * Usa el bando del jugador y el bando registrado EN EL EVENTO. Deshacer no
 * depende de quién esté en pista ahora ni de qué portero sea el activo.
 *
 * CORRIGE UN DOBLE CONTEO REAL
 * ----------------------------
 * En la captura anterior, una parada del portero local añadía al portero
 * RIVAL a `playerIds` (como `targetGoalieId`) y le acreditaba también la
 * parada. Aquí una parada solo la suma el portero de SU MISMO bando que el
 * evento; un disparo detenido (ActionType.SHOT) solo lo suma el portero del
 * bando CONTRARIO, que es quien lo encaró.
 */
export function goalieStatsDelta(
  event: GameEvent,
  player: Pick<Player, "id" | "role" | "isOpponent">,
): GoalieStatDelta {
  if (player.role !== Role.GOALKEEPER) return NO_DELTA;
  if (!event.playerIds.includes(player.id)) return NO_DELTA;

  const eventIsOpponent = !!event.metadata?.isOpponent;
  const sameTeam = player.isOpponent === eventIsOpponent;

  // Gol encajado: lo encaja el portero del bando contrario al del evento.
  if (isConcededGoal(event)) {
    return sameTeam ? NO_DELTA : { ...NO_DELTA, conceded: 1 };
  }

  // Parada con tipo propio de portero: la firma el portero de ese bando.
  if (isTypedSave(event) || event.type === GoalieAction.SAVE_PARRY) {
    return sameTeam ? { ...NO_DELTA, saves: 1 } : NO_DELTA;
  }

  // Disparo rival detenido y registrado como SHOT: lo para el portero
  // contrario, y solo cuenta si fue entre los tres palos.
  if (event.type === ActionType.SHOT) {
    const onTarget = event.destinationGrid?.toUpperCase() !== "OUT";
    return !sameTeam && onTarget ? { ...NO_DELTA, saves: 1 } : NO_DELTA;
  }

  // Salida: siempre del portero de su propio bando. El éxito solo suma si se
  // registró; nunca se infiere.
  if (isExit(event)) {
    if (!sameTeam) return NO_DELTA;
    return {
      ...NO_DELTA,
      exits: 1,
      exitsSuccess: exitOutcomeOf(event) === "success" ? 1 : 0,
    };
  }

  return NO_DELTA;
}

/**
 * ¿Este evento pertenece al informe de ESTE portero?
 *
 * No basta con que `playerIds` lo incluya. La captura anterior a Fase 4 metía
 * también al portero RIVAL en la parada del portero local, de modo que un
 * partido histórico acredita la misma parada a los dos. Aquí se resuelve por
 * el bando registrado EN EL EVENTO, igual que goalieStatsDelta:
 *
 *   - parada o salida  → la firma el portero de SU MISMO bando
 *   - disparo o gol    → la encara el portero del bando CONTRARIO
 *
 * Es corrección de LECTURA: ningún evento almacenado se modifica.
 */
export function isGoalieEventOwnedBy(
  event: GameEvent,
  player: Pick<Player, "id" | "role" | "isOpponent">,
): boolean {
  if (player.role !== Role.GOALKEEPER) return false;
  if (!event.playerIds.includes(player.id)) return false;

  // El filtro se ciñe EXACTAMENTE al caso que tuvo el bug: las paradas y las
  // salidas, que son acciones firmadas por el portero y donde la captura
  // anterior colaba también al portero rival. Se exige que el evento sea de
  // su mismo bando.
  if (isTypedSave(event) || event.type === GoalieAction.SAVE_PARRY || isExit(event)) {
    return player.isOpponent === !!event.metadata?.isOpponent;
  }

  // El resto (disparo encarado, gol encajado, acciones propias como jugador)
  // nunca sumó a dos porteros: solo se añadía uno a playerIds. Se respeta la
  // atribución registrada, que es la única fuente fiable para datos antiguos.
  return true;
}

/** ¿Este evento debe añadir al portero rival a playerIds como objetivo? */
export function eventTargetsOpposingGoalie(type: unknown): boolean {
  // Solo un disparo o un gol tienen "portero objetivo". Una parada la ejecuta
  // un portero: no crea objetivo en el otro, y añadirlo era justo el origen
  // del doble conteo.
  return (
    type === ActionType.SHOT ||
    type === ActionType.GOAL ||
    type === GoalieAction.GOAL_CONCEDED
  );
}
