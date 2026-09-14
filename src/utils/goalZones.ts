/**
 * src/utils/goalZones.ts
 *
 * Zonas de PORTERÍA (destino del tiro). Sistema distinto y separado de las 12
 * zonas de pista: aquí se responde "¿dónde termina el tiro?", no "¿desde
 * dónde se tira?".
 *
 * Los identificadores `G1-G9` y `OUT` no cambian — son datos ya guardados en
 * partidos históricos. Lo que cambia es que dejan de mostrarse: toda la UI
 * pasa por formatGoalZoneLabel().
 *
 * Disposición de la rejilla, tal como se dibuja la portería (row-major):
 *
 *   G1 G2 G3   ← alto
 *   G4 G5 G6   ← medio
 *   G7 G8 G9   ← bajo
 *
 * La columna es izquierda/centro/derecha vista DESDE FUERA de la portería,
 * que es como la ve quien registra el tiro en el selector.
 */
export type GoalZoneId = `G${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export const GOAL_ZONE_IDS: readonly GoalZoneId[] = [
  "G1", "G2", "G3",
  "G4", "G5", "G6",
  "G7", "G8", "G9",
];

/** Tiro fuera o desviado: no impacta en ninguna zona de portería. */
export const GOAL_OUT_ID = "OUT";

export const GOAL_ZONE_PATTERN = /^G[1-9]$/;

export function isGoalZoneId(raw: unknown): raw is GoalZoneId {
  return typeof raw === "string" && GOAL_ZONE_PATTERN.test(raw.toUpperCase());
}

const HEIGHT_LABEL = ["alto", "medio", "bajo"] as const;
const SIDE_LABEL = ["izquierda", "centro", "derecha"] as const;

/** `G5` → `"Medio · centro"`. Devuelve null si no es una zona de portería. */
export function formatGoalZoneLabel(raw: unknown): string | null {
  if (!isGoalZoneId(raw)) return null;
  const index = Number((raw as string).toUpperCase()[1]) - 1;
  const height = HEIGHT_LABEL[Math.floor(index / 3)];
  const side = SIDE_LABEL[index % 3];
  return `${height.charAt(0).toUpperCase()}${height.slice(1)} · ${side}`;
}

/** Etiqueta para cualquier destino guardado, incluido OUT y la ausencia de dato. */
export function formatDestinationLabel(raw: unknown): string {
  if (typeof raw === "string" && raw.toUpperCase() === GOAL_OUT_ID) {
    return "Fuera / desviado";
  }
  return formatGoalZoneLabel(raw) ?? "Destino no registrado";
}
