import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Markdown from "react-markdown";
import { ArrowLeft, Cpu, Download, FileText, Loader2, RefreshCw, Timer, Trophy } from "lucide-react";
import { MatchData, SavedMatch, Role } from "../types/futsal";
import { getPartido } from "../services/partidosService";
import { getFinalLocalCopy } from "../services/matchSnapshotService";
import { generateMatchReport, formatMatchReportAsMarkdown } from "../services/matchReportService";
import { summarizeQuickZones } from "../services/matchZonesService";
import { generateTacticalReport } from "../services/tacticalAnalysisService";
import { SimpleExportModal } from "../components/SimpleExportModal";

function fmtSeconds(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

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
  const timesRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

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
    const el = section === "times" ? timesRef.current : section === "report" ? reportRef.current : null;
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [match, searchParams]);

  const report = useMemo(() => match ? generateMatchReport(match) : null, [match]);
  const reportMarkdown = useMemo(() => report ? formatMatchReportAsMarkdown(report) : "", [report]);
  const zones = useMemo(() => match ? summarizeQuickZones(match, false) : [], [match]);

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

  if (loading) return (
    <div className="h-screen bg-[#0A0B0E] flex items-center justify-center text-slate-300">
      <Loader2 className="animate-spin text-lime-400 mr-3" /> Cargando partido…
    </div>
  );

  if (!match || !report) return (
    <div className="h-screen bg-[#0A0B0E] flex flex-col items-center justify-center text-center p-6">
      <p className="text-red-400 font-bold">{loadError || "No se encontró el partido."}</p>
      <button onClick={() => navigate("/dashboard")} className="mt-4 text-lime-400 hover:underline">Volver al historial</button>
    </div>
  );

  const players = match.players
    .filter((p) => !p.isOpponent && p.role !== Role.COACH && p.role !== Role.DELEGATE)
    .sort((a, b) => a.number - b.number);

  return (
    <div className="bg-[#0A0B0E] text-slate-200 font-sans overflow-y-auto allow-scroll" style={{ height: "var(--app-height, 100vh)" }}>
      <header className="border-b border-white/10 bg-[#0E1015]/95 sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate("/dashboard")} className="p-2 hover:bg-white/10 rounded-xl text-slate-400"><ArrowLeft size={20}/></button>
            <div className="min-w-0"><h1 className="font-black text-white truncate">{match.teamName} <span className="text-slate-500">vs</span> {match.opponentName}</h1><p className="text-[10px] text-slate-500 uppercase">{match.timestamp ? new Date(match.timestamp).toLocaleString("es-ES") : ""}</p></div>
          </div>
          <button onClick={() => setExportOpen(true)} className="px-3 py-2 rounded-xl bg-violet-500/15 border border-violet-500/25 text-violet-300 font-black text-[10px] uppercase flex gap-2 items-center"><Download size={14}/> Exportar</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 pb-16">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 flex items-center justify-between gap-4">
          <div><div className="text-xs uppercase font-black text-slate-500">Resultado</div><div className="text-lg font-black text-white">{match.teamName} · {match.opponentName}</div></div>
          <div className="text-5xl font-mono font-black text-white">{report.score.team}-{report.score.opponent}</div>
        </section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Tiros', report.teamTotals.shots], ['Recuper.', report.teamTotals.steals + report.teamTotals.interceptions], ['Pérdidas', report.teamTotals.losses], ['Rotaciones', report.rotationSummary.totalRotationsCount]].map(([label,value]) => (
            <div key={String(label)} className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-center"><div className="text-2xl font-black text-cyan-300">{value}</div><div className="text-[9px] uppercase font-black text-slate-500">{label}</div></div>
          ))}
        </div>

        <section ref={timesRef} className="scroll-mt-20 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5 overflow-x-auto">
          <h2 className="font-black text-white uppercase flex items-center gap-2 mb-4"><Timer size={18} className="text-amber-400"/> Tiempos</h2>
          <table className="w-full text-xs min-w-[520px]"><thead><tr className="text-slate-500 uppercase text-[9px] border-b border-white/10"><th className="py-2 text-left">#</th><th className="text-left">Jugador</th><th>Estado</th><th>TOT</th><th>ROT</th></tr></thead><tbody>
            {players.map((p) => <tr key={p.id} className="border-b border-white/5"><td className="py-3 font-black text-slate-400">{p.number}</td><td className="font-black text-white">{p.name}</td><td className="text-center">{p.isOnPitch ? <span className="text-emerald-400 font-black">PISTA</span> : <span className="text-slate-500">BANCO</span>}</td><td className="text-center font-mono font-black text-blue-400">{fmtSeconds(p.individualTimeSeconds)}</td><td className="text-center font-mono font-black text-emerald-400">{p.isOnPitch ? fmtSeconds(p.rotationTimeSeconds ?? 0) : "—"}</td></tr>)}
          </tbody></table>
        </section>

        <section className="rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-5">
          <h2 className="font-black text-white uppercase mb-2">Zonas simples</h2>
          <p className="text-[10px] text-slate-500 mb-4">9 zonas lógicas reales. Sin heatmap como vista principal.</p>
          <div className="grid grid-cols-3 gap-2 max-w-2xl">
            {zones.map((z) => <div key={z.zone} className={`rounded-2xl border p-3 ${z.total ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-white/5 bg-black/20'}`}><div className="flex justify-between"><b className="font-mono">{z.zone}</b><b className="text-cyan-300 text-xl">{z.total}</b></div><div className="mt-2 grid grid-cols-2 text-[9px] font-black uppercase gap-1"><span className="text-amber-400">T {z.shots}</span><span className="text-lime-400">G {z.goals}</span><span className="text-cyan-400">R {z.recoveries}</span><span className="text-red-400">P {z.losses}</span></div></div>)}
          </div>
        </section>

        <section ref={reportRef} className="scroll-mt-20 rounded-3xl border border-blue-500/20 bg-blue-500/5 p-5">
          <div className="flex items-center gap-2 mb-4"><FileText className="text-blue-400" size={18}/><h2 className="font-black text-white uppercase">Informe automático</h2></div>
          <div className="prose prose-invert prose-sm max-w-none prose-headings:text-blue-300"><Markdown>{reportMarkdown}</Markdown></div>
        </section>

        <section className="rounded-3xl border border-lime-500/20 bg-lime-500/5 overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="p-2 bg-lime-400 rounded-xl"><Cpu className="text-slate-950" size={18}/></div><div><h2 className="font-black text-lime-400">TACTICAL PRO</h2><p className="text-[10px] text-slate-500">Interpretación opcional · el informe no depende de ella</p></div></div><button disabled={aiLoading} onClick={() => void runAI()} className="px-3 py-2 rounded-xl bg-lime-400 text-slate-950 font-black text-[10px] uppercase flex items-center gap-2 disabled:opacity-50">{aiLoading ? <Loader2 className="animate-spin" size={13}/> : <RefreshCw size={13}/>} {ai ? 'Reanalizar' : 'Analizar'}</button></div>
          <div className="p-5">{aiError && <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-amber-300 text-xs">{aiError}</div>}{ai ? <div className="prose prose-invert prose-sm max-w-none prose-headings:text-lime-300"><Markdown>{ai}</Markdown></div> : <div className="py-6 text-center text-slate-500 text-sm"><Trophy className="mx-auto opacity-20 mb-2"/>El informe automático ya está disponible. Pulsa Analizar solo si quieres interpretación IA.</div>}</div>
        </section>
      </main>

      <SimpleExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} matchData={match as MatchData}/>
    </div>
  );
}
