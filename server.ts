import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Anthropic from "@anthropic-ai/sdk";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Max payload for JSON can be increased if needed for large match payloads
  app.use(express.json({ limit: "1mb" }));

  // AI endpoint
  app.post("/api/tactical-pro", async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
    const { matchData } = req.body || {};
    if (!matchData) return res.status(400).json({ error: "matchData required" });
    try {
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: "claude-sonnet-5", max_tokens: 8192,
        system: "Eres un analista tactico profesional de Futsal.",
        messages: [{ role: "user", content: `Analiza: ${JSON.stringify(matchData)}` }],
      });
      const analysis = response.content
        .filter((b: any): b is any => b.type === "text")
        .map((b: any) => b.text).join("\n").trim();
      return res.json({ analysis });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
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
