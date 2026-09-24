/**
 * src/utils/phaseAnalysis.ts
 *
 * La cuarta dimensión, leída. Funciones puras, sin React y sin DOM.
 *
 * QUÉ PREGUNTA RESPONDE
 * ---------------------
 * Los mapas de PR #21-#23 dicen DÓNDE pasó cada cosa y en qué parte. No
 * dicen qué estábamos haciendo. Desde PR #24A el operador lo registra, así
 * que ya se puede separar una pérdida en ataque estático de una pérdida al
 * contragolpe: misma acción, mismo sector, problema distinto.
 *
 * SOLO LO REGISTRADO
 * ------------------
 * Todo sale de `GameEvent.phaseOfPlay`. Aquí NO se deduce la fase del tipo de
 * acción, ni de la zona, ni del periodo, ni del marcador, ni del evento
 * anterior. Un evento sin fase no es «ataque posicional por defecto»: es una
 * acción sin fase registrada, se cuenta como tal y se enseña como tal.
 *
 * LA CONVENCIÓN DEL RIVAL NO SE INVIERTE
 * --------------------------------------
 * `phaseOfPlay` describe SIEMPRE nuestra fase. Un tiro rival con
 * `defense_organized` significa «el rival tiró mientras NOSOTROS defendíamos
 * replegados», no «su ataque posicional» — su fase no la registra nadie. Y su
 * `originGrid` sigue siendo el suyo, ya normalizado por el contrato espacial
 * de `fieldZones`: filtrar por nuestra fase no toca ni un sector.
 *
 * UN SOLO MOTOR ESPACIAL
 * ----------------------
 * Los recuentos por sector salen de `buildZone12Bucket`, el mismo que alimenta
 * la portada y la página de periodos, al que se le pasa el subconjunto ya
 * filtrado. Aquí no hay un segundo contador de zonas.
 */
import {
  ActionType,
  GameEvent,
  MatchData,
  Period,
  PhaseOfPlay,
} from "../types/futsal";
import { PHASE_LABEL } from "./phaseModel";
import { isShotAttempt, isShotGoal } from "./shotModel";
import { hasRuleDeterminedOrigin } from "./setPieceModel";
import { buildZone12Bucket, scopedEvents } from "../services/matchZonesService";
import { isLegacyMatch } from "../components/export/ZoneMapBoard";

// ── LAS CUATRO MÉTRICAS ─────────────────────────────────────────────────

export type PhaseMetricKey = "losses" | "recoveries" | "shots" | "rivalShots";

export type PhaseMetric = {
  key: PhaseMetricKey;
  /** Título de la fila. */
  title: string;
  /** Rótulo del selector, donde el ancho manda. */
  shortTitle: string;
  /** De quién son las acciones. La FASE siempre es nuestra. */
  opponent: boolean;
  color: string;
  /** Las dos fases que la métrica contrasta. Cualquier otra es «otras». */
  phases: readonly [PhaseOfPlay, PhaseOfPlay];
  matches: (e: GameEvent) => boolean;
};

const isLoss = (e: GameEvent) =>
  e.type === ActionType.LOSS || e.type === ActionType.UNFORCED_ERROR;

const isRecovery = (e: GameEvent) =>
  e.type === ActionType.STEAL || e.type === ActionType.INTERCEPTION;

/**
 * Las cuatro y no más.
 *
 * Faltas y córners quedan fuera a propósito: un córner a favor está siempre
 * en fase ofensiva y no contrasta nada, y la falta acaba de estrenar el campo
 * en el parche #24A.1 —ningún partido jugado tiene todavía cobertura—. Cuando
 * la tengan, serán otra decisión, no un añadido silencioso.
 */
export const PHASE_METRICS: readonly PhaseMetric[] = [
  {
    key: "losses",
    title: "Pérdidas",
    shortTitle: "Pérdidas",
    opponent: false,
    color: "#ea580c",
    phases: ["attack_positional", "attack_transition"],
    matches: isLoss,
  },
  {
    key: "recoveries",
    title: "Recuperaciones",
    shortTitle: "Recuper.",
    opponent: false,
    color: "#9333ea",
    phases: ["defense_organized", "defense_transition"],
    matches: isRecovery,
  },
  {
    key: "shots",
    title: "Tiros propios",
    shortTitle: "Tiros",
    opponent: false,
    color: "#2563eb",
    phases: ["attack_positional", "attack_transition"],
    matches: isShotAttempt,
  },
  {
    key: "rivalShots",
    title: "Tiros rivales",
    shortTitle: "Tiros rival",
    opponent: true,
    color: "#dc2626",
    phases: ["defense_organized", "defense_transition"],
    matches: isShotAttempt,
  },
];

export function phaseMetric(key: PhaseMetricKey): PhaseMetric {
  return PHASE_METRICS.find((m) => m.key === key)!;
}

// ── EL CONJUNTO RELEVANTE ───────────────────────────────────────────────

/**
 * Acciones de esa métrica, del bando que le corresponde, con zona o sin ella.
 *
 * Este es el DENOMINADOR de todo lo que viene después: cobertura,
 * reconciliación y reparto por fases. Una acción sin sector cuenta aquí igual
 * que una ubicada — lo que le falta es el dónde, no el haber ocurrido.
 */
export function phaseMetricEvents(
  matchData: MatchData,
  metric: PhaseMetric,
  period?: Period,
): GameEvent[] {
  return scopedEvents(matchData, metric.opponent, period).filter(metric.matches);
}

// ── COBERTURA ───────────────────────────────────────────────────────────

export type PhaseCoverage = {
  /** Acciones relevantes. Con fase y sin ella. */
  total: number;
  withPhase: number;
  withoutPhase: number;
  /** null cuando no hay ni una acción: 0 % diría que hay algo sin etiquetar. */
  pct: number | null;
};

export function phaseCoverage(
  matchData: MatchData,
  metric: PhaseMetric,
  period?: Period,
): PhaseCoverage {
  const eventos = phaseMetricEvents(matchData, metric, period);
  const withPhase = eventos.filter((e) => e.phaseOfPlay !== undefined).length;
  return {
    total: eventos.length,
    withPhase,
    withoutPhase: eventos.length - withPhase,
    pct: eventos.length ? (withPhase / eventos.length) * 100 : null,
  };
}

/** «49/54 · 90,7 %» o, sin acciones, «0/0 · sin acciones». */
export function formatPhaseCoverage(c: PhaseCoverage): string {
  if (c.pct === null) return `${c.withPhase}/${c.total} · sin acciones`;
  return `${c.withPhase}/${c.total} · ${c.pct.toFixed(1).replace(".", ",")} %`;
}

// ── EL REPARTO ──────────────────────────────────────────────────────────

export type PhaseGroup = {
  /** null en el grupo «sin fase». `other` conserva la de cada evento. */
  phase: PhaseOfPlay | null;
  label: string;
  events: GameEvent[];
  total: number;
  /** Recuento por sector, listo para `FutsalPitch.counts`. */
  counts: Record<string, number>;
  /** Acciones que se pudieron dibujar. */
  located: number;
  /** Penaltis y dobles penaltis: su sitio lo fija el reglamento. */
  ruleDetermined: number;
  /** Ni dibujables ni reglamentarias. Se declaran, no se esconden. */
  unlocated: number;
  /** Subconjunto de `total` cuando la métrica es de tiros. Nunca se suma. */
  goals: number;
};

export type PhaseSplit = {
  metric: PhaseMetric;
  period?: Period;
  a: PhaseGroup;
  b: PhaseGroup;
  /** Fases registradas que NO son el par principal. No se corrigen. */
  other: PhaseGroup;
  /** Acciones sin fase. No pertenecen a ninguna. */
  unset: PhaseGroup;
  coverage: PhaseCoverage;
  total: number;
};

function buildGroup(
  phase: PhaseOfPlay | null,
  label: string,
  events: GameEvent[],
): PhaseGroup {
  // El MISMO motor espacial que la portada y la página de periodos, al que se
  // le entrega el subconjunto ya filtrado. Ni un recuento nuevo.
  const bucket = buildZone12Bucket(events);
  const counts = Object.fromEntries(
    (bucket?.zones ?? []).map((z) => [z.zone, z.total]),
  );
  const located = (bucket?.zones ?? []).reduce((acc, z) => acc + z.total, 0);
  const ruleDetermined = events.filter(hasRuleDeterminedOrigin).length;
  return {
    phase,
    label,
    events,
    total: events.length,
    counts,
    located,
    ruleDetermined,
    unlocated: Math.max(0, events.length - located - ruleDetermined),
    goals: events.filter(isShotGoal).length,
  };
}

/** Etiqueta del grupo «otras», con las fases que realmente contiene. */
export const OTHER_PHASES_LABEL = "Otras fases registradas";
export const UNSET_PHASE_LABEL = "Sin fase registrada";

/**
 * Reparte las acciones de una métrica en cuatro grupos que SIEMPRE cierran.
 *
 * `other` recoge las combinaciones que el par principal no cubre —una pérdida
 * estando ya replegados, un robo durante nuestro ataque posicional—. Existen,
 * las registró el operador y pueden ser ciertas; aquí no se corrigen, no se
 * reinterpretan y no se tiran. Son, además, el único síntoma observable de un
 * estado de fase que se quedó sin actualizar, así que esconderlas destruiría
 * el indicador.
 */
export function phaseSplit(
  matchData: MatchData,
  metric: PhaseMetric,
  period?: Period,
): PhaseSplit {
  const eventos = phaseMetricEvents(matchData, metric, period);
  const [fa, fb] = metric.phases;
  const enFase = (p: PhaseOfPlay) => eventos.filter((e) => e.phaseOfPlay === p);
  return {
    metric,
    period,
    a: buildGroup(fa, PHASE_LABEL[fa], enFase(fa)),
    b: buildGroup(fb, PHASE_LABEL[fb], enFase(fb)),
    other: buildGroup(
      null,
      OTHER_PHASES_LABEL,
      eventos.filter(
        (e) => e.phaseOfPlay !== undefined && e.phaseOfPlay !== fa && e.phaseOfPlay !== fb,
      ),
    ),
    unset: buildGroup(
      null,
      UNSET_PHASE_LABEL,
      eventos.filter((e) => e.phaseOfPlay === undefined),
    ),
    coverage: phaseCoverage(matchData, metric, period),
    total: eventos.length,
  };
}

/** Desglose nominal de «otras», para no dejarlo como un número sin cara. */
export function otherPhaseDetail(
  split: PhaseSplit,
): { phase: PhaseOfPlay; label: string; count: number }[] {
  const porFase = new Map<PhaseOfPlay, number>();
  for (const e of split.other.events) {
    if (!e.phaseOfPlay) continue;
    porFase.set(e.phaseOfPlay, (porFase.get(e.phaseOfPlay) ?? 0) + 1);
  }
  return [...porFase.entries()]
    .sort((x, y) => y[1] - x[1] || PHASE_LABEL[x[0]].localeCompare(PHASE_LABEL[y[0]]))
    .map(([phase, count]) => ({ phase, label: PHASE_LABEL[phase], count }));
}

// ── ESCALA DE COLOR ─────────────────────────────────────────────────────

/**
 * El máximo que COMPARTEN los dos mapas de una métrica.
 *
 * Sin esto, `FutsalPitch` normaliza cada pista contra su propio máximo y 6
 * pérdidas en ataque posicional se pintan igual de oscuras que 3 en
 * transición: el color diría que las dos fases fueron iguales cuando no lo
 * fueron. Es POR MÉTRICA y por conjunto visible: comparar la intensidad de las
 * pérdidas con la de los tiros no significa nada, y al filtrar por parte el
 * máximo se recalcula sobre lo que se está viendo.
 *
 * «Otras» y «sin fase» no entran: no se dibujan.
 */
export function phaseSharedMax(split: PhaseSplit): number {
  let max = 1;
  for (const grupo of [split.a, split.b]) {
    for (const n of Object.values(grupo.counts)) {
      if (n > max) max = n;
    }
  }
  return max;
}

// ── RECONCILIACIÓN ──────────────────────────────────────────────────────

/**
 * La línea que cierra el total. Si no cerrara, el mapa estaría escondiendo
 * acciones, que es exactamente lo que esta página existe para no hacer.
 */
export function reconcilePhaseMetric(split: PhaseSplit): string {
  const partes = [
    `${split.a.label} ${split.a.total}`,
    `${split.b.label} ${split.b.total}`,
  ];
  if (split.other.total > 0) partes.push(`${OTHER_PHASES_LABEL.toLowerCase()} ${split.other.total}`);
  if (split.unset.total > 0) partes.push(`sin fase ${split.unset.total}`);
  const goles = split.metric.key === "shots" || split.metric.key === "rivalShots"
    ? ` (incluye ${split.a.goals + split.b.goals + split.other.goals + split.unset.goals} gol${
        split.a.goals + split.b.goals + split.other.goals + split.unset.goals === 1 ? "" : "es"
      })`
    : "";
  return `${partes.join(" + ")} = ${split.total}${goles}`;
}

/** ¿Cuadra? Invariante comprobable, no una afirmación del comentario. */
export function phaseSplitBalances(split: PhaseSplit): boolean {
  const suma = split.a.total + split.b.total + split.other.total + split.unset.total;
  const grupos = [split.a, split.b, split.other, split.unset].every(
    (g) => g.located + g.ruleDetermined + g.unlocated === g.total,
  );
  return suma === split.total && grupos;
}

// ── PERIODOS ────────────────────────────────────────────────────────────

/**
 * Las partes que el selector puede ofrecer, sin el TOTAL.
 *
 * Las dos reglamentarias siempre; cualquier otra solo si el partido la jugó,
 * de modo que una prórroga aparece y un partido sin ella no estrena un botón
 * vacío. Mismo criterio que `shotMapPeriods` y `periodZonePeriods`.
 */
export function phasePeriods(matchData: MatchData): Period[] {
  const extra = new Set<Period>();
  for (const e of matchData.events || []) {
    if (typeof e.period !== "number") continue;
    if (e.period === Period.FINISHED) continue;
    if (e.period !== Period.FIRST && e.period !== Period.SECOND) extra.add(e.period);
  }
  return [Period.FIRST, Period.SECOND, ...[...extra].sort((a, b) => a - b)];
}

/**
 * Acciones de un grupo que no caen en ninguna de las partes listadas.
 *
 * Solo puede pasar en un JSON antiguo al que le falte `period`: la captura
 * actual siempre lo escribe. Si sale mayor que cero, el total NO es la suma
 * de las partes y hay que decirlo en vez de dejar que el lector sume mal.
 */
export function phaseResidualByPeriod(
  matchData: MatchData,
  metric: PhaseMetric,
  phase: PhaseOfPlay,
): number {
  const conFase = (period?: Period) =>
    phaseMetricEvents(matchData, metric, period).filter((e) => e.phaseOfPlay === phase).length;
  const global = conFase();
  const porPartes = phasePeriods(matchData).reduce((acc, p) => acc + conFase(p), 0);
  return Math.max(0, global - porPartes);
}

// ── ¿HAY ALGO QUE ENSEÑAR? ──────────────────────────────────────────────

/**
 * Un partido tiene análisis de fase cuando alguna acción relevante la trae
 * registrada.
 *
 * Los históricos quedan fuera por partida doble: son anteriores a PR #24A, así
 * que ninguno tiene fase, y además usan la rejilla de 9 celdas, cuya
 * perspectiva no se registró. Ninguno debe ganar páginas ni mapas vacíos.
 */
export function hasPhaseData(matchData: MatchData): boolean {
  const eventos = matchData.events || [];
  if (isLegacyMatch(eventos)) return false;
  return PHASE_METRICS.some((m) =>
    phaseMetricEvents(matchData, m).some((e) => e.phaseOfPlay !== undefined),
  );
}
