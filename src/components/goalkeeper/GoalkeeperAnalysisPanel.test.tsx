// @vitest-environment jsdom
/**
 * Regresión de la PANTALLA de análisis del portero.
 *
 * El defecto que motivó estos tests no estaba en ningún servicio: los
 * servicios calculaban bien. Estaba en la ficha que ve el usuario, que seguía
 * leyendo `player.stats.saves/conceded` — el modelo anterior a Fase 4 — y por
 * eso no enseñaba salidas, ni subtipos, ni zonas de intervención. Toda la
 * batería anterior pasaba igualmente porque solo probaba servicios.
 *
 * El partido de la primera prueba NO es inventado: son los eventos tal y como
 * los dejó la captura real en el Deploy Preview (tiro rival → respuesta del
 * portero → zona), copiados del snapshot persistido.
 */
import { describe, expect, it } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { act } from "react";
import {
  ActionType,
  GameEvent,
  GoalieAction,
  MatchData,
  Period,
  Player,
  Role,
} from "../../types/futsal";
import { buildGoalkeeperReport, buildGoalkeeperReports } from "../../services/goalkeeperReportService";
import { GoalkeeperAnalysisPanel } from "./GoalkeeperAnalysisPanel";

function goalkeeper(overrides: Partial<Player> = {}): Player {
  return {
    id: "tp1",
    number: 1,
    name: "Portero 1",
    role: Role.GOALKEEPER,
    isOnPitch: true,
    plusMinus: 0,
    individualTimeSeconds: 1200,
    isOpponent: false,
    stats: {
      goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
      fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0,
      // A propósito: números del modelo VIEJO que no cuadran con los eventos.
      // Si la ficha volviera a leerlos, los tests lo dirían.
      saves: 99, conceded: 99,
    },
    ...overrides,
  };
}

function match(events: GameEvent[], players: Player[]): MatchData {
  return {
    teamName: "Mi Equipo",
    opponentName: "Equipo Visitante",
    period: Period.FIRST,
    matchClock: 0,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
    players,
    events,
  };
}

/** Tiro rival con la respuesta del portero dentro (Modelo C). */
function rivalShot(
  response: GoalieAction | "UNSPECIFIED",
  zone: string | undefined,
  extra: { gkId?: string; exitOutcome?: "success" | "fail"; destino?: string } = {},
): GameEvent {
  const gkId = extra.gkId ?? "tp1";
  return {
    id: `e-${Math.random()}`,
    type: ActionType.SHOT,
    timestamp: 0,
    wallClock: 0,
    period: Period.FIRST,
    playerIds: ["r2", gkId],
    gameState: "4vs4" as any,
    originGrid: "Z3L" as any,
    destinationGrid: extra.destino as any,
    goalkeeperZone: zone as any,
    metadata: {
      isOpponent: true,
      setPiece: "normal",
      goalieResponse: response,
      targetGoalkeeperId: gkId,
      ...(extra.exitOutcome ? { exitOutcome: extra.exitOutcome } : {}),
    } as any,
  };
}

/** Los cinco eventos capturados en la app real, uno por zona. */
function capturaReal(): MatchData {
  return match(
    [
      rivalShot(GoalieAction.SAVE, "GK1", { destino: "G1" }),
      rivalShot(GoalieAction.SAVE_CATCH, "GK2", { destino: "G1" }),
      rivalShot(GoalieAction.SAVE_DEFLECT, "GK3", { destino: "G1" }),
      rivalShot(GoalieAction.EXIT, "GK4", { exitOutcome: "success" }),
      rivalShot(GoalieAction.EXIT, "GK5", { exitOutcome: "fail" }),
    ],
    [goalkeeper()],
  );
}

function render(md: MatchData, gkId = "tp1") {
  const gk = md.players.find((p) => p.id === gkId)!;
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(
      <GoalkeeperAnalysisPanel
        report={buildGoalkeeperReport(md, gk)}
        goalie={gk}
        isOpponent={gk.isOpponent}
        allEvents={md.events}
        isOnlyRelevantGoalkeeper={
          md.players.filter((p) => p.role === Role.GOALKEEPER && p.isOpponent === gk.isOpponent)
            .length === 1
        }
      />,
    );
  });
  return host;
}

/** Valor de una casilla del resumen, localizada por su etiqueta visible. */
function stat(host: HTMLElement, label: string): number {
  const cell = host.querySelector(`[data-gk-stat-value="${label}"]`);
  if (!cell) throw new Error(`no hay casilla "${label}" en la ficha`);
  return Number((cell.textContent || "").trim());
}

/** Conteo de una zona de intervención, leído de la lista numérica. */
function zona(host: HTMLElement, id: string): number {
  const row = host.querySelector(`[data-gk-zone-row="${id}"]`);
  if (!row) throw new Error(`no hay fila para ${id}`);
  return Number((row.textContent || "").trim().match(/(\d+)$/)?.[1] ?? NaN);
}

describe("Ficha de análisis del portero · Modelo C", () => {
  it("SHOT rival + SAVE + GK1: cuenta parada y ubica la zona 1", () => {
    const host = render(match([rivalShot(GoalieAction.SAVE, "GK1", { destino: "G1" })], [goalkeeper()]));
    expect(stat(host, "Paradas")).toBe(1);
    expect(zona(host, "GK1")).toBe(1);
    expect(zona(host, "GK2")).toBe(0);
  });

  it("SHOT rival + SAVE_CATCH + GK2: cuenta blocaje y ubica la zona 2", () => {
    const host = render(match([rivalShot(GoalieAction.SAVE_CATCH, "GK2", { destino: "G1" })], [goalkeeper()]));
    expect(stat(host, "Blocajes")).toBe(1);
    expect(stat(host, "Despejes")).toBe(0);
    expect(zona(host, "GK2")).toBe(1);
  });

  it("SHOT rival + SAVE_DEFLECT + GK3: cuenta despeje y ubica la zona 3", () => {
    const host = render(match([rivalShot(GoalieAction.SAVE_DEFLECT, "GK3", { destino: "G1" })], [goalkeeper()]));
    expect(stat(host, "Despejes")).toBe(1);
    expect(stat(host, "Blocajes")).toBe(0);
    expect(zona(host, "GK3")).toBe(1);
  });

  it("SHOT rival + SALIDA con éxito + GK4: cuenta salida, no parada, y ubica la zona 4", () => {
    const host = render(
      match([rivalShot(GoalieAction.EXIT, "GK4", { exitOutcome: "success" })], [goalkeeper()]),
    );
    expect(stat(host, "Salidas")).toBe(1);
    expect(stat(host, "Paradas")).toBe(0);
    expect(zona(host, "GK4")).toBe(1);
    expect(host.textContent).toContain("1 éxito");
  });

  it("SHOT rival + SALIDA fallida + GK5: ubica la zona 5 y declara el fallo", () => {
    const host = render(
      match([rivalShot(GoalieAction.EXIT, "GK5", { exitOutcome: "fail" })], [goalkeeper()]),
    );
    expect(stat(host, "Salidas")).toBe(1);
    expect(zona(host, "GK5")).toBe(1);
    expect(host.textContent).toContain("1 fallo");
  });

  it("evento GK independiente (no Modelo C) con zona cuenta igual", () => {
    const md = match(
      [
        {
          id: "e1",
          type: GoalieAction.SAVE_CATCH,
          timestamp: 0,
          wallClock: 0,
          period: Period.FIRST,
          playerIds: ["tp1"],
          gameState: "4vs4" as any,
          goalkeeperZone: "GK2" as any,
          metadata: { isOpponent: false } as any,
        },
        {
          id: "e2",
          type: GoalieAction.EXIT,
          timestamp: 0,
          wallClock: 0,
          period: Period.FIRST,
          playerIds: ["tp1"],
          gameState: "4vs4" as any,
          goalkeeperZone: "GK5" as any,
          metadata: { isOpponent: false, exitOutcome: "success" } as any,
        },
      ],
      [goalkeeper()],
    );
    const host = render(md);
    expect(stat(host, "Blocajes")).toBe(1);
    expect(stat(host, "Salidas")).toBe(1);
    expect(zona(host, "GK2")).toBe(1);
    expect(zona(host, "GK5")).toBe(1);
  });

  it("UNSPECIFIED no se cuenta como intervención ni ocupa zona", () => {
    const host = render(match([rivalShot("UNSPECIFIED", undefined)], [goalkeeper()]));
    expect(stat(host, "Paradas")).toBe(0);
    expect(stat(host, "Salidas")).toBe(0);
    for (const id of ["GK1", "GK2", "GK3", "GK4", "GK5"]) expect(zona(host, id)).toBe(0);
    expect(host.textContent).toContain("sin intervención registrada");
  });

  it("una intervención real sin zona se declara aparte, no se reparte", () => {
    const md = match(
      [
        rivalShot(GoalieAction.SAVE, "GK1", { destino: "G1" }),
        rivalShot(GoalieAction.SAVE, undefined, { destino: "G2" }),
      ],
      [goalkeeper()],
    );
    const host = render(md);
    expect(stat(host, "Paradas")).toBe(2);
    expect(zona(host, "GK1")).toBe(1);
    expect(host.textContent).toContain("Sin ubicación registrada");
    const resto = host.querySelector('[data-gk-zone-row="GK1"]')!.parentElement!;
    expect((resto.textContent || "").trim().endsWith("1")).toBe(true); // 1 sin ubicar
  });

  it("dos porteros: cada ficha muestra solo lo suyo", () => {
    const a = goalkeeper({ id: "gkA", number: 1, name: "Ana", isOnPitch: false });
    const b = goalkeeper({ id: "gkB", number: 12, name: "Bea" });
    const md = match(
      [
        rivalShot(GoalieAction.SAVE, "GK1", { gkId: "gkA", destino: "G1" }),
        rivalShot(GoalieAction.SAVE_CATCH, "GK2", { gkId: "gkA", destino: "G1" }),
        rivalShot(GoalieAction.EXIT, "GK4", { gkId: "gkA", exitOutcome: "success" }),
        rivalShot(GoalieAction.SAVE_DEFLECT, "GK3", { gkId: "gkB", destino: "G1" }),
        rivalShot(GoalieAction.EXIT, "GK5", { gkId: "gkB", exitOutcome: "fail" }),
      ],
      [a, b],
    );

    const fichaA = render(md, "gkA");
    expect(stat(fichaA, "Paradas")).toBe(2);
    expect(stat(fichaA, "Despejes")).toBe(0);
    expect(stat(fichaA, "Salidas")).toBe(1);
    expect([zona(fichaA, "GK1"), zona(fichaA, "GK2"), zona(fichaA, "GK3"), zona(fichaA, "GK4"), zona(fichaA, "GK5")])
      .toEqual([1, 1, 0, 1, 0]);

    const fichaB = render(md, "gkB");
    expect(stat(fichaB, "Despejes")).toBe(1);
    expect(stat(fichaB, "Blocajes")).toBe(0);
    expect([zona(fichaB, "GK1"), zona(fichaB, "GK2"), zona(fichaB, "GK3"), zona(fichaB, "GK4"), zona(fichaB, "GK5")])
      .toEqual([0, 0, 1, 0, 1]);
  });
});

describe("Ficha de análisis del portero · captura real", () => {
  it("el partido capturado en la app muestra el resumen completo", () => {
    const host = render(capturaReal());
    expect(stat(host, "Paradas")).toBe(3); // SAVE + BLOCAJE + DESPEJE
    expect(stat(host, "Blocajes")).toBe(1);
    expect(stat(host, "Despejes")).toBe(1);
    expect(stat(host, "Salidas")).toBe(2);
    expect(host.textContent).toContain("1 éxito · 1 fallo");
    expect(stat(host, "G. Enc")).toBe(0);
  });

  it("las cinco zonas quedan a 1 y ninguna intervención se pierde", () => {
    const host = render(capturaReal());
    for (const id of ["GK1", "GK2", "GK3", "GK4", "GK5"]) expect(zona(host, id)).toBe(1);
  });

  it("dibuja el mapa de intervención con sus cinco regiones", () => {
    const host = render(capturaReal());
    expect(host.querySelectorAll("[data-gk-zone]")).toHaveLength(5);
    expect(host.querySelector("svg")).not.toBeNull();
  });

  it("muestra las tres dimensiones como tres mapas distintos", () => {
    const texto = (render(capturaReal()).textContent || "").replace(/\s+/g, " ");
    expect(texto).toContain("Origen de los tiros");
    expect(texto).toContain("Destino de los tiros");
    expect(texto).toContain("Zonas de intervención");
  });

  it("no imprime ningún código interno", () => {
    const texto = render(capturaReal()).textContent || "";
    for (const codigo of ["GK1", "GK2", "GK3", "GK4", "GK5", "SAVE_CATCH", "SAVE_DEFLECT", "SAVE_PARRY", "UNSPECIFIED", "EXIT", "Z3L", "G1"]) {
      expect(texto).not.toContain(codigo);
    }
  });

  it("no lee player.stats: los contadores viejos del jugador se ignoran", () => {
    // El portero del fixture trae saves=99/conceded=99 a propósito.
    const host = render(capturaReal());
    expect(host.textContent).not.toContain("99");
  });

  it("pantalla y PDF cuentan exactamente lo mismo", () => {
    const md = capturaReal();
    const host = render(md);
    const [informe] = buildGoalkeeperReports(md); // la misma fuente que usa el PDF
    expect(stat(host, "Paradas")).toBe(informe.totalSaves);
    expect(stat(host, "Blocajes")).toBe(informe.saveCatch);
    expect(stat(host, "Despejes")).toBe(informe.saveDeflect);
    expect(stat(host, "Salidas")).toBe(informe.exits);
    expect(stat(host, "G. Enc")).toBe(informe.conceded);
    expect(stat(host, "T. Rec.")).toBe(informe.shotsAgainst);
    for (const id of ["GK1", "GK2", "GK3", "GK4", "GK5"] as const) {
      expect(zona(host, id)).toBe(informe.interventionZones[id]);
    }
  });
});
