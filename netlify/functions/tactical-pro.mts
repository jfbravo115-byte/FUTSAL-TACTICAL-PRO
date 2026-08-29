import type { Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

import {
  TACTICAL_MODEL,
  TACTICAL_MAX_TOKENS,
  SYSTEM_INSTRUCTION,
  buildTacticalPrompt,
} from "../../src/shared/tacticalPrompt";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  // ── 1. API key ────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: "API Key missing: configura ANTHROPIC_API_KEY en Netlify",
    });
  }

  // ── 2. Parseo defensivo del cuerpo de la petición ──────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, {
      error: "Cuerpo de la petición inválido: se esperaba JSON",
    });
  }

  const { matchData } = body || {};
  if (matchData === undefined || matchData === null) {
    return jsonResponse(400, { error: "Falta matchData en el cuerpo de la petición" });
  }

  // ── 3. Serialización defensiva (nunca dejar que un dato raro tumbe la función) ──
  let matchDataStr: string;
  try {
    matchDataStr = JSON.stringify(matchData, null, 2);
    if (!matchDataStr) throw new Error("matchData se serializó como vacío");
  } catch (e: any) {
    return jsonResponse(400, {
      error: "matchData no se pudo serializar: " + (e?.message || String(e)),
    });
  }

  // ── 4. Llamada a Claude ─────────────────────────────────────────
  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: TACTICAL_MODEL,
      max_tokens: TACTICAL_MAX_TOKENS,
      system: SYSTEM_INSTRUCTION,
      messages: [{ role: "user", content: buildTacticalPrompt(matchDataStr) }],
    });

    // Une todos los bloques de texto de la respuesta (normalmente hay uno solo,
    // pero esto es robusto ante respuestas multi-bloque).
    const analysis = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!analysis) {
      return jsonResponse(502, {
        error: "El modelo devolvió una respuesta vacía. Inténtalo de nuevo.",
      });
    }

    return jsonResponse(200, { analysis });
  } catch (error: any) {
    console.error("tactical-pro error:", error);

    // Errores conocidos del SDK de Anthropic traen status/mensaje utilizables.
    const status = typeof error?.status === "number" ? error.status : 500;
    const message =
      error?.error?.error?.message || // forma anidada de la API de Anthropic
      error?.message ||
      "Unknown error occurred";

    return jsonResponse(status >= 400 && status < 600 ? status : 500, { error: message });
  }
};
