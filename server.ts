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
