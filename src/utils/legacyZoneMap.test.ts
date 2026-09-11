import { describe, expect, it } from "vitest";
import { ZONE_12_IDS } from "./fieldZones";
import {
  LEGACY_DISCLAIMER,
  LEGACY_ZONE_IDS,
  NO_LOCATION_LABEL,
  classifyZone,
  formatAnyZoneLabel,
  formatLegacyLabel,
  isLegacyZoneId,
  parseLegacyZone,
} from "./legacyZoneMap";

describe("clasificación de zonas guardadas", () => {
  it("reconoce las 9 celdas históricas", () => {
    expect(LEGACY_ZONE_IDS).toHaveLength(9);
    for (const id of LEGACY_ZONE_IDS) {
      expect(classifyZone(id)).toEqual({ kind: "legacy", id });
    }
  });

  it("reconoce los 12 sectores nuevos", () => {
    for (const id of ZONE_12_IDS) {
      expect(classifyZone(id)).toEqual({ kind: "zone12", id });
    }
  });

  it("NUNCA convierte una celda histórica en un sector nuevo", () => {
    // Es la garantía central de toda la capa de compatibilidad: no existe
    // ninguna ruta que produzca un Zone12Id a partir de A1-C3.
    for (const id of LEGACY_ZONE_IDS) {
      const ref = classifyZone(id)!;
      expect(ref.kind).toBe("legacy");
      expect(ref.kind).not.toBe("zone12");
    }
  });

  it("marca como desconocido lo que no pertenece a ningún sistema de pista", () => {
    // G1-G9 y OUT son destino de PORTERÍA, no ubicación en pista.
    expect(classifyZone("G5")).toEqual({ kind: "unknown", raw: "G5" });
    expect(classifyZone("OUT")).toEqual({ kind: "unknown", raw: "OUT" });
    expect(classifyZone("D4")).toEqual({ kind: "unknown", raw: "D4" });
  });

  it("trata la ausencia de zona como ausencia, no como error", () => {
    expect(classifyZone(undefined)).toBeNull();
    expect(classifyZone(null)).toBeNull();
    expect(classifyZone("")).toBeNull();
    expect(classifyZone("   ")).toBeNull();
    expect(classifyZone(42)).toBeNull();
  });

  it("normaliza mayúsculas y espacios sobrantes al clasificar", () => {
    expect(classifyZone("a1")).toEqual({ kind: "legacy", id: "A1" });
    expect(classifyZone(" z2c ")).toEqual({ kind: "zone12", id: "Z2C" });
  });

  it("descompone una celda histórica", () => {
    expect(isLegacyZoneId("B2")).toBe(true);
    expect(parseLegacyZone("B2")).toEqual({ row: "B", col: "2" });
    expect(parseLegacyZone("Z2C")).toBeNull();
  });
});

describe("etiquetas históricas", () => {
  it("usa la columna como eje longitudinal, según la pantalla de captura", () => {
    // Decisión de arquitectura: manda la pista horizontal del selector.
    // Columna 1→3 recorre la pista de portería a portería; la letra es la
    // banda transversal.
    expect(formatLegacyLabel("A1")).toBe("Franja 1 · banda superior");
    expect(formatLegacyLabel("B2")).toBe("Franja 2 · banda central");
    expect(formatLegacyLabel("C3")).toBe("Franja 3 · banda inferior");
    expect(formatLegacyLabel("A3")).toBe("Franja 3 · banda superior");
    expect(formatLegacyLabel("C1")).toBe("Franja 1 · banda inferior");
  });

  it("nunca habla de zona propia ni rival: esa perspectiva no se registró", () => {
    for (const id of LEGACY_ZONE_IDS) {
      const label = formatLegacyLabel(id)!;
      expect(label).not.toMatch(/propia|rival|ataque|defensa/i);
      expect(label).not.toMatch(/^Zona /);
    }
  });

  it("advierte explícitamente de la imprecisión del dato histórico", () => {
    expect(LEGACY_DISCLAIMER).toMatch(/perspectiva/i);
    expect(LEGACY_DISCLAIMER).toMatch(/no registrada/i);
  });
});

describe("etiqueta única para la UI", () => {
  it("no deja escapar ningún código interno, sea del sistema que sea", () => {
    for (const id of [...LEGACY_ZONE_IDS, ...ZONE_12_IDS]) {
      const label = formatAnyZoneLabel(id);
      expect(label).not.toMatch(/\b[ABC][123]\b/);
      expect(label).not.toMatch(/Z[1-4][LCR]/);
      expect(label).not.toBe(NO_LOCATION_LABEL);
    }
  });

  it("describe la ausencia de ubicación en vez de inventar una zona", () => {
    expect(formatAnyZoneLabel(undefined)).toBe(NO_LOCATION_LABEL);
    expect(formatAnyZoneLabel("G5")).toBe(NO_LOCATION_LABEL);
  });

  it("distingue el sistema nuevo del histórico en la propia redacción", () => {
    expect(formatAnyZoneLabel("Z2C")).toBe("Zona 2 · centro");
    expect(formatAnyZoneLabel("B2")).toBe("Franja 2 · banda central");
  });
});
