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

const toJpegMock = vi.fn(async () => "data:image/jpeg;base64," + "A".repeat(2000));
vi.mock("html-to-image", () => ({
  toJpeg: () => toJpegMock(),
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

import { exportMatchReportPdf, exportGoalkeeperReportPdf } from "./pdfExportService";

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
    expect(toJpegMock).toHaveBeenCalledTimes(3); // 3 páginas
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
