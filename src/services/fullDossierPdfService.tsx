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
import { MatchData, Period, Role } from "../types/futsal";
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
import { formatPlayerTime } from "../utils/playerClock";
import { ShotTally, EMPTY_SHOT_TALLY, playerShotTallies } from "../utils/shotModel";
import {
  EventsSection,
  FoulsByPeriod,
  PdfPagesRenderer,
  PlayersTable,
  ReportHeader,
  SpecialContextsSection,
  SummaryKpis,
  TacticalProChunk,
  ZonesSection,
  capturePagesToPdf,
  makeRefs,
  renderOffscreen,
  safeName,
  sectionTitleStyle,
  splitTacticalProIntoPages,
} from "./pdfExportService";

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
  gap: 12,
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
export function DossierPlayersTable({
  matchData,
  report,
  opponent,
}: {
  matchData: MatchData;
  report: MatchReport;
  opponent: boolean;
}) {
  const plantilla = matchData.players.filter(
    (p) => !!p.isOpponent === opponent && p.role !== Role.COACH && p.role !== Role.DELEGATE,
  );
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
        {plantilla.map((p) => {
          const ident = playerDisplayIdentity(p, { players: matchData.players, maxCaracteres: 22 });
          // `playersUsed` solo cubre nuestra plantilla; para el rival se usan
          // las mismas funciones compartidas, nunca un recuento paralelo.
          const linea = report.playersUsed.find((l) => l.id === p.id);
          const tiros = tiroDe(p.id);
          const tarjetas =
            (p.stats.yellowCards ? `${p.stats.yellowCards}A` : "") +
            (p.stats.redCards ? ` ${p.stats.redCards}R` : "");
          return (
            <tr key={p.id} data-dossier-player={p.id}>
              <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>
                {ident.kind === "nombre" ? ident.nombreCompleto : ident.etiquetaProvisional}
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

export function DossierCover({
  matchData,
  report,
  indice,
}: {
  matchData: MatchData;
  report: MatchReport;
  indice: { section: string; page: number }[];
}) {
  const conIa = hasTacticalAnalysis(matchData);
  const periodo =
    matchData.period === Period.FINISHED ? "Finalizado" : periodLabel(matchData.period);
  return (
    <>
      <ReportHeader matchData={matchData} report={report} />
      <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>Dossier completo del partido</div>
      <div style={{ fontSize: 10, color: "#6b7280" }}>
        Informe automático, Tactical Pro y todos los mapas registrados · Periodo: {periodo}
      </div>

      <div
        data-dossier-ia-flag
        style={{
          marginTop: 6,
          border: `1px solid ${conIa ? "#65a30d" : "#d1d5db"}`,
          background: conIa ? "#f7fee7" : "#f9fafb",
          borderRadius: 8,
          padding: 8,
          fontSize: 11,
          fontWeight: 700,
          color: conIa ? "#3f6212" : "#6b7280",
        }}
      >
        {conIa ? TACTICAL_INCLUDED_LABEL : TACTICAL_MISSING_LABEL}
      </div>

      <div style={sectionTitleStyle}>Resumen ejecutivo</div>
      <SummaryKpis report={report} />

      <div style={sectionTitleStyle}>Índice</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }} data-dossier-index>
        <tbody>
          {indice.map((row) => (
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
    </>
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
export function buildDossierPages(matchData: MatchData): DossierPage[] {
  const report = generateMatchReport(matchData);
  const propio = buildZoneDashboard(matchData, false);
  const rival = buildZoneDashboard(matchData, true);
  const goalkeepers = buildGoalkeeperReports(matchData);
  const nombrePropio = matchData.teamName || "Equipo local";
  const nombreRival = matchData.opponentName || "Equipo visitante";

  const pages: DossierPage[] = [];
  const push = (key: string, section: string, content: React.ReactNode) =>
    pages.push({ key, section, content });

  // ── 1 · INFORME AUTOMÁTICO ────────────────────────────────────────────
  push(
    "report-key",
    "Informe automático · datos clave",
    <>
      <div style={sectionTitleStyle}>Datos clave</div>
      <SummaryKpis report={report} />
      <FoulsByPeriod report={report} />
      <ZonesSection zones={propio} matchData={matchData} />
    </>,
  );

  push(
    "report-players",
    "Informe automático · jugadores y rotaciones",
    <>
      <div style={sectionTitleStyle}>Jugadores utilizados y rotaciones</div>
      <PlayersTable report={report} />
    </>,
  );

  // ── 2 · JUGADORES Y TIEMPOS, LOS DOS EQUIPOS ──────────────────────────
  ([false, true] as const).forEach((opponent) => {
    const nombre = opponent ? nombreRival : nombrePropio;
    push(
      `players-${opponent ? "rival" : "team"}`,
      `Jugadores y tiempos · ${nombre}`,
      <>
        <div style={sectionTitleStyle}>Jugadores y tiempos · {nombre}</div>
        <DossierPlayersTable matchData={matchData} report={report} opponent={opponent} />
        <div style={noteStyle}>
          TOT = tiempo total jugado · ROT = tiempo desde la última entrada a pista. «Tiros»
          incluye los goles. El dorsal es el registrado; «?» significa que todavía no se conoce.
        </div>
      </>,
    );
  });

  // ── 3 · MAPAS GLOBALES, LOS SEIS FILTROS, LOS DOS EQUIPOS ─────────────
  ([false, true] as const).forEach((opponent) => {
    const nombre = opponent ? nombreRival : nombrePropio;
    push(
      `maps-${opponent ? "rival" : "team"}`,
      `Mapas de acciones · ${nombre}`,
      <>
        <div style={sectionTitleStyle}>Mapas de acciones · {nombre}</div>
        <GlobalMapsBoard
          matchData={matchData}
          dashboard={opponent ? rival : propio}
          opponent={opponent}
        />
      </>,
    );
  });

  // ── 4 · DESTINO DE LOS TIROS ──────────────────────────────────────────
  push(
    "destinations",
    "Destino de los tiros",
    <>
      <div style={sectionTitleStyle}>Destino de los tiros</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <GoalDestinationBoard dashboard={propio} teamName={nombrePropio} opponent={false} />
        <GoalDestinationBoard dashboard={rival} teamName={nombreRival} opponent={true} />
      </div>
    </>,
  );

  // ── 5 · MAPAS POR PERIODO ─────────────────────────────────────────────
  ([false, true] as const).forEach((opponent) => {
    if (!hasPeriodZoneData(matchData, opponent)) return;
    const nombre = opponent ? nombreRival : nombrePropio;
    push(
      `periods-${opponent ? "rival" : "team"}`,
      `Evolución por periodos · ${nombre}`,
      <>
        <div style={sectionTitleStyle}>Evolución por periodos · {nombre}</div>
        <PeriodZoneMapsBoard matchData={matchData} opponent={opponent} pitchWidth={280} />
      </>,
    );
  });

  // ── 6 · TIROS POR PARTE ───────────────────────────────────────────────
  ([false, true] as const).forEach((opponent) => {
    const nombre = opponent ? nombreRival : nombrePropio;
    push(
      `shots-periods-${opponent ? "rival" : "team"}`,
      `Tiros por parte · ${nombre}`,
      <>
        <div style={sectionTitleStyle}>Tiros por parte · {nombre}</div>
        <PeriodShotMapsBoard events={matchData.events || []} opponent={opponent} />
      </>,
    );
  });

  // ── 7 · FASES DE JUEGO ────────────────────────────────────────────────
  //
  // Una página por métrica: el total del partido y después cada parte. Un
  // histórico sin fase no entra aquí —`hasPhaseData` lo descarta— y una
  // prórroga sin datos tampoco gana fila, porque `phasePeriods` solo ofrece
  // las partes que el partido jugó.
  if (hasPhaseData(matchData)) {
    const periodos = phasePeriods(matchData);
    PHASE_METRICS.forEach((metric) => {
      push(
        `phase-${metric.key}`,
        `Fases de juego · ${metric.title}`,
        <>
          <div style={sectionTitleStyle}>Fases de juego · {metric.title}</div>
          <div style={{ ...noteStyle, marginBottom: 4 }}>
            La fase es SIEMPRE la de {nombrePropio}, también cuando la acción es del rival.
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: metric.color, marginBottom: 2 }}>
            Partido completo
          </div>
          <PhaseMetricRow
            matchData={matchData}
            metric={metric}
            pitchWidth={215}
            showTitle={false}
          />
          {periodos.map((period) => (
            <div key={period}>
              <div style={{ fontSize: 9, fontWeight: 700, color: metric.color, marginBottom: 2 }}>
                {periodLabel(period)}
              </div>
              <PhaseMetricRow
                matchData={matchData}
                metric={metric}
                period={period}
                pitchWidth={215}
                showTitle={false}
              />
            </div>
          ))}
        </>,
      );
    });
  }

  // ── 8 · BALÓN PARADO ──────────────────────────────────────────────────
  push(
    "set-pieces",
    "Balón parado",
    <>
      <div style={sectionTitleStyle}>Balón parado</div>
      <SetPieceSummaryBoard matchData={matchData} />
    </>,
  );

  // ── 9 · PORTEROS ──────────────────────────────────────────────────────
  goalkeepers.forEach((gk) => {
    const unico = goalkeepers.filter((g) => g.isOpponent === gk.isOpponent).length <= 1;
    push(
      `gk-${gk.id}`,
      `Portero · ${gk.name}`,
      <>
        <div style={sectionTitleStyle}>
          Portero · {gk.isOpponent ? nombreRival : nombrePropio}
        </div>
        <GoalkeeperCard gk={gk} allEvents={matchData.events} isOnlyRelevantGoalkeeper={unico} />
      </>,
    );
  });

  // ── 10 · CONTEXTOS Y EVENTOS ──────────────────────────────────────────
  if (report.matchContextGroups.length > 0 || report.goalSequence.length > 0) {
    push(
      "contexts",
      "Contextos especiales y secuencia de goles",
      <>
        <SpecialContextsSection report={report} />
      </>,
    );
  }

  if (report.relevantEvents.length > 0) {
    push(
      "events",
      "Acciones relevantes",
      <>
        <EventsSection report={report} />
      </>,
    );
  }

  // ── 11 · TACTICAL PRO ─────────────────────────────────────────────────
  //
  // Lo último, y SOLO si ya existe. Nunca se pide aquí: exportar no genera
  // análisis ni consume saldo. Si no hay, no se crea ninguna página vacía —
  // la portada ya lo declara.
  if (hasTacticalAnalysis(matchData)) {
    const chunks = splitTacticalProIntoPages(matchData.tacticalAnalysis!);
    chunks.forEach((chunk, i) => {
      push(
        `tactical-${i}`,
        `Tactical Pro${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ""}`,
        <>
          {/* El aviso va en la PRIMERA página del bloque y sale de la misma
              constante que usa el informe de MatchTracker: una segunda
              redacción del mismo matiz acabaría diciendo otra cosa. */}
          {i === 0 && (
            <div data-dossier-ia-caveat style={{ ...noteStyle, marginBottom: 2 }}>
              {TACTICAL_PRO_CAVEAT}
            </div>
          )}
          <TacticalProChunk chunk={chunk} index={i} total={chunks.length} />
        </>,
      );
    });
  }

  return pages;
}

// ── MONTAJE ─────────────────────────────────────────────────────────────

/**
 * El índice: una entrada por SECCIÓN, con la página en la que empieza.
 *
 * Las páginas del mismo bloque de Tactical Pro no se repiten como entradas
 * distintas; se agrupan por su nombre de sección, que ya lleva (1/3).
 */
export function buildDossierIndex(pages: DossierPage[]): { section: string; page: number }[] {
  // La portada es la página 1, así que el cuerpo empieza en la 2.
  return pages.map((p, i) => ({ section: p.section, page: i + 2 }));
}

export function DossierPageFrame({
  matchData,
  report,
  section,
  pageNumber,
  totalPages,
  children,
}: {
  matchData: MatchData;
  report: MatchReport;
  section: string;
  pageNumber: number;
  totalPages: number;
  children: React.ReactNode;
}) {
  return (
    <div style={dossierPageStyle}>
      <div style={bodyStyle}>{children}</div>
      <div style={footerStyle} data-dossier-footer>
        <span>
          {matchData.teamName} {report.score.team} – {report.score.opponent} {matchData.opponentName}
          {" · "}
          {section}
        </span>
        <span data-dossier-page-number>
          Página {pageNumber} de {totalPages}
        </span>
      </div>
    </div>
  );
}

function DossierRenderer({
  matchData,
  report,
  pages,
  refs,
}: {
  matchData: MatchData;
  report: MatchReport;
  pages: DossierPage[];
  refs: React.RefObject<HTMLDivElement>[];
}) {
  const indice = buildDossierIndex(pages);
  const total = pages.length + 1;
  return (
    <>
      <div ref={refs[0]} style={dossierPageStyle} data-dossier-cover>
        <div style={bodyStyle}>
          <DossierCover matchData={matchData} report={report} indice={indice} />
        </div>
        <div style={footerStyle} data-dossier-footer>
          <span>
            {matchData.teamName} {report.score.team} – {report.score.opponent}{" "}
            {matchData.opponentName} · Portada
          </span>
          <span data-dossier-page-number>Página 1 de {total}</span>
        </div>
      </div>
      {pages.map((p, i) => (
        <div key={p.key} ref={refs[i + 1]} data-dossier-section={p.key}>
          <DossierPageFrame
            matchData={matchData}
            report={report}
            section={p.section}
            pageNumber={i + 2}
            totalPages={total}
          >
            {p.content}
          </DossierPageFrame>
        </div>
      ))}
    </>
  );
}

/** `dossier_completo_<equipo>_<rival>_<fecha>.pdf` */
export function dossierFileName(matchData: MatchData): string {
  const fecha = matchData.timestamp ? new Date(matchData.timestamp) : new Date();
  const iso = Number.isNaN(fecha.getTime())
    ? new Date().toISOString().slice(0, 10)
    : fecha.toISOString().slice(0, 10);
  return `dossier_completo_${safeName(matchData.teamName)}_${safeName(matchData.opponentName)}_${iso}.pdf`;
}

/**
 * Exporta el DOSSIER COMPLETO. Número de páginas dinámico.
 *
 * Igual que el informe resumido: se renderiza fuera de pantalla, se captura y
 * se descarga directamente. Sin ventanas emergentes y sin dejar nunca el
 * contenedor temporal en el DOM —`renderOffscreen` lo limpia en su `finally`,
 * también si `toJpeg` o `pdf.save` lanzan—.
 */
export async function exportFullMatchDossierPdf(matchData: MatchData): Promise<void> {
  const report = generateMatchReport(matchData);
  const pages = buildDossierPages(matchData);
  const refs = makeRefs(pages.length + 1);

  await renderOffscreen(
    <DossierRenderer matchData={matchData} report={report} pages={pages} refs={refs} />,
    refs,
    async () => {
      const nodes = refs.map((r) => r.current).filter((n): n is HTMLDivElement => !!n);
      const pdf = await capturePagesToPdf(nodes);
      pdf.save(dossierFileName(matchData));
    },
  );
}

export { PdfPagesRenderer };
