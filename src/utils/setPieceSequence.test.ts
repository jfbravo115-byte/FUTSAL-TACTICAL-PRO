/**
 * La jugada a balón parado como una sola cosa.
 *
 * LO QUE ESTOS TESTS PROTEGEN
 * ---------------------------
 * Que relacionar NO sea contar. El día que `sequenceId` empiece a sumar en
 * algún agregado, el partido dirá más córners de los que hubo o más tiros de
 * los que se hicieron, y eso no se ve en una pantalla: se ve meses después,
 * en un informe, cuando ya nadie recuerda qué cambió.
 *
 * Y que los partidos de antes sigan leyéndose igual. Ninguno tiene
 * `sequenceId`, ninguno puede tener `THROW_IN`, y ninguno se migra.
 */
import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, GoalieAction, Period } from "../types/futsal";
import {
  MODALITIES_BY_ROOT,
  SET_PIECE_SEQUENCE_PREFIX,
  SetPieceSequenceDraft,
  allSequencesWellFormed,
  allowsModality,
  buildSequenceSeeds,
  describeSequence,
  eventIdsToDeleteWith,
  eventsOfSequence,
  finisherIdOf,
  groupTimeline,
  newSetPieceSequenceId,
  outcomeCreatesEvent,
  rootKindOf,
  sameSequence,
  sequenceIdOf,
  sequenceIdsIn,
  sequenceIsWellFormed,
  sequenceOutcomeOf,
  takerIdOf,
  throwInOriginGrid,
} from "./setPieceSequence";

let seq = 0;

/** Materializa las semillas como lo hará la captura: contexto compartido. */
function materializar(semillas: ReturnType<typeof buildSequenceSeeds>): GameEvent[] {
  return semillas.map((s) => ({
    id: `e${++seq}`,
    timestamp: 120_000,
    wallClock: 1_000 + seq,
    period: Period.FIRST,
    playerIds: s.playerId ? [s.playerId] : [],
    onPitchPlayerIds: ["l1", "l2", "r1"],
    type: s.type,
    gameState: "4vs4" as never,
    phaseOfPlay: "attack_positional" as never,
    attackDirection: "ltr" as never,
    ...(s.originGrid ? { originGrid: s.originGrid } : {}),
    ...(s.destinationGrid ? { destinationGrid: s.destinationGrid } : {}),
    metadata: s.metadata as Record<string, unknown>,
  })) as GameEvent[];
}

const construir = (draft: SetPieceSequenceDraft) => {
  const id = newSetPieceSequenceId();
  return { id, eventos: materializar(buildSequenceSeeds(draft, id)) };
};

// ── IDENTIDAD ───────────────────────────────────────────────────────────

describe("identidad de la secuencia", () => {
  it("el identificador se reconoce a simple vista y nunca se repite", () => {
    const a = newSetPieceSequenceId();
    const b = newSetPieceSequenceId();
    expect(a.startsWith(SET_PIECE_SEQUENCE_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("un evento SIN sequenceId es un evento histórico independiente", () => {
    const viejo = { id: "v1", type: ActionType.CORNER, metadata: {} } as unknown as GameEvent;
    expect(sequenceIdOf(viejo)).toBeNull();
    expect(sequenceIdsIn([viejo])).toEqual([]);
    // Y no se empareja con nada, por cerca que esté en el reloj.
    const otro = { id: "v2", type: ActionType.SHOT, metadata: {} } as unknown as GameEvent;
    expect(sameSequence(viejo, otro)).toBe(false);
  });

  it("una cadena vacía no es un identificador", () => {
    expect(sequenceIdOf({ metadata: { sequenceId: "" } } as unknown as GameEvent)).toBeNull();
    expect(sequenceIdOf({ metadata: { sequenceId: "   " } } as unknown as GameEvent)).toBeNull();
  });
});

// ── CÓRNER ──────────────────────────────────────────────────────────────

describe("córner", () => {
  it("un córner que acaba en tiro son UN córner y UN tiro", () => {
    const { id, eventos } = construir({
      root: "corner",
      isOpponent: false,
      modality: "prepared",
      outcome: "shot",
      cornerSide: "left",
      takerId: "l1",
      shot: { finisherId: "l2", destinationGrid: "G5" },
    });
    expect(eventos.filter((e) => e.type === ActionType.CORNER)).toHaveLength(1);
    expect(eventos.filter((e) => e.type === ActionType.SHOT)).toHaveLength(1);
    expect(eventos.filter((e) => e.type === ActionType.GOAL)).toHaveLength(0);
    expect(sequenceIsWellFormed(eventos, id)).toBe(true);
  });

  it("un córner que acaba en gol NO crea además un tiro", () => {
    const { id, eventos } = construir({
      root: "corner",
      isOpponent: false,
      modality: "direct",
      outcome: "goal",
      cornerSide: "right",
      takerId: "l1",
      shot: { finisherId: "l1", destinationGrid: "G1" },
    });
    expect(eventos.filter((e) => e.type === ActionType.GOAL)).toHaveLength(1);
    expect(eventos.filter((e) => e.type === ActionType.SHOT)).toHaveLength(0);
    expect(eventos).toHaveLength(2);
    expect(sequenceIsWellFormed(eventos, id)).toBe(true);
  });

  it("el córner lleva su lado, su celda de 12 zonas y su modalidad", () => {
    const { eventos } = construir({
      root: "corner",
      isOpponent: false,
      modality: "direct",
      outcome: "none",
      cornerSide: "left",
    });
    const raiz = eventos[0];
    expect(raiz.metadata?.cornerSide).toBe("left");
    expect(raiz.originGrid).toBeTruthy();
    expect(raiz.metadata?.setPieceModality).toBe("direct");
    // El vocabulario que ya entienden los agregados de córner.
    expect(raiz.metadata?.setPieceOutcome).toBe("shot");
  });

  it("el tiro declara que procede de un córner", () => {
    const { eventos } = construir({
      root: "corner",
      isOpponent: false,
      modality: "prepared",
      outcome: "shot",
      cornerSide: "left",
      shot: { finisherId: "l2" },
    });
    expect(eventos[1].metadata?.setPiece).toBe("corner");
  });
});

// ── FALTA ───────────────────────────────────────────────────────────────

describe("falta a favor", () => {
  it("la falta jugada conserva su vocabulario de siempre", () => {
    const { eventos } = construir({
      root: "free_kick",
      isOpponent: false,
      modality: "prepared",
      outcome: "keep",
      originGrid: "Z3C",
      takerId: "l1",
    });
    const raiz = eventos[0];
    expect(raiz.type).toBe(ActionType.SET_PIECE);
    expect(raiz.metadata?.setPieceOrigin).toBe("free_kick");
    expect(raiz.metadata?.setPieceOutcome).toBe("play");
    expect(raiz.originGrid).toBe("Z3C");
  });

  it("una falta que acaba en gol son UNA falta y UN gol", () => {
    const { id, eventos } = construir({
      root: "free_kick",
      isOpponent: false,
      modality: "direct",
      outcome: "goal",
      originGrid: "Z4C",
      takerId: "l1",
      shot: { finisherId: "l1", destinationGrid: "G2" },
    });
    expect(eventos.filter((e) => e.type === ActionType.SET_PIECE)).toHaveLength(1);
    expect(eventos.filter((e) => e.type === ActionType.GOAL)).toHaveLength(1);
    expect(eventos.filter((e) => e.type === ActionType.SHOT)).toHaveLength(0);
    expect(sequenceIsWellFormed(eventos, id)).toBe(true);
  });
});

// ── SAQUE DE BANDA ──────────────────────────────────────────────────────

describe("saque de banda", () => {
  it("de banda NO se puede tirar directo: la modalidad no existe", () => {
    expect(allowsModality("throw_in", "direct")).toBe(false);
    expect(allowsModality("throw_in", "quick")).toBe(true);
    expect(allowsModality("throw_in", "prepared")).toBe(true);
    expect(MODALITIES_BY_ROOT.throw_in).not.toContain("direct");
    // Y en el córner y la falta sí.
    expect(allowsModality("corner", "direct")).toBe(true);
    expect(allowsModality("free_kick", "direct")).toBe(true);
  });

  it("la banda lleva lado y sector, normalizados desde quien saca", () => {
    const { eventos } = construir({
      root: "throw_in",
      isOpponent: true,
      modality: "quick",
      outcome: "keep",
      throwInSide: "left",
      throwInSector: "Z3",
      takerId: "r1",
    });
    const raiz = eventos[0];
    expect(raiz.type).toBe(ActionType.THROW_IN);
    expect(raiz.metadata?.throwInSide).toBe("left");
    expect(raiz.metadata?.throwInSector).toBe("Z3");
    expect(raiz.metadata?.isOpponent).toBe(true);
  });

  it("el sector y la banda se traducen a la celda de 12 zonas", () => {
    expect(throwInOriginGrid("left", "Z1")).toBe("Z1L");
    expect(throwInOriginGrid("right", "Z4")).toBe("Z4R");
    expect(throwInOriginGrid("left", "Z3")).toBe("Z3L");
    expect(throwInOriginGrid("right", "Z2")).toBe("Z2R");
  });

  it("una banda que acaba en pérdida son UNA banda y UNA pérdida", () => {
    const { id, eventos } = construir({
      root: "throw_in",
      isOpponent: false,
      modality: "quick",
      outcome: "loss",
      throwInSide: "right",
      throwInSector: "Z2",
      takerId: "l1",
      loss: { playerId: "l1", subType: "bad_pass" },
    });
    expect(eventos.filter((e) => e.type === ActionType.THROW_IN)).toHaveLength(1);
    const perdidas = eventos.filter((e) => e.type === ActionType.LOSS);
    expect(perdidas).toHaveLength(1);
    expect(perdidas[0].metadata?.subType).toBe("bad_pass");
    expect(sequenceIsWellFormed(eventos, id)).toBe(true);
  });

  it("una pérdida «no identificada» no inventa un subtipo", () => {
    const { eventos } = construir({
      root: "throw_in",
      isOpponent: false,
      modality: "quick",
      outcome: "loss",
      throwInSide: "left",
      throwInSector: "Z1",
      loss: { subType: "unknown" },
    });
    const perdida = eventos.find((e) => e.type === ActionType.LOSS)!;
    expect(perdida.metadata?.subType).toBeUndefined();
    expect(perdida.metadata?.throwInLossSubType).toBe("unknown");
  });

  it("una banda que acaba en gol son UNA banda y UN gol, sin tiro", () => {
    const { eventos } = construir({
      root: "throw_in",
      isOpponent: false,
      modality: "prepared",
      outcome: "goal",
      throwInSide: "left",
      throwInSector: "Z4",
      takerId: "l1",
      shot: { finisherId: "l2", destinationGrid: "G3" },
    });
    expect(eventos.filter((e) => e.type === ActionType.THROW_IN)).toHaveLength(1);
    expect(eventos.filter((e) => e.type === ActionType.GOAL)).toHaveLength(1);
    expect(eventos.filter((e) => e.type === ActionType.SHOT)).toHaveLength(0);
    // El remate dice de dónde viene.
    expect(eventos[1].metadata?.setPiece).toBe("throw_in");
  });
});

// ── SACADOR Y FINALIZADOR ───────────────────────────────────────────────

describe("quién saca y quién finaliza", () => {
  it("pueden ser jugadores distintos y no se confunden", () => {
    const { id, eventos } = construir({
      root: "corner",
      isOpponent: false,
      modality: "prepared",
      outcome: "goal",
      cornerSide: "left",
      takerId: "l1",
      shot: { finisherId: "l2" },
    });
    expect(takerIdOf(eventos[0])).toBe("l1");
    expect(finisherIdOf(eventos, id)).toBe("l2");
  });

  it("el sacador puede no identificarse, y entonces no se inventa", () => {
    const { id, eventos } = construir({
      root: "throw_in",
      isOpponent: false,
      modality: "quick",
      outcome: "keep",
      throwInSide: "left",
      throwInSector: "Z2",
    });
    expect(takerIdOf(eventos[0])).toBeNull();
    expect(eventos[0].playerIds).toEqual([]);
    expect(describeSequence(eventos, id)!.takerId).toBeNull();
  });

  it("el finalizador puede no identificarse sin romper la jugada", () => {
    const { id, eventos } = construir({
      root: "corner",
      isOpponent: false,
      modality: "prepared",
      outcome: "shot",
      cornerSide: "right",
      takerId: "l1",
      shot: {},
    });
    expect(finisherIdOf(eventos, id)).toBeNull();
    expect(sequenceIsWellFormed(eventos, id)).toBe(true);
  });
});

// ── DESENLACES QUE NO CREAN EVENTO ──────────────────────────────────────

describe("desenlaces sin evento enlazado", () => {
  it("conservar, bloquear, encadenar y no registrar no crean eventos", () => {
    for (const outcome of ["keep", "blocked", "new_set_piece", "none"] as const) {
      expect(outcomeCreatesEvent(outcome)).toBe(false);
      const { id, eventos } = construir({
        root: "corner",
        isOpponent: false,
        modality: "prepared",
        outcome,
        cornerSide: "left",
      });
      expect(eventos, outcome).toHaveLength(1);
      expect(sequenceOutcomeOf(eventos[0])).toBe(outcome);
      expect(sequenceIsWellFormed(eventos, id)).toBe(true);
    }
  });

  it("tiro, gol y pérdida sí lo crean", () => {
    expect(outcomeCreatesEvent("shot")).toBe(true);
    expect(outcomeCreatesEvent("goal")).toBe(true);
    expect(outcomeCreatesEvent("loss")).toBe(true);
  });
});

// ── ATOMICIDAD ──────────────────────────────────────────────────────────

describe("la jugada se borra entera o no se borra", () => {
  it("borrar el gol se lleva también el córner", () => {
    const { eventos } = construir({
      root: "corner",
      isOpponent: false,
      modality: "prepared",
      outcome: "goal",
      cornerSide: "left",
      takerId: "l1",
      shot: { finisherId: "l2" },
    });
    const gol = eventos.find((e) => e.type === ActionType.GOAL)!;
    const aBorrar = eventIdsToDeleteWith(eventos, gol.id);
    expect(aBorrar).toHaveLength(2);
    expect(aBorrar).toContain(eventos[0].id);
  });

  it("y borrar el córner se lleva también el gol", () => {
    const { eventos } = construir({
      root: "corner",
      isOpponent: false,
      modality: "prepared",
      outcome: "goal",
      cornerSide: "left",
      shot: { finisherId: "l2" },
    });
    expect(eventIdsToDeleteWith(eventos, eventos[0].id)).toHaveLength(2);
  });

  it("un evento histórico suelto se borra solo él", () => {
    const viejo = { id: "v1", type: ActionType.CORNER, metadata: {} } as unknown as GameEvent;
    expect(eventIdsToDeleteWith([viejo], "v1")).toEqual(["v1"]);
  });

  it("borrar algo que no existe no borra nada", () => {
    expect(eventIdsToDeleteWith([], "fantasma")).toEqual([]);
  });

  it("todos los eventos de la jugada comparten el identificador", () => {
    const { id, eventos } = construir({
      root: "throw_in",
      isOpponent: false,
      modality: "prepared",
      outcome: "shot",
      throwInSide: "left",
      throwInSector: "Z3",
      takerId: "l1",
      shot: { finisherId: "l2" },
    });
    expect(eventsOfSequence(eventos, id)).toHaveLength(2);
    expect(eventos.every((e) => sequenceIdOf(e) === id)).toBe(true);
    expect(sameSequence(eventos[0], eventos[1])).toBe(true);
  });
});

// ── BIEN FORMADA ────────────────────────────────────────────────────────

describe("una jugada mal formada se detecta", () => {
  const base = () =>
    construir({
      root: "corner",
      isOpponent: false,
      modality: "prepared",
      outcome: "goal",
      cornerSide: "left",
      shot: { finisherId: "l2" },
    });

  it("dos remates en la misma jugada no pasan", () => {
    const { id, eventos } = base();
    const duplicado = {
      ...eventos[1],
      id: "duplicado",
      type: ActionType.SHOT,
    } as GameEvent;
    expect(sequenceIsWellFormed([...eventos, duplicado], id)).toBe(false);
  });

  it("dos raíces no pasan", () => {
    const { id, eventos } = base();
    const otraRaiz = { ...eventos[0], id: "otra" } as GameEvent;
    expect(sequenceIsWellFormed([...eventos, otraRaiz], id)).toBe(false);
  });

  it("una jugada sin raíz no pasa", () => {
    const { id, eventos } = base();
    expect(sequenceIsWellFormed([eventos[1]], id)).toBe(false);
  });

  it("un partido entero sin jugadas registradas está bien formado", () => {
    const viejo = { id: "v1", type: ActionType.CORNER, metadata: {} } as unknown as GameEvent;
    expect(allSequencesWellFormed([viejo])).toBe(true);
  });

  it("y uno con jugadas correctas también", () => {
    const a = base();
    const b = construir({
      root: "throw_in",
      isOpponent: true,
      modality: "quick",
      outcome: "loss",
      throwInSide: "right",
      throwInSector: "Z1",
      loss: { subType: "intercepted" },
    });
    expect(allSequencesWellFormed([...a.eventos, ...b.eventos])).toBe(true);
  });
});

// ── TARJETA ÚNICA ───────────────────────────────────────────────────────

describe("la jugada se presenta como una sola tarjeta", () => {
  it("dice tipo, equipo, sitio, modalidad, quién y desenlace", () => {
    const { id, eventos } = construir({
      root: "throw_in",
      isOpponent: false,
      modality: "prepared",
      outcome: "goal",
      throwInSide: "left",
      throwInSector: "Z4",
      takerId: "l1",
      shot: { finisherId: "l2" },
    });
    const card = describeSequence(eventos, id)!;
    expect(card.rootLabel).toBe("Saque de banda");
    expect(card.isOpponent).toBe(false);
    expect(card.locationLabel).toBe("Banda izquierda · Z4");
    expect(card.modalityLabel).toBe("Jugada preparada");
    expect(card.takerId).toBe("l1");
    expect(card.finisherId).toBe("l2");
    expect(card.outcomeLabel).toBe("Gol");
    // Los eventos internos SIGUEN existiendo: alimentan las cifras.
    expect(card.eventIds).toHaveLength(2);
  });

  it("el córner dice de qué lado", () => {
    const { id, eventos } = construir({
      root: "corner",
      isOpponent: true,
      modality: "direct",
      outcome: "blocked",
      cornerSide: "right",
    });
    const card = describeSequence(eventos, id)!;
    expect(card.locationLabel).toBe("Córner derecho");
    expect(card.isOpponent).toBe(true);
    expect(card.outcomeLabel).toBe("Bloqueo / despeje");
  });

  it("una secuencia sin raíz no produce tarjeta inventada", () => {
    const { id, eventos } = construir({
      root: "corner",
      isOpponent: false,
      modality: "prepared",
      outcome: "shot",
      cornerSide: "left",
      shot: { finisherId: "l2" },
    });
    expect(describeSequence([eventos[1]], id)).toBeNull();
  });

  it("lee el tipo de raíz de vuelta", () => {
    const { eventos } = construir({
      root: "free_kick",
      isOpponent: false,
      modality: "direct",
      outcome: "none",
      originGrid: "Z3L",
    });
    expect(rootKindOf(eventos[0])).toBe("free_kick");
    expect(describeSequence(eventos, sequenceIdOf(eventos[0])!)!.locationLabel).toBe(
      "Falta en Z3L",
    );
  });
});

// ── EL ENLACE CON EL DESPEJE ────────────────────────────────────────────

describe("la banda que nace de un despeje", () => {
  it("conserva la relación con el despeje y no inventa pérdida ni recuperación", () => {
    const { eventos } = construir({
      root: "throw_in",
      isOpponent: false,
      modality: "quick",
      outcome: "keep",
      throwInSide: "left",
      throwInSector: "Z1",
      fromDeflectEventId: "despeje-7",
    });
    expect(eventos[0].metadata?.fromDeflectEventId).toBe("despeje-7");
    expect(eventos.some((e) => e.type === ActionType.LOSS)).toBe(false);
    expect(eventos.some((e) => e.type === ActionType.STEAL)).toBe(false);
    expect(eventos.some((e) => e.type === ActionType.INTERCEPTION)).toBe(false);
  });
});

// ── EL CONTEXTO ES COMPARTIDO ───────────────────────────────────────────

describe("todos los eventos enlazados comparten contexto", () => {
  it("reloj, periodo, fase, dirección, bando y jugadores en pista", () => {
    const { eventos } = construir({
      root: "corner",
      isOpponent: false,
      modality: "prepared",
      outcome: "goal",
      cornerSide: "left",
      takerId: "l1",
      shot: { finisherId: "l2" },
    });
    const [a, b] = eventos;
    expect(b.timestamp).toBe(a.timestamp);
    expect(b.period).toBe(a.period);
    expect(b.phaseOfPlay).toBe(a.phaseOfPlay);
    expect(b.attackDirection).toBe(a.attackDirection);
    expect(b.metadata?.isOpponent).toBe(a.metadata?.isOpponent);
    expect(b.onPitchPlayerIds).toEqual(a.onPitchPlayerIds);
  });
});

// ── EL GOL EN PROPIA NO SE TOCA ─────────────────────────────────────────

describe("el gol en propia conserva su semántica", () => {
  it("la secuencia nunca lo produce: no es un remate de la jugada", () => {
    const todos = (["keep", "loss", "shot", "goal", "blocked", "new_set_piece", "none"] as const)
      .flatMap((outcome) =>
        buildSequenceSeeds(
          {
            root: "corner",
            isOpponent: false,
            modality: "prepared",
            outcome,
            cornerSide: "left",
          },
          "spseq-x",
        ),
      );
    expect(todos.some((s) => s.type === ActionType.OWN_GOAL)).toBe(false);
  });

  it("y un gol en propia suelto sigue siendo un evento independiente", () => {
    const propia = {
      id: "p1",
      type: ActionType.OWN_GOAL,
      metadata: { isOpponent: true },
    } as unknown as GameEvent;
    expect(sequenceIdOf(propia)).toBeNull();
    expect(eventIdsToDeleteWith([propia], "p1")).toEqual(["p1"]);
  });
});

// ── EL TIRO LLEVA SUS METADATOS DE SIEMPRE ──────────────────────────────

describe("el remate de la jugada es un remate normal", () => {
  it("portero objetivo, respuesta y destino viajan en el evento", () => {
    const { eventos } = construir({
      root: "corner",
      isOpponent: false,
      modality: "prepared",
      outcome: "shot",
      cornerSide: "left",
      shot: {
        finisherId: "l2",
        destinationGrid: "G8",
        targetGoalkeeperId: "r1",
        goalieResponse: GoalieAction.SAVE,
        originGrid: "Z4C",
      },
    });
    const tiro = eventos[1];
    expect(tiro.destinationGrid).toBe("G8");
    expect(tiro.originGrid).toBe("Z4C");
    expect(tiro.metadata?.targetGoalkeeperId).toBe("r1");
    expect(tiro.metadata?.goalieResponse).toBe(GoalieAction.SAVE);
  });

  it("sin zona propia, el remate hereda la de la reanudación", () => {
    const { eventos } = construir({
      root: "free_kick",
      isOpponent: false,
      modality: "direct",
      outcome: "shot",
      originGrid: "Z4L",
      shot: { finisherId: "l1" },
    });
    expect(eventos[1].originGrid).toBe("Z4L");
  });
});

// ── TIMELINE ────────────────────────────────────────────────────────────

describe("el historial pinta una fila por jugada", () => {
  it("agrupa los eventos de cada jugada sin perder ni duplicar ninguno", () => {
    const a = construir({
      root: "corner",
      isOpponent: false,
      modality: "prepared",
      outcome: "goal",
      cornerSide: "left",
      shot: { finisherId: "l2" },
    });
    const suelto = { id: "suelto", type: ActionType.STEAL, metadata: {} } as unknown as GameEvent;
    const b = construir({
      root: "throw_in",
      isOpponent: true,
      modality: "quick",
      outcome: "loss",
      throwInSide: "left",
      throwInSector: "Z2",
    });
    const lista = [...a.eventos, suelto, ...b.eventos];
    const filas = groupTimeline(lista);
    expect(filas.map((f) => f.kind)).toEqual(["sequence", "event", "sequence"]);
    const total = filas.reduce(
      (n, f) => n + (f.kind === "event" ? 1 : f.events.length),
      0,
    );
    expect(total).toBe(lista.length);
  });

  it("la jugada se coloca donde aparece su primer evento", () => {
    const a = construir({
      root: "corner",
      isOpponent: false,
      modality: "prepared",
      outcome: "shot",
      cornerSide: "left",
      shot: { finisherId: "l2" },
    });
    const suelto = { id: "s", type: ActionType.STEAL, metadata: {} } as unknown as GameEvent;
    // El tiro arriba, el córner debajo del suelto: la fila va arriba.
    const filas = groupTimeline([a.eventos[1], suelto, a.eventos[0]]);
    expect(filas).toHaveLength(2);
    expect(filas[0].kind).toBe("sequence");
    expect(filas[1].kind).toBe("event");
  });

  it("un partido antiguo se pinta exactamente como antes: una fila por evento", () => {
    const viejos = ["a", "b", "c"].map(
      (id) => ({ id, type: ActionType.CORNER, metadata: {} }) as unknown as GameEvent,
    );
    const filas = groupTimeline(viejos);
    expect(filas.every((f) => f.kind === "event")).toBe(true);
    expect(filas).toHaveLength(3);
  });
});
