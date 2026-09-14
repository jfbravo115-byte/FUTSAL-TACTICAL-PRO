import { describe, expect, it } from "vitest";
import { ActionType, GoalieAction } from "../types/futsal";
import {
  ACTION_NOUN,
  ZONE_12_IDS,
  ZONE_12_PATTERN,
  acceptsOrigin,
  acceptsTarget,
  bandTotal,
  describeAllBands,
  describeBand,
  describeTopZone,
  describeZoneCount,
  emptyZoneTally,
  formatZoneLabel,
  isZone12Id,
  makeZone12,
  mirrorZone12,
  originIsOptional,
  parseZone12,
  tallyTotal,
  tallyZones,
} from "./fieldZones";

const LOSSES = ACTION_NOUN[ActionType.LOSS]!;
const SHOTS = ACTION_NOUN[ActionType.SHOT]!;

describe("las 12 zonas", () => {
  it("son exactamente 4 franjas × 3 carriles, sin huecos ni repetidos", () => {
    expect(ZONE_12_IDS).toHaveLength(12);
    expect(new Set(ZONE_12_IDS).size).toBe(12);
    expect(ZONE_12_IDS.every((id) => ZONE_12_PATTERN.test(id))).toBe(true);
  });

  it("se ordenan de la portería propia a la rival, y dentro izquierda→centro→derecha", () => {
    expect(ZONE_12_IDS).toEqual([
      "Z1L", "Z1C", "Z1R",
      "Z2L", "Z2C", "Z2R",
      "Z3L", "Z3C", "Z3R",
      "Z4L", "Z4C", "Z4R",
    ]);
  });

  it("construye y descompone un sector sin pérdida", () => {
    expect(makeZone12(3, "C")).toBe("Z3C");
    expect(parseZone12("Z3C")).toEqual({ band: 3, lane: "C" });
  });

  it("rechaza cualquier valor que no sea del sistema nuevo", () => {
    for (const raw of ["A1", "C3", "G5", "OUT", "Z5L", "Z0C", "Z1X", "", "z1l ", null, undefined, 7]) {
      expect(isZone12Id(raw)).toBe(false);
      expect(parseZone12(raw)).toBeNull();
    }
  });
});

describe("orientación izquierda/centro/derecha", () => {
  it("traduce el código interno a etiqueta de usuario", () => {
    expect(formatZoneLabel("Z1L")).toBe("Zona 1 · izquierda");
    expect(formatZoneLabel("Z2C")).toBe("Zona 2 · centro");
    expect(formatZoneLabel("Z4R")).toBe("Zona 4 · derecha");
  });

  it("etiqueta los 12 sectores sin dejar escapar ningún código interno", () => {
    for (const id of ZONE_12_IDS) {
      const label = formatZoneLabel(id)!;
      expect(label).toMatch(/^Zona [1-4] · (izquierda|centro|derecha)$/);
      expect(label).not.toContain(id);
    }
  });

  it("no etiqueta lo que no es del sistema nuevo", () => {
    expect(formatZoneLabel("A1")).toBeNull();
    expect(formatZoneLabel(undefined)).toBeNull();
  });
});

describe("espejo a la perspectiva del equipo contrario", () => {
  it("invierte franja y carril, dejando el centro donde está", () => {
    expect(mirrorZone12("Z1L")).toBe("Z4R");
    expect(mirrorZone12("Z4R")).toBe("Z1L");
    expect(mirrorZone12("Z2C")).toBe("Z3C");
    expect(mirrorZone12("Z3C")).toBe("Z2C");
    expect(mirrorZone12("Z1C")).toBe("Z4C");
  });

  it("es involutivo: aplicarlo dos veces devuelve el sector original", () => {
    for (const id of ZONE_12_IDS) {
      expect(mirrorZone12(mirrorZone12(id))).toBe(id);
    }
  });

  it("nunca deja un sector fuera del sistema", () => {
    for (const id of ZONE_12_IDS) {
      expect(isZone12Id(mirrorZone12(id))).toBe(true);
    }
  });

  it("devuelve null para lo que no es del sistema nuevo", () => {
    expect(mirrorZone12("A1")).toBeNull();
  });
});

describe("catálogo de acciones espaciales", () => {
  it("admite ubicación en todas las acciones acordadas para Fase 3", () => {
    const spatial = [
      ActionType.SHOT,
      ActionType.GOAL,
      ActionType.LOSS,
      ActionType.UNFORCED_ERROR,
      ActionType.STEAL,
      ActionType.INTERCEPTION,
      ActionType.FOUL,
      ActionType.CORNER,
      GoalieAction.SAVE,
      GoalieAction.SAVE_PARRY,
      GoalieAction.SAVE_CATCH,
      GoalieAction.GOAL_CONCEDED,
    ];
    for (const type of spatial) expect(acceptsOrigin(type)).toBe(true);
  });

  it("no admite ubicación en acciones no espaciales", () => {
    for (const type of [ActionType.ASSIST, ActionType.TIMEOUT, ActionType.YELLOW_CARD, ActionType.SUBSTITUTION]) {
      expect(acceptsOrigin(type)).toBe(false);
    }
  });

  it("solo pide destino de portería en tiros e intervenciones de portero", () => {
    expect(acceptsTarget(ActionType.SHOT)).toBe(true);
    expect(acceptsTarget(GoalieAction.GOAL_CONCEDED)).toBe(true);
    expect(acceptsTarget(ActionType.LOSS)).toBe(false);
    expect(acceptsTarget(ActionType.FOUL)).toBe(false);
    expect(acceptsTarget(ActionType.CORNER)).toBe(false);
  });

  it("marca la ubicación como opcional SOLO en las faltas", () => {
    expect(originIsOptional(ActionType.FOUL)).toBe(true);
    expect(originIsOptional(ActionType.CORNER)).toBe(false);
    expect(originIsOptional(ActionType.SHOT)).toBe(false);
  });
});

describe("recuento por zona", () => {
  it("ignora en silencio cualquier zona que no sea del sistema nuevo", () => {
    const tally = tallyZones(["Z2C", "A1", "Z2C", "G5", undefined, "", "Z1L"]);
    expect(tally.Z2C).toBe(2);
    expect(tally.Z1L).toBe(1);
    expect(tallyTotal(tally)).toBe(3);
  });

  it("suma una franja completa", () => {
    const tally = tallyZones(["Z2L", "Z2C", "Z2R", "Z2R", "Z3C"]);
    expect(bandTotal(tally, 2)).toBe(4);
    expect(bandTotal(tally, 3)).toBe(1);
    expect(bandTotal(tally, 1)).toBe(0);
  });

  it("parte de un recuento vacío con los 12 sectores a cero", () => {
    const tally = emptyZoneTally();
    expect(Object.keys(tally)).toHaveLength(12);
    expect(tallyTotal(tally)).toBe(0);
  });
});

describe("lectura textual agregada", () => {
  it("desglosa una franja por carriles, de mayor a menor", () => {
    const tally = tallyZones(["Z2R", "Z2R", "Z2R", "Z2C", "Z2L"]);
    expect(describeBand(2, tally, LOSSES)).toBe(
      "Zona 2: 5 pérdidas — 3 derecha, 1 izquierda, 1 centro",
    );
  });

  it("omite los carriles sin datos en vez de escribir ceros", () => {
    const tally = tallyZones(["Z3L", "Z3L"]);
    expect(describeBand(3, tally, LOSSES)).toBe("Zona 3: 2 pérdidas — 2 izquierda");
  });

  it("concuerda el singular", () => {
    const tally = tallyZones(["Z1C"]);
    expect(describeBand(1, tally, LOSSES)).toBe("Zona 1: 1 pérdida — 1 centro");
  });

  it("no redacta nada sobre una franja sin acciones", () => {
    expect(describeBand(4, emptyZoneTally(), LOSSES)).toBeNull();
  });

  it("devuelve una línea por franja con datos, en orden de zona", () => {
    const tally = tallyZones(["Z3C", "Z1L", "Z3C"]);
    expect(describeAllBands(tally, SHOTS)).toEqual([
      "Zona 1: 1 tiro — 1 izquierda",
      "Zona 3: 2 tiros — 2 centro",
    ]);
  });

  it("señala el sector de mayor concentración", () => {
    const tally = tallyZones(["Z3L", "Z3L", "Z3L", "Z1C"]);
    expect(describeTopZone(tally, LOSSES)).toBe(
      "Mayor concentración de pérdidas en Zona 3 · izquierda",
    );
  });

  it("no señala concentración cuando no hay ninguna acción ubicada", () => {
    expect(describeTopZone(emptyZoneTally(), LOSSES)).toBeNull();
  });

  it("redacta el recuento de un sector concreto", () => {
    expect(describeZoneCount("Z2C", 5, LOSSES)).toBe("5 pérdidas en Zona 2 · centro");
    expect(describeZoneCount("Z1R", 3, ACTION_NOUN[ActionType.STEAL]!)).toBe(
      "3 recuperaciones en Zona 1 · derecha",
    );
    expect(describeZoneCount("Z2C", 0, LOSSES)).toBeNull();
  });

  it("ninguna frase generada contiene un código interno", () => {
    const tally = tallyZones(["Z2R", "Z2C", "Z4L", "Z1C"]);
    const frases = [
      ...describeAllBands(tally, LOSSES),
      describeTopZone(tally, LOSSES)!,
      describeZoneCount("Z2C", 1, LOSSES)!,
    ];
    for (const frase of frases) {
      expect(frase).not.toMatch(/Z[1-4][LCR]/);
      expect(frase).not.toMatch(/\b[ABC][123]\b/);
    }
  });
});
