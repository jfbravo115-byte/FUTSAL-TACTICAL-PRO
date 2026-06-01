import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import PDFReportTemplates, { PDFReportRef } from '../components/PDFReportTemplates';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { SavedMatch, ActionType, GoalieAction, Role } from '../types/futsal';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { Cpu, ArrowLeft, Loader2, Trophy, Target, Zap, Shield, Download } from 'lucide-react';
import Markdown from 'react-markdown';
import TacticalHeatMap from '../components/TacticalHeatMap';

const formatTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
};

export default function MatchAnalysis() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState<SavedMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<string>('');
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [searchParams] = useSearchParams();
  const teamPdfRef = useRef<HTMLDivElement>(null);
  const gkPdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!matchId) return;
    const fetch = async () => {
      const d = await getDoc(doc(db, 'partidos', matchId));
      if (d.exists()) {
        const matchData = { id: d.id, ...d.data() } as SavedMatch;
        setMatch(matchData);
        // Auto-generate Tactical PRO if not already available
        if (!matchData.tacticalAnalysis) {
          autoGenerateAnalysis(matchData);
        } else {
          setAnalysis(matchData.tacticalAnalysis);
        }
      }
      setLoading(false);
    };
    fetch();
  }, [matchId]);

  const [exportingPDF, setExportingPDF] = useState<'team' | 'goalkeeper' | null>(null);
  const pdfRef = useRef<PDFReportRef>(null);

  const generatePDF = async (type: 'team' | 'goalkeeper') => {
    if (!pdfRef.current || !match) return;
    setExportingPDF(type);
    try {
      await new Promise(r => setTimeout(r, 500));
      if (type === 'team') await pdfRef.current.exportTeamPDF();
      else await pdfRef.current.exportGoalkeeperPDF();
    } catch (err) {
      console.error(err);
      alert('Error al generar el PDF.');
    } finally {
      setExportingPDF(null);
    }
  };

  const autoGenerateAnalysis = async (matchData: SavedMatch) => {
    try {
      const res = await fetch('/api/tactical-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchData }),
      });
      const data = await res.json();
      if (data.analysis) setAnalysis(data.analysis);
    } catch (e) {
      console.warn('Auto-analysis failed:', e);
    } finally {
      setAnalyzingAI(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0A0B0E]">
      <Loader2 className="w-8 h-8 animate-spin text-lime-400 mb-4" />
      <p className="text-slate-400 text-sm">Cargando análisis...</p>
    </div>
  );

  if (!match) return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0A0B0E] text-center p-6">
      <p className="text-red-400 font-bold">No se encontró el partido.</p>
      <button onClick={() => navigate('/dashboard')} className="mt-4 text-lime-400 hover:underline">
        Volver al historial
      </button>
    </div>
  );

  // Derive stats from events
  const goals = match.events?.filter(
    e => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent
  ).length ?? 0;
  const opponentGoals = match.events?.filter(
    e => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && e.metadata?.isOpponent
  ).length ?? 0;

  const localPlayers = match.players?.filter(p => !p.isOpponent && p.role !== Role.COACH && p.role !== Role.DELEGATE) ?? [];
  const rivalPlayers = match.players?.filter(p => p.isOpponent && p.role !== Role.COACH && p.role !== Role.DELEGATE) ?? [];

  // Build timeline data (goals over time in 5-min buckets)
  const buckets: Record<number, { localGoals: number; rivalGoals: number }> = {};
  match.events?.forEach(e => {
    if (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) {
      const bucket = Math.floor(e.timestamp / 1000 / 60 / 5) * 5;
      if (!buckets[bucket]) buckets[bucket] = { localGoals: 0, rivalGoals: 0 };
      if (e.metadata?.isOpponent) buckets[bucket].rivalGoals++;
      else buckets[bucket].localGoals++;
    }
  });
  const timelineData = Object.entries(buckets)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([min, v]) => ({ min: `${min}'`, ...v }));

  // Player chart data
  const playerChartData = localPlayers
    .sort((a, b) => (b.stats.goals + b.stats.assists) - (a.stats.goals + a.stats.assists))
    .slice(0, 8)
    .map(p => ({
      name: p.name.split(' ')[0],
      Goles: p.stats.goals,
      Asistencias: p.stats.assists,
      Recuperaciones: p.stats.steals,
    }));

  return (
    <div className="bg-[#0A0B0E] text-slate-200 font-sans overflow-y-auto allow-scroll" style={{ height: "var(--app-height, 100vh)" }}>
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0E1015]/95 sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-white/10 rounded-xl transition-all text-slate-400 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-base font-black text-white uppercase tracking-tight">
              {match.teamName} <span className="text-slate-500">vs</span> {match.opponentName}
            </h1>
            <p className="text-[10px] text-slate-500 uppercase">
              {match.timestamp ? new Date(match.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8 pb-16">
        {/* Score + PDF buttons */}
        <div className="flex justify-between items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-white truncate">{match.teamName}</h2>
            <p className="text-slate-500 uppercase text-xs truncate">vs {match.opponentName}</p>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-4xl font-mono font-black whitespace-nowrap ${goals > opponentGoals ? 'text-lime-400' : goals < opponentGoals ? 'text-red-400' : 'text-white'}`}>
              {goals}–{opponentGoals}
            </div>
            <div className="text-[10px] font-black text-slate-500 uppercase mt-1">
              {goals > opponentGoals ? '🏆 Victoria' : goals < opponentGoals ? '❌ Derrota' : '🤝 Empate'}
            </div>
          </div>
        </div>

        {/* PDF Export buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => generatePDF('team')}
            disabled={exportingPDF !== null}
            className="flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-xs bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition-all active:scale-95 disabled:opacity-50"
          >
            {exportingPDF === 'team' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            PDF Global Jugadores
          </button>
          <button
            onClick={() => generatePDF('goalkeeper')}
            disabled={exportingPDF !== null}
            className="flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-xs bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition-all active:scale-95 disabled:opacity-50"
          >
            {exportingPDF === 'goalkeeper' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            PDF Porteros + Mapa
          </button>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Tiros', value: match.events?.filter(e => !e.metadata?.isOpponent && (e.type === ActionType.SHOT || e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED)).length ?? 0, icon: Target, color: 'text-amber-400' },
            { label: 'Recuper.', value: localPlayers.reduce((acc, p) => acc + p.stats.steals, 0), icon: Zap, color: 'text-cyan-400' },
            { label: 'Faltas', value: match.fouls?.team ?? 0, icon: Shield, color: 'text-orange-400' },
            { label: 'Eventos', value: match.events?.length ?? 0, icon: Trophy, color: 'text-purple-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col items-center text-center">
              <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Goals Timeline */}
        {timelineData.length > 0 && (
          <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-base font-black text-white mb-4">Dinámica de Goles por Periodo (5 min)</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="min" stroke="#475569" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#475569" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', color: '#f8fafc' }} />
                  <Legend />
                  <Line type="monotone" dataKey="localGoals" name={`Goles ${match.teamName}`} stroke="#a3e635" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="rivalGoals" name={`Goles ${match.opponentName}`} stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Player stats chart */}
        {playerChartData.length > 0 && (
          <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-base font-black text-white mb-4">Estadísticas de Jugadores — {match.teamName}</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={playerChartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#475569" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#475569" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', color: '#f8fafc' }} />
                  <Legend />
                  <Bar dataKey="Goles" fill="#a3e635" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Asistencias" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Recuperaciones" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Player table */}
        {localPlayers.length > 0 && (
          <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 overflow-x-auto">
            <h3 className="text-base font-black text-white mb-4">Estadísticas Individuales — {match.teamName}</h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase">
                  <th className="pb-2 pr-4 font-black">#</th>
                  <th className="pb-2 pr-4 font-black">Jugador</th>
                  <th className="pb-2 px-3 font-black text-center">G</th>
                  <th className="pb-2 px-3 font-black text-center">A</th>
                  <th className="pb-2 px-3 font-black text-center">T</th>
                  <th className="pb-2 px-3 font-black text-center">R</th>
                  <th className="pb-2 px-3 font-black text-center">P</th>
                  <th className="pb-2 px-3 font-black text-center">+/-</th>
                </tr>
              </thead>
              <tbody>
                {localPlayers
                  .sort((a, b) => (b.stats.goals * 5 + b.stats.assists * 3) - (a.stats.goals * 5 + a.stats.assists * 3))
                  .map(p => (
                    <tr key={p.id} className="border-b border-slate-800/50 hover:bg-white/5">
                      <td className="py-2 pr-4 font-mono font-black text-slate-400">{p.number}</td>
                      <td className="py-2 pr-4 font-black text-white">{p.name}</td>
                      <td className="py-2 px-3 text-center font-black text-lime-400">{p.stats.goals}</td>
                      <td className="py-2 px-3 text-center font-black text-blue-400">{p.stats.assists}</td>
                      <td className="py-2 px-3 text-center font-black text-amber-400">{p.stats.shots + p.stats.goals}</td>
                      <td className="py-2 px-3 text-center font-black text-cyan-400">{p.stats.steals}</td>
                      <td className="py-2 px-3 text-center font-black text-red-400">{p.stats.losses}</td>
                      <td className={`py-2 px-3 text-center font-mono font-black ${p.plusMinus > 0 ? 'text-lime-400' : p.plusMinus < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                        {p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tactical Heat Map */}
        <TacticalHeatMap match={match} />

        {/* Tactical Pro Analysis */}
        <div className="border border-lime-400/20 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-lime-400/10 to-transparent p-5 border-b border-lime-400/10 flex items-center gap-3">
            <div className="p-2 bg-lime-400 rounded-xl">
              <Cpu className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h3 className="text-lg font-black text-lime-400 font-mono tracking-tight">TACTICAL PRO</h3>
              <p className="text-slate-500 text-xs">Informe generado por IA</p>
            </div>
          </div>
          <div className="p-6 bg-slate-950 min-h-[200px]">
            {analyzingAI ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Loader2 className="w-8 h-8 mb-3 text-lime-400 animate-spin" />
                <p className="text-xs text-slate-500 uppercase font-black tracking-widest animate-pulse">Generando análisis táctico...</p>
              </div>
            ) : analysis ? (
              <div className="prose prose-invert prose-lime prose-p:text-slate-300 prose-headings:text-white max-w-none text-sm">
                <Markdown>{analysis}</Markdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-slate-600">
                <Cpu className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">No se pudo generar el análisis.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* PDF Report Templates */}
      {match && (
        <PDFReportTemplates
          ref={pdfRef}
          match={match}
          goals={goals}
          opponentGoals={opponentGoals}
        />
      )}
    </div>
  );
}
