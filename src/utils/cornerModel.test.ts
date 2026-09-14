import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, GameState, Period } from "../types/futsal";
import { attackDirection } from "./attackDirection";
import { formatZoneLabel, mirrorZone12 } from "./fieldZones";
import {
  cornerOriginGrid,
  cornerSideFromGrid,
  describeCorners,
  formatCornerLabel,
  isCornerEvent,
  isCornerSide,
  mirrorCornerSide,
  summarizeCorners,
} from "./cornerModel";

function corner(
  id: string,
  side: "left" | "right" | undefined,
  isOpponent = false,
  period: Period = Period.FIRST,
): GameEvent {
  return {
    id,
    timestamp: 0,
    wallClock: 0,
    period,
    playerIds: [],
    type: ActionType.CORNER,
    gameState: GameState.FOUR_VS_FOUR,
    originGrid: side ? cornerOriginGrid(side) : undefined,
    metadata: side ? { isOpponent, cornerSide: side } : { isOpponent },
  };
}

describe("ubicación del córner", () => {
  it("córner izquierdo: esquina izquierda de la zona más ofensiva", () => {
    expect(cornerOriginGrid("left")).toBe("Z4L");
    expect(formatZoneLabel(cornerOriginGrid("left"))).toBe("Zona 4 · izquierda");
  });

  it("córner derecho: esquina derecha de la zona más ofensiva", () => {
    expect(cornerOriginGrid("right")).toBe("Z4R");
    expect(formatZoneLabel(cornerOriginGrid("right"))).toBe("Zona 4 · derecha");
  });

  it("recupera el lado desde el sector, e ignora sectores que no son de esquina", () => {
    expect(cornerSideFromGrid("Z4L")).toBe("left");
    expect(cornerSideFromGrid("Z4R")).toBe("right");
    expect(cornerSideFromGrid("Z4C")).toBeNull();
    expect(cornerSideFromGrid("Z1L")).toBeNull();
    expect(cornerSideFromGrid("A1")).toBeNull();
    expect(cornerSideFromGrid(undefined)).toBeNull();
  });

  it("valida el lado sin aceptar valores inventados", () => {
    expect(isCornerSide("left")).toBe(true);
    expect(isCornerSide("right")).toBe(true);
    expect(isCornerSide("izquierda")).toBe(false);
    expect(isCornerSide(undefined)).toBe(false);
  });

  it("distingue izquierda y derecha de forma inequívoca, sin código técnico", () => {
    expect(formatCornerLabel("left")).toBe("Córner · izquierda");
    expect(formatCornerLabel("right")).toBe("Córner · derecha");
    expect(formatCornerLabel("left")).not.toMatch(/Z[1-4][LCR]/);
  });
});

describe("orientación del córner tras el cambio de campo", () => {
  it("el lado se guarda desde la perspectiva del ejecutor, no de la pantalla", () => {
    // Mismo córner por la izquierda del que saca, en las dos partes: el dato
    // guardado es idéntico, porque el id ya está normalizado a su perspectiva.
    const primera = corner("c1", "left", false, Period.FIRST);
    const segunda = corner("c2", "left", false, Period.SECOND);

    expect(primera.originGrid).toBe("Z4L");
    expect(segunda.originGrid).toBe(primera.originGrid);
    expect(segunda.metadata!.cornerSide).toBe(primera.metadata!.cornerSide);
  });

  it("mientras tanto, la dirección de ataque SÍ se invierte entre partes", () => {
    // La normalización es justamente lo que absorbe el cambio de campo: el
    // sentido físico cambia, la lectura del dato no.
    expect(attackDirection("left", Period.FIRST, false)).toBe("ltr");
    expect(attackDirection("left", Period.SECOND, false)).toBe("rtl");
  });

  it("un córner de mi equipo y otro del rival por el mismo lado son ambos Z4L", () => {
    // Cada uno desde SU perspectiva: no se mezclan ni se espejan al guardar.
    expect(corner("c1", "left", false).originGrid).toBe("Z4L");
    expect(corner("c2", "left", true).originGrid).toBe("Z4L");
  });
});

describe("espejo del córner", () => {
  it("invierte el lado", () => {
    expect(mirrorCornerSide("left")).toBe("right");
    expect(mirrorCornerSide("right")).toBe("left");
  });

  it("es coherente con el espejo de sectores", () => {
    // Espejar el lado y espejar el sector deben llevar al mismo carril.
    for (const side of ["left", "right"] as const) {
      const espejado = mirrorZone12(cornerOriginGrid(side));
      // El espejo lleva la franja 4 a la 1; el carril es lo que se compara.
      expect(espejado!.slice(-1)).toBe(cornerOriginGrid(mirrorCornerSide(side)).slice(-1));
    }
  });
});

describe("agregado de córners", () => {
  const events: GameEvent[] = [
    corner("c1", "left"),
    corner("c2", "left"),
    corner("c3", "left"),
    corner("c4", "left"),
    corner("c5", "right"),
    corner("c6", "right"),
    corner("r1", "right", true),
    corner("r2", "left", true),
  ];

  it("cuenta los córners de MI EQUIPO", () => {
    expect(summarizeCorners(events, false)).toEqual({
      total: 6,
      left: 4,
      right: 2,
      unspecified: 0,
    });
  });

  it("cuenta los córners del RIVAL por separado", () => {
    expect(summarizeCorners(events, true)).toEqual({
      total: 2,
      left: 1,
      right: 1,
      unspecified: 0,
    });
  });

  it("redacta el agregado sin códigos internos", () => {
    const frase = describeCorners(summarizeCorners(events, false))!;
    expect(frase).toBe("Córners: 6 — izquierda 4 · derecha 2");
    expect(frase).not.toMatch(/Z[1-4][LCR]/);
  });

  it("declara los córners sin lado en vez de repartirlos", () => {
    const conHuecos = [corner("c1", "left"), corner("c2", undefined)];
    const resumen = summarizeCorners(conHuecos, false);
    expect(resumen).toEqual({ total: 2, left: 1, right: 0, unspecified: 1 });
    expect(describeCorners(resumen)).toBe(
      "Córners: 2 — izquierda 1 · derecha 0 · sin lado registrado 1",
    );
  });

  it("no redacta nada cuando no hubo córners", () => {
    expect(describeCorners(summarizeCorners([], false))).toBeNull();
  });

  it("recupera el lado desde originGrid si falta metadata.cornerSide", () => {
    const soloGrid: GameEvent = {
      ...corner("c1", "left"),
      metadata: { isOpponent: false },
    };
    expect(summarizeCorners([soloGrid], false)).toEqual({
      total: 1,
      left: 1,
      right: 0,
      unspecified: 0,
    });
  });

  it("distingue un córner de cualquier otra acción", () => {
    expect(isCornerEvent(corner("c1", "left"))).toBe(true);
    expect(
      isCornerEvent({ ...corner("c1", "left"), type: ActionType.SHOT }),
    ).toBe(false);
  });
});

describe("subtipo tiro/jugada aplazado a Fase 4", () => {
  it("un córner de Fase 3 no guarda NADA sobre el desenlace", () => {
    // Es lo que garantiza que añadir cornerOutcome después sea puramente
    // aditivo y no obligue a migrar estos eventos.
    const c = corner("c1", "left");
    expect(c.metadata).not.toHaveProperty("cornerOutcome");
    expect(Object.keys(c.metadata!).sort()).toEqual(["cornerSide", "isOpponent"]);
  });
});
