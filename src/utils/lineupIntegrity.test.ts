import { describe, it, expect } from "vitest";
import { Role } from "../types/futsal";
import {
  normalizeLineup,
  effectiveSlotIndex,
  GOALKEEPER_SLOT_INDEX,
  MAX_OWN_TEAM_SLOTS,
  LineupCandidate,
} from "./lineupIntegrity";

function c(id: string, role: Role, wantsOnPitch: boolean): LineupCandidate {
  return { id, role, wantsOnPitch };
}

describe("normalizeLineup", () => {
  // A. 1 portero + 4 jugadores -> 5 pitchPosition únicos.
  it("A: 1 portero titular + 4 jugadores titulares produce 5 pitchPosition únicos (0-4)", () => {
    const candidates = [
      c("gk1", Role.GOALKEEPER, true),
      c("p1", Role.PLAYER, true),
      c("p2", Role.PLAYER, true),
      c("p3", Role.PLAYER, true),
      c("p4", Role.PLAYER, true),
    ];
    const result = normalizeLineup(candidates);
    const onPitch = result.filter((r) => r.isOnPitch);
    expect(onPitch.length).toBe(5);
    const positions = onPitch.map((r) => r.pitchPosition).sort((a, b) => (a ?? -1) - (b ?? -1));
    expect(positions).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(positions).size).toBe(5); // sin duplicados
  });

  // B. Dos porteros titulares -> solo uno activo.
  it("B: dos porteros marcados como titulares -> solo el primero queda activo en pista", () => {
    const candidates = [
      c("gk1", Role.GOALKEEPER, true),
      c("gk2", Role.GOALKEEPER, true),
      c("p1", Role.PLAYER, true),
      c("p2", Role.PLAYER, true),
      c("p3", Role.PLAYER, true),
    ];
    const result = normalizeLineup(candidates);
    const gk1 = result.find((r) => r.id === "gk1")!;
    const gk2 = result.find((r) => r.id === "gk2")!;
    expect(gk1.isOnPitch).toBe(true);
    expect(gk1.pitchPosition).toBe(GOALKEEPER_SLOT_INDEX);
    // El segundo portero se conserva en el resultado (no se elimina de la
    // plantilla), pero queda en banquillo.
    expect(gk2.isOnPitch).toBe(false);
    expect(gk2.pitchPosition).toBeUndefined();
    const activeGoalkeepers = result.filter((r) => r.isOnPitch && (r.id === "gk1" || r.id === "gk2"));
    expect(activeGoalkeepers.length).toBe(1);
  });

  it("B (orden): si el segundo portero aparece antes en la lista, ES el que queda activo (regla determinista por orden)", () => {
    const candidates = [
      c("gk2", Role.GOALKEEPER, true), // aparece primero en la lista
      c("gk1", Role.GOALKEEPER, true),
    ];
    const result = normalizeLineup(candidates);
    expect(result.find((r) => r.id === "gk2")!.isOnPitch).toBe(true);
    expect(result.find((r) => r.id === "gk1")!.isOnPitch).toBe(false);
  });

  // C. staff -> sin pitchPosition.
  it("C: COACH y DELEGATE nunca reciben pitchPosition, aunque wantsOnPitch sea true", () => {
    const candidates = [
      c("coach1", Role.COACH, true),
      c("del1", Role.DELEGATE, true),
      c("gk1", Role.GOALKEEPER, true),
    ];
    const result = normalizeLineup(candidates);
    expect(result.find((r) => r.id === "coach1")).toEqual({ id: "coach1", isOnPitch: false, pitchPosition: undefined });
    expect(result.find((r) => r.id === "del1")).toEqual({ id: "del1", isOnPitch: false, pitchPosition: undefined });
  });

  // D. ningún pitchPosition repetido.
  it("D: con más de 5 titulares (incluye 2 porteros), ningún pitchPosition se repite ni excede 0-4", () => {
    const candidates = [
      c("gk1", Role.GOALKEEPER, true),
      c("gk2", Role.GOALKEEPER, true),
      c("p1", Role.PLAYER, true),
      c("p2", Role.PLAYER, true),
      c("p3", Role.PLAYER, true),
      c("p4", Role.PLAYER, true),
      c("p5", Role.PLAYER, true), // 6º titular de campo: debe quedar en banquillo
    ];
    const result = normalizeLineup(candidates);
    const onPitch = result.filter((r) => r.isOnPitch);
    expect(onPitch.length).toBeLessThanOrEqual(MAX_OWN_TEAM_SLOTS);
    const positions = onPitch.map((r) => r.pitchPosition);
    expect(new Set(positions).size).toBe(positions.length); // sin duplicados
    positions.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(MAX_OWN_TEAM_SLOTS);
    });
    // El 5º jugador de campo (p5) no cabe: banquillo.
    expect(result.find((r) => r.id === "p5")!.isOnPitch).toBe(false);
  });

  it("sin ningún portero candidato, el slot de portero queda vacío (no se asigna a un jugador de campo)", () => {
    const candidates = [
      c("p1", Role.PLAYER, true),
      c("p2", Role.PLAYER, true),
    ];
    const result = normalizeLineup(candidates);
    const positions = result.filter((r) => r.isOnPitch).map((r) => r.pitchPosition);
    expect(positions).not.toContain(GOALKEEPER_SLOT_INDEX);
  });

  it("jugadores con wantsOnPitch=false quedan en banquillo sin pitchPosition", () => {
    const candidates = [c("bench1", Role.PLAYER, false)];
    const result = normalizeLineup(candidates);
    expect(result[0]).toEqual({ id: "bench1", isOnPitch: false, pitchPosition: undefined });
  });
});

// E. el ID del radial coincide con el jugador visible — se garantiza
// estructuralmente por la ausencia de pitchPosition duplicado: si no hay
// dos jugadores en el mismo slot, no puede haber ambigüedad sobre qué
// player.id corresponde a la tarjeta pulsada.
describe("normalizeLineup — invariante para el radial (E)", () => {
  it("no pueden existir dos player.id distintos con el mismo pitchPosition activo", () => {
    const candidates = [
      c("gk1", Role.GOALKEEPER, true),
      c("gk2", Role.GOALKEEPER, true),
      c("p1", Role.PLAYER, true),
    ];
    const result = normalizeLineup(candidates);
    const onPitch = result.filter((r) => r.isOnPitch);
    const seen = new Map<number, string>();
    for (const r of onPitch) {
      expect(seen.has(r.pitchPosition!)).toBe(false);
      seen.set(r.pitchPosition!, r.id);
    }
  });
});

describe("normalizeLineup — invariante de TOT/ROT (F)", () => {
  // El tick de TOT/ROT en MatchTracker incrementa exactamente una vez por
  // cada player.id con isOnPitch=true. normalizeLineup garantiza que nunca
  // haya dos porteros simultáneamente isOnPitch=true, así que no puede
  // haber doble incremento de tiempo para el rol de portero.
  it("F: nunca hay más de un jugador GOALKEEPER con isOnPitch=true", () => {
    const candidates = [
      c("gk1", Role.GOALKEEPER, true),
      c("gk2", Role.GOALKEEPER, true),
      c("gk3", Role.GOALKEEPER, true),
      c("p1", Role.PLAYER, true),
    ];
    const result = normalizeLineup(candidates);
    const activeGoalkeeperIds = result.filter((r) => r.isOnPitch && candidates.find((cc) => cc.id === r.id)?.role === Role.GOALKEEPER);
    expect(activeGoalkeeperIds.length).toBe(1);
  });

  it("F: cada id aparece como máximo una vez en el resultado (sin duplicar jugadores)", () => {
    const candidates = [
      c("gk1", Role.GOALKEEPER, true),
      c("p1", Role.PLAYER, true),
      c("p2", Role.PLAYER, true),
    ];
    const result = normalizeLineup(candidates);
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("effectiveSlotIndex", () => {
  it("devuelve el pitchPosition tal cual si es válido", () => {
    expect(effectiveSlotIndex(3, 5)).toBe(3);
    expect(effectiveSlotIndex(0, 5)).toBe(0);
  });

  it("cae a 0 si pitchPosition es undefined", () => {
    expect(effectiveSlotIndex(undefined, 5)).toBe(0);
  });

  it("cae a 0 si pitchPosition está fuera de rango (>= slotsLength)", () => {
    expect(effectiveSlotIndex(5, 5)).toBe(0);
    expect(effectiveSlotIndex(99, 5)).toBe(0);
  });

  it("cae a 0 si pitchPosition es negativo", () => {
    expect(effectiveSlotIndex(-1, 5)).toBe(0);
  });

  it("REGRESIÓN: occupiedSlots y el slot renderizado deben coincidir para el mismo pitchPosition inválido", () => {
    // Antes del fix: occupiedSlots usaba el valor crudo (undefined/fuera de
    // rango) mientras el render usaba `?? 0`, y esa discrepancia permitía
    // que un slot pareciera libre estando ya ocupado visualmente.
    const slotsLength = 5;
    const invalidValues = [undefined, -1, 5, 99];
    invalidValues.forEach((v) => {
      const renderedAt = effectiveSlotIndex(v, slotsLength);
      const occupiedAt = effectiveSlotIndex(v, slotsLength);
      expect(renderedAt).toBe(occupiedAt);
      expect(renderedAt).toBe(0);
    });
  });
});
