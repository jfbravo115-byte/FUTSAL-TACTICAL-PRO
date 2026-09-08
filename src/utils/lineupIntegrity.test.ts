import { describe, it, expect } from "vitest";
import { Role } from "../types/futsal";
import {
  normalizeLineup,
  effectiveSlotIndex,
  isRoleAllowedInSlot,
  findAvailableSlotForRole,
  normalizeMatchPlayers,
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

  // Diseño revisado: ya NO cae a 0 (el slot del portero) — devuelve null
  // para que el llamante NUNCA renderice un dato inválido como si fuera
  // el portero por defecto. Ver comentario de diseño junto a la función.
  it("devuelve null (no 0) si pitchPosition es undefined", () => {
    expect(effectiveSlotIndex(undefined, 5)).toBeNull();
  });

  it("devuelve null si pitchPosition está fuera de rango (>= slotsLength)", () => {
    expect(effectiveSlotIndex(5, 5)).toBeNull();
    expect(effectiveSlotIndex(99, 5)).toBeNull();
  });

  it("devuelve null si pitchPosition es negativo", () => {
    expect(effectiveSlotIndex(-1, 5)).toBeNull();
  });

  it("REGRESIÓN: occupiedSlots y el slot renderizado deben coincidir (ambos null) para el mismo pitchPosition inválido, y NUNCA colapsar al slot 0", () => {
    // Antes del primer fix: occupiedSlots usaba el valor crudo (undefined/
    // fuera de rango) mientras el render usaba `?? 0`, permitiendo que un
    // slot pareciera libre estando ya ocupado visualmente en el 0.
    // Ahora, además, ninguno de los dos cálculos puede canalizar el dato
    // corrupto hacia el slot del portero: ambos devuelven null por igual.
    const slotsLength = 5;
    const invalidValues = [undefined, -1, 5, 99];
    invalidValues.forEach((v) => {
      const renderedAt = effectiveSlotIndex(v, slotsLength);
      const occupiedAt = effectiveSlotIndex(v, slotsLength);
      expect(renderedAt).toBe(occupiedAt);
      expect(renderedAt).toBeNull();
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// TESTS DE REGRESIÓN — caminos de entrada a pista DENTRO de MatchTracker
// (toggleStarter, toggleOnPitch, executeDirectSub, drag/drop, swap, clic
// en slot vacío). Cada handler ahora delega en estas mismas utilidades
// centralizadas (isRoleAllowedInSlot / findAvailableSlotForRole /
// normalizeMatchPlayers), así que probarlas aquí prueba directamente la
// garantía que cada handler hereda, sin duplicar la lógica en cada test
// ni requerir renderizar el componente completo.
// ════════════════════════════════════════════════════════════════════
describe("Regresión — integridad de alineación en tiempo de partido", () => {
  // 1. toggleOnPitch de jugador de campo con slot 0 libre: NO puede ocupar 0.
  it("1: un jugador de campo nunca recibe el slot 0, aunque esté libre", () => {
    const slot = findAvailableSlotForRole(Role.PLAYER, new Set()); // slot 0 libre
    expect(slot).not.toBe(GOALKEEPER_SLOT_INDEX);
    expect(slot).toBe(1);
  });

  // 2. toggleOnPitch de portero: solo puede ocupar 0.
  it("2: un portero solo puede recibir el slot 0, nunca 1-4", () => {
    expect(findAvailableSlotForRole(Role.GOALKEEPER, new Set())).toBe(GOALKEEPER_SLOT_INDEX);
    // Aunque 0 esté ocupado y 1-4 libres, un portero NO recibe un slot de campo.
    expect(findAvailableSlotForRole(Role.GOALKEEPER, new Set([0]))).toBeUndefined();
  });

  // 3. segundo portero: no puede entrar si ya existe otro portero activo.
  it("3: un segundo portero no encuentra slot disponible si el slot 0 ya está ocupado", () => {
    const occupied = new Set([GOALKEEPER_SLOT_INDEX]);
    expect(findAvailableSlotForRole(Role.GOALKEEPER, occupied)).toBeUndefined();
  });

  // 4. executeDirectSub: jugador de campo no puede entrar en slot POR.
  it("4: isRoleAllowedInSlot rechaza un jugador de campo en el slot 0 (POR)", () => {
    expect(isRoleAllowedInSlot(Role.PLAYER, GOALKEEPER_SLOT_INDEX)).toBe(false);
  });

  // 5. executeDirectSub: portero no puede entrar en slot de campo.
  it("5: isRoleAllowedInSlot rechaza un portero en cualquier slot de campo (1-4)", () => {
    [1, 2, 3, 4].forEach((slotIdx) => {
      expect(isRoleAllowedInSlot(Role.GOALKEEPER, slotIdx)).toBe(false);
    });
  });

  // 6. staff: nunca puede entrar en pista por ninguno de estos caminos.
  it("6: COACH y DELEGATE nunca son válidos en ningún slot (0-4), y nunca reciben slot disponible", () => {
    [Role.COACH, Role.DELEGATE].forEach((staffRole) => {
      for (let slotIdx = 0; slotIdx < MAX_OWN_TEAM_SLOTS; slotIdx++) {
        expect(isRoleAllowedInSlot(staffRole, slotIdx)).toBe(false);
      }
      expect(findAvailableSlotForRole(staffRole, new Set())).toBeUndefined();
    });
  });

  // 7. drag/drop: no puede dejar GK en slot de campo ni jugador de campo en POR.
  it("7: la validación de swapPlayersByDrag (dos jugadores ya en pista) bloquea intercambiar GK con jugador de campo", () => {
    // Replica exactamente la condición usada en swapPlayersByDrag: el
    // intercambio solo procede si AMBOS roles encajan en el slot que
    // recibirían.
    const gk = { role: Role.GOALKEEPER, pitchPosition: 0 };
    const field = { role: Role.PLAYER, pitchPosition: 2 };
    const swapAllowed =
      isRoleAllowedInSlot(gk.role, field.pitchPosition) &&
      isRoleAllowedInSlot(field.role, gk.pitchPosition);
    expect(swapAllowed).toBe(false);
  });

  it("7b: la misma validación SÍ permite intercambiar dos jugadores de campo entre sí", () => {
    const a = { role: Role.PLAYER, pitchPosition: 1 };
    const b = { role: Role.PLAYER, pitchPosition: 3 };
    const swapAllowed =
      isRoleAllowedInSlot(a.role, b.pitchPosition) &&
      isRoleAllowedInSlot(b.role, a.pitchPosition);
    expect(swapAllowed).toBe(true);
  });

  // 8. swap (executeSwap / BenchRadialMenu): debe impedir intercambiar GK
  // con jugador de campo si eso viola los roles de slot.
  it("8: la validación de executeSwap bloquea que un suplente de campo entre en el slot de un portero titular", () => {
    const targetPlayer = { role: Role.GOALKEEPER, isOnPitch: true, pitchPosition: 0 };
    const sourcePlayer = { role: Role.PLAYER, isOnPitch: false, pitchPosition: undefined as number | undefined };
    const targetSwapValid =
      !targetPlayer.isOnPitch ||
      targetPlayer.pitchPosition === undefined ||
      isRoleAllowedInSlot(sourcePlayer.role, targetPlayer.pitchPosition);
    expect(targetSwapValid).toBe(false);
  });

  it("8b: la misma validación SÍ permite que un suplente portero entre por el portero titular", () => {
    const targetPlayer = { role: Role.GOALKEEPER, isOnPitch: true, pitchPosition: 0 };
    const sourcePlayer = { role: Role.GOALKEEPER, isOnPitch: false, pitchPosition: undefined as number | undefined };
    const targetSwapValid =
      !targetPlayer.isOnPitch ||
      targetPlayer.pitchPosition === undefined ||
      isRoleAllowedInSlot(sourcePlayer.role, targetPlayer.pitchPosition);
    expect(targetSwapValid).toBe(true);
  });

  // 9. datos corruptos/legacy: dos jugadores con pitchPosition inválido NO
  // deben renderizarse superpuestos en slot 0.
  it("9a: effectiveSlotIndex nunca resuelve un pitchPosition inválido al slot 0 (ya no hay colapso silencioso)", () => {
    expect(effectiveSlotIndex(undefined, 5)).toBeNull();
    expect(effectiveSlotIndex(-1, 5)).toBeNull();
  });

  it("9b: normalizeMatchPlayers corrige un caso legacy con 2 porteros isOnPitch=true simultáneos (dato corrupto de antes de este fix)", () => {
    const corrupted = [
      { id: "gk1", role: Role.GOALKEEPER, isOnPitch: true, pitchPosition: 0, isOpponent: false },
      { id: "gk2", role: Role.GOALKEEPER, isOnPitch: true, pitchPosition: undefined, isOpponent: false }, // dato corrupto: sin pitchPosition pero isOnPitch=true
      { id: "p1", role: Role.PLAYER, isOnPitch: true, pitchPosition: 1, isOpponent: false },
    ];
    const fixed = normalizeMatchPlayers(corrupted);
    const activeGKs = fixed.filter((p) => p.role === Role.GOALKEEPER && p.isOnPitch);
    expect(activeGKs.length).toBe(1); // ya no hay 2 porteros activos
    const positions = fixed.filter((p) => p.isOnPitch).map((p) => p.pitchPosition);
    expect(new Set(positions).size).toBe(positions.length); // sin duplicados, sin colapso en 0
  });

  // 10. Invariante final tras cualquier operación, por equipo.
  it("10: normalizeLineup garantiza SIEMPRE — máx. 1 GK, máx. 4 campo, posiciones únicas, GK=0, campo=1..4", () => {
    const scenarios: LineupCandidate[][] = [
      [c("gk1", Role.GOALKEEPER, true), c("p1", Role.PLAYER, true), c("p2", Role.PLAYER, true), c("p3", Role.PLAYER, true), c("p4", Role.PLAYER, true)],
      [c("gk1", Role.GOALKEEPER, true), c("gk2", Role.GOALKEEPER, true), c("p1", Role.PLAYER, true)],
      [c("p1", Role.PLAYER, true), c("p2", Role.PLAYER, true), c("p3", Role.PLAYER, true), c("p4", Role.PLAYER, true), c("p5", Role.PLAYER, true), c("p6", Role.PLAYER, true)],
      [c("coach1", Role.COACH, true), c("del1", Role.DELEGATE, true), c("gk1", Role.GOALKEEPER, true)],
      [],
    ];
    scenarios.forEach((candidates) => {
      const result = normalizeLineup(candidates);
      const onPitch = result.filter((r) => r.isOnPitch);
      const activeGKs = onPitch.filter(
        (r) => candidates.find((cc) => cc.id === r.id)?.role === Role.GOALKEEPER,
      );
      const activeField = onPitch.filter((r) => {
        const role = candidates.find((cc) => cc.id === r.id)?.role;
        return role !== Role.GOALKEEPER && role !== Role.COACH && role !== Role.DELEGATE;
      });
      expect(activeGKs.length).toBeLessThanOrEqual(1);
      expect(activeField.length).toBeLessThanOrEqual(MAX_OWN_TEAM_SLOTS - 1);
      const positions = onPitch.map((r) => r.pitchPosition);
      expect(new Set(positions).size).toBe(positions.length); // únicos
      activeGKs.forEach((gk) => expect(gk.pitchPosition).toBe(GOALKEEPER_SLOT_INDEX));
      activeField.forEach((f) => {
        expect(f.pitchPosition).toBeGreaterThanOrEqual(1);
        expect(f.pitchPosition).toBeLessThanOrEqual(4);
      });
      // Staff nunca en pista.
      result
        .filter((r) => {
          const role = candidates.find((cc) => cc.id === r.id)?.role;
          return role === Role.COACH || role === Role.DELEGATE;
        })
        .forEach((staff) => {
          expect(staff.isOnPitch).toBe(false);
          expect(staff.pitchPosition).toBeUndefined();
        });
    });
  });
});
