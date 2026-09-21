// @vitest-environment jsdom
/**
 * Página "Contexto táctico y secuencia de goles" del PDF Global.
 *
 * EL REQUISITO
 * ------------
 * El PDF Global es el documento que el entrenador entrega al cuerpo técnico.
 * Las situaciones especiales y la secuencia de goles vivían solo en pantalla,
 * así que no llegaban a quien tiene que leerlas.
 *
 * LO QUE ESTOS TESTS PROTEGEN
 * ---------------------------
 * Que el PDF diga EXACTAMENTE lo que dice el informe determinista. No que
 * calcule lo mismo: que no calcule nada. Si mañana cambia `matchContexts` o
 * `goalSequence`, el PDF cambia con ellos sin tocar esta plantilla.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import {
  ActionType,
  GameEvent,
  GameState,
  MatchData,
  Period,
  Player,
  Role,
} from "../../types/futsal";
import { generateMatchReport } from "../../services/matchReportService";
import { paginateContextReport } from "../../utils/reportPagination";
import { MatchContextBoard, formatContextDuration, formatContextScore } from "./MatchContextBoard";

let seq = 0;

const jugador = (id: string, number: number, name: string, isOpponent = false): Player => ({
  id, number, name,
  role: Role.PLAYER,
  isOnPitch: true,
  plusMinus: 0,
  individualTimeSeconds: 600,
  isOpponent,
  stats: {
    goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
    fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0,
    saves: 0, conceded: 0,
  },
});

function ev(o: Partial<GameEvent> & { timestamp: number; period: Period }): GameEvent {
  return {
    id: `e${++seq}`,
    wallClock: o.timestamp,
    playerIds: [],
    type: ActionType.SHOT,
    gameState: GameState.FOUR_VS_FOUR,
    metadata: { isOpponent: false },
    ...o,
  };
}

const formacion = (timestamp: number, period: Period, gameState: GameState, isOpponent = false) =>
  ev({
    timestamp, period,
    type: ActionType.FORMATION_CHANGE,
    gameState,
    metadata: { isOpponent },
    scoreAtEvent: { team: 0, opponent: 0 },
  });

/**
 * El partido de la validación manual: una superioridad cerrada, una
 * inferioridad que se queda abierta al acabar la parte, un 5x4 corto, y tres
 * goles con penalti, doble penalti y respuesta rival.
 */
function partidoReal(): MatchData {
  return {
    teamName: "CD MURCIA",
    opponentName: "PR7",
    period: Period.FINISHED,
    matchClock: 0,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: {
      team: { period1: false, period2: false },
      opponent: { period1: false, period2: false },
    },
    players: [
      jugador("p3", 3, "Jugador 3"),
      jugador("p4", 4, "Jugador 4"),
      jugador("r4", 4, "PJ RIVAL 4", true),
    ],
    events: [
      // 1ª parte: inferioridad declarada y nunca cerrada.
      formacion(900_000, Period.FIRST, GameState.INFERIORITY),

      // 2ª parte: los tres goles.
      ev({ timestamp: 13_000, period: Period.SECOND, type: ActionType.GOAL,
           playerIds: ["p3"], destinationGrid: "G1",
           metadata: { isOpponent: false, setPiece: "penalty" } }),
      ev({ timestamp: 25_000, period: Period.SECOND, type: ActionType.GOAL,
           playerIds: ["p4"], destinationGrid: "G2",
           metadata: { isOpponent: false, setPiece: "double_penalty" } }),
      ev({ timestamp: 55_000, period: Period.SECOND, type: ActionType.GOAL,
           playerIds: ["r4"], destinationGrid: "G5",
           metadata: { isOpponent: true, setPiece: "normal" } }),

      // Superioridad de 39 segundos con dos tiros a portería.
      formacion(100_000, Period.SECOND, GameState.SUPERIORITY),
      ev({ timestamp: 110_000, period: Period.SECOND, playerIds: ["p3"], destinationGrid: "G4" }),
      ev({ timestamp: 120_000, period: Period.SECOND, playerIds: ["p4"], destinationGrid: "G6" }),
      formacion(139_000, Period.SECOND, GameState.FOUR_VS_FOUR),

      // 5x4 táctico de 10 segundos con un tiro a portería.
      formacion(200_000, Period.SECOND, GameState.PJ_ATTACK),
      ev({ timestamp: 205_000, period: Period.SECOND, playerIds: ["p3"], destinationGrid: "G8" }),
      formacion(210_000, Period.SECOND, GameState.FOUR_VS_FOUR),
    ],
  };
}

function render(md: MatchData): { host: HTMLElement; report: ReturnType<typeof generateMatchReport> } {
  const report = generateMatchReport(md);
  const pages = paginateContextReport(report.matchContexts, report.goalSequence);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <>
        {pages.map((p, i) => (
          <MatchContextBoard
            key={i}
            contexts={p.contexts}
            goals={p.goals}
            teamName={md.teamName}
            opponentName={md.opponentName}
            opensContexts={p.opensContexts}
            opensGoals={p.opensGoals}
          />
        ))}
      </>,
    );
  });
  return { host, report };
}

const texto = (host: HTMLElement) => (host.textContent || "").replace(/\s+/g, " ");

// ── CONSISTENCIA CON EL INFORME ────────────────────────────────────────

describe("el PDF dice exactamente lo que dice el informe determinista", () => {
  it("una tarjeta por ventana registrada, ni una más", () => {
    const { host, report } = render(partidoReal());
    expect(report.matchContexts).toHaveLength(3);
    // Cada tarjeta lleva su propia línea de métricas secundarias.
    const tarjetas = (texto(host).match(/Recuperaciones \d+ · pérdidas/g) || []).length;
    expect(tarjetas).toBe(report.matchContexts.length);
  });

  it("los tipos salen con etiqueta humana y en el orden del informe", () => {
    const { host, report } = render(partidoReal());
    expect(report.matchContexts.map((c) => c.type)).toEqual([
      "inferiority_expulsion",
      "superiority_expulsion",
      "gk_player_own",
    ]);
    const t = texto(host);
    expect(t).toContain("Inferioridad por expulsión propia");
    expect(t).toContain("Superioridad por expulsión rival");
    expect(t).toContain("5x4 · Portero-jugador propio");
  });

  it("las duraciones son las del informe, formateadas", () => {
    const { host, report } = render(partidoReal());
    const superioridad = report.matchContexts.find((c) => c.type === "superiority_expulsion")!;
    const cincoCuatro = report.matchContexts.find((c) => c.type === "gk_player_own")!;
    expect(superioridad.duration).toBe(39_000);
    expect(cincoCuatro.duration).toBe(10_000);
    expect(texto(host)).toContain("00:39");
    expect(texto(host)).toContain("00:10");
  });

  it("una ventana sin cierre dice que la duración no está disponible", () => {
    const { host, report } = render(partidoReal());
    const inferioridad = report.matchContexts.find((c) => c.type === "inferiority_expulsion")!;
    expect(inferioridad.duration).toBeNull();
    expect(texto(host)).toContain("duración no disponible");
    // Y no se cuela ningún 00:00 inventado en su lugar.
    expect(formatContextDuration(null)).toBe("duración no disponible");
  });

  it("los tiros y los goles de cada ventana son los del informe", () => {
    const { report } = render(partidoReal());
    const sup = report.matchContexts.find((c) => c.type === "superiority_expulsion")!;
    expect([sup.tally.shots, sup.tally.onTarget, sup.tally.goals]).toEqual([2, 2, 0]);
    const pj = report.matchContexts.find((c) => c.type === "gk_player_own")!;
    expect([pj.tally.shots, pj.tally.onTarget]).toEqual([1, 1]);
  });

  it("la secuencia de goles es la del informe, gol a gol", () => {
    const { host, report } = render(partidoReal());
    expect(report.goalSequence).toHaveLength(3);
    const t = texto(host);
    for (const g of report.goalSequence) {
      expect(t).toContain(g.matchTimeLabel);
      expect(t).toContain(`${g.scoreAfter.team}-${g.scoreAfter.opponent}`);
      expect(t).toContain(g.sourceLabel);
    }
  });

  it("penalti y doble penalti se nombran como tales", () => {
    const { host, report } = render(partidoReal());
    expect(report.goalSequence.map((g) => g.source)).toEqual([
      "penalty",
      "double_penalty",
      "normal",
    ]);
    const t = texto(host);
    expect(t).toContain("Penalti");
    expect(t).toContain("Doble penalti");
    expect(t).toContain("Jugada");
  });

  it("el tiempo de respuesta es el del informe", () => {
    const { host, report } = render(partidoReal());
    expect(report.goalSequence[2].secondsSinceOpponentPreviousGoal).toBe(30);
    expect(texto(host)).toContain("Respuesta rival: 30 s");
  });

  it("un delta inexistente no se imprime", () => {
    const { host, report } = render(partidoReal());
    // El primer gol no tiene con qué compararse.
    expect(report.goalSequence[0].secondsSinceOpponentPreviousGoal).toBeNull();
    expect(texto(host)).not.toContain("Respuesta propia:");
  });

  it("el goleador sale con dorsal y nombre; el rival con el suyo", () => {
    const { host } = render(partidoReal());
    const t = texto(host);
    expect(t).toContain("#3 Jugador 3");
    expect(t).toContain("#4 Jugador 4");
    expect(t).toContain("PJ RIVAL 4");
  });

  it("nunca imprime un código interno", () => {
    const { host } = render(partidoReal());
    const t = texto(host);
    for (const codigo of ["SUPERIORITY", "PJ_ATTACK", "INFERIORITY", "FORMATION_CHANGE",
                          "superiority_expulsion", "gk_player_own", "double_penalty", "unknown"]) {
      expect(t).not.toContain(codigo);
    }
  });
});

// ── UNA SOLA FUENTE DE VERDAD ──────────────────────────────────────────

describe("el PDF no calcula nada: consume MatchReport", () => {
  it("si el informe dijera otra cosa, el PDF diría otra cosa", () => {
    // La prueba de que no recalcula: se altera el recuento del informe y la
    // plantilla lo sigue sin rechistar. Si tuviera su propia lógica de
    // tiros, aquí seguiría enseñando el número "correcto".
    const report = generateMatchReport(partidoReal());
    const sup = report.matchContexts.find((c) => c.type === "superiority_expulsion")!;
    const falseado = { ...sup, tally: { ...sup.tally, shots: 99, onTarget: 77 } };

    const host = document.createElement("div");
    document.body.appendChild(host);
    act(() => {
      createRoot(host).render(
        <MatchContextBoard
          contexts={[falseado]}
          goals={[]}
          teamName="A"
          opponentName="B"
        />,
      );
    });
    expect(texto(host)).toContain("99");
    expect(texto(host)).toContain("77");
  });

  it("la plantilla no importa ningún helper de cálculo", () => {
    const codigo = fs
      .readFileSync(path.resolve(__dirname, "MatchContextBoard.tsx"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const prohibido of [
      "buildMatchContexts",
      "buildGoalSequence",
      "summarizeShots",
      "shotModel",
      "setPieceOriginOf",
      "playingTimeBetween",
    ]) {
      expect(codigo).not.toContain(prohibido);
    }
  });

  it("el PDF Global usa el mismo generateMatchReport que la pantalla", () => {
    const plantilla = fs.readFileSync(
      path.resolve(__dirname, "../../pages/MatchTracker.tsx"),
      "utf-8",
    );
    expect(plantilla).toContain("const pdfReport = useMemo(() => generateMatchReport(matchData)");
    expect(plantilla).toContain(
      "paginateContextReport(pdfReport.matchContexts, pdfReport.goalSequence)",
    );
  });
});

// ── CASOS LÍMITE ───────────────────────────────────────────────────────

describe("casos límite del reparto", () => {
  const vacio = (): MatchData => ({ ...partidoReal(), events: [] });

  it("un partido sin situaciones especiales ni goles no genera página", () => {
    const report = generateMatchReport(vacio());
    expect(report.matchContexts).toEqual([]);
    expect(report.goalSequence).toEqual([]);
    expect(paginateContextReport(report.matchContexts, report.goalSequence)).toEqual([]);
  });

  it("un partido con goles pero sin contextos sí la genera", () => {
    const soloGoles: MatchData = {
      ...vacio(),
      events: [
        ev({ timestamp: 13_000, period: Period.SECOND, type: ActionType.GOAL,
             playerIds: ["p3"], destinationGrid: "G1",
             metadata: { isOpponent: false, setPiece: "penalty" } }),
      ],
    };
    const { host, report } = render(soloGoles);
    expect(report.matchContexts).toEqual([]);
    expect(paginateContextReport(report.matchContexts, report.goalSequence)).toHaveLength(1);
    expect(texto(host)).toContain("secuencia de goles");
    expect(texto(host)).not.toContain("situaciones especiales");
  });

  it("el marcador de la ventana se muestra de inicio a final, o solo el inicio", () => {
    const { report } = render(partidoReal());
    const sup = report.matchContexts.find((c) => c.type === "superiority_expulsion")!;
    const inf = report.matchContexts.find((c) => c.type === "inferiority_expulsion")!;
    expect(formatContextScore(sup)).toContain("→");
    expect(formatContextScore(inf)).not.toContain("→");
  });
});

// ── PENALTI Y DOBLE PENALTI SIN SECTOR ─────────────────────────────────
//
// Su origen lo fija el reglamento, así que no llevan `originGrid`. El PDF
// tiene que seguir diciendo de dónde vienen.

describe("el PDF sigue mostrando la procedencia sin sector de pista", () => {
  function partidoSoloPenaltis(): MatchData {
    return {
      ...partidoReal(),
      events: [
        ev({ timestamp: 13_000, period: Period.SECOND, type: ActionType.GOAL,
             playerIds: ["p3"], destinationGrid: "G1",
             metadata: { isOpponent: false, setPiece: "penalty" } }),
        ev({ timestamp: 25_000, period: Period.SECOND, type: ActionType.GOAL,
             playerIds: ["p4"], destinationGrid: "G2",
             metadata: { isOpponent: false, setPiece: "double_penalty" } }),
      ],
    };
  }

  it("imprime Penalti y Doble penalti aunque el evento no tenga originGrid", () => {
    const md = partidoSoloPenaltis();
    expect(md.events.every((e) => e.originGrid === undefined)).toBe(true);
    const { host } = render(md);
    const t = texto(host);
    expect(t).toContain("Penalti");
    expect(t).toContain("Doble penalti");
  });

  it("y siguen contando como goles en el marcador de la secuencia", () => {
    const { report } = render(partidoSoloPenaltis());
    expect(report.goalSequence.map((g) => `${g.scoreAfter.team}-${g.scoreAfter.opponent}`))
      .toEqual(["1-0", "2-0"]);
    expect(report.teamTotals.goals).toBe(2);
    expect(report.teamTotals.shots).toBe(2);
    expect(report.teamTotals.shotsOnTarget).toBe(2);
  });

  it("no se etiquetan como acción sin ubicación en ninguna parte del PDF", () => {
    const { host } = render(partidoSoloPenaltis());
    expect(texto(host)).not.toContain("sin ubicación");
  });
});
