/**
 * La traducción entre lo que se TOCA en la mini pista y lo que se GUARDA.
 *
 * Es la única que existe: si estas pruebas pasan, la esquina o la zona
 * elegida a dedo produce exactamente el mismo `cornerSide` / `originGrid`
 * que leen los mapas, las estadísticas y las exportaciones de siempre.
 */
import { describe, expect, it } from "vitest";
import { cornerOriginGrid, cornerSideFromGrid } from "./cornerModel";
import { ZONE_12_IDS } from "./fieldZones";
import {
  FREE_KICK_COLUMNS,
  FREE_KICK_ROWS,
  VISUAL_CORNERS,
  cornerGridFromVisual,
  cornerSideFromVisual,
  describeFreeKickLocation,
  describeFreeKickZone,
  describeVisualCorner,
  freeKickCellOf,
  freeKickZoneFromCell,
  isPlayableCorner,
  visualCornerFor,
} from "./setPieceVisualZones";

describe("córner · las cuatro esquinas", () => {
  it("superior derecha = córner izquierdo (Z4L) y inferior derecha = córner derecho (Z4R)", () => {
    expect(cornerSideFromVisual("top-right")).toBe("left");
    expect(cornerGridFromVisual("top-right")).toBe("Z4L");
    expect(cornerSideFromVisual("bottom-right")).toBe("right");
    expect(cornerGridFromVisual("bottom-right")).toBe("Z4R");
  });

  it("las dos esquinas de su propia portería no son un córner a favor", () => {
    expect(cornerSideFromVisual("top-left")).toBeNull();
    expect(cornerSideFromVisual("bottom-left")).toBeNull();
    expect(isPlayableCorner("top-left")).toBe(false);
    expect(isPlayableCorner("bottom-left")).toBe(false);
    expect(VISUAL_CORNERS.filter(isPlayableCorner)).toEqual(["top-right", "bottom-right"]);
  });

  it("ida y vuelta: lado canónico → esquina → el mismo lado y la misma zona de siempre", () => {
    for (const side of ["left", "right"] as const) {
      const esquina = visualCornerFor(side);
      expect(cornerSideFromVisual(esquina)).toBe(side);
      expect(cornerGridFromVisual(esquina)).toBe(cornerOriginGrid(side));
      expect(cornerSideFromGrid(cornerGridFromVisual(esquina))).toBe(side);
    }
  });

  it("la etiqueta dice la esquina vista y el lado de siempre, sin códigos", () => {
    expect(describeVisualCorner("right")).toBe("Córner desde esquina inferior derecha · córner derecho");
    expect(describeVisualCorner("left")).toBe("Córner desde esquina superior derecha · córner izquierdo");
    expect(describeVisualCorner("left")).not.toMatch(/Z[1-4][LCR]/);
  });
});

describe("falta · las doce zonas", () => {
  it("cada celda va a una zona distinta y entre todas cubren las 12, sin huecos", () => {
    const zonas = FREE_KICK_ROWS.flatMap((_, r) => FREE_KICK_COLUMNS.map((__, c) => freeKickZoneFromCell(r, c)));
    expect(new Set(zonas).size).toBe(12);
    expect([...zonas].sort()).toEqual([...ZONE_12_IDS].sort());
  });

  it("columnas de su portería a la rival (Z1→Z4) y filas de su izquierda a su derecha (L, C, R)", () => {
    expect(freeKickZoneFromCell(0, 0)).toBe("Z1L");
    expect(freeKickZoneFromCell(0, 3)).toBe("Z4L");
    expect(freeKickZoneFromCell(1, 1)).toBe("Z2C");
    expect(freeKickZoneFromCell(2, 3)).toBe("Z4R");
    expect(freeKickZoneFromCell(2, 0)).toBe("Z1R");
  });

  it("código → celda → el mismo código, para las 12", () => {
    for (const z of ZONE_12_IDS) {
      const celda = freeKickCellOf(z)!;
      expect(freeKickZoneFromCell(celda.row, celda.column)).toBe(z);
    }
  });

  it("código → etiqueta visual, en palabras", () => {
    expect(describeFreeKickLocation("Z4L")).toBe("Falta en banda izquierda · zona alta");
    expect(describeFreeKickZone("Z1R")).toBe("banda derecha · zona baja");
    expect(describeFreeKickZone("Z3C")).toBe("carril central · zona media-alta");
    expect(describeFreeKickZone("Z2L")).toBe("banda izquierda · zona media-baja");
    for (const z of ZONE_12_IDS) expect(describeFreeKickLocation(z)).not.toMatch(/Z[1-4][LCR]/);
  });

  it("todas las etiquetas son distintas: ninguna zona se confunde con otra", () => {
    expect(new Set(ZONE_12_IDS.map(describeFreeKickZone)).size).toBe(12);
  });

  it("fuera de rango no inventa nada", () => {
    expect(() => freeKickZoneFromCell(3, 0)).toThrow();
    expect(() => freeKickZoneFromCell(0, 4)).toThrow();
  });
});

describe("compatibilidad con partidos antiguos", () => {
  it("un sector de la rejilla histórica (B2) o vacío no recibe etiqueta inventada", () => {
    expect(describeFreeKickLocation("B2")).toBeNull();
    expect(describeFreeKickLocation(undefined)).toBeNull();
    expect(freeKickCellOf("B2")).toBeNull();
  });
});
