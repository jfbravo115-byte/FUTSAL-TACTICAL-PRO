/**
 * src/utils/captureMode.ts
 *
 * EXPERIMENTO · el modo de captura es una preferencia del NAVEGADOR.
 *
 * No entra en `matchData`, no se sincroniza, no viaja a ninguna exportación y
 * no cambia ni un evento: dos analistas con modos distintos capturando el
 * mismo partido producen exactamente los mismos datos. Por eso vive en
 * `localStorage` y no en el partido.
 *
 * Si el almacenamiento falla —modo privado, cuota, permisos— se trabaja en
 * `focal`, que es la interfaz ya validada.
 *
 * LOS TRES MODOS
 * --------------
 *   focal    · un equipo a la vez, el campo grande. Es la interfaz de la
 *              PR #27, intacta: sigue siendo la referencia y el refugio.
 *   columns  · las dos plantillas a los lados (o una sobre otra) y el campo
 *              en medio. Se llamaba «Vista dual».
 *   pitch    · los diez sobre una sola pista, 5 contra 5, pulsables directo.
 */
export type CaptureMode = "focal" | "columns" | "pitch";

export const CAPTURE_MODE_KEY = "futsal_capture_mode_v1";

export const CAPTURE_MODE_LABEL: Record<CaptureMode, string> = {
  focal: "Vista focal",
  columns: "Vista columnas",
  pitch: "Vista pista 5v5",
};

export const CAPTURE_MODES: CaptureMode[] = ["focal", "columns", "pitch"];

/**
 * Umbrales de cada composición, fijados POR MEDICIÓN.
 *
 * COLUMNAS · las dos plantillas a los lados del campo.
 *   Piden ancho Y alto: cada plantilla apila cinco fichas de 44 px más su
 *   cabecera, y a 1024×768 las dos últimas quedaban por debajo de la barra de
 *   acciones —medido con `elementFromPoint`: inalcanzables—.
 *
 * FILAS · local sobre el campo y rival debajo.
 *   Caben en menos ancho, pero se comen alto: a 1024×768 el campo quedaba en
 *   758×58, que no es un campo. Por eso piden más alto que las columnas.
 */
export const COLUMNS_MIN_WIDTH = 1024;
export const COLUMNS_MIN_HEIGHT = 820;
export const ROWS_MIN_WIDTH = 768;
export const ROWS_MIN_HEIGHT = 900;

/**
 * PISTA 5v5 · los diez dentro del campo.
 *
 * No necesita columnas laterales, así que gasta menos ancho que `columns`,
 * pero el alto es crítico por otra razón: la separación de fichas que se tapan
 * se hace en vertical, y si la pista es baja no hay sitio donde separarlas.
 * `layoutSharedPitch` lo comprueba con las medidas reales; estos umbrales son
 * la primera barrera, sobre el viewport.
 */
export const PITCH_MIN_WIDTH = 900;
export const PITCH_MIN_HEIGHT = 820;

export type ColumnsLayout = "columns" | "rows" | null;

/**
 * Qué composición de columnas cabe DE VERDAD en este viewport, o null.
 *
 * Un modo que no cabe no se ofrece, no se activa y no se guarda: enseñar diez
 * fichas con un campo de 58 px de alto es peor que no enseñarlas.
 */
export function columnsLayoutFor(width: number, height: number): ColumnsLayout {
  if (width >= COLUMNS_MIN_WIDTH && height >= COLUMNS_MIN_HEIGHT) return "columns";
  if (width >= ROWS_MIN_WIDTH && height >= ROWS_MIN_HEIGHT) return "rows";
  return null;
}

/** ¿Cabe la pista 5v5 en este viewport? */
export function pitchAvailableFor(width: number, height: number): boolean {
  return width >= PITCH_MIN_WIDTH && height >= PITCH_MIN_HEIGHT;
}

/** `focal` siempre cabe. Es la condición que hace seguro cualquier fallback. */
export function isCaptureModeAvailable(mode: CaptureMode, width: number, height: number): boolean {
  if (mode === "focal") return true;
  if (mode === "columns") return columnsLayoutFor(width, height) !== null;
  return pitchAvailableFor(width, height);
}

/**
 * Por qué no cabe, para decirlo en una línea discreta en vez de dejar un
 * botón apagado sin explicación. null cuando sí cabe.
 */
export function captureUnavailableReason(
  mode: CaptureMode,
  width: number,
  height: number,
): string | null {
  if (isCaptureModeAvailable(mode, width, height)) return null;
  const nombre = CAPTURE_MODE_LABEL[mode];
  const anchoSuficiente = mode === "columns" ? width >= ROWS_MIN_WIDTH : width >= PITCH_MIN_WIDTH;
  return anchoSuficiente
    ? `${nombre} no disponible con esta altura de pantalla`
    : `${nombre} no disponible con esta anchura de pantalla`;
}

/**
 * El modo que se usa de verdad: el preferido si cabe, `focal` si no.
 *
 * Girar la tablet o abrir el teclado no puede dejar la captura a medias, así
 * que el fallback es inmediato y silencioso en el dato —se avisa en la
 * interfaz, no cambiando la preferencia guardada—.
 */
export function effectiveCaptureMode(
  preferred: CaptureMode,
  width: number,
  height: number,
): CaptureMode {
  return isCaptureModeAvailable(preferred, width, height) ? preferred : "focal";
}

/**
 * Lee un valor guardado, incluidos los del experimento anterior.
 *
 * `"dual"` era el nombre de la vista de columnas antes de que hubiera tres
 * modos. Quien ya la tenía elegida se la encuentra donde la dejó, con el
 * nombre nuevo; cualquier otra cosa cae en `focal`.
 */
export function normalizeCaptureMode(raw: unknown): CaptureMode | null {
  if (raw === "dual") return "columns";
  return CAPTURE_MODES.includes(raw as CaptureMode) ? (raw as CaptureMode) : null;
}

export function isCaptureMode(raw: unknown): raw is CaptureMode {
  return CAPTURE_MODES.includes(raw as CaptureMode);
}

export function readCaptureMode(): CaptureMode {
  try {
    return normalizeCaptureMode(localStorage.getItem(CAPTURE_MODE_KEY)) ?? "focal";
  } catch {
    return "focal";
  }
}

export function writeCaptureMode(mode: CaptureMode): void {
  try {
    localStorage.setItem(CAPTURE_MODE_KEY, mode);
  } catch {
    // Una preferencia visual no puede romper la captura de un partido.
  }
}
