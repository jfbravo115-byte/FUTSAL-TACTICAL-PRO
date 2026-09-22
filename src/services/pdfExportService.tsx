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
import { MatchData, Role, GameEvent } from "../types/futsal";
import { generateMatchReport, MatchReport } from "./matchReportService";
import { UNKNOWN_DURATION_LABEL } from "../utils/matchContexts";
import { PERIOD_PDF_LABEL } from "../components/export/MatchContextBoard";
import {
  buildZoneDashboard,
  describeZoneBreakdown,
  mirrorTally,
  primaryBucket,
  tallyActionZones,
  ZONE_OTHER_NOTE,
  ZONE_PREDICATES,
  ZoneBucket,
  ZoneDashboard,
  zoneBreakdown,
  ZoneStats,
} from "./matchZonesService";
import { FutsalPitch } from "../components/field/FutsalPitch";
import { PeriodZoneMapsBoard, hasPeriodZoneData } from "../components/export/PeriodZoneMaps";
import { GoalkeeperPdfCard as GoalkeeperCard } from "../components/export/GoalkeeperPdfCard";
import { ZONE_BANDS, ZoneBand, bandTotal, formatBandLabel } from "../utils/fieldZones";
import { describeCorners } from "../utils/cornerModel";
import { countShotsFromSetPiece, describeSetPieceOutcomes } from "../utils/setPieceModel";
import { LEGACY_DISCLAIMER } from "../utils/legacyZoneMap";
import { buildGoalkeeperReports, GoalkeeperReportEntry } from "./goalkeeperReportService";
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

/** `mm:ss` a partir de milisegundos de juego. */
function fmtDuration(milliseconds: number): string {
  const total = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

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
        {/* Faltas del PARTIDO, derivadas de los eventos. El contador
            reglamentario —el de la 6ª falta— se reinicia en el descanso y no
            sirve como total; se muestra aparte solo cuando es lo único que
            hay. */}
        {cell(
          "Faltas",
          report.hasFoulEvents
            ? `${report.fouls.team} propias / ${report.fouls.opponent} rival`
            : "desglose no disponible",
        )}
        {/* El resumen cuenta tarjetas de JUGADORES: el cuerpo técnico queda
            fuera por diseño. Sus expulsiones siguen en Eventos relevantes. */}
        {cell("Tarjetas · jugadores", `🟨 ${report.teamTotals.yellowCards} · 🟥 ${report.teamTotals.redCards}`)}
      </div>

      <FoulsByPeriod report={report} />
    </div>
  );
}

/**
 * Faltas acumuladas por parte. Lo que la portada no podía decir con una sola
 * cifra: dónde se gastaron, y si se llegó al bonus antes del descanso.
 *
 * Todos los números salen de los eventos FOUL. Un partido sin ellos no
 * inventa un reparto: dice que no está disponible y enseña el contador con
 * su nombre.
 */
function FoulsByPeriod({ report }: { report: MatchReport }) {
  if (!report.hasFoulEvents) {
    const c = report.periodFoulCounter;
    if (c.team === 0 && c.opponent === 0) return null;
    return (
      <div style={{ fontSize: 9, color: "#6b7280", marginTop: 8 }}>
        Faltas: este partido no guarda las faltas como acciones, así que no hay
        desglose por parte. Último contador reglamentario registrado:{" "}
        {c.team} propias / {c.opponent} rival.
      </div>
    );
  }
  if (report.foulsByPeriod.length === 0) return null;

  const celda: React.CSSProperties = {
    borderBottom: "1px solid #e5e7eb",
    padding: "4px 8px",
    textAlign: "center",
  };
  const cabecera: React.CSSProperties = { ...celda, color: "#6b7280", fontSize: 9 };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
        Faltas acumuladas
      </div>
      <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ ...cabecera, textAlign: "left" }} />
            {report.foulsByPeriod.map((l) => (
              <th key={l.period} style={cabecera}>
                {PERIOD_PDF_LABEL[l.period] ?? `Periodo ${l.period}`}
              </th>
            ))}
            <th style={{ ...cabecera, fontWeight: 700, color: "#0f172a" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {([
            ["team", report.teamName, report.fouls.team] as const,
            ["opponent", report.opponentName, report.fouls.opponent] as const,
          ]).map(([key, nombre, total]) => (
            <tr key={key}>
              <td style={{ ...celda, textAlign: "left", fontWeight: 700 }}>{nombre}</td>
              {report.foulsByPeriod.map((l) => (
                <td key={l.period} style={celda}>{l[key]}</td>
              ))}
              <td style={{ ...celda, fontWeight: 900 }}>{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── QUÉ SIGNIFICA EL MAPA ───────────────────────────────────
//
// El PDF imprimía una celda con «22» en azul oscuro y nada más. Quien lo
// recibe no puede saber si son tiros, acciones, propias o del rival, ni qué
// mide el color. Tres hechos que el código ya determina y que aquí se
// escriben, sin cambiar ni un número:
//
//   1. el número cuenta acciones del equipo CON sector registrado;
//   2. el azul se normaliza al máximo DE ESTE partido (FutsalPitch:
//      `alpha = 0.18 + (count/max) * 0.55`), así que dos informes distintos
//      no se comparan por color;
//   3. el volumen no es rendimiento: la celda más oscura puede ser donde más
//      se pierde el balón.

function ZoneMapLegend() {
  return (
    <div style={{ fontSize: 8, color: "#6b7280", marginTop: 4, lineHeight: 1.35, maxWidth: 240 }}>
      <div>Número = acciones del equipo registradas con origen en esa zona.</div>
      <div>
        Mayor intensidad = mayor volumen relativo dentro de este partido. No indica eficacia.
      </div>
    </div>
  );
}

/**
 * La zona más activa con su composición.
 *
 * `zone.total` es EL MISMO objeto que alimenta la celda del mapa —no hay un
 * segundo recuento—, y el desglose sale de `describeZoneBreakdown`, que es
 * también quien decide que los goles se anuncian DENTRO de los tiros y que
 * el resto ubicado se declara como «Otras» en vez de desaparecer.
 */
function MostActiveZone({ zone }: { zone: ZoneStats }) {
  const filas = describeZoneBreakdown(zone);
  const other = zoneBreakdown(zone).other;
  return (
    <div style={{ fontSize: 9, color: "#374151", marginTop: 6, lineHeight: 1.4 }}>
      <div style={{ fontWeight: 700 }}>Zona más activa</div>
      <div style={{ fontWeight: 900, fontSize: 10 }}>
        {zone.label} — {zone.total} acciones
      </div>
      <div>{filas.map((f) => `${f.label} ${f.value}`).join(" · ")}</div>
      {other > 0 && (
        <div style={{ fontSize: 8, color: "#6b7280" }}>Otras: {ZONE_OTHER_NOTE}.</div>
      )}
    </div>
  );
}

// ── LA MATRIZ DE 12 ZONAS ────────────────────────────────────
//
// LO QUE SUSTITUYE
// ----------------
// La página imprimía hasta 16 líneas del tipo «Zona 2: 9 pérdidas — 9
// centro», una por banda y métrica. Se comprobó celda a celda que esas
// cifras son EXACTAMENTE `bucket.zones[].losses|recoveries|shots|fouls`
// —las mismas 60 celdas, calculadas dos veces— y que la prosa además
// pierde los carriles a cero. La tabla las contiene todas.
//
// ALTURA CONSTANTE
// ----------------
// La prosa crecía con el partido: 135 px en un partido normal y 284 px con
// las doce zonas activas, sobre una página que solo tiene ~34 px libres. La
// tabla son siempre 12 filas, ocupe lo que ocupe el partido.
//
// DE DÓNDE SALEN LOS NÚMEROS
// --------------------------
// De `bucket.zones[]` y de nada más. Aquí no se filtran eventos ni se llama
// a `tallyActionZones`: si la tabla tuviera su propio recuento, acabaría
// diciendo una cifra distinta de la que pinta el mapa de al lado.

/** Fila ya formateada. Presentación pura: recibe ZoneStats, no eventos. */
export type ZoneMatrixRow = {
  zone: string;
  label: string;
  losses: number;
  recoveries: number;
  /** Tiros, con los goles anunciados DENTRO cuando los hay. */
  shots: string;
  fouls: number;
  total: number;
  /** ¿Es la zona de mayor volumen? Solo puede serlo una. */
  isMostActive: boolean;
};

/**
 * Las doce filas, en el orden de `ZONE_12_IDS`.
 *
 * `bucket.zones` ya viene en ese orden porque `buildBucket` mapea sobre los
 * ids; se conserva tal cual en vez de reordenar, para que la tabla y el mapa
 * recorran la pista igual.
 */
export function zoneMatrixRows(bucket: ZoneBucket): ZoneMatrixRow[] {
  return bucket.zones.map((z) => ({
    zone: z.zone,
    label: z.label,
    losses: z.losses,
    recoveries: z.recoveries,
    // Nunca una columna «Goles»: `goals` está dentro de `shots` y dos cifras
    // separadas invitan a sumarlas.
    shots: z.goals > 0 ? `${z.shots} (${z.goals}G)` : String(z.shots),
    fouls: z.fouls,
    total: z.total,
    isMostActive: !!bucket.mostActive && bucket.mostActive.zone === z.zone,
  }));
}

/** ¿Alguna zona tiene acciones ubicadas sin categoría propia? */
export function anyZoneHasOther(bucket: ZoneBucket): boolean {
  return bucket.zones.some((z) => zoneBreakdown(z).other > 0);
}

const matrizCabecera: React.CSSProperties = {
  padding: "1px 3px",
  color: "#6b7280",
  fontWeight: 700,
  fontSize: 8,
};

function ZoneMatrix({ bucket, teamName }: { bucket: ZoneBucket; teamName: string }) {
  const filas = zoneMatrixRows(bucket);
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 9, fontWeight: 700, marginBottom: 2 }}>
        Acciones por zona · {teamName}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #d1d5db" }}>
            <th style={{ ...matrizCabecera, textAlign: "left" }}>Zona</th>
            {["Pérd.", "Recup.", "Tiros", "Faltas", "Total"].map((c) => (
              <th key={c} style={{ ...matrizCabecera, textAlign: "center" }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            // Azul neutro del propio informe. Es un LOCALIZADOR de la zona de
            // mayor volumen: no dice que sea mejor, ni peor, ni más peligrosa.
            const fondo = f.isMostActive ? "#eff6ff" : undefined;
            // Sin relleno vertical y con interlineado explícito: doce filas
            // tienen que caber en una página que ya va justa, y un padding
            // implícito distinto entre motores movería el total.
            const celda: React.CSSProperties = {
              padding: "0 3px",
              lineHeight: 1.35,
              textAlign: "center",
              fontWeight: f.isMostActive ? 700 : 400,
            };
            const apagado = (v: number | string) => (v === 0 || v === "0" ? "#cbd5e1" : "#111827");
            return (
              <tr
                key={f.zone}
                data-most-active={f.isMostActive ? "true" : undefined}
                style={{ borderBottom: "0.5px solid #f1f5f9", background: fondo }}
              >
                <td style={{ ...celda, textAlign: "left", color: "#111827" }}>{f.label}</td>
                <td style={{ ...celda, color: apagado(f.losses) }}>{f.losses}</td>
                <td style={{ ...celda, color: apagado(f.recoveries) }}>{f.recoveries}</td>
                <td style={{ ...celda, color: apagado(f.shots) }}>{f.shots}</td>
                <td style={{ ...celda, color: apagado(f.fouls) }}>{f.fouls}</td>
                <td style={{ ...celda, fontWeight: 700, color: apagado(f.total) }}>{f.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* El Total NO se redefine para cuadrar con las cuatro columnas: sigue
          siendo `ZoneStats.total`, el mismo número de la celda del mapa. Cuando
          hay acciones ubicadas sin categoría propia se dice, en vez de
          inventar una columna que casi siempre valdría cero. */}
      {anyZoneHasOther(bucket) && (
        <div style={{ fontSize: 8, color: "#6b7280", marginTop: 3 }}>
          Total puede incluir otras acciones localizadas ({ZONE_OTHER_NOTE}).
        </div>
      )}
    </div>
  );
}

/**
 * Faltas RECIBIDAS, en una sola línea.
 *
 * Son eventos del RIVAL —`scopedEvents(md, true)`— espejados a nuestra
 * perspectiva. NO pertenecen al mapa propio ni a la matriz, cuyas faltas son
 * las que COMETEMOS: mezclarlas afirmaría que son acciones nuestras. Misma
 * lógica que ya usaba la versión en prosa, sin recalcular de otra forma.
 */
function FoulsAgainstLine({ matchData }: { matchData: MatchData }) {
  const espejo = mirrorTally(tallyActionZones(matchData, ZONE_PREDICATES.fouls, true));
  const porBanda = ZONE_BANDS.map((band: ZoneBand) => ({
    band,
    total: bandTotal(espejo, band),
  }));
  const total = porBanda.reduce((acc, b) => acc + b.total, 0);
  if (total === 0) return null;

  return (
    // Una sola línea: el rótulo, la aclaración y las cuatro bandas. Dos
    // líneas costaban 11 px de una página que en un partido denso no los
    // tiene.
    <div style={{ fontSize: 8, color: "#374151", marginTop: 5, lineHeight: 1.45 }}>
      <span style={{ fontWeight: 700 }}>Faltas recibidas</span>{" "}
      <span style={{ color: "#6b7280" }}>
        (las comete el rival, vistas desde nuestra perspectiva):
      </span>{" "}
      {porBanda.map((b) => `${formatBandLabel(b.band)} · ${b.total}`).join("   ")}
      {"   —   total "}
      {total}
    </div>
  );
}

function ZonesSection({ zones, matchData }: { zones: ZoneDashboard; matchData: MatchData }) {
  const bucket = primaryBucket(zones);
  // Mismo modelo compartido que usa el bloque del informe de MatchTracker.
  const shotsFromFreeKick = countShotsFromSetPiece(matchData.events || [], "free_kick", false);
  const shotsFromCorner = countShotsFromSetPiece(matchData.events || [], "corner", false);
  const isLegacy = bucket?.system === "legacy3x3";
  const hasOrigin = (bucket?.total ?? 0) > 0 || zones.corners.total > 0;
  const hasGoal = zones.goal.some((z) => z.attempts > 0) || zones.out > 0;

  // La matriz y las faltas recibidas solo se imprimen sobre el sistema nuevo.
  // En un partido histórico la perspectiva del atacante no se registró, así
  // que una fila «Zona 2 · centro» sería una precisión que el dato no permite:
  // su rejilla es de 9 celdas y conserva su propio aviso.
  const showMatrix = !isLegacy && !!bucket;

  return (
    <div>
      <div style={sectionTitleStyle}>Mapas / Zonas</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          {/* El título dice de QUIÉN es el mapa. El dashboard se construye con
              `opponent = false`, así que son siempre las acciones del equipo
              analizado — incluidas las faltas que COMETE, no las que recibe.
              Sin el nombre al lado, «Origen en pista» no permitía saberlo. */}
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
            Volumen de acciones por zona · {matchData.teamName}
          </div>
          {hasOrigin ? (
            <>
              <FutsalPitch
                mode={isLegacy ? "legacy3x3" : "zone12"}
                theme="light"
                counts={Object.fromEntries((bucket?.zones ?? []).map((z) => [z.zone, z.total]))}
                corners={{ left: zones.corners.left, right: zones.corners.right }}
                accent="#2563eb"
                compact
                maxWidth={240}
              />
              <ZoneMapLegend />
            </>
          ) : (
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Sin datos registrados.</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Destino de tiro (portería)</div>
          {hasGoal ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, maxWidth: 200 }}>
              {zones.goal.map((z) => (
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
                    {z.attempts}{z.goals > 0 ? ` (${z.goals}G)` : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Sin datos registrados.</div>
          )}
          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 4 }}>
            Fuera / desviado: {zones.out}
          </div>
        </div>
      </div>

      {/* La zona más activa va AQUÍ, pegada a los mapas: es la lectura de un
          segundo. La matriz queda debajo como respaldo, no como lo primero
          que hay que interpretar. */}
      {bucket?.mostActive && <MostActiveZone zone={bucket.mostActive} />}

      {showMatrix && <ZoneMatrix bucket={bucket!} teamName={matchData.teamName} />}

      {/* NO depende de `bucket`: son eventos del RIVAL. Un partido en el que
          solo el rival tiene acciones ubicadas deja `bucket` a null y seguiría
          teniendo faltas recibidas que contar — misma condición que tenía la
          versión en prosa. */}
      {!isLegacy && <FoulsAgainstLine matchData={matchData} />}

      {describeCorners(zones.corners) && (
        <div style={{ fontSize: 10, color: "#374151", marginTop: 4, fontWeight: 700 }}>
          {describeCorners(zones.corners)}
        </div>
      )}

      {/* El desglose completo de balón parado vive en su propio bloque, el
          MISMO que usa el informe de MatchTracker (SetPieceSummaryBoard).
          Aquí solo queda la lectura rápida de ejecución del córner, que
          acompaña al lado. */}
      {describeSetPieceOutcomes(zones.setPieces.corners) && (
        <div style={{ fontSize: 9, color: "#374151", marginTop: 4, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700 }}>Córners · ejecución</div>
          <div>{describeSetPieceOutcomes(zones.setPieces.corners)}</div>
        </div>
      )}

      {/* Tiros que el PROPIO tiro declara procedentes de balón parado. No son
          las faltas cometidas: esas son infracciones y se cuentan arriba. */}
      {shotsFromFreeKick + shotsFromCorner > 0 && (
        <div style={{ fontSize: 9, color: "#374151", marginTop: 4, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700 }}>Tiros procedentes de balón parado</div>
          <div>
            Desde falta {shotsFromFreeKick} · desde córner {shotsFromCorner}
          </div>
          <div style={{ fontSize: 8, color: "#6b7280" }}>
            Distinto de los tiros directos de córner, que cuentan córners ejecutados hacia
            portería. Registros independientes.
          </div>
        </div>
      )}

      {zones.ruleDetermined > 0 && (
        <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
          {zones.ruleDetermined} lanzamiento(s) desde el punto de penalti.
        </div>
      )}

      {zones.unlocated > 0 && (
        <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
          {zones.unlocated} acción(es) sin ubicación registrada.
        </div>
      )}

      {isLegacy && (
        <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 4 }}>{LEGACY_DISCLAIMER}</div>
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
              {["#", "Jugador", "Rol", "TOT", "ROT", "Rot.", "G", "Tiros", "A port.", "Fuera", "Bloq.", "Rec.", "Pér+Err", "F", "🟨", "🟥"].map((h) => (
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
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.shotsOnTarget}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.shotsOffTarget}</td>
                <td style={{ borderBottom: "1px solid #e5e7eb", padding: 5 }}>{p.shotsBlocked}</td>
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


/**
 * Situaciones especiales y secuencia de goles.
 *
 * Dos lecturas que el informe no daba y que el cuerpo técnico pedía: qué se
 * hizo mientras se jugaba con ventaja o en desventaja, y cuánto tardó cada
 * equipo en responder a un gol.
 *
 * Ninguna se estima. Una ventana sin cierre declarado dice «duración no
 * disponible», y un gol cuya procedencia nadie registró dice «No registrado».
 */
function SpecialContextsSection({ report }: { report: MatchReport }) {
  if (report.matchContextGroups.length === 0 && report.goalSequence.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {report.matchContextGroups.length > 0 && (
        <div>
          <div style={sectionTitleStyle}>Situaciones especiales</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {report.matchContextGroups.map((g) => (
              <div key={g.type} style={{ ...cardStyle, padding: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>
                  {g.label}
                  {g.windows.length > 1 ? ` · ${g.windows.length} tramos` : ""}
                </div>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>
                  Duración:{" "}
                  {g.totalDuration !== null
                    ? fmtDuration(g.totalDuration)
                    : UNKNOWN_DURATION_LABEL}
                </div>
                <div style={{ fontSize: 11 }}>
                  Tiros {g.tally.shots} · a portería {g.tally.onTarget} · fuera{" "}
                  {g.tally.offTarget} · bloqueados {g.tally.blocked} · goles {g.tally.goals}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  Recuperaciones {g.tally.recoveries} · pérdidas {g.tally.turnovers} · faltas{" "}
                  {g.tally.fouls} · córners {g.tally.corners}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.goalSequence.length > 0 && (
        <div>
          <div style={sectionTitleStyle}>Secuencia de goles</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {report.goalSequence.map((g) => (
              <div key={g.eventId} style={{ fontSize: 11, display: "flex", gap: 8 }}>
                <span style={{ color: "#6b7280", minWidth: 42 }}>{g.matchTimeLabel}</span>
                <span style={{ fontWeight: 700, minWidth: 30 }}>
                  {g.scoreAfter.team}-{g.scoreAfter.opponent}
                </span>
                <span>
                  {g.playerName ??
                    (g.scoringTeam === "team" ? report.teamName : report.opponentName)}
                  {" · "}
                  {g.sourceLabel}
                  {g.secondsSinceOpponentPreviousGoal !== null
                    ? ` · ${g.scoringTeam === "opponent" ? "respuesta rival" : "respuesta propia"} ${g.secondsSinceOpponentPreviousGoal} s`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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

// ── PLANTILLA: INFORME COMPLETO ──────────────────────────────────────
// ── Tactical Pro: divide en bloques/páginas en vez de escalar o truncar ──
// Reparte por PÁRRAFOS (nunca corta una palabra) hasta un presupuesto de
// caracteres razonable por página A4 a este tamaño de fuente. A
// diferencia de la primera versión, un párrafo que por sí solo SUPERE el
// presupuesto YA NO se deja entero: se subdivide también por frases/
// palabras (splitLongTextIntoChunks) para garantizar que ningún nodo
// capturado por toJpeg crezca de forma significativa por encima de la
// altura A4 definida por pageStyle — evita que capturePagesToPdf tenga
// que comprimir una captura más alta que A4 en una sola página,
// dejándola ilegible. El texto nunca se trunca: todo el contenido acaba
// repartido en tantas páginas como haga falta.
const TACTICAL_PRO_CHARS_PER_PAGE = 3200;

/**
 * Divide un texto largo (una unidad que por sí sola excede maxChars) en
 * fragmentos más pequeños, respetando límites de PALABRA/FRASE — nunca
 * corta una palabra a mitad. Primero intenta dividir por frases
 * (terminadas en . ! ? :); si una sola frase sigue excediendo maxChars
 * (caso extremo), se divide por palabras como último recurso.
 */
function splitLongTextIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const sentences = text.match(/[^.!?:]+[.!?:]+(?:\s+|$)|[^.!?:]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  const flushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      // La propia frase es demasiado larga (caso extremo): se divide por
      // palabras, nunca a mitad de una.
      flushCurrent();
      const words = sentence.split(/\s+/).filter(Boolean);
      let wordChunk = "";
      for (const word of words) {
        if (wordChunk.length + word.length + 1 > maxChars) {
          if (wordChunk) chunks.push(wordChunk.trim());
          wordChunk = word;
        } else {
          wordChunk = wordChunk ? `${wordChunk} ${word}` : word;
        }
      }
      if (wordChunk.trim()) chunks.push(wordChunk.trim());
      continue;
    }
    if (current.length + sentence.length > maxChars) {
      flushCurrent();
    }
    current += sentence;
  }
  flushCurrent();
  return chunks;
}

export function splitTacticalProIntoPages(markdown: string, maxCharsPerPage = TACTICAL_PRO_CHARS_PER_PAGE): string[] {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];

  // Cualquier párrafo que por sí solo exceda el presupuesto se expande en
  // varios bloques más pequeños ANTES de empaquetar páginas — garantiza
  // que ninguna unidad individual supere maxCharsPerPage.
  const units = paragraphs.flatMap((p) =>
    p.length > maxCharsPerPage ? splitLongTextIntoChunks(p, maxCharsPerPage) : [p],
  );

  const pages: string[] = [];
  let current: string[] = [];
  let currentLen = 0;
  for (const unit of units) {
    if (currentLen > 0 && currentLen + unit.length + 2 > maxCharsPerPage) {
      pages.push(current.join("\n\n"));
      current = [];
      currentLen = 0;
    }
    current.push(unit);
    currentLen += unit.length + 2;
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
        <ZonesSection zones={zones} matchData={matchData} />
      </>
    ),
  });

  // ── EVOLUCIÓN POR PERIODOS ────────────────────────────────────────
  //
  // Página propia, DESPUÉS de la portada y sin tocarla: la de PR #22 va con
  // 4 px libres en un partido denso y no admite ni una línea más.
  //
  // No se dibuja en un partido histórico de 9 celdas —su perspectiva no se
  // registró— ni en uno sin ninguna de las tres acciones ubicadas, porque
  // seis pistas vacías no informan de nada.
  if (hasPeriodZoneData(matchData)) {
    pages.push({
      key: "periods",
      content: (
        <>
          <ReportHeader matchData={matchData} report={report} />
          <div style={sectionTitleStyle}>
            Evolución por periodos · {matchData.teamName}
          </div>
          <PeriodZoneMapsBoard matchData={matchData} />
        </>
      ),
    });
  }

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
    // ¿Es este el único portero relevante de SU equipo? (mismo isOpponent)
    // Sin ambigüedad posible → se permite el fallback legacy en el mapa de origen.
    const isOnlyRelevantGoalkeeper =
      goalkeepers.filter((g) => g.isOpponent === gk.isOpponent).length <= 1;
    pages.push({
      key: `gk-${gk.id}`,
      content: (
        <>
          <ReportHeader matchData={matchData} report={report} />
          <div style={sectionTitleStyle}>Portero</div>
          <GoalkeeperCard gk={gk} allEvents={matchData.events} isOnlyRelevantGoalkeeper={isOnlyRelevantGoalkeeper} />
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

  if (report.matchContextGroups.length > 0 || report.goalSequence.length > 0) {
    pages.push({
      key: "contexts",
      content: (
        <>
          <ReportHeader matchData={matchData} report={report} />
          <SpecialContextsSection report={report} />
        </>
      ),
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
    // ¿Es este el único portero relevante de SU equipo? (mismo isOpponent)
    // Sin ambigüedad posible → se permite el fallback legacy en el mapa de origen.
    const isOnlyRelevantGoalkeeper =
      goalkeepers.filter((g) => g.isOpponent === gk.isOpponent).length <= 1;
    pages.push({
      key: `gk-${gk.id}`,
      content: (
        <>
          <ReportHeader matchData={matchData} report={report} />
          <div style={sectionTitleStyle}>Informe de porteros</div>
          <GoalkeeperCard gk={gk} allEvents={matchData.events} isOnlyRelevantGoalkeeper={isOnlyRelevantGoalkeeper} />
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

/**
 * Captura los nodos dados y los ensambla en un PDF A4. Exportada para que el
 * botón "Porteros + Mapa" de MatchTracker use ESTA captura y no una copia
 * paralela: había dos, y solo una recibía las correcciones.
 */
export async function capturePagesToPdf(nodes: HTMLDivElement[]): Promise<jsPDF> {
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
