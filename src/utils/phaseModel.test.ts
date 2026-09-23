/**
 * La fase de juego, fijada.
 *
 * Lo que estos tests protegen, por orden de gravedad si se rompiera:
 *
 *   1. el evento conserva la fase que HABÍA al pulsarlo, nunca la siguiente
 *      — lo contrario produce datos plausibles y falsos;
 *   2. sin fase declarada no se inventa ninguna, ni al empezar ni nunca;
 *   3. solo cambian sola las acciones cuyo significado LO determina;
 *   4. la fase del rival es la NUESTRA: una sola convención.
 */
import { describe, expect, it } from "vitest";
import { ActionType, GoalieAction, PhaseOfPlay } from "../types/futsal";
import {
  PHASES,
  PHASE_LABEL,
  PHASE_UNSET_LABEL,
  isAttackPhase,
  isDefensePhase,
  isPhaseOfPlay,
  nextPhaseAfterEvent,
  parsePhaseOfPlay,
  phaseAfterAttackTap,
  phaseAfterDefenseTap,
  phaseCsvLabel,
  phaseHeaderLabel,
} from "./phaseModel";

const AP: PhaseOfPlay = "attack_positional";
const TA: PhaseOfPlay = "attack_transition";
const DO: PhaseOfPlay = "defense_organized";
const TD: PhaseOfPlay = "defense_transition";

/** Como lo usa MatchTracker: ref autoritativo, leído antes y escrito después. */
function simularCaptura(inicial: PhaseOfPlay | undefined) {
  let ref = inicial;
  const eventos: { type: any; isOpponent: boolean; phaseOfPlay?: PhaseOfPlay }[] = [];
  return {
    registrar(type: ActionType | GoalieAction, isOpponent = false) {
      const phaseAtTap = ref;                                   // 1 · leer
      eventos.push({ type, isOpponent, phaseOfPlay: phaseAtTap }); // 2 · estampar
      ref = nextPhaseAfterEvent(type, isOpponent, phaseAtTap);  // 3 · después
      return this;
    },
    declarar(lado: "ataque" | "defensa") {
      ref = lado === "ataque" ? phaseAfterAttackTap() : phaseAfterDefenseTap();
      return this;
    },
    get estado() { return ref; },
    get eventos() { return eventos; },
  };
}

describe("22 · estado inicial", () => {
  it("un partido empieza SIN fase registrada", () => {
    expect(simularCaptura(undefined).estado).toBeUndefined();
  });

  it("sin fase declarada, ningún automatismo la inventa", () => {
    const c = simularCaptura(undefined)
      .registrar(ActionType.STEAL)
      .registrar(ActionType.LOSS)
      .registrar(ActionType.GOAL);
    expect(c.estado).toBeUndefined();
    expect(c.eventos.every((e) => e.phaseOfPlay === undefined)).toBe(true);
  });

  it("nunca se convierte undefined en «posicional» por defecto", () => {
    for (const t of [ActionType.SHOT, ActionType.FOUL, ActionType.CORNER, ActionType.SET_PIECE]) {
      expect(nextPhaseAfterEvent(t, false, undefined)).toBeUndefined();
    }
  });
});

describe("23-26 · los dos botones", () => {
  it("23 · ATACAMOS desde sin registrar → ataque posicional", () => {
    expect(simularCaptura(undefined).declarar("ataque").estado).toBe(AP);
  });

  it("24 · DEFENDEMOS desde sin registrar → defensa organizada", () => {
    expect(simularCaptura(undefined).declarar("defensa").estado).toBe(DO);
  });

  it("25 · ATACAMOS desde transición ofensiva → ataque posicional (estabiliza)", () => {
    expect(simularCaptura(TA).declarar("ataque").estado).toBe(AP);
  });

  it("26 · DEFENDEMOS desde transición defensiva → defensa organizada (estabiliza)", () => {
    expect(simularCaptura(TD).declarar("defensa").estado).toBe(DO);
  });

  it("desde cualquier fase defensiva, ATACAMOS lleva a posicional", () => {
    for (const desde of [DO, TD]) expect(simularCaptura(desde).declarar("ataque").estado).toBe(AP);
  });

  it("desde cualquier fase ofensiva, DEFENDEMOS lleva a organizada", () => {
    for (const desde of [AP, TA]) expect(simularCaptura(desde).declarar("defensa").estado).toBe(DO);
  });

  it("el botón nunca deja el estado en una transición", () => {
    for (const desde of [undefined, AP, TA, DO, TD]) {
      expect(simularCaptura(desde).declarar("ataque").estado).toBe(AP);
      expect(simularCaptura(desde).declarar("defensa").estado).toBe(DO);
    }
  });
});

describe("1, 4-7 · el evento conserva la fase que había", () => {
  it("4-5 · RECUPERACIÓN en defensa organizada: el evento es defensivo, el estado pasa a transición ofensiva", () => {
    const c = simularCaptura(DO).registrar(ActionType.STEAL);
    expect(c.eventos[0].phaseOfPlay).toBe(DO);
    expect(c.estado).toBe(TA);
  });

  it("6-7 · PÉRDIDA en ataque posicional: el evento es ofensivo, el estado pasa a transición defensiva", () => {
    const c = simularCaptura(AP).registrar(ActionType.LOSS);
    expect(c.eventos[0].phaseOfPlay).toBe(AP);
    expect(c.estado).toBe(TD);
  });

  it("INTERCEPCIÓN y ERROR NO FORZADO se comportan como su pareja", () => {
    expect(simularCaptura(DO).registrar(ActionType.INTERCEPTION).estado).toBe(TA);
    expect(simularCaptura(AP).registrar(ActionType.UNFORCED_ERROR).estado).toBe(TD);
  });

  it("la recuperación NO salta directamente a ataque posicional", () => {
    expect(nextPhaseAfterEvent(ActionType.STEAL, false, DO)).not.toBe(AP);
    expect(nextPhaseAfterEvent(ActionType.STEAL, false, DO)).toBe(TA);
  });

  it("la pérdida NO salta directamente a defensa organizada", () => {
    expect(nextPhaseAfterEvent(ActionType.LOSS, false, AP)).not.toBe(DO);
    expect(nextPhaseAfterEvent(ActionType.LOSS, false, AP)).toBe(TD);
  });
});

describe("8 · dos acciones seguidas leen la fase correcta", () => {
  it("recuperar y perder de inmediato encadena las dos transiciones", () => {
    // El caso que un `useState` sin ref rompería en silencio: el segundo
    // evento llevaría la fase del primero.
    const c = simularCaptura(DO)
      .registrar(ActionType.STEAL)
      .registrar(ActionType.LOSS);
    expect(c.eventos[0].phaseOfPlay).toBe(DO);
    expect(c.eventos[1].phaseOfPlay).toBe(TA);
    expect(c.estado).toBe(TD);
  });

  it("una cadena larga nunca repite la fase del evento anterior por error", () => {
    const c = simularCaptura(AP)
      .registrar(ActionType.LOSS)     // AP  → TD
      .registrar(ActionType.STEAL)    // TD  → TA
      .registrar(ActionType.SHOT)     // TA  → TA
      .registrar(ActionType.LOSS);    // TA  → TD
    expect(c.eventos.map((e) => e.phaseOfPlay)).toEqual([AP, TD, TA, TA]);
    expect(c.estado).toBe(TD);
  });
});

describe("9 · lo que NO cambia la fase", () => {
  const neutros = [
    ActionType.SHOT, ActionType.FOUL, ActionType.CORNER, ActionType.SET_PIECE,
    ActionType.SUBSTITUTION, ActionType.YELLOW_CARD, ActionType.RED_CARD,
    ActionType.FORMATION_CHANGE, ActionType.ASSIST, ActionType.TIMEOUT,
    GoalieAction.SAVE, GoalieAction.SAVE_CATCH, GoalieAction.SAVE_DEFLECT, GoalieAction.EXIT,
  ] as const;

  it("ninguna de ellas mueve el estado, venga de la fase que venga", () => {
    for (const t of neutros) {
      for (const desde of [AP, TA, DO, TD]) {
        expect(nextPhaseAfterEvent(t, false, desde)).toBe(desde);
        expect(nextPhaseAfterEvent(t, true, desde)).toBe(desde);
      }
    }
  });

  it("TIMEOUT en concreto NO se automatiza", () => {
    expect(nextPhaseAfterEvent(ActionType.TIMEOUT, false, TA)).toBe(TA);
  });

  it("15 · el balón parado no crea una quinta fase ni corrige la actual", () => {
    expect(PHASES).toHaveLength(4);
    expect(PHASES).not.toContain("set_piece");
    // Un córner estando en transición defensiva NO se «corrige» a ataque.
    expect(nextPhaseAfterEvent(ActionType.CORNER, false, TD)).toBe(TD);
    expect(nextPhaseAfterEvent(ActionType.SET_PIECE, false, TD)).toBe(TD);
  });
});

describe("10 · goles", () => {
  it("marcamos nosotros → reanuda el rival → defendemos", () => {
    expect(nextPhaseAfterEvent(ActionType.GOAL, false, AP)).toBe(DO);
  });

  it("marca el rival → reanudamos nosotros → atacamos", () => {
    expect(nextPhaseAfterEvent(ActionType.GOAL, true, DO)).toBe(AP);
  });

  it("GOAL_CONCEDED usa el mismo criterio: manda el bando que MARCA", () => {
    // `handleAction` normaliza los dos caminos al mismo `isOpponent`.
    expect(nextPhaseAfterEvent(GoalieAction.GOAL_CONCEDED, true, DO)).toBe(AP);
    expect(nextPhaseAfterEvent(GoalieAction.GOAL_CONCEDED, false, AP)).toBe(DO);
  });

  it("el gol deja siempre una fase estable, nunca una transición", () => {
    for (const desde of [AP, TA, DO, TD]) {
      for (const rival of [true, false]) {
        const siguiente = nextPhaseAfterEvent(ActionType.GOAL, rival, desde);
        expect([AP, DO]).toContain(siguiente);
      }
    }
  });

  it("y el evento del gol conserva la fase en que se marcó", () => {
    const c = simularCaptura(TA).registrar(ActionType.GOAL, false);
    expect(c.eventos[0].phaseOfPlay).toBe(TA);
    expect(c.estado).toBe(DO);
  });
});

describe("14 · convención del rival", () => {
  it("27 · un tiro rival conserva NUESTRA fase, sin invertirla", () => {
    const c = simularCaptura(DO).registrar(ActionType.SHOT, true);
    expect(c.eventos[0].phaseOfPlay).toBe(DO);
    expect(c.eventos[0].phaseOfPlay).not.toBe(AP);
  });

  it("una pérdida del rival tampoco invierte la convención", () => {
    // Es una acción SUYA: no cambia nuestra fase por sí sola.
    const c = simularCaptura(DO).registrar(ActionType.LOSS, true);
    expect(c.eventos[0].phaseOfPlay).toBe(DO);
  });
});

describe("etiquetas y lectura", () => {
  it("las cuatro fases tienen nombre completo, sin abreviaturas", () => {
    expect(PHASE_LABEL).toEqual({
      attack_positional: "Ataque posicional",
      attack_transition: "Transición ofensiva",
      defense_organized: "Defensa organizada",
      defense_transition: "Transición defensiva",
    });
  });

  it("la cabecera se lee entera", () => {
    expect(phaseHeaderLabel(undefined)).toBe("FASE · SIN REGISTRAR");
    expect(phaseHeaderLabel(AP)).toBe("FASE · ATAQUE POSICIONAL");
    expect(phaseHeaderLabel(TA)).toBe("FASE · TRANSICIÓN OFENSIVA");
    expect(phaseHeaderLabel(DO)).toBe("FASE · DEFENSA ORGANIZADA");
    expect(phaseHeaderLabel(TD)).toBe("FASE · TRANSICIÓN DEFENSIVA");
    expect(PHASE_UNSET_LABEL).toBe("Sin registrar");
  });

  it("ataque y defensa se distinguen para pintar el selector", () => {
    expect([AP, TA].every(isAttackPhase)).toBe(true);
    expect([DO, TD].every(isDefensePhase)).toBe(true);
    expect(isAttackPhase(undefined)).toBe(false);
    expect(isDefensePhase(undefined)).toBe(false);
  });

  it("un valor desconocido no se acepta como fase", () => {
    for (const malo of ["set_piece", "ATTACK", "", null, 3, undefined]) {
      expect(isPhaseOfPlay(malo)).toBe(false);
      expect(parsePhaseOfPlay(malo)).toBeUndefined();
    }
    for (const buena of PHASES) expect(parsePhaseOfPlay(buena)).toBe(buena);
  });

  it("el CSV deja la celda vacía cuando no hay fase", () => {
    expect(phaseCsvLabel(undefined)).toBe("");
    expect(phaseCsvLabel(AP)).toBe("Ataque posicional");
  });
});
