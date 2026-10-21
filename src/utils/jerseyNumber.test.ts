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
  UNKNOWN_PLACEHOLDER,
  duplicateHolder,
  formatJerseyNumber,
  isJerseyUnknown,
  markJerseyUnknown,
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
    expect(parseJerseyInput("")).toEqual({ ok: true, value: UNKNOWN_PLACEHOLDER });
    expect(parseJerseyInput("   ")).toEqual({ ok: true, value: UNKNOWN_PLACEHOLDER });
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
    expect(formatJerseyNumber({ number: 0, jerseyNumberKnown: false })).toBe("?");
    expect(formatJerseyNumber({ number: 7 })).toBe("7");
    expect(shortJerseyLabel(jug({ number: 0, jerseyNumberKnown: false, role: Role.GOALKEEPER }))).toBe("POR ?");
    expect(shortJerseyLabel(jug({ number: 1, role: Role.GOALKEEPER }))).toBe("POR 1");
    expect(shortJerseyLabel(jug({ number: 9 }))).toBe("9");
  });

  it("LA MARCA es la señal, no el número: un dorsal real 0 se ve como 0", () => {
    // Es la distinción que faltaba: 0 real, 0 por conocer y 0 del staff.
    const cero = jug({ number: 0, jerseyNumberKnown: true });
    const porConocer = jug({ number: 0, jerseyNumberKnown: false });
    const staff = jug({ number: 0, role: Role.COACH });          // sin marca
    expect(formatJerseyNumber(cero)).toBe("0");
    expect(formatJerseyNumber(porConocer)).toBe("?");
    expect(formatJerseyNumber(staff)).toBe("0");
    expect(isJerseyUnknown(cero)).toBe(false);
    expect(isJerseyUnknown(porConocer)).toBe(true);
    expect(isJerseyUnknown(staff)).toBe(false);
  });

  it("un partido ANTIGUO, sin la marca, tiene todos sus dorsales conocidos", () => {
    // Así se guardaban antes: `number` y nada más. Ninguno debe salir como `?`.
    const antiguo = [
      { id: "a", number: 7 },
      { id: "b", number: 0 },
      { id: "c", number: 99 },
    ];
    for (const p of antiguo) {
      expect(isJerseyUnknown(p), String(p.number)).toBe(false);
      expect(formatJerseyNumber(p)).toBe(String(p.number));
    }
  });

  it("asignar cualquier dorsal —el 0 incluido— lo marca como conocido", () => {
    const antes = [jug({ id: "r1", number: 1, jerseyNumberKnown: false })];
    const conCero = setPlayerNumber(antes, "r1", 0);
    expect(conCero[0].jerseyNumberKnown).toBe(true);
    expect(formatJerseyNumber(conCero[0])).toBe("0");
    const conSiete = setPlayerNumber(antes, "r1", 7);
    expect(conSiete[0].jerseyNumberKnown).toBe(true);
    expect(formatJerseyNumber(conSiete[0])).toBe("7");
  });

  it("«dorsal desconocido» vuelve a `?` sin tocar el id", () => {
    const antes = [jug({ id: "r1", number: 7, jerseyNumberKnown: true })];
    const despues = markJerseyUnknown(antes, "r1");
    expect(despues[0].id).toBe("r1");
    expect(despues[0].jerseyNumberKnown).toBe(false);
    expect(formatJerseyNumber(despues[0])).toBe("?");
    expect(despues[0].individualTimeSeconds).toBe(antes[0].individualTimeSeconds);
    expect(despues[0].stats).toEqual(antes[0].stats);
  });

  it("dos jugadores con `?` NO comparten etiqueta", () => {
    const equipo = [
      jug({ id: "r1", number: 0, jerseyNumberKnown: false, isOpponent: true }),
      jug({ id: "r2", number: 0, jerseyNumberKnown: false, isOpponent: true }),
      jug({ id: "r3", number: 0, jerseyNumberKnown: false, isOpponent: true }),
    ];
    const etiquetas = equipo.map((p) => provisionalLabel(p, equipo));
    expect(etiquetas).toEqual(["RIVAL A", "RIVAL B", "RIVAL C"]);
    expect(new Set(etiquetas).size).toBe(3);
  });

  it("y la etiqueta NO se mueve cuando a otro le asignan su dorsal", () => {
    const antes = [
      jug({ id: "r1", number: 0, jerseyNumberKnown: false, isOpponent: true }),
      jug({ id: "r2", number: 0, jerseyNumberKnown: false, isOpponent: true }),
      jug({ id: "r3", number: 0, jerseyNumberKnown: false, isOpponent: true }),
    ];
    const cEra = provisionalLabel(antes[2], antes);
    const despues = setPlayerNumber(antes, "r1", 7);
    expect(provisionalLabel(despues[2], despues)).toBe(cEra);   // sigue siendo RIVAL C
  });

  it("quien ya tiene dorsal se llama por su nombre", () => {
    const equipo = [jug({ id: "r1", number: 7, name: "Pérez", isOpponent: true })];
    expect(playerLabel(equipo[0], equipo)).toBe("Pérez");
    expect(playerLabel(jug({ id: "r9", number: 0, jerseyNumberKnown: false, isOpponent: true }), equipo)).toMatch(/^RIVAL /);
  });

  it("el cuerpo técnico no consume letras de la plantilla", () => {
    const equipo = [
      jug({ id: "a_coach", role: Role.COACH, number: 0, isOpponent: true }),
      jug({ id: "r1", number: 0, jerseyNumberKnown: false, isOpponent: true }),
      jug({ id: "r2", number: 0, jerseyNumberKnown: false, isOpponent: true }),
    ];
    expect(provisionalLabel(equipo[1], equipo)).toBe("RIVAL A");
    expect(provisionalLabel(equipo[2], equipo)).toBe("RIVAL B");
  });
});

describe("3 · duplicados", () => {
  const plantilla = () => [
    jug({ id: "L1", number: 7, isOpponent: false }),
    jug({ id: "L2", number: 10, isOpponent: false }),
    jug({ id: "L3", number: 0, jerseyNumberKnown: false, isOpponent: false }),
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
    const ps = [...plantilla(), jug({ id: "L4", number: 0, jerseyNumberKnown: false })];
    // Ni los pendientes ocupan un dorsal, ni se estorban entre ellos.
    expect(duplicateHolder(ps, "L4", UNKNOWN_PLACEHOLDER)).toBeNull();
    expect(duplicateHolder(ps, "L3", UNKNOWN_PLACEHOLDER)).toBeNull();
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
    const antes = [jug({ id: "r3", number: 0, jerseyNumberKnown: false, isOpponent: true, pitchPosition: 2 })];
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
    // Todo lo demás, idéntico salvo el número y su marca.
    expect({ ...d, number: a.number, jerseyNumberKnown: a.jerseyNumberKnown }).toEqual(a);
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
    const antes = [jug({ id: "r3", number: 0, jerseyNumberKnown: false, isOpponent: true })];
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

// ── 6 · EL INTERCAMBIO, EN LA DIRECCIÓN QUE SE EDITA ────────────────────
//
// Este es el caso concreto a validar, con los dos caminos separados: cuando
// el dorsal lo lleva otro, y cuando está libre.

describe("6 · intercambio r3 ↔ r2 y asignación libre", () => {
  /** r2 lleva el 10 y r3 el 7, con tiempos y estadísticas distintas. */
  const estadoInicial = () => [
    jug({
      id: "r2", number: 10, name: "PJ RIVAL 1", isOpponent: true, pitchPosition: 1,
      individualTimeSeconds: 600, rotationTimeSeconds: 120, plusMinus: 2,
      stats: { ...jug().stats, goals: 1, fouls: 2, yellowCards: 1 },
    }),
    jug({
      id: "r3", number: 7, name: "PJ RIVAL 2", isOpponent: true, pitchPosition: 2,
      individualTimeSeconds: 240, rotationTimeSeconds: 40, plusMinus: -1,
      stats: { ...jug().stats, goals: 0, fouls: 1, redCards: 1 },
    }),
    jug({ id: "L1", number: 10, isOpponent: false }),   // el 10 LOCAL no estorba
  ];

  it("editar r3 con el 10: el 10 pertenece a r2 y se ofrece intercambiar", () => {
    const ps = estadoInicial();
    const quien = duplicateHolder(ps, "r3", 10);
    expect(quien?.id).toBe("r2");
    expect(quien?.name).toBe("PJ RIVAL 1");
    // Y el 10 del equipo contrario no se tiene en cuenta.
    expect(duplicateHolder(ps, "r3", 10)?.isOpponent).toBe(true);
  });

  it("al intercambiar: r3 = 10, r2 = 7, y todo lo demás de cada uno intacto", () => {
    const antes = estadoInicial();
    const despues = swapPlayerNumbers(antes, "r3", "r2");
    const a2 = antes.find((p) => p.id === "r2")!;
    const a3 = antes.find((p) => p.id === "r3")!;
    const d2 = despues.find((p) => p.id === "r2")!;
    const d3 = despues.find((p) => p.id === "r3")!;

    expect(d3.number).toBe(10);
    expect(d2.number).toBe(7);
    expect(d3.id).toBe("r3");
    expect(d2.id).toBe("r2");
    // Cada uno con LO SUYO: tiempos, estadísticas, tarjetas, posición, equipo.
    expect(d3.individualTimeSeconds).toBe(240);
    expect(d3.rotationTimeSeconds).toBe(40);
    expect(d3.stats).toEqual(a3.stats);
    expect(d3.stats.redCards).toBe(1);
    expect(d3.pitchPosition).toBe(2);
    expect(d2.individualTimeSeconds).toBe(600);
    expect(d2.rotationTimeSeconds).toBe(120);
    expect(d2.stats).toEqual(a2.stats);
    expect(d2.stats.yellowCards).toBe(1);
    expect(d2.pitchPosition).toBe(1);
    expect(d2.isOpponent).toBe(true);
    // Nada más cambia: ni el local con el mismo 10, ni el número de jugadores.
    expect(despues.find((p) => p.id === "L1")).toEqual(antes.find((p) => p.id === "L1"));
    expect(despues).toHaveLength(antes.length);
    // Y los dos quedan con dorsal conocido.
    expect(d2.jerseyNumberKnown).toBe(true);
    expect(d3.jerseyNumberKnown).toBe(true);
    // Salvo el número y su marca, cada jugador es el mismo de antes.
    expect({ ...d3, number: a3.number, jerseyNumberKnown: a3.jerseyNumberKnown }).toEqual(a3);
    expect({ ...d2, number: a2.number, jerseyNumberKnown: a2.jerseyNumberKnown }).toEqual(a2);
  });

  it("un dorsal LIBRE, el 99, no ofrece intercambio y solo toca a quien se edita", () => {
    const antes = estadoInicial();
    expect(duplicateHolder(antes, "r3", 99)).toBeNull();
    const despues = setPlayerNumber(antes, "r3", 99);
    expect(despues.find((p) => p.id === "r3")!.number).toBe(99);
    // r2 se queda exactamente como estaba.
    expect(despues.find((p) => p.id === "r2")).toEqual(antes.find((p) => p.id === "r2"));
    expect(despues.find((p) => p.id === "L1")).toEqual(antes.find((p) => p.id === "L1"));
  });

  it("los dos caminos son distintos: uno cruza dos jugadores, el otro toca uno", () => {
    const antes = estadoInicial();
    const cruzado = swapPlayerNumbers(antes, "r3", "r2");
    const libre = setPlayerNumber(antes, "r3", 99);
    const cambiados = (nuevo: typeof antes) =>
      nuevo.filter((p, i) => p.number !== antes[i].number).map((p) => p.id);
    expect(cambiados(cruzado)).toEqual(["r2", "r3"]);
    expect(cambiados(libre)).toEqual(["r3"]);
  });
});
