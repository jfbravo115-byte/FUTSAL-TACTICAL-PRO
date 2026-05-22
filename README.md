# Futsal Commander Pro — App Unificada

Esta es la versión unificada que combina:
- **Futsal Commander Pro** (toma de estadísticas en tiempo real)
- **Tactical Pro** (análisis con IA de Gemini integrado directamente)

## Estructura
```
/
├── src/
│   ├── App.tsx              ← Router principal
│   ├── main.tsx
│   ├── index.css
│   ├── firebase.ts          ← Config Firebase (analisis-futsal)
│   ├── types/futsal.ts      ← Tipos TypeScript
│   ├── lib/
│   │   ├── AuthContext.tsx
│   │   ├── exportUtils.ts
│   │   └── utils.ts
│   ├── services/
│   │   └── tacticalAnalysisService.ts
│   ├── components/
│   │   ├── PlayerActionRadialMenu.tsx
│   │   ├── TacticalAnalyst.tsx
│   │   └── TacticalReportModal.tsx
│   └── pages/
│       ├── MatchTracker.tsx  ← App principal (campo + estadísticas)
│       ├── Dashboard.tsx     ← Historial de partidos
│       └── MatchAnalysis.tsx ← Análisis detallado de cada partido
└── server.ts                ← Servidor Express + endpoint Gemini
```

## Navegación
- `/` → MatchTracker (la app principal durante el partido)
- `/dashboard` → Historial de partidos guardados
- `/analysis/:matchId` → Análisis detallado de un partido

## Cambios respecto a las apps originales

### ✅ Lo que se arregló
1. **TACTICAL PRO ya no redirige** a otra URL — se abre un modal inline
2. **Los datos se guardan en Firestore** (`partidos`) automáticamente al generar el análisis
3. **El historial** lee esos mismos partidos y muestra estadísticas derivadas de los eventos
4. **Una sola app**, una sola Firebase, un solo despliegue

### 🗄️ Base de datos
- Proyecto Firebase: `analisis-futsal`
- Colección: `partidos`
- Estructura: `MatchData` completo (con `events[]`, `players[]`, `tacticalAnalysis`)

---

## Instalación local

```bash
npm install
```

Crea el archivo `.env.local` con tu API key de Gemini:
```
GEMINI_API_KEY=AIza...tu_key
```

```bash
npm run dev
```

Abre http://localhost:3000

---

## Despliegue en Railway (recomendado para móvil)

Esta app necesita un servidor Node.js (no sirve Vercel estático porque tiene backend con Gemini).

### Opción A — Railway (más fácil)
1. Sube el proyecto a GitHub
2. Ve a https://railway.app
3. "New Project" → "Deploy from GitHub Repo"
4. Añade la variable de entorno: `GEMINI_API_KEY = tu_key`
5. El comando de build es: `npm run build`
6. El comando de start es: `npm start`
7. Railway te da una URL pública — esa es tu app en el móvil

### Opción B — Render
1. https://render.com → New Web Service
2. Build Command: `npm install && npm run build`
3. Start Command: `npm start`
4. Environment Variable: `GEMINI_API_KEY`

### Opción C — Fly.io
```bash
npm install -g flyctl
fly launch
fly secrets set GEMINI_API_KEY=tu_key
fly deploy
```

---

## Uso en el móvil
Una vez desplegada, abre la URL en el navegador del móvil y añádela a la pantalla de inicio como acceso directo (funciona como PWA).
