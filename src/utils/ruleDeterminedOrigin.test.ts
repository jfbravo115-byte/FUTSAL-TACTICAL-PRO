/**
 * Penalti y doble penalti: el origen lo fija el reglamento.
 *
 * EL AJUSTE
 * ---------
 * Se le pedía al operador que eligiera el sector de pista de un penalti. No
 * hay nada que elegir: se lanza desde el punto de penalti, y el doble penalti
 * desde el segundo punto. Preguntarlo hacía perder tiempo en directo y, peor,
 * guardaba un sector inventado — porque el punto de penalti no pertenece a
 * ninguna de las doce zonas del sistema.
 *
 * La fuente semántica sigue siendo `metadata.setPiece`. Estos lanzamientos no
 * llevan `originGrid`, y eso NO es un dato perdido.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ActionType, GameEvent, GameState, GoalieAction, Period } from "../types/futsal";
import {
  RULE_DETERMINED_ORIGINS,
  formatShotOriginLabel,
  hasRuleDeterminedOrigin,
  isRuleDeterminedOrigin,
  shouldAskOriginZone,
} from "./setPieceModel";
import { summarizeShots } from "./shotModel";
import { buildGoalSequence } from "./goalSequence";
import { buildZoneDashboard } from "../services/matchZonesService";
import {
  buildPeriodShotMaps,
  ruleDeterminedCount,
  unlocatedCount,
} from "../components/export/PeriodShotMaps";

let seq = 0;
function ev(
  type: ActionType | GoalieAction,
  setPiece?: string,
  extra: Partial<GameEvent> = {},
): GameEvent {
  return {
    id: `e${++seq}`,
    timestamp: 1000,
    wallClock: 1000,
    period: Period.FIRST,
    playerIds: [],
    type,
    gameState: GameState.FOUR_VS_FOUR,
    metadata: { isOpponent: false, ...(setPiece ? { setPiece } : {}) },
    ...extra,
  };
}

// ── ¿SE PIDE EL SECTOR? ────────────────────────────────────────────────

describe("penalti y doble penalti NO piden sector de origen", () => {
  it("un penalti no abre el paso de origen", () => {
    expect(shouldAskOriginZone(ActionType.SHOT, "penalty")).toBe(false);
    expect(shouldAskOriginZone(ActionType.GOAL, "penalty")).toBe(false);
  });

  it("un doble penalti tampoco", () => {
    expect(shouldAskOriginZone(ActionType.SHOT, "double_penalty")).toBe(false);
    expect(shouldAskOriginZone(ActionType.GOAL, "double_penalty")).toBe(false);
  });

  it("y son exactamente esos dos, ni uno más", () => {
    expect(RULE_DETERMINED_ORIGINS).toEqual(["penalty", "double_penalty"]);
    expect(isRuleDeterminedOrigin("penalty")).toBe(true);
    expect(isRuleDeterminedOrigin("double_penalty")).toBe(true);
    for (const otro of ["normal", "free_kick", "corner", null]) {
      expect(isRuleDeterminedOrigin(otro as any)).toBe(false);
    }
  });
});

describe("el resto del flujo conserva su comportamiento", () => {
  it("un tiro normal SIGUE pidiendo el sector", () => {
    expect(shouldAskOriginZone(ActionType.SHOT, "normal")).toBe(true);
    expect(shouldAskOriginZone(ActionType.GOAL, "normal")).toBe(true);
  });

  it("un tiro sin procedencia declarada también lo pide", () => {
    expect(shouldAskOriginZone(ActionType.SHOT, undefined)).toBe(true);
    expect(shouldAskOriginZone(ActionType.SHOT, null)).toBe(true);
  });

  it("un tiro desde falta o desde córner lo sigue pidiendo", () => {
    // La falta y el córner se ejecutan desde un sitio que SÍ se observa.
    expect(shouldAskOriginZone(ActionType.SHOT, "free_kick")).toBe(true);
    expect(shouldAskOriginZone(ActionType.SHOT, "corner")).toBe(true);
  });

  it("el córner conserva su paso de origen", () => {
    expect(shouldAskOriginZone(ActionType.CORNER, undefined)).toBe(true);
  });

  it("la falta y la jugada de falta siguen con ubicación OPCIONAL", () => {
    // Comportamiento anterior intacto: la falta porque su contador
    // reglamentario no puede esperar, y la jugada de falta porque el botón ya
    // dice lo que la define. No lo cambia este ajuste.
    expect(shouldAskOriginZone(ActionType.FOUL, undefined)).toBe(false);
    expect(shouldAskOriginZone(ActionType.SET_PIECE, undefined)).toBe(false);
  });

  it("una acción sin dominio espacial sigue sin pedirlo", () => {
    expect(shouldAskOriginZone(ActionType.SUBSTITUTION, undefined)).toBe(false);
    expect(shouldAskOriginZone(GoalieAction.EXIT, undefined)).toBe(false);
  });

  it("el gol encajado hereda la misma regla", () => {
    expect(shouldAskOriginZone(GoalieAction.GOAL_CONCEDED, "penalty")).toBe(false);
    expect(shouldAskOriginZone(GoalieAction.GOAL_CONCEDED, "normal")).toBe(true);
  });
});

// ── EL EVENTO RESULTANTE ───────────────────────────────────────────────

describe("el evento de un penalti no lleva sector, y eso no es una pérdida", () => {
  const penalti = () => ev(ActionType.SHOT, "penalty", { destinationGrid: "G5" });
  const doble = () => ev(ActionType.GOAL, "double_penalty", { destinationGrid: "G1" });

  it("se reconoce como lanzamiento reglamentario", () => {
    expect(hasRuleDeterminedOrigin(penalti())).toBe(true);
    expect(hasRuleDeterminedOrigin(doble())).toBe(true);
  });

  it("una falta o un córner NO lo son", () => {
    expect(hasRuleDeterminedOrigin(ev(ActionType.SHOT, "free_kick"))).toBe(false);
    expect(hasRuleDeterminedOrigin(ev(ActionType.SHOT, "corner"))).toBe(false);
    expect(hasRuleDeterminedOrigin(ev(ActionType.CORNER, "penalty"))).toBe(false);
  });

  it("su origen se nombra por lo que es, no como dato ausente", () => {
    expect(formatShotOriginLabel(penalti())).toBe("Punto de penalti");
    expect(formatShotOriginLabel(doble())).toBe("Segundo punto de penalti");
    expect(formatShotOriginLabel(penalti())).not.toContain("sin ubicación");
  });

  it("un tiro normal sin sector SÍ dice que no consta", () => {
    // Ahí sí falta un dato que tuvo que registrarse.
    expect(formatShotOriginLabel(ev(ActionType.SHOT, "normal"))).toBe("sin ubicación registrada");
  });

  it("un tiro normal con sector conserva su etiqueta de zona", () => {
    const conZona = ev(ActionType.SHOT, "normal", { originGrid: "Z4C" });
    expect(formatShotOriginLabel(conZona)).not.toContain("sin ubicación");
    expect(formatShotOriginLabel(conZona)).not.toContain("Z4C");
  });

  it("NO se le asigna ninguna de las doce zonas", () => {
    expect(penalti().originGrid).toBeUndefined();
    expect(doble().originGrid).toBeUndefined();
  });
});

// ── SIGUEN SIENDO TIROS Y GOLES ────────────────────────────────────────

describe("siguen contando como tiro y como gol", () => {
  it("un penalti sin sector cuenta como tiro a portería", () => {
    const t = summarizeShots([ev(ActionType.SHOT, "penalty", { destinationGrid: "G5" })]);
    expect(t.shots).toBe(1);
    expect(t.onTarget).toBe(1);
    expect(t.unrecorded).toBe(0);
  });

  it("un penalti fuera cuenta como tiro fuera", () => {
    const t = summarizeShots([ev(ActionType.SHOT, "penalty", { destinationGrid: "OUT" })]);
    expect(t.shots).toBe(1);
    expect(t.offTarget).toBe(1);
  });

  it("un gol de doble penalti cuenta como gol y como tiro a portería", () => {
    const t = summarizeShots([ev(ActionType.GOAL, "double_penalty", { destinationGrid: "G1" })]);
    expect(t.shots).toBe(1);
    expect(t.goals).toBe(1);
    expect(t.onTarget).toBe(1);
  });

  it("la falta de sector no los convierte en desenlace desconocido", () => {
    const t = summarizeShots([
      ev(ActionType.SHOT, "penalty", { destinationGrid: "G5" }),
      ev(ActionType.GOAL, "double_penalty", { destinationGrid: "G1" }),
    ]);
    expect(t.unrecorded).toBe(0);
    expect(t.onTarget + t.offTarget + t.blocked).toBe(t.shots);
  });
});

describe("la secuencia de goles los sigue nombrando", () => {
  const partido = (events: GameEvent[]) =>
    ({
      teamName: "Local", opponentName: "Rival", period: Period.FINISHED,
      matchClock: 0, isClockRunning: false,
      fouls: { team: 0, opponent: 0 },
      timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
      players: [], events,
    }) as any;

  it("Penalti y Doble penalti siguen apareciendo sin sector", () => {
    const s = buildGoalSequence(
      partido([
        ev(ActionType.GOAL, "penalty", { destinationGrid: "G1", timestamp: 10_000 }),
        ev(ActionType.GOAL, "double_penalty", { destinationGrid: "G2", timestamp: 20_000 }),
      ]),
    );
    expect(s.map((g) => g.sourceLabel)).toEqual(["Penalti", "Doble penalti"]);
    expect(s.map((g) => g.source)).toEqual(["penalty", "double_penalty"]);
  });
});

// ── GUARDIAS SOBRE EL CÓDIGO REAL ──────────────────────────────────────

describe("la captura no guarda un sector inventado", () => {
  const plantilla = fs.readFileSync(
    path.resolve(__dirname, "../pages/MatchTracker.tsx"),
    "utf-8",
  );

  it("el registro omite originGrid en un lanzamiento reglamentario", () => {
    expect(plantilla).toContain(
      "const origenReglamentario = isRuleDeterminedOrigin(current.setPiece ?? null);",
    );
    expect(plantilla).toContain("...(origenReglamentario ? {} : { originGrid: current.originGrid })");
  });

  it("handleAction y la pantalla comparten el MISMO criterio", () => {
    // Si solo lo supiera la pantalla, el penalti quedaría atrapado: se
    // registraría sin sector y handleAction lo devolvería a pedir sector.
    expect(plantilla).toContain("const needsOrigin = shouldAskOriginZone(type, metadata?.metadata?.setPiece);");
    expect(plantilla).not.toContain("const needsOrigin = acceptsOrigin(type) && !originIsOptional(type);");
  });

  it("declarar un penalti salta el paso de origen desde cualquier punto", () => {
    expect(plantilla).toContain('const reglamentario = isRuleDeterminedOrigin(opt.id);');
    expect(plantilla).toMatch(/step: isRuleDeterminedOrigin\(prev\?\.setPiece \?\? null\)\s*\n?\s*\? "target"/);
  });

  it("corregirse a un lanzamiento normal devuelve el paso de origen", () => {
    expect(plantilla).toMatch(/prev\.step === "target" && !prev\.originGrid\s*\n?\s*\? "origin"/);
  });

  it("el indicador de pasos no anuncia un origen que no se va a pedir", () => {
    expect(plantilla).toMatch(
      /label === "Origen" && isRuleDeterminedOrigin\(pendingAction\.setPiece \?\? null\)/,
    );
  });

  it("el destino en portería SIGUE pidiéndose", () => {
    // Un penalti tiene destino observable: dónde entró o por dónde se fue.
    expect(plantilla).toContain('pendingAction.step === "target"');
    expect(plantilla).toContain("<GoalMap");
  });
});

// ── PRESENTACIÓN: NO ES UN DATO PERDIDO ────────────────────────────────

describe("los informes no cuentan un penalti como acción sin ubicar", () => {
  const partido = (events: GameEvent[]) =>
    ({
      teamName: "Local", opponentName: "Rival", period: Period.FINISHED,
      matchClock: 0, isClockRunning: false,
      fouls: { team: 0, opponent: 0 },
      timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
      players: [], events,
    }) as any;

  it("un penalti sin sector NO engrosa `unlocated`", () => {
    const d = buildZoneDashboard(
      partido([ev(ActionType.SHOT, "penalty", { destinationGrid: "G5" })]),
    );
    expect(d.unlocated).toBe(0);
    expect(d.ruleDetermined).toBe(1);
  });

  it("pero sigue siendo un intento en los totales", () => {
    const d = buildZoneDashboard(
      partido([ev(ActionType.GOAL, "penalty", { destinationGrid: "G1" })]),
    );
    expect(d.totals.attempts).toBe(1);
    expect(d.totals.goals).toBe(1);
    expect(d.totals.onTarget).toBe(1);
  });

  it("un tiro normal sin sector SÍ sigue contando como sin ubicar", () => {
    const d = buildZoneDashboard(partido([ev(ActionType.SHOT, "normal")]));
    expect(d.unlocated).toBe(1);
    expect(d.ruleDetermined).toBe(0);
  });

  it("las dos cifras conviven sin pisarse", () => {
    const d = buildZoneDashboard(
      partido([
        ev(ActionType.SHOT, "penalty", { destinationGrid: "G5" }),
        ev(ActionType.SHOT, "normal"),
        ev(ActionType.SHOT, "normal", { originGrid: "Z4C" }),
      ]),
    );
    expect(d.ruleDetermined).toBe(1);
    expect(d.unlocated).toBe(1);
    expect(d.totals.attempts).toBe(3);
  });

  it("el mapa de tiros los declara como lanzamientos, no como huecos", () => {
    const mapa = buildPeriodShotMaps(
      [ev(ActionType.SHOT, "penalty", { destinationGrid: "G5" })],
      false,
    ).find((m) => m.period === Period.FIRST)!;
    expect(ruleDeterminedCount(mapa)).toBe(1);
    expect(unlocatedCount(mapa)).toBe(0);
  });

  it("y un tiro normal sin sector sigue apareciendo como hueco", () => {
    const mapa = buildPeriodShotMaps([ev(ActionType.SHOT, "normal")], false).find(
      (m) => m.period === Period.FIRST,
    )!;
    expect(ruleDeterminedCount(mapa)).toBe(0);
    expect(unlocatedCount(mapa)).toBe(1);
  });
});
