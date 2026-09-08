/**
 * src/services/templateLoadService.ts
 *
 * Prioridad LOCAL-FIRST para la plantilla de equipo:
 * 1. localStorage['futsal_template'] si existe y es válida -> se usa y termina.
 * 2. Si no hay copia local válida y hay usuario, Firestore como fallback.
 * 3. Si Firestore devuelve una plantilla válida, se siembra localStorage
 *    con ella (para que la próxima carga ya sea local-first real).
 *
 * Funciones puras/inyectadas: no importan Firebase ni React directamente,
 * para poder testearse con vitest sin mockear todo el SDK.
 */

export type StoredTemplate = {
  teamName: string;
  teamLogo?: string;
  players: unknown[];
  updatedAt?: string;
};

/**
 * Construye el payload persistible de la plantilla. Por construcción de su
 * firma (no recibe opponentName) es imposible que este payload incluya el
 * nombre del rival — la plantilla es siempre "Mi Equipo" únicamente.
 */
export function buildTemplatePayload(
  teamName: string,
  teamLogo: string | undefined,
  players: unknown[],
): StoredTemplate {
  return { teamName, teamLogo, players, updatedAt: new Date().toISOString() };
}

/** Válida si el mínimo estructural para considerar una plantilla usable. */
export function isValidStoredTemplate(data: unknown): data is StoredTemplate {
  return (
    !!data &&
    typeof data === "object" &&
    Array.isArray((data as { players?: unknown }).players)
  );
}

export type LoadTemplateResult = {
  template: StoredTemplate | null;
  source: "local" | "remote" | "none";
};

/**
 * @param readLocal   Lee el JSON crudo de localStorage (o null si no existe).
 * @param fetchRemote Obtiene la plantilla remota (Firestore), o null si no
 *                     hay usuario autenticado / no aplica. Puede lanzar: se
 *                     captura y se trata como "sin plantilla remota".
 * @param writeLocal   Escribe el JSON de la plantilla remota en localStorage
 *                     (siembra), solo se llama cuando remote es válido.
 */
export async function loadTemplateLocalFirst(
  readLocal: () => string | null,
  fetchRemote: (() => Promise<StoredTemplate | null>) | null,
  writeLocal: (json: string) => void,
): Promise<LoadTemplateResult> {
  const raw = readLocal();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isValidStoredTemplate(parsed)) {
        return { template: parsed, source: "local" };
      }
    } catch {
      // Copia local corrupta: se ignora y se intenta la remota, no se lanza.
    }
  }

  if (fetchRemote) {
    try {
      const remote = await fetchRemote();
      if (remote && isValidStoredTemplate(remote)) {
        writeLocal(JSON.stringify(remote));
        return { template: remote, source: "remote" };
      }
    } catch {
      // Fallo de red/Firestore: sin plantilla remota disponible.
    }
  }

  return { template: null, source: "none" };
}
