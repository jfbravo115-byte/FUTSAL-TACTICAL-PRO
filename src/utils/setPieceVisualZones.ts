/**
 * src/utils/setPieceVisualZones.ts
 *
 * DE LO QUE SE TOCA A LO QUE SE GUARDA, Y VUELTA.
 *
 * El analista no tiene que leer códigos (`Z4L`, `Z2C`) para registrar dónde
 * se saca un córner o una falta: toca la zona en una mini pista. Este módulo
 * es la ÚNICA traducción entre esa selección visual y los datos canónicos de
 * siempre —`cornerSide` y `originGrid`—, que no cambian de significado: los
 * mapas, las estadísticas, el CSV, el JSON, el PDF y Tactical Pro siguen
 * leyendo exactamente lo mismo que leían.
 *
 * LA MINI PISTA SE DIBUJA DESDE QUIEN EJECUTA
 * -------------------------------------------
 * Siempre igual, sea nuestro equipo o el rival, y gire como gire el campo de
 * la pantalla principal:
 *
 *   - quien ejecuta ATACA HACIA LA DERECHA: su portería, a la izquierda; la
 *     del rival, a la derecha;
 *   - mirando hacia la derecha, su IZQUIERDA es la parte de ARRIBA y su
 *     DERECHA la de abajo.
 *
 * Es la misma convención con la que ya se guardan las zonas (Z1 = campo
 * propio, Z4 = campo rival; L/R = izquierda/derecha de quien ejecuta), así
 * que la traducción es directa y sin pérdida, y no depende de la orientación
 * del campo en pantalla: un córner del rival tocado en su esquina superior
 * derecha es su córner izquierdo, igual que el nuestro.
 */
import { CornerSide, cornerOriginGrid } from "./cornerModel";
import { ZONE_BANDS, ZONE_LANES, Zone12Id, ZoneBand, ZoneLane, makeZone12, parseZone12 } from "./fieldZones";

// ── CÓRNER ──────────────────────────────────────────────────────────────

/** Las cuatro esquinas de la mini pista, tal como se ven. */
export type VisualCorner = "top-left" | "bottom-left" | "top-right" | "bottom-right";

export const VISUAL_CORNERS: readonly VisualCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

export const VISUAL_CORNER_LABEL: Record<VisualCorner, string> = {
  "top-left": "esquina superior izquierda",
  "bottom-left": "esquina inferior izquierda",
  "top-right": "esquina superior derecha",
  "bottom-right": "esquina inferior derecha",
};

/**
 * La esquina tocada → el lado canónico del córner.
 *
 * Solo las dos esquinas del lado de la portería RIVAL (la derecha de la mini
 * pista) son un córner a favor: en las de su propia portería no se saca un
 * córner, se saca de puerta. Para esas devuelve null y la ventana las
 * muestra deshabilitadas.
 */
export function cornerSideFromVisual(corner: VisualCorner): CornerSide | null {
  if (corner === "top-right") return "left";
  if (corner === "bottom-right") return "right";
  return null;
}

/** El lado canónico → la esquina que hay que iluminar. */
export function visualCornerFor(side: CornerSide): VisualCorner {
  return side === "left" ? "top-right" : "bottom-right";
}

/** ¿Se puede sacar un córner a favor desde esta esquina? */
export function isPlayableCorner(corner: VisualCorner): boolean {
  return cornerSideFromVisual(corner) !== null;
}

/** «Córner desde esquina inferior derecha · córner derecho». */
export function describeVisualCorner(side: CornerSide): string {
  return `Córner desde ${VISUAL_CORNER_LABEL[visualCornerFor(side)]} · córner ${
    side === "left" ? "izquierdo" : "derecho"
  }`;
}

/** El córner sigue guardando también su enlace con las 12 zonas. */
export function cornerGridFromVisual(corner: VisualCorner): Zone12Id | null {
  const side = cornerSideFromVisual(corner);
  return side ? cornerOriginGrid(side) : null;
}

// ── FALTA ───────────────────────────────────────────────────────────────

/**
 * La rejilla de la falta: 4 columnas de profundidad × 3 filas de carril,
 * exactamente las 12 zonas que ya existen. Columnas de izquierda a derecha
 * = Z1 (junto a su portería) … Z4 (junto a la rival); filas de arriba a
 * abajo = su izquierda, el centro y su derecha.
 */
export const FREE_KICK_COLUMNS: readonly ZoneBand[] = ZONE_BANDS;
export const FREE_KICK_ROWS: readonly ZoneLane[] = ZONE_LANES;

/** Carril, en palabras. */
export const FREE_KICK_LANE_LABEL: Record<ZoneLane, string> = {
  L: "banda izquierda",
  C: "carril central",
  R: "banda derecha",
};

/** Profundidad, en palabras: «alta» es cerca de la portería rival. */
export const FREE_KICK_DEPTH_LABEL: Record<ZoneBand, string> = {
  1: "zona baja",
  2: "zona media-baja",
  3: "zona media-alta",
  4: "zona alta",
};

/** Celda tocada (fila, columna, desde 0) → zona canónica. */
export function freeKickZoneFromCell(row: number, column: number): Zone12Id {
  const lane = FREE_KICK_ROWS[row];
  const band = FREE_KICK_COLUMNS[column];
  if (!lane || !band) throw new RangeError(`Celda fuera de la rejilla: ${row}, ${column}`);
  return makeZone12(band, lane);
}

/** Zona canónica → celda que hay que iluminar, o null si no es de 12 zonas. */
export function freeKickCellOf(zone: unknown): { row: number; column: number } | null {
  const parsed = parseZone12(zone);
  if (!parsed) return null;
  return { row: FREE_KICK_ROWS.indexOf(parsed.lane), column: FREE_KICK_COLUMNS.indexOf(parsed.band) };
}

/** `Z4L` → «banda izquierda · zona alta». null si no es de 12 zonas. */
export function describeFreeKickZone(zone: unknown): string | null {
  const parsed = parseZone12(zone);
  if (!parsed) return null;
  return `${FREE_KICK_LANE_LABEL[parsed.lane]} · ${FREE_KICK_DEPTH_LABEL[parsed.band]}`;
}

/** `Z4L` → «Falta en banda izquierda · zona alta». */
export function describeFreeKickLocation(zone: unknown): string | null {
  const texto = describeFreeKickZone(zone);
  return texto ? `Falta en ${texto}` : null;
}
