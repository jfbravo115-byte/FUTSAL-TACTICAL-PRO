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
import { isGoalEvent, scoresFor } from "./goalModel";
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

/** De quién es la ventaja o el portero-jugador de una ventana. */
export type ContextSide = "team" | "opponent" | "unknown";

/**
 * DE QUIÉN ES EL PORTERO-JUGADOR (o la ventaja numérica).
 *
 * Sale del ESTADO DECLARADO, no de quién tocó el botón. `GameState` se
 * estampa siempre desde la perspectiva de nuestro equipo —así está escrito
 * arriba—, así que `PJ Ataque` significa que el portero-jugador es NUESTRO
 * aunque la declaración venga marcada como del rival, y `PJ Defensa` que es
 * del rival aunque la declare nuestro banquillo.
 *
 * Confundir las dos cosas es lo que hacía que un bloque titulado «Portero-
 * jugador propio» enseñara cinco goles que eran del rival: la ventana se
 * abría en el lado que la declaraba y se contaban las acciones de ESE lado.
 *
 * Un estado que no identifica ningún bando —un partido antiguo guardado con
 * un valor que ya no existe— devuelve `"unknown"`. Entonces no se atribuye
 * nada: se dice que no se sabe.
 */
export const SIDE_BY_GAME_STATE: Record<string, ContextSide> = {
  [GameState.PJ_ATTACK]: "team",
  [GameState.SUPERIORITY]: "team",
  [GameState.PJ_DEFENSE]: "opponent",
  [GameState.INFERIORITY]: "opponent",
};

export function contextSideOf(gameState: unknown): ContextSide {
  return SIDE_BY_GAME_STATE[String(gameState)] ?? "unknown";
}

/** El bando contrario al del contexto. `unknown` no tiene contrario. */
export function otherSide(side: ContextSide): ContextSide {
  return side === "team" ? "opponent" : side === "opponent" ? "team" : "unknown";
}

/** Etiquetas de usuario. El informe NUNCA imprime SUPERIORITY ni PJ_ATTACK. */
export const MATCH_CONTEXT_LABEL: Record<MatchContextType, string> = {
  even: "Juego igualado",
  superiority_expulsion: "Superioridad por expulsión rival",
  inferiority_expulsion: "Inferioridad por expulsión propia",
  gk_player_own: "5x4 · Portero-jugador propio",
  gk_player_rival: "4x5 · Portero-jugador rival",
};

/**
 * Lo que se imprime cuando el estado declarado no identifica ningún bando.
 *
 * Es preferible a repartir las cifras por una suposición: un bloque que dice
 * de quién es cada número y otro que dice que no se sabe son los dos
 * honestos; uno que lo adivina, no.
 */
export const UNKNOWN_SIDE_LABEL = "Bando del portero-jugador no determinado";

/**
 * El contexto nombrado DENTRO de una frase, con su artículo.
 *
 * «Producción de JIMBEE durante el 5x4 de CD MURCIA» se entiende de una
 * lectura. «Concedido a JIMBEE», no. El artículo va aquí porque no todos son
 * masculinos: «durante la superioridad de…».
 */
export const CONTEXT_DURING_LABEL: Record<MatchContextType, string> = {
  even: "el juego igualado",
  superiority_expulsion: "la superioridad",
  inferiority_expulsion: "la inferioridad",
  gk_player_own: "el 5x4",
  gk_player_rival: "el 4x5",
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
  /**
   * Goles que SUBIERON AL MARCADOR de este bando durante la ventana.
   *
   * No es `goals`, que viene de `shotModel` y cuenta los goles entre los
   * REMATES de este bando. Los dos números son distintos en cuanto hay un gol
   * en propia: lo remata un equipo y lo cobra el otro. Aquí se atribuye con
   * `beneficiarySide`, que es el mismo criterio con el que se mueve el
   * marcador en todo el resto de la aplicación.
   */
  goalsBenefiting: number;
};

export type MatchContext = {
  type: MatchContextType;
  /**
   * De quién es la declaración que abrió la ventana — quién tocó el botón.
   *
   * NO es de quién es el portero-jugador: para eso está `side`. En un partido
   * real conviven las dos cosas, porque el operador puede declarar desde
   * cualquiera de los dos paneles el mismo estado de pista.
   */
  perspective: "team" | "opponent";
  /**
   * De quién es el portero-jugador (o la ventaja). Sale del estado declarado,
   * vía `contextSideOf`. `"unknown"` cuando el estado no identifica bando.
   */
  side: ContextSide;
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
  /** Lo que produjo el bando que tiene el portero-jugador. */
  production: ContextTally;
  /** Lo que produjo el OTRO bando mientras tanto: lo concedido. */
  conceded: ContextTally;
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
    // `isGoalEvent` añade el GOL EN PROPIA, que no es un remate y por eso no
    // entra por `isShotAttempt`, pero sí mueve el marcador dentro de la
    // ventana. Sin él, un 5x4 que acaba en gol en propia parecería no haber
    // producido nada.
    isShotAttempt(e) || isGoalEvent(e) || isRecovery(e) || isTurnover(e) || isFoul(e) || isCorner(e)
  );
}

export function emptyContextTally(): ContextTally {
  return {
    ...summarizeShots([]),
    recoveries: 0,
    turnovers: 0,
    fouls: 0,
    corners: 0,
    goalsBenefiting: 0,
  };
}

/**
 * Agregados de una ventana, acotados a UN bando.
 *
 * Quién EJECUTA cada acción lo dice `metadata.isOpponent`, que es el único
 * sitio donde consta. Quién COBRA cada gol lo dice `beneficiarySide`, que no
 * es lo mismo: un gol en propia lo remata un equipo y lo cobra el otro.
 *
 * Nunca se mezclan los dos bandos en un mismo recuento. Si se quiere saber
 * qué pasó en los dos lados de una ventana, se piden dos recuentos.
 */
export function tallyContextEvents(events: GameEvent[], opponent: boolean): ContextTally {
  const lado = opponent ? "opponent" : "team";
  const propios = events.filter((e) => !!e.metadata?.isOpponent === opponent);
  return {
    ...summarizeShots(propios),
    recoveries: propios.filter(isRecovery).length,
    turnovers: propios.filter(isTurnover).length,
    fouls: propios.filter(isFoul).length,
    corners: propios.filter(isCorner).length,
    // Sobre TODOS los eventos de la ventana, no solo los de este bando: el
    // gol que nos sube al marcador puede haberlo rematado el rival.
    goalsBenefiting: events.filter((e) => scoresFor(e, lado)).length,
  };
}

// ── CONSTRUCCIÓN ────────────────────────────────────────────────────────

const isFormationChange = (e: GameEvent) => e.type === ActionType.FORMATION_CHANGE;

/**
 * Las ventanas de contexto del partido, en orden cronológico.
 *
 * UNA SOLA LÍNEA DE TIEMPO, PORQUE LA PISTA ES UNA
 * ------------------------------------------------
 * `GameState` describe el estado de la PISTA, no el de un equipo: en un
 * instante dado se juega 4vs4, o con portero-jugador, o en superioridad, pero
 * no dos cosas a la vez. Por eso hay una única ventana abierta y cualquier
 * `FORMATION_CHANGE` cierra la que hubiera y abre la siguiente.
 *
 * Antes se mantenía una ventana por BANDO, abierta y cerrada por el lado que
 * declaraba (`metadata.isOpponent`). Con datos reales eso se rompe: en
 * CD MURCIA–JIMBEE el 5x4 se declaró desde el panel del rival y se cerró
 * desde el nuestro, así que la ventana del rival no la cerraba nadie, se
 * quedaba abierta hasta el final de la parte —sin final ni marcador de
 * cierre— y se solapaba con las siguientes. Los eventos del solape se
 * contaban DOS VECES, y el bloque llegó a declarar ocho goles concedidos en
 * un partido en el que se encajaron seis.
 *
 * `metadata.isOpponent` de la declaración se conserva en `perspective` —es
 * un dato real: dice desde qué panel se declaró—, pero no decide nada: de
 * quién es el portero-jugador lo dice el estado, vía `contextSideOf`.
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
    ctx: Omit<MatchContext, "production" | "conceded" | "eventIds"> & { eventIds: string[] };
  };
  let abierta: Abierta | null = null;
  const cerradas: MatchContext[] = [];
  const porId = new Map<string, GameEvent>();
  for (const { event } of ordenados) porId.set(event.id, event);

  const cerrar = (cierre: GameEvent | null) => {
    if (!abierta) return;
    const ctx = abierta.ctx;
    const eventos = ctx.eventIds.map((id) => porId.get(id)!).filter(Boolean);
    // Los dos recuentos salen del BANDO DEL CONTEXTO, no del lado que
    // declaró. Cuando el bando no se puede determinar, `production` es la
    // producción de nuestro equipo y `conceded` la del rival, y la etiqueta
    // dice que no se sabe de quién era el portero-jugador: así los dos
    // números siguen siendo ciertos y ninguno se atribuye a una ventaja que
    // nadie registró.
    const bando = ctx.side === "opponent" ? "opponent" : "team";
    cerradas.push({
      ...ctx,
      end: cierre ? cierre.timestamp : null,
      duration: cierre ? Math.max(0, cierre.timestamp - ctx.start) : null,
      endScore: cierre?.scoreAtEvent ? { ...cierre.scoreAtEvent } : null,
      closedBy: cierre ? cierre.id : null,
      production: tallyContextEvents(eventos, bando === "opponent"),
      conceded: tallyContextEvents(eventos, bando !== "opponent"),
    });
    abierta = null;
  };

  let periodoActual: Period | null = null;

  for (const { event } of ordenados) {
    // Cambio de parte: nada sobrevive al descanso. Se cierra sin final
    // declarado en vez de estimarlo con el último evento de la parte.
    if (periodoActual !== null && event.period !== periodoActual) {
      cerrar(null);
    }
    periodoActual = event.period;

    if (isFormationChange(event)) {
      const lado: "team" | "opponent" = event.metadata?.isOpponent ? "opponent" : "team";
      const tipo = contextTypeOf(event.gameState);
      // Una declaración del mismo estado que ya estaba abierto no parte la
      // ventana en dos: no hubo cambio de contexto. Da igual desde qué panel
      // se declare: la pista no cambió.
      if (abierta?.ctx.type === tipo) continue;
      cerrar(event);
      abierta = {
        ctx: {
          type: tipo,
          perspective: lado,
          side: contextSideOf(event.gameState),
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
    // Una sola ventana abierta: cada acción se cuenta UNA vez.
    abierta?.ctx.eventIds.push(event.id);
  }

  cerrar(null);

  const todas = cerradas.sort(
    (a, b) => a.period - b.period || a.start - b.start || (a.openedBy < b.openedBy ? -1 : 1),
  );
  return includeEven ? todas : todas.filter((c) => isSpecialContext(c.type));
}

/**
 * Las ventanas especiales agrupadas para el informe.
 *
 * SE AGRUPA POR TIPO **Y POR BANDO**, y los dos bandos no se suman jamás.
 * Antes se agrupaba solo por tipo, y en un partido donde el mismo estado se
 * declaró desde los dos paneles el grupo acababa sumando un tramo contado
 * desde nuestro lado con otro contado desde el del rival: el bloque «5x4 ·
 * Portero-jugador propio» de CD MURCIA–JIMBEE enseñaba cinco goles que eran
 * los que nos metieron.
 *
 * Dentro de cada grupo siguen conviviendo dos recuentos, que tampoco se
 * suman entre sí: lo que PRODUJO el bando que tiene el portero-jugador y lo
 * que CONCEDIÓ al otro.
 *
 * Las duraciones sí se suman, salvo que alguna ventana no tenga cierre
 * declarado: entonces el total es `null` y no se estima.
 */
export type MatchContextGroup = {
  type: MatchContextType;
  side: ContextSide;
  /** «5x4 · Portero-jugador propio», o el aviso cuando el bando no consta. */
  label: string;
  windows: MatchContext[];
  /** Suma de duraciones, o null si alguna ventana no se cerró. */
  totalDuration: number | null;
  /** Producción del bando del contexto. */
  production: ContextTally;
  /** Producción del otro bando durante esas mismas ventanas. */
  conceded: ContextTally;
};

/** Nombres de los dos equipos, para rotular de quién es cada cifra. */
export type ContextTeamNames = { teamName?: string; opponentName?: string };

function sumTallies(tallies: ContextTally[]): ContextTally {
  return tallies.reduce<ContextTally>(
    (acc, t) => ({
      shots: acc.shots + t.shots,
      goals: acc.goals + t.goals,
      onTarget: acc.onTarget + t.onTarget,
      offTarget: acc.offTarget + t.offTarget,
      blocked: acc.blocked + t.blocked,
      unrecorded: acc.unrecorded + t.unrecorded,
      goalkeeperInterventions: acc.goalkeeperInterventions + t.goalkeeperInterventions,
      resolvedByGoalkeeper: acc.resolvedByGoalkeeper + t.resolvedByGoalkeeper,
      recoveries: acc.recoveries + t.recoveries,
      turnovers: acc.turnovers + t.turnovers,
      fouls: acc.fouls + t.fouls,
      corners: acc.corners + t.corners,
      goalsBenefiting: acc.goalsBenefiting + t.goalsBenefiting,
    }),
    emptyContextTally(),
  );
}

/** Cómo se llama un bando. Sin nombre registrado, el genérico. */
export function sideName(side: ContextSide, names: ContextTeamNames = {}): string {
  if (side === "team") return names.teamName || "Equipo local";
  if (side === "opponent") return names.opponentName || "Equipo visitante";
  return "bando sin determinar";
}

export function groupMatchContexts(
  contexts: MatchContext[],
  names: ContextTeamNames = {},
): MatchContextGroup[] {
  const porClave = new Map<string, MatchContext[]>();
  for (const c of contexts) {
    const clave = `${c.type}|${c.side}`;
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave)!.push(c);
  }

  const grupos: MatchContextGroup[] = [];
  for (const type of SPECIAL_CONTEXT_TYPES) {
    for (const side of ["team", "opponent", "unknown"] as const) {
      const windows = porClave.get(`${type}|${side}`);
      if (!windows?.length) continue;
      const incompleta = windows.some((w) => w.duration === null);
      grupos.push({
        type,
        side,
        label: side === "unknown" ? UNKNOWN_SIDE_LABEL : MATCH_CONTEXT_LABEL[type],
        windows,
        totalDuration: incompleta
          ? null
          : windows.reduce((acc, w) => acc + (w.duration ?? 0), 0),
        production: sumTallies(windows.map((w) => w.production)),
        conceded: sumTallies(windows.map((w) => w.conceded)),
      });
    }
  }
  return grupos;
}

/** Rótulo de la línea de producción: «Producción de CD MURCIA». */
export function productionLabel(group: MatchContextGroup, names: ContextTeamNames = {}): string {
  if (group.side === "unknown") return "Producción de " + sideName("team", names);
  return `Producción de ${sideName(group.side, names)}`;
}

/**
 * Rótulo del segundo bloque: de quién son esas cifras y cuándo las hizo.
 *
 * «Concedido a JIMBEE · goles a favor 5» era ambiguo hasta decir lo
 * contrario: se leía como que a JIMBEE le habían concedido cinco goles, no
 * como que los había metido JIMBEE. Se dice entero.
 */
export function concededLabel(group: MatchContextGroup, names: ContextTeamNames = {}): string {
  const otro = (group.side === "unknown" ? "opponent" : otherSide(group.side)) as ContextSide;
  if (group.side === "unknown") return `Producción de ${sideName(otro, names)}`;
  return (
    `Producción de ${sideName(otro, names)} durante ` +
    `${CONTEXT_DURING_LABEL[group.type]} de ${sideName(group.side, names)}`
  );
}

/**
 * La frase que cierra el bloque: cuántos goles encajó el bando del contexto.
 *
 * Va debajo de las cifras del otro equipo para que no quede ninguna duda de
 * en qué dirección fueron esos goles.
 */
export function concededGoalsNote(
  group: MatchContextGroup,
  names: ContextTeamNames = {},
): string {
  const bando = (group.side === "unknown" ? "team" : group.side) as ContextSide;
  const n = group.conceded.goalsBenefiting;
  return `${sideName(bando, names)} encajó ${n} ${n === 1 ? "gol" : "goles"} durante estos tramos.`;
}
