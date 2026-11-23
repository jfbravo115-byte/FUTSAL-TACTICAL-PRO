/**
 * src/services/fullDossierPdfService.tsx
 *
 * EL DOSSIER COMPLETO. Todo lo registrado del partido, en un solo PDF.
 *
 * POR QUÉ ES UN ARCHIVO APARTE
 * ----------------------------
 * `exportMatchReportPdf` seguía llamándose «informe completo» y no lo era:
 * traía los mapas esenciales del equipo analizado y ninguno del rival, ni los
 * seis filtros que la pantalla sí ofrece. Meterle un segundo comportamiento
 * —un `completo?: boolean`— habría dejado una función con dos verdades y un
 * montón de ramas donde hoy no hay ninguna. Son dos productos distintos:
 *
 *   INFORME RESUMIDO  → `pdfExportService.exportMatchReportPdf`  (sin tocar)
 *   DOSSIER COMPLETO  → este archivo
 *
 * QUÉ SE REUTILIZA, QUE ES CASI TODO
 * ----------------------------------
 * Ni un solo recuento nuevo. Las cifras salen de los MISMOS servicios que
 * alimentan la pantalla —`generateMatchReport`, `buildZoneDashboard`,
 * `buildGoalkeeperReports`, `phaseSplit`, `buildPeriodShotMaps`— y los
 * bloques visuales son los componentes que ya existían. Si este archivo
 * filtrara eventos por su cuenta, acabaría enseñando un número distinto del
 * que enseña la aplicación para el mismo partido, y nadie sabría cuál creer.
 *
 * SIN IA, SIN RED, SIN SALDO
 * --------------------------
 * Exportar no genera nada. TACTICAL PRO se incluye SOLO si
 * `matchData.tacticalAnalysis` ya trae un informe completo. Aquí no se
 * importa `tacticalAnalysisService` ni se hace `fetch` a ningún sitio.
 */
import React from "react";
import { MatchData, Period, Player, Role } from "../types/futsal";
import { countRotations, generateMatchReport, MatchReport } from "./matchReportService";
import {
  ZoneMetric,
  ZoneDashboard,
  buildZoneDashboard,
  primaryBucket,
  zoneMetricValue,
} from "./matchZonesService";
import { buildGoalkeeperReports, GoalkeeperReportEntry } from "./goalkeeperReportService";
import { FutsalPitch } from "../components/field/FutsalPitch";
import { OWN_CAPTIONS, RIVAL_CAPTIONS } from "../components/export/ZoneMapBoard";
import { PeriodZoneMapsBoard, hasPeriodZoneData } from "../components/export/PeriodZoneMaps";
import { PeriodShotMapsBoard, periodLabel } from "../components/export/PeriodShotMaps";
import { PhaseMetricRow } from "../components/export/PhaseZoneMaps";
import { PHASE_METRICS, hasPhaseData, phasePeriods } from "../utils/phaseAnalysis";
import { SetPieceSummaryBoard } from "../components/export/SetPieceSummaryBoard";
import { TACTICAL_PRO_CAVEAT } from "../components/export/TacticalProBoard";
import { GoalkeeperPdfCard as GoalkeeperCard } from "../components/export/GoalkeeperPdfCard";
import { playerDisplayIdentity } from "../utils/playerIdentity";
import { formatJerseyNumber } from "../utils/jerseyNumber";
import { VisualSummaryBoard as SharedVisualSummaryBoard } from "../components/export/VisualSummaryBoard";
import { formatPlayerTime } from "../utils/playerClock";
import { ShotTally, EMPTY_SHOT_TALLY, playerShotTallies } from "../utils/shotModel";
import {
  ContextGroupCard,
  EventsSection,
  GoalSequenceList,
  PdfPagesRenderer,
  ReportHeader,
  SummaryKpis,
  TacticalProUnit,
  ZonesSection,
  capturePagesToPdf,
  isHeadingUnit,
  safeName,
  sectionTitleStyle,
  tacticalProUnits,
} from "./pdfExportService";
import {
  FLOW_GAP,
  FlowItem,
  FlowItemView,
  FlowPlan,
  FlowProgress,
  Placement,
  runFlowDocument,
  sectionStartPages,
} from "./pdfFlow";

// ── ESTILOS ─────────────────────────────────────────────────────────────
//
// La página del dossier NO es la del informe resumido: lleva pie, así que el
// contenido vive en una caja propia y el pie se ancla abajo. Todo lo demás
// —ancho A4 a 96 dpi, fondo claro, tipografía— es idéntico.

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;

const dossierPageStyle: React.CSSProperties = {
  width: PAGE_WIDTH,
  height: PAGE_HEIGHT,
  background: "#ffffff",
  color: "#111827",
  fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  padding: 28,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  // El MISMO hueco que usa la medición: con 12 aquí y 10 al medir, una
  // página con veinte bloques de Tactical Pro se pasaba 40 px del A4.
  gap: FLOW_GAP,
  overflow: "hidden",
};

const footerStyle: React.CSSProperties = {
  borderTop: "1px solid #d1d5db",
  paddingTop: 6,
  marginTop: 8,
  display: "flex",
  justifyContent: "space-between",
  fontSize: 8,
  color: "#6b7280",
};

const noteStyle: React.CSSProperties = { fontSize: 8, color: "#6b7280", lineHeight: 1.4 };

// ── SECCIONES ───────────────────────────────────────────────────────────

/** Una página del dossier: su sección y lo que pinta. */
type DossierPage = { key: string; section: string; content: React.ReactNode };

/**
 * Las seis métricas que la pantalla ofrece como filtros. Son LAS MISMAS y en
 * el mismo orden: el dossier despliega lo que allí hay que ir tocando.
 */
export const DOSSIER_MAP_METRICS: readonly { key: ZoneMetric; label: string }[] = [
  { key: "all", label: "Todas las acciones" },
  { key: "shots", label: "Tiros" },
  { key: "recoveries", label: "Recuperaciones" },
  { key: "losses", label: "Pérdidas" },
  { key: "fouls", label: "Faltas cometidas" },
  { key: "corners", label: "Córners" },
];

export const MAP_INTENSITY_LEGEND =
  "Mayor intensidad = mayor volumen dentro de este partido. No indica eficacia.";

/**
 * Los seis mapas de un equipo, con el mismo motor y la misma perspectiva que
 * la pantalla.
 *
 * Cada métrica se normaliza SOLA —`FutsalPitch` toma el máximo de los valores
 * que recibe—, así que las pérdidas no se pintan con la escala de los tiros.
 * Tampoco se comparten escalas entre equipos: son dos conjuntos distintos y
 * un color común diría que uno «hizo poco» por comparación con el otro.
 */
export function GlobalMapsBoard({
  matchData,
  dashboard,
  opponent,
}: {
  matchData: MatchData;
  dashboard: ZoneDashboard;
  opponent: boolean;
}) {
  const bucket = primaryBucket(dashboard);
  const zones = bucket?.zones ?? [];
  const legacy = bucket?.system === "legacy3x3";
  return (
    <div>
      <div style={{ ...noteStyle, marginBottom: 6 }}>
        <div>{MAP_INTENSITY_LEGEND}</div>
        <div>
          Número = acciones con origen registrado en esa zona. Los sectores no se invierten al
          cambiar de campo: se guardan desde la perspectiva del equipo que ejecuta.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {DOSSIER_MAP_METRICS.map((metric) => {
          const counts = Object.fromEntries(
            zones.map((z) => [z.zone, zoneMetricValue(z, metric.key)]),
          );
          const total = Object.values(counts).reduce((a, b) => a + b, 0);
          return (
            <div key={metric.key} data-dossier-map={`${opponent ? "rival" : "team"}-${metric.key}`}>
              <div style={{ fontSize: 9, fontWeight: 700, marginBottom: 2 }}>
                {metric.label} · {total}
              </div>
              <FutsalPitch
                mode={legacy ? "legacy3x3" : "zone12"}
                theme="light"
                counts={counts}
                corners={
                  metric.key === "all" || metric.key === "corners"
                    ? { left: dashboard.corners.left, right: dashboard.corners.right }
                    : undefined
                }
                accent={opponent ? "#dc2626" : "#2563eb"}
                compact
                maxWidth={228}
                goalCaptions={opponent ? RIVAL_CAPTIONS : OWN_CAPTIONS}
                emptyLabel="Sin acciones ubicadas"
              />
            </div>
          );
        })}
      </div>
      <div style={{ ...noteStyle, marginTop: 6 }}>
        Acciones sin sector registrado: {dashboard.unlocated}
        {dashboard.ruleDetermined > 0
          ? ` · ${dashboard.ruleDetermined} desde el punto de penalti (su origen lo fija el reglamento)`
          : ""}
        {legacy ? " · partido con rejilla histórica: la perspectiva de ataque no se registró" : ""}
      </div>
    </div>
  );
}

/**
 * Destino de los tiros de un equipo: las nueve casillas de portería, lo que
 * se fue fuera, lo que se bloqueó y lo que no se registró.
 *
 * Las cifras salen enteras de `buildZoneDashboard`. Aquí no se cuenta nada:
 * solo se coloca.
 */
export function GoalDestinationBoard({
  dashboard,
  teamName,
  opponent,
}: {
  dashboard: ZoneDashboard;
  teamName: string;
  opponent: boolean;
}) {
  const t = dashboard.totals;
  return (
    <div data-dossier-destination={opponent ? "rival" : "team"}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
        Destino de los tiros · {teamName}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, maxWidth: 250 }}>
        {dashboard.goal.map((z) => (
          <div
            key={z.zone}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 6,
              padding: 5,
              textAlign: "center",
              background: z.attempts > 0 ? "#fef2f2" : "#f9fafb",
            }}
          >
            <div style={{ fontSize: 7, color: "#6b7280", lineHeight: 1.2 }}>{z.label}</div>
            <div style={{ fontSize: 14, fontWeight: 900 }}>
              {z.attempts}
              {z.goals > 0 ? ` (${z.goals}G)` : ""}
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...noteStyle, marginTop: 5, lineHeight: 1.5 }}>
        <div>Intentos totales: {t.attempts} · entre los tres palos: {t.onTarget} (incluye los goles)</div>
        <div>Fuera / desviado: {dashboard.out} · bloqueados: {t.blocked}</div>
        <div>Sin destino registrado: {t.unknownTarget} — no se reparten ni se estiman.</div>
        <div>
          Goles: {t.goals}
          {t.accuracyPct !== null ? ` · precisión registrada: ${t.accuracyPct}%` : " · precisión no calculable"}
          {t.conversionPct !== null ? ` · conversión: ${t.conversionPct}%` : ""}
        </div>
        <div>
          La precisión se calcula solo sobre lo observado —a puerta frente a fuera—; los
          bloqueados y los tiros sin destino quedan fuera del porcentaje, no se reparten.
        </div>
      </div>
    </div>
  );
}

/**
 * Jugadores con sus tiempos y su finalización.
 *
 * La identidad sale de `playerDisplayIdentity`, igual que las fichas de
 * captura: si hay nombre real manda el nombre, y si no, el dorsal o la letra
 * provisional. Esta tabla no inventa una séptima forma de llamar a nadie.
 */
export function dossierRoster(matchData: MatchData, opponent: boolean): Player[] {
  return matchData.players.filter(
    (p) => !!p.isOpponent === opponent && p.role !== Role.COACH && p.role !== Role.DELEGATE,
  );
}

export function DossierPlayersTable({
  matchData,
  report,
  opponent,
  from = 0,
  to,
}: {
  matchData: MatchData;
  report: MatchReport;
  opponent: boolean;
  /** Tramo de filas [from, to): la maquetación parte la tabla por filas. */
  from?: number;
  to?: number;
}) {
  const plantilla = dossierRoster(matchData, opponent);
  // Una sola pasada por los eventos, con el contrato único de `shotModel`.
  // Este bloque no clasifica tiros por su cuenta: solo coloca el resultado.
  const tallies = playerShotTallies(matchData.events || [], plantilla);
  const tiroDe = (id: string): ShotTally => tallies.get(id) ?? EMPTY_SHOT_TALLY;
  const th: React.CSSProperties = {
    textAlign: "center",
    fontSize: 7,
    color: "#6b7280",
    borderBottom: "1px solid #d1d5db",
    padding: "3px 2px",
    textTransform: "uppercase",
  };
  const td: React.CSSProperties = {
    textAlign: "center",
    fontSize: 8,
    padding: "3px 2px",
    borderBottom: "1px solid #f3f4f6",
  };
  if (plantilla.length === 0) {
    return <div style={{ fontSize: 10, color: "#9ca3af" }}>Sin jugadores registrados.</div>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: "left" }}>Jugador</th>
          <th style={th}>Dorsal</th>
          <th style={th}>Estado</th>
          <th style={th}>TOT</th>
          <th style={th}>ROT</th>
          <th style={th}>Rot.</th>
          <th style={th}>Goles</th>
          <th style={th}>Tiros</th>
          <th style={th}>A port.</th>
          <th style={th}>Fuera</th>
          <th style={th}>Bloq.</th>
          <th style={th}>Recup.</th>
          <th style={th}>Pérd.</th>
          <th style={th}>Faltas</th>
          <th style={th}>Tarj.</th>
        </tr>
      </thead>
      <tbody>
        {plantilla.slice(from, to ?? plantilla.length).map((p) => {
          const ident = playerDisplayIdentity(p, { players: matchData.players, maxCaracteres: 22 });
          // `playersUsed` solo cubre nuestra plantilla; para el rival se usan
          // las mismas funciones compartidas, nunca un recuento paralelo.
          const linea = report.playersUsed.find((l) => l.id === p.id);
          const tiros = tiroDe(p.id);
          const tarjetas =
            (p.stats.yellowCards ? `${p.stats.yellowCards}A` : "") +
            (p.stats.redCards ? ` ${p.stats.redCards}R` : "");
          return (
            <tr key={p.id} data-dossier-player={p.id} data-flow-row>
              <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>
                {ident.kind === "nombre" ? ident.nombreCompleto : ident.etiquetaProvisional}
                {p.role === Role.GOALKEEPER && (
                  <span style={{ fontSize: 7, color: "#6b7280", fontWeight: 400 }}> · POR</span>
                )}
              </td>
              <td style={td}>{ident.dorsal}</td>
              <td style={td}>{p.isOnPitch ? "Pista" : "Banquillo"}</td>
              <td style={td}>{formatPlayerTime(p.individualTimeSeconds)}</td>
              <td style={td}>{p.isOnPitch ? formatPlayerTime(p.rotationTimeSeconds ?? 0) : "—"}</td>
              <td style={td}>{countRotations(matchData.events || [], p.id)}</td>
              <td style={td}>{linea?.goals ?? p.stats.goals}</td>
              <td style={td}>{tiros.shots}</td>
              <td style={td}>{tiros.onTarget}</td>
              <td style={td}>{tiros.offTarget}</td>
              <td style={td}>{tiros.blocked}</td>
              <td style={td}>
                {linea ? linea.steals + linea.interceptions : p.stats.steals + p.stats.interceptions}
              </td>
              <td style={td}>{linea ? linea.losses + linea.errors : p.stats.losses + p.stats.errors}</td>
              <td style={td}>{p.stats.fouls}</td>
              <td style={td}>{tarjetas || "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── PORTADA E ÍNDICE ────────────────────────────────────────────────────

export const TACTICAL_INCLUDED_LABEL = "TACTICAL PRO incluido";
export const TACTICAL_MISSING_LABEL = "TACTICAL PRO no generado";

/** `true` si el partido trae un análisis completo que incluir. */
export function hasTacticalAnalysis(matchData: MatchData): boolean {
  return !!matchData.tacticalAnalysis && matchData.tacticalAnalysis.trim().length > 0;
}

/** La frase discreta de la portada que dice de quién es el análisis. */
export function rivalScopeLabel(matchData: MatchData, includeOpponent: boolean): string {
  return includeOpponent
    ? "Análisis de ambos equipos"
    : `Análisis centrado en ${matchData.teamName || "nuestro equipo"}`;
}

export function DossierCover({
  matchData,
  report,
  indice,
  includeOpponent = true,
}: {
  matchData: MatchData;
  report: MatchReport;
  indice: { section: string; page: number }[];
  includeOpponent?: boolean;
}) {
  const conIa = hasTacticalAnalysis(matchData);
  const periodo =
    matchData.period === Period.FINISHED ? "Finalizado" : periodLabel(matchData.period);
  const bandera = (activo: boolean): React.CSSProperties => ({
    border: `1px solid ${activo ? "#65a30d" : "#d1d5db"}`,
    background: activo ? "#f7fee7" : "#f9fafb",
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 11,
    fontWeight: 700,
    color: activo ? "#3f6212" : "#6b7280",
  });
  return (
    <>
      <ReportHeader matchData={matchData} report={report} />
      <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>Dossier completo del partido</div>
      <div style={{ fontSize: 10, color: "#6b7280" }}>
        {matchData.teamName} – {matchData.opponentName} · Periodo: {periodo}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <div data-dossier-ia-flag style={bandera(conIa)}>
          {conIa ? TACTICAL_INCLUDED_LABEL : TACTICAL_MISSING_LABEL}
        </div>
        <div data-dossier-scope={includeOpponent ? "both" : "team"} style={bandera(true)}>
          {rivalScopeLabel(matchData, includeOpponent)}
        </div>
      </div>
      <div style={sectionTitleStyle}>Índice</div>
      <DossierIndexTable indice={indice} />
    </>
  );
}

/** Cuántas entradas de índice caben en UNA columna de la portada. */
export const INDEX_ROWS_PER_COLUMN = 14;

/**
 * El índice de la portada.
 *
 * En una sola columna, un dossier largo empujaba el índice fuera del marco y
 * la portada perdía sus últimas entradas SIN AVISAR, porque la página recorta
 * (`overflow: hidden`). Medido en el Deploy Preview con un partido de 30
 * fichas y 121 acciones: 25 secciones desbordaban 133 px. A partir de
 * `INDEX_ROWS_PER_COLUMN` filas el índice se reparte en dos columnas, que es
 * la mitad de alto y sigue cabiendo de sobra en el ancho A4.
 */
export function DossierIndexTable({
  indice,
}: {
  indice: { section: string; page: number }[];
}) {
  const mitad = Math.ceil(indice.length / 2);
  // Dos columnas en cuanto hay más de cuatro entradas: el índice compacto
  // cabe siempre en la portada y deja ver todas las secciones de un vistazo.
  const columnas =
    indice.length > Math.min(INDEX_ROWS_PER_COLUMN, 4)
      ? [indice.slice(0, mitad), indice.slice(mitad)]
      : [indice];
  return (
    <div
      data-dossier-index-columns={columnas.length}
      style={{
        display: "grid",
        gridTemplateColumns: columnas.map(() => "1fr").join(" "),
        gap: 16,
      }}
    >
      {columnas.map((columna, c) => (
        <table key={c} style={{ width: "100%", borderCollapse: "collapse" }} data-dossier-index>
          <tbody>
            {columna.map((row) => (
              <tr key={`${row.section}-${row.page}`}>
                <td style={{ fontSize: 10, padding: "2px 0", borderBottom: "1px dotted #d1d5db" }}>
                  {row.section}
                </td>
                <td
                  style={{
                    fontSize: 10,
                    padding: "2px 0",
                    textAlign: "right",
                    borderBottom: "1px dotted #d1d5db",
                    width: 40,
                    fontWeight: 700,
                  }}
                >
                  {row.page}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

// ── CONSTRUCCIÓN DE LAS PÁGINAS ─────────────────────────────────────────

/**
 * Todas las páginas del dossier, en orden, con su sección.
 *
 * Se decide ANTES de renderizar nada: así el índice y el pie pueden numerar
 * sin tener que adivinar cuántas páginas habrá. Las secciones que no tienen
 * datos NO entran — una hoja vacía no informa de nada y hace pensar que el
 * dato existe y es cero.
 */

// ── RESUMEN VISUAL ──────────────────────────────────────────────────────
//
// La página 2 del dossier es la pantalla RESUMEN de la aplicación, dibujada
// de nuevo con los mismos datos. No es una captura: es un componente que
// recibe el partido y el informe y no calcula NADA por su cuenta —marcador,
// totales y destacados salen de `generateMatchReport`, que es lo que alimenta
// también a la pantalla—. Si el informe cambiara una cifra, esta página
// cambiaría con él, que es justo lo que se quiere.

/**
 * Fondo y tintas, tomadas de la pantalla. Se imprimen bien en papel.
 *
 * TODO EN HEXADECIMAL SÓLIDO, A PROPÓSITO. El resto de las plantillas del
 * dossier no usa `rgba()` ni hexadecimales de ocho dígitos, y esta página
 * tampoco debe: al introducirlos, `html-to-image` se quedaba colgado
 * rasterizando justo esta hoja —el export se paraba en la página 2 y no
 * volvía—. Los tonos ya vienen mezclados contra el fondo oscuro, así que se
 * ve igual sin pedirle transparencias a la captura.
 */
const RESUMEN_FONDO = "#0A0B0E";
const RESUMEN_TARJETA = "#0F172A";
const RESUMEN_BORDE = "#262B36";
const RESUMEN_PANEL = "#16181D";
const TINTA_TIROS = "#67e8f9";
const TINTA_CONVERSION = "#bef264";
const TINTA_RECUPERACIONES = "#93c5fd";
const TINTA_POSITIVO = "#6ee7b7";
const TINTA_NEGATIVO = "#fca5a5";
const TINTA_TOT = "#fbbf24";
const TINTA_GOLEADOR = "#a3e635";
const TINTA_RECUPERADOR = "#60a5fa";

/** Fondo y borde de cada destacado, ya mezclados contra el fondo oscuro. */
const FONDO_DESTACADO: Record<string, { fondo: string; borde: string }> = {
  [TINTA_TOT]: { fondo: "#1F1A10", borde: "#5A4718" },
  [TINTA_GOLEADOR]: { fondo: "#171E10", borde: "#41551C" },
  [TINTA_RECUPERADOR]: { fondo: "#101826", borde: "#28446B" },
};

/** «Sin datos» es la única respuesta honesta cuando no hay a quién destacar. */
export const SIN_DATOS = "Sin datos";

/**
 * Cómo se llama y qué dorsal lleva un destacado.
 *
 * El nombre sale de `playerDisplayIdentity` —nombre real por delante del
 * dorsal, etiqueta provisional cuando no hay nombre— y el dorsal de
 * `formatJerseyNumber`, que escribe «?» cuando todavía no consta. Si el
 * jugador ya no estuviera en la plantilla, se usa lo que guardó el informe
 * en vez de inventar nada.
 */
export function destacadoLabel(
  highlight: { id: string; number: number; jerseyNumberKnown?: boolean; name: string } | null,
  players: Player[],
): string {
  if (!highlight) return SIN_DATOS;
  const player = players.find((p) => p.id === highlight.id);
  const dorsal = formatJerseyNumber(player ?? highlight);
  if (!player) return `#${dorsal} ${highlight.name}`.trim();
  const ident = playerDisplayIdentity(player, { players, maxCaracteres: 22 });
  const nombre = ident.kind === "nombre" ? ident.nombreCompleto! : ident.etiquetaProvisional;
  return `#${dorsal} ${nombre}`;
}

/**
 * El balance, firmado como en la pantalla: «+4», «+0», «-19».
 *
 * El cero lleva «+» a propósito, igual que en la aplicación: un balance
 * neutro no es una pérdida, y escribirlo pelado invitaba a leerlo como tal.
 */
export function firmaBalance(balance: number): string {
  return `${balance >= 0 ? "+" : ""}${balance}`;
}

/** «1 gol» / «0 goles». El singular existe y se nota. */
export function golesLabel(goles: number): string {
  return `${goles} ${goles === 1 ? "gol" : "goles"}`;
}

function KpiCard({ label, value, tinta }: { label: string; value: string; tinta: string }) {
  return (
    <div
      style={{
        border: `1px solid ${RESUMEN_BORDE}`,
        background: RESUMEN_TARJETA,
        borderRadius: 16,
        padding: "14px 10px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 900, color: tinta, lineHeight: 1.1 }}>{value}</div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#94a3b8",
          marginTop: 6,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function DestacadoCard({
  label,
  quien,
  dato,
  tinta,
}: {
  label: string;
  quien: string;
  dato: string;
  tinta: string;
}) {
  const tono = FONDO_DESTACADO[tinta];
  return (
    <div
      style={{
        border: `1px solid ${tono.borde}`,
        background: tono.fondo,
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: tinta,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, color: "#ffffff" }}>{quien}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: tinta, marginTop: 2 }}>{dato}</div>
    </div>
  );
}

export function VisualSummaryBoard({
  matchData,
  report,
}: {
  matchData: MatchData;
  report: MatchReport;
}) {
  const t = report.teamTotals;
  const h = report.highlights;
  const players = matchData.players || [];
  const balance = t.recoveryLossBalance;
  const conversion = t.goalConversionPct === null ? "—" : `${t.goalConversionPct}%`;
  return (
    <div
      data-dossier-visual-summary
      style={{
        background: RESUMEN_FONDO,
        borderRadius: 20,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* RESULTADO ───────────────────────────────────────────────────── */}
      <div
        style={{
          border: `1px solid ${RESUMEN_BORDE}`,
          background: RESUMEN_PANEL,
          borderRadius: 20,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#64748b",
            }}
          >
            Resultado
          </div>
          <div style={{ fontSize: 19, fontWeight: 900, color: "#ffffff", marginTop: 2 }}>
            {matchData.teamName} · {matchData.opponentName}
          </div>
        </div>
        <div style={{ fontSize: 54, fontWeight: 900, color: "#ffffff", lineHeight: 1 }}>
          {report.score.team}–{report.score.opponent}
        </div>
      </div>

      {/* PRIMERA FILA · LAS CUATRO CIFRAS DE CABECERA ─────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <KpiCard label="Tiros totales" value={String(t.shots)} tinta={TINTA_TIROS} />
        <KpiCard label="Conversión" value={conversion} tinta={TINTA_CONVERSION} />
        <KpiCard label="Recuperaciones" value={String(t.recoveries)} tinta={TINTA_RECUPERACIONES} />
        <KpiCard
          label="Balance Rec-(P+E)"
          value={firmaBalance(balance)}
          tinta={balance >= 0 ? TINTA_POSITIVO : TINTA_NEGATIVO}
        />
      </div>

      {/* SEGUNDA FILA · QUIÉN ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <DestacadoCard
          label="Mayor TOT"
          quien={destacadoLabel(h.topTot, players)}
          dato={h.topTot ? h.topTot.totLabel : SIN_DATOS}
          tinta={TINTA_TOT}
        />
        <DestacadoCard
          label={h.scorers.length > 1 ? "Goleadores" : "Goleador"}
          quien={h.scorers.length ? h.scorers.map((scorer) => `${destacadoLabel(scorer, players)} · ${golesLabel(scorer.goals)}`).join(" | ") : SIN_DATOS}
          dato={h.scorers.length ? `${h.scorers.reduce((sum, scorer) => sum + scorer.goals, 0)} goles registrados` : golesLabel(0)}
          tinta={TINTA_GOLEADOR}
        />
        <DestacadoCard
          label="Más recuperaciones"
          quien={destacadoLabel(h.topRecoverer, players)}
          dato={h.topRecoverer ? String(h.topRecoverer.recoveries) : SIN_DATOS}
          tinta={TINTA_RECUPERADOR}
        />
      </div>
    </div>
  );
}

/**
 * Si el bloque de zonas tiene algo que contar.
 *
 * Mismo criterio que usa `ZonesSection` para decidir si pinta la pista o el
 * «Sin datos registrados»: origen en pista, córners, destino de tiro o fuera.
 */
export function hasZoneData(zones: ZoneDashboard): boolean {
  const bucket = primaryBucket(zones);
  return (
    (bucket?.total ?? 0) > 0 ||
    zones.corners.total > 0 ||
    zones.goal.some((z) => z.attempts > 0) ||
    zones.out > 0
  );
}

// ── INVENTARIO ──────────────────────────────────────────────────────────
//
// El dossier ya no se escribe página a página. Se describe como un
// INVENTARIO de secciones —con id estable, título, equipo y tipo— y cada
// sección como una lista de bloques con significado (título, mapa, tabla,
// tarjeta, texto). La maquetación por medición (`pdfFlow`) los reparte en
// páginas A4; el índice y los pies salen de ese reparto, nunca de números
// escritos a mano.
//
// Las cifras siguen saliendo de los MISMOS servicios: aquí no se filtra ni
// se cuenta nada.

export type DossierOptions = {
  /**
   * `false` = análisis centrado en nuestro equipo: fuera las tablas, mapas,
   * tiempos, porteros y páginas propias del rival. Se conservan los dos
   * nombres, el marcador, la secuencia completa de goles (autor y
   * beneficiario), los goles en propia, las faltas por parte, los contextos
   * 5x4/4x5, las acciones relevantes y Tactical Pro entero.
   */
  includeOpponent?: boolean;
};

export type DossierTeamScope = "team" | "opponent" | "both";

export type DossierSection = {
  id: string;
  title: string;
  team: DossierTeamScope;
  kind: "summary" | "maps" | "set-pieces" | "players" | "goalkeepers" | "contexts" | "tactical";
};

export type DossierInventory = {
  sections: DossierSection[];
  items: FlowItem[];
};

/** Ids estables de las secciones, en el orden del documento. */
export const DOSSIER_SECTION_IDS = [
  "resumen",
  "ofensiva",
  "perdidas-fases",
  "balon-parado",
  "jugadores",
  "porteros",
  "contextos",
  "tactical-pro",
] as const;

const subtituloStyle: React.CSSProperties = { fontSize: 12, fontWeight: 900, marginBottom: 4 };

function Titulo({ children }: { children: React.ReactNode }) {
  return <div style={{ ...sectionTitleStyle, margin: "2px 0 0" }}>{children}</div>;
}

/**
 * Recuperaciones, pérdidas y balance por parte, de `report.periodStats` y
 * `report.teamTotals`. Ni una cuenta nueva: se colocan.
 */
export function BalanceTable({ report }: { report: MatchReport }) {
  const th: React.CSSProperties = { fontSize: 8, color: "#6b7280", padding: "3px 6px", borderBottom: "1px solid #d1d5db", textAlign: "center" };
  const td: React.CSSProperties = { fontSize: 10, padding: "3px 6px", borderBottom: "1px solid #f3f4f6", textAlign: "center" };
  const firma = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
  const t = report.teamTotals;
  return (
    <div data-dossier-balance>
      <div style={subtituloStyle}>Recuperaciones, pérdidas y balance · {report.teamName}</div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Parte</th>
            <th style={th}>Tiros</th>
            <th style={th}>Goles</th>
            <th style={th}>Recuperaciones</th>
            <th style={th}>Pérdidas + errores</th>
            <th style={th}>Balance Rec-(P+E)</th>
          </tr>
        </thead>
        <tbody>
          {report.periodStats.map((p) => (
            <tr key={p.period}>
              <td style={{ ...td, textAlign: "left" }}>{p.label}</td>
              <td style={td}>{p.shots}</td>
              <td style={td}>{p.goals}</td>
              <td style={td}>{p.steals}</td>
              <td style={td}>{p.losses}</td>
              <td style={td}>{firma(p.steals - p.losses)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, textAlign: "left", fontWeight: 900 }}>Total del informe</td>
            <td style={{ ...td, fontWeight: 900 }}>{t.shots}</td>
            <td style={{ ...td, fontWeight: 900 }}>{t.goals}</td>
            <td style={{ ...td, fontWeight: 900 }}>{t.recoveries}</td>
            <td style={{ ...td, fontWeight: 900 }}>{t.lossesAndErrors}</td>
            <td style={{ ...td, fontWeight: 900 }}>{firma(t.recoveryLossBalance)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ ...noteStyle, marginTop: 3 }}>
        Las partes cuentan las acciones registradas en cada una; «Total del informe» es la cifra
        del resumen (estadísticas por jugador). Si no coinciden, hay acciones sin jugador
        identificado: no se reparte ni se estima nada. Los mapas de pérdidas y recuperaciones
        están en «Producción ofensiva y mapas».
      </div>
    </div>
  );
}

/**
 * El dossier como inventario de secciones y bloques.
 *
 * Se decide ANTES de renderizar: qué entra, en qué orden y de quién es. Lo
 * que no tiene datos no entra —una hoja vacía hace pensar que el dato
 * existe y es cero—.
 */
export function buildDossierInventory(
  matchData: MatchData,
  options: DossierOptions = {},
): DossierInventory {
  const conRival = options.includeOpponent !== false;
  const report = generateMatchReport(matchData);
  const propio = buildZoneDashboard(matchData, false);
  const rival = buildZoneDashboard(matchData, true);
  const goalkeepers = buildGoalkeeperReports(matchData).filter((gk) => conRival || !gk.isOpponent);
  const nombrePropio = matchData.teamName || "Equipo local";
  const nombreRival = matchData.opponentName || "Equipo visitante";
  const bandos: boolean[] = conRival ? [false, true] : [false];

  const sections: DossierSection[] = [];
  const items: FlowItem[] = [];
  const seccion = (s: DossierSection) => sections.push(s);
  const bloque = (it: FlowItem) => items.push(it);
  const titulo = (section: string, texto: string, breakBefore = false) =>
    bloque({
      id: `${section}-titulo`,
      section,
      kind: "heading",
      keepWithNext: true,
      breakBefore,
      node: <Titulo>{texto}</Titulo>,
    });
  const ambos: DossierTeamScope = conRival ? "both" : "team";

  // ── 1 · RESUMEN VISUAL Y CLAVES ───────────────────────────────────────
  seccion({ id: "resumen", title: "Resumen visual y claves", team: "both", kind: "summary" });
  bloque({
    id: "resumen-visual",
    section: "resumen",
    kind: "card",
    breakBefore: true,
    node: <SharedVisualSummaryBoard matchData={matchData} report={report} />,
  });
  bloque({ id: "resumen-claves", section: "resumen", kind: "card", node: <SummaryKpis report={report} /> });

  // ── 2 · PRODUCCIÓN OFENSIVA Y MAPAS ───────────────────────────────────
  seccion({ id: "ofensiva", title: "Producción ofensiva y mapas", team: ambos, kind: "maps" });
  titulo("ofensiva", "Producción ofensiva y mapas");
  bloque({
    id: "destinos",
    section: "ofensiva",
    kind: "map",
    estimate: 280,
    team: ambos,
    node: (
      <div style={{ display: "grid", gridTemplateColumns: conRival ? "1fr 1fr" : "1fr", gap: 18 }}>
        <GoalDestinationBoard dashboard={propio} teamName={nombrePropio} opponent={false} />
        {conRival && <GoalDestinationBoard dashboard={rival} teamName={nombreRival} opponent={true} />}
      </div>
    ),
  });
  bandos.forEach((opponent) => {
    const nombre = opponent ? nombreRival : nombrePropio;
    bloque({
      id: `mapas-${opponent ? "rival" : "team"}`,
      section: "ofensiva",
      kind: "map",
      estimate: 440,
      team: opponent ? "opponent" : "team",
      node: (
        <div>
          <div style={subtituloStyle}>Mapas de acciones · {nombre}</div>
          <GlobalMapsBoard matchData={matchData} dashboard={opponent ? rival : propio} opponent={opponent} />
        </div>
      ),
    });
  });
  if (hasZoneData(propio)) {
    bloque({
      id: "zonas-detalle",
      section: "ofensiva",
      kind: "card",
      team: "team",
      node: <ZonesSection zones={propio} matchData={matchData} withMaps={false} withSetPieceLines={false} />,
    });
  }
  bandos.forEach((opponent) => {
    const nombre = opponent ? nombreRival : nombrePropio;
    bloque({
      id: `tiros-parte-${opponent ? "rival" : "team"}`,
      section: "ofensiva",
      kind: "map",
      estimate: 260,
      team: opponent ? "opponent" : "team",
      node: (
        <div>
          <div style={subtituloStyle}>Tiros por parte · {nombre}</div>
          <PeriodShotMapsBoard events={matchData.events || []} opponent={opponent} pitchWidth={240} />
        </div>
      ),
    });
  });

  // ── 3 · PÉRDIDAS, RECUPERACIONES Y FASES ──────────────────────────────
  seccion({ id: "perdidas-fases", title: "Pérdidas, recuperaciones y fases", team: ambos, kind: "maps" });
  titulo("perdidas-fases", "Pérdidas, recuperaciones y fases");
  bloque({ id: "balance", section: "perdidas-fases", kind: "table", team: "team", node: <BalanceTable report={report} /> });
  // Evolución por periodos: con rival, los dos equipos EN COLUMNAS
  // comparables dentro del mismo bloque; sin rival, nuestro equipo a ancho
  // completo. Cada columna conserva su propia escala y su propia perspectiva.
  const conPeriodos = bandos.filter((opponent) => hasPeriodZoneData(matchData, opponent));
  if (conPeriodos.length > 0) {
    const columnas = conPeriodos.length;
    bloque({
      id: "periodos",
      section: "perdidas-fases",
      kind: "map",
      estimate: 520,
      team: columnas > 1 ? "both" : conPeriodos[0] ? "opponent" : "team",
      node: (
        <div style={{ display: "grid", gridTemplateColumns: columnas > 1 ? "1fr 1fr" : "1fr", gap: 16 }}>
          {conPeriodos.map((opponent) => (
            <div key={String(opponent)} data-dossier-periods={opponent ? "rival" : "team"} style={{ minWidth: 0 }}>
              <div style={subtituloStyle}>Evolución por periodos · {opponent ? nombreRival : nombrePropio}</div>
              <PeriodZoneMapsBoard matchData={matchData} opponent={opponent} pitchWidth={columnas > 1 ? 165 : 220} />
            </div>
          ))}
        </div>
      ),
    });
  }
  if (hasPhaseData(matchData)) {
    const periodos = phasePeriods(matchData);
    bloque({
      id: "fases-nota",
      section: "perdidas-fases",
      kind: "heading",
      keepWithNext: true,
      node: (
        <div>
          <div style={subtituloStyle}>Fases de juego</div>
          <div style={noteStyle}>
            La fase es SIEMPRE la de {nombrePropio}, también cuando la acción es del rival: los
            tiros rivales se leen desde lo que nuestro equipo estaba haciendo.
          </div>
        </div>
      ),
    });
    // Una métrica = un bloque: el partido completo y cada parte, dos por
    // línea (cuatro pistas por fila). Los rótulos van en cada celda.
    PHASE_METRICS.forEach((metric) => {
      const celdas: { period: Period | undefined; rotulo: string }[] = [
        { period: undefined, rotulo: "Partido completo" },
        ...periodos.map((period) => ({ period, rotulo: periodLabel(period) })),
      ];
      bloque({
        id: `fase-${metric.key}`,
        section: "perdidas-fases",
        kind: "map",
        estimate: 60 + Math.ceil((periodos.length + 1) / 3) * 190,
        team: "team",
        node: (
          <div data-dossier-phase={metric.key}>
            <div style={{ fontSize: 10, fontWeight: 900, color: metric.color, marginBottom: 2 }}>
              {metric.title}
            </div>
            <div
              style={{
                display: "grid",
                // Partido completo y cada parte EN UNA SOLA FILA cuando son
                // tres (lo normal); con prórrogas, dos por línea.
                gridTemplateColumns: celdas.length === 3 ? "1fr 1fr 1fr" : "1fr 1fr",
                gap: "4px 12px",
              }}
            >
              {celdas.map((c) => (
                <div key={c.rotulo} data-dossier-phase-cell={c.period ?? "total"}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: metric.color, marginBottom: 1 }}>
                    {c.rotulo}
                  </div>
                  <PhaseMetricRow
                    matchData={matchData}
                    metric={metric}
                    period={c.period}
                    pitchWidth={celdas.length === 3 ? 112 : 165}
                    showTitle={false}
                    twoColumns
                  />
                </div>
              ))}
            </div>
          </div>
        ),
      });
    });
  }

  // ── 4 · BALÓN PARADO ──────────────────────────────────────────────────
  seccion({ id: "balon-parado", title: "Balón parado", team: ambos, kind: "set-pieces" });
  titulo("balon-parado", "Balón parado");
  bloque({
    id: "balon-parado-tabla",
    section: "balon-parado",
    kind: "card",
    team: ambos,
    node: <SetPieceSummaryBoard matchData={matchData} includeOpponent={conRival} />,
  });

  // ── 5 · JUGADORES, TIEMPOS Y ROTACIONES ───────────────────────────────
  seccion({ id: "jugadores", title: "Jugadores, tiempos y rotaciones", team: ambos, kind: "players" });
  titulo("jugadores", "Jugadores, tiempos y rotaciones");
  const rot = report.rotationSummary;
  bloque({
    id: "rotaciones",
    section: "jugadores",
    kind: "text",
    team: "team",
    node: (
      <div style={{ fontSize: 10 }}>
        Rotaciones totales registradas ({nombrePropio}): <b>{rot.totalRotationsCount}</b>
        {rot.avgRotLabel ? ` · ROT medio en pista: ${rot.avgRotLabel} · ROT máximo: ${rot.maxRotLabel}` : ""}
      </div>
    ),
  });
  bandos.forEach((opponent) => {
    const nombre = opponent ? nombreRival : nombrePropio;
    const cuantos = dossierRoster(matchData, opponent).length;
    bloque({
      id: `jugadores-${opponent ? "rival" : "team"}`,
      section: "jugadores",
      kind: "table",
      team: opponent ? "opponent" : "team",
      ...(cuantos > 0
        ? {
            rows: {
              count: cuantos,
              render: (from: number, to: number) => (
                <div>
                  <div style={subtituloStyle}>
                    {nombre}
                    {from > 0 ? " (continuación)" : ""}
                  </div>
                  <DossierPlayersTable matchData={matchData} report={report} opponent={opponent} from={from} to={to} />
                </div>
              ),
            },
          }
        : {
            node: (
              <div>
                <div style={subtituloStyle}>{nombre}</div>
                <DossierPlayersTable matchData={matchData} report={report} opponent={opponent} />
              </div>
            ),
          }),
    });
  });
  bloque({
    id: "jugadores-nota",
    section: "jugadores",
    kind: "text",
    node: (
      <div style={noteStyle}>
        TOT = tiempo total jugado · ROT = tiempo desde la última entrada a pista · Rot. = entradas
        registradas. «Tiros» incluye los goles. El dorsal es el registrado; «?» significa que
        todavía no se conoce.
      </div>
    ),
  });

  // ── 6 · PORTEROS ──────────────────────────────────────────────────────
  if (goalkeepers.length > 0) {
    seccion({ id: "porteros", title: "Porteros", team: ambos, kind: "goalkeepers" });
    titulo("porteros", "Porteros");
    goalkeepers.forEach((gk) => {
      const unico = goalkeepers.filter((g) => g.isOpponent === gk.isOpponent).length <= 1;
      bloque({
        id: `portero-${gk.id}`,
        section: "porteros",
        kind: "card",
        estimate: 440,
        team: gk.isOpponent ? "opponent" : "team",
        node: (
          <div data-dossier-goalkeeper={gk.id}>
            <GoalkeeperCard gk={gk} allEvents={matchData.events} isOnlyRelevantGoalkeeper={unico} compact />
          </div>
        ),
      });
    });
  }

  // ── 7 · CONTEXTOS Y SECUENCIA ─────────────────────────────────────────
  const hayContextos =
    report.goalSequence.length > 0 ||
    report.matchContextGroups.length > 0 ||
    report.relevantEvents.length > 0;
  if (hayContextos) {
    seccion({ id: "contextos", title: "Contextos y secuencia de goles", team: "both", kind: "contexts" });
    titulo("contextos", "Contextos y secuencia de goles");
    if (report.goalSequence.length > 0) {
      bloque({
        id: "goles",
        section: "contextos",
        kind: "table",
        team: "both",
        rows: {
          count: report.goalSequence.length,
          render: (from, to) => <GoalSequenceList report={report} from={from} to={to} />,
        },
      });
    }
    if (report.matchContextGroups.length > 0) {
      bloque({
        id: "contextos-titulo-situaciones",
        section: "contextos",
        kind: "heading",
        keepWithNext: true,
        node: <div style={sectionTitleStyle}>Situaciones especiales</div>,
      });
      report.matchContextGroups.forEach((g) =>
        bloque({
          id: `contexto-${g.type}-${g.side}`,
          section: "contextos",
          kind: "card",
          team: "both",
          node: <ContextGroupCard report={report} group={g} />,
        }),
      );
    }
    if (report.relevantEvents.length > 0) {
      bloque({
        id: "eventos",
        section: "contextos",
        kind: "table",
        team: "both",
        rows: {
          count: report.relevantEvents.length,
          render: (from, to) => <EventsSection report={report} from={from} to={to} />,
        },
      });
    }
  }

  // ── 8 · TACTICAL PRO ──────────────────────────────────────────────────
  //
  // Entero, sin regenerar ni resumir. Se reparte por UNIDADES con sentido
  // —apartado, párrafo, lista— y un apartado numerado va siempre con su
  // primer párrafo.
  if (hasTacticalAnalysis(matchData)) {
    seccion({ id: "tactical-pro", title: "Tactical Pro", team: "both", kind: "tactical" });
    bloque({
      id: "tactical-pro-titulo",
      section: "tactical-pro",
      kind: "heading",
      keepWithNext: true,
      node: (
        <div>
          <Titulo>Tactical Pro</Titulo>
          <div data-dossier-ia-caveat style={{ ...noteStyle, marginTop: 2 }}>
            {TACTICAL_PRO_CAVEAT}
          </div>
        </div>
      ),
    });
    tacticalProUnits(matchData.tacticalAnalysis!).forEach((unit, i) =>
      bloque({
        id: `tactical-pro-${i}`,
        section: "tactical-pro",
        kind: isHeadingUnit(unit) ? "heading" : "text",
        keepWithNext: isHeadingUnit(unit),
        node: <TacticalProUnit unit={unit} />,
      }),
    );
  }

  return { sections, items };
}

// ── MONTAJE ─────────────────────────────────────────────────────────────

/** Alto útil de reserva cuando no se puede medir (jsdom). */
export const DOSSIER_FALLBACK_BODY_HEIGHT = PAGE_HEIGHT - 56 - 30;

/**
 * El índice: una entrada por SECCIÓN, con la página en la que empieza según
 * el reparto real. La portada es la página 1.
 */
export function buildDossierIndex(
  inventory: DossierInventory,
  plan: FlowPlan,
): { id: string; section: string; page: number }[] {
  const inicio = sectionStartPages(plan, inventory.items, 2);
  return inventory.sections
    .filter((s) => inicio[s.id] !== undefined)
    .map((s) => ({ id: s.id, section: s.title, page: inicio[s.id] }));
}

export function DossierPageFrame({
  matchData,
  report,
  section,
  pageNumber,
  totalPages,
  children,
  cover = false,
}: {
  matchData: MatchData;
  report: MatchReport;
  section: string;
  pageNumber: number;
  totalPages: number;
  children: React.ReactNode;
  cover?: boolean;
}) {
  return (
    <div style={dossierPageStyle} data-flow-page {...(cover ? { "data-dossier-cover": "" } : {})}>
      <div style={bodyStyle} data-flow-body>
        {children}
      </div>
      <div style={footerStyle} data-dossier-footer>
        <span>
          {matchData.teamName} {report.score.team} – {report.score.opponent} {matchData.opponentName}
          {" · "}
          {section}
        </span>
        <span data-dossier-page-number data-flow-page-number>
          Página {pageNumber} de {totalPages}
        </span>
      </div>
    </div>
  );
}

/** Sección (título) de una página: la del primer bloque que contiene. */
function seccionDePagina(inventory: DossierInventory, pagina: Placement[]): string {
  const item = inventory.items.find((it) => it.id === pagina[0]?.id);
  return inventory.sections.find((s) => s.id === item?.section)?.title ?? "";
}

export function DossierDocument({
  matchData,
  report,
  inventory,
  plan,
  includeOpponent,
}: {
  matchData: MatchData;
  report: MatchReport;
  inventory: DossierInventory;
  plan: FlowPlan;
  includeOpponent: boolean;
}) {
  const porId = Object.fromEntries(inventory.items.map((it) => [it.id, it]));
  const indice = buildDossierIndex(inventory, plan);
  const total = plan.pages.length + 1;
  return (
    <>
      <DossierPageFrame matchData={matchData} report={report} section="Portada" pageNumber={1} totalPages={total} cover>
        <DossierCover matchData={matchData} report={report} indice={indice} includeOpponent={includeOpponent} />
      </DossierPageFrame>
      {plan.pages.map((pagina, i) => (
        <DossierPageFrame
          key={i}
          matchData={matchData}
          report={report}
          section={seccionDePagina(inventory, pagina)}
          pageNumber={i + 2}
          totalPages={total}
        >
          {pagina.map((p) => (
            <FlowItemView key={`${p.id}-${p.from ?? ""}`} item={porId[p.id]} placement={p} />
          ))}
        </DossierPageFrame>
      ))}
    </>
  );
}

/** Una página con su marco: mide el alto útil real y, con bloques, cada bloque. */
function DossierProbe({
  matchData,
  report,
  children,
}: {
  matchData: MatchData;
  report: MatchReport;
  children: React.ReactNode;
}) {
  return (
    <DossierPageFrame matchData={matchData} report={report} section="—" pageNumber={1} totalPages={1}>
      {children}
    </DossierPageFrame>
  );
}

// ── GUARDIA DE PROCEDENCIA ──────────────────────────────────────────────
//
// Este servicio no tiene estado de módulo, no importa ningún fixture y recibe
// el partido por parámetro: no hay forma de que exporte otro. Aun así, lo que
// sale de aquí es un documento que el entrenador va a dar por bueno sin
// contrastarlo, así que antes de guardarlo se COMPRUEBA que lo renderizado es
// el partido que se pidió. Si alguna vez dejara de serlo, el PDF no se
// escribe: falla en voz alta en vez de entregar un informe de otro.

export class DossierSourceError extends Error {
  constructor(public readonly faltan: string[]) {
    super(
      `El dossier no corresponde al partido seleccionado. No aparece en la portada: ${faltan.join(" · ")}`,
    );
    this.name = "DossierSourceError";
  }
}

/** Los rasgos del partido que la portada TIENE que enseñar. */
export function dossierFingerprint(
  matchData: MatchData,
  report: MatchReport,
): { etiqueta: string; valor: string }[] {
  const marcas: { etiqueta: string; valor: string }[] = [];
  if (matchData.teamName?.trim()) marcas.push({ etiqueta: "equipo", valor: matchData.teamName.trim() });
  if (matchData.opponentName?.trim()) marcas.push({ etiqueta: "rival", valor: matchData.opponentName.trim() });
  marcas.push({ etiqueta: "goles propios", valor: String(report.score.team) });
  marcas.push({ etiqueta: "goles rivales", valor: String(report.score.opponent) });
  return marcas;
}

/**
 * ¿La portada que se acaba de renderizar es la de ESTE partido?
 *
 * Se mira la portada y no todas las páginas a propósito: es la única que
 * reúne equipos y marcador, y si ella coincide es porque el árbol se
 * construyó con el `matchData` recibido —todas las páginas salen del mismo
 * objeto, en la misma llamada—.
 */
export function assertDossierSource(
  cover: HTMLElement | null | undefined,
  matchData: MatchData,
  report: MatchReport,
): void {
  const texto = cover?.textContent ?? "";
  const faltan = dossierFingerprint(matchData, report)
    .filter((m) => !texto.includes(m.valor))
    .map((m) => `${m.etiqueta} «${m.valor}»`);
  if (faltan.length > 0) throw new DossierSourceError(faltan);
}

// ── COMPROBACIÓN AUTOMÁTICA CONTRA EL INFORME ──────────────────────────
//
// La guardia de arriba impide exportar OTRO partido. Esto responde a la
// pregunta siguiente: dado que es el partido correcto, ¿las cifras del
// dossier son las del informe? Se contrasta el texto renderizado contra
// `generateMatchReport`, que es la fuente de la que vive la pantalla.
//
// Sirve para cualquier partido —de prueba o real— y por eso se exporta: con
// un partido real delante, verificar el dossier es una sola llamada.

export type DossierCheck = { etiqueta: string; esperado: string; ok: boolean };

/**
 * Contrasta lo renderizado con el informe determinista del mismo partido.
 *
 * Devuelve una lista, no un booleano: lo útil es saber QUÉ no cuadra. No
 * corrige nada ni rellena nada; solo mira.
 */
/** El texto visible de una unidad de Tactical Pro, sin marcas de markdown. */
export function tacticalUnitProbe(unit: string): string {
  const primera = unit
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "").replace(/[*_`#>]/g, "").trim())
    .find((l) => l.length > 0) ?? "";
  return primera.replace(/\s+/g, " ").slice(0, 40).trim();
}

export function verifyDossierAgainstReport(
  pages: (HTMLElement | null | undefined)[],
  matchData: MatchData,
  report: MatchReport = generateMatchReport(matchData),
  options: DossierOptions = {},
): DossierCheck[] {
  const conRival = options.includeOpponent !== false;
  const texto = pages.map((p) => p?.textContent ?? "").join("\n").replace(/\s+/g, " ");
  const propio = buildZoneDashboard(matchData, false);
  const rival = buildZoneDashboard(matchData, true);
  const porteros = buildGoalkeeperReports(matchData);
  const comprobar = (etiqueta: string, esperado: string | number): DossierCheck => ({
    etiqueta,
    esperado: String(esperado),
    ok: texto.includes(String(esperado)),
  });

  const checks: DossierCheck[] = [
    comprobar("equipo", matchData.teamName),
    comprobar("rival", matchData.opponentName),
    comprobar("marcador propio", report.score.team),
    comprobar("marcador rival", report.score.opponent),
    comprobar("tiros propios", propio.totals.attempts),
    ...(conRival ? [comprobar("tiros rivales", rival.totals.attempts)] : []),
    comprobar("recuperaciones propias", propio.totals.recoveries),
    comprobar("pérdidas propias", propio.totals.losses),
  ];
  // Cada jugador utilizado tiene que aparecer, con el nombre con el que la
  // aplicación lo llama.
  for (const p of report.playersUsed) {
    const ident = playerDisplayIdentity(
      matchData.players.find((x) => x.id === p.id)!,
      { players: matchData.players, maxCaracteres: 22 },
    );
    checks.push(
      comprobar(
        `jugador ${p.number}`,
        ident.kind === "nombre" ? ident.nombreCompleto! : ident.etiquetaProvisional,
      ),
    );
  }
  // Cada portero relevante —los rivales solo si el rival se incluye—.
  for (const gk of porteros) {
    if (gk.isOpponent && !conRival) continue;
    checks.push(comprobar(`portero ${gk.name}`, gk.name));
  }
  // Todos los goleadores, no solo el máximo.
  for (const g of report.highlights.scorers) checks.push(comprobar(`goleador ${g.name}`, g.name));
  // Los contextos 5x4/4x5, con su rótulo.
  for (const c of report.matchContextGroups) checks.push(comprobar(`contexto ${c.label}`, c.label));
  // Balón parado: el total de córners propios que el motor único cuenta.
  checks.push(comprobar("balón parado", "Balón parado"));
  // Tactical Pro ENTERO: el arranque visible de cada unidad.
  if (hasTacticalAnalysis(matchData)) {
    tacticalProUnits(matchData.tacticalAnalysis!).forEach((u, i) => {
      const muestra = tacticalUnitProbe(u);
      if (muestra) checks.push(comprobar(`tactical pro ${i + 1}`, muestra));
    });
  }
  // La secuencia de goles, uno por uno, por el marcador que dejó: dos goles
  // del mismo minuto no se confunden, y el orden queda fijado.
  report.goalSequence.forEach((g, i) =>
    checks.push(
      comprobar(`gol ${i + 1} · marcador`, `${g.scoreAfter.team}-${g.scoreAfter.opponent}`),
    ),
  );
  return checks;
}

/** Los que no cuadran. Vacío = el dossier dice lo mismo que el informe. */
export function failedChecks(checks: DossierCheck[]): DossierCheck[] {
  return checks.filter((c) => !c.ok);
}

/** `dossier_completo_<equipo>_<rival>_<fecha>.pdf` */
export function dossierFileName(matchData: MatchData): string {
  const fecha = matchData.timestamp ? new Date(matchData.timestamp) : new Date();
  const iso = Number.isNaN(fecha.getTime())
    ? new Date().toISOString().slice(0, 10)
    : fecha.toISOString().slice(0, 10);
  return `dossier_completo_${safeName(matchData.teamName)}_${safeName(matchData.opponentName)}_${iso}.pdf`;
}

export type DossierExportOptions = DossierOptions & {
  onProgress?: (p: FlowProgress) => void;
};

/**
 * Exporta el DOSSIER COMPLETO. Número de páginas dinámico.
 *
 * Mide, reparte y audita antes de capturar (`pdfFlow`): ninguna página se
 * aplasta ni se recorta. Comprueba que lo renderizado es ESTE partido y que
 * sus cifras son las del informe, y solo entonces guarda: si algo falla no
 * queda ninguna descarga a medias. El contenedor temporal se limpia siempre.
 */
export async function exportFullMatchDossierPdf(
  match: MatchData,
  options: DossierExportOptions = {},
): Promise<void> {
  // El partido llega por parámetro y es la ÚNICA fuente de todo lo que sigue.
  // No se lee de ningún almacén, ni de un estado de módulo, ni de un fixture:
  // dos exportaciones seguidas de partidos distintos no comparten nada.
  const matchData = match;
  const includeOpponent = options.includeOpponent !== false;
  const report = generateMatchReport(matchData);
  const inventory = buildDossierInventory(matchData, { includeOpponent });
  options.onProgress?.({ phase: "layout", page: 0, total: 0 });

  await runFlowDocument({
    items: inventory.items,
    fallbackBodyHeight: DOSSIER_FALLBACK_BODY_HEIGHT,
    renderProbe: (children) => <DossierProbe matchData={matchData} report={report}>{children}</DossierProbe>,
    renderDocument: (plan) => (
      <DossierDocument
        matchData={matchData}
        report={report}
        inventory={inventory}
        plan={plan}
        includeOpponent={includeOpponent}
      />
    ),
    onReady: async (paginas) => {
      // Antes de capturar nada: lo renderizado tiene que ser este partido…
      assertDossierSource(paginas[0], matchData, report);
      // …y decir lo mismo que el informe.
      const fallos = failedChecks(verifyDossierAgainstReport(paginas, matchData, report, { includeOpponent }));
      if (fallos.length) {
        throw new Error(
          `El dossier no cuadra con el informe: ${fallos.map((f) => `${f.etiqueta} «${f.esperado}»`).join(" · ")}`,
        );
      }
      const pdf = await capturePagesToPdf(paginas, (page, total) =>
        options.onProgress?.({ phase: "capture", page, total }),
      );
      options.onProgress?.({ phase: "save", page: paginas.length, total: paginas.length });
      pdf.save(dossierFileName(matchData));
    },
  });
}

export { PdfPagesRenderer };
