/**
 * src/utils/fieldOrientation.ts
 *
 * Función pura extraída de MatchTracker.tsx (sin cambio de comportamiento)
 * para poder testearla de forma aislada, sin arrastrar el resto de la
 * página (Firebase, router, animaciones, etc.) al entorno de test.
 *
 * Espeja una coordenada horizontal PORCENTUAL DE PANTALLA (0-100, 0 =
 * borde izquierdo del contenedor del campo) cuando la vista está
 * invertida. Es puramente de PRESENTACIÓN: nunca toca coordenadas del
 * modelo de datos (originGrid/destinationGrid/eventos), solo decide en
 * qué lado de la pantalla se dibuja algo ya calculado.
 */
export const applyFieldFlip = (uiLeftPercent: number, isFieldFlipped: boolean): number =>
  isFieldFlipped ? 100 - uiLeftPercent : uiLeftPercent;
