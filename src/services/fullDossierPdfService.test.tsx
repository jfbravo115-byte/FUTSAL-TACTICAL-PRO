// @vitest-environment jsdom
/**
 * EL DOSSIER COMPLETO.
 *
 * Se ejerce de verdad: React real, jsdom real, la plantilla entera montada y
 * capturada. Lo único simulado es la capa que jsdom no puede hacer —rasterizar
 * a JPEG y escribir un PDF—, así que cada «página» de estos tests es el nodo
 * DOM que se habría capturado.
 *
 * Y TACTICAL PRO ESTÁ MOCKEADO A PROPÓSITO: si algún día este exportador
 * intentara generar un análisis, el doble lo delataría. Exportar no puede
 * costar dinero.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ActionType,
  GameEvent,
  GameState,
  GoalieAction,
  MatchData,
  Period,
  Player,
  Role,
} from "../types/futsal";

const toJpegMock = vi.fn(async (_node?: HTMLElement) => "data:image/jpeg;base64," + "A".repeat(2000));
vi.mock("html-to-image", () => ({ toJpeg: (node: HTMLElement) => toJpegMock(node) }));

const pdfSaveMock = vi.fn();
const addImageMock = vi.fn();
const addPageMock = vi.fn();
vi.mock("jspdf", () => ({
  jsPDF: vi.fn().mockImplementation(function (this: any) {
    return {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      addImage: addImageMock,
      addPage: addPageMock,
      save: pdfSaveMock,
    };
  }),
}));

/**
 * La pista, en versión ligera.
 *
 * Dibujar veinte páginas de SVG real en jsdom tarda minutos y no prueba nada
 * que `FutsalPitch` no tenga ya probado por su cuenta. Lo que este archivo
 * comprueba es la COMPOSICIÓN del dossier: qué páginas hay, qué mapa recibe
 * qué recuento y qué dice cada pie. El doble conserva exactamente eso —los
 * `counts` que le llegan— y tira el resto.
 */
vi.mock("../components/field/FutsalPitch", () => ({
  FutsalPitch: ({ counts, mode }: any) => (
    <div
      data-pitch-mode={mode ?? "zone12"}
      data-pitch-counts={JSON.stringify(counts ?? {})}
      data-pitch-total={Object.values(counts ?? {}).reduce((a: any, b: any) => a + b, 0)}
    />
  ),
}));

const generateTacticalReportMock = vi.fn();
const streamTacticalReportMock = vi.fn();
vi.mock("./tacticalAnalysisService", () => ({
  generateTacticalReport: (...a: any[]) => generateTacticalReportMock(...a),
  streamTacticalReport: (...a: any[]) => streamTacticalReportMock(...a),
}));

import {
  DOSSIER_MAP_METRICS,
  TACTICAL_INCLUDED_LABEL,
  TACTICAL_MISSING_LABEL,
  buildDossierIndex,
  buildDossierPages,
  dossierFileName,
  exportFullMatchDossierPdf,
  hasTacticalAnalysis,
} from "./fullDossierPdfService";
import { exportMatchReportPdf } from "./pdfExportService";
import { buildZoneDashboard, primaryBucket, zoneMetricValue } from "./matchZonesService";
import { generateMatchReport } from "./matchReportService";
import { buildGoalkeeperReports } from "./goalkeeperReportService";
import { scoreOf } from "../utils/goalModel";

// ── FIXTURE DENSO ───────────────────────────────────────────────────────

const stats = (over: Partial<Player["stats"]> = {}): Player["stats"] => ({
  goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
  fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
  ...over,
});

const jugador = (o: Partial<Player> & { id: string; number: number; name: string }): Player => ({
  role: Role.PLAYER,
  isOnPitch: true,
  plusMinus: 0,
  individualTimeSeconds: 900,
  rotationTimeSeconds: 240,
  isOpponent: false,
  stats: stats(),
  ...o,
});

const PLANTILLA: Player[] = [
  jugador({ id: "lgk", number: 1, name: "Portero Local", role: Role.GOALKEEPER, stats: stats({ saves: 4, conceded: 2 }) }),
  jugador({ id: "lgk2", number: 12, name: "Portero Local 2", role: Role.GOALKEEPER, isOnPitch: false, individualTimeSeconds: 300, stats: stats({ saves: 1, conceded: 1 }) }),
  jugador({ id: "l7", number: 7, name: "Juan Pérez", stats: stats({ goals: 2, shots: 4, steals: 3, losses: 2, fouls: 1, yellowCards: 1 }) }),
  jugador({ id: "l10", number: 10, name: "Alejandro García", stats: stats({ goals: 1, shots: 3, interceptions: 2, errors: 1 }) }),
  jugador({ id: "l4", number: 4, name: "Marcos Ruiz", isOnPitch: false, stats: stats({ shots: 1, losses: 1, fouls: 2 }) }),
  jugador({ id: "lcoach", number: 0, name: "ENTRENADOR LOCAL", role: Role.COACH, isOnPitch: false }),
  // Rival: dos con dorsal conocido, uno todavía por conocer.
  jugador({ id: "rgk", number: 13, name: "POR RIVAL 1", role: Role.GOALKEEPER, isOpponent: true, stats: stats({ saves: 5, conceded: 3 }) }),
  jugador({ id: "r9", number: 9, name: "Marco Villa", isOpponent: true, stats: stats({ goals: 1, shots: 3, fouls: 2 }) }),
  jugador({ id: "r5", number: 0, jerseyNumberKnown: false, name: "PJ RIVAL 2", isOpponent: true, stats: stats({ shots: 2, losses: 1 }) }),
];

let seq = 0;
const ev = (o: Partial<GameEvent> & { type: ActionType | GoalieAction }): GameEvent => ({
  id: `e${++seq}`,
  timestamp: 60000,
  wallClock: 1000 + seq,
  period: Period.FIRST,
  playerIds: [],
  onPitchPlayerIds: ["lgk", "l7", "l10", "rgk", "r9", "r5"],
  gameState: GameState.FOUR_VS_FOUR,
  attackDirection: "ltr",
  metadata: { isOpponent: false },
  ...o,
} as GameEvent);

/** Un partido con de todo: dos partes, cuatro fases, los dos equipos. */
function partidoDenso(over: Partial<MatchData> = {}): MatchData {
  seq = 0;
  const eventos: GameEvent[] = [
    // ── 1ª parte, nuestras acciones, las cuatro fases ────────────────
    ev({ type: ActionType.GOAL, playerIds: ["l7", "rgk"], originGrid: "Z4C", destinationGrid: "G2",
      phaseOfPlay: "attack_positional", metadata: { isOpponent: false, setPiece: "normal", targetGoalkeeperId: "rgk" }, scoreAtEvent: { team: 1, opponent: 0 } }),
    ev({ type: ActionType.SHOT, playerIds: ["l7", "rgk"], originGrid: "Z3L", destinationGrid: "OUT",
      phaseOfPlay: "attack_transition", metadata: { isOpponent: false, setPiece: "corner", targetGoalkeeperId: "rgk" } }),
    ev({ type: ActionType.SHOT, playerIds: ["l10", "rgk"], originGrid: "Z4R", destinationGrid: "G5",
      phaseOfPlay: "attack_positional", metadata: { isOpponent: false, setPiece: "normal", goalieResponse: GoalieAction.SAVE, targetGoalkeeperId: "rgk" } }),
    ev({ type: ActionType.STEAL, playerIds: ["l7"], originGrid: "Z2C", phaseOfPlay: "defense_organized", metadata: { isOpponent: false, subType: "with_possession" } }),
    ev({ type: ActionType.INTERCEPTION, playerIds: ["l10"], originGrid: "Z1R", phaseOfPlay: "defense_transition", metadata: { isOpponent: false } }),
    ev({ type: ActionType.LOSS, playerIds: ["l7"], originGrid: "Z3C", phaseOfPlay: "attack_positional", metadata: { isOpponent: false, subType: "bad_pass" } }),
    ev({ type: ActionType.FOUL, playerIds: ["l4"], originGrid: "Z2L", phaseOfPlay: "defense_organized", metadata: { isOpponent: false } }),
    ev({ type: ActionType.CORNER, originGrid: "Z4R", phaseOfPlay: "attack_positional", metadata: { isOpponent: false, cornerSide: "right", setPieceOutcome: "shot" } }),
    ev({ type: ActionType.CORNER, originGrid: "Z4L", phaseOfPlay: "attack_positional", metadata: { isOpponent: false, cornerSide: "left", setPieceOutcome: "play" } }),
    ev({ type: ActionType.SET_PIECE, originGrid: "Z2R", playerIds: ["l10"], metadata: { isOpponent: false, setPieceOrigin: "free_kick", setPieceOutcome: "play" } }),
    // ── 1ª parte, acciones del rival ──────────────────────────────────
    ev({ type: ActionType.SHOT, playerIds: ["r9", "lgk"], originGrid: "Z4C", destinationGrid: "G8",
      phaseOfPlay: "defense_organized", metadata: { isOpponent: true, setPiece: "normal", goalieResponse: GoalieAction.SAVE, targetGoalkeeperId: "lgk" } }),
    ev({ type: ActionType.GOAL, playerIds: ["r9", "lgk"], originGrid: "Z3C", destinationGrid: "G1",
      phaseOfPlay: "defense_transition", metadata: { isOpponent: true, setPiece: "penalty", targetGoalkeeperId: "lgk" }, scoreAtEvent: { team: 1, opponent: 1 } }),
    ev({ type: ActionType.LOSS, playerIds: ["r5"], originGrid: "Z2L", phaseOfPlay: "attack_transition", metadata: { isOpponent: true } }),
    ev({ type: ActionType.CORNER, originGrid: "Z4L", metadata: { isOpponent: true, cornerSide: "left", setPieceOutcome: "play" } }),
    ev({ type: ActionType.FOUL, playerIds: ["r9"], originGrid: "Z3R", metadata: { isOpponent: true } }),
    // ── 2ª parte ──────────────────────────────────────────────────────
    ev({ type: ActionType.SUBSTITUTION, period: Period.SECOND, playerIds: ["l4", "l10"], metadata: { isOpponent: false } }),
    ev({ type: ActionType.GOAL, period: Period.SECOND, playerIds: ["l10", "rgk"], originGrid: "Z4L", destinationGrid: "G7",
      phaseOfPlay: "attack_transition", metadata: { isOpponent: false, setPiece: "free_kick", targetGoalkeeperId: "rgk" }, scoreAtEvent: { team: 2, opponent: 1 } }),
    ev({ type: ActionType.SHOT, period: Period.SECOND, playerIds: ["l4", "rgk"], originGrid: "Z3R",
      phaseOfPlay: "attack_positional", metadata: { isOpponent: false, setPiece: "normal", shotOutcome: "blocked", goalieResponse: "UNSPECIFIED" } }),
    ev({ type: ActionType.SHOT, period: Period.SECOND, playerIds: ["r5", "lgk2"], originGrid: "Z2C", destinationGrid: "G3",
      phaseOfPlay: "defense_organized", metadata: { isOpponent: true, setPiece: "normal", goalieResponse: GoalieAction.SAVE_CATCH, targetGoalkeeperId: "lgk2" },
      onPitchPlayerIds: ["lgk2", "l7", "l4", "rgk", "r9", "r5"] }),
    // Gol EN PROPIA de un rival: sube a nuestro marcador y no es tiro suyo.
    ev({ type: ActionType.OWN_GOAL, period: Period.SECOND, playerIds: ["r5"], originGrid: "Z1C",
      metadata: { isOpponent: true }, scoreAtEvent: { team: 3, opponent: 1 } }),
    ev({ type: ActionType.STEAL, period: Period.SECOND, playerIds: ["l7"], originGrid: "Z1L", phaseOfPlay: "defense_transition", metadata: { isOpponent: false } }),
    ev({ type: ActionType.LOSS, period: Period.SECOND, playerIds: ["l4"], originGrid: "Z4C", phaseOfPlay: "attack_positional", metadata: { isOpponent: false } }),
    ev({ type: ActionType.YELLOW_CARD, period: Period.SECOND, playerIds: ["l7"], metadata: { isOpponent: false } }),
    ev({ type: ActionType.TIMEOUT, period: Period.SECOND, metadata: { isOpponent: false } }),
  ];
  return {
    teamName: "CD MURCIA",
    opponentName: "PR7",
    period: Period.FINISHED,
    matchClock: 1200000,
    isClockRunning: false,
    fouls: { team: 3, opponent: 2 },
    timeoutsUsed: {
      team: { period1: false, period2: true },
      opponent: { period1: false, period2: false },
    },
    teamDefendsAtKickoff: "left",
    timestamp: "2026-10-26T18:30:00.000Z",
    players: PLANTILLA,
    events: eventos,
    ...over,
  };
}

const IA_LARGO = Array.from(
  { length: 40 },
  (_, i) =>
    `## Apartado ${i + 1}\n\nPárrafo ${i + 1} del análisis interpretativo con suficiente longitud ` +
    `para que la división en páginas tenga que actuar y se pueda comprobar que no pierde ni duplica texto.\n\n` +
    `- Punto A del apartado ${i + 1}\n- Punto B del apartado ${i + 1}\n`,
).join("\n");

/**
 * Montar el dossier entero en jsdom cuesta segundos: son ~20 páginas con sus
 * pistas en SVG. Se renderiza UNA vez por variante de partido y se reutilizan
 * los nodos capturados — siguen siendo DOM válido aunque el contenedor ya se
 * haya desmontado, que es justo lo que estos tests comprueban.
 */
const cache = new Map<string, HTMLElement[]>();
let ultimoNombre = "";

async function dossier(clave: string, md: MatchData): Promise<HTMLElement[]> {
  const cacheado = cache.get(clave);
  if (cacheado) return cacheado;
  toJpegMock.mockClear();
  pdfSaveMock.mockClear();
  await exportFullMatchDossierPdf(md);
  ultimoNombre = (pdfSaveMock.mock.calls[0]?.[0] as string) ?? "";
  const nodos = toJpegMock.mock.calls.map((c) => c[0] as HTMLElement);
  cache.set(clave, nodos);
  return nodos;
}

const DENSO = "denso";
const DENSO_IA = "denso-ia";
const textosDe = (ns: HTMLElement[]) => ns.map((n) => n.textContent || "");
const unirTexto = (ns: HTMLElement[]) => textosDe(ns).join("\n");
const seccionesDe = (ns: HTMLElement[]) => ns.map((n) => n.getAttribute("data-dossier-section"));

const TIEMPO = 60_000;

let originalImage: typeof Image;

beforeEach(() => {
  generateTacticalReportMock.mockClear();
  streamTacticalReportMock.mockClear();
  // jsdom no decodifica imágenes: sin esto, el `await img.onload` de
  // `capturePagesToPdf` no resuelve nunca. Mismo doble que ya usa
  // `pdfExportService.test.tsx`; solo sustituye la rasterización.
  originalImage = window.Image;
  class FakeImage {
    width = 794;
    height = 1123;
    onload: (() => void) | null = null;
    set src(_v: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  // @ts-expect-error sustitución deliberada solo para el test
  window.Image = FakeImage;
});

afterEach(() => {
  window.Image = originalImage;
});

// ── 1 · ESTRUCTURA ──────────────────────────────────────────────────────

describe("1 · 34 · dos exportaciones distintas", () => {
  it("34 · el dossier es una función propia, no una variante del informe", () => {
    expect(exportFullMatchDossierPdf).toBeTypeOf("function");
    expect(exportMatchReportPdf).toBeTypeOf("function");
    expect(exportFullMatchDossierPdf).not.toBe(exportMatchReportPdf);
  });

  it("15 · el informe RESUMIDO sigue funcionando igual", async () => {
    pdfSaveMock.mockClear();
    await expect(
      exportMatchReportPdf(partidoDenso({ tacticalAnalysis: "## Corto\nTexto." })),
    ).resolves.not.toThrow();
    expect(pdfSaveMock).toHaveBeenCalledTimes(1);
    expect(pdfSaveMock.mock.calls[0][0]).toMatch(/^informe_/);
  }, TIEMPO);

  it("32 · el dossier se guarda con su nombre", async () => {
    await dossier(DENSO, partidoDenso());
    expect(ultimoNombre).toBe("dossier_completo_CD_MURCIA_PR7_2026-10-26.pdf");
  }, TIEMPO);

  it("y un partido sin fecha no rompe el nombre", () => {
    expect(dossierFileName(partidoDenso({ timestamp: undefined }))).toMatch(
      /^dossier_completo_CD_MURCIA_PR7_\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });

  it("33 · las páginas van numeradas y en orden, con su sección", async () => {
    const ns = await dossier(DENSO_IA, partidoDenso({ tacticalAnalysis: IA_LARGO }));
    const total = ns.length;
    textosDe(ns).forEach((t, i) => {
      expect(t, `página ${i + 1}`).toContain(`Página ${i + 1} de ${total}`);
    });
  }, TIEMPO);

  it("la portada declara el índice con las páginas reales", async () => {
    const md = partidoDenso();
    const ns = await dossier(DENSO, md);
    const portada = ns[0];
    expect(portada.getAttribute("data-dossier-cover")).not.toBeNull();
    const filas = Array.from(portada.querySelectorAll("[data-dossier-index] tr"));
    const indice = buildDossierIndex(buildDossierPages(md));
    expect(filas).toHaveLength(indice.length);
    expect(filas[0].textContent).toContain(indice[0].section);
    expect(filas[0].textContent).toContain("2");
  }, TIEMPO);

  it("el pie lleva el partido, el resultado y la sección", async () => {
    const ns = await dossier(DENSO, partidoDenso());
    for (const n of ns) {
      const pie = n.querySelector("[data-dossier-footer]");
      expect(pie).not.toBeNull();
      expect(pie!.textContent).toContain("CD MURCIA 3 – 1 PR7");
    }
  }, TIEMPO);

  it("buildDossierPages describe exactamente el documento", async () => {
    const md = partidoDenso();
    const ns = await dossier(DENSO, md);
    expect(ns).toHaveLength(buildDossierPages(md).length + 1);
    expect(generateMatchReport(md).score).toEqual({ team: 3, opponent: 1 });
  }, TIEMPO);
});

// ── 2 · TACTICAL PRO ────────────────────────────────────────────────────

describe("2 · 14-17-29-30 · Tactical Pro", () => {
  it("14 · exportar NO llama a Anthropic en ninguna de sus formas", async () => {
    await dossier(DENSO_IA, partidoDenso({ tacticalAnalysis: IA_LARGO }));
    expect(generateTacticalReportMock).not.toHaveBeenCalled();
    expect(streamTacticalReportMock).not.toHaveBeenCalled();
  }, TIEMPO);

  it("17-30 · el análisis entra ENTERO, sin perder ni duplicar texto", async () => {
    const ns = await dossier(DENSO_IA, partidoDenso({ tacticalAnalysis: IA_LARGO }));
    const iaPaginas = ns.filter((n) =>
      (n.getAttribute("data-dossier-section") || "").startsWith("tactical-"),
    );
    expect(iaPaginas.length).toBeGreaterThan(1); // de verdad se dividió
    const texto = unirTexto(ns);
    for (let i = 1; i <= 40; i++) {
      // Con límite por la derecha: «Apartado 1» no puede contar dentro de
      // «Apartado 10». Cada encabezado aparece UNA vez en todo el documento.
      const ocurrencias = (texto.match(new RegExp(`Apartado ${i}(?!\\d)`, "g")) ?? []).length;
      expect(ocurrencias, `apartado ${i}`).toBe(1);
    }
    // Y los párrafos tampoco se parten a mitad de frase.
    for (let i = 1; i <= 40; i++) {
      expect(texto, `párrafo ${i}`).toContain(`Punto B del apartado ${i}`);
    }
  }, TIEMPO);

  it("y se rotula como interpretación, sin sustituir a las cifras", async () => {
    const ns = await dossier(DENSO_IA, partidoDenso({ tacticalAnalysis: IA_LARGO }));
    expect(unirTexto(ns)).toContain(
      "Análisis interpretativo generado a partir de los datos registrados",
    );
  }, TIEMPO);

  it("29 · sin análisis no se crea ninguna página vacía, y la portada lo declara", async () => {
    const ns = await dossier(DENSO, partidoDenso({ tacticalAnalysis: undefined }));
    const iaPaginas = ns.filter((n) =>
      (n.getAttribute("data-dossier-section") || "").startsWith("tactical-"),
    );
    expect(iaPaginas).toHaveLength(0);
    expect(textosDe(ns)[0]).toContain(TACTICAL_MISSING_LABEL);
  }, TIEMPO);

  it("con análisis, la portada lo declara incluido", async () => {
    const ns = await dossier(DENSO_IA, partidoDenso({ tacticalAnalysis: IA_LARGO }));
    expect(textosDe(ns)[0]).toContain(TACTICAL_INCLUDED_LABEL);
    expect(hasTacticalAnalysis(partidoDenso({ tacticalAnalysis: "  " }))).toBe(false);
    expect(hasTacticalAnalysis(partidoDenso({ tacticalAnalysis: "x" }))).toBe(true);
  }, TIEMPO);

  it("1-2-9 · un análisis que solo está en MEMORIA sí sale en el PDF", async () => {
    // Es el caso del partido remoto: no hay copia local y la sincronización
    // puede incluso haber fallado. Basta con que esté en `matchData`.
    const enMemoria = { ...partidoDenso(), tacticalAnalysis: "## Desde remoto\nContenido único." };
    const ns = await dossier("memoria", enMemoria);
    expect(unirTexto(ns)).toContain("Contenido único.");
    expect(ultimoNombre).toMatch(/^dossier_completo_/);
  }, TIEMPO);
});

// ── 3 · MAPAS ───────────────────────────────────────────────────────────

describe("3 · 18-23 · todos los mapas", () => {
  it("18-19 · seis métricas por equipo, propias y rivales", async () => {
    const ns = await dossier(DENSO, partidoDenso());
    for (const lado of ["team", "rival"] as const) {
      const mapas = ns.flatMap((n) =>
        Array.from(n.querySelectorAll(`[data-dossier-map^="${lado}-"]`)),
      );
      expect(mapas, lado).toHaveLength(6);
      const claves = mapas.map((m) => m.getAttribute("data-dossier-map"));
      for (const m of DOSSIER_MAP_METRICS) {
        expect(claves, `${lado}-${m.key}`).toContain(`${lado}-${m.key}`);
      }
    }
  }, TIEMPO);

  it("26 · los totales de cada mapa coinciden con el servicio de zonas", async () => {
    const md = partidoDenso();
    const ns = await dossier(DENSO, md);
    for (const [lado, opponent] of [["team", false], ["rival", true]] as const) {
      const bucket = primaryBucket(buildZoneDashboard(md, opponent));
      for (const m of DOSSIER_MAP_METRICS) {
        const esperado = (bucket?.zones ?? []).reduce(
          (acc, z) => acc + zoneMetricValue(z, m.key),
          0,
        );
        const nodo = ns.flatMap((n) =>
          Array.from(n.querySelectorAll(`[data-dossier-map="${lado}-${m.key}"]`)),
        )[0];
        expect(nodo, `${lado}-${m.key}`).toBeTruthy();
        expect(nodo.textContent, `${lado}-${m.key}`).toContain(`· ${esperado}`);
        // Y lo que de verdad recibe la pista coincide con el servicio, no
        // solo el rótulo que escribe el dossier.
        const pista = nodo.querySelector("[data-pitch-counts]")!;
        expect(Number(pista.getAttribute("data-pitch-total")), `${lado}-${m.key}`).toBe(esperado);
      }
    }
  }, TIEMPO);

  it("la leyenda dice que la intensidad es volumen, no eficacia", async () => {
    const ns = await dossier(DENSO, partidoDenso());
    expect(unirTexto(ns)).toContain("No indica eficacia");
  }, TIEMPO);

  it("20 · mapas de tiros por parte para los dos equipos", async () => {
    const ns = await dossier(DENSO, partidoDenso());
    expect(seccionesDe(ns)).toContain("shots-periods-team");
    expect(seccionesDe(ns)).toContain("shots-periods-rival");
  }, TIEMPO);

  it("21 · pérdidas, recuperaciones y tiros por periodo, también del rival", async () => {
    const ns = await dossier(DENSO, partidoDenso());
    expect(seccionesDe(ns)).toContain("periods-team");
    expect(seccionesDe(ns)).toContain("periods-rival");
    const periodos = ns.filter((n) =>
      (n.getAttribute("data-dossier-section") || "").startsWith("periods-"),
    );
    for (const p of periodos) {
      const t = p.textContent || "";
      expect(t).toContain("Pérdidas");
      expect(t).toContain("Recuperaciones");
      expect(t).toContain("Tiros");
    }
  }, TIEMPO);

  it("22 · mapas por fase: total del partido y cada parte", async () => {
    const ns = await dossier(DENSO, partidoDenso());
    const fases = ns.filter((n) =>
      (n.getAttribute("data-dossier-section") || "").startsWith("phase-"),
    );
    expect(fases).toHaveLength(4); // pérdidas, recuperaciones, tiros, tiros rivales
    for (const p of fases) {
      const t = p.textContent || "";
      expect(t).toContain("Partido completo");
      expect(t).toContain("1ª parte");
      expect(t).toContain("2ª parte");
      expect(t).toContain("Cobertura de fase");
      expect(t).toContain("La fase es SIEMPRE la de CD MURCIA");
    }
  }, TIEMPO);

  it("23 · destinos de tiro de los dos equipos, con su explicación", async () => {
    const md = partidoDenso();
    const ns = await dossier(DENSO, md);
    const pagina = ns.find((n) => n.getAttribute("data-dossier-section") === "destinations")!;
    expect(pagina).toBeTruthy();
    expect(pagina.querySelector('[data-dossier-destination="team"]')).not.toBeNull();
    expect(pagina.querySelector('[data-dossier-destination="rival"]')).not.toBeNull();
    const t = pagina.textContent || "";
    expect(t).toContain("Sin destino registrado");
    expect(t).toContain("Fuera / desviado");
    expect(t).toContain("bloqueados");
    expect(t).toContain(`Intentos totales: ${buildZoneDashboard(md, false).totals.attempts}`);
  }, TIEMPO);
});

// ── 4 · RESTO DEL CONTENIDO ─────────────────────────────────────────────

describe("4 · 16-24-25 · informe, porteros y gol en propia", () => {
  it("16 · el dossier contiene el informe automático completo", async () => {
    const ns = await dossier(DENSO, partidoDenso());
    const t = unirTexto(ns);
    expect(t).toContain("Datos clave");
    expect(t).toContain("Jugadores utilizados y rotaciones");
    expect(t).toContain("Balón parado");
    expect(t).toContain("Acciones relevantes");
    expect(t).toContain("Contextos");
  }, TIEMPO);

  it("24 · una página por portero relevante, de los dos equipos", async () => {
    const md = partidoDenso();
    const ns = await dossier(DENSO, md);
    const porteros = buildGoalkeeperReports(md);
    expect(porteros.length).toBeGreaterThanOrEqual(2);
    for (const gk of porteros) {
      expect(seccionesDe(ns), gk.id).toContain(`gk-${gk.id}`);
    }
  }, TIEMPO);

  it("25 · el gol en propia no contamina tiros, goleadores ni mapas ofensivos", async () => {
    const md = partidoDenso();
    const ns = await dossier(DENSO, md);
    expect(scoreOf(md.events)).toEqual({ team: 3, opponent: 1 });
    const filaR5 = ns.flatMap((n) =>
      Array.from(n.querySelectorAll('[data-dossier-player="r5"]')),
    )[0];
    expect(filaR5).toBeTruthy();
    const celdas = Array.from(filaR5.querySelectorAll("td")).map((td) => td.textContent?.trim());
    expect(celdas[6]).toBe("0"); // columna «Goles»
    expect(buildZoneDashboard(md, true).totals.goals).toBe(1); // solo el gol legítimo
  }, TIEMPO);

  it("4.4 · la tabla de jugadores respeta la jerarquía nombre/dorsal", async () => {
    const ns = await dossier(DENSO, partidoDenso());
    expect(unirTexto(ns)).toContain("Juan Pérez");
    const filaR5 = ns.flatMap((n) =>
      Array.from(n.querySelectorAll('[data-dossier-player="r5"]')),
    )[0];
    const celdas = Array.from(filaR5.querySelectorAll("td")).map((td) => td.textContent?.trim());
    expect(celdas[0]).not.toBe("PJ RIVAL 2");
    expect(celdas[0]).toMatch(/^RIVAL /);
    expect(celdas[1]).toBe("?"); // dorsal todavía por conocer
  }, TIEMPO);
});

// ── 5 · COMPATIBILIDAD ──────────────────────────────────────────────────

describe("5 · 28 · partidos antiguos y casos límite", () => {
  it("28 · un partido SIN fase no genera páginas de fase", async () => {
    const base = partidoDenso();
    const sinFase = partidoDenso({
      events: base.events.map((e) => {
        const copia = { ...e } as any;
        delete copia.phaseOfPlay;
        return copia as GameEvent;
      }),
    });
    const ns = await dossier("sin-fase", sinFase);
    const fases = ns.filter((n) =>
      (n.getAttribute("data-dossier-section") || "").startsWith("phase-"),
    );
    expect(fases).toHaveLength(0);
  }, TIEMPO);

  it("un partido con rejilla histórica no inventa la perspectiva", async () => {
    const base = partidoDenso();
    const legacy = partidoDenso({
      events: base.events.map((e) => ({ ...e, originGrid: e.originGrid ? "B2" : undefined })),
    });
    const ns = await dossier("legacy", legacy);
    expect(unirTexto(ns)).toContain("rejilla histórica");
  }, TIEMPO);

  it("un partido vacío no rompe la exportación", async () => {
    pdfSaveMock.mockClear();
    await expect(
      exportFullMatchDossierPdf(partidoDenso({ events: [], players: [] })),
    ).resolves.not.toThrow();
    expect(pdfSaveMock).toHaveBeenCalledTimes(1);
  }, TIEMPO);

  it("31 · si falla la captura, el contenedor temporal se limpia igualmente", async () => {
    const antes = document.body.children.length;
    toJpegMock.mockRejectedValueOnce(new Error("toJpeg falló"));
    await expect(exportFullMatchDossierPdf(partidoDenso())).rejects.toThrow("toJpeg falló");
    expect(document.body.children.length).toBe(antes);
  }, TIEMPO);

  it("y tampoco deja contenedor cuando todo va bien", async () => {
    const antes = document.body.children.length;
    await exportFullMatchDossierPdf(partidoDenso({ events: [], players: [] }));
    expect(document.body.children.length).toBe(antes);
  }, TIEMPO);
});

// ── 5 bis · EL MODAL OFRECE LOS DOS ─────────────────────────────────────

describe("5 bis · 34 · dos botones distintos en el modal de exportación", () => {
  const modal = require("node:fs").readFileSync(
    require("node:path").resolve(__dirname, "../components/SimpleExportModal.tsx"),
    "utf-8",
  ) as string;

  it("cada exportación tiene su botón, su nombre y su descripción", () => {
    expect(modal).toContain("data-export-dossier");
    expect(modal).toContain("data-export-summary");
    expect(modal).toContain("Dossier completo (PDF)");
    expect(modal).toContain("Informe automático, Tactical Pro y todos los mapas registrados");
    expect(modal).toContain("Informe resumido (PDF)");
    expect(modal).toContain(
      "Datos principales, jugadores, porteros, mapas esenciales y Tactical Pro",
    );
    // Y el nombre antiguo, que prometía lo que no daba, ya no está.
    expect(modal).not.toContain("Informe completo (PDF)");
  });

  it("cada botón llama a SU exportador, no al mismo con una bandera", () => {
    expect(modal).toContain("exportFullMatchDossierPdf(matchData)");
    expect(modal).toContain("exportMatchReportPdf(matchData)");
  });

  it("y el modal no sabe nada de IA", () => {
    expect(modal).not.toContain("tacticalAnalysisService");
    expect(modal).not.toContain("tactical-pro");
  });
});

// ── 6 · SIN RECUENTOS PARALELOS ─────────────────────────────────────────

describe("6 · 27 · el exportador no filtra eventos por su cuenta", () => {
  const fuente = require("node:fs").readFileSync(
    require("node:path").resolve(__dirname, "./fullDossierPdfService.tsx"),
    "utf-8",
  ) as string;
  const codigo = fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

  it("no hay ni un `events.filter` ni predicados propios", () => {
    expect(codigo).not.toMatch(/events\s*\|\|\s*\[\]\)\.filter/);
    expect(codigo).not.toMatch(/\.events\.filter/);
    for (const prohibido of [
      "isShotAttempt",
      "isGoalEvent",
      "ZONE_PREDICATES",
      "scopedEvents",
      "e.type ===",
    ]) {
      expect(codigo, prohibido).not.toContain(prohibido);
    }
  });

  it("y toda cifra viene de los servicios compartidos", () => {
    for (const servicio of [
      "generateMatchReport",
      "buildZoneDashboard",
      "buildGoalkeeperReports",
      "playerShotTallies",
      "countRotations",
      "zoneMetricValue",
    ]) {
      expect(codigo, servicio).toContain(servicio);
    }
  });

  it("y no importa nada de IA", () => {
    expect(codigo).not.toContain("tacticalAnalysisService");
    expect(codigo).not.toContain("/api/tactical-pro");
    expect(codigo).not.toContain("fetch(");
  });
});
