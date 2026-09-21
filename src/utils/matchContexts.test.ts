/**
 * Ventanas de contexto del partido.
 *
 * EL CASO REAL
 * ------------
 * Se registraron cinco tiros durante una superioridad por expulsión rival y
 * el informe no decía nada. Los cinco tiros estaban ahí, y el cambio de
 * contexto también: no los leía nadie.
 *
 * LO QUE ESTOS TESTS PROTEGEN
 * ---------------------------
 * Que la ventana la abra una DECLARACIÓN y nunca una deducción, que una
 * superioridad por expulsión no se confunda jamás con un portero-jugador, y
 * que esta capa clasifique eventos sin crear ni duplicar ninguno.
 */
import { describe, expect, it } from "vitest";
import {
  ActionType,
  GameEvent,
  GameState,
  GoalieAction,
  MatchData,
  Period,
} from "../types/futsal";
import { summarizeTeamShots } from "./shotModel";
import {
  MATCH_CONTEXT_LABEL,
  buildMatchContexts,
  contextTypeOf,
  groupMatchContexts,
  isCountableInContext,
} from "./matchContexts";

let seq = 0;
const base = (): MatchData => ({
  teamName: "Local",
  opponentName: "Rival",
  period: Period.SECOND,
  matchClock: 0,
  isClockRunning: false,
  fouls: { team: 0, opponent: 0 },
  timeoutsUsed: {
    team: { period1: false, period2: false },
    opponent: { period1: false, period2: false },
  },
  players: [],
  events: [],
});

function ev(overrides: Partial<GameEvent> & { timestamp: number }): GameEvent {
  return {
    id: `e${++seq}`,
    wallClock: overrides.timestamp,
    period: Period.FIRST,
    playerIds: [],
    type: ActionType.SHOT,
    gameState: GameState.FOUR_VS_FOUR,
    metadata: { isOpponent: false },
    ...overrides,
  };
}

/** Declaración de cambio de formación, que es lo que abre una ventana. */
const formacion = (
  timestamp: number,
  gameState: GameState,
  isOpponent = false,
  period = Period.FIRST,
) =>
  ev({
    timestamp,
    period,
    type: ActionType.FORMATION_CHANGE,
    gameState,
    metadata: { isOpponent },
    scoreAtEvent: { team: 0, opponent: 0 },
  });

const tiroAPuerta = (timestamp: number, period = Period.FIRST) =>
  ev({ timestamp, period, type: ActionType.SHOT, destinationGrid: "G5" });
const tiroFuera = (timestamp: number, period = Period.FIRST) =>
  ev({ timestamp, period, type: ActionType.SHOT, destinationGrid: "OUT" });
const tiroBloqueado = (timestamp: number, period = Period.FIRST) =>
  ev({
    timestamp,
    period,
    type: ActionType.SHOT,
    metadata: { isOpponent: false, shotOutcome: "blocked", goalieResponse: "UNSPECIFIED" },
  });
const gol = (timestamp: number, period = Period.FIRST) =>
  ev({ timestamp, period, type: ActionType.GOAL, destinationGrid: "G1" });

// ── E / F · EL CASO REAL ───────────────────────────────────────────────

describe("E/F · cinco tiros durante una superioridad por expulsión rival", () => {
  const partido = (): MatchData => ({
    ...base(),
    events: [
      formacion(60_000, GameState.SUPERIORITY),
      tiroAPuerta(70_000),
      tiroAPuerta(80_000),
      gol(90_000),
      tiroFuera(100_000),
      tiroBloqueado(110_000),
      formacion(162_000, GameState.FOUR_VS_FOUR),
    ],
  });

  const ventana = () => buildMatchContexts(partido())[0];

  it("crea UNA ventana de superioridad, no de otro tipo", () => {
    const ventanas = buildMatchContexts(partido());
    expect(ventanas).toHaveLength(1);
    expect(ventanas[0].type).toBe("superiority_expulsion");
    expect(ventanas[0].perspective).toBe("team");
  });

  it("los agregados son exactamente 5 · 3 · 1 · 1 · 1", () => {
    const t = ventana().tally;
    expect(t.shots).toBe(5);
    expect(t.onTarget).toBe(3);
    expect(t.offTarget).toBe(1);
    expect(t.blocked).toBe(1);
    expect(t.goals).toBe(1);
  });

  it("el gol forma parte de los tiros y de los tiros a portería", () => {
    // Contrato de shotModel fijado en la PR #17. Un gol es un remate que
    // acabó dentro, no un remate adicional.
    const t = ventana().tally;
    expect(t.onTarget + t.offTarget + t.blocked).toBe(t.shots);
  });

  it("la duración sale de las dos declaraciones, no de una estimación", () => {
    expect(ventana().start).toBe(60_000);
    expect(ventana().end).toBe(162_000);
    expect(ventana().duration).toBe(102_000); // 01:42
  });

  it("la etiqueta que ve el usuario no contiene ningún código interno", () => {
    expect(MATCH_CONTEXT_LABEL[ventana().type]).toBe("Superioridad por expulsión rival");
    expect(MATCH_CONTEXT_LABEL[ventana().type]).not.toContain("SUPERIORITY");
  });
});

describe("G · lo que pasa después del cierre no pertenece a la ventana", () => {
  it("un tiro posterior al FORMATION_CHANGE de cierre queda fuera", () => {
    const md: MatchData = {
      ...base(),
      events: [
        formacion(60_000, GameState.SUPERIORITY),
        tiroAPuerta(70_000),
        formacion(100_000, GameState.FOUR_VS_FOUR),
        tiroAPuerta(120_000), // ya en juego igualado
      ],
    };
    const ventanas = buildMatchContexts(md);
    expect(ventanas).toHaveLength(1);
    expect(ventanas[0].tally.shots).toBe(1);
  });

  it("y un tiro anterior a la apertura tampoco entra", () => {
    const md: MatchData = {
      ...base(),
      events: [
        tiroAPuerta(10_000),
        formacion(60_000, GameState.SUPERIORITY),
        tiroAPuerta(70_000),
        formacion(100_000, GameState.FOUR_VS_FOUR),
      ],
    };
    expect(buildMatchContexts(md)[0].tally.shots).toBe(1);
  });
});

// ── H / I / Q · 5x4 TÁCTICO ────────────────────────────────────────────

describe("H · portero-jugador propio con tres tiros", () => {
  const md = (): MatchData => ({
    ...base(),
    events: [
      formacion(200_000, GameState.PJ_ATTACK),
      tiroAPuerta(210_000),
      tiroFuera(220_000),
      tiroBloqueado(230_000),
      formacion(260_000, GameState.FOUR_VS_FOUR),
    ],
  });

  it("los tres tiros van al 5x4 propio", () => {
    const ventanas = buildMatchContexts(md());
    expect(ventanas).toHaveLength(1);
    expect(ventanas[0].type).toBe("gk_player_own");
    expect(ventanas[0].tally.shots).toBe(3);
  });

  it("y la superioridad por expulsión se queda a cero: no existe", () => {
    const grupos = groupMatchContexts(buildMatchContexts(md()));
    expect(grupos.map((g) => g.type)).toEqual(["gk_player_own"]);
    expect(grupos.find((g) => g.type === "superiority_expulsion")).toBeUndefined();
  });
});

describe("I/Q · superioridad y portero-jugador jamás se mezclan", () => {
  const md = (): MatchData => ({
    ...base(),
    events: [
      formacion(60_000, GameState.SUPERIORITY),
      tiroAPuerta(70_000),
      tiroAPuerta(80_000),
      formacion(120_000, GameState.FOUR_VS_FOUR),
      tiroFuera(150_000),
      formacion(200_000, GameState.PJ_ATTACK),
      tiroAPuerta(210_000),
      tiroAPuerta(220_000),
      tiroAPuerta(230_000),
      formacion(260_000, GameState.FOUR_VS_FOUR),
    ],
  });

  it("dos ventanas, dos tipos, cada una con lo suyo", () => {
    const ventanas = buildMatchContexts(md());
    expect(ventanas.map((v) => v.type)).toEqual([
      "superiority_expulsion",
      "gk_player_own",
    ]);
    expect(ventanas[0].tally.shots).toBe(2);
    expect(ventanas[1].tally.shots).toBe(3);
  });

  it("aunque en pista haya cinco contra cuatro en los dos casos", () => {
    // Una la impone una expulsión y la otra la elige el entrenador.
    expect(contextTypeOf(GameState.SUPERIORITY)).toBe("superiority_expulsion");
    expect(contextTypeOf(GameState.PJ_ATTACK)).toBe("gk_player_own");
    expect(contextTypeOf(GameState.SUPERIORITY)).not.toBe(contextTypeOf(GameState.PJ_ATTACK));
  });

  it("el tiro del tramo igualado no cae en ninguna de las dos", () => {
    const total = buildMatchContexts(md()).reduce((a, v) => a + v.tally.shots, 0);
    expect(total).toBe(5); // de los 6 tiros del partido
  });
});

// ── O · LA ROJA NO ABRE VENTANA ────────────────────────────────────────

describe("O · una expulsión sin declaración no crea ninguna superioridad", () => {
  it("una roja rival por sí sola no abre nada", () => {
    const md: MatchData = {
      ...base(),
      events: [
        ev({
          timestamp: 60_000,
          type: ActionType.RED_CARD,
          metadata: { isOpponent: true },
          playerIds: ["riv7"],
        }),
        tiroAPuerta(70_000),
        tiroAPuerta(80_000),
      ],
    };
    expect(buildMatchContexts(md)).toEqual([]);
  });

  it("tampoco una segunda amarilla", () => {
    const amarilla = (t: number) =>
      ev({
        timestamp: t,
        type: ActionType.YELLOW_CARD,
        metadata: { isOpponent: true },
        playerIds: ["riv7"],
      });
    const md: MatchData = { ...base(), events: [amarilla(10_000), amarilla(60_000), tiroAPuerta(70_000)] };
    expect(buildMatchContexts(md)).toEqual([]);
  });

  it("una roja estampada con el estado en curso tampoco abre nada", () => {
    // Cada evento lleva escrito el gameState del momento, así que una roja
    // registrada durante una superioridad ya declarada viene marcada
    // "Superioridad". Aun así, la tarjeta NO es una declaración de contexto:
    // solo FORMATION_CHANGE abre y cierra ventanas.
    const md: MatchData = {
      ...base(),
      events: [
        ev({
          timestamp: 60_000,
          type: ActionType.RED_CARD,
          gameState: GameState.SUPERIORITY,
          metadata: { isOpponent: true },
          playerIds: ["riv7"],
        }),
        tiroAPuerta(70_000),
      ],
    };
    expect(buildMatchContexts(md)).toEqual([]);
  });

  it("y dentro de una ventana abierta, la roja no la parte en dos", () => {
    const md: MatchData = {
      ...base(),
      events: [
        formacion(60_000, GameState.SUPERIORITY),
        tiroAPuerta(70_000),
        ev({
          timestamp: 80_000,
          type: ActionType.RED_CARD,
          gameState: GameState.SUPERIORITY,
          metadata: { isOpponent: true },
          playerIds: ["riv9"],
        }),
        tiroAPuerta(90_000),
        formacion(120_000, GameState.FOUR_VS_FOUR),
      ],
    };
    const v = buildMatchContexts(md);
    expect(v).toHaveLength(1);
    expect(v[0].tally.shots).toBe(2);
    expect(v[0].duration).toBe(60_000);
  });

  it("no existe ninguna regla de dos minutos en el código", () => {
    // El reglamento no es un dato observado. Si el operador no declaró el
    // final de la superioridad, no se inventa.
    const md: MatchData = {
      ...base(),
      events: [formacion(0, GameState.SUPERIORITY), tiroAPuerta(200_000)],
    };
    const v = buildMatchContexts(md)[0];
    expect(v.duration).toBeNull();
    expect(v.tally.shots).toBe(1); // el tiro del minuto 3:20 SIGUE dentro
  });
});

// ── P · VENTANA SIN CIERRE ─────────────────────────────────────────────

describe("P · una ventana sin cierre no se estima ni cruza el descanso", () => {
  const md = (): MatchData => ({
    ...base(),
    events: [
      formacion(600_000, GameState.SUPERIORITY),
      tiroAPuerta(610_000),
      // 2ª parte: el reloj vuelve a cero.
      tiroAPuerta(10_000, Period.SECOND),
      gol(20_000, Period.SECOND),
    ],
  });

  it("end y duration quedan en null", () => {
    const v = buildMatchContexts(md())[0];
    expect(v.end).toBeNull();
    expect(v.duration).toBeNull();
    expect(v.endScore).toBeNull();
    expect(v.closedBy).toBeNull();
  });

  it("y NO absorbe los eventos de la parte siguiente", () => {
    const ventanas = buildMatchContexts(md());
    expect(ventanas).toHaveLength(1);
    expect(ventanas[0].tally.shots).toBe(1);
    expect(ventanas[0].period).toBe(Period.FIRST);
  });

  it("el grupo tampoco inventa una duración total", () => {
    expect(groupMatchContexts(buildMatchContexts(md()))[0].totalDuration).toBeNull();
  });
});

// ── R · EL RIVAL NO TOCA NUESTRA VENTANA ───────────────────────────────

describe("R · un cambio de formación del rival no altera la ventana propia", () => {
  const md = (): MatchData => ({
    ...base(),
    events: [
      formacion(60_000, GameState.SUPERIORITY),
      tiroAPuerta(70_000),
      formacion(90_000, GameState.PJ_ATTACK, true), // declaración RIVAL
      tiroAPuerta(100_000),
      formacion(120_000, GameState.FOUR_VS_FOUR),
    ],
  });

  it("nuestra superioridad sigue siendo una sola ventana con sus dos tiros", () => {
    const propias = buildMatchContexts(md()).filter((v) => v.perspective === "team");
    expect(propias).toHaveLength(1);
    expect(propias[0].tally.shots).toBe(2);
    expect(propias[0].duration).toBe(60_000);
  });

  it("la ventana del rival existe aparte y con su propia perspectiva", () => {
    const rivales = buildMatchContexts(md()).filter((v) => v.perspective === "opponent");
    expect(rivales).toHaveLength(1);
    expect(rivales[0].type).toBe("gk_player_own");
    // Cuenta los eventos del RIVAL, y en este partido no hay ninguno.
    expect(rivales[0].tally.shots).toBe(0);
  });

  it("una ventana propia solo agrega acciones propias", () => {
    const conTiroRival: MatchData = {
      ...base(),
      events: [
        formacion(60_000, GameState.SUPERIORITY),
        tiroAPuerta(70_000),
        ev({ timestamp: 80_000, type: ActionType.SHOT, destinationGrid: "G3", metadata: { isOpponent: true } }),
        formacion(120_000, GameState.FOUR_VS_FOUR),
      ],
    };
    expect(buildMatchContexts(conTiroRival)[0].tally.shots).toBe(1);
  });
});

// ── S · DOS VENTANAS DEL MISMO TIPO ────────────────────────────────────

describe("S · dos superioridades distintas no se funden en una", () => {
  const md = (): MatchData => ({
    ...base(),
    events: [
      formacion(60_000, GameState.SUPERIORITY),
      tiroAPuerta(70_000),
      formacion(100_000, GameState.FOUR_VS_FOUR),
      formacion(300_000, GameState.SUPERIORITY),
      tiroAPuerta(310_000),
      tiroFuera(320_000),
      formacion(400_000, GameState.FOUR_VS_FOUR),
    ],
  });

  it("son dos ventanas con sus propios inicios y finales", () => {
    const v = buildMatchContexts(md());
    expect(v).toHaveLength(2);
    expect(v.map((x) => [x.start, x.end])).toEqual([
      [60_000, 100_000],
      [300_000, 400_000],
    ]);
    expect(v.map((x) => x.tally.shots)).toEqual([1, 2]);
  });

  it("el grupo suma los agregados pero conserva las dos ventanas", () => {
    const g = groupMatchContexts(buildMatchContexts(md()))[0];
    expect(g.windows).toHaveLength(2);
    expect(g.tally.shots).toBe(3);
    expect(g.totalDuration).toBe(140_000);
  });

  it("declarar dos veces el MISMO estado no parte la ventana en dos", () => {
    const repetido: MatchData = {
      ...base(),
      events: [
        formacion(60_000, GameState.SUPERIORITY),
        tiroAPuerta(70_000),
        formacion(80_000, GameState.SUPERIORITY),
        tiroAPuerta(90_000),
        formacion(120_000, GameState.FOUR_VS_FOUR),
      ],
    };
    const v = buildMatchContexts(repetido);
    expect(v).toHaveLength(1);
    expect(v[0].tally.shots).toBe(2);
  });
});

// ── T · NO SE CREAN NI SE DUPLICAN TIROS ───────────────────────────────

describe("T · esta capa clasifica, no crea", () => {
  const md = (): MatchData => ({
    ...base(),
    events: [
      tiroAPuerta(10_000),
      formacion(60_000, GameState.SUPERIORITY),
      tiroAPuerta(70_000),
      gol(90_000),
      formacion(120_000, GameState.FOUR_VS_FOUR),
      tiroFuera(150_000),
      formacion(200_000, GameState.PJ_ATTACK),
      tiroAPuerta(210_000),
    ],
  });

  it("el total del partido no cambia al construir los contextos", () => {
    const antes = summarizeTeamShots(md().events, false).shots;
    buildMatchContexts(md());
    const despues = summarizeTeamShots(md().events, false).shots;
    expect(antes).toBe(5);
    expect(despues).toBe(5);
  });

  it("la suma de las ventanas nunca supera el total del partido", () => {
    const enVentanas = buildMatchContexts(md()).reduce((a, v) => a + v.tally.shots, 0);
    expect(enVentanas).toBeLessThanOrEqual(summarizeTeamShots(md().events, false).shots);
    expect(enVentanas).toBe(3); // 2 en superioridad + 1 en 5x4
  });

  it("ningún evento cae en dos ventanas del mismo bando", () => {
    const propias = buildMatchContexts(md()).filter((v) => v.perspective === "team");
    const todos = propias.flatMap((v) => v.eventIds);
    expect(new Set(todos).size).toBe(todos.length);
  });

  it("los cambios de formación y las sustituciones no se cuentan como acciones", () => {
    expect(isCountableInContext(formacion(0, GameState.SUPERIORITY))).toBe(false);
    expect(
      isCountableInContext(ev({ timestamp: 0, type: ActionType.SUBSTITUTION })),
    ).toBe(false);
    expect(isCountableInContext(tiroAPuerta(0))).toBe(true);
    expect(isCountableInContext(ev({ timestamp: 0, type: ActionType.FOUL }))).toBe(true);
    expect(isCountableInContext(ev({ timestamp: 0, type: ActionType.CORNER }))).toBe(true);
  });

  it("un gol encajado cuenta en la ventana del rival, no en la nuestra", () => {
    const encajado: MatchData = {
      ...base(),
      events: [
        formacion(60_000, GameState.INFERIORITY),
        ev({
          timestamp: 70_000,
          type: GoalieAction.GOAL_CONCEDED,
          metadata: { isOpponent: true },
        }),
        formacion(120_000, GameState.FOUR_VS_FOUR),
      ],
    };
    const v = buildMatchContexts(encajado)[0];
    expect(v.type).toBe("inferiority_expulsion");
    expect(v.tally.goals).toBe(0); // no es un gol NUESTRO
  });
});

describe("el juego igualado queda fuera del informe salvo que se pida", () => {
  const md = (): MatchData => ({
    ...base(),
    events: [
      formacion(0, GameState.FOUR_VS_FOUR),
      tiroAPuerta(10_000),
      formacion(60_000, GameState.SUPERIORITY),
      tiroAPuerta(70_000),
      formacion(120_000, GameState.FOUR_VS_FOUR),
    ],
  });

  it("por defecto solo salen las situaciones especiales", () => {
    expect(buildMatchContexts(md()).map((v) => v.type)).toEqual(["superiority_expulsion"]);
  });

  it("pero los tramos igualados se pueden pedir", () => {
    const todas = buildMatchContexts(md(), { includeEven: true });
    expect(todas.map((v) => v.type)).toEqual([
      "even",
      "superiority_expulsion",
      "even",
    ]);
  });

  it("un partido sin ningún cambio de formación no tiene ventanas", () => {
    const sinDeclarar: MatchData = { ...base(), events: [tiroAPuerta(10_000), gol(20_000)] };
    expect(buildMatchContexts(sinDeclarar)).toEqual([]);
    expect(groupMatchContexts([])).toEqual([]);
  });
});
