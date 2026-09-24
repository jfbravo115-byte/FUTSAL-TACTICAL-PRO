// @vitest-environment jsdom
/**
 * Tests de integración de pdfExportService. Se separa explícitamente:
 * - construcción de datos/plantilla: React real, DOM real (jsdom) — se
 *   ejerce de verdad, incluido el escapado automático de JSX;
 * - efecto final de captura/descarga: MOCKEADO (html-to-image, jsPDF) —
 *   jsdom no puede rasterizar canvas real, así que se sustituye esa capa
 *   por un doble de prueba, tal como pide el encargo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Period, Role, ActionType, GoalieAction, MatchData, Player, GameEvent } from "../types/futsal";
import { formatAnyZoneLabel } from "../utils/legacyZoneMap";
import { ZONE_12_IDS, formatZoneLabel } from "../utils/fieldZones";

const toJpegMock = vi.fn(async (_node?: HTMLElement) => "data:image/jpeg;base64," + "A".repeat(2000));
vi.mock("html-to-image", () => ({
  toJpeg: (node: HTMLElement) => toJpegMock(node),
}));

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

// Tactical Pro NUNCA debe llamarse durante exportación — si algún día se
// importara por error en pdfExportService.tsx, este mock lo detectaría
// (el test de "0 llamadas AI" comprueba explícitamente que sigue sin uso).
const generateTacticalReportMock = vi.fn();
vi.mock("./tacticalAnalysisService", () => ({
  generateTacticalReport: (...args: any[]) => generateTacticalReportMock(...args),
}));

import { exportMatchReportPdf, exportGoalkeeperReportPdf, splitTacticalProIntoPages } from "./pdfExportService";
import { generateMatchReport } from "./matchReportService";
import { buildZoneDashboard, primaryBucket } from "./matchZonesService";

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    number: 7,
    name: "Juan",
    role: Role.PLAYER,
    isOnPitch: true,
    plusMinus: 0,
    individualTimeSeconds: 600,
    isOpponent: false,
    stats: {
      goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
      fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
    },
    ...overrides,
  };
}

function event(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    id: `e-${Math.random()}`,
    timestamp: 0,
    wallClock: 0,
    period: Period.FIRST,
    playerIds: [],
    type: ActionType.GOAL,
    gameState: "4vs4" as any,
    ...overrides,
  };
}

/**
 * Las cinco cifras de una fila de la matriz de zonas, por su etiqueta.
 *
 * Se localiza por el texto que ve el usuario —nunca por el id interno— y se
 * devuelven las celdas numéricas en el orden de la cabecera:
 * Pérd. · Recup. · Tiros · Faltas · Total.
 */
function filaMatriz(pageNode: HTMLElement, label: string): string[] {
  const fila = Array.from(pageNode.querySelectorAll("tr")).find(
    (tr) => (tr.querySelector("td")?.textContent || "").trim() === label,
  );
  if (!fila) throw new Error(`No hay fila de matriz para "${label}"`);
  return Array.from(fila.querySelectorAll("td"))
    .slice(1)
    .map((td) => (td.textContent || "").trim());
}

/** ¿Qué filas de la matriz están resaltadas como zona más activa? */
function filasResaltadas(pageNode: HTMLElement): string[] {
  return Array.from(pageNode.querySelectorAll('tr[data-most-active="true"]')).map(
    (tr) => (tr.querySelector("td")?.textContent || "").trim(),
  );
}

function matchData(overrides: Partial<MatchData> = {}): MatchData {
  return {
    teamName: "Mi Equipo",
    opponentName: "Rival CF",
    period: Period.SECOND,
    matchClock: 1234,
    isClockRunning: false,
    fouls: { team: 1, opponent: 2 },
    timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
    players: [player()],
    events: [],
    ...overrides,
  };
}

// Helpers para leer el mapa de origen del portero.
//
// FASE 3: las celdas ya NO muestran el identificador interno (A1, Z2C...).
// Se localizan por su etiqueta accesible, que es exactamente el texto que ve
// el usuario, y el contenido de la celda es únicamente el conteo (vacío si
// es cero). Esto es deliberado: si algún día volviera a colarse un código
// interno en pantalla, estos tests lo detectarían por el test de más abajo.
function findZoneCell(pageNode: HTMLElement, zoneId: string): HTMLElement {
  const label = formatAnyZoneLabel(zoneId);
  const cell = pageNode.querySelector(`[aria-label="${label}"]`);
  if (!cell) throw new Error(`zona ${zoneId} ("${label}") no encontrada en la página`);
  return cell as HTMLElement;
}

function zoneCellCount(cell: HTMLElement): number {
  const text = (cell.textContent || "").trim();
  return text ? Number(text) : 0;
}

let windowOpenSpy: ReturnType<typeof vi.spyOn>;
let originalImage: typeof Image;

beforeEach(() => {
  toJpegMock.mockClear();
  pdfSaveMock.mockClear();
  addImageMock.mockClear();
  generateTacticalReportMock.mockClear();
  windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  // jsdom no decodifica imágenes reales: se sustituye Image por una que
  // dispara onload de inmediato, igual que haría un navegador real con
  // una imagen válida — solo se está mockeando la rasterización, no la
  // lógica de negocio que se está probando.
  originalImage = window.Image;
  class FakeImage {
    width = 100;
    height = 100;
    onload: (() => void) | null = null;
    set src(_v: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  // @ts-expect-error sustitución deliberada solo para el test
  window.Image = FakeImage;
});

afterEach(() => {
  windowOpenSpy.mockRestore();
  window.Image = originalImage;
  document.body.innerHTML = "";
});

describe("exportMatchReportPdf", () => {
  // 2. informe completo con datos
  it("genera el PDF con datos completos (equipo con jugadores, zonas, goles)", async () => {
    const md = matchData({
      players: [player(), player({ id: "gk1", number: 1, role: Role.GOALKEEPER })],
      events: [event({ type: ActionType.GOAL, playerIds: ["p1"], originGrid: "Z2C" })],
    });
    await exportMatchReportPdf(md);
    expect(pdfSaveMock).toHaveBeenCalledTimes(1);
    expect(pdfSaveMock.mock.calls[0][0]).toMatch(/^informe_Mi_Equipo_\d+\.pdf$/);
    // resumen/zonas + evolución por periodos + jugadores + situaciones
    // especiales + eventos. La de periodos aparece porque el gol lleva sector.
    expect(toJpegMock).toHaveBeenCalledTimes(6);
    const titulos = toJpegMock.mock.calls.map((c) => (c[0] as HTMLElement).textContent || "");
    expect(titulos.some((t) => t.includes("Evolución por periodos"))).toBe(true);
  });

  // 3. sin Tactical Pro
  it("sin tacticalAnalysis: no lanza, genera el PDF igualmente", async () => {
    const md = matchData({ tacticalAnalysis: undefined });
    await expect(exportMatchReportPdf(md)).resolves.not.toThrow();
    expect(pdfSaveMock).toHaveBeenCalledTimes(1);
  });

  // 4. con Tactical Pro
  it("con tacticalAnalysis presente, se renderiza sin error", async () => {
    const md = matchData({ tacticalAnalysis: "## Análisis\nEl equipo dominó la posesión." });
    await expect(exportMatchReportPdf(md)).resolves.not.toThrow();
  });

  // 5. Tactical Pro escapado / 9. nombre malicioso
  it("tacticalAnalysis y nombres con HTML/script no rompen el render (React escapa por defecto)", async () => {
    const md = matchData({
      teamName: '<script>alert(1)</script>',
      tacticalAnalysis: '<img src=x onerror="alert(1)"> texto',
      players: [player({ name: '<script>alert(2)</script>' })],
    });
    await expect(exportMatchReportPdf(md)).resolves.not.toThrow();
    expect(pdfSaveMock).toHaveBeenCalledTimes(1);
  });

  // 6. 0 llamadas AI
  it("exportar nunca invoca generateTacticalReport ni abre ninguna ventana", async () => {
    const md = matchData({ tacticalAnalysis: "análisis ya guardado" });
    await exportMatchReportPdf(md);
    expect(generateTacticalReportMock).not.toHaveBeenCalled();
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  // 7. sin logos
  it("sin teamLogo/opponentLogo no lanza (renderizado condicional)", async () => {
    const md = matchData({ teamLogo: undefined, opponentLogo: undefined });
    await expect(exportMatchReportPdf(md)).resolves.not.toThrow();
  });

  // 8. caracteres españoles/acentos
  it("nombres con acentos/ñ se renderizan sin error", async () => {
    const md = matchData({ teamName: "Peña Deportiva Muñoz", opponentName: "Ñuñoa FC" });
    await expect(exportMatchReportPdf(md)).resolves.not.toThrow();
  });

  // 10. partido legacy
  it("partido legacy sin rotationTimeSeconds/tacticalAnalysis/logos no lanza", async () => {
    const legacyPlayer = player();
    delete (legacyPlayer as any).rotationTimeSeconds;
    const md = matchData({ players: [legacyPlayer], tacticalAnalysis: undefined, teamLogo: undefined });
    await expect(exportMatchReportPdf(md)).resolves.not.toThrow();
  });

  // 11. arrays vacíos
  it("partido totalmente vacío (sin jugadores ni eventos) no lanza", async () => {
    const md = matchData({ players: [], events: [] });
    await expect(exportMatchReportPdf(md)).resolves.not.toThrow();
  });

  // 16. mapas sin datos / 17. eventos sin originGrid / 18. sin destinationGrid
  it("eventos sin originGrid/destinationGrid muestran 'sin datos' en vez de romper", async () => {
    const md = matchData({
      events: [event({ type: ActionType.SHOT, playerIds: ["p1"] })], // sin originGrid ni destinationGrid
    });
    await expect(exportMatchReportPdf(md)).resolves.not.toThrow();
  });
});

describe("exportGoalkeeperReportPdf", () => {
  // 13. un portero
  it("un portero genera 1 página y descarga el PDF de porteros", async () => {
    const md = matchData({ players: [player({ id: "gk1", role: Role.GOALKEEPER, number: 1 })] });
    await exportGoalkeeperReportPdf(md);
    expect(pdfSaveMock.mock.calls[0][0]).toMatch(/^porteros_Mi_Equipo_\d+\.pdf$/);
    expect(toJpegMock).toHaveBeenCalledTimes(1);
  });

  // 14. dos porteros
  it("dos porteros generan 2 páginas", async () => {
    const md = matchData({
      players: [
        player({ id: "gk1", role: Role.GOALKEEPER, number: 1 }),
        player({ id: "gk2", role: Role.GOALKEEPER, number: 13, isOnPitch: false }),
      ],
    });
    await exportGoalkeeperReportPdf(md);
    expect(toJpegMock).toHaveBeenCalledTimes(2);
  });

  // 15. portero sustituido
  it("un portero sustituido (isOnPitch=false pero con minutos) se incluye igualmente", async () => {
    const md = matchData({ players: [player({ id: "gk1", role: Role.GOALKEEPER, isOnPitch: false, individualTimeSeconds: 400 })] });
    await expect(exportGoalkeeperReportPdf(md)).resolves.not.toThrow();
    expect(toJpegMock).toHaveBeenCalledTimes(1);
  });

  it("sin ningún portero con datos, lanza un error claro y NO genera PDF", async () => {
    const md = matchData({ players: [player({ role: Role.PLAYER })] });
    await expect(exportGoalkeeperReportPdf(md)).rejects.toThrow(/porteros/i);
    expect(pdfSaveMock).not.toHaveBeenCalled();
  });

  // 22. generación de informe de porteros independiente
  it("es independiente del informe completo (no requiere haberlo generado antes)", async () => {
    const md = matchData({ players: [player({ id: "gk1", role: Role.GOALKEEPER })] });
    await exportGoalkeeperReportPdf(md);
    expect(pdfSaveMock.mock.calls[0][0]).toContain("porteros_");
    expect(generateTacticalReportMock).not.toHaveBeenCalled();
  });

  it("0 llamadas AI también en el informe de porteros", async () => {
    const md = matchData({
      players: [player({ id: "gk1", role: Role.GOALKEEPER })],
      tacticalAnalysis: "ya guardado",
    });
    await exportGoalkeeperReportPdf(md);
    expect(generateTacticalReportMock).not.toHaveBeenCalled();
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });
});

// Problema 1 de la revisión externa: el mapa de ORIGEN del portero debe
// recibir matchData.events COMPLETO (no gk.events, ya filtrado a solo
// eventos propios), para poder contabilizar disparos del rival mientras
// el portero está en pista — igual que la lógica original de MatchTracker.
describe("GoalkeeperOriginMap recibe el conjunto completo de eventos (problema 1)", () => {
  it("cuenta un SHOT del rival con originGrid aunque el evento no contenga el id del portero", async () => {
    const md = matchData({
      players: [player({ id: "gk1", role: Role.GOALKEEPER, number: 1, isOpponent: false, isOnPitch: true })],
      events: [
        // Evento del RIVAL: no lleva "gk1" en playerIds. gk.events (filtrado
        // a playerIds.includes) NO incluiría este evento — el mapa de
        // origen debe recibir matchData.events completo para contabilizarlo.
        event({ type: ActionType.SHOT, playerIds: ["rival-1"], originGrid: "Z2C", metadata: { isOpponent: true } }),
      ],
    });
    await exportMatchReportPdf(md);
    // Páginas: 0=resumen/zonas, 1=jugadores, 2=portero (único GK, sin
    // eventos relevantes de tipo GOAL/RED_CARD/GOAL_CONCEDED -> sin página
    // de eventos adicional).
    const gkPageNode = toJpegMock.mock.calls[2][0] as HTMLElement;
    // El conteo de la celda debe reflejar el disparo rival contabilizado.
    expect(zoneCellCount(findZoneCell(gkPageNode, "Z2C"))).toBe(1);
  });

  it("sin ningún evento con originGrid relevante, el mapa de origen muestra 'Sin datos registrados'", async () => {
    const md = matchData({
      players: [player({ id: "gk1", role: Role.GOALKEEPER, number: 1 })],
      events: [],
    });
    await exportMatchReportPdf(md);
    const gkPageNode = toJpegMock.mock.calls[2][0] as HTMLElement;
    expect(gkPageNode.textContent).toContain("Sin datos registrados");
  });

  // ════════════════════════════════════════════════════════════════
  // ATRIBUCIÓN TEMPORAL (revisión final): con 2+ porteros del mismo
  // equipo, un disparo rival solo debe atribuirse al mapa del portero
  // que REALMENTE estaba en pista en ese momento (onPitchPlayerIds del
  // propio evento), no al que tiene isOnPitch=true al FINAL del partido.
  // ════════════════════════════════════════════════════════════════

  // 1. Dos porteros, cada evento con su propio onPitchPlayerIds.
  it("1: con 2 porteros, cada mapa cuenta únicamente los disparos rivales en los que su onPitchPlayerIds coincide", async () => {
    const md = matchData({
      players: [
        player({ id: "gk1", role: Role.GOALKEEPER, number: 1, isOpponent: false, isOnPitch: false, individualTimeSeconds: 600 }),
        player({ id: "gk2", role: Role.GOALKEEPER, number: 2, isOpponent: false, isOnPitch: true, individualTimeSeconds: 600 }),
      ],
      events: [
        event({ type: ActionType.SHOT, playerIds: ["rival-1"], originGrid: "Z1L", metadata: { isOpponent: true }, onPitchPlayerIds: ["gk1"] }),
        event({ type: ActionType.SHOT, playerIds: ["rival-2"], originGrid: "Z3R", metadata: { isOpponent: true }, onPitchPlayerIds: ["gk2"] }),
      ],
    });
    await exportGoalkeeperReportPdf(md); // 1 página por portero, en orden de dorsal: gk1, gk2
    const gk1Page = toJpegMock.mock.calls[0][0] as HTMLElement;
    const gk2Page = toJpegMock.mock.calls[1][0] as HTMLElement;

    expect(zoneCellCount(findZoneCell(gk1Page, "Z1L"))).toBe(1);
    expect(zoneCellCount(findZoneCell(gk1Page, "Z3R"))).toBe(0);

    expect(zoneCellCount(findZoneCell(gk2Page, "Z3R"))).toBe(1);
    expect(zoneCellCount(findZoneCell(gk2Page, "Z1L"))).toBe(0);
  });

  // 2. Portero sustituido (isOnPitch=false ahora), pero el evento
  // histórico sí lo marca en onPitchPlayerIds -> debe contabilizarse.
  it("2: portero sustituido (isOnPitch=false actual) SÍ cuenta un evento histórico donde onPitchPlayerIds lo incluye", async () => {
    const md = matchData({
      players: [
        player({ id: "gk1", role: Role.GOALKEEPER, number: 1, isOpponent: false, isOnPitch: false, individualTimeSeconds: 600 }),
        player({ id: "gk2", role: Role.GOALKEEPER, number: 2, isOpponent: false, isOnPitch: true, individualTimeSeconds: 600 }),
      ],
      events: [
        event({ type: ActionType.SHOT, playerIds: ["rival-1"], originGrid: "Z2L", metadata: { isOpponent: true }, onPitchPlayerIds: ["gk1"] }),
      ],
    });
    await exportGoalkeeperReportPdf(md);
    const gk1Page = toJpegMock.mock.calls[0][0] as HTMLElement; // sustituido, pero el evento es suyo
    expect(zoneCellCount(findZoneCell(gk1Page, "Z2L"))).toBe(1);
  });

  // 3. Portero actualmente en pista (isOnPitch=true), pero un evento
  // antiguo NO lo incluye en onPitchPlayerIds -> NO debe contabilizarse.
  it("3: portero actualmente en pista (isOnPitch=true) NO cuenta un evento antiguo cuyo onPitchPlayerIds no lo incluye", async () => {
    const md = matchData({
      players: [
        player({ id: "gk1", role: Role.GOALKEEPER, number: 1, isOpponent: false, isOnPitch: false, individualTimeSeconds: 600 }),
        player({ id: "gk2", role: Role.GOALKEEPER, number: 2, isOpponent: false, isOnPitch: true, individualTimeSeconds: 600 }),
      ],
      events: [
        // Evento de la 1ª parte, cuando jugaba gk1 — gk2 NO estaba en pista.
        event({ type: ActionType.SHOT, playerIds: ["rival-1"], originGrid: "Z1C", metadata: { isOpponent: true }, onPitchPlayerIds: ["gk1"] }),
      ],
    });
    await exportGoalkeeperReportPdf(md);
    const gk2Page = toJpegMock.mock.calls[1][0] as HTMLElement; // isOnPitch=true actualmente
    expect(zoneCellCount(findZoneCell(gk2Page, "Z1C"))).toBe(0);
  });

  // 4. Evento propio del portero (playerIds lo incluye) sigue contando
  // siempre, sin depender de onPitchPlayerIds.
  it("4: un evento propio del portero se cuenta, ESPEJADO a la perspectiva del atacante", async () => {
    const md = matchData({
      players: [
        player({ id: "gk1", role: Role.GOALKEEPER, number: 1, isOpponent: false, isOnPitch: true, individualTimeSeconds: 600 }),
        player({ id: "gk2", role: Role.GOALKEEPER, number: 2, isOpponent: false, isOnPitch: false, individualTimeSeconds: 600 }),
      ],
      events: [
        event({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"], originGrid: "Z3C" }),
      ],
    });
    await exportGoalkeeperReportPdf(md);
    const gk1Page = toJpegMock.mock.calls[0][0] as HTMLElement;
    // FASE 4 — corrección de perspectivas. La parada se guardó en la
    // perspectiva del PORTERO (Z3C); el mapa responde a "¿desde dónde me
    // tiran?", así que se muestra en la del ATACANTE: Z2C.
    expect(zoneCellCount(findZoneCell(gk1Page, "Z2C"))).toBe(1);
    expect(zoneCellCount(findZoneCell(gk1Page, "Z3C"))).toBe(0);
  });

  // 5. Legacy sin onPitchPlayerIds + un ÚNICO portero relevante: sin
  // ambigüedad posible -> se mantiene el fallback legacy razonable.
  it("5: evento legacy sin onPitchPlayerIds, con un único portero relevante, se cuenta (fallback legacy)", async () => {
    const md = matchData({
      players: [player({ id: "gk1", role: Role.GOALKEEPER, number: 1, isOpponent: false, isOnPitch: true })],
      events: [
        event({ type: ActionType.SHOT, playerIds: ["rival-1"], originGrid: "Z2R", metadata: { isOpponent: true } }), // sin onPitchPlayerIds
      ],
    });
    await exportGoalkeeperReportPdf(md);
    const gk1Page = toJpegMock.mock.calls[0][0] as HTMLElement;
    expect(zoneCellCount(findZoneCell(gk1Page, "Z2R"))).toBe(1);
  });

  // 6. Legacy sin onPitchPlayerIds + DOS porteros: ambiguo -> NO se
  // atribuye a ninguno de los dos (mejor infra-contar que mal-atribuir).
  it("6: evento legacy sin onPitchPlayerIds, con dos porteros, NO se atribuye a ninguno de los dos", async () => {
    const md = matchData({
      players: [
        player({ id: "gk1", role: Role.GOALKEEPER, number: 1, isOpponent: false, isOnPitch: false, individualTimeSeconds: 600 }),
        player({ id: "gk2", role: Role.GOALKEEPER, number: 2, isOpponent: false, isOnPitch: true, individualTimeSeconds: 600 }),
      ],
      events: [
        event({ type: ActionType.SHOT, playerIds: ["rival-1"], originGrid: "Z3L", metadata: { isOpponent: true } }), // sin onPitchPlayerIds, ambiguo
      ],
    });
    await exportGoalkeeperReportPdf(md);
    const gk1Page = toJpegMock.mock.calls[0][0] as HTMLElement;
    const gk2Page = toJpegMock.mock.calls[1][0] as HTMLElement;
    expect(zoneCellCount(findZoneCell(gk1Page, "Z3L"))).toBe(0);
    expect(zoneCellCount(findZoneCell(gk2Page, "Z3L"))).toBe(0);
  });
});

// C. informe con 2 porteros genera páginas independientes (ninguna se
// amontona: cada portero + cada bloque de Tactical Pro es una página).
describe("paginación dinámica — punto 2 de la revisión", () => {
  it("C: informe COMPLETO con 2 porteros genera una página por portero, sin amontonar", async () => {
    const md = matchData({
      players: [
        player(),
        player({ id: "gk1", role: Role.GOALKEEPER, number: 1 }),
        player({ id: "gk2", role: Role.GOALKEEPER, number: 13, isOnPitch: false, individualTimeSeconds: 300 }),
      ],
    });
    await exportMatchReportPdf(md);
    // resumen/zonas + jugadores + gk1 + gk2 = 4 páginas (sin Tactical, sin eventos)
    expect(toJpegMock).toHaveBeenCalledTimes(4);
  });

  it("sin porteros, sin Tactical, sin eventos: exactamente 2 páginas (resumen + jugadores)", async () => {
    const md = matchData({ players: [player()] });
    await exportMatchReportPdf(md);
    expect(toJpegMock).toHaveBeenCalledTimes(2);
  });

  it("1 portero, sin Tactical, sin eventos: exactamente 3 páginas", async () => {
    const md = matchData({ players: [player(), player({ id: "gk1", role: Role.GOALKEEPER })] });
    await exportMatchReportPdf(md);
    expect(toJpegMock).toHaveBeenCalledTimes(3);
  });

  // D. Tactical Pro crea página independiente (no se amontona con jugadores/porteros).
  it("D: Tactical Pro corto añade exactamente 1 página independiente", async () => {
    const md = matchData({
      players: [player()],
      tacticalAnalysis: "Un análisis breve de una sola línea.",
    });
    await exportMatchReportPdf(md);
    // resumen/zonas + jugadores + 1 página de Tactical Pro = 3
    expect(toJpegMock).toHaveBeenCalledTimes(3);
  });

  it("2 porteros + Tactical Pro corto: 5 páginas (resumen+jugadores+gk1+gk2+tactical)", async () => {
    const md = matchData({
      players: [
        player(),
        player({ id: "gk1", role: Role.GOALKEEPER, number: 1 }),
        player({ id: "gk2", role: Role.GOALKEEPER, number: 13, isOnPitch: false, individualTimeSeconds: 300 }),
      ],
      tacticalAnalysis: "Análisis breve.",
    });
    await exportMatchReportPdf(md);
    expect(toJpegMock).toHaveBeenCalledTimes(5);
  });

  // E. Tactical Pro largo no se trunca silenciosamente: se reparte en
  // varias páginas, todo el texto se conserva íntegro.
  it("E: Tactical Pro largo (varios párrafos, supera el presupuesto por página) se divide en más de 1 página, sin perder texto", () => {
    const parrafos = Array.from({ length: 20 }, (_, i) => `Párrafo número ${i + 1}. `.repeat(30).trim());
    const largo = parrafos.join("\n\n");
    const chunks = splitTacticalProIntoPages(largo);
    expect(chunks.length).toBeGreaterThan(1);
    // Ningún carácter se pierde: unir todos los bloques reconstruye el original.
    expect(chunks.join("\n\n")).toBe(largo);
  });

  // Un único párrafo >10.000 caracteres YA NO se deja entero (eso podía
  // hacer que capturePagesToPdf comprimiera una captura mucho más alta
  // que A4 en una sola página, dejando el texto ilegible sin truncarlo).
  // Ahora se subdivide también por frases/palabras.
  it("E: un único párrafo >10.000 caracteres genera varias páginas (ya no se deja entero)", () => {
    const parrafoGigante = "Frase larga repetida con contenido táctico relevante. ".repeat(200); // sin dobles saltos de línea
    expect(parrafoGigante.length).toBeGreaterThan(10000);
    const chunks = splitTacticalProIntoPages(parrafoGigante);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("E: concatenando los chunks de un párrafo gigante se conserva todo el contenido textual (mismas palabras, mismo orden)", () => {
    const parrafoGigante = "Frase larga repetida con contenido táctico relevante. ".repeat(200);
    const chunks = splitTacticalProIntoPages(parrafoGigante);
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(normalize(chunks.join(" "))).toBe(normalize(parrafoGigante));
  });

  it("E: ningún chunk generado a partir de un párrafo largo excede el límite definido (3200 caracteres)", () => {
    const parrafoGigante = "Frase larga repetida con contenido táctico relevante. ".repeat(200);
    const chunks = splitTacticalProIntoPages(parrafoGigante);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(3200));
  });

  it("E: incluso una única 'frase' sin puntuación que por sí sola supera el límite se divide por palabras, sin cortar ninguna a mitad", () => {
    const sinPuntuacion = Array.from({ length: 2000 }, (_, i) => `palabra${i}`).join(" "); // >10000 chars, sin . ! ? :
    const chunks = splitTacticalProIntoPages(sinPuntuacion);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(3200));
    // Ninguna palabra se corte a mitad: cada chunk empieza y termina en un límite de palabra completo.
    chunks.forEach((c) => {
      c.split(" ").forEach((w) => expect(/^palabra\d+$/.test(w)).toBe(true));
    });
  });

  // Tactical Pro corto sigue generando una sola página.
  it("E: Tactical Pro corto (por debajo del límite) sigue generando exactamente 1 página", () => {
    const corto = "Un análisis breve de una sola línea, muy por debajo del límite por página.";
    const chunks = splitTacticalProIntoPages(corto);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(corto);
  });

  it("Tactical Pro largo en la exportación real genera varias páginas de Tactical Pro (no se escala ni se pierde)", async () => {
    const parrafos = Array.from({ length: 20 }, (_, i) => `Párrafo número ${i + 1}. `.repeat(30));
    const md = matchData({ players: [player()], tacticalAnalysis: parrafos.join("\n\n") });
    const chunks = splitTacticalProIntoPages(md.tacticalAnalysis!);
    await exportMatchReportPdf(md);
    // resumen/zonas + jugadores + N páginas de Tactical Pro (N = chunks.length)
    expect(toJpegMock).toHaveBeenCalledTimes(2 + chunks.length);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("Tactical Pro >10.000 caracteres en un único párrafo, en la exportación real, genera varias páginas de Tactical Pro", async () => {
    const parrafoGigante = "Frase larga repetida con contenido táctico relevante. ".repeat(200);
    const md = matchData({ players: [player()], tacticalAnalysis: parrafoGigante });
    const chunks = splitTacticalProIntoPages(md.tacticalAnalysis!);
    expect(chunks.length).toBeGreaterThan(1);
    await exportMatchReportPdf(md);
    expect(toJpegMock).toHaveBeenCalledTimes(2 + chunks.length);
  });

  it("splitTacticalProIntoPages con texto vacío no genera páginas", () => {
    expect(splitTacticalProIntoPages("")).toEqual([]);
    expect(splitTacticalProIntoPages("   ")).toEqual([]);
  });
});

// H / I. Limpieza del DOM incluso si falla la captura o el guardado.
describe("cleanup del contenedor fuera de pantalla ante errores", () => {
  it("H: si toJpeg lanza, el contenedor offscreen se limpia igualmente y el error se propaga", async () => {
    toJpegMock.mockRejectedValueOnce(new Error("fallo de captura simulado"));
    const md = matchData({ players: [player()] });
    const before = document.body.childElementCount;
    await expect(exportMatchReportPdf(md)).rejects.toThrow(/fallo de captura simulado/);
    expect(document.body.childElementCount).toBe(before);
    expect(pdfSaveMock).not.toHaveBeenCalled();
  });

  it("I: si pdf.save lanza, el contenedor offscreen se limpia igualmente y el error se propaga", async () => {
    pdfSaveMock.mockImplementationOnce(() => {
      throw new Error("fallo de guardado simulado");
    });
    const md = matchData({ players: [player()] });
    const before = document.body.childElementCount;
    await expect(exportMatchReportPdf(md)).rejects.toThrow(/fallo de guardado simulado/);
    expect(document.body.childElementCount).toBe(before);
  });

  it("H/I: lo mismo aplica al informe de porteros (toJpeg y pdf.save)", async () => {
    const md = matchData({ players: [player({ id: "gk1", role: Role.GOALKEEPER })] });
    const before = document.body.childElementCount;

    toJpegMock.mockRejectedValueOnce(new Error("captura porteros falló"));
    await expect(exportGoalkeeperReportPdf(md)).rejects.toThrow(/captura porteros falló/);
    expect(document.body.childElementCount).toBe(before);

    pdfSaveMock.mockImplementationOnce(() => {
      throw new Error("guardado porteros falló");
    });
    await expect(exportGoalkeeperReportPdf(md)).rejects.toThrow(/guardado porteros falló/);
    expect(document.body.childElementCount).toBe(before);
  });
});

// ── FASE 3: PISTA DE 12 ZONAS EN LOS INFORMES ─────────────────────────
describe("Informes sobre la pista de 12 zonas", () => {
  /** Texto completo de la página de resumen/zonas (índice 0). */
  async function summaryText(md: MatchData): Promise<string> {
    await exportMatchReportPdf(md);
    const page = toJpegMock.mock.calls[0][0] as HTMLElement;
    return page.textContent || "";
  }

  it("dibuja la pista con los 12 sectores y sus etiquetas de usuario", async () => {
    const md = matchData({
      events: [event({ type: ActionType.LOSS, playerIds: ["p1"], originGrid: "Z2C" })],
    });
    await exportMatchReportPdf(md);
    const page = toJpegMock.mock.calls[0][0] as HTMLElement;

    for (const id of ZONE_12_IDS) {
      const cell = page.querySelector(`[aria-label="${formatZoneLabel(id)}"]`);
      expect(cell).toBeTruthy();
    }
    expect(zoneCellCount(findZoneCell(page, "Z2C"))).toBe(1);
  });

  it("NINGÚN código interno de zona llega al informe", async () => {
    const md = matchData({
      events: [
        event({ type: ActionType.SHOT, playerIds: ["p1"], originGrid: "Z1L", destinationGrid: "G5" }),
        event({ type: ActionType.LOSS, playerIds: ["p1"], originGrid: "Z3R" }),
        event({ type: ActionType.FOUL, playerIds: ["p1"], originGrid: "Z2C" }),
      ],
    });
    const text = await summaryText(md);

    // Ni la rejilla histórica, ni los sectores nuevos, ni la portería.
    expect(text).not.toMatch(/\b[ABC][123]\b/);
    expect(text).not.toMatch(/Z[1-4][LCR]/);
    expect(text).not.toMatch(/\bG[1-9]\b/);
    // Y sí las etiquetas legibles.
    expect(text).toContain("Zona 1 · izquierda");
  });

  it("las pérdidas llegan a la página desglosadas por zona, ahora en la matriz", async () => {
    // Antes esto se imprimía en prosa: «Zona 2: 3 pérdidas — 2 derecha, 1
    // centro». La matriz dice lo mismo y además nombra el carril a cero.
    const md = matchData({
      events: [
        event({ type: ActionType.LOSS, playerIds: ["p1"], originGrid: "Z2R" }),
        event({ type: ActionType.LOSS, playerIds: ["p1"], originGrid: "Z2R" }),
        event({ type: ActionType.LOSS, playerIds: ["p1"], originGrid: "Z2C" }),
      ],
    });
    await exportMatchReportPdf(md);
    const page = toJpegMock.mock.calls[0][0] as HTMLElement;
    expect(filaMatriz(page, "Zona 2 · derecha")).toEqual(["2", "0", "0", "0", "2"]);
    expect(filaMatriz(page, "Zona 2 · centro")).toEqual(["1", "0", "0", "0", "1"]);
    expect(filaMatriz(page, "Zona 2 · izquierda")).toEqual(["0", "0", "0", "0", "0"]);
  });

  it("informa de los córners por lado, sin códigos", async () => {
    const md = matchData({
      events: [
        event({ type: ActionType.CORNER, originGrid: "Z4L", metadata: { cornerSide: "left" } }),
        event({ type: ActionType.CORNER, originGrid: "Z4L", metadata: { cornerSide: "left" } }),
        event({ type: ActionType.CORNER, originGrid: "Z4R", metadata: { cornerSide: "right" } }),
      ],
    });
    const text = await summaryText(md);
    expect(text).toContain("Córners: 3 — izquierda 2 · derecha 1");
    expect(text).not.toMatch(/Z4[LR]/);
  });

  it("declara las faltas sin ubicación en vez de asignarles una zona", async () => {
    const md = matchData({
      events: [
        event({ type: ActionType.FOUL, playerIds: ["p1"] }), // sin originGrid
        event({ type: ActionType.FOUL, playerIds: ["p1"], originGrid: "Z3C" }),
      ],
    });
    await exportMatchReportPdf(md);
    const page = toJpegMock.mock.calls[0][0] as HTMLElement;
    expect((page.textContent || "").replace(/\s+/g, " ")).toContain("sin ubicación registrada");
    // La ubicada sí ocupa su fila; la que no lo está no inventa ninguna.
    expect(filaMatriz(page, "Zona 3 · centro")).toEqual(["0", "0", "0", "1", "1"]);
    const faltasEnMatriz = ZONE_12_IDS.map((id) => Number(filaMatriz(page, formatZoneLabel(id)!)[3]));
    expect(faltasEnMatriz.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("un partido histórico se dibuja en su rejilla original, nunca en las 12 zonas", async () => {
    const md = matchData({
      events: [event({ type: ActionType.SHOT, playerIds: ["p1"], originGrid: "B2" })],
    });
    await exportMatchReportPdf(md);
    const page = toJpegMock.mock.calls[0][0] as HTMLElement;

    // Su celda existe, con etiqueta neutra...
    expect(page.querySelector('[aria-label="Franja 2 · banda central"]')).toBeTruthy();
    // ...y NINGUNA celda del sistema nuevo se ha creado.
    for (const id of ZONE_12_IDS) {
      expect(page.querySelector(`[aria-label="${formatZoneLabel(id)}"]`)).toBeNull();
    }
    // Y se advierte de que la perspectiva no se registró.
    expect(page.textContent || "").toContain("perspectiva de ataque no registrada");
  });

  it("el mapa de origen del portero usa la pista completa, no una rejilla abstracta", async () => {
    const md = matchData({
      players: [player({ id: "gk1", role: Role.GOALKEEPER, number: 1, isOnPitch: true })],
      events: [
        event({
          type: ActionType.SHOT,
          playerIds: ["rival-1"],
          originGrid: "Z3C",
          metadata: { isOpponent: true },
          onPitchPlayerIds: ["gk1"],
        }),
      ],
    });
    await exportMatchReportPdf(md);
    const gkPage = toJpegMock.mock.calls[2][0] as HTMLElement;

    const text = gkPage.textContent || "";
    expect(zoneCellCount(findZoneCell(gkPage, "Z3C"))).toBe(1);

    // Las dos porterías se rotulan, para que el mapa responda de un vistazo a
    // "¿desde dónde me tiran?": por dónde progresa el ataque y hacia dónde
    // acaba el tiro.
    //
    // OJO con la semántica: los sectores están normalizados a la perspectiva
    // del ATACANTE, así que el extremo derecho (Zona 4) es la portería que
    // defiende ESTE portero. Rotularla "Portería rival" — como esperaba la
    // primera versión de este test — le diría al entrenador justo lo
    // contrario de lo que ocurre.
    expect(text).toContain("Inicio del ataque");
    expect(text).toContain("Portería defendida");
    expect(text).not.toContain("Portería rival");

    // Y sin códigos internos de ningún sistema.
    expect(text).not.toMatch(/Z[1-4][LCR]/);
    expect(text).not.toMatch(/\b[ABC][123]\b/);
    expect(text).not.toMatch(/\bG[1-9]\b/);
  });

  it("la cabecera del portero y su mapa no se contradicen", async () => {
    // Un SHOT rival detenido se registra SIN subtipo. Antes pintaba un
    // círculo verde en el mapa mientras la cabecera decía "Blocajes 0 ·
    // Despejes 0". Ahora cuenta como parada sin subtipo, y se declara.
    const md = matchData({
      players: [player({ id: "gk1", role: Role.GOALKEEPER, number: 1, isOnPitch: true })],
      events: [
        event({
          type: ActionType.SHOT,
          playerIds: ["rival-1", "gk1"],
          originGrid: "Z4C",
          destinationGrid: "G5",
          metadata: { isOpponent: true },
          onPitchPlayerIds: ["gk1"],
        }),
      ],
    });
    await exportMatchReportPdf(md);
    const gkPage = toJpegMock.mock.calls[2][0] as HTMLElement;
    const text = gkPage.textContent || "";

    expect(text).toContain("Paradas");
    expect(text).toContain("sin subtipo registrado");
    // No se inventa el subtipo.
    expect(text).toContain("blocajes 0");
    expect(text).toContain("despejes 0");
  });
});

describe("Faltas recibidas", () => {
  it("espeja la zona del que comete a la del que recibe, sin tocar el evento", async () => {
    // El rival comete una falta en SU Zona 1 · izquierda. Para mi equipo es
    // una falta recibida en MI Zona 4 · derecha.
    const md = matchData({
      events: [
        event({ type: ActionType.FOUL, playerIds: ["rival-1"], originGrid: "Z1L", metadata: { isOpponent: true } }),
      ],
    });
    await exportMatchReportPdf(md);
    const text = (toJpegMock.mock.calls[0][0] as HTMLElement).textContent || "";

    expect(text).toContain("Faltas recibidas");
    expect(text.replace(/\s+/g, " ")).toContain("Zona 4 · 1");
    expect(text.replace(/\s+/g, " ")).toContain("total 1");
    // No se han colado en la matriz: este partido no tiene ni una acción
    // propia ubicada, así que no hay matriz que imprimir — y aun así las
    // faltas recibidas se cuentan, porque son eventos del rival.
    expect(text.replace(/\s+/g, " ")).not.toContain("Acciones por zona");
    // El evento original conserva su zona tal cual se registró.
    expect(md.events[0].originGrid).toBe("Z1L");
  });
});

// ── FASE 4: TIROS RECIBIDOS E INTERVENCIONES NO REGISTRADAS ───────────
describe("Ficha del portero: tiros recibidos y no registradas", () => {
  /** Una parada, un gol encajado y un tiro cuya respuesta no se registró. */
  function partidoMixto(): MatchData {
    const tiro = (declarado?: string) =>
      event({
        type: ActionType.SHOT,
        playerIds: ["rival-1", "gk1"],
        destinationGrid: "G5",
        metadata: {
          isOpponent: true,
          targetGoalkeeperId: "gk1",
          ...(declarado ? { goalieResponse: declarado } : {}),
        },
      });
    return matchData({
      players: [player({ id: "gk1", role: Role.GOALKEEPER, number: 1, isOnPitch: true, individualTimeSeconds: 600 })],
      events: [
        tiro("SAVE"),
        tiro("UNSPECIFIED"),
        event({
          type: ActionType.GOAL,
          playerIds: ["rival-1", "gk1"],
          metadata: { isOpponent: true, targetGoalkeeperId: "gk1" },
        }),
      ],
    });
  }

  /** Texto de la página del portero del informe completo. */
  async function fichaPortero(md: MatchData): Promise<string> {
    await exportGoalkeeperReportPdf(md);
    return (toJpegMock.mock.calls[0][0] as HTMLElement).textContent || "";
  }

  it("muestra tiros recibidos = 3, contando el no registrado", async () => {
    const texto = await fichaPortero(partidoMixto());
    expect(texto).toContain("Tiros recibidos");
    expect(texto).toMatch(/Tiros recibidos\s*3/);
  });

  it("declara las intervenciones no registradas por separado", async () => {
    const texto = await fichaPortero(partidoMixto());
    expect(texto).toContain("Intervenciones no registradas: 1");
  });

  it("paradas 1, encajados 1 y efectividad 50% sobre los resueltos", async () => {
    const texto = await fichaPortero(partidoMixto());
    expect(texto).toMatch(/Paradas\s*1/);
    expect(texto).toMatch(/Encajados\s*1/);
    expect(texto).toContain("50%");
    // El denominador se explica: 1 parada + 1 encajado = 2, no 3.
    expect(texto).toContain("1 paradas + 1 encajados = 2");
  });

  it("la etiqueta NO induce a pensar que el denominador son todos los tiros", async () => {
    const texto = await fichaPortero(partidoMixto());
    expect(texto).toContain("% paradas (resueltos)");
    expect(texto).toContain("tiros a puerta resueltos");
    expect(texto).not.toContain("Efectividad");
  });

  it("UNSPECIFIED no altera el porcentaje", async () => {
    const md = partidoMixto();
    const conExtra = matchData({
      players: md.players,
      events: [
        ...md.events,
        event({
          type: ActionType.SHOT,
          playerIds: ["rival-1", "gk1"],
          destinationGrid: "G2",
          metadata: { isOpponent: true, targetGoalkeeperId: "gk1", goalieResponse: "UNSPECIFIED" },
        }),
      ],
    });
    const texto = await fichaPortero(conExtra);
    // Sigue siendo 50%: solo cambian los tiros recibidos y las no registradas.
    expect(texto).toContain("50%");
    expect(texto).toMatch(/Tiros recibidos\s*4/);
    expect(texto).toContain("Intervenciones no registradas: 2");
  });

  it("ningún código técnico llega a la ficha", async () => {
    const texto = await fichaPortero(partidoMixto());
    expect(texto).not.toContain("UNSPECIFIED");
    expect(texto).not.toMatch(/SAVE_DEFLECT|SAVE_CATCH|GOAL_CONCEDED/);
    expect(texto).not.toMatch(/\bEXIT\b/);
    expect(texto).not.toMatch(/GK[1-5]/);
  });
});


// ── ZONAS DE INTERVENCIÓN EN EL PDF ─────────────────────────────────────
//
// El servicio ya calculaba bien las zonas (ver goalkeeperReportService.test);
// lo que fallaba era la ficha del PDF. Estos tests miran el nodo que se
// rasteriza, que es exactamente lo que acaba viendo el usuario.

/** Tiro rival respondido por nuestro portero (Modelo C: un solo evento). */
function rivalShot(
  response: GoalieAction | "UNSPECIFIED",
  zone: string | undefined,
  extra: { gkId?: string; exitOutcome?: "success" | "fail"; timestamp?: number } = {},
): GameEvent {
  const gkId = extra.gkId ?? "gk1";
  return event({
    type: ActionType.SHOT,
    playerIds: [gkId],
    timestamp: extra.timestamp ?? 0,
    goalkeeperZone: zone as any,
    metadata: {
      isOpponent: true,
      goalieResponse: response,
      targetGoalkeeperId: gkId,
      ...(extra.exitOutcome ? { exitOutcome: extra.exitOutcome } : {}),
    } as any,
  });
}

/** Caso obligatorio: una intervención de cada tipo, una por zona. */
function mandatoryZoneMatch(): MatchData {
  return matchData({
    players: [player({ id: "gk1", number: 1, name: "Portero", role: Role.GOALKEEPER, individualTimeSeconds: 1200 })],
    events: [
      rivalShot(GoalieAction.SAVE, "GK1", { timestamp: 1000 }),
      rivalShot(GoalieAction.SAVE_CATCH, "GK2", { timestamp: 2000 }),
      rivalShot(GoalieAction.SAVE_DEFLECT, "GK3", { timestamp: 3000 }),
      rivalShot(GoalieAction.EXIT, "GK4", { exitOutcome: "success", timestamp: 4000 }),
      rivalShot(GoalieAction.EXIT, "GK5", { exitOutcome: "fail", timestamp: 5000 }),
      rivalShot("UNSPECIFIED", undefined, { timestamp: 6000 }),
    ],
  });
}

/** Región del PDF titulada "ZONAS DE INTERVENCIÓN". */
function zonesBlock(pageNode: HTMLElement): HTMLElement {
  const titles = Array.from(pageNode.querySelectorAll("div")).filter(
    (d) => (d.textContent || "").trim().toLowerCase() === "zonas de intervención",
  );
  if (titles.length === 0) throw new Error("bloque ZONAS DE INTERVENCIÓN no encontrado en la ficha");
  return titles[0].parentElement as HTMLElement;
}

describe("PDF de porteros · bloque ZONAS DE INTERVENCIÓN", () => {
  it("caso obligatorio: el bloque muestra Zona 1..Zona 5 con una intervención cada una", async () => {
    await exportGoalkeeperReportPdf(mandatoryZoneMatch());
    const page = toJpegMock.mock.calls[0][0] as HTMLElement;
    const block = zonesBlock(page);
    const text = (block.textContent || "").replace(/\s+/g, " ");

    for (const n of [1, 2, 3, 4, 5]) {
      expect(text).toContain(`Zona ${n}`);
    }
    // Resumen numérico legible: cada línea "Zona N · descripción" + conteo.
    const filas = Array.from(block.querySelectorAll("[data-gk-zone-row]"));
    expect(filas.length).toBe(5);
    for (const fila of filas) {
      expect((fila.textContent || "").trim()).toMatch(/1$/);
    }
    expect(text).toContain("Sin ubicación registrada");
  });

  it("las cinco regiones del mapa se dibujan en la ficha del PDF", async () => {
    await exportGoalkeeperReportPdf(mandatoryZoneMatch());
    const block = zonesBlock(toJpegMock.mock.calls[0][0] as HTMLElement);
    // Mismo componente que la pantalla de captura: una región por zona,
    // localizada por su etiqueta accesible (nunca por el código interno).
    const regiones = block.querySelectorAll("[data-gk-zone]");
    expect(regiones.length).toBe(5);
    expect(block.querySelector("svg")).not.toBeNull();
  });

  it("el desglose por tipo reparte cada intervención en su zona", async () => {
    await exportGoalkeeperReportPdf(mandatoryZoneMatch());
    const block = zonesBlock(toJpegMock.mock.calls[0][0] as HTMLElement);
    const filas = Array.from(block.querySelectorAll("tbody tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent || "").trim()),
    );
    const buscar = (etiqueta: string) => filas.find((f) => f[0] === etiqueta);
    expect(buscar("Parada")).toEqual(["Parada", "1", "", "", "", ""]);
    expect(buscar("Blocaje")).toEqual(["Blocaje", "", "1", "", "", ""]);
    expect(buscar("Despeje")).toEqual(["Despeje", "", "", "1", "", ""]);
    expect(buscar("Salida")).toEqual(["Salida", "", "", "", "1", "1"]);
    expect(buscar("— con éxito")).toEqual(["— con éxito", "", "", "", "1", ""]);
    expect(buscar("— falladas")).toEqual(["— falladas", "", "", "", "", "1"]);
  });

  it("la ficha nunca imprime los códigos internos GK1-GK5", async () => {
    await exportGoalkeeperReportPdf(mandatoryZoneMatch());
    const page = toJpegMock.mock.calls[0][0] as HTMLElement;
    const text = page.textContent || "";
    for (const id of ["GK1", "GK2", "GK3", "GK4", "GK5"]) {
      expect(text).not.toContain(id);
    }
  });

  it("la ficha nunca imprime UNSPECIFIED, SAVE_DEFLECT ni EXIT", async () => {
    await exportGoalkeeperReportPdf(mandatoryZoneMatch());
    const text = (toJpegMock.mock.calls[0][0] as HTMLElement).textContent || "";
    for (const code of ["UNSPECIFIED", "SAVE_DEFLECT", "SAVE_CATCH", "SAVE_PARRY", "EXIT"]) {
      expect(text).not.toContain(code);
    }
  });

  it("UNSPECIFIED no se cuela en ninguna zona del mapa del PDF", async () => {
    const md = matchData({
      players: [player({ id: "gk1", number: 1, role: Role.GOALKEEPER, individualTimeSeconds: 600 })],
      events: [rivalShot("UNSPECIFIED", undefined), rivalShot("UNSPECIFIED", undefined)],
    });
    await exportGoalkeeperReportPdf(md);
    const block = zonesBlock(toJpegMock.mock.calls[0][0] as HTMLElement);
    const filas = Array.from(block.querySelectorAll("[data-gk-zone-row]"));
    expect(filas.length).toBe(5);
    for (const fila of filas) {
      expect((fila.textContent || "").trim()).toMatch(/0$/);
    }
    // No hay intervenciones, así que tampoco hay desglose por tipo.
    expect(block.querySelector("tbody")).toBeNull();
  });

  it("dos porteros: cada ficha del PDF muestra solo sus propias zonas", async () => {
    const md = matchData({
      players: [
        player({ id: "gkA", number: 1, name: "Ana", role: Role.GOALKEEPER, individualTimeSeconds: 600, isOnPitch: false }),
        player({ id: "gkB", number: 12, name: "Bea", role: Role.GOALKEEPER, individualTimeSeconds: 600 }),
      ],
      events: [
        rivalShot(GoalieAction.SAVE, "GK1", { gkId: "gkA", timestamp: 1000 }),
        rivalShot(GoalieAction.SAVE_CATCH, "GK2", { gkId: "gkA", timestamp: 2000 }),
        rivalShot(GoalieAction.SAVE_DEFLECT, "GK4", { gkId: "gkB", timestamp: 3000 }),
        rivalShot(GoalieAction.EXIT, "GK5", { gkId: "gkB", exitOutcome: "success", timestamp: 4000 }),
      ],
    });
    await exportGoalkeeperReportPdf(md);
    const conteos = (node: HTMLElement) =>
      Array.from(zonesBlock(node).querySelectorAll("[data-gk-zone-row]")).map((d) =>
        Number((d.textContent || "").trim().slice(-1)),
      );
    expect(conteos(toJpegMock.mock.calls[0][0] as HTMLElement)).toEqual([1, 1, 0, 0, 0]); // Ana
    expect(conteos(toJpegMock.mock.calls[1][0] as HTMLElement)).toEqual([0, 0, 0, 1, 1]); // Bea
  });

  it("origen, destino y zonas de intervención son tres bloques distintos", async () => {
    await exportGoalkeeperReportPdf(mandatoryZoneMatch());
    const text = ((toJpegMock.mock.calls[0][0] as HTMLElement).textContent || "").replace(/\s+/g, " ");
    expect(text).toContain("Origen de los tiros");
    expect(text).toContain("Destino de los tiros");
    expect(text).toContain("Zonas de intervención");
  });
});

// ── BALÓN PARADO EN EL PDF REAL DEL INFORME ─────────────────────────────

function cornerEvent(outcome?: "shot" | "play", side: "left" | "right" = "left"): GameEvent {
  return event({
    type: ActionType.CORNER,
    originGrid: side === "left" ? "Z4L" : "Z4R",
    metadata: { isOpponent: false, cornerSide: side, ...(outcome ? { setPieceOutcome: outcome } : {}) },
  });
}

describe("PDF del informe · balón parado", () => {
  const partido = () =>
    matchData({
      players: [player()],
      events: [
        cornerEvent("shot"),
        cornerEvent("shot", "right"),
        cornerEvent("play"),
        cornerEvent(),
        event({ type: ActionType.FOUL, playerIds: ["p1"], originGrid: "Z2C", metadata: { isOpponent: false } }),
        event({ type: ActionType.FOUL, playerIds: ["p1"], originGrid: "Z2C", metadata: { isOpponent: false } }),
        event({ type: ActionType.SHOT, playerIds: ["p1"], originGrid: "Z4C", destinationGrid: "G2", metadata: { isOpponent: false, setPiece: "corner" } }),
      ],
    });

  const paginaZonas = async () => {
    await exportMatchReportPdf(partido());
    return toJpegMock.mock.calls
      .map((c) => ((c[0] as HTMLElement).textContent || "").replace(/\s+/g, " "))
      .find((t) => t.includes("Córners · ejecución")) ?? "";
  };

  it("imprime el desglose de ejecución de los córners", async () => {
    const texto = await paginaZonas();
    expect(texto).toContain("Córners · ejecución");
    expect(texto).toContain("4 · tiros directos 2 · jugadas 1 · sin registrar 1");
  });

  it("NO clasifica las faltas cometidas como tiro o jugada", async () => {
    const texto = await paginaZonas();
    expect(texto).not.toMatch(/Faltas cometidas: \d+ — .*(tiro|jugada)/);
    expect(texto).toMatch(/[Ff]alta/); // su recuento y ubicación siguen ahí
  });

  it("conserva la dimensión espacial: el lado del córner sigue estando", async () => {
    const texto = await paginaZonas();
    expect(texto).toMatch(/[Cc]órners: 4/);
    expect(texto).toContain("izquierda");
    expect(texto).toContain("derecha");
  });

  it("no imprime ningún código interno del nuevo modelo", async () => {
    const texto = await paginaZonas();
    for (const codigo of ["setPieceOutcome", "setPiece", "shot", "play", "free_kick", "CORNER", "FOUL"]) {
      expect(texto).not.toContain(codigo);
    }
  });

  it("un tiro declarado desde córner no añade un córner más", async () => {
    const texto = await paginaZonas();
    // 4 córners registrados; el SHOT con setPiece 'corner' no crea ninguno.
    expect(texto).toContain("Córners: 4");
    expect(texto).not.toContain("Córners: 5");
  });
});

// ── FALTAS Y DISCIPLINA EN LA PORTADA ──────────────────────────────────
//
// La portada imprimía el contador reglamentario —que se reinicia en el
// descanso— bajo la etiqueta «Faltas», y «Tarjetas» sin decir que solo
// cuenta las de los jugadores.

describe("portada · faltas del partido y tarjetas rotuladas", () => {
  /** Texto de la PRIMERA página del informe completo: la del resumen. */
  async function textoDelPdf(md: MatchData): Promise<string> {
    await exportMatchReportPdf(md);
    return ((toJpegMock.mock.calls[0][0] as HTMLElement).textContent || "").replace(/\s+/g, " ");
  }

  const falta = (period: Period, opponent = false) =>
    event({ type: ActionType.FOUL, period, metadata: { isOpponent: opponent } });

  const conFaltas = () =>
    matchData({
      fouls: { team: 2, opponent: 6 }, // contador ya reiniciado
      events: [
        ...Array.from({ length: 5 }, () => falta(Period.FIRST)),
        ...Array.from({ length: 2 }, () => falta(Period.SECOND)),
        ...Array.from({ length: 3 }, () => falta(Period.FIRST, true)),
        ...Array.from({ length: 6 }, () => falta(Period.SECOND, true)),
      ],
    });

  it("4 · la portada muestra el TOTAL, no el contador de la 2ª parte", async () => {
    const t = await textoDelPdf(conFaltas());
    expect(t).toContain("7 propias / 9 rival");
    expect(t).not.toContain("2 propias / 6 rival");
  });

  it("5 · y el desglose 1P / 2P / total", async () => {
    const t = await textoDelPdf(conFaltas());
    expect(t).toContain("Faltas acumuladas");
    expect(t).toContain("1ª Parte");
    expect(t).toContain("2ª Parte");
    expect(t).toContain("Total");
  });

  it("14 · un partido sin faltas registradas lo dice, no lo rellena", async () => {
    const t = await textoDelPdf(matchData({ fouls: { team: 4, opponent: 3 }, events: [] }));
    expect(t).toContain("desglose no disponible");
    expect(t).toContain("4 propias / 3 rival");
    expect(t).toContain("Último contador reglamentario");
  });

  it("un partido sin faltas y sin contador no añade ningún aviso", async () => {
    const t = await textoDelPdf(matchData({ fouls: { team: 0, opponent: 0 }, events: [] }));
    expect(t).not.toContain("Último contador reglamentario");
  });

  it("20 · la etiqueta de tarjetas dice que son de jugadores", async () => {
    const t = await textoDelPdf(conFaltas());
    expect(t).toContain("Tarjetas · jugadores");
  });

  it("19 · la roja del entrenador no entra en las tarjetas de jugadores", async () => {
    const md = matchData({
      players: [
        player({ id: "p1", individualTimeSeconds: 600 }),
        player({ id: "coach", name: "ENTRENADOR LOCAL", role: Role.COACH,
                 individualTimeSeconds: 0, stats: { ...player().stats, redCards: 1 } }),
      ],
      events: [
        event({ type: ActionType.RED_CARD, playerIds: ["coach"], metadata: { isOpponent: false } }),
      ],
    });
    const r = generateMatchReport(md);
    expect(r.teamTotals.redCards).toBe(0);
    // Pero el hecho sigue en los eventos relevantes del mismo documento.
    expect(r.relevantEvents.some((e) => e.type === "Tarjeta roja")).toBe(true);
  });
});

// ── EL MAPA DE ZONAS, EXPLICADO ─────────────────────────────────────────
//
// La portada imprimía una rejilla con un «22» en azul oscuro y el rótulo
// «Origen en pista». Quien recibe el PDF no podía saber si eran tiros o
// acciones, si eran nuestras o del rival, ni qué medía el color. El dato
// nunca estuvo mal: lo que faltaba era decir qué era.
//
// Estos tests fijan lo que la portada tiene que declarar. Ninguno toca un
// número: comprueban texto.

describe("portada · el mapa de zonas dice qué significa", () => {
  /** Texto de la PRIMERA página del informe: la del resumen. */
  async function portada(md: MatchData): Promise<string> {
    await exportMatchReportPdf(md);
    return ((toJpegMock.mock.calls[0][0] as HTMLElement).textContent || "").replace(/\s+/g, " ");
  }

  const rep = (n: number, f: (i: number) => GameEvent) => Array.from({ length: n }, (_, i) => f(i));

  /** El caso auditado: Z2C = 9 pérdidas + 6 recuperaciones + 5 tiros + 2 faltas. */
  const z2c = () =>
    matchData({
      events: [
        ...rep(9, () => event({ type: ActionType.LOSS, originGrid: "Z2C", metadata: { isOpponent: false } })),
        ...rep(6, () => event({ type: ActionType.STEAL, originGrid: "Z2C", metadata: { isOpponent: false } })),
        ...rep(5, () => event({ type: ActionType.SHOT, originGrid: "Z2C", metadata: { isOpponent: false } })),
        ...rep(2, () => event({ type: ActionType.FOUL, originGrid: "Z2C", metadata: { isOpponent: false } })),
      ],
    });

  it("10 · el mapa lleva el nombre del equipo al que pertenece", async () => {
    const t = await portada(z2c());
    expect(t).toContain("Volumen de acciones por zona · Mi Equipo");
    // El rótulo ambiguo desaparece: no decía de quién era el mapa.
    expect(t).not.toContain("Origen en pista");
  });

  it("11 · explica qué cuenta el número", async () => {
    const t = await portada(z2c());
    expect(t).toContain("Número = acciones del equipo registradas con origen en esa zona");
  });

  it("12 · explica que la intensidad es relativa a ESTE partido", async () => {
    const t = await portada(z2c());
    expect(t).toMatch(/Mayor intensidad = mayor volumen relativo dentro de este partido/);
  });

  it("13 · advierte de que el color no mide eficacia", async () => {
    const t = await portada(z2c());
    expect(t).toContain("No indica eficacia");
    // Y no promete lo contrario en ningún sitio.
    expect(t).not.toMatch(/mejor zona|peor zona|zona más eficaz|zona más peligrosa/i);
  });

  it("14 · la zona más activa viene con su composición", async () => {
    const t = await portada(z2c());
    expect(t).toContain("Zona más activa");
    expect(t).toContain("Zona 2 · centro — 22 acciones");
    expect(t).toContain("Pérdidas 9");
    expect(t).toContain("Recuperaciones 6");
    expect(t).toContain("Tiros 5");
    expect(t).toContain("Faltas cometidas 2");
    expect(t).toContain("Córners 0");
  });

  it("15 · sin residuo no aparece la línea «Otras»", async () => {
    const t = await portada(z2c());
    expect(t).not.toContain("Otras");
  });

  it("16 · con jugada de falta, parada y salida aparece «Otras» y su explicación", async () => {
    const t = await portada(
      matchData({
        events: [
          ...z2c().events,
          event({ type: ActionType.SET_PIECE, originGrid: "Z2C", metadata: { isOpponent: false, setPieceOrigin: "free_kick", setPieceOutcome: "play" } }),
          event({ type: GoalieAction.SAVE, originGrid: "Z2C", metadata: { isOpponent: false } }),
          event({ type: GoalieAction.EXIT, originGrid: "Z2C", metadata: { isOpponent: false } }),
        ],
      }),
    );
    expect(t).toContain("Zona 2 · centro — 25 acciones");
    expect(t).toContain("Otras 3");
    expect(t).toContain("jugadas de falta, paradas o salidas con zona registrada");
  });

  it("los goles se anuncian DENTRO de los tiros, nunca como cifra sumable", async () => {
    const t = await portada(
      matchData({
        events: [
          ...rep(3, () => event({ type: ActionType.SHOT, originGrid: "Z2C", metadata: { isOpponent: false } })),
          ...rep(2, () => event({ type: ActionType.GOAL, originGrid: "Z2C", metadata: { isOpponent: false } })),
        ],
      }),
    );
    expect(t).toContain("Zona 2 · centro — 5 acciones");
    expect(t).toContain("Tiros 5 (incluye 2 goles)");
    expect(t).not.toMatch(/Tiros 5 · Goles 2/);
  });

  it("las acciones del RIVAL no entran en el mapa del equipo", async () => {
    const t = await portada(
      matchData({
        events: [
          ...z2c().events,
          ...rep(30, () => event({ type: ActionType.LOSS, originGrid: "Z2C", metadata: { isOpponent: true } })),
        ],
      }),
    );
    expect(t).toContain("Zona 2 · centro — 22 acciones");
    expect(t).not.toContain("52 acciones");
  });

  it("21 · un partido histórico conserva su aviso de perspectiva", async () => {
    const t = await portada(
      matchData({
        events: rep(4, () => event({ type: ActionType.SHOT, originGrid: "B2", metadata: { isOpponent: false } })),
      }),
    );
    expect(t).toContain("perspectiva de ataque no registrada");
    // El rótulo del equipo se mantiene también en legacy.
    expect(t).toContain("Volumen de acciones por zona · Mi Equipo");
  });

  it("un partido sin acciones ubicadas no inventa mapa ni desglose", async () => {
    const t = await portada(matchData({ events: [] }));
    expect(t).toContain("Sin datos registrados");
    expect(t).not.toContain("Zona más activa");
  });
});

// ── LA MATRIZ DE 12 ZONAS ───────────────────────────────────────────────
//
// La página imprimía hasta 16 líneas de prosa que repetían, con otras
// palabras, las mismas cifras que ya estaban en ZoneStats. Estos tests fijan
// que la tabla las sustituye sin perder nada, que sus números salen del
// mismo objeto que pinta el mapa y que el Total NO se redefine para cuadrar
// con las cuatro columnas visibles.

describe("portada · matriz de acciones por zona", () => {
  async function portada(md: MatchData): Promise<HTMLElement> {
    await exportMatchReportPdf(md);
    return toJpegMock.mock.calls[0][0] as HTMLElement;
  }
  const texto = (page: HTMLElement) => (page.textContent || "").replace(/\s+/g, " ");
  const rep = (n: number, f: () => GameEvent) => Array.from({ length: n }, f);
  const E = (o: Partial<GameEvent>) => event({ metadata: { isOpponent: false }, ...o });

  /** El caso auditado: Z2C = 9 pérdidas + 6 recuperaciones + 5 tiros + 2 faltas. */
  const z2c = () =>
    matchData({
      events: [
        ...rep(9, () => E({ type: ActionType.LOSS, originGrid: "Z2C" })),
        ...rep(6, () => E({ type: ActionType.STEAL, originGrid: "Z2C" })),
        ...rep(5, () => E({ type: ActionType.SHOT, originGrid: "Z2C" })),
        ...rep(2, () => E({ type: ActionType.FOUL, originGrid: "Z2C" })),
        ...rep(3, () => E({ type: ActionType.LOSS, originGrid: "Z1R" })),
      ],
    });

  it("1 · imprime exactamente 12 filas", async () => {
    const page = await portada(z2c());
    const filas = Array.from(page.querySelectorAll("tr")).filter((tr) =>
      ZONE_12_IDS.some((id) => (tr.querySelector("td")?.textContent || "").trim() === formatZoneLabel(id)),
    );
    expect(filas.length).toBe(12);
  });

  it("2 · en el orden de ZONE_12_IDS", async () => {
    const page = await portada(z2c());
    const etiquetas = Array.from(page.querySelectorAll("tr"))
      .map((tr) => (tr.querySelector("td")?.textContent || "").trim())
      .filter((t) => ZONE_12_IDS.some((id) => formatZoneLabel(id) === t));
    expect(etiquetas).toEqual(ZONE_12_IDS.map((id) => formatZoneLabel(id)));
  });

  it("3-7 · cada celda es la cifra de ZoneStats, y Total es ZoneStats.total", async () => {
    const md = z2c();
    const page = await portada(md);
    const bucket = primaryBucket(buildZoneDashboard(md, false))!;
    for (const id of ZONE_12_IDS) {
      const z = bucket.zones.find((x) => x.zone === id)!;
      expect(filaMatriz(page, formatZoneLabel(id)!)).toEqual([
        String(z.losses), String(z.recoveries), String(z.shots), String(z.fouls), String(z.total),
      ]);
    }
    // Y el caso concreto, escrito a mano para que no sea una tautología.
    expect(filaMatriz(page, "Zona 2 · centro")).toEqual(["9", "6", "5", "2", "22"]);
  });

  it("7b · el Total de la fila coincide con el número que pinta el mapa", async () => {
    const md = z2c();
    const page = await portada(md);
    const celdaDelMapa = findZoneCell(page, "Z2C");
    expect((celdaDelMapa.textContent || "").trim()).toBe("22");
    expect(filaMatriz(page, "Zona 2 · centro")[4]).toBe("22");
  });

  it("8 · no existe columna «Goles»", async () => {
    const page = await portada(z2c());
    const cabeceras = Array.from(page.querySelectorAll("th")).map((th) => (th.textContent || "").trim());
    expect(cabeceras).toContain("Tiros");
    expect(cabeceras).not.toContain("Goles");
    expect(cabeceras).not.toContain("G");
  });

  it("9 · con goles, la celda de Tiros los anuncia dentro", async () => {
    const md = matchData({
      events: [
        ...rep(3, () => E({ type: ActionType.SHOT, originGrid: "Z4C" })),
        ...rep(2, () => E({ type: ActionType.GOAL, originGrid: "Z4C" })),
      ],
    });
    const page = await portada(md);
    expect(filaMatriz(page, "Zona 4 · centro")).toEqual(["0", "0", "5 (2G)", "0", "5"]);
    // 5 y 2 nunca como dos cifras sumables.
    expect(texto(page)).not.toMatch(/Tiros 5 · Goles 2/);
  });

  it("10 · solo se resalta la fila de mostActive", async () => {
    const page = await portada(z2c());
    expect(filasResaltadas(page)).toEqual(["Zona 2 · centro"]);
  });

  it("11 · la tarjeta de zona más activa va ANTES de la matriz", async () => {
    const t = texto(await portada(z2c()));
    expect(t.indexOf("Zona más activa")).toBeGreaterThan(-1);
    expect(t.indexOf("Acciones por zona")).toBeGreaterThan(-1);
    expect(t.indexOf("Zona más activa")).toBeLessThan(t.indexOf("Acciones por zona"));
  });

  it("12 · sin residuo, la tarjeta no dice «Otras» y no hay nota bajo la tabla", async () => {
    const t = texto(await portada(z2c()));
    expect(t).toContain("Zona 2 · centro — 22 acciones");
    expect(t).not.toContain("Otras");
    expect(t).not.toContain("Total puede incluir otras acciones localizadas");
  });

  it("13 y 15 · con residuo, la tarjeta dice «Otras N» y aparece la nota", async () => {
    const md = matchData({
      events: [
        ...z2c().events,
        E({ type: ActionType.SET_PIECE, originGrid: "Z2C", metadata: { isOpponent: false, setPieceOrigin: "free_kick", setPieceOutcome: "play" } }),
        E({ type: GoalieAction.SAVE, originGrid: "Z2C" }),
      ],
    });
    const t = texto(await portada(md));
    expect(t).toContain("Zona 2 · centro — 24 acciones");
    expect(t).toContain("Otras 2");
    expect(t).toContain("Total puede incluir otras acciones localizadas");
    expect(t).toContain("jugadas de falta, paradas o salidas con zona registrada");
  });

  it("16 · el Total NO se redefine como suma de las cuatro columnas", async () => {
    const md = matchData({
      events: [
        E({ type: ActionType.SHOT, originGrid: "Z2C" }),
        E({ type: ActionType.SET_PIECE, originGrid: "Z2C", metadata: { isOpponent: false, setPieceOrigin: "free_kick", setPieceOutcome: "play" } }),
      ],
    });
    const fila = filaMatriz(await portada(md), "Zona 2 · centro");
    const [p, r, t, f, total] = fila.map((v) => Number(v.replace(/\s*\(.*\)$/, "")));
    expect(total).toBe(2);
    expect(p + r + t + f).toBe(1); // la jugada de falta no tiene columna
    expect(total).not.toBe(p + r + t + f);
  });

  it("17-19 · las faltas recibidas van fuera de la matriz, con su total", async () => {
    const md = matchData({
      events: [
        ...rep(2, () => E({ type: ActionType.FOUL, originGrid: "Z2C" })),
        ...rep(3, () => event({ type: ActionType.FOUL, originGrid: "Z1L", metadata: { isOpponent: true } })),
      ],
    });
    const page = await portada(md);
    const t = texto(page);
    expect(t).toContain("Faltas recibidas");
    expect(t).toContain("las comete el rival, vistas desde nuestra perspectiva");
    // Z1L del rival se lee como Z4R nuestra: banda 4.
    expect(t).toContain("Zona 4 · 3");
    expect(t).toContain("total 3");
    // En la matriz, la columna Faltas son solo las COMETIDAS por nosotros.
    expect(filaMatriz(page, "Zona 2 · centro")[3]).toBe("2");
    expect(filaMatriz(page, "Zona 4 · derecha")[3]).toBe("0");
  });

  it("19b · sin faltas del rival, el bloque de recibidas no aparece", async () => {
    const t = texto(await portada(z2c()));
    expect(t).not.toContain("Faltas recibidas");
  });

  it("20-21 · los córners siguen fuera de las columnas y conservan su bloque", async () => {
    const md = matchData({
      events: [
        ...rep(2, () => E({ type: ActionType.CORNER, originGrid: "Z4L", metadata: { isOpponent: false, cornerSide: "left" } })),
        E({ type: ActionType.CORNER, originGrid: "Z4R", metadata: { isOpponent: false, cornerSide: "right" } }),
      ],
    });
    const page = await portada(md);
    const cabeceras = Array.from(page.querySelectorAll("th")).map((th) => (th.textContent || "").trim());
    expect(cabeceras).not.toContain("Córn.");
    expect(texto(page)).toContain("Córners: 3 — izquierda 2 · derecha 1");
    // Pero siguen sumando al Total de su zona.
    expect(filaMatriz(page, "Zona 4 · izquierda")).toEqual(["0", "0", "0", "0", "2"]);
  });

  it("22-23 · la orientación y la leyenda de PR #21 siguen ahí", async () => {
    const t = texto(await portada(z2c()));
    expect(t).toContain("Volumen de acciones por zona · Mi Equipo");
    expect(t).toContain("Número = acciones del equipo registradas con origen en esa zona");
    expect(t).toContain("Mayor intensidad = mayor volumen relativo dentro de este partido");
    expect(t).toContain("No indica eficacia");
  });

  it("24 · la prosa antigua ya no se imprime", async () => {
    const md = matchData({
      events: [
        ...z2c().events,
        ...rep(2, () => event({ type: ActionType.FOUL, originGrid: "Z1L", metadata: { isOpponent: true } })),
      ],
    });
    const t = texto(await portada(md));
    expect(t).not.toMatch(/Zona \d: \d+ (pérdidas?|recuperaciones?|tiros?|faltas?) —/);
  });

  it("la matriz NO recalcula eventos: proyecta ZoneBucket y nada más", async () => {
    // Guardia estructural. Sin ella, alguien podría reintroducir un recuento
    // propio dentro del PDF y la tabla acabaría diciendo una cifra distinta
    // de la que pinta el mapa de al lado.
    const fuente = require("node:fs").readFileSync(
      require("node:path").resolve(__dirname, "./pdfExportService.tsx"),
      "utf-8",
    ) as string;
    const ini = fuente.indexOf("export function zoneMatrixRows");
    const fin = fuente.indexOf("export function anyZoneHasOther");
    expect(ini).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(ini);
    const cuerpo = fuente.slice(ini, fin);
    for (const prohibido of ["tallyActionZones", "matchData", "events", "ZONE_PREDICATES", "scopedEvents"]) {
      expect(cuerpo).not.toContain(prohibido);
    }
    expect(cuerpo).toContain("bucket.zones.map");
  });

  it("25-26 · un partido histórico no imprime la matriz y conserva su aviso", async () => {
    const md = matchData({
      events: rep(4, () => E({ type: ActionType.SHOT, originGrid: "B2" })),
    });
    const page = await portada(md);
    const t = texto(page);
    expect(t).toContain("perspectiva de ataque no registrada");
    expect(t).not.toContain("Acciones por zona");
    expect(t).not.toContain("Faltas recibidas");
    expect(Array.from(page.querySelectorAll("tr")).some((tr) =>
      ZONE_12_IDS.some((id) => (tr.querySelector("td")?.textContent || "").trim() === formatZoneLabel(id)),
    )).toBe(false);
  });
});

// ── PÁGINA «EVOLUCIÓN POR PERIODOS» ─────────────────────────────────────
//
// Página propia, después de la portada. Lo que aquí se protege es sobre todo
// lo que NO debe pasar: que la portada de PR #22 cambie, y que la página
// aparezca en un partido cuya perspectiva no se registró.

describe("PDF · evolución por periodos", () => {
  const rep = (n: number, f: () => GameEvent) => Array.from({ length: n }, f);
  const E = (o: Partial<GameEvent>) => event({ metadata: { isOpponent: false }, ...o });
  async function paginas(md: MatchData): Promise<{ key: string; text: string }[]> {
    await exportMatchReportPdf(md);
    return toJpegMock.mock.calls.map((c, i) => ({
      key: String(i),
      text: ((c[0] as HTMLElement).textContent || "").replace(/\s+/g, " "),
    }));
  }
  const conZonas = () =>
    matchData({
      events: [
        ...rep(6, () => E({ type: ActionType.LOSS, originGrid: "Z2C", period: Period.FIRST })),
        ...rep(3, () => E({ type: ActionType.LOSS, originGrid: "Z2C", period: Period.SECOND })),
        ...rep(2, () => E({ type: ActionType.STEAL, originGrid: "Z2C", period: Period.FIRST })),
        ...rep(4, () => E({ type: ActionType.SHOT, originGrid: "Z4C", period: Period.SECOND })),
      ],
    });

  it("la página existe y va DESPUÉS de la portada", async () => {
    const p = await paginas(conZonas());
    const portada = p.findIndex((x) => x.text.includes("Mapas / Zonas"));
    const periodos = p.findIndex((x) => x.text.includes("Evolución por periodos · Mi Equipo"));
    expect(portada).toBe(0);
    expect(periodos).toBe(1);
  });

  it("trae las tres métricas y sus cifras por parte", async () => {
    const t = (await paginas(conZonas()))[1].text;
    // Los títulos van en mayúsculas por CSS (`textTransform`), que no llega
    // a textContent: el texto real es el del componente.
    for (const m of ["Pérdidas", "Recuperaciones", "Tiros"]) expect(t).toContain(m);
    expect(t).toContain("1ª parte · 6");
    expect(t).toContain("2ª parte · 3");
    expect(t).toContain("Total · 9");
  });

  it("26 · lleva la leyenda de escala compartida", async () => {
    const t = (await paginas(conZonas()))[1].text;
    expect(t).toContain("La escala se comparte entre las partes de cada fila");
    expect(t).toContain("No indica eficacia");
  });

  it("21 · un partido histórico no genera la página", async () => {
    const p = await paginas(matchData({ events: rep(4, () => E({ type: ActionType.SHOT, originGrid: "B2" })) }));
    expect(p.some((x) => x.text.includes("Evolución por periodos"))).toBe(false);
    expect(p[0].text).toContain("perspectiva de ataque no registrada");
  });

  it("22 · sin acciones espaciales relevantes tampoco", async () => {
    const p = await paginas(matchData({ events: [E({ type: ActionType.FOUL, originGrid: "Z2C" })] }));
    expect(p.some((x) => x.text.includes("Evolución por periodos"))).toBe(false);
  });

  it("27 · la portada de PR #22 queda intacta", async () => {
    const t = (await paginas(conZonas()))[0].text;
    expect(t).toContain("Volumen de acciones por zona · Mi Equipo");
    expect(t).toContain("Número = acciones del equipo registradas con origen en esa zona");
    expect(t).toContain("No indica eficacia");
    expect(t).toContain("Zona más activa");
    expect(t).toContain("Acciones por zona · Mi Equipo");
    expect(t).toContain("Zona 2 · centro");
    // y NO se le ha colado nada de la página nueva
    expect(t).not.toContain("Evolución por periodos");
    expect(t).not.toContain("La escala se comparte entre las partes");
  });

  it("23-25 · la página no clasifica fases ni valora", async () => {
    const t = (await paginas(conZonas()))[1].text;
    for (const prohibido of [/atacando/i, /defendiendo/i, /fase ofensiva/i, /fase defensiva/i, /mejor/i, /peor/i]) {
      expect(t).not.toMatch(prohibido);
    }
  });
});

// ── PR #24B · LAS DOS PÁGINAS DE FASES ──────────────────────────────────
//
// Condicionadas: un partido sin fase registrada no gana ni una hoja. Esto se
// comprueba contando páginas del informe real, no inspeccionando la función.

describe("PDF · fases de juego", () => {
  const rep = (n: number, f: () => GameEvent) => Array.from({ length: n }, f);
  const E = (o: Partial<GameEvent>) => event({ metadata: { isOpponent: false }, ...o });
  const R = (o: Partial<GameEvent>) => event({ metadata: { isOpponent: true }, ...o });

  async function paginas(md: MatchData): Promise<string[]> {
    // Se limpia AQUÍ porque un test exporta dos informes y compara cuántas
    // páginas tiene cada uno: sin esto, el segundo arrastraría las del
    // primero y la resta daría cualquier cosa.
    toJpegMock.mockClear();
    await exportMatchReportPdf(md);
    return toJpegMock.mock.calls.map((c) =>
      ((c[0] as HTMLElement).textContent || "").replace(/\s+/g, " "),
    );
  }

  /** Un partido con las cuatro métricas repartidas entre sus dos fases. */
  const conFases = () =>
    matchData({
      events: [
        ...rep(4, () => E({ type: ActionType.LOSS, originGrid: "Z3C", period: Period.FIRST, phaseOfPlay: "attack_positional" })),
        ...rep(2, () => E({ type: ActionType.LOSS, originGrid: "Z4R", period: Period.SECOND, phaseOfPlay: "attack_transition" })),
        ...rep(3, () => E({ type: ActionType.STEAL, originGrid: "Z2C", period: Period.FIRST, phaseOfPlay: "defense_organized" })),
        ...rep(1, () => E({ type: ActionType.INTERCEPTION, originGrid: "Z3L", period: Period.SECOND, phaseOfPlay: "defense_transition" })),
        ...rep(2, () => E({ type: ActionType.SHOT, originGrid: "Z4C", period: Period.FIRST, phaseOfPlay: "attack_positional" })),
        ...rep(1, () => E({ type: ActionType.GOAL, originGrid: "Z4L", period: Period.SECOND, phaseOfPlay: "attack_transition" })),
        ...rep(2, () => R({ type: ActionType.SHOT, originGrid: "Z4C", period: Period.FIRST, phaseOfPlay: "defense_organized" })),
        ...rep(1, () => R({ type: ActionType.SHOT, originGrid: "Z3R", period: Period.SECOND, phaseOfPlay: "defense_transition" })),
        // Una pérdida sin fase: tiene que aparecer declarada, no repartida.
        E({ type: ActionType.LOSS, originGrid: "Z2L", period: Period.SECOND }),
      ],
    });

  it("son exactamente DOS páginas, y van después de la evolución por periodos", async () => {
    const p = await paginas(conFases());
    const periodos = p.findIndex((t) => t.includes("Evolución por periodos"));
    const a = p.findIndex((t) => t.includes("Fases de juego · Pérdidas y recuperaciones"));
    const b = p.findIndex((t) => t.includes("Fases de juego · Finalización"));
    expect(periodos).toBe(1);
    expect(a).toBe(2);
    expect(b).toBe(3);
    expect(p.filter((t) => t.includes("Fases de juego ·"))).toHaveLength(2);
  });

  it("la página A lleva pérdidas y recuperaciones con sus cuatro mapas", async () => {
    const t = (await paginas(conFases()))[2];
    expect(t).toContain("Pérdidas");
    expect(t).toContain("Recuperaciones");
    expect(t).toContain("Ataque posicional · 4");
    expect(t).toContain("Transición ofensiva · 2");
    expect(t).toContain("Defensa organizada · 3");
    expect(t).toContain("Transición defensiva · 1");
    expect(t).not.toContain("Tiros rivales");
  });

  it("la página B lleva los tiros propios y los del rival", async () => {
    const t = (await paginas(conFases()))[3];
    expect(t).toContain("Tiros propios");
    expect(t).toContain("Tiros rivales");
    expect(t).toContain("1 gol");
    expect(t).not.toContain("Recuperaciones");
  });

  it("cada página dice su cobertura y cierra su reconciliación", async () => {
    const p = await paginas(conFases());
    expect(p[2]).toContain("Cobertura de fase · 6/7");
    expect(p[2]).toContain("sin fase 1 = 7");
    expect(p[3]).toContain("Cobertura de fase · 3/3 · 100,0 %");
  });

  it("una acción sin fase se declara y NO se reparte entre las dos", async () => {
    const t = (await paginas(conFases()))[2];
    expect(t).toContain("Sin fase registrada · 1");
    expect(t).toContain("no pertenecen a ninguna fase");
  });

  it("un partido SIN fase registrada no gana ninguna página", async () => {
    const sinFase = matchData({
      events: [
        ...rep(6, () => E({ type: ActionType.LOSS, originGrid: "Z2C", period: Period.FIRST })),
        ...rep(4, () => E({ type: ActionType.SHOT, originGrid: "Z4C", period: Period.SECOND })),
      ],
    });
    const p = await paginas(sinFase);
    expect(p.some((t) => t.includes("Fases de juego"))).toBe(false);
    // …y la evolución por periodos, que sí aplica, sigue estando.
    expect(p.some((t) => t.includes("Evolución por periodos"))).toBe(true);
  });

  it("un histórico de 9 celdas tampoco", async () => {
    const p = await paginas(matchData({ events: rep(4, () => E({ type: ActionType.SHOT, originGrid: "B2" })) }));
    expect(p.some((t) => t.includes("Fases de juego"))).toBe(false);
  });

  it("con fase, el informe gana exactamente 2 páginas respecto a sin fase", async () => {
    const eventos = conFases().events;
    const conN = (await paginas(matchData({ events: eventos }))).length;
    const sinN = (
      await paginas(matchData({ events: eventos.map(({ phaseOfPlay, ...e }) => e as GameEvent) }))
    ).length;
    expect(conN - sinN).toBe(2);
  });

  it("la portada y la evolución por periodos quedan intactas", async () => {
    const p = await paginas(conFases());
    expect(p[0]).toContain("Volumen de acciones por zona · Mi Equipo");
    expect(p[0]).not.toContain("Fases de juego");
    expect(p[1]).toContain("La escala se comparte entre las partes de cada fila");
    expect(p[1]).not.toContain("Fases de juego");
    expect(p[1]).not.toContain("Ataque posicional");
  });

  it("no se llama a Tactical Pro para construirlas", async () => {
    generateTacticalReportMock.mockClear();
    await paginas(conFases());
    expect(generateTacticalReportMock).not.toHaveBeenCalled();
  });
});
