/**
 * src/utils/setPieceModel.ts
 *
 * Balón parado. Función pura, sin React y sin DOM.
 *
 * DOS PREGUNTAS DISTINTAS, DOS CAMPOS DISTINTOS
 * ---------------------------------------------
 * No son la misma cosa y no deben mezclarse ni sumarse:
 *
 *   metadata.setPieceOutcome   ¿cómo se EJECUTÓ este córner / esta falta?
 *       'shot' | 'play'        Vive en el evento CORNER o FOUL.
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
export const SET_PIECE_OUTCOME_LABEL: Record<SetPieceOutcome, string> = {
  shot: "Tiro",
  play: "Jugada",
};

export const SET_PIECE_OUTCOME_DESCRIPTION: Record<SetPieceOutcome, string> = {
  shot: "Ejecución orientada directamente a tiro",
  play: "Ejecución mediante jugada",
};

/** Texto para lo que no se registró. Nunca se infiere ni se reparte. */
export const SET_PIECE_OUTCOME_UNRECORDED_LABEL = "Subtipo no registrado";

export function isSetPieceOutcome(raw: unknown): raw is SetPieceOutcome {
  return raw === "shot" || raw === "play";
}

/** Acciones que admiten "¿cómo se ejecutó?". Solo el balón parado propio. */
export function acceptsSetPieceOutcome(type: ActionType | GoalieAction): boolean {
  return type === ActionType.CORNER || type === ActionType.FOUL;
}

/** Desenlace declarado, o null si no se registró. */
export function setPieceOutcomeOf(event: GameEvent): SetPieceOutcome | null {
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
 * Desglosa por desenlace los eventos de un tipo de balón parado y un bando.
 * `opponent` selecciona el bando igual que el resto de agregados de la app.
 */
export function summarizeSetPieceOutcomes(
  events: GameEvent[],
  type: ActionType.CORNER | ActionType.FOUL,
  opponent = false,
): SetPieceOutcomeSummary {
  const propios = events.filter(
    (e) => e.type === type && !!e.metadata?.isOpponent === opponent,
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
 * `"6 — 4 tiro · 1 jugada · 1 subtipo no registrado"`. Devuelve null si no
 * hubo ninguno: no se redactan frases sobre lo que no ocurrió.
 */
export function describeSetPieceOutcomes(summary: SetPieceOutcomeSummary): string | null {
  if (summary.total === 0) return null;
  const partes: string[] = [];
  if (summary.shot > 0) partes.push(`${summary.shot} tiro`);
  if (summary.play > 0) partes.push(`${summary.play} jugada`);
  if (summary.unrecorded > 0) {
    partes.push(`${summary.unrecorded} ${SET_PIECE_OUTCOME_UNRECORDED_LABEL.toLowerCase()}`);
  }
  return partes.length > 0 ? `${summary.total} — ${partes.join(" · ")}` : String(summary.total);
}
