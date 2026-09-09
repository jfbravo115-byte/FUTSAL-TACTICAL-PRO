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

// Helpers para leer el mapa de origen del portero de forma robusta. Cada
// celda de zona SIEMPRE renderiza un <span> con la etiqueta de la zona
// (p.ej. "A1"), y opcionalmente un segundo <span> hermano con el conteo
// (solo si count>0). OJO: no se puede comprobar el conteo buscando el
// dígito como substring del textContent de la celda, porque etiquetas
// como "A1"/"C1" ya contienen el dígito "1" — hay que distinguir el span
// de conteo del span de etiqueta explícitamente.
function findZoneCell(pageNode: HTMLElement, zoneId: string): HTMLElement {
  const labelSpan = Array.from(pageNode.querySelectorAll("span")).find((el) => el.textContent === zoneId);
  if (!labelSpan) throw new Error(`zona ${zoneId} no encontrada en la página`);
  return labelSpan.parentElement as HTMLElement;
}
function zoneCellCount(cell: HTMLElement, zoneId: string): number {
  const spans = Array.from(cell.querySelectorAll("span"));
  const countSpan = spans.find((s) => s.textContent !== zoneId);
  return countSpan ? Number(countSpan.textContent) : 0;
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
      events: [event({ type: ActionType.GOAL, playerIds: ["p1"], originGrid: "B2" })],
    });
    await exportMatchReportPdf(md);
    expect(pdfSaveMock).toHaveBeenCalledTimes(1);
    expect(pdfSaveMock.mock.calls[0][0]).toMatch(/^informe_Mi_Equipo_\d+\.pdf$/);
    expect(toJpegMock).toHaveBeenCalledTimes(4); // resumen/zonas + jugadores + 1 portero + eventos (hay un GOAL relevante)
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
        event({ type: ActionType.SHOT, playerIds: ["rival-1"], originGrid: "B2", metadata: { isOpponent: true } }),
      ],
    });
    await exportMatchReportPdf(md);
    // Páginas: 0=resumen/zonas, 1=jugadores, 2=portero (único GK, sin
    // eventos relevantes de tipo GOAL/RED_CARD/GOAL_CONCEDED -> sin página
    // de eventos adicional).
    const gkPageNode = toJpegMock.mock.calls[2][0] as HTMLElement;
    const zoneLabelNode = Array.from(gkPageNode.querySelectorAll("span")).find((el) => el.textContent === "B2");
    expect(zoneLabelNode).toBeTruthy();
    // El conteo (span hermano dentro de la misma celda) debe reflejar el
    // disparo rival contabilizado.
    const cell = zoneLabelNode!.parentElement!;
    expect(cell.textContent).toContain("1");
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
        event({ type: ActionType.SHOT, playerIds: ["rival-1"], originGrid: "A1", metadata: { isOpponent: true }, onPitchPlayerIds: ["gk1"] }),
        event({ type: ActionType.SHOT, playerIds: ["rival-2"], originGrid: "C3", metadata: { isOpponent: true }, onPitchPlayerIds: ["gk2"] }),
      ],
    });
    await exportGoalkeeperReportPdf(md); // 1 página por portero, en orden de dorsal: gk1, gk2
    const gk1Page = toJpegMock.mock.calls[0][0] as HTMLElement;
    const gk2Page = toJpegMock.mock.calls[1][0] as HTMLElement;

    expect(zoneCellCount(findZoneCell(gk1Page, "A1"), "A1")).toBe(1);
    expect(zoneCellCount(findZoneCell(gk1Page, "C3"), "C3")).toBe(0);

    expect(zoneCellCount(findZoneCell(gk2Page, "C3"), "C3")).toBe(1);
    expect(zoneCellCount(findZoneCell(gk2Page, "A1"), "A1")).toBe(0);
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
        event({ type: ActionType.SHOT, playerIds: ["rival-1"], originGrid: "B1", metadata: { isOpponent: true }, onPitchPlayerIds: ["gk1"] }),
      ],
    });
    await exportGoalkeeperReportPdf(md);
    const gk1Page = toJpegMock.mock.calls[0][0] as HTMLElement; // sustituido, pero el evento es suyo
    expect(zoneCellCount(findZoneCell(gk1Page, "B1"), "B1")).toBe(1);
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
        event({ type: ActionType.SHOT, playerIds: ["rival-1"], originGrid: "A2", metadata: { isOpponent: true }, onPitchPlayerIds: ["gk1"] }),
      ],
    });
    await exportGoalkeeperReportPdf(md);
    const gk2Page = toJpegMock.mock.calls[1][0] as HTMLElement; // isOnPitch=true actualmente
    expect(zoneCellCount(findZoneCell(gk2Page, "A2"), "A2")).toBe(0);
  });

  // 4. Evento propio del portero (playerIds lo incluye) sigue contando
  // siempre, sin depender de onPitchPlayerIds.
  it("4: un evento propio del portero (playerIds lo incluye) sigue contándose siempre", async () => {
    const md = matchData({
      players: [
        player({ id: "gk1", role: Role.GOALKEEPER, number: 1, isOpponent: false, isOnPitch: true, individualTimeSeconds: 600 }),
        player({ id: "gk2", role: Role.GOALKEEPER, number: 2, isOpponent: false, isOnPitch: false, individualTimeSeconds: 600 }),
      ],
      events: [
        event({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"], originGrid: "C2" }),
      ],
    });
    await exportGoalkeeperReportPdf(md);
    const gk1Page = toJpegMock.mock.calls[0][0] as HTMLElement;
    expect(zoneCellCount(findZoneCell(gk1Page, "C2"), "C2")).toBe(1);
  });

  // 5. Legacy sin onPitchPlayerIds + un ÚNICO portero relevante: sin
  // ambigüedad posible -> se mantiene el fallback legacy razonable.
  it("5: evento legacy sin onPitchPlayerIds, con un único portero relevante, se cuenta (fallback legacy)", async () => {
    const md = matchData({
      players: [player({ id: "gk1", role: Role.GOALKEEPER, number: 1, isOpponent: false, isOnPitch: true })],
      events: [
        event({ type: ActionType.SHOT, playerIds: ["rival-1"], originGrid: "B3", metadata: { isOpponent: true } }), // sin onPitchPlayerIds
      ],
    });
    await exportGoalkeeperReportPdf(md);
    const gk1Page = toJpegMock.mock.calls[0][0] as HTMLElement;
    expect(zoneCellCount(findZoneCell(gk1Page, "B3"), "B3")).toBe(1);
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
        event({ type: ActionType.SHOT, playerIds: ["rival-1"], originGrid: "C1", metadata: { isOpponent: true } }), // sin onPitchPlayerIds, ambiguo
      ],
    });
    await exportGoalkeeperReportPdf(md);
    const gk1Page = toJpegMock.mock.calls[0][0] as HTMLElement;
    const gk2Page = toJpegMock.mock.calls[1][0] as HTMLElement;
    expect(zoneCellCount(findZoneCell(gk1Page, "C1"), "C1")).toBe(0);
    expect(zoneCellCount(findZoneCell(gk2Page, "C1"), "C1")).toBe(0);
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
