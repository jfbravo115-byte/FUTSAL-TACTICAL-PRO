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
 * Anchos mínimos, fijados POR MEDICIÓN y no por intuición.
 *
 *   DUAL_COLUMNS_MIN_WIDTH  las dos plantillas a los lados del campo.
 *   DUAL_MIN_WIDTH          composición en filas: local arriba, rival abajo.
 *
 * Por debajo del segundo no hay vista dual: dos plantillas completas en un
 * móvil salen ilegibles, y la interfaz validada ya resuelve ese caso.
 */
export const DUAL_COLUMNS_MIN_WIDTH = 1024;
export const DUAL_MIN_WIDTH = 768;

/**
 * Alto mínimo para las columnas laterales.
 *
 * No basta con el ancho: en columna cada plantilla apila cinco fichas de 44 px
 * más su cabecera, y a 1024×768 las dos últimas quedaban por debajo de la
 * barra de acciones —medido con `elementFromPoint`: inalcanzables—. Con menos
 * alto se usan las filas, que a ese tamaño sí caben enteras.
 */
export const DUAL_COLUMNS_MIN_HEIGHT = 820;

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
