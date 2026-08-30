import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Anthropic from "@anthropic-ai/sdk";
import {
  TACTICAL_MODEL,
  TACTICAL_MAX_TOKENS,
  SYSTEM_INSTRUCTION,
  buildTacticalPrompt,
} from "./src/shared/tacticalPrompt";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Max payload for JSON can be increased if needed for large match payloads
  app.use(express.json({ limit: "1mb" }));

  // AI endpoint — Claude/Anthropic (misma logica que netlify/functions/tactical-pro.mts)
  app.post("/api/tactical-pro", async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "API Key missing: define ANTHROPIC_API_KEY en el entorno" });
    }

    const { matchData } = req.body || {};
    if (matchData === undefined || matchData === null) {
      return res.status(400).json({ error: "Falta matchData en el cuerpo de la peticion" });
    }

    let matchDataStr: string;
    try {
      matchDataStr = JSON.stringify(matchData, null, 2);
      if (!matchDataStr) throw new Error("matchData se serializo como vacio");
    } catch (e: any) {
      return res
        .status(400)
        .json({ error: "matchData no se pudo serializar: " + (e?.message || String(e)) });
    }

    try {
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: TACTICAL_MODEL,
        max_tokens: TACTICAL_MAX_TOKENS,
        system: SYSTEM_INSTRUCTION,
        messages: [{ role: "user", content: buildTacticalPrompt(matchDataStr) }],
      });

      const analysis = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      if (!analysis) {
        return res.status(502).json({ error: "El modelo devolvio una respuesta vacia." });
      }
      return res.status(200).json({ analysis });
    } catch (error: any) {
      console.error("tactical-pro error:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      const message =
        error?.error?.error?.message || error?.message || "Unknown error occurred";
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
