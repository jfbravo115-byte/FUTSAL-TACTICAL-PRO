/**
 * src/services/pdfExportService.tsx
 *
 * Arquitectura (consolida el patrón YA existente en el repo — StatsExportTemplate
 * + html-to-image + jsPDF — en vez de crear un cuarto sistema de exportación):
 *
 *   datos del partido (generateMatchReport / buildZoneDashboard / buildGoalkeeperReports)
 *        ↓
 *   plantilla de informe (componentes React de este archivo)
 *        ↓
 *   captura a imagen (html-to-image, sin popup)
 *        ↓
 *   PDF (jsPDF)
 *        ↓
 *   descarga directa (pdf.save())
 *
 * NO usa window.open ni document.write en ningún punto. NO reemplaza el
 * DOM de la aplicación. Las páginas se renderizan en un contenedor
 * desmontado del árbol visible (fuera de la ventana), se capturan, y se
 * desmontan inmediatamente después — el usuario nunca ve el proceso ni
 * necesita permitir ninguna ventana emergente.
 *
 * PROHIBIDO explícitamente en este archivo: cualquier llamada a IA
 * (generateTacticalReport, tacticalAnalysisService, fetch a
 * /api/tactical-pro). Tactical Pro se muestra ÚNICAMENTE si
 * matchData.tacticalAnalysis ya existe — nunca se solicita aquí.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import { toJpeg } from "html-to-image";
import { jsPDF } from "jspdf";
import { MatchData, Role } from "../types/futsal";
import { generateMatchReport, MatchReport } from "./matchReportService";
import { buildZoneDashboard, ZoneDashboard, GOAL_ZONE_IDS, QUICK_ZONE_IDS } from "./matchZonesService";
import { buildGoalkeeperReports, GoalkeeperReportEntry } from "./goalkeeperReportService";
import { GoalkeeperOriginMap, GoalkeeperImpactMap } from "../components/export/GoalkeeperMaps";
import { safeImageSrc } from "../utils/safeImageSrc";

// ── Estilos de página (impresión/PDF: fondo claro, coherente con el
// informe HTML existente en matchExportService.ts) ─────────────────────
const PAGE_WIDTH = 794; // ~ A4 a 96dpi
const pageStyle: React.CSSProperties = {
  width: PAGE_WIDTH,
  minHeight: 1123,
  background: "#ffffff",
  color: "#111827",
  fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  padding: 32,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};
const cardStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: 10,
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  margin: "8px 0 4px",
  color: "#111827",
};

function safeName(value: string): string {
  return value.replace(/[^a-z0-9áéíóúüñ_-]+/gi, "_").replace(/^_+|_+$/g, "") || "partido";
}

// ── CABECERA (equipo, rival, logos si existen, fecha, resultado) ───────
function ReportHeader({ matchData, report }: { matchData: MatchData; report: MatchReport }) {
  const teamLogoSrc = safeImageSrc(matchData.teamLogo);
  const opponentLogoSrc = safeImageSrc(matchData.opponentLogo);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #111827", paddingBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {teamLogoSrc && (
          <img src={teamLogoSrc} alt="" style={{ width: 48, height: 48, objectFit: "contain" }} />
        )}
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{matchData.teamName}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{matchData.timestamp ? new Date(matchData.timestamp).toLocaleDateString("es-ES") : ""}</div>
        </div>
      </div>
      <div style={{ fontSize: 30, fontWeight: 900 }}>{report.score.team} - {report.score.opponent}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexDirection: "row-reverse" }}>
        {opponentLogoSrc && (
          <img src={opponentLogoSrc} alt="" style={{ width: 48, height: 48, objectFit: "contain" }} />
        )}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{matchData.opponentName}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{report.periodLabel} · {report.matchClockLabel}</div>
        </div>
      </div>
    </div>
  );
}

function SummaryKpis({ report }: { report: MatchReport }) {
  const cell = (label: string, value: React.ReactNode) => (
    <div style={cardStyle}>
      <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900 }}>{value}</div>
    </div>
  );
  return (
    <div>
      <div style={sectionTitleStyle}>Resumen</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {cell("Tiros", report.teamTotals.shots)}
        {cell("A portería", report.teamTotals.shotsOnTarget)}
        {cell("Precisión", report.teamTotals.shotAccuracyPct === null ? "—" : `${report.teamTotals.shotAccuracyPct}%`)}
        {cell("Conversión", report.teamTotals.goalConversionPct === null ? "—" : `${report.teamTotals.goalConversionPct}%`)}
        {cell("Recuperaciones", report.teamTotals.recoveries)}
        {cell("Pérdidas + errores", report.teamTotals.lossesAndErrors)}
        {cell("Balance Rec-(P+E)", `${report.teamTotals.recoveryLossBalance >= 0 ? "+" : ""}${report.teamTotals.recoveryLossBalance}`)}
        {cell("Faltas", `${report.teamTotals.fouls} propias / ${report.fouls.opponent} rival`)}
        {cell("Tarjetas", `🟨 ${report.teamTotals.yellowCards} · 🟥 ${report.teamTotals.redCards}`)}
      </div>
    </div>
  );
}

function ZonesSection({ zones }: { zones: ZoneDashboard }) {
  const hasOrigin = zones.totals.zonedActions > 0;
  const hasGoal = zones.goal.some((z) => z.attempts > 0) || zones.out > 0;
  return (
    <div>
      <div style={sectionTitleStyle}>Mapas / Zonas</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Origen en pista</div>
          {hasOrigin ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, maxWidth: 180 }}>
              {QUICK_ZONE_IDS.map((zid) => {
                const z = zones.origin.find((o) => o.zone === zid)!;
                return (
                  <div key={zid} style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: 6, textAlign: "center", background: z.total > 0 ? "#eff6ff" : "#f9fafb" }}>
                    <div style={{ fontSize: 9, color: "#6b7280" }}>{zid}</div>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>{z.total}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Sin datos registrados.</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Destino de tiro (portería)</div>
          {hasGoal ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, maxWidth: 180 }}>
              {GOAL_ZONE_IDS.map((zid) => {
                const z = zones.goal.find((g) => g.zone === zid)!;
                return (
                  <div key={zid} style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: 6, textAlign: "center", background: z.attempts > 0 ? "#fef2f2" : "#f9fafb" }}>
                    <div style={{ fontSize: 9, color: "#6b7280" }}>{zid}</div>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>{z.attempts}{z.goals > 0 ? ` (${z.goals}G)` : ""}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Sin datos registrados.</div>
          )}
        </div>
      </div>
      {zones.mostActiveZone && (
        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>
          Zona más activa: {zones.mostActiveZone.zone} ({zones.mostActiveZone.total}) · fuera de zona: {zones.out}
        </div>
      )}
    </div>
  );
}

function PlayersTable({ report }: { report: MatchReport }) {
  return (
    <div>
      <div style={sectionTitleStyle}>Jugadores</div>
      {report.playersUsed.length === 0 ? (
        <div style={{ fontSize: 11, color: "#9ca3af" }}>Sin datos registrados.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              {["#", "Jugador", "Rol", "TOT", "ROT", "Rot.", "G", "Tiros", "Rec.", "Pér+Err", "F", "🟨", "🟥"].map((h) => (
                <th key={h} style={{ borderBottom: "1px solid #e5e7eb", padding: 5, textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.playersUsed.map((p) => (
              <tr key={p.id}>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.number}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.name}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.role}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.totLabel}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.rotLabel ?? "—"}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.rotationsCount}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.goals}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.attempts}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.steals + p.interceptions}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.losses + p.errors}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.fouls}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.yellowCards}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.redCards}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GoalkeeperCard({ gk }: { gk: GoalkeeperReportEntry }) {
  return (
    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>#{gk.number} {gk.name}</div>
          <div style={{ fontSize: 10, color: "#6b7280" }}>
            {gk.totLabel} en pista{!gk.isOnPitch ? " · sustituido" : ""}{gk.isOpponent ? " · rival" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
          <span>Blocajes <b>{gk.saveCatch}</b></span>
          <span>Despejes <b>{gk.saveParry}</b></span>
          <span>Encajados <b>{gk.conceded}</b></span>
          <span>Efectividad <b>{gk.effectivenessPct === null ? "—" : `${gk.effectivenessPct}%`}</b></span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>Origen (pista)</div>
          <GoalkeeperOriginMap goalie={{ id: gk.id, number: gk.number, name: gk.name, role: Role.GOALKEEPER, isOnPitch: gk.isOnPitch, plusMinus: 0, individualTimeSeconds: gk.totSeconds, isOpponent: gk.isOpponent, stats: { goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0, fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: gk.totalSaves, conceded: gk.conceded } }} isOpponent={gk.isOpponent} events={gk.events} compact />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>Impacto (portería)</div>
          <GoalkeeperImpactMap events={gk.events} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>Últimas intervenciones</div>
          {gk.timeline.length === 0 ? (
            <div style={{ fontSize: 10, color: "#9ca3af" }}>Sin datos registrados.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {gk.timeline.slice(-6).reverse().map((t, i) => (
                <div key={i} style={{ fontSize: 10, display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", paddingBottom: 2 }}>
                  <span style={{ color: "#6b7280" }}>{t.timeLabel}</span>
                  <span style={{ fontWeight: 700 }}>{t.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EventsSection({ report }: { report: MatchReport }) {
  if (report.relevantEvents.length === 0) return null;
  return (
    <div>
      <div style={sectionTitleStyle}>Eventos relevantes</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {report.relevantEvents.map((e, i) => (
          <div key={i} style={{ fontSize: 11, display: "flex", gap: 8 }}>
            <span style={{ color: "#6b7280", minWidth: 40 }}>{e.timeLabel}</span>
            <span>{e.isOpponent ? report.opponentName : report.teamName} — {e.type}{e.playerName ? ` · ${e.playerName}` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PLANTILLA: INFORME COMPLETO (3 páginas) ─────────────────────────────
// ── Tactical Pro: divide en bloques/páginas en vez de escalar o truncar ──
// Reparte por PÁRRAFOS (nunca corta uno a mitad) hasta un presupuesto de
// caracteres razonable por página A4 a este tamaño de fuente. Si un solo
// párrafo ya supera el presupuesto, se deja íntegro en su propia página
// (la página crece, pero el texto NUNCA se trunca ni se escala a un
// tamaño ilegible).
const TACTICAL_PRO_CHARS_PER_PAGE = 3200;

export function splitTacticalProIntoPages(markdown: string, maxCharsPerPage = TACTICAL_PRO_CHARS_PER_PAGE): string[] {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];

  const pages: string[] = [];
  let current: string[] = [];
  let currentLen = 0;
  for (const para of paragraphs) {
    if (currentLen > 0 && currentLen + para.length + 2 > maxCharsPerPage) {
      pages.push(current.join("\n\n"));
      current = [];
      currentLen = 0;
    }
    current.push(para);
    currentLen += para.length + 2;
  }
  if (current.length) pages.push(current.join("\n\n"));
  return pages;
}

function TacticalProChunk({ chunk, index, total }: { chunk: string; index: number; total: number }) {
  return (
    <div>
      <div style={sectionTitleStyle}>Tactical Pro{total > 1 ? ` (${index + 1}/${total})` : ""}</div>
      <div style={{ fontSize: 11, lineHeight: 1.5 }}>
        <Markdown>{chunk}</Markdown>
      </div>
    </div>
  );
}

// ── Páginas del INFORME COMPLETO: número de páginas DINÁMICO ────────────
// 1 resumen/zonas + 1 jugadores (fijas) + 1 por portero + N por Tactical
// Pro (dividido en bloques, nunca amontonado) + 1 de eventos si existen.
// Nunca se agrupan varios porteros ni Tactical Pro largo en una sola
// página — evita que capturePagesToPdf tenga que escalar contenido
// desbordado a un tamaño ilegible.
function buildMatchReportPages(
  matchData: MatchData,
  report: MatchReport,
  zones: ZoneDashboard,
  goalkeepers: GoalkeeperReportEntry[],
): { key: string; content: React.ReactNode }[] {
  const pages: { key: string; content: React.ReactNode }[] = [];

  pages.push({
    key: "summary",
    content: (
      <>
        <ReportHeader matchData={matchData} report={report} />
        <SummaryKpis report={report} />
        <ZonesSection zones={zones} />
      </>
    ),
  });

  pages.push({
    key: "players",
    content: (
      <>
        <ReportHeader matchData={matchData} report={report} />
        <PlayersTable report={report} />
      </>
    ),
  });

  goalkeepers.forEach((gk) => {
    pages.push({
      key: `gk-${gk.id}`,
      content: (
        <>
          <ReportHeader matchData={matchData} report={report} />
          <div style={sectionTitleStyle}>Portero</div>
          <GoalkeeperCard gk={gk} />
        </>
      ),
    });
  });

  if (matchData.tacticalAnalysis && matchData.tacticalAnalysis.trim()) {
    const chunks = splitTacticalProIntoPages(matchData.tacticalAnalysis);
    chunks.forEach((chunk, i) => {
      pages.push({
        key: `tactical-${i}`,
        content: (
          <>
            <ReportHeader matchData={matchData} report={report} />
            <TacticalProChunk chunk={chunk} index={i} total={chunks.length} />
          </>
        ),
      });
    });
  }

  if (report.relevantEvents.length > 0) {
    pages.push({
      key: "events",
      content: (
        <>
          <ReportHeader matchData={matchData} report={report} />
          <EventsSection report={report} />
        </>
      ),
    });
  }

  return pages;
}

// ── Páginas del INFORME DE PORTEROS: una por portero + N de Tactical Pro
// (mismo criterio de división que el informe completo — nunca amontonado
// junto al último portero) ───────────────────────────────────────────
function buildGoalkeeperReportPages(
  matchData: MatchData,
  report: MatchReport,
  goalkeepers: GoalkeeperReportEntry[],
): { key: string; content: React.ReactNode }[] {
  const pages: { key: string; content: React.ReactNode }[] = [];

  goalkeepers.forEach((gk) => {
    pages.push({
      key: `gk-${gk.id}`,
      content: (
        <>
          <ReportHeader matchData={matchData} report={report} />
          <div style={sectionTitleStyle}>Informe de porteros</div>
          <GoalkeeperCard gk={gk} />
        </>
      ),
    });
  });

  if (matchData.tacticalAnalysis && matchData.tacticalAnalysis.trim()) {
    const chunks = splitTacticalProIntoPages(matchData.tacticalAnalysis);
    chunks.forEach((chunk, i) => {
      pages.push({
        key: `tactical-${i}`,
        content: (
          <>
            <ReportHeader matchData={matchData} report={report} />
            <TacticalProChunk chunk={chunk} index={i} total={chunks.length} />
          </>
        ),
      });
    });
  }

  return pages;
}

function PdfPagesRenderer({
  pages,
  refs,
}: {
  pages: { key: string; content: React.ReactNode }[];
  refs: React.RefObject<HTMLDivElement>[];
}) {
  return (
    <>
      {pages.map((p, i) => (
        <div key={p.key} ref={refs[i]} style={pageStyle}>
          {p.content}
        </div>
      ))}
    </>
  );
}

// ── CAPTURA + ENSAMBLADO + DESCARGA (mismo patrón que ya usaba MatchTracker) ──
const captureOpts = {
  cacheBust: true,
  pixelRatio: 1.5,
  quality: 0.82,
  backgroundColor: "#ffffff",
  style: { opacity: "1", visibility: "visible" as const },
};

async function capturePagesToPdf(nodes: HTMLDivElement[]): Promise<jsPDF> {
  const images: string[] = [];
  for (const node of nodes) {
    const url = await toJpeg(node, { ...captureOpts, width: node.offsetWidth });
    if (url && url.length > 1000) images.push(url);
  }
  if (images.length === 0) throw new Error("No se pudo generar ninguna página del PDF.");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  for (let i = 0; i < images.length; i++) {
    if (i > 0) pdf.addPage();
    const img = new Image();
    img.src = images[i];
    await new Promise((resolve) => { img.onload = resolve; });
    const imgH = Math.min(pdfH, pdfW * (img.height / img.width));
    pdf.addImage(images[i], "JPEG", 0, 0, pdfW, imgH);
  }
  return pdf;
}

/**
 * Monta `element` en un contenedor fuera de la pantalla (nunca visible,
 * nunca requiere gesto de ventana emergente), espera a que se aplique el
 * layout, ejecuta `onReady` con los nodos ya renderizados, y desmonta +
 * limpia el contenedor SIEMPRE al terminar — éxito, error en toJpeg,
 * error en pdf.save, o cualquier otro fallo dentro de onReady. El
 * `finally` garantiza que nunca queda un contenedor huérfano en el DOM
 * aunque la captura o el guardado del PDF lancen.
 */
async function renderOffscreen(
  element: React.ReactElement,
  refs: React.RefObject<HTMLDivElement>[],
  onReady: () => Promise<void>,
): Promise<void> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "-10000px";
  container.style.zIndex = "-1";
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    root.render(element);
    // Da tiempo al layout/estilos a aplicarse antes de capturar (mismo
    // margen que ya usaba MatchTracker antes de exportar).
    await new Promise((r) => setTimeout(r, 300));
    await onReady();
  } finally {
    root.unmount();
    container.remove();
  }
}

function makeRefs(count: number): React.RefObject<HTMLDivElement>[] {
  return Array.from({ length: count }, () => React.createRef<HTMLDivElement>());
}

/**
 * Exporta el INFORME COMPLETO como PDF. Número de páginas DINÁMICO (ver
 * buildMatchReportPages): 2 páginas fijas (resumen/zonas + jugadores) +
 * 1 por portero + N por Tactical Pro (si existe, dividido en bloques) +
 * 1 de eventos (si hay eventos relevantes). Sin popup, sin llamada a IA
 * (usa exclusivamente matchData.tacticalAnalysis si ya existe). Descarga
 * directa vía pdf.save().
 */
export async function exportMatchReportPdf(matchData: MatchData): Promise<void> {
  const report = generateMatchReport(matchData);
  const zones = buildZoneDashboard(matchData, false);
  const goalkeepers = buildGoalkeeperReports(matchData);
  const pages = buildMatchReportPages(matchData, report, zones, goalkeepers);
  const refs = makeRefs(pages.length);

  await renderOffscreen(
    <PdfPagesRenderer pages={pages} refs={refs} />,
    refs,
    async () => {
      const nodes = refs.map((r) => r.current).filter((n): n is HTMLDivElement => !!n);
      const pdf = await capturePagesToPdf(nodes);
      pdf.save(`informe_${safeName(matchData.teamName)}_${Date.now()}.pdf`);
    },
  );
}

/**
 * Exporta el INFORME DE PORTEROS como PDF independiente. Número de
 * páginas DINÁMICO: una por portero relevante + N por Tactical Pro (si
 * existe, dividido en bloques, NUNCA amontonado junto al último
 * portero). Soporta 0 (lanza un error claro, ver más abajo), 1, 2 o más
 * porteros, incluyendo porteros sustituidos. Tactical Pro se incluye
 * COMPLETO (no se intenta extraer una sección "solo porteros" del texto
 * de IA) — ver documentación de la decisión en buildGoalkeeperReportPages.
 */
export async function exportGoalkeeperReportPdf(matchData: MatchData): Promise<void> {
  const report = generateMatchReport(matchData);
  const goalkeepers = buildGoalkeeperReports(matchData);
  if (goalkeepers.length === 0) {
    throw new Error("No hay porteros con datos registrados en este partido.");
  }
  const pages = buildGoalkeeperReportPages(matchData, report, goalkeepers);
  const refs = makeRefs(pages.length);

  await renderOffscreen(
    <PdfPagesRenderer pages={pages} refs={refs} />,
    refs,
    async () => {
      const nodes = refs.map((r) => r.current).filter((n): n is HTMLDivElement => !!n);
      const pdf = await capturePagesToPdf(nodes);
      pdf.save(`porteros_${safeName(matchData.teamName)}_${Date.now()}.pdf`);
    },
  );
}
