/**
 * PARCHE PR #24A.1 · la FALTA se queda con la fase que había.
 *
 * QUÉ SE ARREGLA
 * --------------
 * `MatchTracker` construye eventos en tres sitios: `handleAction`,
 * `FORMATION_CHANGE` y `handleFoul`. Los dos primeros estampaban
 * `phaseOfPlay`; el tercero no. Una falta quedaba sin la cuarta dimensión sin
 * que ninguna guardia lo viera, y `phaseOfPlay` ausente no se rellena nunca:
 * cada partido jugado así era dato perdido para siempre.
 *
 * LO QUE **NO** CAMBIA
 * --------------------
 * Una falta sigue SIN mover la fase. Eso lo decide `phaseModel`
 * (`nextPhaseAfterEvent(FOUL, …) === current`, ya probado) y aquí se
 * comprueba que `handleFoul` ni siquiera lo llama. Registrar la fase y
 * cambiarla son cosas distintas.
 *
 * POR QUÉ SOBRE EL FUENTE
 * -----------------------
 * `MatchTracker.tsx` son 8.600 líneas y arrastra la aplicación entera: no se
 * monta en jsdom, igual que en PR #24A. Lo que se protege aquí es el
 * CABLEADO. La parte que SÍ se ejecuta de verdad —que un FOUL con fase viaja
 * al CSV y uno sin fase deja la columna vacía— va al final, contra el
 * servicio real.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ActionType, GameEvent, GameState, MatchData, Period } from "../types/futsal";
import { buildActionsCsv } from "../services/matchExportService";

const fuente = readFileSync(resolve(__dirname, "./MatchTracker.tsx"), "utf-8");

/** El cuerpo de `handleFoul`, de su firma al handler siguiente. */
const handleFoul = (() => {
  const ini = fuente.indexOf("const handleFoul = (");
  const fin = fuente.indexOf("const assignFoulLocation = (", ini);
  expect(ini).toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(ini);
  return fuente.slice(ini, fin);
})();

/** El cuerpo de `handleAction`, para exigir que los dos usen el MISMO patrón. */
const handleAction = (() => {
  const ini = fuente.indexOf("const handleAction = (");
  const fin = fuente.indexOf("const handleFreeKickPlay = (", ini);
  expect(ini).toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(ini);
  return fuente.slice(ini, fin);
})();

/**
 * El mismo trozo SIN comentarios.
 *
 * Las comprobaciones en negativo tienen que mirar código: el comentario que
 * explica por qué una falta no llama a `nextPhaseAfterEvent` contiene, por
 * fuerza, ese mismo nombre.
 */
const codigoFoul = handleFoul
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

/** La línea contractual del estampado. Una sola forma en toda la pantalla. */
const ESTAMPADO = "...(phaseAtTap ? { phaseOfPlay: phaseAtTap } : {}),";
const LECTURA = "const phaseAtTap = phaseOfPlayRef.current;";

// ── 1-2 · LA FALTA SE QUEDA CON LA FASE ─────────────────────────────────

describe("1-2 · la falta registra la fase que había", () => {
  it("la estampa, y con la MISMA línea que handleAction", () => {
    expect(handleFoul).toContain(ESTAMPADO);
    expect(handleAction).toContain(ESTAMPADO);
  });

  it("la lee del REF, nunca del state", () => {
    expect(handleFoul).toContain(LECTURA);
    // Si alguien cambiara el ref por el state, la falta se llevaría la fase
    // de un render anterior. Eso es justo lo que no puede pasar.
    expect(codigoFoul).not.toMatch(/const phaseAtTap = phaseOfPlay\b/);
    expect(codigoFoul).not.toMatch(/phaseOfPlay:\s*phaseOfPlay\b/);
  });

  it("la lee ANTES de construir el evento", () => {
    const lectura = handleFoul.indexOf(LECTURA);
    const evento = handleFoul.indexOf("const foulEvent: GameEvent = {");
    expect(lectura).toBeGreaterThan(-1);
    expect(evento).toBeGreaterThan(-1);
    expect(lectura).toBeLessThan(evento);
  });

  it("y la lee antes incluso de la alarma, que puede abrir un modal", () => {
    expect(handleFoul.indexOf(LECTURA)).toBeLessThan(
      handleFoul.indexOf("playAlertSound(newCount)"),
    );
  });
});

// ── 3, 5 · AUSENTE SIGUE AUSENTE ────────────────────────────────────────

describe("3, 5 · sin fase declarada no se inventa ninguna", () => {
  it("el estampado es condicional: undefined no llega al evento", () => {
    // La forma `...(x ? {…} : {})` es lo que hace que la clave NO exista.
    // Escribir `phaseOfPlay: phaseAtTap` a secas metería `undefined` dentro.
    expect(handleFoul).toContain(ESTAMPADO);
    expect(codigoFoul).not.toMatch(/phaseOfPlay:\s*phaseAtTap\s*,/);
  });

  it("no hay valor por defecto ni relleno de ningún tipo", () => {
    expect(codigoFoul).not.toMatch(/phaseAtTap\s*(\?\?|\|\|)/);
    expect(codigoFoul).not.toContain('"attack_positional"');
    expect(codigoFoul).not.toContain('"defense_organized"');
    expect(codigoFoul).not.toContain('"attack_transition"');
    expect(codigoFoul).not.toContain('"defense_transition"');
  });
});

// ── 4 · LA FALTA NO CAMBIA LA FASE ──────────────────────────────────────

describe("4 · registrar la fase no es cambiarla", () => {
  it("handleFoul no escribe el estado de fase por ninguna vía", () => {
    expect(codigoFoul).not.toContain("applyPhaseOfPlay(");
    expect(codigoFoul).not.toContain("setPhaseOfPlay(");
    expect(codigoFoul).not.toContain("phaseOfPlayRef.current =");
  });

  it("y no llama a la transición: una falta no la dispara", () => {
    expect(codigoFoul).not.toContain("nextPhaseAfterEvent");
    // El único contacto con el ref es la lectura.
    expect(codigoFoul.match(/phaseOfPlayRef/g) ?? []).toHaveLength(1);
  });
});

// ── 6 · PROPIO Y RIVAL, LA MISMA FASE ───────────────────────────────────

describe("6 · la convención no se invierte para el rival", () => {
  it("hay UN solo estampado, sin rama por bando", () => {
    expect(codigoFoul.match(/phaseOfPlay/g) ?? []).toHaveLength(2); // phaseOfPlayRef + la clave
    expect(codigoFoul.split(ESTAMPADO)).toHaveLength(2);
  });

  it("isTeam decide el bando del evento, no su fase", () => {
    // `isTeam` sigue gobernando contador, marcador, perspectiva y isOpponent…
    expect(handleFoul).toContain('fouls[isTeam ? "team" : "opponent"]');
    expect(handleFoul).toContain("metadata: { isOpponent: !isTeam }");
    // …y nada de eso toca la fase: la línea del estampado no lo menciona.
    const linea = handleFoul
      .split("\n")
      .find((l) => l.includes(ESTAMPADO))!;
    expect(linea).not.toContain("isTeam");
    expect(linea).not.toContain("isOpponent");
  });
});

// ── 7-9 · LO QUE NO SE HA TOCADO ────────────────────────────────────────

describe("7-9 · contador, alarma y ubicación siguen igual", () => {
  it("el contador reglamentario y el individual, con foulModel", () => {
    expect(handleFoul).toContain("fouls: applyFoulToCounters(prev.fouls, foulEvent, 1)");
    expect(handleFoul).toContain("applyFoulToPlayerStat(p.stats.fouls, foulStatDelta(foulEvent, p, 1))");
  });

  it("la alarma de 4ª y 5ª falta sigue disparándose antes que nada", () => {
    expect(handleFoul).toContain("if (newCount === 4 || newCount === 5)");
    expect(handleFoul).toContain("playAlertSound(newCount)");
    // Y sigue ocurriendo ANTES de registrar el evento: el contador
    // reglamentario no puede esperar a ningún paso posterior.
    expect(handleFoul.indexOf("playAlertSound(newCount)")).toBeLessThan(
      handleFoul.indexOf("const foulEvent: GameEvent = {"),
    );
  });

  it("la zona sigue siendo un paso posterior y descartable", () => {
    expect(handleFoul).toContain("setPendingFoulLocation({ eventId: foulEventId, isOpponent: !isTeam })");
    expect(handleFoul.indexOf("const foulEvent: GameEvent = {")).toBeLessThan(
      handleFoul.indexOf("setPendingFoulLocation("),
    );
    // La falta NO nace con originGrid: lo añade después assignFoulLocation.
    const literal = codigoFoul.slice(
      codigoFoul.indexOf("const foulEvent: GameEvent = {"),
      codigoFoul.indexOf("applyFoulToCounters"),
    );
    expect(literal).not.toContain("originGrid");
  });

  it("periodo, perspectiva y marcador del evento intactos", () => {
    expect(handleFoul).toContain("period: prev.period");
    expect(handleFoul).toContain("attackDirection(prev.teamDefendsAtKickoff, prev.period, !isTeam)");
    expect(handleFoul).toContain("scoreAtEvent:");
  });
});

// ── 10 · NI UNA PULSACIÓN MÁS ───────────────────────────────────────────

describe("10 · el flujo de falta no gana ningún paso", () => {
  it("sigue siendo contabilizar → registrar → ofrecer zona", () => {
    const pasos = ["playAlertSound", "const foulEvent: GameEvent = {", "setPendingFoulLocation("];
    const posiciones = pasos.map((p) => handleFoul.indexOf(p));
    expect(posiciones.every((p) => p > -1)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });

  it("no se abre ninguna pantalla ni selector de fase", () => {
    expect(codigoFoul).not.toMatch(/setPending\w*Phase/);
    expect(codigoFoul).not.toContain("phaseHeaderLabel");
    expect(codigoFoul).not.toContain("phaseAfterAttackTap");
    expect(codigoFoul).not.toContain("phaseAfterDefenseTap");
  });
});

// ── 11-12 · LOS CONTRATOS DE AL LADO ────────────────────────────────────

describe("11-12 · nada más se ha movido", () => {
  const lee = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

  it("phaseModel conserva su modelo: FOUL no está entre los automatismos", () => {
    const m = lee("../utils/phaseModel.ts");
    expect(m).toContain("case ActionType.STEAL:");
    expect(m).toContain("case ActionType.LOSS:");
    expect(m).not.toContain("ActionType.FOUL");
    expect(m).toContain("default:\n      return current;");
  });

  it("Tactical Pro sigue sin saber nada de la fase", () => {
    const p = lee("../services/tacticalProPayload.ts");
    expect(p).not.toContain("phaseOfPlay");
    expect(p).not.toMatch(/fase de juego/i);
  });

  it("la página de periodos de PR #23 sigue sin mencionarla", () => {
    const p = lee("../components/export/PeriodZoneMaps.tsx");
    expect(p).not.toContain("phaseOfPlay");
    expect(p).toContain("La escala se comparte entre las partes");
  });

  it("el resto de la captura de PR #24A sigue en su sitio", () => {
    expect(fuente).toContain("const phaseOfPlayRef = useRef<PhaseOfPlay | undefined>(undefined);");
    expect(fuente).toContain("applyPhaseOfPlay(nextPhaseAfterEvent(");
    expect(fuente).toContain("applyPhaseOfPlay(undefined);"); // descanso
    expect(fuente).toContain("currentPhaseOfPlay: phaseOfPlay,"); // snapshot
  });
});

// ── 13-14 · LO QUE SÍ SE EJECUTA: LA FALTA AGUAS ABAJO ──────────────────
//
// Aquí no se lee fuente: se construyen faltas reales y se pasan por el
// servicio de exportación de verdad, que es lo que el cuerpo técnico abre.

function partidoCon(eventos: GameEvent[]): MatchData {
  return {
    teamName: "MI EQUIPO",
    opponentName: "RIVAL",
    period: Period.FINISHED,
    matchClock: 0,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: {
      team: { period1: false, period2: false },
      opponent: { period1: false, period2: false },
    },
    players: [],
    events: eventos,
    timestamp: "2026-09-23T20:00:00.000Z",
    teamDefendsAtKickoff: "left",
  };
}

const falta = (n: number, opp: boolean, extra: Partial<GameEvent> = {}): GameEvent => ({
  id: `foul-${n}`,
  timestamp: 60_000 * n,
  wallClock: 1_700_000_000_000 + n,
  period: Period.FIRST,
  playerIds: [],
  type: ActionType.FOUL,
  gameState: GameState.FOUR_VS_FOUR,
  metadata: { isOpponent: opp },
  ...extra,
});

/** La columna "fase" es la última; se lee por posición desde el final. */
const columnaFase = (fila: string) => fila.split(",").pop()!.replace(/^"|"$/g, "");

describe("13-14 · la fase de la falta llega hasta el CSV", () => {
  it("una falta NUESTRA en defensa organizada la exporta con ese nombre", () => {
    const csv = buildActionsCsv(
      partidoCon([falta(1, false, { phaseOfPlay: "defense_organized" })]),
    );
    const [cabecera, fila] = csv.replace(/^﻿/, "").split("\n");
    expect(cabecera.split(",").pop()!.replace(/^"|"$/g, "")).toBe("fase");
    expect(columnaFase(fila)).toBe("Defensa organizada");
  });

  it("una falta DEL RIVAL exporta NUESTRA fase, no la suya invertida", () => {
    const csv = buildActionsCsv(
      partidoCon([falta(2, true, { phaseOfPlay: "attack_positional" })]),
    );
    const fila = csv.replace(/^﻿/, "").split("\n")[1];
    expect(fila).toContain("RIVAL");
    expect(columnaFase(fila)).toBe("Ataque posicional");
  });

  it("una falta sin fase deja la columna vacía, no «no registrada»", () => {
    const csv = buildActionsCsv(partidoCon([falta(3, false)]));
    const fila = csv.replace(/^﻿/, "").split("\n")[1];
    expect(columnaFase(fila)).toBe("");
  });

  it("con zona y sin zona conservan igual la fase", () => {
    const csv = buildActionsCsv(
      partidoCon([
        falta(4, false, { phaseOfPlay: "defense_transition", originGrid: "Z2C" }),
        falta(5, false, { phaseOfPlay: "defense_transition" }),
      ]),
    );
    const [, conZona, sinZona] = csv.replace(/^﻿/, "").split("\n");
    expect(conZona).toContain("Z2C");
    expect(sinZona).not.toContain("Z2C");
    expect(columnaFase(conZona)).toBe("Transición defensiva");
    expect(columnaFase(sinZona)).toBe("Transición defensiva");
  });
});
