/**
 * src/utils/legacyZoneMap.ts
 *
 * Capa de compatibilidad para las zonas históricas `A1-C3`.
 *
 * REGLA CENTRAL: este módulo NO convierte. `A1-C3` y las 12 zonas nuevas son
 * dos sistemas espaciales distintos y aquí no existe ninguna ruta de código
 * que produzca un `Zone12Id` a partir de una celda legacy. El histórico no se
 * reescribe, no se reparte proporcionalmente y no se aproxima.
 *
 * ORIENTACIÓN HISTÓRICA (decidida tras auditar el código de captura)
 * -----------------------------------------------------------------
 * Manda la pantalla de captura: lo que el usuario quiso decir es lo que veía
 * al pulsar. `PitchZones` y el selector de PlayerActionRadialMenu dibujan
 * ambos una pista HORIZONTAL (`aspect-[3/2]`, porterías a izquierda y
 * derecha) con una rejilla row-major. Por tanto, sobre esa pista:
 *
 *   - la COLUMNA (1,2,3) es el eje LONGITUDINAL, de una portería a la otra;
 *   - la FILA (A,B,C) es la banda transversal, de arriba abajo.
 *
 * `TacticalHeatMap.tsx` documentaba y pintaba lo contrario (letra = tercio
 * de ataque/medio/defensa, sobre una pista vertical). Estaba girado 90°
 * respecto a la captura y se corrige para alinearlo con esta lectura.
 *
 * LO QUE NO SE PUEDE SABER
 * ------------------------
 * El selector histórico era estático: no se espejaba por equipo ni por
 * `isFieldFlipped`, y el partido no guardaba a qué portería atacaba nadie.
 * Así que `A1-C3` es ABSOLUTO respecto a la pantalla, y la perspectiva del
 * equipo atacante es sencillamente desconocida.
 *
 * De ahí que las etiquetas legacy sean neutras ("Franja 1", "banda superior")
 * y nunca hablen de zona propia o rival: sería una precisión que el dato no
 * permite.
 */
import { Zone12Id, formatZoneLabel, isZone12Id } from "./fieldZones";

export type LegacyRow = "A" | "B" | "C";
export type LegacyCol = "1" | "2" | "3";
export type LegacyZoneId = `${LegacyRow}${LegacyCol}`;

export const LEGACY_ROWS: readonly LegacyRow[] = ["A", "B", "C"];
export const LEGACY_COLS: readonly LegacyCol[] = ["1", "2", "3"];

/** Las 9 celdas históricas, en el mismo orden row-major en que se dibujaban. */
export const LEGACY_ZONE_IDS: readonly LegacyZoneId[] = LEGACY_ROWS.flatMap((row) =>
  LEGACY_COLS.map((col) => `${row}${col}` as LegacyZoneId),
);

export const LEGACY_ZONE_PATTERN = /^[ABC][123]$/;

export function isLegacyZoneId(raw: unknown): raw is LegacyZoneId {
  return typeof raw === "string" && LEGACY_ZONE_PATTERN.test(raw.toUpperCase());
}

/**
 * Clasificación de una zona guardada. El discriminante es el propio valor:
 * no hay campo de versión ni bandera en el evento.
 *
 * Devuelve `null` cuando el evento sencillamente no tiene zona — caso
 * perfectamente válido (p. ej. una falta histórica, o una falta nueva cuya
 * ubicación el usuario descartó).
 */
export type ZoneRef =
  | { kind: "zone12"; id: Zone12Id }
  | { kind: "legacy"; id: LegacyZoneId }
  | { kind: "unknown"; raw: string };

export function classifyZone(raw: unknown): ZoneRef | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (isZone12Id(upper)) return { kind: "zone12", id: upper };
  if (isLegacyZoneId(upper)) return { kind: "legacy", id: upper as LegacyZoneId };
  return { kind: "unknown", raw: trimmed };
}

export function parseLegacyZone(raw: unknown): { row: LegacyRow; col: LegacyCol } | null {
  if (!isLegacyZoneId(raw)) return null;
  const upper = (raw as string).toUpperCase();
  return { row: upper[0] as LegacyRow, col: upper[1] as LegacyCol };
}

// ── ETIQUETAS DE USUARIO ────────────────────────────────────────────────
// Neutras a propósito: describen dónde estaba en la pista tal como se
// dibujaba, sin afirmar de quién era esa zona.

const LEGACY_ROW_LABEL: Record<LegacyRow, string> = {
  A: "banda superior",
  B: "banda central",
  C: "banda inferior",
};

/** `A1` → `"Franja 1 · banda superior"`. */
export function formatLegacyLabel(raw: unknown): string | null {
  const parsed = parseLegacyZone(raw);
  if (!parsed) return null;
  return `Franja ${parsed.col} · ${LEGACY_ROW_LABEL[parsed.row]}`;
}

/**
 * Aviso obligatorio en cualquier mapa o informe construido sobre datos
 * históricos. Cumple "nunca presentar una precisión que los datos no
 * permiten".
 */
export const LEGACY_DISCLAIMER =
  "Datos históricos · rejilla 3×3 · perspectiva de ataque no registrada";

/** Texto para un evento espacial sin ubicación. Nunca se le asigna una zona. */
export const NO_LOCATION_LABEL = "sin ubicación registrada";

/**
 * Etiqueta de usuario para cualquier zona guardada, sea del sistema que sea.
 * Punto único de entrada para la UI: garantiza que ningún código interno
 * (`A1`, `Z2C`, `G5`…) llegue nunca a la pantalla.
 */
export function formatAnyZoneLabel(raw: unknown): string {
  const ref = classifyZone(raw);
  if (!ref) return NO_LOCATION_LABEL;
  switch (ref.kind) {
    case "zone12":
      return formatZoneLabel(ref.id) ?? NO_LOCATION_LABEL;
    case "legacy":
      return formatLegacyLabel(ref.id) ?? NO_LOCATION_LABEL;
    default:
      return NO_LOCATION_LABEL;
  }
}
