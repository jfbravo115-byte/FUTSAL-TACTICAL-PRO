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
 */
export type CaptureMode = "focal" | "dual";

export const CAPTURE_MODE_KEY = "futsal_capture_mode_v1";

export const CAPTURE_MODE_LABEL: Record<CaptureMode, string> = {
  focal: "Vista focal",
  dual: "Vista dual",
};

/**
 * Umbrales de las dos composiciones, fijados POR MEDICIÓN.
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
export const DUAL_COLUMNS_MIN_WIDTH = 1024;
export const DUAL_COLUMNS_MIN_HEIGHT = 820;
export const DUAL_ROWS_MIN_WIDTH = 768;
export const DUAL_ROWS_MIN_HEIGHT = 900;

/** Compatibilidad: el ancho por debajo del cual no hay vista dual posible. */
export const DUAL_MIN_WIDTH = DUAL_ROWS_MIN_WIDTH;

export type DualLayout = "columns" | "rows" | null;

/**
 * Qué composición cabe DE VERDAD en este viewport, o null.
 *
 * Es la única función que decide si la vista dual está disponible. Un modo que
 * no cabe no se ofrece, no se activa y no se guarda: enseñar diez fichas con
 * un campo de 58 px de alto es peor que no enseñarlas.
 */
export function dualLayoutFor(width: number, height: number): DualLayout {
  if (width >= DUAL_COLUMNS_MIN_WIDTH && height >= DUAL_COLUMNS_MIN_HEIGHT) return "columns";
  if (width >= DUAL_ROWS_MIN_WIDTH && height >= DUAL_ROWS_MIN_HEIGHT) return "rows";
  return null;
}

/**
 * Por qué no cabe, para decirlo en una línea discreta en vez de dejar un
 * botón apagado sin explicación. null cuando sí cabe.
 */
export function dualUnavailableReason(width: number, height: number): string | null {
  if (dualLayoutFor(width, height)) return null;
  if (width >= DUAL_ROWS_MIN_WIDTH) return "Vista dual no disponible con esta altura de pantalla";
  return "Vista dual no disponible con esta anchura de pantalla";
}

export function isCaptureMode(raw: unknown): raw is CaptureMode {
  return raw === "focal" || raw === "dual";
}

export function readCaptureMode(): CaptureMode {
  try {
    const raw = localStorage.getItem(CAPTURE_MODE_KEY);
    return isCaptureMode(raw) ? raw : "focal";
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
