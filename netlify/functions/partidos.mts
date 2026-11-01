/**
 * netlify/functions/partidos.mts
 *
 * CRUD de partidos sobre Netlify Database (@netlify/database).
 * Variable de entorno: NETLIFY_DB_URL (inyectada automáticamente por Netlify).
 * Autenticación: Firebase ID Token via Authorization: Bearer <token>.
 *
 * Rutas:
 *   GET    /api/partidos        → últimos 50 del usuario autenticado
 *   POST   /api/partidos        → guarda un partido nuevo
 *   GET    /api/partidos/:id    → lee un partido por id
 *   DELETE /api/partidos/:id    → elimina (solo si pertenece al usuario)
 *   PATCH  /api/partidos/:id/tactical-analysis
 *                               → actualiza SOLO data.tacticalAnalysis
 */
import type { Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

// ── helpers ───────────────────────────────────────────────────────────────────

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Verifica el Firebase ID Token contra el endpoint público de Google.
 * No requiere Firebase Admin SDK, solo FIREBASE_WEB_API_KEY.
 */
const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY?.trim() ||
  // Clave publica del mismo cliente Firebase que usa src/firebase.ts.
  // No es un secreto: identifica el proyecto; la autorizacion real la aporta
  // el ID token firmado que se valida en accounts:lookup.
  "AIzaSyD4fMTrQspCboPHyGZC96ORnYqCBa9XSgo";

async function verifyFirebaseToken(
  authHeader: string | null
): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      }
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    return (data.users?.[0]?.localId as string) ?? null;
  } catch {
    return null;
  }
}

// ── ANÁLISIS TÁCTICO · actualización aislada ──────────────────────────────────

/**
 * Subrecurso de la ruta. Que sea un camino PROPIO y no un campo más del POST
 * es deliberado: así la única escritura parcial que existe está acotada a un
 * verbo, un segmento y una clave, y nadie puede colar el resto del partido
 * por aquí.
 */
export const TACTICAL_ANALYSIS_SEGMENT = "tactical-analysis";

/**
 * Tope de tamaño del análisis, en caracteres.
 *
 * TACTICAL PRO se genera con `max_tokens: 8192`, que en español son unos
 * 30.000 caracteres. 200.000 deja margen de sobra para cualquier informe real
 * y a la vez impide que esta ruta se use para guardar un blob arbitrario.
 */
export const MAX_TACTICAL_ANALYSIS_CHARS = 200_000;

export type TacticalAnalysisCheck =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Valida el cuerpo del PATCH. Pura, para poder probarla sin base de datos.
 *
 * Solo una cadena NO vacía. Ni null, ni número, ni objeto, ni espacios en
 * blanco: un análisis vacío no es un análisis, y aceptarlo borraría el bueno
 * sin haber traído nada mejor.
 */
export function checkTacticalAnalysis(body: unknown): TacticalAnalysisCheck {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Cuerpo vacio" };
  }
  const raw = (body as { tacticalAnalysis?: unknown }).tacticalAnalysis;
  if (typeof raw !== "string") {
    return { ok: false, error: "tacticalAnalysis debe ser una cadena" };
  }
  const value = raw.trim();
  if (!value) {
    return { ok: false, error: "tacticalAnalysis no puede estar vacio" };
  }
  if (value.length > MAX_TACTICAL_ANALYSIS_CHARS) {
    return {
      ok: false,
      error: `tacticalAnalysis supera el maximo de ${MAX_TACTICAL_ANALYSIS_CHARS} caracteres`,
    };
  }
  return { ok: true, value };
}

// ── handler ────────────────────────────────────────────────────────────────────

export default async (req: Request, _ctx: Context): Promise<Response> => {
  // Extraer :id del path /api/partidos/:id
  const url = new URL(req.url);
  const segments = url.pathname
    .replace(/^\/api\/partidos\/?/, "")
    .split("/")
    .filter(Boolean);
  const matchId = segments[0] ?? null;
  const subrecurso = segments[1] ?? null;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const uid = await verifyFirebaseToken(req.headers.get("Authorization"));
  if (!uid) return jsonResp(401, { error: "No autenticado" });

  // ── Conexión Netlify Database (NETLIFY_DB_URL auto-inyectada) ──────────────
  const { sql } = getDatabase();

  try {
    // GET /api/partidos
    if (req.method === "GET" && !matchId) {
      const rows = await sql`
        SELECT id, data, created_at
        FROM partidos
        WHERE user_uid = ${uid}
        ORDER BY created_at DESC
        LIMIT 50
      `;
      return jsonResp(200, rows.map((r: any) => ({ id: r.id, ...r.data })));
    }

    // GET /api/partidos/:id
    if (req.method === "GET" && matchId) {
      const rows = await sql`
        SELECT id, data
        FROM partidos
        WHERE id = ${matchId} AND user_uid = ${uid}
      `;
      if (!rows.length) return jsonResp(404, { error: "Partido no encontrado" });
      return jsonResp(200, { id: rows[0].id, ...(rows[0].data as object) });
    }

    // POST /api/partidos
    if (req.method === "POST" && !matchId) {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonResp(400, { error: "JSON invalido" });
      }
      if (!body || typeof body !== "object") {
        return jsonResp(400, { error: "Cuerpo vacio" });
      }
      const rows = await sql`
        INSERT INTO partidos (user_uid, data)
        VALUES (${uid}, ${JSON.stringify(body)}::jsonb)
        RETURNING id, created_at
      `;
      return jsonResp(201, {
        id: rows[0].id,
        created_at: rows[0].created_at,
      });
    }

    // PATCH /api/partidos/:id/tactical-analysis
    //
    // La ÚNICA escritura parcial del recurso. Toca exclusivamente la clave
    // `tacticalAnalysis` del JSON con `jsonb_set`: eventos, jugadores,
    // marcador, tiempos, zonas y metadatos quedan byte a byte como estaban,
    // porque no se reescribe el documento entero.
    if (req.method === "PATCH" && matchId && subrecurso === TACTICAL_ANALYSIS_SEGMENT) {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonResp(400, { error: "JSON invalido" });
      }
      const check = checkTacticalAnalysis(body);
      if (check.ok === false) return jsonResp(400, { error: check.error });

      const rows = await sql`
        UPDATE partidos
        SET data = jsonb_set(data, '{tacticalAnalysis}', to_jsonb(${check.value}::text), true)
        WHERE id = ${matchId} AND user_uid = ${uid}
        RETURNING id
      `;
      // Mismo 404 para «no existe» y «no es tuyo»: distinguirlos le diría a
      // un tercero qué ids existen.
      if (!rows.length) {
        return jsonResp(404, { error: "Partido no encontrado o sin permiso" });
      }
      // Se devuelve la longitud, nunca el texto: este contenido no tiene por
      // qué aparecer en una respuesta ni, más abajo, en los logs.
      return jsonResp(200, { id: rows[0].id, tacticalAnalysisChars: check.value.length });
    }

    // DELETE /api/partidos/:id
    if (req.method === "DELETE" && matchId) {
      const result = await sql`
        DELETE FROM partidos
        WHERE id = ${matchId} AND user_uid = ${uid}
        RETURNING id
      `;
      if (!result.length) {
        return jsonResp(404, { error: "Partido no encontrado o sin permiso" });
      }
      return jsonResp(200, { deleted: matchId });
    }

    return jsonResp(405, { error: "Metodo no permitido" });
  } catch (err: any) {
    // Solo el mensaje, nunca el cuerpo: un PATCH de análisis lleva el informe
    // entero dentro y los logs de Netlify no son el sitio para eso.
    console.error("partidos fn error:", req.method, err?.message ?? "desconocido");
    return jsonResp(500, { error: err?.message ?? "Error interno" });
  }
};
