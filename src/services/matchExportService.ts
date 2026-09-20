import { MatchData, Period, ActionType } from "../types/futsal";
import { formatAnyZoneLabel } from "../utils/legacyZoneMap";
import { formatDestinationLabel } from "../utils/goalZones";
import { EXIT_OUTCOME_LABEL, formatDeclaredResponse, isExitOutcome } from "../utils/goalkeeperActions";
import { formatGoalkeeperZone } from "../utils/goalkeeperZones";
import { formatSetPieceOrigin, formatSetPieceOutcome } from "../utils/setPieceModel";
import { formatEventTypeLabel } from "../utils/eventLabels";
import { isCornerSide, formatCornerSideLabel, cornerSideFromGrid } from "../utils/cornerModel";
import { generateMatchReport } from "./matchReportService";

const PERIOD_LABEL: Record<number, string> = {
  [Period.FIRST]: "1P",
  [Period.SECOND]: "2P",
  [Period.OVERTIME_1]: "PR1",
  [Period.OVERTIME_2]: "PR2",
  [Period.FINISHED]: "FIN",
};

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function timeLabel(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60).toString().padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;
}

/** Lado del córner, ya traducido. Cae al sector solo si falta el metadata. */
function cornerSideLabel(e: { metadata?: Record<string, any>; originGrid?: string; type: string }): string {
  if (e.type !== ActionType.CORNER) return "";
  const side = isCornerSide(e.metadata?.cornerSide)
    ? e.metadata!.cornerSide
    : cornerSideFromGrid(e.originGrid);
  return side ? formatCornerSideLabel(side) : "";
}

export function buildActionsCsv(matchData: MatchData): string {
  // "zona" y "destino" conservan el identificador interno para poder cruzar
  // datos; "zona_texto" y "destino_texto" son los legibles.
  const header = ["fecha", "periodo", "tiempo", "equipo", "jugador", "tipo_accion", "accion_texto", "resultado", "x", "y", "zona", "zona_texto", "destino", "destino_texto", "zona_portero", "respuesta_portero", "resultado_salida", "lado_corner", "desenlace_balon_parado", "accion_desde"];
  const rows = matchData.events
    .slice()
    .sort((a, b) => a.wallClock - b.wallClock)
    .map((e) => {
      const player = matchData.players.find((p) => e.playerIds.includes(p.id));
      const md = e.metadata || {};
      return [
        matchData.timestamp || new Date(e.wallClock || Date.now()).toISOString(),
        PERIOD_LABEL[e.period] || String(e.period),
        timeLabel(e.timestamp),
        md.isOpponent ? matchData.opponentName : matchData.teamName,
        player?.name || "",
        e.type,
        // Etiqueta humana de la acción, con la misma fuente que el Historial:
        // "Jugada de falta" en vez de SET_PIECE. La columna técnica se
        // conserva al lado para poder cruzar datos.
        formatEventTypeLabel(e).replace(/^[^\p{L}]+/u, ""),
        md.result ?? md.outcome ?? md.subType ?? "",
        md.x ?? md.originX ?? "",
        md.y ?? md.originY ?? "",
        e.originGrid || md.zone || "",
        formatAnyZoneLabel(e.originGrid),
        e.destinationGrid || "",
        formatDestinationLabel(e.destinationGrid ?? md.zone),
        // goalkeeperZone es un campo PROPIO (GK1-GK5): nunca se mezcla con la
        // zona de origen ni se cuenta como tal. Se exporta ya traducido.
        formatGoalkeeperZone(e.goalkeeperZone) ?? "",
        // Ya traducida: el CSV nunca contiene UNSPECIFIED ni SAVE_DEFLECT.
        formatDeclaredResponse(e),
        isExitOutcome(md.exitOutcome) ? EXIT_OUTCOME_LABEL[md.exitOutcome] : "",
        // Balón parado. Las tres columnas son independientes entre sí:
        //   lado_corner            esquina del córner
        //   desenlace_balon_parado cómo se ejecutó ese córner / esa falta
        //   accion_desde           de dónde procede ESTE tiro
        // Vacío significa "no registrado": nunca se rellena por defecto.
        cornerSideLabel(e),
        formatSetPieceOutcome(e) ?? "",
        formatSetPieceOrigin(e) ?? "",
      ].map(csvCell).join(",");
    });
  return "\uFEFF" + [header.map(csvCell).join(","), ...rows].join("\n");
}

export function buildPlayersCsv(matchData: MatchData): string {
  const report = generateMatchReport(matchData);
  const header = [
    "dorsal",
    "jugador",
    "rol",
    "tot",
    "tot_segundos",
    "rot_actual",
    "rotaciones",
    "goles",
    "tiros_totales",
    "tiros_porteria",
    "tiros_fuera",
    "tiros_bloqueados",
    "recuperaciones",
    "perdidas_errores",
    "faltas",
    "amarillas",
    "rojas",
  ];
  const rows = report.playersUsed.map((p) => [
    p.number,
    p.name,
    p.role,
    p.totLabel,
    p.totSeconds,
    p.rotLabel ?? "",
    p.rotationsCount,
    p.goals,
    p.attempts,
    p.shotsOnTarget,
    p.shotsOffTarget,
    p.shotsBlocked,
    p.steals + p.interceptions,
    p.losses + p.errors,
    p.fouls,
    p.yellowCards,
    p.redCards,
  ].map(csvCell).join(","));
  return "\uFEFF" + [header.map(csvCell).join(","), ...rows].join("\n");
}

export function buildMatchJson(matchData: MatchData): string {
  return JSON.stringify(matchData, null, 2);
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function buildPrintableReportHtml(matchData: MatchData): string {
  const report = generateMatchReport(matchData);
  const players = report.playersUsed.map((p) => `
    <tr><td>${p.number}</td><td>${esc(p.name)}</td><td>${p.totLabel}</td><td>${p.rotLabel || "—"}</td><td>${p.rotationsCount}</td><td>${p.goals}</td><td>${p.attempts}</td><td>${p.steals + p.interceptions}</td><td>${p.losses + p.errors}</td></tr>`).join("");
  const zones = report.zoneDistribution.length
    ? report.zoneDistribution.map((z) => `<span class="pill">${esc(z.label)}: ${z.count}</span>`).join("")
    : "<span>Sin acciones con zona registrada.</span>";
  const conversion = report.teamTotals.goalConversionPct === null ? "—" : `${report.teamTotals.goalConversionPct}%`;
  const accuracy = report.teamTotals.shotAccuracyPct === null ? "—" : `${report.teamTotals.shotAccuracyPct}%`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe ${esc(matchData.teamName)} - ${esc(matchData.opponentName)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;color:#111827}h1,h2{margin:0 0 10px}h2{margin-top:22px;font-size:18px}.score{font-size:34px;font-weight:900}.muted{color:#6b7280}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}.card{border:1px solid #d1d5db;border-radius:10px;padding:10px}.card b{font-size:22px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #e5e7eb;padding:7px;text-align:left}.pill{display:inline-block;padding:5px 8px;border:1px solid #d1d5db;border-radius:999px;margin:3px;font-size:12px}.balance{font-weight:800}@media print{body{margin:12mm}.no-print{display:none!important}@page{size:auto;margin:10mm}}
</style></head><body>
<h1>${esc(matchData.teamName)} vs ${esc(matchData.opponentName)}</h1><div class="score">${report.score.team} - ${report.score.opponent}</div><div class="muted">${esc(report.periodLabel)} · ${esc(report.matchClockLabel)} · ${esc(matchData.timestamp || "")}</div>
<div class="grid"><div class="card">Tiros<br><b>${report.teamTotals.shots}</b></div><div class="card">Conversión<br><b>${conversion}</b></div><div class="card">Recuperaciones<br><b>${report.teamTotals.recoveries}</b></div><div class="card">Balance Rec-(P+E)<br><b>${report.teamTotals.recoveryLossBalance >= 0 ? "+" : ""}${report.teamTotals.recoveryLossBalance}</b></div></div>
<p class="muted">A portería ${report.teamTotals.shotsOnTarget} · fuera ${report.teamTotals.shotsOffTarget} · destino no registrado ${report.teamTotals.shotsUnknownTarget} · precisión registrada ${accuracy} · pérdidas + errores ${report.teamTotals.lossesAndErrors}.</p>
<h2>Tiempos y rendimiento de jugadores</h2><table><thead><tr><th>#</th><th>Jugador</th><th>TOT</th><th>ROT</th><th>Rot.</th><th>G</th><th>Tiros</th><th>Rec.</th><th>Pér+Err</th></tr></thead><tbody>${players}</tbody></table>
<h2>Zonas de origen</h2><div>${zones}</div>
<h2>Resumen</h2><p>Goles ${report.teamTotals.goals} · tiros ${report.teamTotals.shots} · recuperaciones ${report.teamTotals.recoveries} · pérdidas + errores ${report.teamTotals.lossesAndErrors} · faltas ${report.teamTotals.fouls}.</p>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));</script></body></html>`;
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9áéíóúüñ_-]+/gi, "_").replace(/^_+|_+$/g, "") || "partido";
}

export function downloadTextFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadMatchJson(matchData: MatchData): void {
  downloadTextFile(buildMatchJson(matchData), `partido_${safeName(matchData.teamName)}_${Date.now()}.json`, "application/json;charset=utf-8");
}

export function downloadActionsCsv(matchData: MatchData): void {
  downloadTextFile(buildActionsCsv(matchData), `acciones_${safeName(matchData.teamName)}_${Date.now()}.csv`, "text/csv;charset=utf-8");
}

export function downloadPlayersCsv(matchData: MatchData): void {
  downloadTextFile(buildPlayersCsv(matchData), `jugadores_${safeName(matchData.teamName)}_${Date.now()}.csv`, "text/csv;charset=utf-8");
}

export function printMatchReport(matchData: MatchData): void {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    throw new Error("El navegador ha bloqueado la ventana de impresión");
  }
  win.document.open();
  win.document.write(buildPrintableReportHtml(matchData));
  win.document.close();
}
