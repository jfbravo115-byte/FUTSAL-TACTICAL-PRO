import { MatchData, Period } from "../types/futsal";
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

export function buildActionsCsv(matchData: MatchData): string {
  const header = ["fecha", "periodo", "tiempo", "equipo", "jugador", "tipo_accion", "resultado", "x", "y", "zona", "destino"];
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
        md.result ?? md.outcome ?? md.subType ?? "",
        md.x ?? md.originX ?? "",
        md.y ?? md.originY ?? "",
        e.originGrid || md.zone || "",
        e.destinationGrid || "",
      ].map(csvCell).join(",");
    });
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
    <tr><td>${p.number}</td><td>${esc(p.name)}</td><td>${p.totLabel}</td><td>${p.rotLabel || "—"}</td><td>${p.rotationsCount}</td><td>${p.goals}</td><td>${p.shots}</td><td>${p.steals + p.interceptions}</td><td>${p.losses}</td></tr>`).join("");
  const zones = report.zoneDistribution.length
    ? report.zoneDistribution.map((z) => `<span class="pill">${esc(z.zone)}: ${z.count}</span>`).join("")
    : "<span>Sin acciones con zona registrada.</span>";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe ${esc(matchData.teamName)} - ${esc(matchData.opponentName)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;color:#111827}h1,h2{margin:0 0 10px}h2{margin-top:22px;font-size:18px}.score{font-size:34px;font-weight:900}.muted{color:#6b7280}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}.card{border:1px solid #d1d5db;border-radius:10px;padding:10px}.card b{font-size:22px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #e5e7eb;padding:7px;text-align:left}.pill{display:inline-block;padding:5px 8px;border:1px solid #d1d5db;border-radius:999px;margin:3px;font-size:12px}@media print{body{margin:12mm}.no-print{display:none!important}@page{size:auto;margin:10mm}}
</style></head><body>
<h1>${esc(matchData.teamName)} vs ${esc(matchData.opponentName)}</h1><div class="score">${report.score.team} - ${report.score.opponent}</div><div class="muted">${esc(report.periodLabel)} · ${esc(report.matchClockLabel)} · ${esc(matchData.timestamp || "")}</div>
<div class="grid"><div class="card">Tiros<br><b>${report.teamTotals.shots}</b></div><div class="card">Recuperaciones<br><b>${report.teamTotals.steals + report.teamTotals.interceptions}</b></div><div class="card">Pérdidas<br><b>${report.teamTotals.losses}</b></div><div class="card">Rotaciones<br><b>${report.rotationSummary.totalRotationsCount}</b></div></div>
<h2>Tiempos de jugadores</h2><table><thead><tr><th>#</th><th>Jugador</th><th>TOT</th><th>ROT</th><th>Rot.</th><th>G</th><th>T</th><th>Rec.</th><th>Pér.</th></tr></thead><tbody>${players}</tbody></table>
<h2>Zonas</h2><div>${zones}</div>
<h2>Resumen</h2><p>Goles ${report.teamTotals.goals} · Tiros ${report.teamTotals.shots} · Recuperaciones ${report.teamTotals.steals + report.teamTotals.interceptions} · Pérdidas ${report.teamTotals.losses} · Faltas ${report.teamTotals.fouls}.</p>
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

export function printMatchReport(matchData: MatchData): void {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    throw new Error("El navegador ha bloqueado la ventana de impresión");
  }
  win.document.open();
  win.document.write(buildPrintableReportHtml(matchData));
  win.document.close();
}
