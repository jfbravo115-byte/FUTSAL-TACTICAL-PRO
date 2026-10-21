/**
 * El dorsal es una etiqueta; la identidad es `player.id`.
 *
 * Lo que se protege aquí es que corregir un número a mitad de partido no
 * toque nada más: ni los tiempos, ni las estadísticas, ni las tarjetas, ni la
 * posición, ni —sobre todo— el id al que apuntan todos los eventos.
 */
import { describe, expect, it } from "vitest";
import { Player, Role } from "../types/futsal";
import {
  JERSEY_MAX,
  UNKNOWN_NUMBER,
  duplicateHolder,
  formatJerseyNumber,
  isUnknownNumber,
  parseJerseyInput,
  playerLabel,
  provisionalLabel,
  setPlayerNumber,
  shortJerseyLabel,
  swapPlayerNumbers,
} from "./jerseyNumber";

const jug = (o: Partial<Player> = {}): Player => ({
  id: "p1", number: 7, name: "Jugador Uno", role: Role.PLAYER,
  isOnPitch: true, pitchPosition: 1, plusMinus: 3,
  individualTimeSeconds: 342, rotationTimeSeconds: 78, isStarter: true, isOpponent: false,
  stats: { goals: 2, assists: 1, steals: 4, interceptions: 0, losses: 1, errors: 0,
    fouls: 3, yellowCards: 1, redCards: 0, shots: 5, shotsOffTarget: 2, saves: 0, conceded: 0 },
  ...o,
});

describe("1 · lo que se escribe en el editor", () => {
  it("normaliza espacios y ceros a la izquierda", () => {
    expect(parseJerseyInput("  7 ")).toEqual({ ok: true, value: 7 });
    expect(parseJerseyInput("007")).toEqual({ ok: true, value: 7 });
    expect(parseJerseyInput("10")).toEqual({ ok: true, value: 10 });
  });

  it("el campo vacío significa «todavía no lo sé», no un error", () => {
    expect(parseJerseyInput("")).toEqual({ ok: true, value: UNKNOWN_NUMBER });
    expect(parseJerseyInput("   ")).toEqual({ ok: true, value: UNKNOWN_NUMBER });
  });

  it("rechaza lo que no es un número y lo que se sale del rango", () => {
    expect(parseJerseyInput("abc").ok).toBe(false);
    expect(parseJerseyInput("7a").ok).toBe(false);
    expect(parseJerseyInput("-3").ok).toBe(false);
    expect(parseJerseyInput("7.5").ok).toBe(false);
    expect(parseJerseyInput(String(JERSEY_MAX + 1)).ok).toBe(false);
    expect(parseJerseyInput(String(JERSEY_MAX)).ok).toBe(true);
  });
});

describe("2 · dorsal desconocido", () => {
  it("se pinta como `?` y el portero como `POR ?`", () => {
    expect(formatJerseyNumber(UNKNOWN_NUMBER)).toBe("?");
    expect(formatJerseyNumber(7)).toBe("7");
    expect(isUnknownNumber(0)).toBe(true);
    expect(isUnknownNumber(7)).toBe(false);
    expect(shortJerseyLabel(jug({ number: 0, role: Role.GOALKEEPER }))).toBe("POR ?");
    expect(shortJerseyLabel(jug({ number: 1, role: Role.GOALKEEPER }))).toBe("POR 1");
    expect(shortJerseyLabel(jug({ number: 9 }))).toBe("9");
  });

  it("dos jugadores con `?` NO comparten etiqueta", () => {
    const equipo = [
      jug({ id: "r1", number: 0, isOpponent: true }),
      jug({ id: "r2", number: 0, isOpponent: true }),
      jug({ id: "r3", number: 0, isOpponent: true }),
    ];
    const etiquetas = equipo.map((p) => provisionalLabel(p, equipo));
    expect(etiquetas).toEqual(["RIVAL A", "RIVAL B", "RIVAL C"]);
    expect(new Set(etiquetas).size).toBe(3);
  });

  it("y la etiqueta NO se mueve cuando a otro le asignan su dorsal", () => {
    const antes = [
      jug({ id: "r1", number: 0, isOpponent: true }),
      jug({ id: "r2", number: 0, isOpponent: true }),
      jug({ id: "r3", number: 0, isOpponent: true }),
    ];
    const cEra = provisionalLabel(antes[2], antes);
    const despues = setPlayerNumber(antes, "r1", 7);
    expect(provisionalLabel(despues[2], despues)).toBe(cEra);   // sigue siendo RIVAL C
  });

  it("quien ya tiene dorsal se llama por su nombre", () => {
    const equipo = [jug({ id: "r1", number: 7, name: "Pérez", isOpponent: true })];
    expect(playerLabel(equipo[0], equipo)).toBe("Pérez");
    expect(playerLabel(jug({ id: "r9", number: 0, isOpponent: true }), equipo)).toMatch(/^RIVAL /);
  });

  it("el cuerpo técnico no consume letras de la plantilla", () => {
    const equipo = [
      jug({ id: "a_coach", role: Role.COACH, number: 0, isOpponent: true }),
      jug({ id: "r1", number: 0, isOpponent: true }),
      jug({ id: "r2", number: 0, isOpponent: true }),
    ];
    expect(provisionalLabel(equipo[1], equipo)).toBe("RIVAL A");
    expect(provisionalLabel(equipo[2], equipo)).toBe("RIVAL B");
  });
});

describe("3 · duplicados", () => {
  const plantilla = () => [
    jug({ id: "L1", number: 7, isOpponent: false }),
    jug({ id: "L2", number: 10, isOpponent: false }),
    jug({ id: "L3", number: 0, isOpponent: false }),
    jug({ id: "R1", number: 7, isOpponent: true }),
  ];

  it("se detectan SOLO dentro del mismo equipo", () => {
    const ps = plantilla();
    expect(duplicateHolder(ps, "L2", 7)?.id).toBe("L1");
    // El 7 rival no estorba al 7 local, ni al revés.
    expect(duplicateHolder(ps, "R1", 7)).toBeNull();
    expect(duplicateHolder(ps, "L1", 7)).toBeNull();   // es el suyo
  });

  it("el desconocido no duplica: varios pueden estar pendientes", () => {
    const ps = [...plantilla(), jug({ id: "L4", number: 0 })];
    expect(duplicateHolder(ps, "L4", UNKNOWN_NUMBER)).toBeNull();
    expect(duplicateHolder(ps, "L3", UNKNOWN_NUMBER)).toBeNull();
  });

  it("intercambiar conserva las dos identidades y solo cruza los números", () => {
    const antes = plantilla();
    const despues = swapPlayerNumbers(antes, "L1", "L2");
    const a = despues.find((p) => p.id === "L1")!;
    const b = despues.find((p) => p.id === "L2")!;
    expect(a.number).toBe(10);
    expect(b.number).toBe(7);
    expect(a.id).toBe("L1");
    expect(b.id).toBe("L2");
    expect(a.individualTimeSeconds).toBe(antes[0].individualTimeSeconds);
    expect(b.stats).toEqual(antes[1].stats);
  });

  it("intercambiar con uno mismo, o con alguien que no existe, no cambia nada", () => {
    const antes = plantilla();
    expect(swapPlayerNumbers(antes, "L1", "L1")).toBe(antes);
    expect(swapPlayerNumbers(antes, "L1", "NOPE")).toBe(antes);
  });
});

describe("4 · cambiar el dorsal NO toca nada más", () => {
  it("conserva id, tiempos, estadísticas, tarjetas, posición y equipo", () => {
    const antes = [jug({ id: "r3", number: 0, isOpponent: true, pitchPosition: 2 })];
    const despues = setPlayerNumber(antes, "r3", 7);
    const a = antes[0];
    const d = despues[0];
    expect(d.id).toBe(a.id);
    expect(d.number).toBe(7);
    expect(d.individualTimeSeconds).toBe(a.individualTimeSeconds);
    expect(d.rotationTimeSeconds).toBe(a.rotationTimeSeconds);
    expect(d.stats).toEqual(a.stats);
    expect(d.stats.yellowCards).toBe(1);
    expect(d.isOnPitch).toBe(a.isOnPitch);
    expect(d.pitchPosition).toBe(a.pitchPosition);
    expect(d.isOpponent).toBe(a.isOpponent);
    expect(d.role).toBe(a.role);
    expect(d.plusMinus).toBe(a.plusMinus);
    // Todo lo demás, idéntico salvo el número.
    expect({ ...d, number: a.number }).toEqual(a);
  });

  it("no crea ni elimina jugadores", () => {
    const antes = [jug({ id: "a" }), jug({ id: "b", number: 9 })];
    const despues = setPlayerNumber(antes, "a", 4);
    expect(despues).toHaveLength(2);
    expect(despues.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("y los eventos siguen apuntando al mismo jugador", () => {
    // Los eventos guardan `playerIds`, nunca el dorsal: por eso un cambio de
    // número no puede desatar un evento de su autor.
    const antes = [jug({ id: "r3", number: 0, isOpponent: true })];
    const eventos = [{ id: "e1", playerIds: ["r3"] }, { id: "e2", playerIds: ["r3"] }];
    const despues = setPlayerNumber(antes, "r3", 7);
    const autor = (ev: { playerIds: string[] }) => despues.find((p) => p.id === ev.playerIds[0]);
    expect(eventos.map((e) => autor(e)?.number)).toEqual([7, 7]);
    expect(eventos.map((e) => autor(e)?.id)).toEqual(["r3", "r3"]);
  });
});

// ── 5 · LAS SUPERFICIES RESUELVEN POR id, NO POR DORSAL ─────────────────
//
// Esto no es una opinión de diseño: es una comprobación sobre el código. Si
// alguna exportación congelara el dorsal dentro del evento, corregirlo a
// mitad de partido dejaría los informes antiguos mintiendo.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("5 · ninguna superficie congela el dorsal en el evento", () => {
  const leer = (ruta: string) => readFileSync(resolve(__dirname, ruta), "utf-8");

  it("el tipo del evento no tiene campo de dorsal", () => {
    const tipos = leer("../types/futsal.ts");
    const evento = tipos.slice(tipos.indexOf("export type GameEvent"), tipos.indexOf("export type MatchData"));
    expect(evento).toContain("playerIds: string[]");
    expect(evento).not.toMatch(/\bnumber:\s*number/);
    expect(evento).not.toMatch(/playerNumber|dorsal/i);
  });

  it("informe, CSV y payload leen el dorsal del JUGADOR en el momento de pintar", () => {
    for (const ruta of [
      "../services/matchReportService.ts",
      "../services/matchExportService.ts",
      "../services/tacticalProPayload.ts",
      "../lib/exportUtils.ts",
    ]) {
      const fuente = leer(ruta);
      // Nadie saca el dorsal de un evento: siempre de un jugador resuelto.
      expect(fuente, ruta).not.toMatch(/(event|e|ev)\.number/);
    }
  });

  it("y el snapshot guarda la plantilla entera, así que el dorsal viaja con ella", () => {
    const snap = leer("../services/matchSnapshotService.ts");
    expect(snap).toMatch(/matchData/);
    expect(snap).not.toMatch(/playerNumber|dorsal/i);
  });
});
