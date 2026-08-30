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
async function verifyFirebaseToken(
  authHeader: string | null
): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`,
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

// ── handler ────────────────────────────────────────────────────────────────────

export default async (req: Request, _ctx: Context): Promise<Response> => {
  // Extraer :id del path /api/partidos/:id
  const url = new URL(req.url);
  const segments = url.pathname
    .replace(/^\/api\/partidos\/?/, "")
    .split("/")
    .filter(Boolean);
  const matchId = segments[0] ?? null;

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
    console.error("partidos fn error:", err);
    return jsonResp(500, { error: err?.message ?? "Error interno" });
  }
};
