import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Markdown from "react-markdown";
import {
  ArrowLeft,
  BarChart3,
  Cpu,
  Download,
  FileText,
  Layers,
  Loader2,
  RefreshCw,
  Target,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { ActionType, MatchData, Period, SavedMatch, Role } from "../types/futsal";
import { getPartido } from "../services/partidosService";
import {
  getFinalLocalCopy,
  updateFinalLocalCopyMatchData,
} from "../services/matchSnapshotService";
import { generateMatchReport, formatMatchReportAsMarkdown } from "../services/matchReportService";
import {
  buildZoneDashboard,
  mirrorTally,
  primaryBucket,
  tallyActionZones,
  ZONE_PREDICATES,
  ZoneMetric,
  zoneMetricValue,
} from "../services/matchZonesService";
import { FutsalPitch } from "../components/field/FutsalPitch";
import { PeriodShotMapsBoard, periodLabel } from "../components/export/PeriodShotMaps";
import { PhaseMetricRow } from "../components/export/PhaseZoneMaps";
import {
  PHASE_METRICS,
  PhaseMetricKey,
  hasPhaseData,
  phaseCoverage,
  phaseMetric,
  phasePeriods,
} from "../utils/phaseAnalysis";
import { summarizePlayerShots } from "../utils/shotModel";
import { ACTION_NOUN, describeAllBands, describeTopZone } from "../utils/fieldZones";
import { describeCorners } from "../utils/cornerModel";
import { describeSetPieceOutcomes } from "../utils/setPieceModel";
import { streamTacticalReport } from "../services/tacticalAnalysisService";
import { SimpleExportModal } from "../components/SimpleExportModal";

function fmtSeconds(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

const METRIC_LABEL: Record<ZoneMetric, string> = {
  all: "Todas",
  shots: "Tiros",
  recoveries: "Recuper.",
  losses: "Pérdidas",
  fouls: "Faltas",
  corners: "Córners",
};

/** Sustantivo con el que se redacta la lectura textual de cada métrica. */
const METRIC_NOUN: Record<Exclude<ZoneMetric, "all">, ActionType> = {
  shots: ActionType.SHOT,
  recoveries: ActionType.STEAL,
  losses: ActionType.LOSS,
  fouls: ActionType.FOUL,
  corners: ActionType.CORNER,
};

export default function MatchAnalysis() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [match, setMatch] = useState<SavedMatch | null>(null);
  /** Copia local de ESTE partido, la única a la que se escribe el análisis. */
  const [localCopyId, setLocalCopyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ai, setAi] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // El informe llegó a medias: se enseña, se marca y no se da por bueno.
  const [aiPartial, setAiPartial] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [zoneOpponent, setZoneOpponent] = useState(false);
  const [zoneMetric, setZoneMetric] = useState<ZoneMetric>("all");
  // FASES DE JUEGO. Dos selectores independientes: la métrica decide QUÉ par
  // de fases se contrasta y de quién son las acciones; el periodo acota el
  // conjunto. Nunca hay más de dos mapas en pantalla.
  const [phaseKey, setPhaseKey] = useState<PhaseMetricKey>("losses");
  const [phasePeriod, setPhasePeriod] = useState<Period | undefined>(undefined);

  const summaryRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<HTMLDivElement>(null);
  const phasesRef = useRef<HTMLDivElement>(null);
  const timesRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const decoded = decodeURIComponent(matchId);
        const local = getFinalLocalCopy(decoded);
        // Id de la copia local de ESTE partido, o null si se abrió desde el
        // historial remoto. Es la única a la que se le puede escribir el
        // análisis: guardar en cualquier otra lo asociaría al partido
        // equivocado.
        setLocalCopyId(local ? local.id : null);
        let data: SavedMatch | null = local ? { ...local.matchData, id: local.id } : null;
        if (!data) {
          try {
            data = await getPartido(decoded);
          } catch (remoteErr) {
            console.warn("No se pudo leer el partido remoto:", remoteErr);
          }
        }
        if (!alive) return;
        if (!data) {
          setLoadError("No se encontró el partido en este dispositivo ni en el historial remoto.");
        } else {
          setMatch(data);
          setAi(data.tacticalAnalysis || "");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [matchId]);

  useEffect(() => {
    if (!match) return;
    const section = searchParams.get("section");
    const el = section === "data"
      ? dataRef.current
      : section === "times"
        ? timesRef.current
        : section === "report"
          ? reportRef.current
          : section === "ai"
            ? aiRef.current
            : summaryRef.current;
    if (el && section) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [match, searchParams]);

  const report = useMemo(() => match ? generateMatchReport(match) : null, [match]);
  const reportMarkdown = useMemo(() => report ? formatMatchReportAsMarkdown(report) : "", [report]);
  const zones = useMemo(
    () => match ? buildZoneDashboard(match, zoneOpponent) : null,
    [match, zoneOpponent],
  );

  // Mismo servicio y mismo protocolo que MatchTracker.
  // Salir de la pantalla corta la generación en curso.
  useEffect(() => () => aiAbortRef.current?.abort(), []);

  const runAI = async () => {
    if (!match) return;
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiLoading(true);
    setAiError(null);
    setAiPartial(false);
    setAi("");
    try {
      const result = await streamTacticalReport(match, {
        signal: controller.signal,
        onDelta: (text) => setAi((prev) => prev + text),
      });
      setAi(result);
      // Solo aquí, con el informe ENTERO, se toca el partido guardado.
      //
      // `streamTacticalReport` únicamente resuelve al recibir el fin de
      // transmisión, así que llegar a esta línea significa que el análisis
      // está completo. Un texto vacío no sustituye a uno anterior: sería
      // borrar lo bueno sin haber traído nada mejor.
      if (result.trim() && localCopyId) {
        const actualizado: MatchData = { ...match, tacticalAnalysis: result };
        updateFinalLocalCopyMatchData(localCopyId, actualizado);
        // La copia en memoria también, para que exportar desde esta misma
        // pantalla no siga usando la versión sin análisis.
        setMatch((prev) => (prev ? { ...prev, tacticalAnalysis: result } : prev));
      }
    } catch (err: any) {
      console.error(err);
      if (err?.name === "AbortError" && aiAbortRef.current !== controller) return;
      // Lo recibido se queda a la vista marcado como incompleto. NUNCA se
      // persiste: `updateFinalLocalCopyMatchData` queda fuera de esta rama a
      // propósito, igual que en MatchTracker. Cubre cancelación, tiempo de
      // espera agotado y transmisión cortada.
      setAiPartial(true);
      setAiError("TACTICAL PRO no está disponible. El informe automático sigue completo.");
    } finally {
      if (aiAbortRef.current === controller) aiAbortRef.current = null;
      setAiLoading(false);
    }
  };

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) =>
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (loading) return (
    <div className="h-screen bg-[#0A0B0E] flex items-center justify-center text-slate-300">
      <Loader2 className="animate-spin text-lime-400 mr-3" /> Cargando partido…
    </div>
  );

  if (!match || !report || !zones) return (
    <div className="h-screen bg-[#0A0B0E] flex flex-col items-center justify-center text-center p-6">
      <p className="text-red-400 font-bold">{loadError || "No se encontró el partido."}</p>
      <button onClick={() => navigate("/dashboard")} className="mt-4 text-lime-400 hover:underline">Volver al historial</button>
    </div>
  );

  const players = match.players
    .filter((p) => !p.isOpponent && p.role !== Role.COACH && p.role !== Role.DELEGATE)
    .sort((a, b) => a.number - b.number);
  // Cobertura de la métrica y el periodo que se están viendo: cambia con los
  // dos selectores, porque «49 de 54» solo significa algo sobre el conjunto
  // que el lector tiene delante.
  const phaseCoverageNow = phaseCoverage(match, phaseMetric(phaseKey), phasePeriod);
  const bucket = primaryBucket(zones);
  const bucketZones = bucket?.zones ?? [];
  const maxZoneValue = Math.max(...bucketZones.map((z) => zoneMetricValue(z, zoneMetric)), 1);

  // Lectura textual agregada. Solo tiene sentido sobre el sistema nuevo: en un
  // partido histórico la perspectiva del atacante no se registró y hablar de
  // "Zona 2 · centro" sería una precisión que el dato no permite.
  const textualMetric = zoneMetric === "all" ? null : METRIC_NOUN[zoneMetric];
  const textualTally =
    match && bucket?.system === "zone12" && textualMetric
      ? tallyActionZones(match, ZONE_PREDICATES[zoneMetric as Exclude<ZoneMetric, "all">], zoneOpponent)
      : null;
  const textualLines =
    textualTally && textualMetric ? describeAllBands(textualTally, ACTION_NOUN[textualMetric]!) : [];
  const textualTop =
    textualTally && textualMetric ? describeTopZone(textualTally, ACTION_NOUN[textualMetric]!) : null;

  // Faltas RECIBIDAS por zona: las comete el rival y se espejan a la
  // perspectiva de quien las recibe. Solo presentación.
  const foulsAgainstLines =
    match && bucket?.system === "zone12" && zoneMetric === "fouls"
      ? describeAllBands(
          mirrorTally(tallyActionZones(match, ZONE_PREDICATES.fouls, !zoneOpponent)),
          ACTION_NOUN[ActionType.FOUL]!,
        )
      : [];

  return (
    <div className="bg-[#0A0B0E] text-slate-200 font-sans overflow-y-auto allow-scroll" style={{ height: "var(--app-height, 100vh)" }}>
      <header className="border-b border-white/10 bg-[#0E1015]/95 sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate("/dashboard")} className="p-2 hover:bg-white/10 rounded-xl text-slate-400"><ArrowLeft size={20}/></button>
            <div className="min-w-0">
              <h1 className="font-black text-white truncate">{match.teamName} <span className="text-slate-500">vs</span> {match.opponentName}</h1>
              <p className="text-[10px] text-slate-500 uppercase">{match.timestamp ? new Date(match.timestamp).toLocaleString("es-ES") : ""}</p>
            </div>
          </div>
          <button onClick={() => setExportOpen(true)} className="px-3 py-2 rounded-xl bg-violet-500/15 border border-violet-500/25 text-violet-300 font-black text-[10px] uppercase flex gap-2 items-center"><Download size={14}/> Exportar</button>
        </div>
        <div className="max-w-5xl mx-auto px-4 pb-3 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {[
              ["Resumen", summaryRef, Trophy],
              ["Datos / Zonas", dataRef, BarChart3],
              ["Fases", phasesRef, Layers],
              ["Tiempos", timesRef, Timer],
              ["Informe", reportRef, FileText],
              ["Tactical Pro", aiRef, Cpu],
            ].map(([label, ref, Icon]) => {
              const IconCmp = Icon as React.ComponentType<{ size?: number }>;
              return (
                <button key={String(label)} onClick={() => scrollTo(ref as React.RefObject<HTMLDivElement | null>)} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-black text-[9px] uppercase flex items-center gap-1.5 hover:bg-white/10">
                  <IconCmp size={12}/> {String(label)}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 pb-16">
        <section ref={summaryRef} className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase font-black text-slate-500">Resultado</div>
            <div className="text-lg font-black text-white">{match.teamName} · {match.opponentName}</div>
          </div>
          <div className="text-5xl font-mono font-black text-white">{report.score.team}-{report.score.opponent}</div>
        </section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-center"><div className="text-2xl font-black text-cyan-300">{report.teamTotals.shots}</div><div className="text-[9px] uppercase font-black text-slate-500">Tiros totales</div></div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-center"><div className="text-2xl font-black text-lime-300">{report.teamTotals.goalConversionPct ?? "—"}{report.teamTotals.goalConversionPct !== null ? "%" : ""}</div><div className="text-[9px] uppercase font-black text-slate-500">Conversión</div></div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-center"><div className="text-2xl font-black text-blue-300">{report.teamTotals.recoveries}</div><div className="text-[9px] uppercase font-black text-slate-500">Recuperaciones</div></div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-center"><div className={`text-2xl font-black ${report.teamTotals.recoveryLossBalance >= 0 ? "text-emerald-300" : "text-red-300"}`}>{report.teamTotals.recoveryLossBalance >= 0 ? "+" : ""}{report.teamTotals.recoveryLossBalance}</div><div className="text-[9px] uppercase font-black text-slate-500">Balance Rec-(P+E)</div></div>
        </div>

        {(report.highlights.topTot || report.highlights.topScorer || report.highlights.topRecoverer) && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {report.highlights.topTot && <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"><div className="text-[9px] uppercase font-black text-amber-400 mb-1">Mayor TOT</div><div className="font-black text-white">#{report.highlights.topTot.number} {report.highlights.topTot.name}</div><div className="font-mono text-amber-300">{report.highlights.topTot.totLabel}</div></div>}
            {report.highlights.topScorer && <div className="rounded-2xl border border-lime-500/20 bg-lime-500/5 p-4"><div className="text-[9px] uppercase font-black text-lime-400 mb-1">Máximo goleador</div><div className="font-black text-white">#{report.highlights.topScorer.number} {report.highlights.topScorer.name}</div><div className="font-mono text-lime-300">{report.highlights.topScorer.goals} goles</div></div>}
            {report.highlights.topRecoverer && <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4"><div className="text-[9px] uppercase font-black text-blue-400 mb-1">Más recuperaciones</div><div className="font-black text-white">#{report.highlights.topRecoverer.number} {report.highlights.topRecoverer.name}</div><div className="font-mono text-blue-300">{report.highlights.topRecoverer.recoveries}</div></div>}
          </section>
        )}

        <section ref={dataRef} className="scroll-mt-28 rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h2 className="font-black text-white uppercase flex items-center gap-2"><BarChart3 size={18} className="text-cyan-400"/> Datos / Zonas</h2>
              <p className="text-[10px] text-slate-500 mt-1">Matriz lógica A1-C3 registrada en el partido. No cambia al invertir visualmente el campo.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setZoneOpponent(false)} className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase border ${!zoneOpponent ? "bg-cyan-400 text-slate-950 border-cyan-400" : "bg-white/5 text-slate-400 border-white/10"}`}>{match.teamName}</button>
              <button onClick={() => setZoneOpponent(true)} className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase border ${zoneOpponent ? "bg-red-400 text-slate-950 border-red-400" : "bg-white/5 text-slate-400 border-white/10"}`}>{match.opponentName}</button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
            <div className="rounded-xl bg-black/20 border border-white/5 p-3"><div className="text-xl font-black text-white">{zones.totals.attempts}</div><div className="text-[8px] uppercase text-slate-500 font-black">Tiros</div></div>
            <div className="rounded-xl bg-black/20 border border-white/5 p-3"><div className="text-xl font-black text-white">{zones.totals.onTarget}</div><div className="text-[8px] uppercase text-slate-500 font-black">A portería</div></div>
            <div className="rounded-xl bg-black/20 border border-white/5 p-3"><div className="text-xl font-black text-white">{zones.totals.conversionPct ?? "—"}{zones.totals.conversionPct !== null ? "%" : ""}</div><div className="text-[8px] uppercase text-slate-500 font-black">Conversión</div></div>
            <div className="rounded-xl bg-black/20 border border-white/5 p-3"><div className="text-xl font-black text-white">{zones.totals.recoveries}</div><div className="text-[8px] uppercase text-slate-500 font-black">Recuper.</div></div>
            <div className="rounded-xl bg-black/20 border border-white/5 p-3"><div className="text-xl font-black text-white">{zones.totals.losses}</div><div className="text-[8px] uppercase text-slate-500 font-black">Pérdidas</div></div>
            <div className="rounded-xl bg-black/20 border border-white/5 p-3"><div className="text-xl font-black text-white">{zones.totals.zonedActions}</div><div className="text-[8px] uppercase text-slate-500 font-black">Con zona</div></div>
          </div>

          {/* ── TIROS POR PARTE ─────────────────────────────────────
              El mapa de abajo es acumulado y responde «desde dónde se tira».
              Esta franja responde otra pregunta distinta: «qué cambió en la
              segunda parte». Se separan solo los TIROS porque es la lectura
              pedida; el resto de métricas siguen siendo del partido entero.

              Respeta el selector de equipo de la cabecera de la sección, así
              que el mismo botón sirve para ver nuestros tiros o los del
              rival. */}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 mb-4">
            <div className="text-[9px] uppercase font-black text-slate-500 mb-3">
              Tiros por parte · {zoneOpponent ? match.opponentName : match.teamName}
            </div>
            <PeriodShotMapsBoard
              events={match.events}
              opponent={zoneOpponent}
              theme="dark"
              pitchWidth={320}
              accent={zoneOpponent ? "#f87171" : "#22d3ee"}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            {(Object.keys(METRIC_LABEL) as ZoneMetric[]).map((metric) => (
              <button key={metric} onClick={() => setZoneMetric(metric)} className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase border whitespace-nowrap ${zoneMetric === metric ? "bg-white text-slate-950 border-white" : "bg-black/20 text-slate-400 border-white/10"}`}>{METRIC_LABEL[metric]}</button>
            ))}
          </div>

          <div className="grid md:grid-cols-[1fr_1fr] gap-5 items-start">
            <div>
              <div className="text-[9px] uppercase font-black text-slate-500 mb-2">Origen de acciones · {METRIC_LABEL[zoneMetric]}</div>

              <FutsalPitch
                mode={bucket?.system === "legacy3x3" ? "legacy3x3" : "zone12"}
                counts={Object.fromEntries(bucketZones.map((z) => [z.zone, zoneMetricValue(z, zoneMetric)]))}
                corners={zoneMetric === "all" || zoneMetric === "corners"
                  ? { left: zones.corners.left, right: zones.corners.right }
                  : undefined}
                accent={zoneOpponent ? "#f87171" : "#22d3ee"}
                emptyLabel="Sin acciones ubicadas"
              />

              {/* Misma semántica que el PDF. La intensidad se normaliza al
                  máximo DE ESTE partido (FutsalPitch), así que no compara
                  partidos entre sí y no mide eficacia. Y «T» ya incluye «G»:
                  sin decirlo, la línea de abajo invita a sumarlos. */}
              <div className="mt-2 text-[8px] text-slate-500 leading-relaxed max-w-md">
                <div>Número = acciones del equipo registradas con origen en esa zona.</div>
                <div>
                  Mayor intensidad = mayor volumen relativo dentro de este partido. No indica
                  eficacia.
                </div>
                <div>T = tiros (incluyen los goles) · G = goles · R = recuperaciones · P = pérdidas · F = faltas cometidas · C = córners.</div>
              </div>

              <div className="grid grid-cols-2 gap-2 max-w-md mt-3">
                {bucketZones
                  .filter((z) => zoneMetricValue(z, zoneMetric) > 0)
                  .map((z) => {
                    const value = zoneMetricValue(z, zoneMetric);
                    const intensity = value / maxZoneValue;
                    return (
                      <div key={z.zone} className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                        <div className="flex justify-between items-start gap-2">
                          <b className="text-[10px] uppercase text-slate-300 leading-tight">{z.label}</b>
                          <b className="text-cyan-300 text-2xl leading-none">{value}</b>
                        </div>
                        <div className="h-1 rounded-full bg-cyan-400/20 mt-2 overflow-hidden">
                          <div className="h-full bg-cyan-300" style={{ width: `${Math.max(12, intensity * 100)}%` }}/>
                        </div>
                        <div className="text-[8px] text-slate-600 mt-2">T {z.shots} · G {z.goals} · R {z.recoveries} · P {z.losses} · F {z.fouls} · C {z.corners}</div>
                      </div>
                    );
                  })}
              </div>

              {/* Lectura textual agregada: el usuario no tiene que interpretar la rejilla a ojo. */}
              {textualLines.length > 0 && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 space-y-1">
                  {textualLines.map((line) => (
                    <div key={line} className="text-[10px] text-slate-300 font-bold">{line}</div>
                  ))}
                  {textualTop && <div className="text-[10px] text-cyan-300 font-black pt-1">{textualTop}.</div>}
                </div>
              )}

              {foulsAgainstLines.length > 0 && (
                <div className="mt-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-1">
                  <div className="text-[9px] uppercase font-black text-amber-300">Faltas recibidas</div>
                  {foulsAgainstLines.map((line) => (
                    <div key={line} className="text-[10px] text-slate-300 font-bold">{line}</div>
                  ))}
                </div>
              )}

              <div className="mt-3 text-[10px] text-slate-500">
                {bucket?.mostActive
                  ? <>Zona con más acciones: <b className="text-cyan-300">{bucket.mostActive.label} ({bucket.mostActive.total})</b>.</>
                  : "Sin acciones con zona de origen registrada."}
                {bucket?.mostDangerous && <> Zona de tiro más productiva: <b className="text-lime-300">{bucket.mostDangerous.label} ({bucket.mostDangerous.goals} G / {bucket.mostDangerous.shots} T)</b>.</>}
              </div>

              {describeCorners(zones.corners) && (
                <div className="mt-2 text-[10px] text-violet-300 font-black">{describeCorners(zones.corners)}</div>
              )}
              {/* Desglose por ejecución. Va DEBAJO del lado y de los mapas:
                  añade una dimensión, no sustituye ninguna. Solo córners: una
                  falta cometida es una infracción, no una reanudación. */}
              {(describeSetPieceOutcomes(zones.setPieces.corners) ||
                zones.setPieces.freeKickPlays.total > 0) && (
                <div className="mt-2 text-[9px] text-slate-400 leading-relaxed">
                  <div className="font-black text-slate-300 uppercase tracking-widest text-[8px]">
                    Balón parado
                  </div>
                  {describeSetPieceOutcomes(zones.setPieces.corners) && (
                    <div>Córners: {describeSetPieceOutcomes(zones.setPieces.corners)}</div>
                  )}
                  {zones.setPieces.freeKickPlays.total > 0 && (
                    <div>
                      Jugadas de falta: {zones.setPieces.freeKickPlays.total} —{" "}
                      {zones.setPieces.freeKickPlays.located} con ubicación ·{" "}
                      {zones.setPieces.freeKickPlays.unlocated} sin ubicación
                    </div>
                  )}
                </div>
              )}
              {/* Un penalti no está sin ubicar: se lanza desde el punto de
                  penalti, que no es ninguno de los doce sectores. Se cuenta
                  aparte para que la suma cuadre a la vista. */}
              {zones.ruleDetermined > 0 && (
                <div className="mt-1 text-[9px] text-slate-500">
                  {zones.ruleDetermined} lanzamiento(s) desde el punto de penalti.
                </div>
              )}
              {zones.unlocated > 0 && (
                <div className="mt-1 text-[9px] text-slate-500">
                  {zones.unlocated} acción(es) registradas sin ubicación.
                </div>
              )}
            </div>

            <div>
              <div className="text-[9px] uppercase font-black text-slate-500 mb-2 flex items-center gap-1"><Target size={12}/> Destino de los tiros</div>
              <div className="grid grid-cols-3 gap-2 max-w-md">
                {zones.goal.map((z) => (
                  <div key={z.zone} className={`rounded-2xl border p-3 min-h-[72px] ${z.attempts ? "border-lime-500/25 bg-lime-500/5" : "border-white/5 bg-black/20"}`}>
                    <div className="flex justify-between gap-2"><b className="text-[10px] uppercase text-slate-400 leading-tight">{z.label}</b><b className="text-lime-300 text-xl leading-none">{z.attempts}</b></div>
                    <div className="text-[8px] text-slate-600 mt-2">{z.goals} gol{z.goals === 1 ? "" : "es"}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs flex justify-between max-w-md"><span className="font-black uppercase text-red-300">Fuera / desviado</span><b className="font-mono text-red-300">{zones.out}</b></div>
              <div className="mt-3 text-[10px] text-slate-500">Precisión registrada: <b className="text-white">{zones.totals.accuracyPct ?? "—"}{zones.totals.accuracyPct !== null ? "%" : ""}</b>. Los tiros sin destino registrado se mantienen en el total, pero no se usan para calcular la precisión ni se asignan a una celda.</div>
            </div>
          </div>
        </section>

        {/* ── FASES DE JUEGO ──────────────────────────────────────────
            La cuarta dimensión. Solo aparece si el partido la trae
            registrada: un histórico anterior a PR #24A no la tiene y aquí no
            se deduce de nada, así que se dice y no se dibuja nada. */}
        <section ref={phasesRef} className="scroll-mt-28 rounded-3xl border border-violet-500/20 bg-violet-500/5 p-5">
          <div className="mb-4">
            <h2 className="font-black text-white uppercase flex items-center gap-2"><Layers size={18} className="text-violet-400"/> Fases de juego</h2>
            <p className="text-[10px] text-slate-500 mt-1">
              Qué estábamos haciendo cuando ocurrió cada acción. La fase es siempre la de {match.teamName}, también en las acciones del rival.
            </p>
          </div>

          {!hasPhaseData(match) ? (
            <div data-phase-empty className="rounded-2xl border border-white/10 bg-black/20 p-4 text-[11px] text-slate-400">
              <b className="text-slate-300">Fase de juego no registrada en este partido.</b>{" "}
              La captura de fase se estrenó después de este partido y la ausencia no se rellena:
              deducirla ahora de la zona o del tipo de acción sería inventarla.
            </div>
          ) : (
            <>
              {/* Cobertura ANTES de los mapas: una cobertura baja no invalida
                  el mapa, pero tiene que leerse antes que él. */}
              <div data-phase-coverage className="rounded-2xl border border-white/10 bg-black/20 p-3 mb-3">
                <div className="text-[9px] uppercase font-black text-slate-500 mb-1">Cobertura de fase</div>
                <div className="text-[11px] text-slate-300">
                  {phaseCoverageNow.withPhase}/{phaseCoverageNow.total} acciones
                  {phaseCoverageNow.pct !== null ? ` · ${phaseCoverageNow.pct.toFixed(1).replace(".", ",")} %` : " · sin acciones"}
                </div>
                {phaseCoverageNow.withoutPhase > 0 && (
                  <div className="text-[10px] text-slate-500 mt-1">
                    {phaseCoverageNow.withoutPhase} sin fase registrada — no se reparten entre las fases.
                  </div>
                )}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                {PHASE_METRICS.map((m) => (
                  <button
                    key={m.key}
                    data-phase-metric={m.key}
                    onClick={() => setPhaseKey(m.key)}
                    className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase border whitespace-nowrap ${phaseKey === m.key ? "bg-white text-slate-950 border-white" : "bg-black/20 text-slate-400 border-white/10"}`}
                  >
                    {m.shortTitle}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                {[undefined, ...phasePeriods(match)].map((p) => (
                  <button
                    key={p === undefined ? "total" : p}
                    data-phase-period={p === undefined ? "total" : String(p)}
                    onClick={() => setPhasePeriod(p)}
                    className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase border whitespace-nowrap ${phasePeriod === p ? "bg-violet-400 text-slate-950 border-violet-400" : "bg-black/20 text-slate-400 border-white/10"}`}
                  >
                    {p === undefined ? "Total" : periodLabel(p)}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <PhaseMetricRow
                  matchData={match}
                  metric={phaseMetric(phaseKey)}
                  period={phasePeriod}
                  theme="dark"
                  pitchWidth={320}
                />
              </div>
            </>
          )}
        </section>

        <section ref={timesRef} className="scroll-mt-28 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5 overflow-x-auto">
          <h2 className="font-black text-white uppercase flex items-center gap-2 mb-4"><Timer size={18} className="text-amber-400"/> Tiempos</h2>
          <table className="w-full text-xs min-w-[760px]"><thead><tr className="text-slate-500 uppercase text-[9px] border-b border-white/10"><th className="py-2 text-left">#</th><th className="text-left">Jugador</th><th>Estado</th><th>TOT</th><th>ROT</th><th>G</th><th>Tiros</th><th>A port.</th><th>Fuera</th><th>Bloq.</th><th>Rec.</th><th>Pér+Err</th></tr></thead><tbody>
            {players.map((p) => {
              const line = report.playersUsed.find((x) => x.id === p.id);
              // Un jugador sin línea de informe no tiene eventos, así que su
              // recuento es cero. Se deriva igualmente en vez de leer
              // `PlayerStats`, para que las dos ramas digan lo mismo.
              const tiros = summarizePlayerShots(match.events, p);
              return <tr key={p.id} className="border-b border-white/5"><td className="py-3 font-black text-slate-400">{p.number}</td><td className="font-black text-white">{p.name}</td><td className="text-center">{p.isOnPitch ? <span className="text-emerald-400 font-black">PISTA</span> : <span className="text-slate-500">BANCO</span>}</td><td className="text-center font-mono font-black text-blue-400">{fmtSeconds(p.individualTimeSeconds)}</td><td className="text-center font-mono font-black text-emerald-400">{p.isOnPitch ? fmtSeconds(p.rotationTimeSeconds ?? 0) : "—"}</td><td className="text-center">{line?.goals ?? p.stats.goals}</td><td className="text-center">{tiros.shots}</td><td className="text-center">{tiros.onTarget}</td><td className="text-center">{tiros.offTarget}</td><td className="text-center">{tiros.blocked}</td><td className="text-center">{line ? line.steals + line.interceptions : p.stats.steals + p.stats.interceptions}</td><td className="text-center">{line ? line.losses + line.errors : p.stats.losses + p.stats.errors}</td></tr>;
            })}
          </tbody></table>
        </section>

        <section ref={reportRef} className="scroll-mt-28 rounded-3xl border border-blue-500/20 bg-blue-500/5 p-5">
          <div className="flex items-center gap-2 mb-4"><FileText className="text-blue-400" size={18}/><h2 className="font-black text-white uppercase">Informe automático</h2></div>
          <div className="prose prose-invert prose-sm max-w-none prose-headings:text-blue-300"><Markdown>{reportMarkdown}</Markdown></div>
        </section>

        <section ref={aiRef} className="scroll-mt-28 rounded-3xl border border-lime-500/20 bg-lime-500/5 overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3"><div className="p-2 bg-lime-400 rounded-xl"><Cpu className="text-slate-950" size={18}/></div><div><h2 className="font-black text-lime-400">TACTICAL PRO</h2><p className="text-[10px] text-slate-500">Interpretación opcional · basada en datos registrados</p></div></div>
            <button disabled={aiLoading} onClick={() => void runAI()} className="px-3 py-2 rounded-xl bg-lime-400 text-slate-950 font-black text-[10px] uppercase flex items-center gap-2 disabled:opacity-50">{aiLoading ? <Loader2 className="animate-spin" size={13}/> : <RefreshCw size={13}/>} {ai ? "Reanalizar" : "Analizar"}</button>
          </div>
          <div className="p-5">
            {aiError && <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-amber-300 text-xs">{aiError}</div>}
            {aiLoading && <div className="mb-4 flex items-center gap-2 text-lime-300/80 text-[10px] font-black uppercase tracking-widest"><Loader2 className="animate-spin" size={12}/>{ai ? "Escribiendo…" : "Analizando…"}</div>}
            {aiPartial && ai && !aiLoading && <div className="mb-3 inline-block rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300">Informe incompleto · no guardado</div>}
            {ai ? <div className={`prose prose-invert prose-sm max-w-none prose-headings:text-lime-300${aiPartial && !aiLoading ? " opacity-60" : ""}`}><Markdown>{ai}</Markdown></div> : !aiLoading && <div className="py-6 text-center text-slate-500 text-sm"><Users className="mx-auto opacity-20 mb-2"/>El informe determinista ya está disponible. Tactical Pro añade interpretación sin sustituir los datos.</div>}
          </div>
        </section>
      </main>

      <SimpleExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} matchData={match as MatchData}/>
    </div>
  );
}
