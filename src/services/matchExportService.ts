import { formatJerseyNumber } from "../utils/jerseyNumber";
import { MatchData, Period, ActionType } from "../types/futsal";
import { formatAnyZoneLabel } from "../utils/legacyZoneMap";
import { formatDestinationLabel } from "../utils/goalZones";
import { EXIT_OUTCOME_LABEL, formatDeclaredResponse, isExitOutcome } from "../utils/goalkeeperActions";
import { formatGoalkeeperZone } from "../utils/goalkeeperZones";
import { formatSetPieceOrigin, formatSetPieceOutcome, formatShotOriginLabel } from "../utils/setPieceModel";
import { formatMatchTime } from "../utils/goalSequence";
import {
  UNKNOWN_DURATION_LABEL,
  concededGoalsNote,
  concededLabel,
  productionLabel,
} from "../utils/matchContexts";
import { formatEventTypeLabel } from "../utils/eventLabels";
import { isCornerSide, formatCornerSideLabel, cornerSideFromGrid } from "../utils/cornerModel";
import { phaseCsvLabel } from "../utils/phaseModel";
import { beneficiarySide, isGoalEvent } from "../utils/goalModel";
import { eventActor } from "../utils/eventActor";
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
  // "fase" se añade AL FINAL para no mover ninguna columna existente: una
  // hoja o un script que leyera por posición sigue funcionando igual.
  const header = ["fecha", "periodo", "tiempo", "equipo", "jugador", "tipo_accion", "accion_texto", "resultado", "x", "y", "zona", "zona_texto", "destino", "destino_texto", "zona_portero", "respuesta_portero", "resultado_salida", "lado_corner", "desenlace_balon_parado", "accion_desde", "fase", "gol_para"];
  const rows = matchData.events
    .slice()
    .sort((a, b) => a.wallClock - b.wallClock)
    .map((e) => {
      // El AUTOR, no el primero de `playerIds`: un tiro o un gol llevan
      // también al portero que lo encara, y quedarse con el primero exportaba
      // el gol del rival a nombre de nuestro portero. Ver utils/eventActor.
      const player = eventActor(e, matchData.players);
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
        // Un penalti dice «Punto de penalti», no «sin ubicación registrada».
        formatShotOriginLabel(e),
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
        // Fase de NUESTRO equipo al registrar la acción, también en un evento
        // del rival. Vacío = no registrada, igual que el resto de columnas
        // opcionales: escribir «No registrada» convertiría la ausencia en un
        // valor y la haría indistinguible de un dato.
        phaseCsvLabel(e.phaseOfPlay),
        // Equipo que SUBE AL MARCADOR con este gol. En un gol normal es el
        // mismo que la columna `equipo`; en un gol en propia es el contrario,
        // y sin esta columna la exportación no conservaría el beneficiario.
        // Vacío en todo lo que no sea gol: no hay nada que decir.
        isGoalEvent(e)
          ? beneficiarySide(e) === "team"
            ? matchData.teamName
            : matchData.opponentName
          : "",
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
    // El dorsal se escribe como se lee en pantalla: `?` mientras no se
    // conozca. La columna es para leerla, no para calcular con ella.
    formatJerseyNumber(p),
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

/**
 * Leer un respaldo JSON y devolver el partido.
 *
 * `buildMatchJson` escribe el `MatchData` tal cual, así que `tacticalAnalysis`
 * viaja SIEMPRE que el objeto lo traiga —el respaldo nunca lo ha filtrado—. Lo
 * que se perdía estaba antes: el análisis no llegaba a estar en el partido.
 * Ver `MatchAnalysis`, donde ahora se guarda en memoria aunque no exista copia
 * local ni se pueda escribir en remoto.
 *
 * COMPATIBILIDAD. Esta función acepta las tres formas que puede tener un
 * archivo guardado por alguna versión de la aplicación:
 *
 *   1. `MatchData` en la raíz — lo que escribe `buildMatchJson`, con o sin
 *      `id` y con o sin `tacticalAnalysis`.
 *   2. `{ version, matchData, … }` — la envoltura de la copia local.
 *   3. `{ data: { … } }` — la fila remota tal como la devuelve el backend.
 *
 * Lo que NO hace es rellenar huecos. Un respaldo antiguo sin
 * `tacticalAnalysis`, sin `timestamp` o sin `teamDefendsAtKickoff` se devuelve
 * sin esos campos: inventarlos convertiría una ausencia en un dato y el
 * dossier acabaría afirmando algo que nadie registró.
 */
export function parseMatchJson(text: string): MatchData {
  let crudo: unknown;
  try {
    crudo = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es un JSON válido");
  }
  const envoltura = crudo as Record<string, unknown> | null;
  const cuerpo =
    envoltura && typeof envoltura === "object"
      ? ((envoltura.matchData as Record<string, unknown> | undefined) ??
        (envoltura.data as Record<string, unknown> | undefined) ??
        envoltura)
      : null;
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    throw new Error("El archivo no contiene un partido");
  }
  const faltan = (
    [
      ["teamName", "string"],
      ["opponentName", "string"],
      ["players", "array"],
      ["events", "array"],
    ] as const
  ).filter(([clave, tipo]) =>
    tipo === "array" ? !Array.isArray(cuerpo[clave]) : typeof cuerpo[clave] !== tipo,
  );
  if (faltan.length) {
    throw new Error(`El respaldo no trae ${faltan.map(([c]) => c).join(", ")}`);
  }
  // El `id` es de la fila guardada, no del partido: no se arrastra a un
  // objeto que puede acabar exportándose o guardándose en otro sitio.
  const { id: _id, ...partido } = cuerpo as Record<string, unknown>;
  return partido as unknown as MatchData;
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function buildPrintableReportHtml(matchData: MatchData): string {
  const report = generateMatchReport(matchData);
  const players = report.playersUsed.map((p) => `
    <tr><td>${formatJerseyNumber(p)}</td><td>${esc(p.name)}</td><td>${p.totLabel}</td><td>${p.rotLabel || "—"}</td><td>${p.rotationsCount}</td><td>${p.goals}</td><td>${p.attempts}</td><td>${p.steals + p.interceptions}</td><td>${p.losses + p.errors}</td></tr>`).join("");
  const zones = report.zoneDistribution.length
    ? report.zoneDistribution.map((z) => `<span class="pill">${esc(z.label)}: ${z.count}</span>`).join("")
    : "<span>Sin acciones con zona registrada.</span>";
  // Situaciones especiales y secuencia de goles: los mismos bloques
  // deterministas que imprime el informe, sin recalcular nada.
  const contextos = report.matchContextGroups.length
    ? report.matchContextGroups
        .map((g) => {
          const nombres = { teamName: report.teamName, opponentName: report.opponentName };
          // Un bloque por bando. Sumarlos diría que marcó quien encajó.
          const lado = (rotulo: string, t: typeof g.production) =>
            `<div><b style="font-size:11px">${esc(rotulo)}</b>` +
            `<div>Tiros ${t.shots} · a portería ${t.onTarget} · fuera ${t.offTarget} · bloqueados ${t.blocked} · goles ${t.goalsBenefiting}</div>` +
            `<div class="muted">Recuperaciones ${t.recoveries} · pérdidas ${t.turnovers} · faltas ${t.fouls} · córners ${t.corners}</div></div>`;
          return `<div class="card"><b style="font-size:13px">${esc(g.label)}</b>` +
            `<div class="muted">Duración: ${g.totalDuration !== null ? formatMatchTime(g.totalDuration) : UNKNOWN_DURATION_LABEL}</div>` +
            lado(productionLabel(g, nombres), g.production) +
            lado(concededLabel(g, nombres), g.conceded) +
            `<div><b>${esc(concededGoalsNote(g, nombres))}</b></div></div>`;
        })
        .join("")
    : "";
  const goles = report.goalSequence.length
    ? report.goalSequence
        .map((g) => {
          const quien = g.playerName ?? (g.scoringTeam === "team" ? report.teamName : report.opponentName);
          const respuesta =
            g.secondsSinceOpponentPreviousGoal !== null
              ? ` · ${g.scoringTeam === "opponent" ? "respuesta rival" : "respuesta propia"} ${g.secondsSinceOpponentPreviousGoal} s`
              : "";
          return `<tr><td>${esc(g.matchTimeLabel)}</td><td>${g.scoreAfter.team}-${g.scoreAfter.opponent}</td>` +
            `<td>${esc(quien)}</td><td>${esc(g.sourceLabel)}</td><td class="muted">${esc(respuesta)}</td></tr>`;
        })
        .join("")
    : "";
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
${contextos ? `<h2>Situaciones especiales</h2><div class="grid" style="grid-template-columns:repeat(2,1fr)">${contextos}</div>` : ""}
${goles ? `<h2>Secuencia de goles</h2><table><thead><tr><th>Tiempo</th><th>Marcador</th><th>Quién</th><th>Procedencia</th><th></th></tr></thead><tbody>${goles}</tbody></table>` : ""}
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
