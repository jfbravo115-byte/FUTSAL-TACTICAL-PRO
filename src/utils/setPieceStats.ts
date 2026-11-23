/**
 * src/utils/setPieceStats.ts
 *
 * LAS CIFRAS DE LAS JUGADAS A BALÓN PARADO. Fuente única.
 *
 * Pantalla, informe, CSV, Tactical Pro y PDF leen de aquí. Ninguno vuelve a
 * filtrar eventos por su cuenta: el día que dos consumidores cuenten las
 * bandas de dos maneras, el informe y el PDF dirán números distintos para el
 * mismo partido y nadie sabrá cuál creer.
 *
 * QUÉ CUENTA Y QUÉ NO
 * -------------------
 * Cuenta REANUDACIONES —córners, faltas a favor y saques de banda— y cómo
 * acabaron. No cuenta tiros, goles ni pérdidas como tales: esos siguen
 * sumando en sus agregados de siempre (`shotModel`, `goalModel`, informe).
 * Aquí solo se dice cuántos de ellos NACIERON de una reanudación.
 *
 *   - un córner que acaba en tiro: 1 córner aquí, 1 tiro en `shotModel`
 *   - el `sequenceId` nunca suma: solo dice qué eventos van juntos
 *   - los goles se atribuyen con `goalModel`, nunca a mano
 *
 * HISTÓRICOS, SIN INVENTAR
 * ------------------------
 * El TOTAL incluye las reanudaciones de partidos anteriores, que no tienen
 * jugada registrada: así «córners» dice aquí lo mismo que `summarizeCorners`.
 * Pero de esas no se sabe la modalidad, ni el desenlace, ni quién sacó, así
 * que no entran en esos desgloses: se cuentan aparte en `unrecorded`. Todas
 * las proporciones se calculan sobre `recorded`, que es donde el dato existe.
 */
import { ActionType, GameEvent } from "../types/futsal";
import { isCornerSide } from "./cornerModel";
import { isZone12Id } from "./fieldZones";
import { isGoalEvent, scoresFor } from "./goalModel";
import {
  SEQUENCE_OUTCOMES,
  SequenceOutcome,
  SetPieceModality,
  SetPieceRootKind,
  THROW_IN_SECTORS,
  ThrowInSector,
  ThrowInSide,
  finisherIdOf,
  isSequenceRoot,
  modalityOf,
  rootKindOf,
  sequenceIdOf,
  sequenceOutcomeOf,
  takerIdOf,
  throwInSectorOf,
  throwInSideOf,
} from "./setPieceSequence";

// ── TIPOS ───────────────────────────────────────────────────────────────

/** Un jugador y cuántas veces aparece. */
export type PlayerTally = { playerId: string; count: number };

export type OutcomeTally = Record<SequenceOutcome, number>;

/** Lo común a las tres reanudaciones. */
export type SetPieceRootStats = {
  /** Todas las reanudaciones del bando, con o sin jugada registrada. */
  total: number;
  /** Las que tienen jugada registrada: de estas se conoce el resto. */
  recorded: number;
  /** Las de partidos anteriores o sin ventana: solo cuentan en el total. */
  unrecorded: number;
  byModality: Partial<Record<SetPieceModality, number>>;
  outcomes: OutcomeTally;
  /** Remates nacidos de la reanudación: tiros MÁS goles (un gol es un remate). */
  attempts: number;
  /** Goles que subieron al marcador de este bando, según `goalModel`. */
  goals: number;
  /** Pérdidas registradas como desenlace de la reanudación. */
  losses: number;
  takers: PlayerTally[];
  /** Reanudaciones registradas cuyo sacador no se identificó. */
  unidentifiedTakers: number;
  /** Quien remató, en las que acabaron en tiro o gol. */
  finishers: PlayerTally[];
  unidentifiedFinishers: number;
  /** Proporciones sobre `recorded`. null si no hay ninguna registrada. */
  attemptRate: number | null;
  goalRate: number | null;
  lossRate: number | null;
};

export type CornerStats = SetPieceRootStats & {
  bySide: { left: number; right: number; unknown: number };
};

export type FreeKickStats = SetPieceRootStats & {
  /** Zona de 12 desde la perspectiva de quien saca. Sin zona → `unknown`. */
  byZone: Record<string, number>;
};

export type ThrowInStats = SetPieceRootStats & {
  bySide: { left: number; right: number; unknown: number };
  bySector: Record<ThrowInSector, number>;
  /** Banda × sector, para pintarlo en una mini pista. */
  byCell: Record<string, number>;
  /** Bandas que nacieron de un despeje del portero. */
  afterDeflect: number;
};

export type SideSetPieceStats = {
  corner: CornerStats;
  freeKick: FreeKickStats;
  throwIn: ThrowInStats;
};

export type SetPieceSequenceStats = {
  team: SideSetPieceStats;
  opponent: SideSetPieceStats;
};

// ── QUÉ EVENTO ES UNA REANUDACIÓN ───────────────────────────────────────

/**
 * ¿Es este evento la reanudación de una de las tres clases?
 *
 * Una jugada registrada lo dice en `sequenceRoot`. Un evento histórico lo
 * dice su tipo: todo CORNER es un córner; un SET_PIECE es una falta a favor
 * solo si declara `setPieceOrigin: 'free_kick'` —el único vocabulario que
 * existía—; THROW_IN no existía, así que siempre es nuevo. El desenlace de
 * una jugada NUNCA es una reanudación: un gol de córner no es otro córner.
 */
export function setPieceRootKindOf(event: GameEvent): SetPieceRootKind | null {
  if (sequenceIdOf(event)) {
    return isSequenceRoot(event) ? rootKindOf(event) : null;
  }
  if (event.type === ActionType.CORNER) return "corner";
  if (event.type === ActionType.THROW_IN) return "throw_in";
  if (event.type === ActionType.SET_PIECE && event.metadata?.setPieceOrigin === "free_kick") {
    return "free_kick";
  }
  return null;
}

// ── CONSTRUCCIÓN ────────────────────────────────────────────────────────

function vacioDeDesenlaces(): OutcomeTally {
  return Object.fromEntries(SEQUENCE_OUTCOMES.map((o) => [o, 0])) as OutcomeTally;
}

function contarJugadores(ids: string[]): PlayerTally[] {
  const mapa = new Map<string, number>();
  for (const id of ids) mapa.set(id, (mapa.get(id) ?? 0) + 1);
  return [...mapa.entries()]
    .map(([playerId, count]) => ({ playerId, count }))
    .sort((a, b) => b.count - a.count || a.playerId.localeCompare(b.playerId));
}

const proporcion = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);

/**
 * Lo común de las tres reanudaciones, para un bando.
 *
 * `raices` son ya solo las de esta clase y este bando. Los desenlaces se
 * leen de la propia jugada, por su `sequenceId`, nunca por cercanía.
 */
function resumirRaices(
  raices: GameEvent[],
  events: GameEvent[],
  lado: "team" | "opponent",
): SetPieceRootStats {
  const conJugada = raices.filter((e) => sequenceIdOf(e) !== null);
  const outcomes = vacioDeDesenlaces();
  const byModality: Partial<Record<SetPieceModality, number>> = {};
  const sacadores: string[] = [];
  const finalizadores: string[] = [];
  let unidentifiedTakers = 0;
  let unidentifiedFinishers = 0;
  let goals = 0;

  for (const raiz of conJugada) {
    const id = sequenceIdOf(raiz)!;
    const desenlace = sequenceOutcomeOf(raiz);
    if (desenlace) outcomes[desenlace] += 1;
    const modalidad = modalityOf(raiz);
    if (modalidad) byModality[modalidad] = (byModality[modalidad] ?? 0) + 1;

    const sacador = takerIdOf(raiz);
    if (sacador) sacadores.push(sacador);
    else unidentifiedTakers += 1;

    if (desenlace === "shot" || desenlace === "goal") {
      const finalizador = finisherIdOf(events, id);
      if (finalizador) finalizadores.push(finalizador);
      else unidentifiedFinishers += 1;
    }

    // El gol de la jugada, contado por `goalModel`: lo que sube al marcador
    // de este bando. Nunca se suma «porque el desenlace dice gol».
    goals += events.filter(
      (e) => sequenceIdOf(e) === id && isGoalEvent(e) && scoresFor(e, lado),
    ).length;
  }

  const recorded = conJugada.length;
  const attempts = outcomes.shot + outcomes.goal;
  return {
    total: raices.length,
    recorded,
    unrecorded: raices.length - recorded,
    byModality,
    outcomes,
    attempts,
    goals,
    losses: outcomes.loss,
    takers: contarJugadores(sacadores),
    unidentifiedTakers,
    finishers: contarJugadores(finalizadores),
    unidentifiedFinishers,
    attemptRate: proporcion(attempts, recorded),
    goalRate: proporcion(goals, recorded),
    lossRate: proporcion(outcomes.loss, recorded),
  };
}

function resumirBando(events: GameEvent[], opponent: boolean): SideSetPieceStats {
  const lado = opponent ? "opponent" : "team";
  const delBando = events.filter((e) => !!e.metadata?.isOpponent === opponent);
  const de = (kind: SetPieceRootKind) =>
    delBando.filter((e) => setPieceRootKindOf(e) === kind);

  const corners = de("corner");
  const freeKicks = de("free_kick");
  const throwIns = de("throw_in");

  const cornerSide = { left: 0, right: 0, unknown: 0 };
  for (const c of corners) {
    const s = c.metadata?.cornerSide;
    if (isCornerSide(s)) cornerSide[s] += 1;
    else cornerSide.unknown += 1;
  }

  const byZone: Record<string, number> = {};
  for (const f of freeKicks) {
    const z = isZone12Id(f.originGrid) ? f.originGrid : "unknown";
    byZone[z] = (byZone[z] ?? 0) + 1;
  }

  const throwSide = { left: 0, right: 0, unknown: 0 };
  const bySector = Object.fromEntries(THROW_IN_SECTORS.map((s) => [s, 0])) as Record<
    ThrowInSector,
    number
  >;
  const byCell: Record<string, number> = {};
  let afterDeflect = 0;
  for (const t of throwIns) {
    const s = throwInSideOf(t);
    const z = throwInSectorOf(t);
    if (s) throwSide[s] += 1;
    else throwSide.unknown += 1;
    if (z) bySector[z] += 1;
    if (s && z) {
      const celda = throwInCellKey(s, z);
      byCell[celda] = (byCell[celda] ?? 0) + 1;
    }
    if (typeof t.metadata?.fromDeflectEventId === "string") afterDeflect += 1;
  }

  return {
    corner: { ...resumirRaices(corners, events, lado), bySide: cornerSide },
    freeKick: { ...resumirRaices(freeKicks, events, lado), byZone },
    throwIn: {
      ...resumirRaices(throwIns, events, lado),
      bySide: throwSide,
      bySector,
      byCell,
      afterDeflect,
    },
  };
}

/** La clave de una celda de la mini pista de banda: `left-Z3`. */
export function throwInCellKey(side: ThrowInSide, sector: ThrowInSector): string {
  return `${side}-${sector}`;
}

/**
 * Las cifras de balón parado de un partido, por bando.
 *
 * Nuestro equipo y el rival por separado, siempre: mezclarlos daría un
 * «córners del partido» que no responde a ninguna pregunta útil.
 */
export function summarizeSetPieceSequences(events: GameEvent[]): SetPieceSequenceStats {
  const lista = events || [];
  return {
    team: resumirBando(lista, false),
    opponent: resumirBando(lista, true),
  };
}

// ── INVARIANTES ─────────────────────────────────────────────────────────

/**
 * Comprobaciones que tienen que cumplirse siempre. Vacío = todo en orden.
 *
 * Son la red de seguridad del doble conteo: si alguna vez una jugada
 * produjera dos remates, o una reanudación contara más desenlaces de los
 * que tiene, se vería aquí antes que en una cifra del informe.
 */
export function setPieceStatsViolations(events: GameEvent[]): string[] {
  const fallos: string[] = [];
  const stats = summarizeSetPieceSequences(events);
  for (const lado of ["team", "opponent"] as const) {
    for (const clase of ["corner", "freeKick", "throwIn"] as const) {
      const s = stats[lado][clase];
      const suma = Object.values(s.outcomes).reduce((a, b) => a + b, 0);
      if (suma > s.recorded) fallos.push(`${lado}.${clase}: más desenlaces que jugadas`);
      if (s.recorded + s.unrecorded !== s.total) fallos.push(`${lado}.${clase}: total descuadrado`);
      if (s.goals > s.outcomes.goal) fallos.push(`${lado}.${clase}: más goles que jugadas acabadas en gol`);
      const sacadores = s.takers.reduce((a, t) => a + t.count, 0) + s.unidentifiedTakers;
      if (sacadores !== s.recorded) fallos.push(`${lado}.${clase}: sacadores descuadrados`);
    }
  }
  // Ninguna jugada con dos remates: un gol nunca va acompañado de un tiro.
  const remates = new Map<string, number>();
  for (const e of events || []) {
    const id = sequenceIdOf(e);
    if (id && (e.type === ActionType.SHOT || e.type === ActionType.GOAL)) {
      remates.set(id, (remates.get(id) ?? 0) + 1);
    }
  }
  for (const [id, n] of remates) if (n > 1) fallos.push(`${id}: ${n} remates en una jugada`);
  return fallos;
}
