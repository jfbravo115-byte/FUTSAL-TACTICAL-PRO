// @vitest-environment jsdom
/**
 * La mini pista de córner y falta, dentro de la ventana única de balón
 * parado, y su camino completo hasta los datos y las exportaciones.
 *
 * Lo que se protege:
 *   - se toca la zona, nunca se lee ni se elige un código;
 *   - lo tocado se guarda en los MISMOS campos canónicos de siempre;
 *   - la pista se ve desde quien ejecuta, sea nuestro equipo o el rival,
 *     y no depende de cómo esté girado el campo de la pantalla principal;
 *   - cancelar no deja nada; borrar se lleva la jugada entera;
 *   - ni un tiro, gol o jugada contado dos veces;
 *   - accesible: botones con frase completa, estado y foco visible.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { ActionType, GameEvent, MatchData, Period, Player, Role } from "../types/futsal";
import { SetPieceSequenceModal } from "./SetPieceSequenceModal";
import {
  SetPieceSequenceDraft,
  buildSequenceSeeds,
  describeAllSequences,
  eventIdsToDeleteWith,
  locationLabelOf,
} from "../utils/setPieceSequence";
import { summarizeSetPieceSequences, setPieceStatsViolations } from "../utils/setPieceStats";
import { scoreOf } from "../utils/goalModel";
import { buildActionsCsv, buildMatchJson, parseMatchJson } from "../services/matchExportService";
import { formatMatchReportAsMarkdown, generateMatchReport } from "../services/matchReportService";
import { buildTacticalProPayload } from "../services/tacticalProPayload";
import { SetPieceSummaryBoard } from "./export/SetPieceSummaryBoard";

// ── MONTAJE ─────────────────────────────────────────────────────────────

const st = () => ({ goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
  fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0 });
const J = (id: string, number: number, name: string, isOpponent = false, role = Role.PLAYER): Player => ({
  id, number, name, role, isOnPitch: true, plusMinus: 0, individualTimeSeconds: 600, rotationTimeSeconds: 60, isOpponent, stats: st(),
});
const PLANTILLA = [J("lgk", 1, "Víctor", false, Role.GOALKEEPER), J("l7", 7, "Ramón"), J("l10", 10, "José"),
  J("rgk", 1, "Portero Rival", true, Role.GOALKEEPER), J("r9", 9, "Rival Nueve", true), J("r4", 4, "Rival Cuatro", true)];

function ventana(root: "corner" | "free_kick", extra: Partial<React.ComponentProps<typeof SetPieceSequenceModal>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(
      <SetPieceSequenceModal root={root} teamName="CD MURCIA" opponentName="JIMBEE" players={PLANTILLA}
        defaultIsOpponent={false} targetGoalkeeperIdFor={(r) => (r ? "lgk" : "rgk")}
        onConfirm={onConfirm} onCancel={onCancel} {...extra} />,
    );
  });
  const pulsar = (sel: string) => {
    const b = host.querySelector<HTMLButtonElement>(sel);
    if (!b) throw new Error(`No existe ${sel}`);
    act(() => { b.click(); });
  };
  const draft = (): SetPieceSequenceDraft => onConfirm.mock.calls[0][0];
  return { host, pulsar, draft, onConfirm, onCancel };
}
const sinCodigos = (el: Element) => expect((el.textContent ?? "")).not.toMatch(/\bZ[1-4][LCR]\b/);

// ── CÓRNER ──────────────────────────────────────────────────────────────

describe("córner · la mini pista", () => {
  it("cuatro esquinas visibles; solo las dos de la portería rival se pueden tocar", () => {
    const { host } = ventana("corner");
    const esquinas = Array.from(host.querySelectorAll<HTMLButtonElement>("[data-visual-corner]"));
    expect(esquinas.map((b) => b.getAttribute("data-visual-corner")).sort()).toEqual(["bottom-left", "bottom-right", "top-left", "top-right"]);
    expect(esquinas.filter((b) => !b.disabled).map((b) => b.getAttribute("data-visual-corner")).sort()).toEqual(["bottom-right", "top-right"]);
    expect(host.querySelector('[data-visual-corner="top-left"]')!.getAttribute("aria-label")).toMatch(/aquí no se saca un córner/);
  });

  for (const [esquina, lado, zona] of [["top-right", "left", "Z4L"], ["bottom-right", "right", "Z4R"]] as const) {
    it(`${esquina} se guarda como córner ${lado}, con su zona ${zona} de siempre`, () => {
      const { pulsar, draft } = ventana("corner");
      pulsar(`[data-visual-corner="${esquina}"]`);
      pulsar('[data-seq-outcome="keep"]');
      pulsar("[data-seq-confirm]");
      expect(draft().cornerSide).toBe(lado);
      const raiz = buildSequenceSeeds(draft(), "spseq-x")[0];
      expect(raiz.originGrid).toBe(zona);
      expect(raiz.metadata.cornerSide).toBe(lado);
    });
  }

  it("las esquinas de su propia portería no hacen nada aunque se pulsen", () => {
    const { pulsar, host } = ventana("corner");
    pulsar('[data-visual-corner="top-left"]');
    pulsar('[data-visual-corner="bottom-left"]');
    expect(host.querySelector("[data-mini-pitch-selection]")).toBeNull();
    expect(host.querySelector<HTMLButtonElement>("[data-seq-confirm]")!.disabled).toBe(true);
  });

  it("enseña la frase elegida y «Cambiar zona» la deshace", () => {
    const { pulsar, host } = ventana("corner");
    pulsar('[data-visual-corner="bottom-right"]');
    expect(host.querySelector("[data-mini-pitch-selection]")!.textContent).toBe("Córner desde esquina inferior derecha · córner derecho");
    pulsar("[data-mini-pitch-clear]");
    expect(host.querySelector("[data-mini-pitch-selection]")).toBeNull();
    expect(host.querySelector('[data-visual-corner="bottom-right"]')!.getAttribute("aria-pressed")).toBe("false");
  });

  it("no enseña ni un código", () => {
    const { host, pulsar } = ventana("corner");
    pulsar('[data-visual-corner="top-right"]');
    sinCodigos(host.querySelector("[data-corner-picker]")!);
  });

  it("un córner que llega del radial ilumina su esquina", () => {
    const { host } = ventana("corner", { presetCornerSide: "right", presetTakerId: "l7" });
    expect(host.querySelector('[data-visual-corner="bottom-right"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[data-seq-taker="l7"]')!.className).toContain("violet");
  });
});

describe("córner · el resto de la jugada se conserva", () => {
  it("tiro directo con sacador: el remate lo firma el sacador si no se elige otro", () => {
    const { pulsar, draft } = ventana("corner");
    pulsar('[data-seq-taker="l7"]');
    pulsar('[data-visual-corner="top-right"]');
    pulsar('[data-seq-modality="direct"]');
    pulsar('[data-seq-outcome="shot"]');
    pulsar("[data-seq-confirm]");
    expect(draft()).toMatchObject({ root: "corner", modality: "direct", takerId: "l7", cornerSide: "left", outcome: "shot" });
    expect(draft().shot?.finisherId).toBe("l7");
  });

  it("jugada preparada con un finalizador distinto", () => {
    const { pulsar, draft } = ventana("corner");
    pulsar('[data-seq-taker="l7"]');
    pulsar('[data-visual-corner="bottom-right"]');
    pulsar('[data-seq-modality="prepared"]');
    pulsar('[data-seq-outcome="goal"]');
    pulsar('[data-seq-finisher="l10"]');
    pulsar("[data-seq-confirm]");
    expect(draft()).toMatchObject({ modality: "prepared", takerId: "l7", cornerSide: "right", outcome: "goal" });
    expect(draft().shot?.finisherId).toBe("l10");
  });

  it("el sacador se elige ANTES de la esquina, como se ve la jugada", () => {
    const { host } = ventana("corner");
    const orden = Array.from(host.querySelectorAll("[data-seq-taker], [data-visual-corner]")).map((e) => (e.hasAttribute("data-seq-taker") ? "t" : "c"));
    expect(orden.indexOf("t")).toBeLessThan(orden.indexOf("c"));
  });
});

// ── FALTA ───────────────────────────────────────────────────────────────

describe("falta · las doce zonas visuales", () => {
  it("doce zonas tocables, sin un solo código a la vista", () => {
    const { host } = ventana("free_kick");
    expect(host.querySelectorAll("[data-visual-zone]")).toHaveLength(12);
    sinCodigos(host.querySelector("[data-free-kick-picker]")!);
  });

  const casos: [string, string, string][] = [
    ["0-0", "Z1L", "Falta en banda izquierda · zona baja"],
    ["0-3", "Z4L", "Falta en banda izquierda · zona alta"],
    ["1-1", "Z2C", "Falta en carril central · zona media-baja"],
    ["1-2", "Z3C", "Falta en carril central · zona media-alta"],
    ["2-3", "Z4R", "Falta en banda derecha · zona alta"],
    ["2-0", "Z1R", "Falta en banda derecha · zona baja"],
  ];
  for (const [celda, zona, frase] of casos) {
    it(`la celda ${celda} se guarda como ${zona} y se lee «${frase}»`, () => {
      const { pulsar, draft, host } = ventana("free_kick");
      pulsar(`[data-visual-zone="${celda}"]`);
      expect(host.querySelector("[data-mini-pitch-selection]")!.textContent).toBe(frase);
      pulsar('[data-seq-outcome="keep"]');
      pulsar("[data-seq-confirm]");
      expect(draft().originGrid).toBe(zona);
    });
  }

  it("las doce celdas, una a una, dan las doce zonas", () => {
    const zonas = new Set<string>();
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const { pulsar, draft } = ventana("free_kick");
      pulsar(`[data-visual-zone="${r}-${c}"]`);
      pulsar('[data-seq-outcome="keep"]');
      pulsar("[data-seq-confirm]");
      zonas.add(draft().originGrid!);
    }
    expect(zonas.size).toBe(12);
  });

  it("falta directa con lanzador", () => {
    const { pulsar, draft } = ventana("free_kick");
    pulsar('[data-seq-taker="l10"]');
    pulsar('[data-visual-zone="1-3"]');
    pulsar('[data-seq-modality="direct"]');
    pulsar('[data-seq-outcome="goal"]');
    pulsar("[data-seq-confirm]");
    expect(draft()).toMatchObject({ root: "free_kick", modality: "direct", takerId: "l10", originGrid: "Z4C", outcome: "goal" });
    expect(draft().shot?.finisherId).toBe("l10");
  });

  it("falta preparada", () => {
    const { pulsar, draft } = ventana("free_kick");
    pulsar('[data-visual-zone="0-2"]');
    pulsar('[data-seq-modality="prepared"]');
    pulsar('[data-seq-outcome="loss"]');
    pulsar("[data-seq-confirm]");
    expect(draft()).toMatchObject({ modality: "prepared", originGrid: "Z3L", outcome: "loss" });
  });

  it("la zona sigue siendo opcional: sin tocarla, la falta se registra sin zona", () => {
    const { pulsar, draft } = ventana("free_kick");
    pulsar('[data-seq-outcome="keep"]');
    pulsar("[data-seq-confirm]");
    expect(draft().originGrid).toBeUndefined();
  });

  it("tocar otra vez la zona elegida la deselecciona", () => {
    const { pulsar, host } = ventana("free_kick");
    pulsar('[data-visual-zone="1-1"]');
    pulsar('[data-visual-zone="1-1"]');
    expect(host.querySelector("[data-mini-pitch-selection]")).toBeNull();
  });
});

// ── ORIENTACIÓN ─────────────────────────────────────────────────────────

describe("orientación · la pista se ve desde quien ejecuta", () => {
  it("con el rival ejecutando, la pista es la suya y la traducción es la misma", () => {
    const { pulsar, draft, host } = ventana("corner", { defaultIsOpponent: true });
    expect(host.querySelector("[data-corner-picker]")!.textContent).toContain("Portería de JIMBEE");
    pulsar('[data-visual-corner="top-right"]');
    pulsar('[data-seq-outcome="keep"]');
    pulsar("[data-seq-confirm]");
    expect(draft()).toMatchObject({ isOpponent: true, cornerSide: "left" });
  });

  it("al cambiar de equipo en la ventana, la pista pasa a ser del otro", () => {
    const { pulsar, host } = ventana("free_kick");
    expect(host.querySelector("[data-free-kick-picker]")!.textContent).toContain("Portería de CD MURCIA");
    pulsar('[data-seq-team="opponent"]');
    expect(host.querySelector("[data-free-kick-picker]")!.textContent).toContain("Portería de JIMBEE");
  });

  it("la misma celda da la misma zona canónica para los dos equipos", () => {
    const zonaDe = (rival: boolean) => {
      const { pulsar, draft } = ventana("free_kick", { defaultIsOpponent: rival });
      pulsar('[data-visual-zone="0-3"]');
      pulsar('[data-seq-outcome="keep"]');
      pulsar("[data-seq-confirm]");
      return draft().originGrid;
    };
    expect(zonaDe(false)).toBe("Z4L");
    expect(zonaDe(true)).toBe("Z4L");
  });

  it("no depende del giro del campo en pantalla: la ventana ni siquiera lo recibe", () => {
    const fuente = readFileSync(resolve(__dirname, "../pages/MatchTracker.tsx"), "utf-8");
    const uso = fuente.slice(fuente.indexOf("<SetPieceSequenceModal"), fuente.indexOf("/>", fuente.indexOf("<SetPieceSequenceModal")));
    expect(uso).not.toMatch(/isFieldFlipped|attackDirection|teamDefendsAtKickoff|flipped/i);
    const props = readFileSync(resolve(__dirname, "./SetPieceMiniPitch.tsx"), "utf-8");
    expect(props).not.toMatch(/isFieldFlipped|attackDirection|teamDefendsAtKickoff/);
  });
});

// ── ACCESIBILIDAD ───────────────────────────────────────────────────────

describe("accesibilidad", () => {
  it("cada zona es un botón con su frase completa y su estado", () => {
    const { host, pulsar } = ventana("free_kick");
    pulsar('[data-visual-zone="2-3"]');
    const celda = host.querySelector<HTMLButtonElement>('[data-visual-zone="2-3"]')!;
    expect(celda.tagName).toBe("BUTTON");
    expect(celda.type).toBe("button");
    expect(celda.getAttribute("aria-label")).toBe("Falta en banda derecha · zona alta");
    expect(celda.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[data-visual-zone="0-0"]')!.getAttribute("aria-pressed")).toBe("false");
  });

  it("se puede llegar con el teclado y el foco se ve", () => {
    const { host } = ventana("corner");
    const esquina = host.querySelector<HTMLButtonElement>('[data-visual-corner="top-right"]')!;
    expect(esquina.tabIndex).toBeGreaterThanOrEqual(0);
    esquina.focus();
    expect(document.activeElement).toBe(esquina);
    expect(esquina.className).toMatch(/focus-visible:outline/);
  });

  it("las áreas táctiles miden al menos 48 px", () => {
    const fuente = readFileSync(resolve(__dirname, "./SetPieceMiniPitch.tsx"), "utf-8");
    expect(fuente).toContain("h-14 w-14"); // esquinas: 56 px
    expect(fuente).toContain("min-h-[48px]"); // celdas de la falta
    expect(fuente).toContain("min-h-[44px]"); // «Cambiar zona»
  });
});

// ── DE LA VENTANA A LOS DATOS ───────────────────────────────────────────

describe("cancelar, deshacer y borrar", () => {
  it("cancelar con zona y sacador elegidos no guarda nada", () => {
    const { pulsar, onConfirm, onCancel } = ventana("free_kick");
    pulsar('[data-seq-taker="l7"]');
    pulsar('[data-visual-zone="1-2"]');
    pulsar('[data-seq-outcome="shot"]');
    pulsar("[data-seq-cancel]");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

let n = 0;
function materializar(draft: SetPieceSequenceDraft, id: string): GameEvent[] {
  return buildSequenceSeeds(draft, id).map((s) => ({
    id: `e${++n}`, timestamp: 60_000, wallClock: n, period: Period.FIRST,
    playerIds: [...(s.playerId ? [s.playerId] : []), ...(s.type === ActionType.SHOT || s.type === ActionType.GOAL ? [draft.isOpponent ? "lgk" : "rgk"] : [])],
    type: s.type, gameState: "4vs4" as never,
    ...(s.originGrid ? { originGrid: s.originGrid } : {}),
    ...(s.destinationGrid ? { destinationGrid: s.destinationGrid } : {}),
    metadata: { ...s.metadata, ...(s.type === ActionType.SHOT || s.type === ActionType.GOAL ? { targetGoalkeeperId: draft.isOpponent ? "lgk" : "rgk" } : {}) },
  } as GameEvent));
}

/** Un partido con lo que sale de la ventana: córner directo, falta directa y falta preparada, y un córner antiguo. */
function partido(): MatchData {
  const cornerTiro = ventana("corner");
  cornerTiro.pulsar('[data-seq-taker="l7"]');
  cornerTiro.pulsar('[data-visual-corner="bottom-right"]');
  cornerTiro.pulsar('[data-seq-modality="direct"]');
  cornerTiro.pulsar('[data-seq-outcome="shot"]');
  cornerTiro.pulsar("[data-seq-confirm]");
  const faltaGol = ventana("free_kick", { defaultIsOpponent: true });
  faltaGol.pulsar('[data-seq-taker="r9"]');
  faltaGol.pulsar('[data-visual-zone="0-3"]');
  faltaGol.pulsar('[data-seq-modality="direct"]');
  faltaGol.pulsar('[data-seq-outcome="goal"]');
  faltaGol.pulsar("[data-seq-confirm]");
  const faltaPrep = ventana("free_kick");
  faltaPrep.pulsar('[data-visual-zone="1-2"]');
  faltaPrep.pulsar('[data-seq-modality="prepared"]');
  faltaPrep.pulsar('[data-seq-outcome="keep"]');
  faltaPrep.pulsar("[data-seq-confirm]");
  const antiguo: GameEvent = { id: "viejo", timestamp: 1, wallClock: 0, period: Period.FIRST, playerIds: [], type: ActionType.CORNER,
    gameState: "4vs4" as never, originGrid: "Z4R", metadata: { isOpponent: false, cornerSide: "right", setPieceOutcome: "play" } };
  return {
    teamName: "CD MURCIA", opponentName: "JIMBEE", period: Period.FINISHED, matchClock: 0, isClockRunning: false,
    fouls: { team: 0, opponent: 0 }, timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
    players: PLANTILLA,
    events: [antiguo, ...materializar(cornerTiro.draft(), "spseq-c1"), ...materializar(faltaGol.draft(), "spseq-f1"), ...materializar(faltaPrep.draft(), "spseq-f2")],
  };
}

describe("de la mini pista a los datos, sin doble conteo", () => {
  const md = partido();

  it("cada jugada es UNA secuencia: tiros, goles y reanudaciones se cuentan una vez", () => {
    const s = summarizeSetPieceSequences(md.events);
    expect(s.team.corner.total).toBe(2); // el antiguo + el de la mini pista
    expect(s.team.corner.recorded).toBe(1);
    expect(s.team.corner.attempts).toBe(1);
    expect(s.opponent.freeKick.goals).toBe(1);
    expect(s.opponent.freeKick.byZone).toEqual({ Z4L: 1 });
    expect(s.team.freeKick.byZone).toEqual({ Z3C: 1 });
    expect(scoreOf(md.events)).toEqual({ team: 0, opponent: 1 });
    expect(md.events.filter((e) => e.type === ActionType.SHOT || e.type === ActionType.GOAL)).toHaveLength(2);
    expect(setPieceStatsViolations(md.events)).toEqual([]);
  });

  it("borrar desde cualquier evento de la jugada se la lleva ENTERA, y solo a ella", () => {
    const gol = md.events.find((e) => e.type === ActionType.GOAL)!;
    const ids = eventIdsToDeleteWith(md.events, gol.id);
    const deLaFalta = md.events.filter((e) => e.metadata?.sequenceId === "spseq-f1").map((e) => e.id);
    expect(ids.sort()).toEqual(deLaFalta.sort());
    expect(ids).not.toContain("viejo");
  });

  it("historial y tarjeta: la ubicación en palabras; el córner antiguo se lee igual que siempre", () => {
    const tarjetas = describeAllSequences(md.events);
    expect(tarjetas.map((t) => t.locationLabel)).toEqual([
      "Córner derecho",
      "Falta en banda izquierda · zona alta",
      "Falta en carril central · zona media-alta",
    ]);
    // El córner antiguo no es una jugada: no se le inventa tarjeta.
    expect(locationLabelOf(md.events[0])).toBeNull();
  });

  it("informe: palabras, nunca códigos, en el apartado de balón parado", () => {
    const texto = formatMatchReportAsMarkdown(generateMatchReport(md));
    const apartado = texto.slice(texto.indexOf("## Balón parado")).split("\n## ")[0];
    expect(apartado).toContain("Zona: banda izquierda · zona alta 1");
    expect(apartado).toContain("Zona: carril central · zona media-alta 1");
    expect(apartado).not.toMatch(/\bZ[1-4][LCR]\b/);
  });

  it("PDF: el bloque de balón parado dice la zona en palabras", () => {
    const host = document.createElement("div");
    act(() => createRoot(host).render(<SetPieceSummaryBoard matchData={md} />));
    const fila = host.querySelector('[data-sequence-row="JIMBEE|freeKick"]')!;
    expect(fila.textContent).toContain("banda izquierda · zona alta 1");
  });

  it("CSV: los códigos canónicos se conservan para cruzar datos, con su texto al lado", () => {
    const filas = buildActionsCsv(md).replace(/^﻿/, "").split("\n").map((l) => [...l.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]));
    const cab = filas[0];
    const faltaRival = filas.find((f) => f[cab.indexOf("tipo_accion")] === "SET_PIECE" && f[cab.indexOf("equipo")] === "JIMBEE")!;
    expect(faltaRival[cab.indexOf("zona")]).toBe("Z4L");
    expect(faltaRival[cab.indexOf("sector_reinicio")]).toBe("Z4L");
    expect(faltaRival[cab.indexOf("zona_texto")]).not.toMatch(/^Z[1-4][LCR]$/);
    const corner = filas.find((f) => f[cab.indexOf("tipo_accion")] === "CORNER" && f[cab.indexOf("secuencia")])!;
    expect(corner[cab.indexOf("lado_reinicio")]).toMatch(/derech/i);
    expect(corner[cab.indexOf("zona")]).toBe("Z4R");
  });

  it("JSON: ida y vuelta idéntica, con la zona canónica intacta", () => {
    const vuelta = parseMatchJson(buildMatchJson(md));
    expect(vuelta).toEqual(md);
    expect(vuelta.events.find((e) => e.metadata?.sequenceId === "spseq-f1" && e.type === ActionType.SET_PIECE)!.originGrid).toBe("Z4L");
  });

  it("Tactical Pro: la jugada lleva la ubicación en palabras y el glosario explica su código", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const p = buildTacticalProPayload(md);
    vi.unstubAllGlobals();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(p.tacticalContext.setPieceSequences.map((j) => j.locationLabel)).toContain("Falta en banda izquierda · zona alta");
    expect(p.tacticalContext.glossary.join(" ")).toMatch(/ubicación en palabras/);
    expect(p.deterministicReport.setPieces.sequences.opponent.freeKick.byZone).toEqual({ Z4L: 1 });
  });
});
