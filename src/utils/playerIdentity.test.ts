import { describe, expect, it } from "vitest";
import {
  SHORT_NAME_CHARS,
  hasRealName,
  isProvisionalName,
  normalizeDisplayName,
  playerDisplayIdentity,
  shortPlayerName,
} from "./playerIdentity";
import { Player, Role } from "../types/futsal";

const INITIAL_STATS = {
  goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
  fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0,
  saves: 0, conceded: 0,
};

function jugador(p: Partial<Player> & { id: string }): Player {
  return {
    number: 7,
    name: "Jugador 1",
    role: Role.PLAYER,
    isOnPitch: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    rotationTimeSeconds: 0,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
    ...p,
  } as Player;
}

describe("1 · qué nombres se inventa la aplicación", () => {
  it("reconoce TODOS los patrones que generan PreMatch y MatchTracker", () => {
    const generados = [
      // PreMatch · plantilla propia por defecto
      "Portero 1", "Portero 2", "Jugador 1", "Jugador 6",
      // PreMatch · jugador añadido a mano
      "Nuevo Jugador",
      // PreMatch · rival por defecto
      "POR RIVAL 1", "PJ RIVAL 1", "PJ RIVAL 4",
      // MatchTracker · plantilla por defecto
      "POR LOCAL 1", "PJ LOCAL 12", "POR RIVAL 2", "PJ RIVAL 12",
      // MatchTracker · «añadir jugador»
      "NUEVO JUGADOR",
      // Cuerpo técnico, de los dos sitios
      "ENTRENADOR LOCAL", "DELEGADO LOCAL",
      "ENTRENADOR VISITANTE", "DELEGADO VISITANTE",
      "ENTRENADOR RIVAL", "DELEGADO RIVAL",
    ];
    for (const n of generados) expect(isProvisionalName(n), n).toBe(true);
  });

  it("no le importan mayúsculas ni espacios de más", () => {
    expect(isProvisionalName("pj rival 3")).toBe(true);
    expect(isProvisionalName("  JUGADOR   2  ")).toBe(true);
  });

  it("un nombre real con números NO se confunde con un relleno", () => {
    for (const n of ["Dani 10", "Juan 7 Pérez", "Jugador 1 Pérez", "Pedro II", "M. Gómez 9"]) {
      expect(isProvisionalName(n), n).toBe(false);
    }
  });

  it("no basta con parecerse: solo los patrones exactos", () => {
    for (const n of ["Jugador", "Jugadora 1", "PJ RIVAL", "RIVAL 1", "Nuevo", "Portero Suplente"]) {
      expect(isProvisionalName(n), n).toBe(false);
    }
  });

  it("el vacío no es provisional, es que no hay nombre", () => {
    expect(isProvisionalName("")).toBe(false);
    expect(isProvisionalName("   ")).toBe(false);
    expect(isProvisionalName(null)).toBe(false);
    expect(isProvisionalName(undefined)).toBe(false);
    expect(hasRealName({ name: "" })).toBe(false);
    expect(hasRealName({ name: "   " })).toBe(false);
    expect(hasRealName({ name: undefined })).toBe(false);
  });

  it("hasRealName es lo contrario salvo en el vacío", () => {
    expect(hasRealName({ name: "Juan Pérez" })).toBe(true);
    expect(hasRealName({ name: "PJ RIVAL 2" })).toBe(false);
  });

  it("normalizeDisplayName deja mayúsculas y un solo espacio", () => {
    expect(normalizeDisplayName("  juan   pérez ")).toBe("JUAN PÉREZ");
    expect(normalizeDisplayName(null)).toBe("");
  });
});

describe("2 · abreviar sin azar", () => {
  it("los tres ejemplos del encargo, con el ancho de la ficha", () => {
    expect(shortPlayerName("Juan Pérez", 8)).toBe("JUAN P.");
    expect(shortPlayerName("Alejandro García López", 8)).toBe("ALEJ. G.");
    expect(shortPlayerName("Juan", 8)).toBe("JUAN");
  });

  it("si cabe entero, no se toca", () => {
    expect(shortPlayerName("Juan Pérez", 20)).toBe("JUAN PÉREZ");
    expect(shortPlayerName("Ana", 8)).toBe("ANA");
  });

  it("una sola palabra demasiado larga se recorta con punto", () => {
    expect(shortPlayerName("Maximiliano", 8)).toBe("MAXIMIL.");
    expect(shortPlayerName("Maximiliano", 8)).toHaveLength(8);
  });

  it("nunca devuelve solo la última palabra", () => {
    // El fallo que tenía `nombreCorto`: «PJ RIVAL 2» acababa siendo «2».
    expect(shortPlayerName("PJ RIVAL 2", 8)).not.toBe("2");
    expect(shortPlayerName("PJ RIVAL 2", 8)).toBe("PJ R.");
    // «Juan 10» cabe entero: no hay nada que decidir, y el 10 es suyo.
    expect(shortPlayerName("Juan 10", 8)).toBe("JUAN 10");
  });

  it("en anchos minúsculos recorta, pero no se pasa", () => {
    expect(shortPlayerName("Juan Pérez", 4)).toBe("J P.");
    expect(shortPlayerName("Juan Pérez", 3)).toBe("JU.");
    expect(shortPlayerName("Juan Pérez", 2)).toBe("J.");
    expect(shortPlayerName("Juan Pérez", 1)).toBe("J");
  });

  it("nunca se pasa del ancho pedido", () => {
    const nombres = [
      "Juan", "Juan Pérez", "Alejandro García López",
      "Rodríguez-Fernández de la Torre y Villalobos",
      "María del Carmen Sánchez", "X", "Maximiliano",
    ];
    for (const ancho of [1, 2, 3, 4, 6, 8, 12, 20]) {
      for (const n of nombres) {
        expect(shortPlayerName(n, ancho).length, `${n} @${ancho}`).toBeLessThanOrEqual(ancho);
      }
    }
  });

  it("es determinista", () => {
    const a = shortPlayerName("Alejandro García López", 8);
    const b = shortPlayerName("Alejandro García López", 8);
    expect(a).toBe(b);
  });

  it("el vacío no inventa nada", () => {
    expect(shortPlayerName("", 8)).toBe("");
    expect(shortPlayerName(null, 8)).toBe("");
  });

  it("el ancho por defecto es el de la ficha 72×58", () => {
    expect(SHORT_NAME_CHARS).toBe(8);
    expect(shortPlayerName("Juan Pérez")).toBe("JUAN P.");
  });
});

describe("3 · la jerarquía la deciden los datos, no el bando", () => {
  const plantilla = (ps: Player[]) => ({ players: ps });

  it("LOCAL con nombre real → nombre principal, dorsal secundario", () => {
    const p = jugador({ id: "tp1", name: "Juan Pérez", number: 7, isOpponent: false });
    const id = playerDisplayIdentity(p, plantilla([p]));
    expect(id.kind).toBe("nombre");
    expect(id.principal).toBe("JUAN P.");
    expect(id.secundario).toBe("7");
    expect(id.nombreCompleto).toBe("Juan Pérez");
  });

  it("RIVAL con nombre real → nombre principal también", () => {
    const p = jugador({ id: "r1", name: "Juan Pérez", number: 7, isOpponent: true });
    const id = playerDisplayIdentity(p, plantilla([p]));
    expect(id.kind).toBe("nombre");
    expect(id.principal).toBe("JUAN P.");
    expect(id.secundario).toBe("7");
  });

  it("LOCAL sin nombre → dorsal principal", () => {
    const p = jugador({ id: "tp1", name: "Jugador 1", number: 7, isOpponent: false });
    const id = playerDisplayIdentity(p, plantilla([p]));
    expect(id.kind).toBe("dorsal");
    expect(id.principal).toBe("7");
    expect(id.nombreCorto).toBeNull();
  });

  it("RIVAL provisional con dorsal conocido → dorsal principal, letra secundaria", () => {
    const a = jugador({ id: "r1", name: "PJ RIVAL 1", number: 9, isOpponent: true });
    const b = jugador({ id: "r2", name: "PJ RIVAL 2", number: 4, isOpponent: true });
    const id = playerDisplayIdentity(b, plantilla([a, b]));
    expect(id.kind).toBe("dorsal");
    expect(id.principal).toBe("4");
    expect(id.secundario).toBe("B");
  });

  it("RIVAL sin nombre ni dorsal → letra principal y `?` secundario", () => {
    const a = jugador({ id: "r1", name: "PJ RIVAL 1", number: 9, isOpponent: true });
    const b = jugador({ id: "r2", name: "PJ RIVAL 2", number: 0, jerseyNumberKnown: false, isOpponent: true });
    const id = playerDisplayIdentity(b, plantilla([a, b]));
    expect(id.kind).toBe("provisional");
    expect(id.principal).toBe("B");
    expect(id.secundario).toBe("?");
    expect(id.dorsal).toBe("?");
  });

  it("un nombre real manda aunque el dorsal esté por conocer", () => {
    const p = jugador({ id: "r1", name: "Juan Pérez", jerseyNumberKnown: false, isOpponent: true });
    const id = playerDisplayIdentity(p, plantilla([p]));
    expect(id.kind).toBe("nombre");
    expect(id.principal).toBe("JUAN P.");
    expect(id.secundario).toBe("?");
  });

  it("el cuerpo técnico se queda con SU nombre, nunca con una letra", () => {
    const e = jugador({ id: "auto_coach_local", name: "ENTRENADOR LOCAL", role: Role.COACH, number: 0 });
    const id = playerDisplayIdentity(e, plantilla([e]));
    expect(id.kind).toBe("nombre");
    expect(id.principal).not.toBe("A");
    expect(id.nombreCompleto).toBe("ENTRENADOR LOCAL");
  });
});

describe("4 · lo que oye un lector de pantalla", () => {
  it("con nombre: «Juan Pérez, dorsal 7»", () => {
    const p = jugador({ id: "tp1", name: "Juan Pérez", number: 7 });
    expect(playerDisplayIdentity(p, { players: [p] }).aria).toBe("Juan Pérez, dorsal 7");
  });

  it("sin nombre: «RIVAL A, dorsal 7»", () => {
    const p = jugador({ id: "r1", name: "PJ RIVAL 1", number: 7, isOpponent: true });
    expect(playerDisplayIdentity(p, { players: [p] }).aria).toBe("RIVAL A, dorsal 7");
  });

  it("sin dorsal: «dorsal desconocido», nunca un número inventado", () => {
    const p = jugador({ id: "r1", name: "PJ RIVAL 1", jerseyNumberKnown: false, isOpponent: true });
    expect(playerDisplayIdentity(p, { players: [p] }).aria).toBe("RIVAL A, dorsal desconocido");
  });

  it("el nombre ENTERO va al rótulo hablado aunque la ficha lo abrevie", () => {
    const p = jugador({ id: "tp1", name: "Rodríguez-Fernández de la Torre y Villalobos" });
    const id = playerDisplayIdentity(p, { players: [p] });
    expect(id.principal.length).toBeLessThanOrEqual(8);
    expect(id.aria).toContain("Rodríguez-Fernández de la Torre y Villalobos");
  });
});

describe("5 · es presentación y nada más", () => {
  it("no toca al jugador que recibe", () => {
    const p = jugador({ id: "tp1", name: "Juan Pérez", number: 7 });
    const antes = JSON.stringify(p);
    playerDisplayIdentity(p, { players: [p] });
    expect(JSON.stringify(p)).toBe(antes);
  });

  it("cambiar el dorsal cambia el secundario y deja el nombre quieto", () => {
    const p = jugador({ id: "tp1", name: "Juan Pérez", number: 7 });
    const antes = playerDisplayIdentity(p, { players: [p] });
    const despues = playerDisplayIdentity({ ...p, number: 10 }, { players: [p] });
    expect(antes.principal).toBe(despues.principal);
    expect(antes.secundario).toBe("7");
    expect(despues.secundario).toBe("10");
    expect(despues.kind).toBe("nombre");
  });

  it("reasignar o intercambiar no cambia la jerarquía", () => {
    const a = jugador({ id: "r1", name: "Juan Pérez", number: 7, isOpponent: true });
    const b = jugador({ id: "r2", name: "PJ RIVAL 2", number: 10, isOpponent: true });
    const equipo = [a, b];
    // Después de un intercambio: los números se cruzan, el tipo no.
    const a2 = { ...a, number: 10 };
    const b2 = { ...b, number: 7 };
    expect(playerDisplayIdentity(a2, { players: equipo }).kind).toBe("nombre");
    expect(playerDisplayIdentity(b2, { players: equipo }).kind).toBe("dorsal");
    // Y después de una reasignación, el que pierde el dorsal mantiene su letra.
    const b3 = { ...b, jerseyNumberKnown: false };
    const id = playerDisplayIdentity(b3, { players: equipo });
    expect(id.kind).toBe("provisional");
    expect(id.letra).toBe("B");
  });

  it("la letra no se mueve cuando a otro le ponen dorsal", () => {
    const a = jugador({ id: "r1", name: "PJ RIVAL 1", jerseyNumberKnown: false, isOpponent: true });
    const b = jugador({ id: "r2", name: "PJ RIVAL 2", jerseyNumberKnown: false, isOpponent: true });
    const c = jugador({ id: "r3", name: "PJ RIVAL 3", jerseyNumberKnown: false, isOpponent: true });
    const equipo = [a, b, c];
    expect(playerDisplayIdentity(c, { players: equipo }).letra).toBe("C");
    const conDorsal = [{ ...a, number: 4, jerseyNumberKnown: true }, b, c];
    expect(playerDisplayIdentity(c, { players: conDorsal }).letra).toBe("C");
  });
});
