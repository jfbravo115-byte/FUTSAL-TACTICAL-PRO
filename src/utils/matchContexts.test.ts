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
  UNKNOWN_SIDE_LABEL,
  buildMatchContexts,
  concededGoalsNote,
  concededLabel,
  contextSideOf,
  contextTypeOf,
  emptyContextTally,
  groupMatchContexts,
  isCountableInContext,
  productionLabel,
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
    const t = ventana().production;
    expect(t.shots).toBe(5);
    expect(t.onTarget).toBe(3);
    expect(t.offTarget).toBe(1);
    expect(t.blocked).toBe(1);
    expect(t.goals).toBe(1);
  });

  it("el gol forma parte de los tiros y de los tiros a portería", () => {
    // Contrato de shotModel fijado en la PR #17. Un gol es un remate que
    // acabó dentro, no un remate adicional.
    const t = ventana().production;
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
    expect(ventanas[0].production.shots).toBe(1);
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
    expect(buildMatchContexts(md)[0].production.shots).toBe(1);
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
    expect(ventanas[0].production.shots).toBe(3);
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
    expect(ventanas[0].production.shots).toBe(2);
    expect(ventanas[1].production.shots).toBe(3);
  });

  it("aunque en pista haya cinco contra cuatro en los dos casos", () => {
    // Una la impone una expulsión y la otra la elige el entrenador.
    expect(contextTypeOf(GameState.SUPERIORITY)).toBe("superiority_expulsion");
    expect(contextTypeOf(GameState.PJ_ATTACK)).toBe("gk_player_own");
    expect(contextTypeOf(GameState.SUPERIORITY)).not.toBe(contextTypeOf(GameState.PJ_ATTACK));
  });

  it("el tiro del tramo igualado no cae en ninguna de las dos", () => {
    const total = buildMatchContexts(md()).reduce((a, v) => a + v.production.shots, 0);
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
    expect(v[0].production.shots).toBe(2);
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
    expect(v.production.shots).toBe(1); // el tiro del minuto 3:20 SIGUE dentro
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
    expect(ventanas[0].production.shots).toBe(1);
    expect(ventanas[0].period).toBe(Period.FIRST);
  });

  it("el grupo tampoco inventa una duración total", () => {
    expect(groupMatchContexts(buildMatchContexts(md()))[0].totalDuration).toBeNull();
  });
});

// ── R · LA PISTA ES UNA, Y CUALQUIER DECLARACIÓN LA CAMBIA ─────────────
//
// Antes esta sección decía lo contrario: que una declaración del rival no
// tocaba nuestra ventana, porque se llevaba una ventana abierta por bando.
// Con datos reales eso produce ventanas que nadie cierra —la declara un
// panel y la cierra el otro— que se solapan con las siguientes y hacen que
// las acciones del solape se cuenten dos veces. `GameState` describe la
// PISTA, que es una: a las 18:30 se juega con portero-jugador o no se juega.

describe("R · una declaración cambia el estado de la pista, venga del panel que venga", () => {
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

  it("la superioridad se cierra cuando se declara el portero-jugador", () => {
    const v = buildMatchContexts(md());
    const sup = v.filter((x) => x.type === "superiority_expulsion");
    expect(sup).toHaveLength(1);
    expect(sup[0].production.shots).toBe(1); // solo el del 70_000
    expect(sup[0].start).toBe(60_000);
    expect(sup[0].end).toBe(90_000); // la cierra la declaración del rival
    expect(sup[0].duration).toBe(30_000);
  });

  it("y el tiro posterior pertenece a la ventana nueva, no a la anterior", () => {
    const pj = buildMatchContexts(md()).find((x) => x.type === "gk_player_own")!;
    expect(pj.start).toBe(90_000);
    expect(pj.production.shots).toBe(1); // el del 100_000
  });

  it("ninguna acción se cuenta dos veces", () => {
    const v = buildMatchContexts(md());
    const ids = v.flatMap((x) => x.eventIds);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("la ventana que declara el rival existe aparte, con su declarante", () => {
    const rivales = buildMatchContexts(md()).filter((v) => v.perspective === "opponent");
    expect(rivales).toHaveLength(1);
    expect(rivales[0].type).toBe("gk_player_own");
    expect(rivales[0].perspective).toBe("opponent"); // quién lo declaró
  });

  it("pero el portero-jugador de un «PJ Ataque» es NUESTRO, lo declare quien lo declare", () => {
    // Esto es lo que rompía el informe real: la ventana se abría en el lado
    // que tocaba el botón y se contaban las acciones de ESE lado, así que un
    // bloque titulado «Portero-jugador propio» acababa enseñando la
    // producción del rival.
    const rival = buildMatchContexts(md()).find((v) => v.perspective === "opponent")!;
    expect(rival.side).toBe("team");
    expect(rival.production.shots).toBe(1); // el tiro NUESTRO del 100_000
    expect(rival.conceded.shots).toBe(0); // el rival no tiró
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
    expect(buildMatchContexts(conTiroRival)[0].production.shots).toBe(1);
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
    expect(v.map((x) => x.production.shots)).toEqual([1, 2]);
  });

  it("el grupo suma los agregados pero conserva las dos ventanas", () => {
    const g = groupMatchContexts(buildMatchContexts(md()))[0];
    expect(g.windows).toHaveLength(2);
    expect(g.production.shots).toBe(3);
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
    expect(v[0].production.shots).toBe(2);
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
    const enVentanas = buildMatchContexts(md()).reduce((a, v) => a + v.production.shots, 0);
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
    // La inferioridad es del rival: la ventaja —y la producción— es SUYA.
    expect(v.side).toBe("opponent");
    expect(v.production.goals).toBe(1); // el gol lo hizo el rival
    expect(v.production.goalsBenefiting).toBe(1); // y lo cobró el rival
    expect(v.conceded.goals).toBe(0); // nosotros no marcamos nada ahí
    expect(v.conceded.goalsBenefiting).toBe(0);
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

// ── U · DE QUIÉN SON LAS CIFRAS DE UNA SITUACIÓN ESPECIAL ──────────────
//
// EL CASO REAL, otra vez. En CD MURCIA 2-6 JIMBEE el bloque «5x4 ·
// Portero-jugador propio» decía «Tiros 5 · a portería 5 · goles 5» y CD
// MURCIA había marcado DOS goles en todo el partido: los cinco eran los que
// le metieron con el portero-jugador en pista. Pasaba porque la ventana se
// abría en el lado que tocaba el botón —y en ese partido el mismo estado se
// declaró desde los dos paneles— y luego el grupo sumaba las dos ventanas
// bajo una sola etiqueta.

const golDe = (timestamp: number, opponent: boolean, period = Period.FIRST) =>
  ev({
    timestamp,
    period,
    type: ActionType.GOAL,
    destinationGrid: "G1",
    metadata: { isOpponent: opponent },
  });

const golEnPropiaDe = (timestamp: number, opponent: boolean, period = Period.FIRST) =>
  ev({
    timestamp,
    period,
    type: ActionType.OWN_GOAL,
    metadata: { isOpponent: opponent },
  });

describe("U · las cifras dicen de quién son, y los dos bandos nunca se suman", () => {
  /** El patrón del partido real: el mismo 5x4 declarado desde los dos lados. */
  const perspectivasMezcladas = (): MatchData => ({
    ...base(),
    events: [
      // Tramo 1: lo declara el RIVAL, pero el estado es «PJ Ataque» = el
      // portero-jugador es NUESTRO.
      formacion(10_000, GameState.PJ_ATTACK, true),
      golDe(20_000, true), // nos marcan con el portero-jugador en pista
      golDe(30_000, true),
      formacion(40_000, GameState.FOUR_VS_FOUR, true),
      // Tramo 2: el mismo estado, declarado por NOSOTROS.
      formacion(50_000, GameState.PJ_ATTACK),
      golDe(60_000, false), // este sí lo marcamos nosotros
      ev({ timestamp: 65_000, type: ActionType.STEAL }),
      formacion(70_000, GameState.FOUR_VS_FOUR),
    ],
  });

  it("los dos tramos son del MISMO bando aunque los declaren lados distintos", () => {
    const v = buildMatchContexts(perspectivasMezcladas());
    expect(v).toHaveLength(2);
    expect(v.map((x) => x.type)).toEqual(["gk_player_own", "gk_player_own"]);
    expect(v.map((x) => x.side)).toEqual(["team", "team"]);
    expect(v.map((x) => x.perspective)).toEqual(["opponent", "team"]);
  });

  it("y cada tramo conserva su minuto y su marcador", () => {
    const v = buildMatchContexts(perspectivasMezcladas());
    expect(v.map((x) => [x.start, x.end])).toEqual([
      [10_000, 40_000],
      [50_000, 70_000],
    ]);
    expect(v[0].startScore).toEqual({ team: 0, opponent: 0 });
    expect(v[0].endScore).toEqual({ team: 0, opponent: 0 });
  });

  it("UN SOLO grupo, porque el bando es el mismo", () => {
    const g = groupMatchContexts(buildMatchContexts(perspectivasMezcladas()));
    expect(g).toHaveLength(1);
    expect(g[0].type).toBe("gk_player_own");
    expect(g[0].side).toBe("team");
    expect(g[0].windows).toHaveLength(2);
  });

  it("y SEPARA lo que produjimos de lo que concedimos", () => {
    const g = groupMatchContexts(buildMatchContexts(perspectivasMezcladas()))[0];
    // Lo nuestro: un gol y una recuperación.
    expect(g.production.goalsBenefiting).toBe(1);
    expect(g.production.recoveries).toBe(1);
    // Lo del rival: los dos goles que nos metieron.
    expect(g.conceded.goalsBenefiting).toBe(2);
    expect(g.conceded.recoveries).toBe(0);
  });

  it("NUNCA suma los dos bandos en una sola cifra", () => {
    const g = groupMatchContexts(buildMatchContexts(perspectivasMezcladas()))[0];
    const total = g.production.goalsBenefiting + g.conceded.goalsBenefiting;
    expect(total).toBe(3); // los tres goles del tramo existen…
    // …pero ninguna cifra publicada vale 3: cada una es de su bando.
    expect(g.production.goalsBenefiting).not.toBe(total);
    expect(g.conceded.goalsBenefiting).not.toBe(total);
  });

  it("el bando del portero-jugador rival es el rival, y la producción es SUYA", () => {
    const md: MatchData = {
      ...base(),
      events: [
        formacion(10_000, GameState.PJ_DEFENSE),
        golDe(20_000, true),
        ev({ timestamp: 25_000, type: ActionType.SHOT, destinationGrid: "G2" }),
        formacion(30_000, GameState.FOUR_VS_FOUR),
      ],
    };
    const g = groupMatchContexts(buildMatchContexts(md))[0];
    expect(g.type).toBe("gk_player_rival");
    expect(g.side).toBe("opponent");
    expect(g.production.goalsBenefiting).toBe(1); // el gol es del rival
    expect(g.conceded.shots).toBe(1); // y nosotros tiramos una vez
    expect(g.conceded.goalsBenefiting).toBe(0);
  });

  it("un 5x4 propio y uno rival son DOS grupos distintos", () => {
    const md: MatchData = {
      ...base(),
      events: [
        formacion(10_000, GameState.PJ_ATTACK),
        golDe(20_000, false),
        formacion(30_000, GameState.FOUR_VS_FOUR),
        formacion(40_000, GameState.PJ_DEFENSE),
        golDe(50_000, true),
        formacion(60_000, GameState.FOUR_VS_FOUR),
      ],
    };
    const grupos = groupMatchContexts(buildMatchContexts(md));
    expect(grupos.map((g) => [g.type, g.side])).toEqual([
      ["gk_player_own", "team"],
      ["gk_player_rival", "opponent"],
    ]);
    expect(grupos[0].production.goalsBenefiting).toBe(1);
    expect(grupos[1].production.goalsBenefiting).toBe(1);
  });

  it("EL GOL EN PROPIA se atribuye a quien lo cobra, no a quien lo remata", () => {
    const md: MatchData = {
      ...base(),
      events: [
        formacion(10_000, GameState.PJ_ATTACK),
        // Lo mete un jugador del RIVAL en su propia portería: sube a NUESTRO
        // marcador, así que es producción nuestra durante nuestro 5x4.
        golEnPropiaDe(20_000, true),
        formacion(30_000, GameState.FOUR_VS_FOUR),
      ],
    };
    const g = groupMatchContexts(buildMatchContexts(md))[0];
    expect(g.side).toBe("team");
    expect(g.production.goalsBenefiting).toBe(1);
    expect(g.conceded.goalsBenefiting).toBe(0);
    // Y no se cuenta como remate nuestro: no lo rematamos nosotros.
    expect(g.production.shots).toBe(0);
  });

  it("y un gol en propia NUESTRO se lo cobra el rival", () => {
    const md: MatchData = {
      ...base(),
      events: [
        formacion(10_000, GameState.PJ_DEFENSE),
        golEnPropiaDe(20_000, false),
        formacion(30_000, GameState.FOUR_VS_FOUR),
      ],
    };
    const g = groupMatchContexts(buildMatchContexts(md))[0];
    expect(g.side).toBe("opponent");
    expect(g.production.goalsBenefiting).toBe(1); // lo cobra el rival
    expect(g.conceded.goalsBenefiting).toBe(0);
  });

  it("varias declaraciones seguidas generan sus tramos, cada uno con lo suyo", () => {
    const md: MatchData = {
      ...base(),
      events: [
        formacion(10_000, GameState.PJ_ATTACK),
        golDe(15_000, false),
        formacion(20_000, GameState.FOUR_VS_FOUR),
        formacion(30_000, GameState.PJ_ATTACK),
        golDe(35_000, true),
        formacion(40_000, GameState.FOUR_VS_FOUR),
        formacion(50_000, GameState.PJ_ATTACK),
        ev({ timestamp: 55_000, type: ActionType.LOSS }),
        formacion(60_000, GameState.FOUR_VS_FOUR),
      ],
    };
    const v = buildMatchContexts(md);
    expect(v).toHaveLength(3);
    expect(v.map((x) => x.production.goalsBenefiting)).toEqual([1, 0, 0]);
    expect(v.map((x) => x.conceded.goalsBenefiting)).toEqual([0, 1, 0]);
    expect(v[2].production.turnovers).toBe(1);
    const g = groupMatchContexts(v)[0];
    expect(g.windows).toHaveLength(3);
    expect(g.production.goalsBenefiting).toBe(1);
    expect(g.conceded.goalsBenefiting).toBe(1);
    expect(g.totalDuration).toBe(30_000);
  });

  it("los rótulos dicen el nombre de cada equipo", () => {
    const nombres = { teamName: "CD MURCIA", opponentName: "JIMBEE" };
    const g = groupMatchContexts(buildMatchContexts(perspectivasMezcladas()), nombres)[0];
    expect(g.label).toBe("5x4 · Portero-jugador propio");
    expect(productionLabel(g, nombres)).toBe("Producción de CD MURCIA");
    expect(concededLabel(g, nombres)).toBe(
      "Producción de JIMBEE durante el 5x4 de CD MURCIA",
    );
    expect(concededGoalsNote(g, nombres)).toBe(
      "CD MURCIA encajó 2 goles durante estos tramos.",
    );
  });

  it("un estado que no identifica bando NO se atribuye: se dice", () => {
    expect(contextSideOf(GameState.FOUR_VS_FOUR)).toBe("unknown");
    expect(contextSideOf(undefined)).toBe("unknown");
    expect(contextSideOf("UN_ESTADO_QUE_YA_NO_EXISTE")).toBe("unknown");
    // Y la etiqueta existe para imprimirlo tal cual.
    expect(UNKNOWN_SIDE_LABEL).toBe("Bando del portero-jugador no determinado");
    const grupo = {
      type: "gk_player_own" as const,
      side: "unknown" as const,
      label: UNKNOWN_SIDE_LABEL,
      windows: [],
      totalDuration: null,
      production: emptyContextTally(),
      conceded: emptyContextTally(),
    };
    expect(grupo.label).toBe(UNKNOWN_SIDE_LABEL);
    expect(productionLabel(grupo, { teamName: "A", opponentName: "B" })).toBe("Producción de A");
    // Sin bando no se puede decir «durante el 5x4 de X»: se dice lo que hay.
    expect(concededLabel(grupo, { teamName: "A", opponentName: "B" })).toBe("Producción de B");
    expect(concededGoalsNote(grupo, { teamName: "A", opponentName: "B" })).toBe(
      "A encajó 0 goles durante estos tramos.",
    );
  });

  it("el bando sale del ESTADO, no de quién declara", () => {
    expect(contextSideOf(GameState.PJ_ATTACK)).toBe("team");
    expect(contextSideOf(GameState.SUPERIORITY)).toBe("team");
    expect(contextSideOf(GameState.PJ_DEFENSE)).toBe("opponent");
    expect(contextSideOf(GameState.INFERIORITY)).toBe("opponent");
  });
});
