/**
 * src/utils/safeImageSrc.ts
 *
 * Valida que una URL de imagen sea segura para insertarse en un atributo
 * `src` (React JSX escapa el texto automáticamente, pero un esquema como
 * `javascript:` o `data:text/html` sigue siendo peligroso si el navegador
 * llega a interpretarlo). Solo admite los esquemas que la app usa
 * realmente para logos hoy — confirmado en PreMatch.tsx: los logos se
 * capturan siempre vía FileReader.readAsDataURL(), es decir, siempre
 * como `data:image/...`.
 *
 * Admitidos:
 * - data:image/...   (formato real y único usado hoy para subir logos)
 * - blob:...          (por si algún día se usa una URL de objeto local)
 * - https://...       (por si en el futuro los logos se sirven desde una
 *                       URL remota, p.ej. almacenamiento en la nube)
 *
 * Rechazados explícitamente:
 * - javascript:, data:text/html, y cualquier otro esquema no listado.
 * - http:// (sin cifrar) — NO hay evidencia en el código de que se use
 *   nunca para logos; se excluye por precaución en vez de admitirlo
 *   "por si acaso". Si en el futuro se detecta un caso real que lo
 *   necesite, añadirlo aquí de forma explícita y documentada.
 * - valores vacíos/undefined o malformados.
 *
 * Si el valor no es seguro, devuelve null — el llamante simplemente no
 * debe renderizar la imagen (nunca lanza, nunca rompe logos legacy
 * válidos con el formato data:image ya usado por la app).
 */
const SAFE_IMAGE_SRC_PATTERN = /^(?:data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+|blob:https?:\/\/[^\s]+|https:\/\/[^\s]+)$/;

export function safeImageSrc(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return SAFE_IMAGE_SRC_PATTERN.test(trimmed) ? trimmed : null;
}
