/**
 * src/utils/setPieceSequence.ts
 *
 * LA JUGADA A BALÓN PARADO, COMPLETA, COMO UNA SOLA COSA.
 *
 * Hasta ahora cada acción se registraba suelta: el córner por un lado y el
 * tiro que salía de él por otro, sin nada que los uniera. `setPieceModel` lo
 * dice con todas las letras —«no hay relatedEventId / parentEventId /
 * sequenceId»— y era una decisión deliberada: sin relación no puede haber
 * doble conteo.
 *
 * El precio era que nadie podía contar la jugada. No se sabía quién sacó el
 * córner que acabó en gol, ni cuántas bandas terminaron en pérdida, ni si la
 * falta jugada en corto produjo algo. Este módulo trae la relación de vuelta,
 * pero EXPLÍCITA y escrita por el operador, nunca deducida.
 *
 * LA REGLA QUE SOSTIENE TODO
 * --------------------------
 * `sequenceId` relaciona, NO cuenta. Cada evento de la secuencia sigue siendo
 * el mismo evento de siempre y suma donde siempre sumó: el córner a córners,
 * el tiro a tiros, la pérdida a pérdidas. La secuencia solo dice que
 * ocurrieron en la misma jugada.
 *
 *   - un córner que acaba en tiro  → 1 córner + 1 tiro
 *   - una falta que acaba en gol   → 1 falta + 1 gol, NUNCA gol + tiro
 *   - una banda que acaba en pérdida → 1 banda + 1 pérdida
 *   - el `sequenceId` jamás es una métrica
 *
 * COMPATIBILIDAD, SIN MIGRAR NADA
 * -------------------------------
 * Un evento sin `sequenceId` es un evento histórico independiente, y así se
 * lee. No se infiere parentesco por cercanía temporal ni por ningún otro
 * atajo: dos acciones seguidas en el reloj no son una jugada, son dos
 * acciones seguidas. Los partidos anteriores se quedan exactamente como
 * están.
 *
 * ATÓMICA DE VERDAD
 * -----------------
 * Una secuencia se confirma entera o no existe. Cancelar antes de confirmar
 * no guarda ni un evento; deshacer o borrar cualquier pieza se lleva la
 * jugada completa. Por eso este módulo produce SEMILLAS —descripciones de
 * eventos— y no eventos: quien las materializa les pone de golpe el mismo
 * reloj, periodo, fase, dirección de ataque, bando y jugadores en pista.
 */
import { ActionType, GameEvent, GoalieAction } from "../types/futsal";
import { CornerSide, cornerOriginGrid, isCornerSide } from "./cornerModel";
import { Zone12Id, isZone12Id } from "./fieldZones";

// ── IDENTIDAD DE LA SECUENCIA ───────────────────────────────────────────

/**
 * Prefijo propio y reconocible.
 *
 * Que se vea a simple vista en un JSON de respaldo importa: quien abra el
 * archivo tiene que poder distinguir un identificador de secuencia de un id
 * de evento sin consultar el código.
 */
export const SET_PIECE_SEQUENCE_PREFIX = "spseq-";

let contador = 0;

/** Un identificador estable para todos los eventos de una misma jugada. */
export function newSetPieceSequenceId(): string {
  contador += 1;
  return `${SET_PIECE_SEQUENCE_PREFIX}${Date.now().toString(36)}-${contador.toString(36)}`;
}

/**
 * El identificador de secuencia de un evento, o null.
 *
 * Null significa «este evento no pertenece a ninguna jugada registrada», que
 * es el caso de TODOS los partidos anteriores. No es un error ni un hueco que
 * rellenar.
 */
export function sequenceIdOf(event: GameEvent | null | undefined): string | null {
  const raw = event?.metadata?.sequenceId;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

/** ¿Pertenecen estos dos eventos a la misma jugada? */
export function sameSequence(a: GameEvent, b: GameEvent): boolean {
  const ia = sequenceIdOf(a);
  return ia !== null && ia === sequenceIdOf(b);
}

/** Los eventos de una jugada, en el orden en que están guardados. */
export function eventsOfSequence(events: GameEvent[], sequenceId: string): GameEvent[] {
  return events.filter((e) => sequenceIdOf(e) === sequenceId);
}

/** Los identificadores de jugada presentes, en orden de primera aparición. */
export function sequenceIdsIn(events: GameEvent[]): string[] {
  const vistos: string[] = [];
  for (const e of events) {
    const id = sequenceIdOf(e);
    if (id && !vistos.includes(id)) vistos.push(id);
  }
  return vistos;
}

// ── VOCABULARIO ─────────────────────────────────────────────────────────

/** De qué reanudación nace la jugada. */
export type SetPieceRootKind = "corner" | "free_kick" | "throw_in";

export const SET_PIECE_ROOT_KINDS: readonly SetPieceRootKind[] = [
  "corner",
  "free_kick",
  "throw_in",
];

export const SET_PIECE_ROOT_LABEL: Record<SetPieceRootKind, string> = {
  corner: "Córner",
  free_kick: "Falta a favor",
  throw_in: "Saque de banda",
};

export function isSetPieceRootKind(raw: unknown): raw is SetPieceRootKind {
  return SET_PIECE_ROOT_KINDS.includes(raw as SetPieceRootKind);
}

/**
 * Cómo se ejecuta la reanudación.
 *
 * `direct` NO existe en el saque de banda, y no por diseño de la aplicación
 * sino por reglamento: de banda no se puede marcar directamente. Ofrecerlo
 * sería invitar a registrar algo que no puede ocurrir.
 */
export type SetPieceModality = "direct" | "prepared" | "quick";

export const SET_PIECE_MODALITY_LABEL: Record<SetPieceModality, string> = {
  direct: "Tiro directo",
  prepared: "Jugada preparada",
  quick: "Saque rápido",
};

/** Las modalidades que admite cada reanudación. */
export const MODALITIES_BY_ROOT: Record<SetPieceRootKind, readonly SetPieceModality[]> = {
  corner: ["direct", "prepared"],
  free_kick: ["direct", "prepared"],
  throw_in: ["quick", "prepared"],
};

export function allowsModality(root: SetPieceRootKind, modality: SetPieceModality): boolean {
  return MODALITIES_BY_ROOT[root].includes(modality);
}

/**
 * En qué acaba la jugada.
 *
 * `none` es «no se registró finalización», que es un dato distinto de
 * `keep`: en uno la jugada siguió sin que el operador anotara el final; en
 * el otro el equipo conservó el balón. No se mezclan.
 */
export type SequenceOutcome =
  | "keep"
  | "loss"
  | "shot"
  | "goal"
  | "blocked"
  | "new_set_piece"
  | "none";

export const SEQUENCE_OUTCOMES: readonly SequenceOutcome[] = [
  "keep",
  "loss",
  "shot",
  "goal",
  "blocked",
  "new_set_piece",
  "none",
];

export const SEQUENCE_OUTCOME_LABEL: Record<SequenceOutcome, string> = {
  keep: "Conserva",
  loss: "Pérdida",
  shot: "Tiro",
  goal: "Gol",
  blocked: "Bloqueo / despeje",
  new_set_piece: "Nuevo balón parado",
  none: "Sin finalización",
};

export function isSequenceOutcome(raw: unknown): raw is SequenceOutcome {
  return SEQUENCE_OUTCOMES.includes(raw as SequenceOutcome);
}

/** Los desenlaces que materializan un evento propio enlazado. */
export const OUTCOMES_WITH_EVENT: readonly SequenceOutcome[] = ["loss", "shot", "goal"];

export function outcomeCreatesEvent(outcome: SequenceOutcome): boolean {
  return OUTCOMES_WITH_EVENT.includes(outcome);
}

// ── SAQUE DE BANDA: DÓNDE ───────────────────────────────────────────────

/**
 * Banda y sector, SIEMPRE desde la perspectiva del equipo que saca.
 *
 * «Izquierda» es la izquierda de quien ataca, no la del operador ni la de la
 * pantalla. Normalizarlo aquí es lo que permite comparar las bandas de los
 * dos equipos en el mismo informe sin estar girando mapas mentalmente.
 */
export type ThrowInSide = "left" | "right";
export type ThrowInSector = "Z1" | "Z2" | "Z3" | "Z4";

export const THROW_IN_SIDES: readonly ThrowInSide[] = ["left", "right"];
export const THROW_IN_SECTORS: readonly ThrowInSector[] = ["Z1", "Z2", "Z3", "Z4"];

export const THROW_IN_SIDE_LABEL: Record<ThrowInSide, string> = {
  left: "Banda izquierda",
  right: "Banda derecha",
};

export const THROW_IN_SECTOR_LABEL: Record<ThrowInSector, string> = {
  Z1: "Z1 · propia",
  Z2: "Z2 · media propia",
  Z3: "Z3 · media rival",
  Z4: "Z4 · rival",
};

export function isThrowInSide(raw: unknown): raw is ThrowInSide {
  return raw === "left" || raw === "right";
}

export function isThrowInSector(raw: unknown): raw is ThrowInSector {
  return THROW_IN_SECTORS.includes(raw as ThrowInSector);
}

/**
 * La celda de las 12 zonas que corresponde a una banda y un sector.
 *
 * El saque de banda tiene dominio propio —banda + sector— pero también entra
 * en los mapas de 12 zonas, igual que el córner entra por `originGrid`. La
 * banda izquierda es el carril L y la derecha el R; el centro no se usa
 * nunca, porque un saque de banda no se produce en el centro de la pista.
 */
export function throwInOriginGrid(side: ThrowInSide, sector: ThrowInSector): Zone12Id {
  const banda = sector.charAt(1);
  return `Z${banda}${side === "left" ? "L" : "R"}` as Zone12Id;
}

// ── EL BORRADOR QUE LLEGA DE LA CAPTURA ─────────────────────────────────

/** Lo que hay que saber del tiro cuando la jugada acaba en tiro o en gol. */
export type SequenceShot = {
  /** Quién remata. Puede no ser el sacador, y puede no identificarse. */
  finisherId?: string;
  originGrid?: Zone12Id;
  destinationGrid?: string;
  targetGoalkeeperId?: string;
  goalieResponse?: GoalieAction | "UNSPECIFIED";
  shotOutcome?: string;
};

/** Lo que hay que saber de la pérdida cuando la jugada acaba en pérdida. */
export type SequenceLoss = {
  playerId?: string;
  /** pase, control, infracción, interceptado, no identificado. */
  subType?: ThrowInLossSubType;
};

/**
 * Subtipos de pérdida que ofrece la ventana de banda.
 *
 * `unknown` existe como VALOR porque en directo hay pérdidas que no da
 * tiempo a clasificar, y obligar a elegir una de las otras cuatro produciría
 * un dato falso. Es distinto de no registrar el campo.
 */
export type ThrowInLossSubType =
  | "bad_pass"
  | "bad_control"
  | "infraction"
  | "intercepted"
  | "unknown";

export const THROW_IN_LOSS_SUBTYPES: readonly ThrowInLossSubType[] = [
  "bad_pass",
  "bad_control",
  "infraction",
  "intercepted",
  "unknown",
];

export const THROW_IN_LOSS_SUBTYPE_LABEL: Record<ThrowInLossSubType, string> = {
  bad_pass: "Pase",
  bad_control: "Control",
  infraction: "Infracción",
  intercepted: "Interceptado",
  unknown: "No identificado",
};

export type SetPieceSequenceDraft = {
  root: SetPieceRootKind;
  /** Bando que EJECUTA la reanudación. */
  isOpponent: boolean;
  modality: SetPieceModality;
  outcome: SequenceOutcome;
  /** Quién saca. Opcional: no siempre se identifica. */
  takerId?: string;
  /** Córner. */
  cornerSide?: CornerSide;
  /** Falta a favor y, en general, origen declarado de la reanudación. */
  originGrid?: Zone12Id;
  /** Saque de banda. */
  throwInSide?: ThrowInSide;
  throwInSector?: ThrowInSector;
  /** Datos del tiro, si el desenlace es tiro o gol. */
  shot?: SequenceShot;
  /** Datos de la pérdida, si el desenlace es pérdida. */
  loss?: SequenceLoss;
  /** Enlaza con el despeje del que nació esta banda, si vino de uno. */
  fromDeflectEventId?: string;
};

/**
 * Una semilla de evento: todo lo que describe un evento MENOS el contexto
 * que comparten todos los de la jugada (reloj, periodo, fase, dirección,
 * jugadores en pista). Ese contexto lo pone quien materializa, de una vez,
 * para que no pueda quedar desparejado.
 */
export type SequenceEventSeed = {
  type: ActionType;
  playerId?: string;
  originGrid?: string;
  destinationGrid?: string;
  metadata: Record<string, unknown>;
};

// ── CONSTRUCCIÓN ────────────────────────────────────────────────────────

/** El tipo de evento raíz de cada reanudación. */
export const ROOT_ACTION_TYPE: Record<SetPieceRootKind, ActionType> = {
  corner: ActionType.CORNER,
  free_kick: ActionType.SET_PIECE,
  throw_in: ActionType.THROW_IN,
};

/**
 * El origen declarado que se estampa en el TIRO de la jugada.
 *
 * Es el mismo vocabulario que ya usaba `setPieceModel` para que el tiro
 * entre en los agregados de balón parado existentes sin inventar nada nuevo.
 * Una banda no puede acabar en gol directo, pero sí en tiro tras la jugada:
 * ese tiro procede de `throw_in`.
 */
export const SHOT_SET_PIECE_BY_ROOT: Record<SetPieceRootKind, string> = {
  corner: "corner",
  free_kick: "free_kick",
  throw_in: "throw_in",
};

/**
 * Las semillas de una jugada, en el orden en que deben guardarse.
 *
 * Siempre hay raíz. El evento enlazado existe SOLO si el desenlace lo
 * materializa: conservar, bloquear, encadenar otro balón parado o no
 * registrar finalización no son eventos, son cómo acabó la jugada, y van
 * escritos en la raíz.
 *
 * NUNCA se emiten SHOT y GOAL para la misma finalización. Un gol ya es un
 * remate que entró: añadirle un tiro lo contaría dos veces en precisión,
 * conversión y mapas.
 */
export function buildSequenceSeeds(
  draft: SetPieceSequenceDraft,
  sequenceId: string,
): SequenceEventSeed[] {
  const comun = {
    sequenceId,
    sequenceRoot: draft.root,
    isOpponent: draft.isOpponent,
  };

  const raiz: SequenceEventSeed = {
    type: ROOT_ACTION_TYPE[draft.root],
    playerId: draft.takerId,
    metadata: {
      ...comun,
      sequenceRole: "root",
      sequenceOutcome: draft.outcome,
      setPieceModality: draft.modality,
      ...(draft.takerId ? { takerId: draft.takerId } : {}),
      ...(draft.fromDeflectEventId ? { fromDeflectEventId: draft.fromDeflectEventId } : {}),
    },
  };

  if (draft.root === "corner" && draft.cornerSide) {
    raiz.originGrid = cornerOriginGrid(draft.cornerSide);
    raiz.metadata.cornerSide = draft.cornerSide;
    // El vocabulario que ya entienden los agregados de córner: un córner
    // rematado directamente es `shot`; cualquier otra cosa, `play`.
    raiz.metadata.setPieceOutcome = draft.modality === "direct" ? "shot" : "play";
  }

  if (draft.root === "free_kick") {
    if (draft.originGrid) raiz.originGrid = draft.originGrid;
    raiz.metadata.setPieceOrigin = "free_kick";
    raiz.metadata.setPieceOutcome = draft.modality === "direct" ? "shot" : "play";
  }

  if (draft.root === "throw_in" && draft.throwInSide && draft.throwInSector) {
    raiz.originGrid = throwInOriginGrid(draft.throwInSide, draft.throwInSector);
    raiz.metadata.throwInSide = draft.throwInSide;
    raiz.metadata.throwInSector = draft.throwInSector;
  }

  const semillas: SequenceEventSeed[] = [raiz];

  if (draft.outcome === "goal" || draft.outcome === "shot") {
    const tiro = draft.shot ?? {};
    semillas.push({
      type: draft.outcome === "goal" ? ActionType.GOAL : ActionType.SHOT,
      playerId: tiro.finisherId,
      originGrid: tiro.originGrid ?? raiz.originGrid,
      destinationGrid: tiro.destinationGrid,
      metadata: {
        ...comun,
        sequenceRole: "outcome",
        // De dónde procede el remate, en el vocabulario de siempre.
        setPiece: SHOT_SET_PIECE_BY_ROOT[draft.root],
        ...(tiro.targetGoalkeeperId ? { targetGoalkeeperId: tiro.targetGoalkeeperId } : {}),
        ...(tiro.goalieResponse ? { goalieResponse: tiro.goalieResponse } : {}),
        ...(tiro.shotOutcome ? { shotOutcome: tiro.shotOutcome } : {}),
      },
    });
  }

  if (draft.outcome === "loss") {
    const perdida = draft.loss ?? {};
    semillas.push({
      type: ActionType.LOSS,
      playerId: perdida.playerId ?? draft.takerId,
      originGrid: raiz.originGrid,
      metadata: {
        ...comun,
        sequenceRole: "outcome",
        ...(perdida.subType && perdida.subType !== "unknown"
          ? { subType: perdida.subType }
          : {}),
        ...(perdida.subType ? { throwInLossSubType: perdida.subType } : {}),
      },
    });
  }

  return semillas;
}

// ── LECTURA ─────────────────────────────────────────────────────────────

export function isSequenceRoot(event: GameEvent): boolean {
  return sequenceIdOf(event) !== null && event.metadata?.sequenceRole === "root";
}

export function isSequenceOutcomeEvent(event: GameEvent): boolean {
  return sequenceIdOf(event) !== null && event.metadata?.sequenceRole === "outcome";
}

export function rootOfSequence(events: GameEvent[], sequenceId: string): GameEvent | null {
  return eventsOfSequence(events, sequenceId).find(isSequenceRoot) ?? null;
}

export function outcomeEventOfSequence(
  events: GameEvent[],
  sequenceId: string,
): GameEvent | null {
  return eventsOfSequence(events, sequenceId).find(isSequenceOutcomeEvent) ?? null;
}

export function rootKindOf(event: GameEvent): SetPieceRootKind | null {
  const raw = event.metadata?.sequenceRoot;
  return isSetPieceRootKind(raw) ? raw : null;
}

export function sequenceOutcomeOf(event: GameEvent): SequenceOutcome | null {
  const raw = event.metadata?.sequenceOutcome;
  return isSequenceOutcome(raw) ? raw : null;
}

export function modalityOf(event: GameEvent): SetPieceModality | null {
  const raw = event.metadata?.setPieceModality;
  return raw === "direct" || raw === "prepared" || raw === "quick" ? raw : null;
}

export function throwInSideOf(event: GameEvent): ThrowInSide | null {
  const raw = event.metadata?.throwInSide;
  return isThrowInSide(raw) ? raw : null;
}

export function throwInSectorOf(event: GameEvent): ThrowInSector | null {
  const raw = event.metadata?.throwInSector;
  return isThrowInSector(raw) ? raw : null;
}

export function takerIdOf(event: GameEvent): string | null {
  const raw = event.metadata?.takerId;
  return typeof raw === "string" && raw ? raw : null;
}

/**
 * Quién remató o perdió, leído del evento enlazado.
 *
 * Sale del evento de desenlace y no de la raíz a propósito: el sacador y el
 * finalizador pueden ser jugadores distintos, y confundirlos atribuiría el
 * gol a quien puso el balón en juego.
 */
export function finisherIdOf(events: GameEvent[], sequenceId: string): string | null {
  const desenlace = outcomeEventOfSequence(events, sequenceId);
  const id = desenlace?.playerIds?.[0];
  return typeof id === "string" && id ? id : null;
}

/**
 * ¿Está bien formada esta jugada?
 *
 * Una secuencia válida tiene exactamente una raíz, como mucho un evento de
 * desenlace, y nunca un tiro y un gol a la vez. Se usa como red de seguridad
 * en las pruebas y en la verificación de los informes: si alguna vez se
 * colara una jugada con dos remates, el doble conteo se vería aquí antes que
 * en una cifra del PDF.
 */
export function sequenceIsWellFormed(events: GameEvent[], sequenceId: string): boolean {
  const propios = eventsOfSequence(events, sequenceId);
  if (propios.length === 0) return false;
  const raices = propios.filter(isSequenceRoot);
  if (raices.length !== 1) return false;
  const desenlaces = propios.filter(isSequenceOutcomeEvent);
  if (desenlaces.length > 1) return false;
  const remates = propios.filter(
    (e) => e.type === ActionType.SHOT || e.type === ActionType.GOAL,
  );
  return remates.length <= 1;
}

/** Todas las jugadas registradas están bien formadas. */
export function allSequencesWellFormed(events: GameEvent[]): boolean {
  return sequenceIdsIn(events).every((id) => sequenceIsWellFormed(events, id));
}

// ── PRESENTACIÓN ────────────────────────────────────────────────────────

/** Lo que enseña la tarjeta única de la jugada en el timeline. */
export type SequenceCard = {
  sequenceId: string;
  root: SetPieceRootKind | null;
  rootLabel: string;
  isOpponent: boolean;
  modality: SetPieceModality | null;
  modalityLabel: string | null;
  locationLabel: string | null;
  outcome: SequenceOutcome | null;
  outcomeLabel: string | null;
  takerId: string | null;
  finisherId: string | null;
  /** Los eventos que la componen. Siguen existiendo: alimentan las cifras. */
  eventIds: string[];
};

/** Dónde ocurrió la reanudación, en texto. */
export function locationLabelOf(event: GameEvent): string | null {
  const root = rootKindOf(event);
  if (root === "corner") {
    const lado = event.metadata?.cornerSide;
    if (isCornerSide(lado)) return lado === "left" ? "Córner izquierdo" : "Córner derecho";
    return null;
  }
  if (root === "throw_in") {
    const lado = throwInSideOf(event);
    const sector = throwInSectorOf(event);
    if (!lado || !sector) return null;
    return `${THROW_IN_SIDE_LABEL[lado]} · ${sector}`;
  }
  if (root === "free_kick") {
    const zona = event.originGrid;
    return isZone12Id(zona) ? `Falta en ${zona}` : null;
  }
  return null;
}

/**
 * La jugada resumida en una tarjeta.
 *
 * Devuelve null para una secuencia sin raíz: no se inventa una tarjeta a
 * partir de un evento suelto.
 */
export function describeSequence(
  events: GameEvent[],
  sequenceId: string,
): SequenceCard | null {
  const propios = eventsOfSequence(events, sequenceId);
  const raiz = propios.find(isSequenceRoot);
  if (!raiz) return null;
  const root = rootKindOf(raiz);
  const modality = modalityOf(raiz);
  const outcome = sequenceOutcomeOf(raiz);
  return {
    sequenceId,
    root,
    rootLabel: root ? SET_PIECE_ROOT_LABEL[root] : "Balón parado",
    isOpponent: !!raiz.metadata?.isOpponent,
    modality,
    modalityLabel: modality ? SET_PIECE_MODALITY_LABEL[modality] : null,
    locationLabel: locationLabelOf(raiz),
    outcome,
    outcomeLabel: outcome ? SEQUENCE_OUTCOME_LABEL[outcome] : null,
    takerId: takerIdOf(raiz),
    finisherId: finisherIdOf(events, sequenceId),
    eventIds: propios.map((e) => e.id),
  };
}

/** Todas las jugadas del partido, en orden de aparición. */
export function describeAllSequences(events: GameEvent[]): SequenceCard[] {
  return sequenceIdsIn(events)
    .map((id) => describeSequence(events, id))
    .filter((c): c is SequenceCard => c !== null);
}

/**
 * Los eventos que hay que borrar para deshacer una jugada entera.
 *
 * Borrar media jugada dejaría un córner sin su gol o un gol sin su córner, y
 * las dos mitades seguirían contando por separado. O se va todo, o no se va
 * nada.
 */
export function eventIdsToDeleteWith(events: GameEvent[], eventId: string): string[] {
  const objetivo = events.find((e) => e.id === eventId);
  if (!objetivo) return [];
  const id = sequenceIdOf(objetivo);
  if (!id) return [eventId];
  return eventsOfSequence(events, id).map((e) => e.id);
}
