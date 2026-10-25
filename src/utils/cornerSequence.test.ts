/**
 * EL CÓRNER LANZADO DIRECTO A PORTERÍA.
 *
 * Lo que se protege aquí es el modelo: un vínculo, dos eventos, ningún doble
 * conteo y ninguna mitad que pueda quedarse suelta.
 */
import { describe, expect, it } from "vitest";
import {
  CORNER_SEQUENCE_PREFIX,
  cornerOfSequence,
  cornerSequenceCsvValue,
  describeCornerSequence,
  describeFinisherOutcome,
  eventsInSequence,
  finisherOfSequence,
  isCornerSequenceId,
  isSequenced,
  isSequencedCorner,
  isSequencedFinisher,
  newCornerSequenceId,
  sequenceIsWellFormed,
  sequenceOf,
  sequenceShape,
  sequenceIdOf,
} from "./cornerSequence";
import { ActionType, GameEvent, GameState, GoalieAction, Period } from "../types/futsal";
import { summarizeCorners } from "./cornerModel";
import { countShotsFromSetPiece, summarizeCornerOutcomes } from "./setPieceModel";
import { summarizeShots } from "./shotModel";
import { scoreOf } from "./goalModel";

const SEQ = "cseq-1-abc";

const ev = (o: Partial<GameEvent> & { id: string; type: ActionType | GoalieAction }): GameEvent => ({
  timestamp: 1000,
  wallClock: 1000,
  period: Period.FIRST,
  playerIds: [],
  gameState: GameState.FOUR_VS_FOUR,
  ...o,
} as GameEvent);

/** El córner tal y como lo crea `handleAction` cuando el tiro es directo. */
const corner = (seq: string | null = SEQ, opponent = false): GameEvent =>
  ev({
    id: `c-${seq}`,
    type: ActionType.CORNER,
    originGrid: "Z4R",
    wallClock: 999,
    metadata: {
      isOpponent: opponent,
      cornerSide: "right",
      setPieceOutcome: "shot",
      ...(seq ? { sequenceId: seq } : {}),
    },
  });

/** El remate que cierra la secuencia. */
const remate = (
  tipo: ActionType = ActionType.SHOT,
  seq: string | null = SEQ,
  extra: Partial<GameEvent> = {},
  opponent = false,
): GameEvent =>
  ev({
    id: `s-${seq}-${tipo}`,
    type: tipo,
    originGrid: "Z4R",
    destinationGrid: "G2",
    playerIds: ["p7"],
    metadata: {
      isOpponent: opponent,
      setPiece: "corner",
      ...(seq ? { sequenceId: seq } : {}),
    },
    ...extra,
  });

describe("1 · el vínculo es un solo campo y se reconoce", () => {
  it("un identificador nuevo se distingue de cualquier otra cosa", () => {
    const id = newCornerSequenceId();
    expect(id.startsWith(CORNER_SEQUENCE_PREFIX)).toBe(true);
    expect(isCornerSequenceId(id)).toBe(true);
    // Dos seguidos no colisionan.
    expect(newCornerSequenceId()).not.toBe(id);
  });

  it("no se confunde con un id de evento ni con basura", () => {
    for (const raw of [
      "event-action-123-abc",
      "",
      CORNER_SEQUENCE_PREFIX,
      null,
      undefined,
      7,
      {},
    ]) {
      expect(isCornerSequenceId(raw), String(raw)).toBe(false);
    }
  });

  it("los dos eventos de una jugada llevan EL MISMO valor", () => {
    const eventos = [remate(), corner()];
    expect(sequenceIdOf(eventos[0])).toBe(SEQ);
    expect(sequenceIdOf(eventos[1])).toBe(SEQ);
    expect(isSequenced(eventos[0])).toBe(true);
    expect(isSequencedCorner(eventos[1])).toBe(true);
    expect(isSequencedFinisher(eventos[0])).toBe(true);
  });

  it("23 · un córner antiguo, sin vínculo, sigue siendo un córner suelto", () => {
    const viejo = corner(null);
    expect(sequenceIdOf(viejo)).toBeNull();
    expect(isSequenced(viejo)).toBe(false);
    expect(isSequencedCorner(viejo)).toBe(false);
    // Y `sequenceOf` lo devuelve solo a él: borrarlo no arrastra nada.
    expect(sequenceOf([viejo, remate(ActionType.SHOT, null)], viejo)).toEqual([viejo]);
  });

  it("un tiro que SOLO declara proceder de córner sigue siendo independiente", () => {
    // Es el registro de siempre: el operador declara la procedencia sin que
    // exista ningún evento CORNER asociado. No se inventa vínculo.
    const suelto = remate(ActionType.SHOT, null);
    expect(suelto.metadata?.setPiece).toBe("corner");
    expect(isSequenced(suelto)).toBe(false);
  });
});

describe("2 · la jugada completa", () => {
  const eventos = [remate(), corner(), ev({ id: "otro", type: ActionType.FOUL })];

  it("se recupera entera desde cualquiera de sus mitades", () => {
    expect(eventsInSequence(eventos, SEQ).map((e) => e.id).sort()).toEqual(
      [`c-${SEQ}`, `s-${SEQ}-SHOT`].sort(),
    );
    expect(sequenceOf(eventos, eventos[0]).length).toBe(2);
    expect(sequenceOf(eventos, eventos[1]).length).toBe(2);
  });

  it("y se identifican sus dos mitades por lo que son", () => {
    expect(cornerOfSequence(eventos, SEQ)!.type).toBe(ActionType.CORNER);
    expect(finisherOfSequence(eventos, SEQ)!.type).toBe(ActionType.SHOT);
  });

  it("un evento que no es de la jugada no se la lleva por delante", () => {
    expect(sequenceOf(eventos, eventos[2])).toEqual([eventos[2]]);
  });

  it("un identificador que no existe no devuelve nada", () => {
    expect(eventsInSequence(eventos, "cseq-nope")).toEqual([]);
    expect(cornerOfSequence(eventos, "cseq-nope")).toBeNull();
    expect(finisherOfSequence(eventos, "cseq-nope")).toBeNull();
  });
});

describe("3 · forma válida: un córner y UN solo remate", () => {
  it("la pareja correcta está bien formada", () => {
    expect(sequenceIsWellFormed([remate(), corner()], SEQ)).toBe(true);
    expect(sequenceShape([remate(), corner()], SEQ)).toEqual({
      corners: 1,
      finishers: 1,
      otros: 0,
    });
  });

  it("ESTRUCTURAL · un SHOT y un GOAL en la misma jugada es inválido", () => {
    // Es el error que se quiere imposibilitar: un gol de córner que además
    // dejara un tiro, duplicando el intento.
    const deforme = [remate(ActionType.SHOT), remate(ActionType.GOAL), corner()];
    expect(sequenceShape(deforme, SEQ).finishers).toBe(2);
    expect(sequenceIsWellFormed(deforme, SEQ)).toBe(false);
  });

  it("ESTRUCTURAL · un córner solo, sin remate, también es inválido", () => {
    expect(sequenceIsWellFormed([corner()], SEQ)).toBe(false);
    expect(sequenceShape([corner()], SEQ)).toEqual({ corners: 1, finishers: 0, otros: 0 });
  });

  it("ESTRUCTURAL · un remate solo, sin córner, también es inválido", () => {
    expect(sequenceIsWellFormed([remate()], SEQ)).toBe(false);
  });

  it("ESTRUCTURAL · cualquier otro tipo con el mismo vínculo se detecta", () => {
    const intruso = ev({
      id: "x",
      type: ActionType.FOUL,
      metadata: { isOpponent: false, sequenceId: SEQ },
    });
    expect(sequenceShape([remate(), corner(), intruso], SEQ).otros).toBe(1);
    expect(sequenceIsWellFormed([remate(), corner(), intruso], SEQ)).toBe(false);
  });

  it("un gol como remate es forma válida", () => {
    expect(sequenceIsWellFormed([remate(ActionType.GOAL), corner()], SEQ)).toBe(true);
  });
});

describe("4 · recuentos: cada mitad suma en su sitio y solo una vez", () => {
  const jugada = [remate(), corner()];

  it("10 · el córner se cuenta UNA vez, y como córner", () => {
    const c = summarizeCorners(jugada, false);
    expect(c.total).toBe(1);
    expect(c.right).toBe(1);
  });

  it("y queda declarado como ejecutado en tiro directo", () => {
    expect(summarizeCornerOutcomes(jugada, false)).toEqual({
      total: 1,
      shot: 1,
      play: 0,
      unrecorded: 0,
    });
  });

  it("11 · el tiro se cuenta UNA vez, y como tiro", () => {
    const t = summarizeShots(jugada.filter((e) => !e.metadata?.isOpponent));
    expect(t.shots).toBe(1);
    expect(t.onTarget).toBe(1);
    expect(t.goals).toBe(0);
  });

  it("el córner NO entra nunca en el recuento de tiros", () => {
    expect(summarizeShots([corner()])).toEqual(
      expect.objectContaining({ shots: 0, goals: 0 }),
    );
  });

  it("y el tiro declara proceder de córner, que es otro agregado distinto", () => {
    expect(countShotsFromSetPiece(jugada, "corner", false)).toBe(1);
  });

  it("12 · un gol directo sube el marcador UNA sola vez", () => {
    const golDirecto = [remate(ActionType.GOAL), corner()];
    expect(scoreOf(golDirecto)).toEqual({ team: 1, opponent: 0 });
    expect(summarizeShots(golDirecto)).toEqual(
      expect.objectContaining({ shots: 1, goals: 1, onTarget: 1 }),
    );
    expect(summarizeCorners(golDirecto, false).total).toBe(1);
  });

  it("13 · conversión: un gol directo es UN intento y UN gol, no dos intentos", () => {
    const golDirecto = [remate(ActionType.GOAL), corner()];
    const t = summarizeShots(golDirecto);
    expect(t.goals / t.shots).toBe(1);
  });

  it("14 · la zona del remate es la del remate, no la del córner", () => {
    const t = finisherOfSequence(jugada, SEQ)!;
    expect(t.originGrid).toBe("Z4R");
    expect(t.destinationGrid).toBe("G2");
    // Y la del córner sigue siendo su esquina.
    expect(cornerOfSequence(jugada, SEQ)!.originGrid).toBe("Z4R");
  });

  it("8 · del rival, los mismos recuentos y en su bando", () => {
    const suya = [remate(ActionType.SHOT, SEQ, {}, true), corner(SEQ, true)];
    expect(summarizeCorners(suya, true).total).toBe(1);
    expect(summarizeCorners(suya, false).total).toBe(0);
    expect(countShotsFromSetPiece(suya, "corner", true)).toBe(1);
    expect(countShotsFromSetPiece(suya, "corner", false)).toBe(0);
  });
});

describe("5 · cómo se cuenta la jugada", () => {
  it("un tiro a portería", () => {
    expect(
      describeCornerSequence(corner(), remate(), "#7 PÉREZ"),
    ).toBe("Córner derecho · tiro directo de #7 PÉREZ · a portería");
  });

  it("un tiro fuera", () => {
    const fuera = remate(ActionType.SHOT, SEQ, { destinationGrid: "OUT" });
    expect(describeCornerSequence(corner(), fuera, "#7 PÉREZ")).toBe(
      "Córner derecho · tiro directo de #7 PÉREZ · fuera",
    );
  });

  it("un gol: el desenlace ya está en el verbo y no se repite", () => {
    expect(describeCornerSequence(corner(), remate(ActionType.GOAL), "#7 PÉREZ")).toBe(
      "Córner derecho · gol directo de #7 PÉREZ",
    );
  });

  it("izquierda y derecha se dicen en concordancia", () => {
    const izq = ev({
      id: "ci",
      type: ActionType.CORNER,
      originGrid: "Z4L",
      metadata: { isOpponent: false, cornerSide: "left", sequenceId: SEQ },
    });
    expect(describeCornerSequence(izq, remate(), "#4 LÓPEZ")).toContain("Córner izquierdo");
  });

  it("sin autor identificado no se inventa ninguno", () => {
    expect(describeCornerSequence(corner(), remate(), null)).toBe(
      "Córner derecho · tiro directo · a portería",
    );
  });

  it("los desenlaces salen de `shotResolution`, no de una tabla paralela", () => {
    expect(describeFinisherOutcome(remate())).toBe("a portería");
    expect(describeFinisherOutcome(remate(ActionType.SHOT, SEQ, { destinationGrid: "OUT" }))).toBe("fuera");
    expect(
      describeFinisherOutcome(
        ev({
          id: "b",
          type: ActionType.SHOT,
          metadata: { isOpponent: false, shotOutcome: "blocked" },
        }),
      ),
    ).toBe("bloqueado");
    expect(describeFinisherOutcome(remate(ActionType.GOAL))).toBeNull();
    // Sin destino declarado no se redacta un desenlace que nadie vio.
    expect(
      describeFinisherOutcome(ev({ id: "u", type: ActionType.SHOT, metadata: { isOpponent: false } })),
    ).toBeNull();
  });

  it("sin remate, al menos dice que hubo córner", () => {
    expect(describeCornerSequence(corner(), null, "#7 PÉREZ")).toBe("Córner derecho");
  });
});

describe("6 · el CSV puede volver a emparejar las dos filas", () => {
  it("las dos mitades exportan el mismo identificador", () => {
    expect(cornerSequenceCsvValue(corner())).toBe(SEQ);
    expect(cornerSequenceCsvValue(remate())).toBe(SEQ);
  });

  it("y una acción suelta deja la celda vacía, sin inventar un número de jugada", () => {
    expect(cornerSequenceCsvValue(corner(null))).toBe("");
    expect(cornerSequenceCsvValue(ev({ id: "z", type: ActionType.FOUL }))).toBe("");
  });
});
