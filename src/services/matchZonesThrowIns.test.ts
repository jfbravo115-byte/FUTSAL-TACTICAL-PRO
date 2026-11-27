/**
 * BANDAS en DATOS/ZONAS.
 *
 * El saque de banda entra en el mismo sistema de 12 zonas que el resto de
 * acciones, en la celda desde la que se sacó y vista desde quien saca. Lo
 * que estas pruebas protegen es que la banda sea una métrica más —con su
 * celda, su total y su filtro— sin colarse en la de tiros ni en la de
 * pérdidas, que tienen sus propios eventos.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ActionType, GameEvent, MatchData, Period } from "../types/futsal";
import {
  buildZoneDashboard,
  describeZoneBreakdown,
  tallyActionZones,
  ZONE_PREDICATES,
  zoneMetricValue,
} from "./matchZonesService";
import { buildSequenceSeeds, newSetPieceSequenceId, SetPieceSequenceDraft } from "../utils/setPieceSequence";

let n = 0;
function jugada(draft: SetPieceSequenceDraft): GameEvent[] {
  return buildSequenceSeeds(draft, newSetPieceSequenceId()).map((s) => ({
    id: `e${++n}`, timestamp: n, wallClock: n, period: Period.FIRST,
    playerIds: s.playerId ? [s.playerId] : [], type: s.type, gameState: "4vs4" as never,
    ...(s.originGrid ? { originGrid: s.originGrid } : {}),
    metadata: s.metadata as Record<string, unknown>,
  })) as GameEvent[];
}
const partido = (events: GameEvent[]): MatchData => ({
  teamName: "A", opponentName: "B", period: Period.FINISHED, matchClock: 0, isClockRunning: false,
  fouls: { team: 0, opponent: 0 },
  timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
  players: [], events,
});

const md = partido([
  ...jugada({ root: "throw_in", isOpponent: false, modality: "quick", outcome: "loss",
    throwInSide: "left", throwInSector: "Z2", loss: { subType: "bad_pass" } }),
  ...jugada({ root: "throw_in", isOpponent: false, modality: "prepared", outcome: "keep",
    throwInSide: "left", throwInSector: "Z2" }),
  ...jugada({ root: "throw_in", isOpponent: true, modality: "quick", outcome: "keep",
    throwInSide: "right", throwInSector: "Z4" }),
]);

describe("BANDAS en el dashboard de zonas", () => {
  const d = buildZoneDashboard(md, false);
  const celda = d.zone12!.zones.find((z) => z.zone === "Z2L")!;

  it("cuenta las bandas en su celda, vista desde quien saca", () => {
    expect(celda.throwIns).toBe(2);
    expect(zoneMetricValue(celda, "throwIns")).toBe(2);
    expect(d.totals.throwIns).toBe(2);
  });

  it("la pérdida de la jugada cuenta como pérdida, no como banda", () => {
    expect(celda.losses).toBe(1);
    expect(celda.shots).toBe(0);
  });

  it("la banda del rival es del rival, en SU celda", () => {
    const rival = buildZoneDashboard(md, true);
    expect(rival.totals.throwIns).toBe(1);
    expect(rival.zone12!.zones.find((z) => z.zone === "Z4R")!.throwIns).toBe(1);
  });

  it("el predicado de la métrica es el mismo que el de la lectura textual", () => {
    const t = tallyActionZones(md, ZONE_PREDICATES.throwIns, false);
    expect(t.Z2L).toBe(2);
  });

  it("el dashboard trae el desglose de balón parado del motor único", () => {
    expect(d.setPieces.sequences.throwIn.total).toBe(2);
    expect(d.setPieces.sequences.throwIn.byModality).toEqual({ quick: 1, prepared: 1 });
  });

  it("el desglose de la celda nombra las bandas solo si las hubo", () => {
    expect(describeZoneBreakdown(celda).map((r) => r.label)).toContain("Saques de banda");
    const sinBandas = buildZoneDashboard(partido([]), false);
    expect(sinBandas.totals.throwIns).toBe(0);
  });

  it("una banda sin sector se declara sin ubicación, no se esconde", () => {
    const sinSector = partido([
      ...jugada({ root: "throw_in", isOpponent: false, modality: "quick", outcome: "keep" }),
    ]);
    expect(buildZoneDashboard(sinSector, false).unlocated).toBe(1);
  });
});

describe("la pantalla de análisis", () => {
  const fuente = readFileSync(resolve(__dirname, "../pages/MatchAnalysis.tsx"), "utf-8");

  it("ofrece la métrica BANDAS", () => {
    expect(fuente).toContain('throwIns: "Bandas"');
  });

  it("filtra bandas con el predicado del motor único, no con uno propio", () => {
    expect(fuente).toContain("isThrowInMatching(e, throwInFilter)");
    expect(fuente).not.toMatch(/metadata\?\.setPieceModality\s*===/);
  });

  it("el desglose de balón parado sale de las frases del motor único", () => {
    expect(fuente).toContain("describeThrowInStats(sp.throwIn, nombreJugador)");
    expect(fuente).toContain("describeCornerStats(sp.corner, nombreJugador)");
    expect(fuente).toContain("describeFreeKickStats(sp.freeKick, nombreJugador)");
  });

  it("el resumen añade balón parado SIN quitar los goleadores", () => {
    expect(fuente).toContain("data-summary-set-pieces");
    expect(fuente).toContain("report.highlights.scorers.map");
    // Los dos bandos en filas separadas: nunca se suman.
    expect(fuente).toContain('(["team", "opponent"] as const).map((lado)');
  });
});

describe("compatibilidad", () => {
  it("un partido sin bandas no cambia ninguna otra métrica", () => {
    const sinBandas = partido([
      { id: "x", timestamp: 1, wallClock: 1, period: Period.FIRST, playerIds: ["a"],
        type: ActionType.LOSS, gameState: "4vs4" as never, originGrid: "Z2L",
        metadata: { isOpponent: false } } as GameEvent,
    ]);
    const d = buildZoneDashboard(sinBandas, false);
    const c = d.zone12!.zones.find((z) => z.zone === "Z2L")!;
    expect(c.losses).toBe(1);
    expect(c.throwIns).toBe(0);
    expect(c.total).toBe(1);
  });
});
