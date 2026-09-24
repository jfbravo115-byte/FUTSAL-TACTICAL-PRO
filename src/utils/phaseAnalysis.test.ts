/**
 * El análisis de fase, comprobado con aritmética.
 *
 * No hay snapshots aquí: cada invariante se calcula y se compara. Lo que se
 * protege es que los dos mapas de una fila NUNCA agoten la métrica en
 * silencio — si una acción no cae en el par principal tiene que aparecer en
 * «otras fases» o en «sin fase», y la suma tiene que cerrar contra el total.
 */
import { describe, expect, it } from "vitest";
import {
  ActionType,
  GameEvent,
  GameState,
  MatchData,
  Period,
  PhaseOfPlay,
} from "../types/futsal";
import {
  OTHER_PHASES_LABEL,
  PHASE_METRICS,
  formatPhaseCoverage,
  hasPhaseData,
  otherPhaseDetail,
  phaseCoverage,
  phaseMetric,
  phaseMetricEvents,
  phasePeriods,
  phaseResidualByPeriod,
  phaseSharedMax,
  phaseSplit,
  phaseSplitBalances,
  reconcilePhaseMetric,
} from "./phaseAnalysis";

// ── FIXTURE ─────────────────────────────────────────────────────────────
//
// Sintético y solo en memoria. Cubre las dos partes, una prórroga, los cuatro
// pares principales, los dos casos que rompen el reparto ingenuo (fase sin
// zona, zona sin fase), dos combinaciones no naturales, un tiro de córner, un
// gol y un penalti.

let n = 0;
type Op = { zona?: string; fase?: PhaseOfPlay; opp?: boolean; meta?: Record<string, unknown> };

const ev = (type: ActionType, period: Period, o: Op = {}): GameEvent => ({
  id: `e${n++}`,
  timestamp: 1000 * n,
  wallClock: 1_700_000_000_000 + n,
  period,
  playerIds: ["p1"],
  type,
  gameState: GameState.FOUR_VS_FOUR,
  ...(o.zona ? { originGrid: o.zona } : {}),
  ...(o.fase ? { phaseOfPlay: o.fase } : {}),
  attackDirection: "ltr",
  metadata: { isOpponent: !!o.opp, ...(o.meta ?? {}) },
});

const P1 = Period.FIRST;
const P2 = Period.SECOND;
const ET = Period.OVERTIME_1;

export function partido(): MatchData {
  n = 0;
  const eventos: GameEvent[] = [
    // ── 1ª parte: el bloque canónico ──
    ev(ActionType.LOSS, P1, { zona: "Z3C", fase: "attack_positional" }),
    ev(ActionType.LOSS, P1, { zona: "Z4R", fase: "attack_transition" }),
    ev(ActionType.STEAL, P1, { zona: "Z2C", fase: "defense_organized" }),
    ev(ActionType.INTERCEPTION, P1, { zona: "Z3L", fase: "defense_transition" }),
    ev(ActionType.SHOT, P1, { zona: "Z4C", fase: "attack_positional" }),
    ev(ActionType.SHOT, P1, { zona: "Z4R", fase: "attack_transition" }),
    ev(ActionType.SHOT, P1, { zona: "Z4C", fase: "defense_organized", opp: true }),
    ev(ActionType.SHOT, P1, { zona: "Z3R", fase: "defense_transition", opp: true }),
    // ── 1ª parte: las dos combinaciones NO naturales ──
    ev(ActionType.LOSS, P1, { zona: "Z1L", fase: "defense_organized" }),
    ev(ActionType.STEAL, P1, { zona: "Z4C", fase: "attack_positional" }),
    // ── 2ª parte: otra distribución ──
    ev(ActionType.LOSS, P2, { zona: "Z2L", fase: "attack_positional" }),
    ev(ActionType.LOSS, P2, { zona: "Z2L", fase: "attack_positional" }),
    ev(ActionType.UNFORCED_ERROR, P2, { zona: "Z1C", fase: "attack_positional" }),
    ev(ActionType.STEAL, P2, { zona: "Z4L", fase: "defense_transition" }),
    ev(ActionType.SHOT, P2, { zona: "Z3C", fase: "attack_transition" }),
    ev(ActionType.SHOT, P2, { zona: "Z2R", fase: "defense_organized", opp: true }),
    // ── los casos difíciles ──
    ev(ActionType.LOSS, P2, { fase: "attack_positional" }), // fase, sin zona
    ev(ActionType.LOSS, P2, { zona: "Z3R" }), // zona, sin fase
    ev(ActionType.SHOT, P2, { zona: "Z4L", fase: "attack_positional", meta: { setPiece: "corner" } }),
    ev(ActionType.GOAL, P2, { zona: "Z4C", fase: "attack_transition", meta: { setPiece: "normal" } }),
    ev(ActionType.SHOT, P2, { fase: "attack_positional", meta: { setPiece: "penalty" } }),
    ev(ActionType.SHOT, P2, { zona: "Z3C", opp: true }), // rival sin fase
    // ── prórroga ──
    ev(ActionType.LOSS, ET, { zona: "Z2R", fase: "attack_positional" }),
    ev(ActionType.STEAL, ET, { zona: "Z1C", fase: "defense_organized" }),
    ev(ActionType.SHOT, ET, { zona: "Z4C", fase: "attack_positional" }),
  ];
  return {
    teamName: "MI EQUIPO",
    opponentName: "RIVAL",
    period: Period.FINISHED,
    matchClock: 0,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: {
      team: { period1: false, period2: false },
      opponent: { period1: false, period2: false },
    },
    players: [],
    events: eventos,
    timestamp: "2026-09-24T10:00:00.000Z",
    teamDefendsAtKickoff: "left",
  };
}

/** Un partido anterior a PR #24A: rejilla de 9 celdas y ni una fase. */
export function partidoHistorico(): MatchData {
  n = 500;
  return {
    ...partido(),
    events: [
      ev(ActionType.LOSS, P1, { zona: "B2" }),
      ev(ActionType.STEAL, P1, { zona: "A1" }),
      ev(ActionType.SHOT, P2, { zona: "C3" }),
      ev(ActionType.SHOT, P2, { zona: "B1", opp: true }),
    ],
  };
}

const m = (k: Parameters<typeof phaseMetric>[0]) => phaseMetric(k);

// ── 1 · LAS CUATRO MÉTRICAS ─────────────────────────────────────────────

describe("1 · las cuatro métricas y su par de fases", () => {
  it("son exactamente cuatro, con el bando y el par que les toca", () => {
    expect(PHASE_METRICS.map((x) => x.key)).toEqual([
      "losses", "recoveries", "shots", "rivalShots",
    ]);
    expect(m("losses").phases).toEqual(["attack_positional", "attack_transition"]);
    expect(m("recoveries").phases).toEqual(["defense_organized", "defense_transition"]);
    expect(m("shots").phases).toEqual(["attack_positional", "attack_transition"]);
    expect(m("rivalShots").phases).toEqual(["defense_organized", "defense_transition"]);
    expect(m("rivalShots").opponent).toBe(true);
    expect(PHASE_METRICS.filter((x) => x.opponent)).toHaveLength(1);
  });

  it("las pérdidas incluyen el error no forzado y las recuperaciones la intercepción", () => {
    const md = partido();
    expect(phaseMetricEvents(md, m("losses")).some((e) => e.type === ActionType.UNFORCED_ERROR)).toBe(true);
    expect(phaseMetricEvents(md, m("recoveries")).some((e) => e.type === ActionType.INTERCEPTION)).toBe(true);
  });

  it("ni faltas ni córners entran en ninguna métrica", () => {
    const md = partido();
    md.events.push(ev(ActionType.FOUL, P1, { zona: "Z2C", fase: "attack_positional" }));
    md.events.push(ev(ActionType.CORNER, P1, { zona: "Z4L", fase: "attack_positional" }));
    for (const metric of PHASE_METRICS) {
      const tipos = phaseMetricEvents(md, metric).map((e) => e.type);
      expect(tipos).not.toContain(ActionType.FOUL);
      expect(tipos).not.toContain(ActionType.CORNER);
    }
  });
});

// ── 2 · RECONCILIACIÓN ──────────────────────────────────────────────────

describe("2 · total = A + B + otras + sin fase", () => {
  const esperado = {
    losses: { total: 9, a: 6, b: 1, other: 1, unset: 1 },
    recoveries: { total: 5, a: 2, b: 2, other: 1, unset: 0 },
    shots: { total: 7, a: 4, b: 3, other: 0, unset: 0 },
    rivalShots: { total: 4, a: 2, b: 1, other: 0, unset: 1 },
  } as const;

  for (const metric of PHASE_METRICS) {
    it(`${metric.title}: cierra exactamente`, () => {
      const s = phaseSplit(partido(), metric);
      const e = esperado[metric.key];
      expect({
        total: s.total, a: s.a.total, b: s.b.total, other: s.other.total, unset: s.unset.total,
      }).toEqual(e);
      expect(s.a.total + s.b.total + s.other.total + s.unset.total).toBe(s.total);
      expect(phaseSplitBalances(s)).toBe(true);
    });

    it(`${metric.title}: cada grupo cierra ubicadas + reglamentarias + sin ubicación`, () => {
      const s = phaseSplit(partido(), metric);
      for (const g of [s.a, s.b, s.other, s.unset]) {
        expect(g.located + g.ruleDetermined + g.unlocated).toBe(g.total);
      }
    });
  }

  it("la línea de reconciliación dice lo mismo que las cifras", () => {
    const s = phaseSplit(partido(), m("losses"));
    expect(reconcilePhaseMetric(s)).toBe(
      "Ataque posicional 6 + Transición ofensiva 1 + otras fases registradas 1 + sin fase 1 = 9",
    );
  });

  it("sin otras ni sin fase, la línea no inventa sumandos vacíos", () => {
    const s = phaseSplit(partido(), m("shots"));
    expect(reconcilePhaseMetric(s)).toBe(
      "Ataque posicional 4 + Transición ofensiva 3 = 7 (incluye 1 gol)",
    );
    expect(reconcilePhaseMetric(s)).not.toContain("otras");
    expect(reconcilePhaseMetric(s)).not.toContain("sin fase");
  });
});

// ── 3 · COBERTURA ───────────────────────────────────────────────────────

describe("3 · cobertura", () => {
  it("el denominador son TODAS las relevantes, con zona o sin ella", () => {
    const c = phaseCoverage(partido(), m("losses"));
    expect(c).toEqual({ total: 9, withPhase: 8, withoutPhase: 1, pct: (8 / 9) * 100 });
    expect(formatPhaseCoverage(c)).toBe("8/9 · 88,9 %");
  });

  it("una acción con fase y sin zona SÍ cuenta como cubierta", () => {
    const md = partido();
    const sinZona = phaseMetricEvents(md, m("losses")).filter(
      (e) => e.originGrid === undefined && e.phaseOfPlay !== undefined,
    );
    expect(sinZona).toHaveLength(1);
    const s = phaseSplit(md, m("losses"));
    expect(s.a.unlocated).toBe(1);
    expect(s.coverage.withPhase).toBe(8);
  });

  it("cobertura total y cobertura cero se distinguen de «sin acciones»", () => {
    expect(phaseCoverage(partido(), m("recoveries")).pct).toBe(100);

    const md = partido();
    md.events = md.events.map(({ phaseOfPlay, ...e }) => e as GameEvent);
    const cero = phaseCoverage(md, m("losses"));
    expect(cero.pct).toBe(0);
    expect(cero.withoutPhase).toBe(cero.total);

    const vacio = phaseCoverage({ ...md, events: [] }, m("losses"));
    expect(vacio).toEqual({ total: 0, withPhase: 0, withoutPhase: 0, pct: null });
    expect(formatPhaseCoverage(vacio)).toBe("0/0 · sin acciones");
    expect(formatPhaseCoverage(vacio)).not.toContain("0,0 %");
  });
});

// ── 4 · OTRAS FASES ─────────────────────────────────────────────────────

describe("4 · las combinaciones no naturales se enseñan, no se corrigen", () => {
  it("una pérdida en defensa organizada va a «otras», con su nombre", () => {
    const s = phaseSplit(partido(), m("losses"));
    expect(s.other.label).toBe(OTHER_PHASES_LABEL);
    expect(otherPhaseDetail(s)).toEqual([
      { phase: "defense_organized", label: "Defensa organizada", count: 1 },
    ]);
  });

  it("un robo en ataque posicional tampoco se reasigna al par principal", () => {
    const s = phaseSplit(partido(), m("recoveries"));
    expect(otherPhaseDetail(s)).toEqual([
      { phase: "attack_positional", label: "Ataque posicional", count: 1 },
    ]);
    expect(s.a.total + s.b.total).toBe(4);
    expect(s.total).toBe(5);
  });

  it("y no se cuelan en los mapas", () => {
    const s = phaseSplit(partido(), m("losses"));
    // Z1L es la pérdida en defensa organizada. El recuento trae los doce
    // sectores —un cero es información, y `FutsalPitch` los quiere todos—,
    // así que lo que se exige es que ahí valga CERO, no que falte la clave.
    expect(Object.keys(s.a.counts)).toHaveLength(12);
    expect(s.a.counts.Z1L).toBe(0);
    expect(s.b.counts.Z1L).toBe(0);
    expect(s.other.counts.Z1L).toBe(1);
  });
});

// ── 5 · SIN FASE ────────────────────────────────────────────────────────

describe("5 · sin fase no es una fase", () => {
  it("no se reparte ni se convierte en el par principal", () => {
    const s = phaseSplit(partido(), m("losses"));
    expect(s.unset.total).toBe(1);
    expect(s.unset.phase).toBeNull();
    expect(s.unset.events.every((e) => e.phaseOfPlay === undefined)).toBe(true);
    // Z3R es la pérdida sin fase: cero en los tres grupos que no son el suyo.
    expect(s.a.counts.Z3R).toBe(0);
    expect(s.b.counts.Z3R).toBe(0);
    expect(s.other.counts.Z3R).toBe(0);
    expect(s.unset.counts.Z3R).toBe(1);
  });

  it("un tiro rival sin fase no se atribuye a defensa organizada", () => {
    const s = phaseSplit(partido(), m("rivalShots"));
    expect(s.unset.total).toBe(1);
    expect(s.a.total).toBe(2);
  });
});

// ── 6 · GOLES Y BALÓN PARADO ────────────────────────────────────────────

describe("6 · el gol se cuenta una vez y el balón parado no se filtra", () => {
  it("el gol pertenece a los tiros; no hay un sumando aparte", () => {
    const s = phaseSplit(partido(), m("shots"));
    expect(s.total).toBe(7);
    expect(s.b.goals).toBe(1);
    expect(s.b.total).toBe(3); // el gol está DENTRO de esos 3
    expect(s.a.goals + s.b.goals + s.other.goals + s.unset.goals).toBe(1);
    expect(reconcilePhaseMetric(s)).toContain("= 7 (incluye 1 gol)");
  });

  it("un tiro de córner entra en su fase como cualquier otro", () => {
    const s = phaseSplit(partido(), m("shots"));
    const corner = s.a.events.find((e) => e.metadata?.setPiece === "corner");
    expect(corner).toBeDefined();
    expect(corner!.phaseOfPlay).toBe("attack_positional");
    expect(s.a.counts.Z4L).toBe(1);
  });

  it("el penalti no está «sin ubicación»: su origen lo fija el reglamento", () => {
    const s = phaseSplit(partido(), m("shots"));
    expect(s.a.ruleDetermined).toBe(1);
    expect(s.a.unlocated).toBe(0);
    expect(s.a.located + s.a.ruleDetermined).toBe(s.a.total);
  });
});

// ── 7 · MIRRORING ───────────────────────────────────────────────────────

describe("7 · la convención del rival no se invierte", () => {
  it("un tiro rival conserva NUESTRA fase", () => {
    const s = phaseSplit(partido(), m("rivalShots"));
    expect(s.a.phase).toBe("defense_organized");
    expect(s.a.events.every((e) => e.metadata?.isOpponent === true)).toBe(true);
    expect(s.a.events.every((e) => e.phaseOfPlay === "defense_organized")).toBe(true);
  });

  it("y su sector es exactamente el que guardó el evento, sin espejar", () => {
    const md = partido();
    const bruto = (md.events || [])
      .filter((e) => e.metadata?.isOpponent && e.phaseOfPlay === "defense_organized")
      .map((e) => e.originGrid)
      .sort();
    expect(bruto).toEqual(["Z2R", "Z4C"]);
    const s = phaseSplit(md, m("rivalShots"));
    const conAcciones = Object.entries(s.a.counts).filter(([, v]) => v > 0);
    expect(Object.fromEntries(conAcciones)).toEqual({ Z2R: 1, Z4C: 1 });
    // Si alguien espejara, Z4C pasaría a Z1C y Z2R a Z3L.
    expect(s.a.counts.Z1C).toBe(0);
    expect(s.a.counts.Z3L).toBe(0);
  });
});

// ── 8 · PERIODOS ────────────────────────────────────────────────────────

describe("8 · el periodo se aplica ADEMÁS de la fase", () => {
  it("la prórroga aparece porque el partido la jugó", () => {
    expect(phasePeriods(partido())).toEqual([Period.FIRST, Period.SECOND, Period.OVERTIME_1]);
  });

  it("un partido sin prórroga no estrena un botón vacío", () => {
    const md = partido();
    md.events = md.events.filter((e) => e.period !== Period.OVERTIME_1);
    expect(phasePeriods(md)).toEqual([Period.FIRST, Period.SECOND]);
  });

  it("fase A total = 1P + 2P + ET", () => {
    const md = partido();
    const metric = m("losses");
    const enFase = (p?: Period) =>
      phaseMetricEvents(md, metric, p).filter((e) => e.phaseOfPlay === "attack_positional").length;
    expect(enFase()).toBe(6);
    expect(enFase(P1)).toBe(1);
    expect(enFase(P2)).toBe(4);
    expect(enFase(ET)).toBe(1);
    expect(enFase(P1) + enFase(P2) + enFase(ET)).toBe(enFase());
    expect(phaseResidualByPeriod(md, metric, "attack_positional")).toBe(0);
  });

  it("y el reparto sigue cerrando dentro de una sola parte", () => {
    const s = phaseSplit(partido(), m("losses"), P2);
    expect(s.total).toBe(5);
    expect(s.a.total).toBe(4);
    expect(s.b.total).toBe(0);
    expect(s.other.total).toBe(0);
    expect(s.unset.total).toBe(1);
    expect(phaseSplitBalances(s)).toBe(true);
  });

  it("un evento sin periodo se declara como residuo, no se reparte", () => {
    const md = partido();
    const huerfano = { ...ev(ActionType.LOSS, P1, { zona: "Z2C", fase: "attack_positional" }) } as Partial<GameEvent>;
    delete huerfano.period;
    md.events = [...md.events, huerfano as GameEvent];
    expect(phaseResidualByPeriod(md, m("losses"), "attack_positional")).toBe(1);
  });
});

// ── 9 · ESCALA COMPARTIDA ───────────────────────────────────────────────

describe("9 · sharedMax", () => {
  it("es el máximo de los DOS mapas de la métrica", () => {
    expect(phaseSharedMax(phaseSplit(partido(), m("losses")))).toBe(2);   // Z2L ×2
    expect(phaseSharedMax(phaseSplit(partido(), m("shots")))).toBe(2);    // Z4C ×2
    expect(phaseSharedMax(phaseSplit(partido(), m("recoveries")))).toBe(1);
    expect(phaseSharedMax(phaseSplit(partido(), m("rivalShots")))).toBe(1);
  });

  it("no lo contamina «otras» ni «sin fase»: no se dibujan", () => {
    const md = partido();
    for (let i = 0; i < 9; i++) {
      md.events.push(ev(ActionType.LOSS, P1, { zona: "Z1L", fase: "defense_organized" }));
      md.events.push(ev(ActionType.LOSS, P1, { zona: "Z1R" }));
    }
    const s = phaseSplit(md, m("losses"));
    expect(s.other.counts.Z1L).toBe(10);
    expect(s.unset.counts.Z1R).toBe(9);
    expect(phaseSharedMax(s)).toBe(2);
  });

  it("al filtrar por parte se recalcula sobre lo que se ve", () => {
    // Las dos Z2L están en la 2ª: en la 1ª el máximo baja a 1.
    expect(phaseSharedMax(phaseSplit(partido(), m("losses"), P2))).toBe(2);
    expect(phaseSharedMax(phaseSplit(partido(), m("losses"), P1))).toBe(1);
  });

  it("nunca baja de 1, para no dividir por cero en una pista vacía", () => {
    const s = phaseSplit({ ...partido(), events: [] }, m("losses"));
    expect(phaseSharedMax(s)).toBe(1);
  });
});

// ── 10 · ¿HAY ALGO QUE ENSEÑAR? ─────────────────────────────────────────

describe("10 · hasPhaseData", () => {
  it("sí cuando alguna acción relevante trae fase", () => {
    expect(hasPhaseData(partido())).toBe(true);
  });

  it("no en un partido histórico de 9 celdas", () => {
    expect(hasPhaseData(partidoHistorico())).toBe(false);
  });

  it("no cuando ninguna acción relevante la trae, aunque haya zonas nuevas", () => {
    const md = partido();
    md.events = md.events.map(({ phaseOfPlay, ...e }) => e as GameEvent);
    expect(md.events.some((e) => e.originGrid?.startsWith("Z"))).toBe(true);
    expect(hasPhaseData(md)).toBe(false);
  });

  it("una falta con fase NO basta: no es ninguna de las cuatro métricas", () => {
    const md = partido();
    md.events = md.events.map(({ phaseOfPlay, ...e }) => e as GameEvent);
    md.events.push(ev(ActionType.FOUL, P1, { zona: "Z2C", fase: "attack_positional" }));
    expect(hasPhaseData(md)).toBe(false);
  });

  it("no se infiere nada de un partido sin eventos", () => {
    expect(hasPhaseData({ ...partido(), events: [] })).toBe(false);
  });

  it("un partido de 9 celdas queda fuera AUNQUE trajera fase", () => {
    // No puede pasar hoy —la fase se estrenó mucho después de la rejilla de
    // 9 celdas— pero si pasara, los mapas serían doce pistas vacías junto a
    // una cobertura del 100 %: diría que el dato existe y está en ningún
    // sitio. La guardia es el sistema espacial, no solo la fase.
    const md = partidoHistorico();
    md.events = md.events.map((e) => ({ ...e, phaseOfPlay: "attack_positional" as const }));
    expect(md.events.every((e) => e.phaseOfPlay !== undefined)).toBe(true);
    expect(phaseCoverage(md, m("losses")).pct).toBe(100);
    expect(hasPhaseData(md)).toBe(false);
  });
});
