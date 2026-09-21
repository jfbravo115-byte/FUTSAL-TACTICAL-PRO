/**
 * src/utils/matchContexts.ts
 *
 * Ventanas de contexto del partido: cuándo se jugó en superioridad, en
 * inferioridad o con portero-jugador, y qué pasó dentro de cada una.
 * Funciones puras, sin React y sin DOM.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * En un partido real se registraron cinco tiros durante una superioridad por
 * expulsión rival y el informe no decía nada de ello. No era un fallo de la
 * IA ni de la captura: los cinco tiros llevaban escrito su contexto, y los
 * cambios de contexto llevaban años guardándose como eventos
 * `FORMATION_CHANGE`. Simplemente no los leía nadie.
 *
 * LA FUENTE DE VERDAD ES `FORMATION_CHANGE`
 * -----------------------------------------
 * Una ventana la ABRE y la CIERRA una declaración explícita del operador,
 * nunca una deducción. `handleGameStateChange` guarda en el propio partido un
 * evento con el estado nuevo, su parte, su minuto, el marcador y quién estaba
 * en pista.
 *
 * `GameEvent.gameState` no sirve como fuente principal, y conviene saber por
 * qué: se estampa en todos los eventos con el estado de NUESTRO equipo, sea
 * quien sea el que ejecuta la acción. Para el rival diría algo falso. Aquí se
 * usa solo como comprobación.
 *
 * LO QUE NO SE HACE, Y NO ES UN OLVIDO
 * ------------------------------------
 *   - Una tarjeta roja NO abre una ventana. Si el operador no declaró la
 *     superioridad, no la hubo a efectos de datos: no consta.
 *   - No se cuentan dos minutos de sanción. La app no los registra y el
 *     reglamento no es un dato observado.
 *   - Un gol no cierra una superioridad. Eso es reglamento, no registro.
 *   - Una ventana no cruza el descanso. El reloj se reinicia a cero al
 *     empezar la segunda parte, así que sumar a través del cambio de parte
 *     daría una duración inventada.
 *
 * SUPERIORIDAD Y PORTERO-JUGADOR NO SON LO MISMO
 * ----------------------------------------------
 * Aunque en los dos casos haya cinco contra cuatro sobre la pista. Una la
 * impone una expulsión y la otra la elige el entrenador, y confundirlas haría
 * ilegible cualquier conclusión sobre ambas. Son tipos distintos y jamás se
 * agregan juntas.
 */
import { ActionType, GameEvent, GameState, MatchData, Period } from "../types/futsal";
import { chronologicalIndexed } from "./eventOrder";
import { isShotAttempt, summarizeShots, ShotTally } from "./shotModel";

// ── TIPOS DE CONTEXTO ───────────────────────────────────────────────────

export type MatchContextType =
  | "even"
  | "superiority_expulsion"
  | "inferiority_expulsion"
  | "gk_player_own"
  | "gk_player_rival";

/**
 * Traducción del estado declarado en la captura al tipo de contexto.
 *
 * `THREE_VS_THREE` y `FOUR_VS_FOUR` son juego igualado: distintos sistemas,
 * ninguna ventaja numérica. Un estado desconocido —un partido guardado con un
 * valor que ya no existe— se trata como igualado y no inventa una ventaja.
 */
export const CONTEXT_BY_GAME_STATE: Record<string, MatchContextType> = {
  [GameState.FOUR_VS_FOUR]: "even",
  [GameState.THREE_VS_THREE]: "even",
  [GameState.SUPERIORITY]: "superiority_expulsion",
  [GameState.INFERIORITY]: "inferiority_expulsion",
  [GameState.PJ_ATTACK]: "gk_player_own",
  [GameState.PJ_DEFENSE]: "gk_player_rival",
};

export function contextTypeOf(gameState: unknown): MatchContextType {
  return CONTEXT_BY_GAME_STATE[String(gameState)] ?? "even";
}

/** Etiquetas de usuario. El informe NUNCA imprime SUPERIORITY ni PJ_ATTACK. */
export const MATCH_CONTEXT_LABEL: Record<MatchContextType, string> = {
  even: "Juego igualado",
  superiority_expulsion: "Superioridad por expulsión rival",
  inferiority_expulsion: "Inferioridad por expulsión propia",
  gk_player_own: "5x4 · Portero-jugador propio",
  gk_player_rival: "4x5 · Portero-jugador rival",
};

/** Los contextos que merecen una sección propia. El juego igualado no. */
export const SPECIAL_CONTEXT_TYPES: readonly MatchContextType[] = [
  "superiority_expulsion",
  "inferiority_expulsion",
  "gk_player_own",
  "gk_player_rival",
];

export function isSpecialContext(type: MatchContextType): boolean {
  return SPECIAL_CONTEXT_TYPES.includes(type);
}

/** Texto para una ventana cuyo final no se declaró. No se estima nunca. */
export const UNKNOWN_DURATION_LABEL = "duración no disponible";

// ── VENTANA ─────────────────────────────────────────────────────────────

export type ContextTally = ShotTally & {
  recoveries: number;
  turnovers: number;
  fouls: number;
  corners: number;
};

export type MatchContext = {
  type: MatchContextType;
  /** De quién es la declaración que abrió la ventana. */
  perspective: "team" | "opponent";
  period: Period;
  /** Milisegundos de juego dentro de la parte, tal como los guarda el reloj. */
  start: number;
  /** null si la ventana no se cerró con una declaración explícita. */
  end: number | null;
  /** null cuando no hay cierre: no se estima con el final de la parte. */
  duration: number | null;
  startScore: { team: number; opponent: number };
  /** null cuando no hay cierre declarado. */
  endScore: { team: number; opponent: number } | null;
  /** Id del FORMATION_CHANGE que la abrió. */
  openedBy: string;
  /** Id del que la cerró, o null. */
  closedBy: string | null;
  eventIds: string[];
  tally: ContextTally;
};

// ── PREDICADOS DE AGREGACIÓN ────────────────────────────────────────────
//
// Los tiros los clasifica shotModel y solo shotModel. Aquí no vuelve a
// definirse qué es un tiro, uno a portería, uno fuera ni uno bloqueado.

const isRecovery = (e: GameEvent) =>
  e.type === ActionType.STEAL || e.type === ActionType.INTERCEPTION;

const isTurnover = (e: GameEvent) =>
  e.type === ActionType.LOSS || e.type === ActionType.UNFORCED_ERROR;

const isFoul = (e: GameEvent) => e.type === ActionType.FOUL;
const isCorner = (e: GameEvent) => e.type === ActionType.CORNER;

/**
 * Acciones que se atribuyen a una ventana.
 *
 * `FORMATION_CHANGE` y `SUBSTITUTION` quedan fuera: describen la gestión del
 * partido, no lo que ocurrió en juego, y contarlos ensuciaría los agregados.
 */
export function isCountableInContext(e: GameEvent): boolean {
  return (
    isShotAttempt(e) || isRecovery(e) || isTurnover(e) || isFoul(e) || isCorner(e)
  );
}

export function emptyContextTally(): ContextTally {
  return {
    ...summarizeShots([]),
    recoveries: 0,
    turnovers: 0,
    fouls: 0,
    corners: 0,
  };
}

/**
 * Agregados de una ventana, acotados al bando que la declaró.
 *
 * Una superioridad NUESTRA habla de lo que hizo NUESTRO equipo: mezclar ahí
 * los tiros del rival respondería a otra pregunta.
 */
export function tallyContextEvents(events: GameEvent[], opponent: boolean): ContextTally {
  const propios = events.filter((e) => !!e.metadata?.isOpponent === opponent);
  return {
    ...summarizeShots(propios),
    recoveries: propios.filter(isRecovery).length,
    turnovers: propios.filter(isTurnover).length,
    fouls: propios.filter(isFoul).length,
    corners: propios.filter(isCorner).length,
  };
}

// ── CONSTRUCCIÓN ────────────────────────────────────────────────────────

const isFormationChange = (e: GameEvent) => e.type === ActionType.FORMATION_CHANGE;

/**
 * Las ventanas de contexto del partido, en orden cronológico.
 *
 * Se recorre el partido una sola vez, en el orden real de los hechos
 * (`eventOrder`), manteniendo una ventana abierta por bando. Un
 * `FORMATION_CHANGE` cierra la ventana de SU bando y abre la siguiente; el
 * del otro bando no la toca.
 *
 * El cambio de parte cierra sin final declarado: el reloj se reinicia y
 * cualquier duración a través del descanso sería inventada.
 *
 * `includeEven` incorpora también los tramos de juego igualado. Por defecto
 * quedan fuera, porque el informe habla de situaciones especiales y el juego
 * igualado es el resto del partido.
 */
export function buildMatchContexts(
  matchData: MatchData,
  { includeEven = false }: { includeEven?: boolean } = {},
): MatchContext[] {
  const ordenados = chronologicalIndexed(matchData?.events || []);

  type Abierta = {
    ctx: Omit<MatchContext, "tally" | "eventIds"> & { eventIds: string[] };
  };
  const abiertas: Partial<Record<"team" | "opponent", Abierta>> = {};
  const cerradas: MatchContext[] = [];
  const porId = new Map<string, GameEvent>();
  for (const { event } of ordenados) porId.set(event.id, event);

  const cerrar = (
    lado: "team" | "opponent",
    cierre: GameEvent | null,
  ) => {
    const abierta = abiertas[lado];
    if (!abierta) return;
    const ctx = abierta.ctx;
    const eventos = ctx.eventIds.map((id) => porId.get(id)!).filter(Boolean);
    cerradas.push({
      ...ctx,
      end: cierre ? cierre.timestamp : null,
      duration: cierre ? Math.max(0, cierre.timestamp - ctx.start) : null,
      endScore: cierre?.scoreAtEvent ? { ...cierre.scoreAtEvent } : null,
      closedBy: cierre ? cierre.id : null,
      tally: tallyContextEvents(eventos, lado === "opponent"),
    });
    delete abiertas[lado];
  };

  let periodoActual: Period | null = null;

  for (const { event } of ordenados) {
    // Cambio de parte: nada sobrevive al descanso. Se cierra sin final
    // declarado en vez de estimarlo con el último evento de la parte.
    if (periodoActual !== null && event.period !== periodoActual) {
      cerrar("team", null);
      cerrar("opponent", null);
    }
    periodoActual = event.period;

    if (isFormationChange(event)) {
      const lado: "team" | "opponent" = event.metadata?.isOpponent ? "opponent" : "team";
      const tipo = contextTypeOf(event.gameState);
      // Una declaración del mismo estado que ya estaba abierto no parte la
      // ventana en dos: no hubo cambio de contexto.
      if (abiertas[lado]?.ctx.type === tipo) continue;
      cerrar(lado, event);
      abiertas[lado] = {
        ctx: {
          type: tipo,
          perspective: lado,
          period: event.period,
          start: event.timestamp,
          end: null,
          duration: null,
          startScore: event.scoreAtEvent
            ? { ...event.scoreAtEvent }
            : { team: 0, opponent: 0 },
          endScore: null,
          openedBy: event.id,
          closedBy: null,
          eventIds: [],
        },
      };
      continue;
    }

    if (!isCountableInContext(event)) continue;
    for (const lado of ["team", "opponent"] as const) {
      abiertas[lado]?.ctx.eventIds.push(event.id);
    }
  }

  cerrar("team", null);
  cerrar("opponent", null);

  const todas = cerradas.sort(
    (a, b) => a.period - b.period || a.start - b.start || (a.openedBy < b.openedBy ? -1 : 1),
  );
  return includeEven ? todas : todas.filter((c) => isSpecialContext(c.type));
}

/**
 * Las ventanas especiales agrupadas por tipo, para el informe.
 *
 * Suma los agregados de todas las ventanas del mismo tipo — dos
 * superioridades distintas suman sus tiros — pero conserva cada ventana
 * aparte, porque sus duraciones no se pueden sumar cuando alguna no tiene
 * final declarado.
 */
export type MatchContextGroup = {
  type: MatchContextType;
  label: string;
  windows: MatchContext[];
  /** Suma de duraciones, o null si alguna ventana no se cerró. */
  totalDuration: number | null;
  tally: ContextTally;
};

export function groupMatchContexts(contexts: MatchContext[]): MatchContextGroup[] {
  const porTipo = new Map<MatchContextType, MatchContext[]>();
  for (const c of contexts) {
    if (!porTipo.has(c.type)) porTipo.set(c.type, []);
    porTipo.get(c.type)!.push(c);
  }

  return SPECIAL_CONTEXT_TYPES.filter((t) => porTipo.has(t)).map((type) => {
    const windows = porTipo.get(type)!;
    const incompleta = windows.some((w) => w.duration === null);
    const tally = windows.reduce<ContextTally>((acc, w) => {
      const t = w.tally;
      return {
        shots: acc.shots + t.shots,
        goals: acc.goals + t.goals,
        onTarget: acc.onTarget + t.onTarget,
        offTarget: acc.offTarget + t.offTarget,
        blocked: acc.blocked + t.blocked,
        unrecorded: acc.unrecorded + t.unrecorded,
        goalkeeperInterventions:
          acc.goalkeeperInterventions + t.goalkeeperInterventions,
        resolvedByGoalkeeper: acc.resolvedByGoalkeeper + t.resolvedByGoalkeeper,
        recoveries: acc.recoveries + t.recoveries,
        turnovers: acc.turnovers + t.turnovers,
        fouls: acc.fouls + t.fouls,
        corners: acc.corners + t.corners,
      };
    }, emptyContextTally());

    return {
      type,
      label: MATCH_CONTEXT_LABEL[type],
      windows,
      totalDuration: incompleta
        ? null
        : windows.reduce((acc, w) => acc + (w.duration ?? 0), 0),
      tally,
    };
  });
}
