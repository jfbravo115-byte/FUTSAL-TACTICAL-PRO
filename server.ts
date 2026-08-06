import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: "1mb" }));

  // MODAL URL - Análisis YOLO con tracking automático
  const MODAL_URL = "https://jf-bravo115--futsal-commander-yolo-fastapi-app.modal.run";

  // AI endpoint
  app.post("/api/tactical-pro", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "API Key missing" });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const { matchData } = req.body;
      const prompt = `Analiza los datos del partido de futsal y redacta un informe TACTICAL PRO.\n\nDatos: ${JSON.stringify(matchData, null, 2)}`;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "Eres un analista táctico profesional de Futsal de élite.",
        }
      });

      res.json({ analysis: response.text });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== ANÁLISIS CON MODAL LABS (YOLO TRACKING) =====
  
  app.post("/api/check-server", async (req, res) => {
    try {
      const { serverUrl } = req.body;
      const response = await fetch(`${serverUrl}/salud`);
      const data = await response.json();
      res.json({ connected: data.ok, status: data });
    } catch (error: any) {
      res.status(500).json({ error: error.message, connected: false });
    }
  });

  app.post("/api/analyze-video", async (req, res) => {
    try {
      const { serverUrl, videoUrl, calibration, videoType = "fijo" } = req.body;
      const analysisServer = serverUrl || MODAL_URL;

      const downloadRes = await fetch(`${analysisServer}/descargar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoUrl })
      });
      const { video_id } = await downloadRes.json();

      const analyzeRes = await fetch(`${analysisServer}/analizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id,
          params: {
            modo: videoType,
            local_color: calibration?.localColor || "blue",
            rival_color: calibration?.rivalColor || "red"
          }
        })
      });
      
      const { job_id } = await analyzeRes.json();
      res.json({ jobId: job_id, status: "started" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analysis/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const statusRes = await fetch(`${MODAL_URL}/estado/${jobId}`);
      const status = await statusRes.json();
      res.json({ jobId, status: status.estado, progress: status.progreso });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/resultado/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const resultRes = await fetch(`${MODAL_URL}/resultado/${jobId}`);
      const resultado = await resultRes.json();
      res.json(resultado);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Modal YOLO API: ${MODAL_URL}`);
  });
}

startServer();
