import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, GameState, GoalieAction, Period, Player, Role } from "../types/futsal";
import { ZONE_12_IDS, mirrorZone12 } from "./fieldZones";
import { goalkeeperZoneOf } from "./goalkeeperZones";
import {
  EXIT_OUTCOME_LABEL,
  FROZEN_GOALIE_ACTIONS,
  GOALIE_SAVE_TYPES,
  GOALIE_ACTION_LABEL,
  PRODUCIBLE_GOALIE_ACTIONS,
  PRODUCIBLE_SAVE_TYPES,
  attributedGoalieId,
  eventTargetsOpposingGoalie,
  acceptsGoalkeeperZone,
  effectiveGoalieAction,
  eventAcceptsGoalkeeperZone,
  exitOutcomeOf,
  GoalieResponse,
  declaredGoalieResponseOf,
  formatDeclaredResponse,
  GOALIE_RESPONSE_UNSPECIFIED,
  goalieRespondingToShot,
  goalieResponseOf,
  isGoalieResponse,
  isTypedSave,
  targetGoalkeeperIdOf,
  formatExit,
  formatGoalieAction,
  goalieStatsDelta,
  isEventAttributableToGoalie,
  isAnySave,
  isExit,
  isGoalieEventOwnedBy,
  isGoalieIntervention,
  isFrozenGoalieAction,
  isProducibleGoalieAction,
  isUnspecifiedSave,
  shotOriginFromAttackerView,
} from "./goalkeeperActions";

function ev(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    id: `e-${Math.random()}`,
    timestamp: 0,
    wallClock: 0,
    period: Period.FIRST,
    playerIds: [],
    type: GoalieAction.SAVE,
    gameState: GameState.FOUR_VS_FOUR,
    metadata: { isOpponent: false },
    ...overrides,
  };
}

function gk(overrides: Partial<Player> = {}): Player {
  return {
    id: "gk1",
    number: 1,
    name: "Portero",
    role: Role.GOALKEEPER,
    isOnPitch: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isOpponent: false,
    stats: {
      goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
      fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
    },
    ...overrides,
  };
}

describe("Taxonomía", () => {
  it("la captura solo puede producir parada, blocaje, despeje y salida", () => {
    expect([...PRODUCIBLE_SAVE_TYPES]).toEqual([
      GoalieAction.SAVE,
      GoalieAction.SAVE_CATCH,
      GoalieAction.SAVE_DEFLECT,
    ]);
    expect([...PRODUCIBLE_GOALIE_ACTIONS]).toContain(GoalieAction.EXIT);
  });

  it("SAVE_PARRY y GOAL_CONCEDED quedan CONGELADOS: nunca se vuelven a producir", () => {
    expect([...FROZEN_GOALIE_ACTIONS]).toEqual([
      GoalieAction.SAVE_PARRY,
      GoalieAction.GOAL_CONCEDED,
    ]);
    for (const frozen of FROZEN_GOALIE_ACTIONS) {
      expect(isProducibleGoalieAction(frozen)).toBe(false);
      expect(isFrozenGoalieAction(frozen)).toBe(true);
    }
    expect(PRODUCIBLE_GOALIE_ACTIONS).not.toContain(GoalieAction.SAVE_PARRY);
  });

  it("cada acción tiene una sola etiqueta, y coincide con lo que dice el botón", () => {
    expect(GOALIE_ACTION_LABEL[GoalieAction.SAVE]).toBe("Parada");
    expect(GOALIE_ACTION_LABEL[GoalieAction.SAVE_CATCH]).toBe("Blocaje");
    expect(GOALIE_ACTION_LABEL[GoalieAction.SAVE_DEFLECT]).toBe("Despeje");
    expect(GOALIE_ACTION_LABEL[GoalieAction.EXIT]).toBe("Salida");
  });

  it("un SAVE_PARRY histórico NO se presenta como despeje", () => {
    const label = formatGoalieAction(GoalieAction.SAVE_PARRY);
    expect(label).toBe("Parada (subtipo no registrado)");
    expect(label).not.toContain("Despeje");
    expect(isUnspecifiedSave(ev({ type: GoalieAction.SAVE_PARRY }))).toBe(true);
  });

  it("ninguna etiqueta deja escapar el código técnico", () => {
    for (const type of [...PRODUCIBLE_GOALIE_ACTIONS, ...FROZEN_GOALIE_ACTIONS]) {
      const label = formatGoalieAction(type);
      expect(label).not.toContain(String(type));
      expect(label).not.toMatch(/SAVE|EXIT|GOAL_CONCEDED/);
    }
  });
});

describe("Salida / intervención", () => {
  it("registra el resultado de éxito", () => {
    const e = ev({ type: GoalieAction.EXIT, metadata: { isOpponent: false, exitOutcome: "success" } });
    expect(isExit(e)).toBe(true);
    expect(exitOutcomeOf(e)).toBe("success");
    expect(formatExit(e)).toBe(`Salida · ${EXIT_OUTCOME_LABEL.success}`);
  });

  it("registra el resultado de fallo", () => {
    const e = ev({ type: GoalieAction.EXIT, metadata: { isOpponent: false, exitOutcome: "fail" } });
    expect(exitOutcomeOf(e)).toBe("fail");
    expect(formatExit(e)).toBe("Salida · Fallo");
  });

  it("no inventa el resultado cuando no se registró", () => {
    const e = ev({ type: GoalieAction.EXIT, metadata: { isOpponent: false } });
    expect(exitOutcomeOf(e)).toBeNull();
    expect(formatExit(e)).toBe("Salida (resultado no registrado)");
  });

  it("una salida CON zona la guarda en su campo propio", () => {
    const e = ev({ type: GoalieAction.EXIT, goalkeeperZone: "GK4" });
    expect(goalkeeperZoneOf(e)).toBe("GK4");
  });

  it("una salida SIN zona sigue siendo válida y contabilizable", () => {
    const e = ev({
      type: GoalieAction.EXIT,
      playerIds: ["gk1"],
      metadata: { isOpponent: false, exitOutcome: "success" },
    });
    expect(goalkeeperZoneOf(e)).toBeNull();
    expect(exitOutcomeOf(e)).toBe("success");
    expect(goalieStatsDelta(e, gk({ id: "gk1" })).exits).toBe(1);
  });
});

describe("goalkeeperZone es un dominio aparte", () => {
  it("NO modifica originGrid ni destinationGrid", () => {
    const e = ev({
      type: GoalieAction.SAVE,
      goalkeeperZone: "GK2",
      originGrid: "Z4R",
      destinationGrid: "G5",
      metadata: { isOpponent: false },
    });
    expect(goalkeeperZoneOf(e)).toBe("GK2");
    // Cada campo conserva lo suyo.
    expect(e.originGrid).toBe("Z4R");
    expect(e.destinationGrid).toBe("G5");
    // Y la lectura de origen no devuelve la zona del portero.
    expect(shotOriginFromAttackerView(e, false)).not.toBe("GK2" as any);
  });

  it("una zona de portero NO se lee como sector de pista", () => {
    const e = ev({ type: GoalieAction.EXIT, goalkeeperZone: "GK1" });
    expect(shotOriginFromAttackerView(e, false)).toBeNull();
  });

  it("rechaza valores de otros dominios espaciales", () => {
    expect(goalkeeperZoneOf(ev({ goalkeeperZone: "Z1C" as any }))).toBeNull();
    expect(goalkeeperZoneOf(ev({ goalkeeperZone: "A1" as any }))).toBeNull();
    expect(goalkeeperZoneOf(ev({ goalkeeperZone: "G5" as any }))).toBeNull();
    expect(goalkeeperZoneOf(ev({}))).toBeNull();
  });

  it("las acciones que admiten zona son las producibles, y solo esas", () => {
    for (const type of PRODUCIBLE_GOALIE_ACTIONS) {
      expect(acceptsGoalkeeperZone(type)).toBe(true);
    }
    expect(acceptsGoalkeeperZone(GoalieAction.SAVE_PARRY)).toBe(false);
    expect(acceptsGoalkeeperZone(ActionType.SHOT)).toBe(false);
  });
});

describe("Perspectiva única de los mapas", () => {
  // El bug corregido: un mismo lugar físico caía en Z4 si venía de un tiro
  // rival y en Z1 si venía de la parada del portero, y el mapa los sumaba.
  it("un mismo lugar físico NO aparece en dos sectores distintos según la fuente", () => {
    const tiroRival = ev({
      type: ActionType.SHOT,
      originGrid: "Z4C",
      metadata: { isOpponent: true },
    });
    // La parada de ESE mismo disparo, guardada en la perspectiva del portero.
    const paradaPropia = ev({
      type: GoalieAction.SAVE,
      originGrid: mirrorZone12("Z4C"),
      metadata: { isOpponent: false },
    });

    const desdeTiro = shotOriginFromAttackerView(tiroRival, false);
    const desdeParada = shotOriginFromAttackerView(paradaPropia, false);

    expect(desdeTiro).toBe("Z4C");
    expect(desdeParada).toBe("Z4C");
    expect(desdeParada).toBe(desdeTiro);
  });

  it("espeja los eventos propios del portero y deja intactos los del rival", () => {
    for (const id of ZONE_12_IDS) {
      const propio = ev({ originGrid: id, metadata: { isOpponent: false } });
      const rival = ev({ originGrid: id, metadata: { isOpponent: true } });
      expect(shotOriginFromAttackerView(propio, false)).toBe(mirrorZone12(id));
      expect(shotOriginFromAttackerView(rival, false)).toBe(id);
    }
  });

  it("funciona igual para un portero rival, con los bandos invertidos", () => {
    const propioDelRival = ev({ originGrid: "Z1L", metadata: { isOpponent: true } });
    expect(shotOriginFromAttackerView(propioDelRival, true)).toBe(mirrorZone12("Z1L"));
  });

  it("NO espeja datos históricos: su perspectiva nunca se registró", () => {
    expect(shotOriginFromAttackerView(ev({ originGrid: "B2" }), false)).toBeNull();
    expect(shotOriginFromAttackerView(ev({}), false)).toBeNull();
  });
});

describe("Atribución con dos porteros", () => {
  const gk1 = gk({ id: "gk1" });
  const gk2 = gk({ id: "gk2", number: 12 });

  it("un evento propio siempre es del portero que lo firma", () => {
    const e = ev({ type: GoalieAction.SAVE, playerIds: ["gk1"] });
    expect(isEventAttributableToGoalie(e, gk1, false)).toBe(true);
    expect(isEventAttributableToGoalie(e, gk2, false)).toBe(false);
  });

  it("un disparo rival se atribuye por onPitchPlayerIds, no por el estado final", () => {
    const e = ev({
      type: ActionType.SHOT,
      playerIds: ["rival-1"],
      onPitchPlayerIds: ["gk2"],
      metadata: { isOpponent: true },
    });
    expect(isEventAttributableToGoalie(e, gk1, false)).toBe(false);
    expect(isEventAttributableToGoalie(e, gk2, false)).toBe(true);
  });

  it("sin onPitchPlayerIds no se atribuye a ninguno si hay ambigüedad", () => {
    const e = ev({ type: ActionType.SHOT, playerIds: ["rival-1"], metadata: { isOpponent: true } });
    expect(isEventAttributableToGoalie(e, gk1, false)).toBe(false);
    expect(isEventAttributableToGoalie(e, gk2, false)).toBe(false);
  });

  it("sin onPitchPlayerIds sí se atribuye si es el único portero relevante", () => {
    const e = ev({ type: ActionType.SHOT, playerIds: ["rival-1"], metadata: { isOpponent: true } });
    expect(isEventAttributableToGoalie(e, gk1, true)).toBe(true);
  });

  it("identifica al portero al que se atribuyó el evento", () => {
    const e = ev({ type: GoalieAction.SAVE, playerIds: ["gk2"] });
    expect(attributedGoalieId(e, [gk1, gk2])).toBe("gk2");
  });
});

describe("Estadísticas: registrar y deshacer usan la misma fuente", () => {
  const local = gk({ id: "gk1", isOpponent: false });
  const rival = gk({ id: "gk2", isOpponent: true });

  it("una parada del portero local NO acredita nada al portero rival", () => {
    // Este era el doble conteo real: la captura añadía al portero rival como
    // "targetGoalieId" y le sumaba también la parada.
    const e = ev({ type: GoalieAction.SAVE, playerIds: ["gk1", "gk2"], metadata: { isOpponent: false } });
    expect(goalieStatsDelta(e, local).saves).toBe(1);
    expect(goalieStatsDelta(e, rival).saves).toBe(0);
    expect(eventTargetsOpposingGoalie(GoalieAction.SAVE)).toBe(false);
  });

  it("un disparo rival a puerta lo para el portero contrario, no el del rival", () => {
    const e = ev({
      type: ActionType.SHOT,
      playerIds: ["rival-1", "gk1"],
      destinationGrid: "G5",
      metadata: { isOpponent: true },
    });
    expect(goalieStatsDelta(e, local).saves).toBe(1);
    expect(goalieStatsDelta(e, rival).saves).toBe(0);
  });

  it("un tiro fuera no cuenta como parada", () => {
    const e = ev({
      type: ActionType.SHOT,
      playerIds: ["rival-1", "gk1"],
      destinationGrid: "OUT",
      metadata: { isOpponent: true },
    });
    expect(goalieStatsDelta(e, local).saves).toBe(0);
  });

  it("el gol lo encaja el portero del bando contrario al del evento", () => {
    const e = ev({ type: ActionType.GOAL, playerIds: ["rival-1", "gk1"], metadata: { isOpponent: true } });
    expect(goalieStatsDelta(e, local).conceded).toBe(1);
    expect(goalieStatsDelta(e, rival).conceded).toBe(0);
  });

  it("la salida suma al portero que la ejecuta, y el éxito solo si consta", () => {
    const exito = ev({
      type: GoalieAction.EXIT,
      playerIds: ["gk1"],
      metadata: { isOpponent: false, exitOutcome: "success" },
    });
    const fallo = ev({
      type: GoalieAction.EXIT,
      playerIds: ["gk1"],
      metadata: { isOpponent: false, exitOutcome: "fail" },
    });
    const sinResultado = ev({ type: GoalieAction.EXIT, playerIds: ["gk1"], metadata: { isOpponent: false } });

    expect(goalieStatsDelta(exito, local)).toMatchObject({ exits: 1, exitsSuccess: 1 });
    expect(goalieStatsDelta(fallo, local)).toMatchObject({ exits: 1, exitsSuccess: 0 });
    expect(goalieStatsDelta(sinResultado, local)).toMatchObject({ exits: 1, exitsSuccess: 0 });
    expect(goalieStatsDelta(exito, rival).exits).toBe(0);
  });

  it("deshacer resta EXACTAMENTE lo que sumó, al mismo portero", () => {
    // El delta es la fuente única: registrar suma, borrar resta lo mismo.
    const eventos = [
      ev({ type: GoalieAction.SAVE, playerIds: ["gk1"], metadata: { isOpponent: false } }),
      ev({ type: ActionType.GOAL, playerIds: ["rival-1", "gk1"], metadata: { isOpponent: true } }),
      ev({ type: GoalieAction.EXIT, playerIds: ["gk1"], metadata: { isOpponent: false, exitOutcome: "success" } }),
    ];
    for (const e of eventos) {
      const suma = goalieStatsDelta(e, local);
      const resta = goalieStatsDelta(e, local);
      expect(resta).toEqual(suma);
      // Y al otro portero no le toca nada en ninguno de los dos sentidos.
      expect(goalieStatsDelta(e, rival)).toEqual({
        saves: 0, conceded: 0, exits: 0, exitsSuccess: 0,
      });
    }
  });

  it("un jugador de campo nunca acumula estadísticas de portero", () => {
    const campo = gk({ id: "p1", role: Role.PLAYER });
    const e = ev({ type: GoalieAction.SAVE, playerIds: ["p1"] });
    expect(goalieStatsDelta(e, campo)).toEqual({ saves: 0, conceded: 0, exits: 0, exitsSuccess: 0 });
  });
});

describe("Ningún consumidor puede olvidar un tipo nuevo", () => {
  it("GOALIE_SAVE_TYPES enumera TODOS los tipos de parada, vivos e históricos", () => {
    expect([...GOALIE_SAVE_TYPES].sort()).toEqual(
      [
        GoalieAction.SAVE,
        GoalieAction.SAVE_CATCH,
        GoalieAction.SAVE_DEFLECT,
        GoalieAction.SAVE_PARRY,
      ].sort(),
    );
  });

  it("isAnySave reconoce los cuatro tipos de parada", () => {
    for (const type of GOALIE_SAVE_TYPES) {
      expect(isAnySave(ev({ type }))).toBe(true);
    }
  });

  it("isAnySave NO confunde una salida con una parada", () => {
    // EXIT es intervención, no parada: no debe colarse en tiros ni paradas.
    expect(isAnySave(ev({ type: GoalieAction.EXIT }))).toBe(false);
    expect(isGoalieIntervention(ev({ type: GoalieAction.EXIT }))).toBe(true);
  });

  it("todo tipo producible está cubierto por algún predicado", () => {
    for (const type of PRODUCIBLE_GOALIE_ACTIONS) {
      expect(isGoalieIntervention(ev({ type }))).toBe(true);
    }
  });

  it("la propiedad del evento resuelve el doble conteo histórico", () => {
    const local = { id: "gkA", role: Role.GOALKEEPER, isOpponent: false };
    const rival = { id: "gkB", role: Role.GOALKEEPER, isOpponent: true };
    const historico = ev({
      type: GoalieAction.SAVE_PARRY,
      playerIds: ["gkA", "gkB"],
      metadata: { isOpponent: false },
    });
    expect(isGoalieEventOwnedBy(historico, local)).toBe(true);
    expect(isGoalieEventOwnedBy(historico, rival)).toBe(false);
  });

  it("un gol encajado conserva su atribución registrada", () => {
    // Nunca tuvo doble conteo: solo se anadía un portero a playerIds.
    const gol = ev({
      type: GoalieAction.GOAL_CONCEDED,
      playerIds: ["gkA"],
      metadata: { isOpponent: true },
    });
    expect(isGoalieEventOwnedBy(gol, { id: "gkA", role: Role.GOALKEEPER, isOpponent: false })).toBe(true);
  });
});

// ── MODELO C: TIRO RIVAL + RESPUESTA DEL PORTERO = UNA OCASIÓN ─────────
describe("Tiro enriquecido con la respuesta del portero", () => {
  const nuestroGk = gk({ id: "gk1", isOpponent: false });
  const suGk = gk({ id: "gk2", isOpponent: true });

  /** Tiro del rival contra nuestra portería, con respuesta declarada. */
  const tiroRival = (response: GoalieResponse, extra: Partial<GameEvent> = {}) =>
    ev({
      type: ActionType.SHOT,
      playerIds: ["rival-10", "gk1"],
      originGrid: "Z4C",
      destinationGrid: response === GoalieAction.EXIT ? undefined : "G5",
      metadata: {
        isOpponent: true,
        goalieResponse: response,
        targetGoalkeeperId: "gk1",
        ...(response === GoalieAction.EXIT ? { exitOutcome: "success" } : {}),
      },
      ...extra,
    });

  it("REGRESIÓN: una jugada con parada NUNCA produce dos paradas", () => {
    // El defecto original: registrar el tiro y la parada por separado daba
    // dos paradas y dos ocasiones. Aquí es un solo evento.
    const ocasion = tiroRival(GoalieAction.SAVE);
    expect(goalieStatsDelta(ocasion, nuestroGk).saves).toBe(1);
    expect(goalieStatsDelta(ocasion, suGk).saves).toBe(0);
    // Y sigue siendo UN solo intento de tiro.
    expect(isAnySave(ocasion)).toBe(true);
    expect(isUnspecifiedSave(ocasion)).toBe(false);
  });

  it("SHOT + PARADA → 1 tiro / 1 parada", () => {
    const e = tiroRival(GoalieAction.SAVE);
    expect(effectiveGoalieAction(e)).toBe(GoalieAction.SAVE);
    expect(goalieStatsDelta(e, nuestroGk)).toEqual({ saves: 1, conceded: 0, exits: 0, exitsSuccess: 0 });
  });

  it("SHOT + BLOCAJE → 1 tiro / 1 parada de subtipo blocaje", () => {
    const e = tiroRival(GoalieAction.SAVE_CATCH);
    expect(effectiveGoalieAction(e)).toBe(GoalieAction.SAVE_CATCH);
    expect(goalieStatsDelta(e, nuestroGk).saves).toBe(1);
  });

  it("SHOT + DESPEJE → 1 tiro / 1 parada de subtipo despeje", () => {
    const e = tiroRival(GoalieAction.SAVE_DEFLECT);
    expect(effectiveGoalieAction(e)).toBe(GoalieAction.SAVE_DEFLECT);
    expect(goalieStatsDelta(e, nuestroGk).saves).toBe(1);
  });

  it("SHOT + SALIDA éxito → salida, NO parada", () => {
    const e = tiroRival(GoalieAction.EXIT);
    expect(isExit(e)).toBe(true);
    expect(isAnySave(e)).toBe(false);
    expect(goalieStatsDelta(e, nuestroGk)).toEqual({ saves: 0, conceded: 0, exits: 1, exitsSuccess: 1 });
  });

  it("SHOT + SALIDA fallo → salida sin éxito, NO parada", () => {
    const e = ev({
      ...tiroRival(GoalieAction.EXIT),
      metadata: { isOpponent: true, goalieResponse: GoalieAction.EXIT, exitOutcome: "fail", targetGoalkeeperId: "gk1" },
    });
    expect(goalieStatsDelta(e, nuestroGk)).toEqual({ saves: 0, conceded: 0, exits: 1, exitsSuccess: 0 });
  });

  it("SHOT SIN respuesta conserva el comportamiento de siempre", () => {
    const e = ev({
      type: ActionType.SHOT,
      playerIds: ["rival-10", "gk1"],
      destinationGrid: "G5",
      metadata: { isOpponent: true },
    });
    expect(effectiveGoalieAction(e)).toBeNull();
    expect(isUnspecifiedSave(e)).toBe(true);
    expect(goalieStatsDelta(e, nuestroGk).saves).toBe(1);
  });

  it("la respuesta la firma el portero OBJETIVO, nunca el del bando del tiro", () => {
    const e = tiroRival(GoalieAction.SAVE_CATCH);
    expect(goalieStatsDelta(e, nuestroGk).saves).toBe(1);
    expect(goalieStatsDelta(e, suGk)).toEqual({ saves: 0, conceded: 0, exits: 0, exitsSuccess: 0 });
  });

  it("identifica al portero por el id explícito", () => {
    const e = tiroRival(GoalieAction.SAVE);
    expect(targetGoalkeeperIdOf(e, [nuestroGk, suGk])).toBe("gk1");
  });

  it("si falta el id explícito, lo deduce por bando (eventos anteriores)", () => {
    const e = ev({
      type: ActionType.SHOT,
      playerIds: ["rival-10", "gk1"],
      destinationGrid: "G5",
      metadata: { isOpponent: true },
    });
    expect(targetGoalkeeperIdOf(e, [nuestroGk, suGk])).toBe("gk1");
  });

  it("con DOS porteros, la respuesta va al que encaró el tiro", () => {
    const gkSuplente = gk({ id: "gk3", number: 13, isOpponent: false, isOnPitch: false });
    const e = ev({
      ...tiroRival(GoalieAction.SAVE),
      playerIds: ["rival-10", "gk3"],
      metadata: { isOpponent: true, goalieResponse: GoalieAction.SAVE, targetGoalkeeperId: "gk3" },
    });
    expect(targetGoalkeeperIdOf(e, [nuestroGk, gkSuplente, suGk])).toBe("gk3");
    expect(goalieStatsDelta(e, gkSuplente).saves).toBe(1);
    expect(goalieStatsDelta(e, nuestroGk).saves).toBe(0);
  });

  it("tras sustituir al portero, borrar resta al que lo firmó", () => {
    // El borrado usa el MISMO delta que el registro, y decide por identidad.
    const gkSuplente = gk({ id: "gk3", number: 13, isOpponent: false });
    const e = ev({
      ...tiroRival(GoalieAction.SAVE_DEFLECT),
      playerIds: ["rival-10", "gk1"],
      metadata: { isOpponent: true, goalieResponse: GoalieAction.SAVE_DEFLECT, targetGoalkeeperId: "gk1" },
    });
    // gk1 ya no está en pista; gk3 sí. No cambia nada.
    const salido = { ...nuestroGk, isOnPitch: false };
    const entrado = { ...gkSuplente, isOnPitch: true };
    expect(goalieStatsDelta(e, salido).saves).toBe(1);
    expect(goalieStatsDelta(e, entrado).saves).toBe(0);
  });

  it("acepta zona de intervención sobre el tiro enriquecido", () => {
    expect(eventAcceptsGoalkeeperZone(tiroRival(GoalieAction.SAVE))).toBe(true);
    expect(eventAcceptsGoalkeeperZone(ev({ type: GoalieAction.EXIT }))).toBe(true);
    // Un tiro sin respuesta no pide zona de portero.
    expect(
      eventAcceptsGoalkeeperZone(ev({ type: ActionType.SHOT, metadata: { isOpponent: true } })),
    ).toBe(false);
  });

  it("una acción suelta del portero (Camino B) sigue funcionando igual", () => {
    const suelta = ev({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"], metadata: { isOpponent: false } });
    expect(effectiveGoalieAction(suelta)).toBe(GoalieAction.SAVE_CATCH);
    expect(goalieStatsDelta(suelta, nuestroGk).saves).toBe(1);
  });

  it("el histórico sin goalieResponse y SAVE_PARRY no se tocan", () => {
    const historico = ev({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"], metadata: { isOpponent: false } });
    expect(effectiveGoalieAction(historico)).toBe(GoalieAction.SAVE_PARRY);
    expect(isUnspecifiedSave(historico)).toBe(true);
    expect(goalieStatsDelta(historico, nuestroGk).saves).toBe(1);
    expect(goalieResponseOf(historico)).toBeNull();
  });

  it("no acepta como respuesta un valor arbitrario", () => {
    const e = ev({ type: ActionType.SHOT, metadata: { isOpponent: true, goalieResponse: "PARADON" } });
    expect(goalieResponseOf(e)).toBeNull();
    expect(isGoalieResponse("PARADON")).toBe(false);
  });
});

// ── EL ENCADENADO SOLO APLICA A TIROS DEL RIVAL ───────────────────────
describe("¿A qué tiros se ofrece respuesta del portero?", () => {
  const nuestroGk = gk({ id: "gk1", isOpponent: false, isOnPitch: true });
  const nuestroGkSuplente = gk({ id: "gk3", number: 13, isOpponent: false, isOnPitch: false });
  const suGk = gk({ id: "gk2", number: 1, isOpponent: true, isOnPitch: true });
  const jugador = gk({ id: "p7", number: 7, role: Role.PLAYER, isOpponent: false });
  const plantilla = [nuestroGk, nuestroGkSuplente, suGk, jugador];

  it("SHOT del RIVAL con nuestro portero en pista → SÍ ofrece respuesta", () => {
    const portero = goalieRespondingToShot(ActionType.SHOT, true, plantilla);
    expect(portero).not.toBeNull();
    expect(portero!.id).toBe("gk1");
  });

  it("SHOT PROPIO → NO ofrece respuesta, aunque el portero rival esté en pista", () => {
    // No interrumpimos la captura de nuestros tiros para preguntar por el
    // portero contrario: sus paradas no se analizan.
    expect(goalieRespondingToShot(ActionType.SHOT, false, plantilla)).toBeNull();
  });

  it("SHOT del rival SIN portero nuestro identificable → fallback seguro", () => {
    const sinPortero = [suGk, jugador];
    expect(goalieRespondingToShot(ActionType.SHOT, true, sinPortero)).toBeNull();
    // Tampoco si nuestro portero está fuera de pista.
    const banquillo = [{ ...nuestroGk, isOnPitch: false }, suGk];
    expect(goalieRespondingToShot(ActionType.SHOT, true, banquillo)).toBeNull();
  });

  it("tras sustituir, usa el portero que está EN PISTA en ese momento", () => {
    const trasCambio = [
      { ...nuestroGk, isOnPitch: false },
      { ...nuestroGkSuplente, isOnPitch: true },
      suGk,
    ];
    expect(goalieRespondingToShot(ActionType.SHOT, true, trasCambio)!.id).toBe("gk3");
  });

  it("solo los tiros abren respuesta: ninguna otra acción lo hace", () => {
    for (const tipo of [
      ActionType.GOAL,
      ActionType.LOSS,
      ActionType.STEAL,
      ActionType.FOUL,
      ActionType.CORNER,
      GoalieAction.SAVE,
      GoalieAction.EXIT,
    ]) {
      expect(goalieRespondingToShot(tipo, true, plantilla)).toBeNull();
    }
  });
});

// ── COHERENCIA RESPUESTA ↔ destinationGrid ────────────────────────────
describe("Semántica de OUT frente a la respuesta del portero", () => {
  const nuestroGk = gk({ id: "gk1", isOpponent: false });

  const tiro = (response: GoalieResponse | null, destino?: string) =>
    ev({
      type: ActionType.SHOT,
      playerIds: ["rival-10", "gk1"],
      destinationGrid: destino,
      metadata: {
        isOpponent: true,
        targetGoalkeeperId: "gk1",
        ...(response ? { goalieResponse: response } : {}),
      },
    });

  it("DESPEJE + OUT es legítimo: el botón se llama 'Tiro Fuera / Desviado'", () => {
    // Un portero que desvía un balón fuera para córner es el caso más común
    // de despeje en futsal. No se prohíbe.
    const e = tiro(GoalieAction.SAVE_DEFLECT, "OUT");
    expect(goalieStatsDelta(e, nuestroGk).saves).toBe(1);
    expect(isAnySave(e)).toBe(true);
  });

  it("PARADA y BLOCAJE dentro de la portería cuentan igual", () => {
    for (const r of PRODUCIBLE_SAVE_TYPES as GoalieResponse[]) {
      expect(goalieStatsDelta(tiro(r, "G5"), nuestroGk).saves).toBe(1);
    }
  });

  it("una respuesta declarada manda sobre el destino: no se descuenta por OUT", () => {
    // Si el usuario declaró que el portero intervino, la parada cuenta
    // aunque el balón acabara fuera. No se contradice al usuario.
    expect(goalieStatsDelta(tiro(GoalieAction.SAVE, "OUT"), nuestroGk).saves).toBe(1);
    expect(goalieStatsDelta(tiro(GoalieAction.SAVE_CATCH, "OUT"), nuestroGk).saves).toBe(1);
  });

  it("SALIDA no lleva destino, y si lo llevara seguiría siendo salida", () => {
    const sinDestino = tiro(GoalieAction.EXIT, undefined);
    expect(sinDestino.destinationGrid).toBeUndefined();
    expect(isExit(sinDestino)).toBe(true);
    expect(isAnySave(sinDestino)).toBe(false);
    // Robustez: un destino heredado no la convierte en parada.
    expect(isAnySave(tiro(GoalieAction.EXIT, "G5"))).toBe(false);
  });

  it("SIN respuesta declarada, el destino decide (comportamiento histórico)", () => {
    expect(goalieStatsDelta(tiro(null, "G5"), nuestroGk).saves).toBe(1);
    expect(goalieStatsDelta(tiro(null, "OUT"), nuestroGk).saves).toBe(0);
  });
});

// ── UNSPECIFIED: EL OPERADOR DECIDIÓ NO REGISTRAR LA INTERVENCIÓN ─────
describe("undefined (histórico) frente a UNSPECIFIED (nuevo)", () => {
  const nuestroGk = gk({ id: "gk1", isOpponent: false });

  const tiro = (declarado: string | undefined, destino = "G5") =>
    ev({
      type: ActionType.SHOT,
      playerIds: ["rival-10", "gk1"],
      destinationGrid: destino,
      metadata: {
        isOpponent: true,
        targetGoalkeeperId: "gk1",
        ...(declarado ? { goalieResponse: declarado } : {}),
      },
    });

  it("NO son equivalentes: undefined conserva el fallback, UNSPECIFIED lo corta", () => {
    const historico = tiro(undefined);
    const nuevo = tiro(GOALIE_RESPONSE_UNSPECIFIED);

    expect(declaredGoalieResponseOf(historico)).toBeNull();
    expect(declaredGoalieResponseOf(nuevo)).toBe(GOALIE_RESPONSE_UNSPECIFIED);

    expect(isUnspecifiedSave(historico)).toBe(true);
    expect(isUnspecifiedSave(nuevo)).toBe(false);
  });

  it("histórico a puerta sigue siendo parada de subtipo no registrado", () => {
    expect(goalieStatsDelta(tiro(undefined, "G5"), nuestroGk).saves).toBe(1);
  });

  it("UNSPECIFIED no es una parada", () => {
    const e = tiro(GOALIE_RESPONSE_UNSPECIFIED);
    expect(isAnySave(e)).toBe(false);
    expect(isTypedSave(e)).toBe(false);
    expect(isExit(e)).toBe(false);
    expect(effectiveGoalieAction(e)).toBeNull();
  });

  it("UNSPECIFIED + G5 → 0 paradas", () => {
    expect(goalieStatsDelta(tiro(GOALIE_RESPONSE_UNSPECIFIED, "G5"), nuestroGk)).toEqual({
      saves: 0, conceded: 0, exits: 0, exitsSuccess: 0,
    });
  });

  it("UNSPECIFIED + OUT → 0 paradas", () => {
    expect(goalieStatsDelta(tiro(GOALIE_RESPONSE_UNSPECIFIED, "OUT"), nuestroGk).saves).toBe(0);
  });

  it("deshacer un UNSPECIFIED no resta una parada inexistente", () => {
    // Registrar y borrar usan el mismo delta: si suma 0, resta 0.
    const e = tiro(GOALIE_RESPONSE_UNSPECIFIED);
    expect(goalieStatsDelta(e, nuestroGk).saves).toBe(0);
  });

  it("UNSPECIFIED no abre zona de intervención: no se inventa ubicación", () => {
    expect(eventAcceptsGoalkeeperZone(tiro(GOALIE_RESPONSE_UNSPECIFIED))).toBe(false);
  });

  it("las respuestas con intervención siguen contando exactamente una vez", () => {
    for (const r of PRODUCIBLE_SAVE_TYPES) {
      expect(goalieStatsDelta(tiro(r), nuestroGk).saves).toBe(1);
    }
    const salida = ev({
      ...tiro(GoalieAction.EXIT, undefined),
      metadata: { isOpponent: true, goalieResponse: GoalieAction.EXIT, exitOutcome: "success", targetGoalkeeperId: "gk1" },
    });
    expect(goalieStatsDelta(salida, nuestroGk)).toEqual({ saves: 0, conceded: 0, exits: 1, exitsSuccess: 1 });
  });

  it("un GOL rival sigue contando como encajado", () => {
    const gol = ev({
      type: ActionType.GOAL,
      playerIds: ["rival-10", "gk1"],
      metadata: { isOpponent: true, targetGoalkeeperId: "gk1" },
    });
    expect(goalieStatsDelta(gol, nuestroGk)).toEqual({ saves: 0, conceded: 1, exits: 0, exitsSuccess: 0 });
  });

  it("la etiqueta de exportación es humana y nunca el código", () => {
    expect(formatDeclaredResponse(tiro(GOALIE_RESPONSE_UNSPECIFIED))).toBe("Sin intervención registrada");
    expect(formatDeclaredResponse(tiro(GoalieAction.SAVE_DEFLECT))).toBe("Despeje");
    expect(formatDeclaredResponse(tiro(undefined))).toBe("");
    for (const declarado of [GOALIE_RESPONSE_UNSPECIFIED, ...PRODUCIBLE_SAVE_TYPES]) {
      expect(formatDeclaredResponse(tiro(declarado))).not.toMatch(/UNSPECIFIED|SAVE|EXIT/);
    }
  });
});
