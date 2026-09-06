import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Markdown from "react-markdown";
import {
  ArrowLeft,
  BarChart3,
  Cpu,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Target,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { MatchData, SavedMatch, Role } from "../types/futsal";
import { getPartido } from "../services/partidosService";
import { getFinalLocalCopy } from "../services/matchSnapshotService";
import { generateMatchReport, formatMatchReportAsMarkdown } from "../services/matchReportService";
import {
  buildZoneDashboard,
  ZoneMetric,
  zoneMetricValue,
} from "../services/matchZonesService";
import { generateTacticalReport } from "../services/tacticalAnalysisService";
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
};

export default function MatchAnalysis() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [match, setMatch] = useState<SavedMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ai, setAi] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [zoneOpponent, setZoneOpponent] = useState(false);
  const [zoneMetric, setZoneMetric] = useState<ZoneMetric>("all");

  const summaryRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<HTMLDivElement>(null);
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

  const runAI = async () => {
    if (!match) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await Promise.race([
        generateTacticalReport(match),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000)),
      ]);
      setAi(result);
    } catch (err) {
      console.error(err);
      setAiError("TACTICAL PRO no está disponible. El informe automático sigue completo.");
    } finally {
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
  const maxZoneValue = Math.max(...zones.origin.map((z) => zoneMetricValue(z, zoneMetric)), 1);

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

          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            {(Object.keys(METRIC_LABEL) as ZoneMetric[]).map((metric) => (
              <button key={metric} onClick={() => setZoneMetric(metric)} className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase border whitespace-nowrap ${zoneMetric === metric ? "bg-white text-slate-950 border-white" : "bg-black/20 text-slate-400 border-white/10"}`}>{METRIC_LABEL[metric]}</button>
            ))}
          </div>

          <div className="grid md:grid-cols-[1fr_1fr] gap-5 items-start">
            <div>
              <div className="text-[9px] uppercase font-black text-slate-500 mb-2">Origen de acciones · {METRIC_LABEL[zoneMetric]}</div>
              <div className="grid grid-cols-3 gap-2 max-w-md">
                {zones.origin.map((z) => {
                  const value = zoneMetricValue(z, zoneMetric);
                  const intensity = value / maxZoneValue;
                  return (
                    <div key={z.zone} className={`rounded-2xl border p-3 min-h-[82px] ${value ? "border-cyan-500/30 bg-cyan-500/10" : "border-white/5 bg-black/20"}`}>
                      <div className="flex justify-between items-start"><b className="font-mono text-slate-400">{z.zone}</b><b className="text-cyan-300 text-2xl">{value}</b></div>
                      {value > 0 && <div className="h-1 rounded-full bg-cyan-400/20 mt-2 overflow-hidden"><div className="h-full bg-cyan-300" style={{ width: `${Math.max(12, intensity * 100)}%` }}/></div>}
                      <div className="text-[8px] text-slate-600 mt-2">T {z.shots} · G {z.goals} · R {z.recoveries} · P {z.losses}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-[10px] text-slate-500">
                {zones.mostActiveZone ? <>Zona con más acciones: <b className="text-cyan-300">{zones.mostActiveZone.zone} ({zones.mostActiveZone.total})</b>.</> : "Sin acciones con zona de origen registrada."}
                {zones.mostDangerousZone && <> Zona de tiro más productiva: <b className="text-lime-300">{zones.mostDangerousZone.zone} ({zones.mostDangerousZone.goals} G / {zones.mostDangerousZone.shots} T)</b>.</>}
              </div>
            </div>

            <div>
              <div className="text-[9px] uppercase font-black text-slate-500 mb-2 flex items-center gap-1"><Target size={12}/> Destino de los tiros</div>
              <div className="grid grid-cols-3 gap-2 max-w-md">
                {zones.goal.map((z) => (
                  <div key={z.zone} className={`rounded-2xl border p-3 min-h-[72px] ${z.attempts ? "border-lime-500/25 bg-lime-500/5" : "border-white/5 bg-black/20"}`}>
                    <div className="flex justify-between"><b className="font-mono text-slate-400">{z.zone}</b><b className="text-lime-300 text-xl">{z.attempts}</b></div>
                    <div className="text-[8px] text-slate-600 mt-2">{z.goals} gol{z.goals === 1 ? "" : "es"}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs flex justify-between max-w-md"><span className="font-black uppercase text-red-300">Fuera / desviado</span><b className="font-mono text-red-300">{zones.out}</b></div>
              <div className="mt-3 text-[10px] text-slate-500">Precisión registrada: <b className="text-white">{zones.totals.accuracyPct ?? "—"}{zones.totals.accuracyPct !== null ? "%" : ""}</b>. Los tiros sin destino registrado se mantienen en el total, pero no se usan para calcular la precisión ni se asignan a una celda.</div>
            </div>
          </div>
        </section>

        <section ref={timesRef} className="scroll-mt-28 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5 overflow-x-auto">
          <h2 className="font-black text-white uppercase flex items-center gap-2 mb-4"><Timer size={18} className="text-amber-400"/> Tiempos</h2>
          <table className="w-full text-xs min-w-[620px]"><thead><tr className="text-slate-500 uppercase text-[9px] border-b border-white/10"><th className="py-2 text-left">#</th><th className="text-left">Jugador</th><th>Estado</th><th>TOT</th><th>ROT</th><th>G</th><th>Tiros</th><th>Rec.</th><th>Pér+Err</th></tr></thead><tbody>
            {players.map((p) => {
              const line = report.playersUsed.find((x) => x.id === p.id);
              return <tr key={p.id} className="border-b border-white/5"><td className="py-3 font-black text-slate-400">{p.number}</td><td className="font-black text-white">{p.name}</td><td className="text-center">{p.isOnPitch ? <span className="text-emerald-400 font-black">PISTA</span> : <span className="text-slate-500">BANCO</span>}</td><td className="text-center font-mono font-black text-blue-400">{fmtSeconds(p.individualTimeSeconds)}</td><td className="text-center font-mono font-black text-emerald-400">{p.isOnPitch ? fmtSeconds(p.rotationTimeSeconds ?? 0) : "—"}</td><td className="text-center">{line?.goals ?? p.stats.goals}</td><td className="text-center">{line?.attempts ?? (p.stats.goals + p.stats.shots + p.stats.shotsOffTarget)}</td><td className="text-center">{line ? line.steals + line.interceptions : p.stats.steals + p.stats.interceptions}</td><td className="text-center">{line ? line.losses + line.errors : p.stats.losses + p.stats.errors}</td></tr>;
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
            {ai ? <div className="prose prose-invert prose-sm max-w-none prose-headings:text-lime-300"><Markdown>{ai}</Markdown></div> : <div className="py-6 text-center text-slate-500 text-sm"><Users className="mx-auto opacity-20 mb-2"/>El informe determinista ya está disponible. Tactical Pro añade interpretación sin sustituir los datos.</div>}
          </div>
        </section>
      </main>

      <SimpleExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} matchData={match as MatchData}/>
    </div>
  );
}
