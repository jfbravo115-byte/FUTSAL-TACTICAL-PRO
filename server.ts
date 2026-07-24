import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Max payload for JSON can be increased if needed for large match payloads
  app.use(express.json({ limit: "1mb" }));

  // AI endpoint
  app.post("/api/tactical-pro", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "API Key completely missing" });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const { matchData } = req.body;

      const prompt = `Analiza los siguientes datos de un partido de fútbol sala (Futsal) y redacta un informe TACTICAL PRO detallado en formato Markdown.

Los datos incluyen el rendimiento general, estadísticas por parciales de 5 minutos, y rendimiento de jugadores.

Crea un informe que contenga:
1.  **Resumen del Partido**: Breve interpretación del resultado y flujo del juego (basado en g/a, posesión, y tiros).
2.  **Análisis por Intervalos (Momentos Críticos)**: Analiza los intervalos de 5 minutos proporcionados e identifica en qué momento el equipo fue más vulnerable defensivamente y en qué momento fue más eficaz ofensivamente.
3.  **Evaluación de Jugadores**: Basado en las métricas individuales provistas, destaca las fortalezas y puntos de mejora, mencionando a quiénes recomiendas para situaciones específicas (ej. jugador clave para remontar).
4.  **Sugerencias Tácticas (TACTICAL PRO)**: Ofrece recomendaciones y ajustes estratégicos estructurados para el próximo partido a partir de las vulnerabilidades y fortalezas observadas. Sé analítico y constructivo. Sé específico sobre tácticas de futsal (rotaciones, defensa en zona, presión alta, etc.).

Datos del partido:
${JSON.stringify(matchData, null, 2)}
`;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "Eres un analista táctico profesional especializado en Fútbol Sala de alto rendimiento. Tu comunicación es formal, precisa y rigurosa, propia de un informe técnico deportivo de élite. Utilizas terminología táctica avanzada de Futsal. No uses introducciones entusiastas ni frases coloquiales. Ve directo al análisis técnico.",
        }
      });

      res.json({ analysis: response.text });

    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Unknown error occurred" });
    }
  });

  // ===== ANÁLISIS CON VAST.AI =====
  const analysisJobs: Record<string, any> = {};

  // Verificar conexión con servidor Vast.ai
  app.post("/api/check-server", async (req, res) => {
    try {
      const { serverUrl } = req.body;
      if (!serverUrl) return res.status(400).json({ error: "serverUrl requerida" });
      
      const response = await fetch(`${serverUrl}/salud`);
      const data = await response.json();
      res.json({ connected: data.ok, status: data });
    } catch (error: any) {
      res.status(500).json({ error: error.message, connected: false });
    }
  });

  // Lanzar análisis de vídeo
  app.post("/api/analyze-video", async (req, res) => {
    try {
      const { serverUrl, videoUrl, calibration, videoType = "fijo" } = req.body;
      
      if (!serverUrl || !videoUrl) {
        return res.status(400).json({ error: "serverUrl y videoUrl requeridas" });
      }

      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      (async () => {
        try {
          analysisJobs[jobId] = { status: "downloading", progress: 0, serverUrl };
          
          const downloadRes = await fetch(`${serverUrl}/descargar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: videoUrl })
          });
          const { video_id } = await downloadRes.json();
          analysisJobs[jobId].video_id = video_id;
          analysisJobs[jobId].status = "analyzing";

          const analyzeRes = await fetch(`${serverUrl}/analizar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              video_id,
              params: {
                modo: videoType === "clips" ? "clips" : "default",
                local_color: calibration?.localColor || "blue",
                rival_color: calibration?.rivalColor || "red",
                calibration_points: calibration?.points || []
              }
            })
          });
          
          const { job_id } = await analyzeRes.json();
          analysisJobs[jobId].server_job_id = job_id;
          analysisJobs[jobId].status = "processing";
          analysisJobs[jobId].createdAt = new Date();
          
        } catch (err: any) {
          analysisJobs[jobId].status = "error";
          analysisJobs[jobId].error = err.message;
        }
      })();

      res.json({ jobId, status: "started" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Obtener estado y resultado
  app.get("/api/analysis/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = analysisJobs[jobId];
      
      if (!job) return res.status(404).json({ error: "Job no encontrado" });
      
      if (job.status === "completed") {
        return res.json(job);
      }
      
      if (job.server_job_id && job.serverUrl) {
        try {
          const statusRes = await fetch(`${job.serverUrl}/estado/${job.server_job_id}`);
          const status = await statusRes.json();
          
          if (status.estado === "completado") {
            const resultRes = await fetch(`${job.serverUrl}/resultado/${job.server_job_id}`);
            const result = await resultRes.json();
            
            job.status = "completed";
            job.result = result;
            return res.json(job);
          } else {
            job.progress = status.progreso || 0;
            job.currentStep = status.paso;
          }
        } catch (err) {
          console.error("Error checking status:", err);
        }
      }
      
      res.json({ jobId, status: job.status, progress: job.progress, error: job.error });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Obtener frame para calibración
  app.post("/api/get-frame", async (req, res) => {
    try {
      const { serverUrl, videoId, timestamp = 30 } = req.body;
      
      if (!serverUrl || !videoId) {
        return res.status(400).json({ error: "serverUrl y videoId requeridas" });
      }

      const response = await fetch(`${serverUrl}/frame/${videoId}?t=${timestamp}`);
      
      if (!response.ok) {
        return res.status(response.status).json({ error: "No se pudo obtener frame" });
      }

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      
      res.json({ frame: `data:image/jpeg;base64,${base64}`, timestamp });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  // ===== FIN ANÁLISIS =====

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
