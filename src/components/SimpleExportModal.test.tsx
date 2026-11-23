// @vitest-environment jsdom
/**
 * El modal de exportación: «INCLUIR EQUIPO RIVAL», progreso, botones
 * bloqueados mientras se genera, y error con reintento.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MatchData, Period } from "../types/futsal";

const dossierMock = vi.fn();
const resumenMock = vi.fn();
const csvAccionesMock = vi.fn();
const csvJugadoresMock = vi.fn();
const jsonMock = vi.fn();
vi.mock("../services/fullDossierPdfService", () => ({ exportFullMatchDossierPdf: (...a: any[]) => dossierMock(...a) }));
vi.mock("../services/pdfExportService", () => ({
  exportMatchReportPdf: (...a: any[]) => resumenMock(...a),
  exportGoalkeeperReportPdf: vi.fn(),
}));
vi.mock("../services/matchExportService", () => ({
  downloadActionsCsv: (...a: any[]) => csvAccionesMock(...a),
  downloadPlayersCsv: (...a: any[]) => csvJugadoresMock(...a),
  downloadMatchJson: (...a: any[]) => jsonMock(...a),
}));

import { SimpleExportModal, progressLabel } from "./SimpleExportModal";

const partido: MatchData = {
  teamName: "CD MURCIA", opponentName: "RIVAL", period: Period.FINISHED, matchClock: 0, isClockRunning: false,
  fouls: { team: 0, opponent: 0 }, timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
  players: [], events: [],
};

let host: HTMLDivElement;
let root: Root;
const pintar = (isOpen: boolean) => act(() => root.render(<SimpleExportModal isOpen={isOpen} onClose={() => {}} matchData={partido} />));
const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T & HTMLElement>(sel);
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };

beforeEach(() => {
  [dossierMock, resumenMock, csvAccionesMock, csvJugadoresMock, jsonMock].forEach((m) => m.mockReset());
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("INCLUIR EQUIPO RIVAL", () => {
  it("está activado por defecto y es un interruptor accesible", () => {
    pintar(true);
    const sw = q('[data-export-include-opponent]')!;
    expect(sw.getAttribute("role")).toBe("switch");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(sw.textContent).toContain("Incluir equipo rival");
  });

  it("se puede desactivar, y los dos PDF de análisis reciben la elección", async () => {
    pintar(true);
    await click(q("[data-export-include-opponent]"));
    expect(q("[data-export-include-opponent]")!.getAttribute("aria-checked")).toBe("false");
    await click(q("[data-export-dossier]"));
    expect(dossierMock.mock.calls[0][1]).toMatchObject({ includeOpponent: false });
    await click(q("[data-export-summary]"));
    expect(resumenMock.mock.calls[0][1]).toMatchObject({ includeOpponent: false });
  });

  it("no afecta a CSV ni JSON: se exportan igual", async () => {
    pintar(true);
    await click(q("[data-export-include-opponent]"));
    const botones = Array.from(host.querySelectorAll("button"));
    await click(botones.find((b) => b.textContent?.includes("CSV de acciones"))!);
    await click(botones.find((b) => b.textContent?.includes("JSON de respaldo"))!);
    expect(csvAccionesMock).toHaveBeenCalledWith(partido);
    expect(jsonMock).toHaveBeenCalledWith(partido);
  });

  it("afecta solo a ESTA exportación: al volver a abrir, vuelve a estar activado", async () => {
    pintar(true);
    await click(q("[data-export-include-opponent]"));
    pintar(false);
    pintar(true);
    expect(q("[data-export-include-opponent]")!.getAttribute("aria-checked")).toBe("true");
  });

  it("no modifica el partido", async () => {
    const antes = JSON.stringify(partido);
    pintar(true);
    await click(q("[data-export-include-opponent]"));
    await click(q("[data-export-dossier]"));
    expect(JSON.stringify(partido)).toBe(antes);
    expect(dossierMock.mock.calls[0][0]).toBe(partido);
  });
});

describe("progreso, bloqueo, error y reintento", () => {
  it("la etiqueta dice qué documento y qué página", () => {
    expect(progressLabel("dossier", null)).toBe("Generando dossier · maquetando");
    expect(progressLabel("dossier", { phase: "capture", page: 3, total: 12 })).toBe("Generando dossier · página 3 de 12");
    expect(progressLabel("informe", { phase: "save", page: 12, total: 12 })).toBe("Generando informe · guardando");
  });

  it("mientras se genera, el progreso es visible y los botones están deshabilitados", async () => {
    let soltar!: () => void;
    dossierMock.mockImplementation(async (_md: MatchData, o: any) => {
      o.onProgress({ phase: "capture", page: 2, total: 9 });
      await new Promise<void>((r) => (soltar = r));
    });
    pintar(true);
    await click(q("[data-export-dossier]"));
    expect(q("[data-export-progress]")!.textContent).toBe("Generando dossier · página 2 de 9");
    expect(q<HTMLButtonElement>("[data-export-dossier]")!.disabled).toBe(true);
    expect(q<HTMLButtonElement>("[data-export-summary]")!.disabled).toBe(true);
    await act(async () => soltar());
    expect(q<HTMLButtonElement>("[data-export-dossier]")!.disabled).toBe(false);
    expect(q("[data-export-progress]")).toBeNull();
  });

  it("si falla, dice por qué, restaura el botón y permite reintentar", async () => {
    dossierMock.mockRejectedValueOnce(new Error("No se pudo maquetar sin recortar")).mockResolvedValueOnce(undefined);
    pintar(true);
    await click(q("[data-export-dossier]"));
    expect(q("[data-export-error]")!.textContent).toContain("No se pudo maquetar sin recortar");
    expect(q<HTMLButtonElement>("[data-export-dossier]")!.disabled).toBe(false);
    await click(q("[data-export-retry]"));
    expect(dossierMock).toHaveBeenCalledTimes(2);
    expect(q("[data-export-error]")).toBeNull();
  });
});
