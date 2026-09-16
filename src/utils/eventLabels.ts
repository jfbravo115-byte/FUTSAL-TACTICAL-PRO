/**
 * src/utils/eventLabels.ts
 *
 * Etiqueta de usuario de un evento para el Historial. Función pura, sin React
 * y sin DOM.
 *
 * POR QUÉ ESTÁ AQUÍ
 * -----------------
 * Era una cadena de ternarios dentro del JSX de MatchTracker.tsx, así que no
 * podía probarse. Su último caso, `e.type.replace(/_/g," ")`, imprimía el
 * código interno en crudo para cualquier tipo sin rama propia — y eso es
 * exactamente lo que le pasaba a `CORNER`, que el usuario veía escrito así.
 *
 * Regla: el Historial nunca muestra un identificador interno.
 */
import { ActionType, GameEvent, GoalieAction } from "../types/futsal";
import { formatExit, formatGoalieAction } from "./goalkeeperActions";
import { formatCornerEventLabel } from "./cornerModel";
import { formatSetPieceOutcome } from "./setPieceModel";

/** Etiquetas de los tipos que no necesitan mirar el metadata. */
const SIMPLE_LABEL: Partial<Record<string, string>> = {
  [ActionType.GOAL]: "⚽ Gol",
  [ActionType.SHOT]: "🎯 Tiro",
  [ActionType.ASSIST]: "👟 Asistencia",
  [ActionType.UNFORCED_ERROR]: "❌ Pérdida",
  [ActionType.YELLOW_CARD]: "🟨 Tarjeta amarilla",
  [ActionType.RED_CARD]: "🟥 Tarjeta roja",
  [ActionType.TIMEOUT]: "⏱️ Tiempo muerto",
  [ActionType.SUBSTITUTION]: "🔄 Cambio",
  [GoalieAction.GOAL_CONCEDED]: "🔴 Gol encajado",
};

const LOSS_SUBTYPE: Partial<Record<string, string>> = {
  bad_pass: "🎯 Error pase",
  bad_dribble: "🏃 Error regate",
  bad_control: "🤲 Error control",
};

const SAVE_TYPES: readonly string[] = [
  GoalieAction.SAVE,
  GoalieAction.SAVE_PARRY,
  GoalieAction.SAVE_CATCH,
  GoalieAction.SAVE_DEFLECT,
];

/**
 * `"🚩 Córner · izquierda · Tiro"`, `"⚠️ Falta · Jugada"`, `"✅ Recuperación"`…
 *
 * Nunca devuelve un código interno: un tipo desconocido cae a una etiqueta
 * genérica en vez de imprimir el identificador.
 */
export function formatEventTypeLabel(event: GameEvent): string {
  const type = String(event.type);

  if (type === ActionType.STEAL || type === ActionType.INTERCEPTION) {
    return event.metadata?.subType === "clearance" ? "↗️ Despeje" : "✅ Recuperación";
  }

  if (type === ActionType.LOSS) {
    return LOSS_SUBTYPE[String(event.metadata?.subType)] ?? "❌ Pérdida";
  }

  // Balón parado: el desenlace se añade solo si consta. Nunca se inventa.
  if (type === ActionType.CORNER) return `🚩 ${formatCornerEventLabel(event)}`;
  if (type === ActionType.FOUL) {
    return `⚠️ ${["Falta", formatSetPieceOutcome(event)].filter(Boolean).join(" · ")}`;
  }

  if (type === GoalieAction.EXIT) return `🧤 ${formatExit(event)}`;
  if (SAVE_TYPES.includes(type)) return `🧤 ${formatGoalieAction(type)}`;

  return SIMPLE_LABEL[type] ?? "• Acción registrada";
}
