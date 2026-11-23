// @vitest-environment jsdom
/**
 * EL DOSSIER COMPACTO, CON Y SIN RIVAL.
 *
 * Fixtures:
 *   A  partido denso con los dos equipos
 *   B  el mismo partido, exportado sin rival
 *   C  partido solo con datos locales (sin fichas ni acciones del rival)
 *   D  sin Tactical Pro
 *   E  Tactical Pro largo, con apartados numerados y listas
 *   F  muchos jugadores y porteros
 *   G  varios goleadores
 *   H  dorsales desconocidos
 *   I  gol en propia
 *   J  córner, falta y banda enlazados
 *
 * Se ejerce de verdad: React, la maquetación por bloques y la auditoría. Lo
 * único simulado es rasterizar y escribir el PDF, que jsdom no sabe hacer;
 * cada «página» es el nodo que se habría capturado. Sin motor de layout, los
 * bloques se miden con la estimación conservadora de `pdfFlow`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType, GameEvent, GameState, MatchData, Period, Player, Role } from "../types/futsal";

const toJpegMock = vi.fn(async (_node?: HTMLElement) => "data:image/jpeg;base64," + "A".repeat(2000));
vi.mock("html-to-image", () => ({
  toJpeg: (node: HTMLElement) => toJpegMock(node),
  getFontEmbedCSS: async () => "",
}));
const pdfSaveMock = vi.fn();
vi.mock("jspdf", () => ({
  jsPDF: vi.fn().mockImplementation(function (this: any) {
    return {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      addImage: vi.fn(),
      addPage: vi.fn(),
      save: pdfSaveMock,
    };
  }),
}));
vi.mock("../components/field/FutsalPitch", () => ({
  FutsalPitch: ({ counts, mode }: any) => (
    <div data-pitch-mode={mode ?? "zone12"} data-pitch-total={Object.values(counts ?? {}).reduce((a: any, b: any) => a + b, 0)} />
  ),
}));
const generateTacticalReportMock = vi.fn();
const streamTacticalReportMock = vi.fn();
vi.mock("./tacticalAnalysisService", () => ({
  generateTacticalReport: (...a: any[]) => generateTacticalReportMock(...a),
  streamTacticalReport: (...a: any[]) => streamTacticalReportMock(...a),
}));

import {
  DOSSIER_FALLBACK_BODY_HEIGHT,
  buildDossierInventory,
  exportFullMatchDossierPdf,
  failedChecks,
  rivalScopeLabel,
  tacticalUnitProbe,
  verifyDossierAgainstReport,
} from "./fullDossierPdfService";
import { exportMatchReportPdf, tacticalProUnits } from "./pdfExportService";
import { FLOW_GAP, estimateHeight } from "./pdfFlow";
import { generateMatchReport } from "./matchReportService";
import { buildGoalkeeperReports } from "./goalkeeperReportService";
import { summarizeSetPieceSequences } from "../utils/setPieceStats";

// ── FIXTURES ────────────────────────────────────────────────────────────

const st = () => ({ goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
  fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0 });
const J = (id: string, number: number, name: string, isOpponent: boolean, extra: Partial<Player> = {}): Player => ({
  id, number, name, role: Role.PLAYER, isOnPitch: true, plusMinus: 0, individualTimeSeconds: 600 + number * 30,
  rotationTimeSeconds: 90, isOpponent, stats: st(), ...extra,
});

type Opciones = { jugadores?: number; porteros?: number; rival?: boolean; tactical?: string };

let n = 0;
/** Partido denso de prueba: todo lo que el dossier sabe pintar. */
function partido(o: Opciones = {}): MatchData {
  const conRival = o.rival !== false;
  const nj = o.jugadores ?? 10;
  const ng = o.porteros ?? 2;
  const players: Player[] = [];
  for (let g = 0; g < ng; g++) players.push(J(`lgk${g}`, 1 + g * 12, `Portero Local ${g + 1}`, false, { role: Role.GOALKEEPER, isOnPitch: g === 0 }));
  for (let i = 0; i < nj; i++) {
    // H · un dorsal desconocido en cada equipo
    const desconocido = i === nj - 1 ? { number: 0, jerseyNumberKnown: false } : {};
    // G · los goles por jugador, como los deja la captura en sus estadísticas.
    const goles = i === 0 ? 2 : i === 1 || i === 2 ? 1 : 0;
    players.push(J(`l${i}`, i + 2, `Local ${String.fromCharCode(65 + i)} Apellido`, false, { ...desconocido, stats: { ...st(), goals: goles } }));
  }
  if (conRival) {
    for (let g = 0; g < ng; g++) players.push(J(`rgk${g}`, 1 + g * 12, `Portero Visitante ${g + 1}`, true, { role: Role.GOALKEEPER, isOnPitch: g === 0 }));
    for (let i = 0; i < nj; i++) {
      const desconocido = i === nj - 1 ? { number: 0, jerseyNumberKnown: false } : {};
      players.push(J(`r${i}`, i + 2, `Visitante ${String.fromCharCode(65 + i)}`, true, desconocido));
    }
  }
  const events: GameEvent[] = [];
  const fases = ["attack_positional", "attack_transition", "defense_organized", "defense_transition"] as const;
  const cols = ["L", "C", "R"];
  const E = (e: Partial<GameEvent> & { type: any }) =>
    events.push({ id: `x${++n}`, timestamp: 30_000 * (events.length + 1) % 1_200_000, wallClock: 1000 + events.length,
      period: Period.FIRST, playerIds: [], gameState: GameState.FOUR_VS_FOUR, metadata: { isOpponent: false }, ...e } as GameEvent);
  const tipos = [ActionType.SHOT, ActionType.STEAL, ActionType.LOSS, ActionType.INTERCEPTION, ActionType.FOUL];
  for (let k = 0; k < 80; k++) {
    const opp = conRival && k % 3 === 2;
    const tipo = tipos[k % tipos.length];
    const autor = opp ? `r${k % nj}` : `l${k % nj}`;
    const portero = opp ? "lgk0" : "rgk0";
    E({
      type: tipo, period: k < 40 ? Period.FIRST : Period.SECOND,
      playerIds: tipo === ActionType.SHOT && conRival ? [autor, portero] : [autor],
      originGrid: `Z${1 + (k % 4)}${cols[k % 3]}`, phaseOfPlay: fases[k % 4],
      ...(tipo === ActionType.SHOT ? { destinationGrid: k % 4 === 0 ? "OUT" : `G${1 + (k % 9)}` } : {}),
      metadata: { isOpponent: opp, ...(tipo === ActionType.SHOT ? { setPiece: "normal", ...(conRival ? { targetGoalkeeperId: portero } : {}) } : {}) },
    });
  }
  // G · varios goleadores (2, 1, 1) + I · gol en propia del rival
  const gol = (autor: string, periodo: Period, opp = false) =>
    E({ type: ActionType.GOAL, period: periodo, playerIds: conRival ? [autor, opp ? "lgk0" : "rgk0"] : [autor], originGrid: "Z4C", destinationGrid: "G2",
      metadata: { isOpponent: opp, setPiece: "normal", ...(conRival ? { targetGoalkeeperId: opp ? "lgk0" : "rgk0" } : {}) } });
  gol("l0", Period.FIRST); gol("l1", Period.FIRST); gol("l0", Period.SECOND); gol("l2", Period.SECOND);
  if (conRival) {
    gol("r3", Period.SECOND, true);
    E({ type: ActionType.OWN_GOAL, period: Period.SECOND, playerIds: ["r4"], originGrid: "Z1C", metadata: { isOpponent: true } });
    // Contexto 5x4 del rival
    E({ type: ActionType.FORMATION_CHANGE, period: Period.SECOND, gameState: GameState.PJ_DEFENSE, metadata: { isOpponent: true } });
    E({ type: ActionType.FORMATION_CHANGE, period: Period.SECOND, gameState: GameState.FOUR_VS_FOUR, metadata: { isOpponent: true } });
  }
  // J · córner, falta y banda enlazados
  E({ type: ActionType.CORNER, playerIds: ["l3"], originGrid: "Z4L", metadata: { isOpponent: false, sequenceId: "spseq-j1", sequenceRole: "root", sequenceRoot: "corner", sequenceOutcome: "shot", setPieceModality: "prepared", takerId: "l3", cornerSide: "left", setPieceOutcome: "play" } });
  E({ type: ActionType.SHOT, playerIds: conRival ? ["l4", "rgk0"] : ["l4"], originGrid: "Z4L", destinationGrid: "OUT", metadata: { isOpponent: false, sequenceId: "spseq-j1", sequenceRoot: "corner", sequenceRole: "outcome", setPiece: "corner", ...(conRival ? { targetGoalkeeperId: "rgk0" } : {}) } });
  E({ type: ActionType.THROW_IN, playerIds: ["l5"], originGrid: "Z2R", metadata: { isOpponent: false, sequenceId: "spseq-j2", sequenceRole: "root", sequenceRoot: "throw_in", sequenceOutcome: "keep", setPieceModality: "quick", takerId: "l5", throwInSide: "right", throwInSector: "Z2" } });
  if (conRival) {
    E({ type: ActionType.SET_PIECE, playerIds: ["r1"], originGrid: "Z3C", metadata: { isOpponent: true, sequenceId: "spseq-j3", sequenceRole: "root", sequenceRoot: "free_kick", sequenceOutcome: "loss", setPieceModality: "prepared", takerId: "r1", setPieceOrigin: "free_kick", setPieceOutcome: "play" } });
    E({ type: ActionType.LOSS, playerIds: ["r1"], originGrid: "Z3C", metadata: { isOpponent: true, sequenceId: "spseq-j3", sequenceRoot: "free_kick", sequenceRole: "outcome" } });
  }
  return {
    teamName: "CD MURCIA", opponentName: "VISITANTE FC", period: Period.FINISHED, matchClock: 0, isClockRunning: false,
    fouls: { team: 2, opponent: 3 }, timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
    timestamp: "2026-11-20T18:00:00.000Z", teamDefendsAtKickoff: "left", players, events,
    ...(o.tactical ? { tacticalAnalysis: o.tactical } : {}),
  };
}

/** E · Tactical Pro largo: apartados numerados, párrafos y listas. */
const IA_LARGO = Array.from({ length: 6 }, (_, i) =>
  `${i + 1}. Apartado ${i + 1} del análisis\n\n` +
  Array.from({ length: 3 }, (_, p) => `Texto ${i + 1}.${p + 1}: lectura del partido apoyada en los datos registrados, con matices por parte y por zona que el cuerpo técnico debe revisar.`).join("\n\n") +
  `\n\n- Viñeta ${i + 1}A\n- Viñeta ${i + 1}B`,
).join("\n\n");

// ── EXPORTAR Y CACHEAR ──────────────────────────────────────────────────

const cache = new Map<string, HTMLElement[]>();
async function dossier(clave: string, md: MatchData, includeOpponent?: boolean): Promise<HTMLElement[]> {
  const k = `${clave}|${includeOpponent}`;
  if (cache.has(k)) return cache.get(k)!;
  toJpegMock.mockClear();
  pdfSaveMock.mockClear();
  await exportFullMatchDossierPdf(md, includeOpponent === undefined ? {} : { includeOpponent });
  const nodos = toJpegMock.mock.calls.map((c) => c[0] as HTMLElement);
  cache.set(k, nodos);
  return nodos;
}
const texto = (ns: HTMLElement[]) => ns.map((n) => n.textContent ?? "").join("\n").replace(/\s+/g, " ");
const bloques = (ns: HTMLElement[]) => ns.flatMap((n) => Array.from(n.querySelectorAll<HTMLElement>("[data-flow-item]")));
const TIEMPO = 90_000;

const A = partido({ tactical: IA_LARGO });
const C = partido({ rival: false, tactical: "1. Solo local\n\nAnálisis exclusivo del partido local C." });
const D = partido();
const F = partido({ jugadores: 22, porteros: 3 });

let originalImage: typeof Image;
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  originalImage = window.Image;
  class FakeImage {
    width = 794; height = 1123; onload: (() => void) | null = null; complete = false;
    set src(_v: string) { setTimeout(() => this.onload?.(), 0); }
  }
  // @ts-expect-error doble de rasterización
  window.Image = FakeImage;
  fetchSpy = vi.fn(async () => { throw new Error("red prohibida en la exportación"); });
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  window.Image = originalImage;
  vi.unstubAllGlobals();
});

// ── PRUEBAS ─────────────────────────────────────────────────────────────

describe("A · con rival (y es lo que pasa por defecto)", () => {
  it("la opción está activada por defecto: sin opciones, el rival entra", async () => {
    const ns = await dossier("A", A);
    expect(ns[0].querySelector('[data-dossier-scope="both"]')?.textContent).toBe("Análisis de ambos equipos");
    expect(bloques(ns).some((b) => b.getAttribute("data-flow-team") === "opponent")).toBe(true);
    expect(ns[0].textContent).toContain(rivalScopeLabel(A, true));
  }, TIEMPO);

  it("trae mapas, tabla de jugadores y porteros del rival", async () => {
    const ns = await dossier("A", A);
    const ids = bloques(ns).map((b) => b.getAttribute("data-flow-item"));
    expect(ids).toContain("mapas-rival");
    expect(ids).toContain("tiros-parte-rival");
    expect(ids).toContain("jugadores-rival");
    for (const gk of buildGoalkeeperReports(A).filter((g) => g.isOpponent)) {
      expect(ids).toContain(`portero-${gk.id}`);
    }
  }, TIEMPO);

  it("el dossier dice lo mismo que el informe: ninguna comprobación falla", async () => {
    const ns = await dossier("A", A);
    expect(failedChecks(verifyDossierAgainstReport(ns, A))).toEqual([]);
  }, TIEMPO);
});

describe("B · el mismo partido sin rival", () => {
  it("la portada lo dice y conserva los dos nombres y el marcador completo", async () => {
    const ns = await dossier("A", A, false);
    const r = generateMatchReport(A);
    const portada = ns[0].textContent ?? "";
    expect(portada).toContain("Análisis centrado en CD MURCIA");
    expect(portada).toContain("CD MURCIA");
    expect(portada).toContain("VISITANTE FC");
    expect(portada).toContain(`${r.score.team} - ${r.score.opponent}`);
  }, TIEMPO);

  it("no queda ningún bloque, tabla, mapa ni portero del rival", async () => {
    const ns = await dossier("A", A, false);
    expect(bloques(ns).filter((b) => b.getAttribute("data-flow-team") === "opponent")).toEqual([]);
    expect(ns.some((n) => n.querySelector('[data-dossier-player^="r"]'))).toBe(false);
    expect(ns.some((n) => n.querySelector('[data-dossier-map^="rival-"]'))).toBe(false);
    expect(ns.some((n) => n.querySelector('[data-dossier-destination="rival"]'))).toBe(false);
    expect(texto(ns)).not.toContain("Portero Visitante");
  }, TIEMPO);

  it("nuestros datos siguen completos", async () => {
    const con = bloques(await dossier("A", A)).map((b) => b.getAttribute("data-flow-item"));
    const sin = bloques(await dossier("A", A, false)).map((b) => b.getAttribute("data-flow-item"));
    const nuestros = con.filter((id) => id && !/rival/.test(id) && !id.startsWith("portero-rgk"));
    for (const id of nuestros) {
      if (id === "periodos" || id === "destinos") continue; // mismo bloque, una columna
      expect(sin, id!).toContain(id);
    }
    expect(sin).toContain("periodos");
    expect(sin).toContain("destinos");
  }, TIEMPO);

  it("conserva la secuencia de goles entera, con autor y beneficiario, y el gol en propia", async () => {
    const goles = (ns: HTMLElement[]) =>
      ns.flatMap((n) => Array.from(n.querySelectorAll("[data-goal-row]"))).map((g) => g.textContent);
    const con = goles(await dossier("A", A));
    const sin = goles(await dossier("A", A, false));
    expect(sin).toEqual(con);
    expect(sin).toHaveLength(generateMatchReport(A).goalSequence.length);
    // El gol del rival y el gol en propia que nos sumó siguen ahí.
    expect(sin.join(" ")).toMatch(/Visitante D/);
  }, TIEMPO);

  it("conserva los contextos 5x4/4x5, las acciones relevantes y las faltas por parte", async () => {
    const ns = await dossier("A", A, false);
    const r = generateMatchReport(A);
    expect(r.matchContextGroups.length).toBeGreaterThan(0);
    for (const c of r.matchContextGroups) expect(texto(ns)).toContain(c.label);
    expect(texto(ns)).toContain("Eventos relevantes");
    expect(texto(ns)).toContain("Faltas acumuladas");
    // La tabla de faltas del balón parado mantiene a los dos equipos.
    expect(ns.some((n) => n.querySelector('[data-foul-row="VISITANTE FC"]'))).toBe(true);
  }, TIEMPO);

  it("Tactical Pro entra COMPLETO también sin rival", async () => {
    const ns = await dossier("A", A, false);
    const t = texto(ns);
    for (const u of tacticalProUnits(IA_LARGO)) expect(t).toContain(tacticalUnitProbe(u));
    expect(failedChecks(verifyDossierAgainstReport(ns, A, undefined, { includeOpponent: false }))).toEqual([]);
  }, TIEMPO);

  it("y ocupa menos páginas que con rival", async () => {
    expect((await dossier("A", A, false)).length).toBeLessThan((await dossier("A", A)).length);
  }, TIEMPO);
});

describe("C · partido solo con datos locales", () => {
  it("exporta sin páginas del rival vacías ni bloques en blanco", async () => {
    const ns = await dossier("C", C);
    expect(ns.every((n) => (n.querySelector("[data-flow-body]")?.textContent ?? "").trim().length > 0)).toBe(true);
    expect(bloques(ns).some((b) => b.getAttribute("data-flow-item") === "jugadores-rival")).toBe(true);
    // La tabla del rival dice que no hay fichas, no se inventa ninguna.
    expect(texto(ns)).toContain("Sin jugadores registrados.");
  }, TIEMPO);
});

describe("D · sin Tactical Pro", () => {
  it("no hay sección de análisis y la portada lo declara", async () => {
    const ns = await dossier("D", D);
    expect(ns.some((n) => n.querySelector('[data-flow-section="tactical-pro"]'))).toBe(false);
    expect(ns[0].textContent).toContain("TACTICAL PRO no generado");
  }, TIEMPO);
});

describe("E · Tactical Pro largo", () => {
  it("entra entero: cada unidad, cada apartado numerado y cada viñeta", async () => {
    const ns = await dossier("A", A);
    const t = texto(ns);
    for (let i = 1; i <= 6; i++) {
      expect(t, `apartado ${i}`).toContain(`${i}. Apartado ${i} del análisis`);
      expect(t).toContain(`Viñeta ${i}B`);
    }
    // Las viñetas siguen siendo una lista visible.
    expect(ns.some((n) => n.querySelector('[data-flow-section="tactical-pro"] li'))).toBe(true);
  }, TIEMPO);

  it("ningún apartado queda solo al pie de una página", async () => {
    const ns = await dossier("A", A);
    ns.slice(0, -1).forEach((n, i) => {
      const items = Array.from(n.querySelectorAll("[data-flow-item]"));
      expect(items[items.length - 1]?.getAttribute("data-flow-kind"), `página ${i + 1}`).not.toBe("heading");
    });
  }, TIEMPO);
});

describe("F · muchos jugadores y porteros", () => {
  it("la tabla de jugadores se parte por filas, con cabecera, sin perder ni repetir a nadie", async () => {
    const ns = await dossier("F", F);
    const filas = ns.flatMap((n) => Array.from(n.querySelectorAll('[data-dossier-player^="l"]')))
      .map((f) => f.getAttribute("data-dossier-player"));
    const esperados = F.players.filter((p) => !p.isOpponent).map((p) => p.id);
    expect(filas.sort()).toEqual(esperados.sort());
  }, TIEMPO);

  it("todas las fichas de portero, de los dos equipos, cada una una vez", async () => {
    const ns = await dossier("F", F);
    const fichas = ns.flatMap((n) => Array.from(n.querySelectorAll("[data-dossier-goalkeeper]")))
      .map((f) => f.getAttribute("data-dossier-goalkeeper"));
    expect(fichas.sort()).toEqual(buildGoalkeeperReports(F).map((g) => g.id).sort());
  }, TIEMPO);
});

describe("G · H · goleadores y dorsales", () => {
  it("todos los goleadores, ordenados por goles y después por dorsal", async () => {
    const ns = await dossier("A", A);
    const resumen = (ns.find((n) => n.querySelector('[data-flow-item="resumen-visual"]'))!.textContent ?? "").replace(/\s+/g, " ");
    const scorers = generateMatchReport(A).highlights.scorers;
    expect(scorers.map((s) => s.goals)).toEqual([2, 1, 1]);
    let desde = 0;
    for (const s of scorers) {
      const i = resumen.indexOf(s.name, desde);
      expect(i, s.name).toBeGreaterThanOrEqual(0);
      desde = i;
    }
  }, TIEMPO);

  it("un dorsal desconocido se imprime como «?»", async () => {
    const ns = await dossier("A", A);
    const fila = ns.flatMap((n) => Array.from(n.querySelectorAll('[data-dossier-player="l9"]')))[0];
    expect(fila.querySelectorAll("td")[1].textContent).toBe("?");
  }, TIEMPO);
});

describe("I · gol en propia", () => {
  it("suma al beneficiario y no se le atribuye a ningún goleador nuestro", async () => {
    const r = generateMatchReport(A);
    expect(r.score).toEqual({ team: 5, opponent: 1 });
    expect(r.highlights.scorers.reduce((a, s) => a + s.goals, 0)).toBe(4);
    const ns = await dossier("A", A, false);
    expect(texto(ns)).toContain("5 - 1");
  }, TIEMPO);
});

describe("J · córner, falta y banda enlazados", () => {
  it("con rival, las jugadas registradas de los dos equipos; sin rival, solo las nuestras", async () => {
    const con = await dossier("A", A);
    const sin = await dossier("A", A, false);
    const filas = (ns: HTMLElement[]) => ns.flatMap((n) => Array.from(n.querySelectorAll("[data-sequence-row]")))
      .map((f) => f.getAttribute("data-sequence-row"));
    expect(filas(con)).toEqual(expect.arrayContaining(["CD MURCIA|corner", "CD MURCIA|throwIn", "VISITANTE FC|freeKick"]));
    expect(filas(sin).every((f) => f!.startsWith("CD MURCIA|"))).toBe(true);
    // Las cifras salen del motor único.
    const s = summarizeSetPieceSequences(A.events);
    expect(s.team.corner.attempts).toBe(1);
    expect(s.opponent.freeKick.losses).toBe(1);
  }, TIEMPO);
});

describe("estructura · índice, pies, páginas vacías y desbordamientos", () => {
  for (const [nombre, md, rival] of [["A", A, true], ["A", A, false], ["F", F, true]] as const) {
    it(`${nombre} ${rival ? "con" : "sin"} rival · el índice sale del inventario y apunta a la página real`, async () => {
      const ns = await dossier(nombre, md, rival);
      const indice = Array.from(ns[0].querySelectorAll("[data-dossier-index] tr")).map((tr) => {
        const td = tr.querySelectorAll("td");
        return { titulo: td[0].textContent, pagina: Number(td[1].textContent) };
      });
      const secciones = buildDossierInventory(md, { includeOpponent: rival }).sections;
      expect(indice.map((x) => x.titulo)).toEqual(secciones.map((s) => s.title));
      secciones.forEach((s, i) => {
        const real = ns.findIndex((n) => n.querySelector(`[data-flow-section="${s.id}"]`)) + 1;
        expect(indice[i].pagina, s.title).toBe(real);
      });
    }, TIEMPO);

    it(`${nombre} ${rival ? "con" : "sin"} rival · pies correlativos y cero páginas vacías`, async () => {
      const ns = await dossier(nombre, md, rival);
      ns.forEach((n, i) => {
        expect(n.querySelector("[data-flow-page-number]")?.textContent?.trim()).toBe(`Página ${i + 1} de ${ns.length}`);
        expect((n.querySelector("[data-flow-body]")?.textContent ?? "").trim().length, `página ${i + 1}`).toBeGreaterThan(0);
      });
    }, TIEMPO);

    it(`${nombre} ${rival ? "con" : "sin"} rival · ninguna página se pasa del alto útil y ningún mapa se parte`, async () => {
      const ns = await dossier(nombre, md, rival);
      const estimaciones = Object.fromEntries(
        buildDossierInventory(md, { includeOpponent: rival }).items
          .filter((it) => it.estimate !== undefined)
          .map((it) => [it.id, it.estimate!]),
      );
      ns.slice(1).forEach((n, i) => {
        const items = Array.from(n.querySelectorAll<HTMLElement>("[data-flow-item]"));
        // La misma medida que usó el reparto: la pista horizontal declara su
        // alto; el resto se estima igual que en `pdfFlow`.
        const alto = items.reduce((a, it) => a + (estimaciones[it.getAttribute("data-flow-item")!] ?? estimateHeight(it)), 0)
          + FLOW_GAP * Math.max(0, items.length - 1);
        expect(alto, `página ${i + 2}`).toBeLessThanOrEqual(DOSSIER_FALLBACK_BODY_HEIGHT);
      });
      const mapas = bloques(ns).filter((b) => b.getAttribute("data-flow-kind") === "map").map((b) => b.getAttribute("data-flow-item"));
      expect(new Set(mapas).size).toBe(mapas.length);
    }, TIEMPO);
  }
});

describe("aislamiento y red", () => {
  it("dos partidos seguidos sin recargar: el segundo no lleva nada del primero", async () => {
    await dossier("A", A);
    const nc = await dossier("C-tras-A", C);
    const t = texto(nc);
    expect(t).toContain("Análisis exclusivo del partido local C.");
    expect(t).not.toContain("Apartado 3 del análisis");
    expect(t).not.toContain("Visitante A");
    expect(t).not.toContain("Portero Visitante");
  }, TIEMPO);

  it("exportar no hace ninguna petición: ni Anthropic, ni Tactical Pro, ni escrituras remotas", async () => {
    cache.clear();
    await dossier("A-red", A);
    await dossier("A-red", A, false);
    await exportMatchReportPdf(A, { includeOpponent: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(generateTacticalReportMock).not.toHaveBeenCalled();
    expect(streamTacticalReportMock).not.toHaveBeenCalled();
  }, TIEMPO);
});

describe("informe resumido con y sin rival", () => {
  it("sin rival no imprime las fichas de los porteros rivales; con rival, sí", async () => {
    toJpegMock.mockClear();
    await exportMatchReportPdf(A, { includeOpponent: false });
    const sin = toJpegMock.mock.calls.map((c) => c[0] as HTMLElement);
    toJpegMock.mockClear();
    await exportMatchReportPdf(A);
    const con = toJpegMock.mock.calls.map((c) => c[0] as HTMLElement);
    const fichas = (ns: HTMLElement[]) => ns.flatMap((n) => Array.from(n.querySelectorAll("[data-summary-goalkeeper]"))).map((f) => f.getAttribute("data-summary-goalkeeper"));
    expect(fichas(sin).every((id) => id!.startsWith("lgk"))).toBe(true);
    expect(fichas(con).some((id) => id!.startsWith("rgk"))).toBe(true);
    // Y cada página lleva su pie correlativo.
    sin.forEach((n, i) => expect(n.querySelector("[data-flow-page-number]")?.textContent?.trim()).toBe(`Página ${i + 1} de ${sin.length}`));
  }, TIEMPO);

  it("el progreso informa de cada página capturada", async () => {
    const pasos: string[] = [];
    await exportFullMatchDossierPdf(D, { onProgress: (p) => pasos.push(`${p.phase}:${p.page}/${p.total}`) });
    expect(pasos[0]).toBe("layout:0/0");
    const capturas = pasos.filter((p) => p.startsWith("capture:"));
    expect(capturas.length).toBeGreaterThan(1);
    expect(capturas[capturas.length - 1]).toMatch(/^capture:(\d+)\/\1$/);
    expect(pasos[pasos.length - 1]).toMatch(/^save:/);
  }, TIEMPO);
});
