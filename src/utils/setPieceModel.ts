/**
 * src/utils/setPieceModel.ts
 *
 * Balón parado. Función pura, sin React y sin DOM.
 *
 * FOUL ES UNA INFRACCIÓN, NO UNA EJECUCIÓN
 * ----------------------------------------
 * Un evento `FOUL` dice quién COMETE la falta. Quién ejecuta después la
 * reanudación es otro jugador, del otro equipo, en otra acción — así que
 * preguntar "¿esa falta fue tiro o jugada?" sobre el evento del infractor
 * mezcla dos cosas que no son la misma. Por eso `setPieceOutcome` solo
 * pertenece al CÓRNER, donde el evento SÍ representa el balón parado que se
 * ejecuta y no una infracción atribuida a un rival.
 *
 * El tiro de falta se identifica por el otro extremo, en el propio tiro:
 * `SHOT.metadata.setPiece === 'free_kick'`. Y no se relaciona con ningún
 * `FOUL` concreto: ni por id ni por cercanía temporal.
 *
 * DOS PREGUNTAS DISTINTAS, DOS CAMPOS DISTINTOS
 * ---------------------------------------------
 * No son la misma cosa y no deben mezclarse ni sumarse:
 *
 *   metadata.setPieceOutcome   ¿cómo se EJECUTÓ este córner?
 *       'shot' | 'play'        Vive SOLO en el evento CORNER.
 *       ausente = no registrado.
 *
 *   metadata.setPiece          ¿de dónde PROCEDE este tiro?
 *       'normal' | 'free_kick' | 'corner' | 'penalty' | 'double_penalty'
 *       Vive en el evento SHOT o GOAL. Ya existía para penaltis y faltas;
 *       aquí solo se tipa, se centraliza y se le añade 'corner'.
 *
 * SIN RELACIÓN FÍSICA ENTRE EVENTOS
 * ---------------------------------
 * Un córner ejecutado en tiro y un tiro declarado "desde córner" son DOS
 * declaraciones independientes del operador sobre dos acciones reales
 * distintas. Ninguna crea la otra y ninguna se deduce de la otra:
 *
 *   - no hay relatedEventId / parentEventId / sequenceId;
 *   - no se relacionan por cercanía temporal;
 *   - por tanto no puede haber doble conteo: el córner suma a córners y el
 *     tiro suma a tiros, cada uno en su agregado.
 *
 * AUSENCIA = NO REGISTRADO
 * ------------------------
 * No existe un valor "unknown". Un partido anterior a Fase 5 simplemente no
 * trae el campo, y eso se lee y se imprime como "subtipo no registrado".
 * Guardar un marcador explícito habría obligado a migrar los históricos.
 */
import { ActionType, GameEvent, GoalieAction } from "../types/futsal";

// ── CÓMO SE EJECUTA UN CÓRNER O UNA FALTA ───────────────────────────────

export type SetPieceOutcome = "shot" | "play";

export const SET_PIECE_OUTCOMES: readonly SetPieceOutcome[] = ["shot", "play"];

/** Única vía autorizada para nombrarlo. El usuario nunca lee 'shot'. */
/**
 * Etiqueta de usuario. «Tiro directo» y no «Tiro» a propósito: describe que
 * el córner se ejecutó directamente hacia portería, y así no se confunde con
 * el tiro que declara proceder de un córner (`SHOT.setPiece === 'corner'`),
 * que es un registro distinto y se cuenta aparte.
 */
export const SET_PIECE_OUTCOME_LABEL: Record<SetPieceOutcome, string> = {
  shot: "Tiro directo",
  play: "Jugada",
};

/** Plural, para cabeceras y resúmenes. */
export const SET_PIECE_OUTCOME_LABEL_PLURAL: Record<SetPieceOutcome, string> = {
  shot: "Tiros directos",
  play: "Jugadas",
};

export const SET_PIECE_OUTCOME_DESCRIPTION: Record<SetPieceOutcome, string> = {
  shot: "Se ejecuta directamente hacia portería",
  play: "Ejecución mediante jugada",
};

/** Texto para lo que no se registró. Nunca se infiere ni se reparte. */
export const SET_PIECE_OUTCOME_UNRECORDED_LABEL = "Subtipo no registrado";

export function isSetPieceOutcome(raw: unknown): raw is SetPieceOutcome {
  return raw === "shot" || raw === "play";
}

/**
 * Acciones que admiten "¿cómo se ejecutó?". Solo el córner: una falta es la
 * infracción del rival, no la reanudación que ejecuta el equipo beneficiado.
 */
export function acceptsSetPieceOutcome(type: ActionType | GoalieAction): boolean {
  return type === ActionType.CORNER;
}

/**
 * Desenlace declarado, o null si no se registró.
 *
 * Un evento que no admite desenlace devuelve null AUNQUE traiga el campo: así
 * cualquier `FOUL` que lo tuviera —solo pudo escribirse durante el desarrollo
 * de esta fase— queda inerte en toda la app sin necesidad de migrar nada.
 */
export function setPieceOutcomeOf(event: GameEvent): SetPieceOutcome | null {
  if (!acceptsSetPieceOutcome(event.type)) return null;
  const raw = event.metadata?.setPieceOutcome;
  return isSetPieceOutcome(raw) ? raw : null;
}

/** `"Tiro"` / `"Jugada"` / `null` si no consta. */
export function formatSetPieceOutcome(event: GameEvent): string | null {
  const outcome = setPieceOutcomeOf(event);
  return outcome ? SET_PIECE_OUTCOME_LABEL[outcome] : null;
}

// ── DE DÓNDE PROCEDE UN TIRO ────────────────────────────────────────────

export type SetPieceOrigin =
  | "normal"
  | "free_kick"
  | "corner"
  | "penalty"
  | "double_penalty";

/** Orden de presentación en la captura. `normal` es el valor por defecto. */
export const SET_PIECE_ORIGINS: readonly SetPieceOrigin[] = [
  "normal",
  "free_kick",
  "corner",
  "penalty",
  "double_penalty",
];

export const SET_PIECE_ORIGIN_LABEL: Record<SetPieceOrigin, string> = {
  normal: "Jugada",
  free_kick: "Falta",
  corner: "Córner",
  penalty: "Penalti",
  double_penalty: "Doble penalti",
};

/** Etiqueta corta para chips e Historial, donde el ancho manda. */
export const SET_PIECE_ORIGIN_SHORT_LABEL: Record<SetPieceOrigin, string> = {
  normal: "Jugada",
  free_kick: "Falta",
  corner: "Córner",
  penalty: "Penalti",
  double_penalty: "Doble P.",
};

export function isSetPieceOrigin(raw: unknown): raw is SetPieceOrigin {
  return typeof raw === "string" && (SET_PIECE_ORIGINS as readonly string[]).includes(raw);
}

/**
 * Procedencia declarada del tiro. `normal` y la ausencia son lo mismo a
 * efectos de lectura — un tiro de jugada —, así que devuelve null en ambos
 * casos y quien quiera el valor crudo lo pide con `setPieceOriginOf`.
 */
export function declaredSetPieceOrigin(event: GameEvent): SetPieceOrigin | null {
  const raw = event.metadata?.setPiece;
  if (!isSetPieceOrigin(raw) || raw === "normal") return null;
  return raw;
}

/** Procedencia cruda, con `normal` incluido. */
export function setPieceOriginOf(event: GameEvent): SetPieceOrigin {
  const raw = event.metadata?.setPiece;
  return isSetPieceOrigin(raw) ? raw : "normal";
}

/** Etiqueta del chip de procedencia, o null cuando fue jugada normal. */
export function formatSetPieceOrigin(event: GameEvent): string | null {
  const origin = declaredSetPieceOrigin(event);
  return origin ? SET_PIECE_ORIGIN_SHORT_LABEL[origin] : null;
}

// ── AGREGADOS ───────────────────────────────────────────────────────────

export type SetPieceOutcomeSummary = {
  total: number;
  shot: number;
  play: number;
  /** Registrados sin desenlace. Se declaran; no se reparten ni se estiman. */
  unrecorded: number;
};

export function emptySetPieceSummary(): SetPieceOutcomeSummary {
  return { total: 0, shot: 0, play: 0, unrecorded: 0 };
}

/**
 * Desglosa los CÓRNERS por desenlace. `opponent` selecciona el bando igual
 * que el resto de agregados de la app.
 *
 * No existe el equivalente para faltas: clasificar una falta cometida como
 * "tiro" o "jugada" sería falso — describe lo que hizo el rival después.
 */
export function summarizeCornerOutcomes(
  events: GameEvent[],
  opponent = false,
): SetPieceOutcomeSummary {
  const propios = events.filter(
    (e) => e.type === ActionType.CORNER && !!e.metadata?.isOpponent === opponent,
  );

  const summary = emptySetPieceSummary();
  summary.total = propios.length;

  for (const e of propios) {
    const outcome = setPieceOutcomeOf(e);
    if (outcome === "shot") summary.shot += 1;
    else if (outcome === "play") summary.play += 1;
    else summary.unrecorded += 1;
  }

  return summary;
}

/**
 * `"6 · tiros directos 4 · jugadas 1 · sin registrar 1"`. Devuelve null si no
 * hubo ninguno: no se redactan frases sobre lo que no ocurrió.
 *
 * «Tiros directos» cuenta CÓRNERS ejecutados hacia portería. No es lo mismo
 * que «tiros procedentes de córner», que cuenta TIROS y se lee del propio
 * tiro: son dos registros independientes y nunca se suman ni se deducen uno
 * del otro.
 */
export function describeSetPieceOutcomes(summary: SetPieceOutcomeSummary): string | null {
  if (summary.total === 0) return null;
  const partes: string[] = [];
  if (summary.shot > 0) {
    partes.push(`${SET_PIECE_OUTCOME_LABEL_PLURAL.shot.toLowerCase()} ${summary.shot}`);
  }
  if (summary.play > 0) {
    partes.push(`${SET_PIECE_OUTCOME_LABEL_PLURAL.play.toLowerCase()} ${summary.play}`);
  }
  if (summary.unrecorded > 0) partes.push(`sin registrar ${summary.unrecorded}`);
  return partes.length > 0 ? `${summary.total} · ${partes.join(" · ")}` : String(summary.total);
}

/**
 * Tiros (o goles) que DECLARAN proceder de un balón parado concreto.
 *
 * Es la única vía para "tiros de falta": se lee del propio tiro, no del
 * evento FOUL del rival, y no requiere relacionar los dos eventos.
 */
export function countShotsFromSetPiece(
  events: GameEvent[],
  origin: SetPieceOrigin,
  opponent = false,
): number {
  return events.filter(
    (e) =>
      (e.type === ActionType.SHOT || e.type === ActionType.GOAL) &&
      !!e.metadata?.isOpponent === opponent &&
      setPieceOriginOf(e) === origin,
  ).length;
}

// ── REANUDACIÓN EJECUTADA (ActionType.SET_PIECE) ────────────────────────
//
// Un evento SET_PIECE dice que el equipo EJECUTÓ una reanudación a favor. En
// Fase 5 solo existe un caso: una falta a favor jugada en corto. El botón que
// lo captura ya lleva esa información, así que no hay pasos intermedios.
//
// Lo que NO es, y por qué importa:
//   · no es una infracción — eso es FOUL, y pertenece al equipo contrario;
//   · no es un tiro — eso es SHOT con `setPiece`, y se cuenta allí;
//   · no es un córner — el córner tiene tipo propio y no se toca.
//
// Tampoco se enlaza con el FOUL que la originó: ni por id ni por cercanía
// temporal. Son dos hechos independientes de dos equipos distintos.

/** Procedencias que puede declarar una reanudación EJECUTADA. */
export type SetPieceRestartOrigin = "free_kick";

export const SET_PIECE_RESTART_ORIGINS: readonly SetPieceRestartOrigin[] = ["free_kick"];

/** Desenlaces que puede declarar una reanudación EJECUTADA. */
export type SetPieceRestartOutcome = "play";

export const SET_PIECE_RESTART_OUTCOMES: readonly SetPieceRestartOutcome[] = ["play"];

/** Etiqueta de usuario. Nunca se muestra `SET_PIECE` ni `free_kick`. */
export const SET_PIECE_RESTART_LABEL = "Jugada de falta";
export const SET_PIECE_RESTART_LABEL_PLURAL = "Jugadas de falta";

export function isSetPieceRestartOrigin(raw: unknown): raw is SetPieceRestartOrigin {
  return raw === "free_kick";
}

export function isSetPieceRestartOutcome(raw: unknown): raw is SetPieceRestartOutcome {
  return raw === "play";
}

/**
 * ¿Es una reanudación ejecutada válida?
 *
 * Exige los dos valores: un SET_PIECE con `corner`, con `shot` o sin
 * declaración no es una reanudación de las que esta fase sabe contar, y se
 * ignora en vez de colarse en un agregado diciendo algo que no sabemos.
 */
export function isSetPieceRestart(event: GameEvent): boolean {
  return (
    event.type === ActionType.SET_PIECE &&
    isSetPieceRestartOrigin(event.metadata?.setPieceOrigin) &&
    isSetPieceRestartOutcome(event.metadata?.setPieceOutcome)
  );
}

/** Metadata de una reanudación nueva. Única vía para producirla. */
export function newSetPieceRestartMetadata(): {
  setPieceOrigin: SetPieceRestartOrigin;
  setPieceOutcome: SetPieceRestartOutcome;
} {
  return { setPieceOrigin: "free_kick", setPieceOutcome: "play" };
}

export type SetPieceRestartSummary = {
  total: number;
  /** Con sector registrado. La ubicación es opcional y se declara. */
  located: number;
  unlocated: number;
};

/**
 * Jugadas de falta de un bando. `opponent` selecciona igual que el resto de
 * agregados: el bando que EJECUTA la reanudación.
 */
export function summarizeSetPieceRestarts(
  events: GameEvent[],
  opponent = false,
  isLocated: (event: GameEvent) => boolean = (e) => typeof e.originGrid === "string" && e.originGrid.length > 0,
): SetPieceRestartSummary {
  const propias = events.filter(
    (e) => isSetPieceRestart(e) && !!e.metadata?.isOpponent === opponent,
  );
  const located = propias.filter(isLocated).length;
  return { total: propias.length, located, unlocated: propias.length - located };
}
