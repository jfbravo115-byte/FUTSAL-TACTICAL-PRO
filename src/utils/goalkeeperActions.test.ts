import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, GameState, GoalieAction, Period, Player, Role } from "../types/futsal";
import { ZONE_12_IDS, mirrorZone12 } from "./fieldZones";
import {
  EXIT_OUTCOME_LABEL,
  FROZEN_GOALIE_ACTIONS,
  GOALIE_SAVE_TYPES,
  GOALIE_ACTION_LABEL,
  PRODUCIBLE_GOALIE_ACTIONS,
  PRODUCIBLE_SAVE_TYPES,
  attributedGoalieId,
  eventTargetsOpposingGoalie,
  exitOutcomeOf,
  formatExit,
  formatGoalieAction,
  goalieStatsDelta,
  interventionZoneOf,
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

  it("una salida CON ubicación la guarda en su campo propio", () => {
    const e = ev({ type: GoalieAction.EXIT, interventionGrid: "Z1C" });
    expect(interventionZoneOf(e)).toBe("Z1C");
  });

  it("una salida SIN ubicación sigue siendo válida", () => {
    const e = ev({ type: GoalieAction.EXIT, metadata: { isOpponent: false, exitOutcome: "success" } });
    expect(interventionZoneOf(e)).toBeNull();
    expect(exitOutcomeOf(e)).toBe("success");
    expect(goalieStatsDelta(e, gk({ id: "gk1" })).exits).toBe(0); // sin playerIds no es suya
    const suya = ev({ ...e, playerIds: ["gk1"] });
    expect(goalieStatsDelta(suya, gk({ id: "gk1" })).exits).toBe(1);
  });
});

describe("interventionGrid NUNCA se confunde con originGrid", () => {
  it("son campos independientes y no se leen el uno por el otro", () => {
    const e = ev({
      type: GoalieAction.EXIT,
      interventionGrid: "Z1C",
      originGrid: "Z4R",
      metadata: { isOpponent: false },
    });
    expect(interventionZoneOf(e)).toBe("Z1C");
    // La lectura de origen NO devuelve la zona de intervención.
    expect(shotOriginFromAttackerView(e, false)).not.toBe("Z1C");
  });

  it("una salida con ubicación pero SIN originGrid no aporta origen de tiro", () => {
    const e = ev({ type: GoalieAction.EXIT, interventionGrid: "Z1L" });
    expect(shotOriginFromAttackerView(e, false)).toBeNull();
  });

  it("interventionGrid ignora cualquier valor que no sea del sistema de 12 zonas", () => {
    expect(interventionZoneOf(ev({ interventionGrid: "A1" }))).toBeNull();
    expect(interventionZoneOf(ev({ interventionGrid: "G5" }))).toBeNull();
    expect(interventionZoneOf(ev({}))).toBeNull();
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
