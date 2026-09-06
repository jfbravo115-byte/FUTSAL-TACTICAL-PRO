import React, { useMemo, useState } from "react";
import { X, Target, Zap, AlertTriangle, Trophy, Grid3X3 } from "lucide-react";
import { MatchData } from "../types/futsal";
import { summarizeQuickZones } from "../services/matchZonesService";
import { generateMatchReport } from "../services/matchReportService";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  matchData: MatchData;
};

export function QuickMatchDataModal({ isOpen, onClose, matchData }: Props) {
  const [showOpponent, setShowOpponent] = useState(false);
  const zones = useMemo(() => summarizeQuickZones(matchData, showOpponent), [matchData, showOpponent]);
  const report = useMemo(() => generateMatchReport(matchData), [matchData]);
  if (!isOpen) return null;

  const ownRecoveries = report.teamTotals.recoveries;
  const cards = [
    { label: "Tiros", value: report.teamTotals.shots, icon: Target, cls: "text-amber-400" },
    { label: "Recuper.", value: ownRecoveries, icon: Zap, cls: "text-cyan-400" },
    { label: "Pér+Err", value: report.teamTotals.lossesAndErrors, icon: AlertTriangle, cls: "text-red-400" },
    { label: "Goles", value: report.score.team, icon: Trophy, cls: "text-lime-400" },
  ];

  return (
    <div className="fixed inset-0 z-[1500] bg-slate-950/98 backdrop-blur-sm overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-white/10">
        <h2 className="text-lg font-black text-white uppercase italic tracking-wide flex items-center gap-2">
          <Grid3X3 size={20} className="text-cyan-400" /> Datos rápidos
        </h2>
        <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white/10 text-white font-black uppercase text-xs hover:bg-white/20 transition-all">
          Cerrar
        </button>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map((c) => (
            <div key={c.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <c.icon size={18} className={`${c.cls} mx-auto mb-2`} />
              <div className={`text-2xl font-black ${c.cls}`}>{c.value}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{c.label}</div>
            </div>
          ))}
        </div>

        <section className="bg-white/5 border border-white/10 rounded-3xl p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-white font-black uppercase text-sm">Zonas registradas</h3>
              <p className="text-[10px] text-slate-500 mt-1">Vista simple sobre las 9 zonas lógicas reales. No usa heatmap ni transforma coordenadas.</p>
            </div>
            <div className="flex rounded-xl border border-white/10 overflow-hidden shrink-0">
              <button onClick={() => setShowOpponent(false)} className={`px-3 py-2 text-[10px] font-black uppercase ${!showOpponent ? "bg-cyan-500 text-slate-950" : "bg-white/5 text-slate-400"}`}>
                {matchData.teamName}
              </button>
              <button onClick={() => setShowOpponent(true)} className={`px-3 py-2 text-[10px] font-black uppercase ${showOpponent ? "bg-red-500 text-white" : "bg-white/5 text-slate-400"}`}>
                Rival
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 max-w-2xl mx-auto">
            {zones.map((z) => (
              <div key={z.zone} className={`rounded-2xl border p-3 min-h-[108px] ${z.total ? "bg-cyan-500/10 border-cyan-500/25" : "bg-black/20 border-white/5"}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-xs font-black text-white">{z.zone}</span>
                  <span className="font-black text-xl text-cyan-300">{z.total}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] uppercase font-black">
                  <span className="text-amber-400">T {z.shots}</span>
                  <span className="text-lime-400">G {z.goals}</span>
                  <span className="text-cyan-400">R {z.recoveries}</span>
                  <span className="text-red-400">P {z.losses}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-center text-[9px] text-slate-500 font-bold uppercase tracking-wide">T = tiros · G = goles · R = recuperaciones · P = pérdidas</div>
        </section>
      </div>
    </div>
  );
}
