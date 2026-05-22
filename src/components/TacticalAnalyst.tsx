import React from "react";
import { AlertTriangle, Target, Zap, Timer, CheckCircle2 } from "lucide-react";
import { MatchData, ActionType, GameState } from "../types/futsal";

interface TacticalAnalystProps {
  matchData: MatchData;
}

export const TacticalAnalyst: React.FC<TacticalAnalystProps> = ({ matchData }) => {
  const getTacticalPills = () => {
    const pills: { icon: React.ReactNode; text: string; type: "error" | "warning" | "success" | "info" }[] = [];

    // All variables initialized with 0 and using optional chaining
    const localPlayers = matchData?.players?.filter(p => !p.isOpponent) || [];
    const localGoals = localPlayers.reduce((acc, p) => acc + (p?.stats?.goals || 0), 0);
    const localShots = localPlayers.reduce((acc, p) => acc + (p?.stats?.shots || 0), 0);
    const localSteals = localPlayers.reduce((acc, p) => acc + (p?.stats?.steals || 0), 0);
    const localLosses = localPlayers.reduce((acc, p) => acc + (p?.stats?.losses || 0), 0);
    const localFouls = matchData?.fouls?.team || 0;

    // 1. Control de Presión: Si pérdidas > recuperaciones
    if (localLosses > localSteals && localLosses > 0) {
      pills.push({
        icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
        text: "⚠️ ALERTA: Balance defensivo negativo. El equipo está perdiendo el control en la salida.",
        type: "warning"
      });
    }

    // 2. Efectividad: Si goles / tiros < 0.2 (20%)
    if (localShots > 5) {
      const efficiency = localGoals / localShots;
      if (efficiency < 0.2) {
        pills.push({
          icon: <Target className="w-4 h-4 text-red-500" />,
          text: "⚽ EFICACIA: Se llega a puerta pero falta definición. Ajustar puntería.",
          type: "error"
        });
      } else if (efficiency >= 0.4) {
        pills.push({
          icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
          text: "⚽ EFICACIA: Gran contundencia de cara a portería. Mantener el ritmo.",
          type: "success"
        });
      }
    }

    // 3. Intensidad: Si faltas > 4 en una parte
    if (localFouls > 4) {
      pills.push({
        icon: <Zap className="w-4 h-4 text-red-500" />,
        text: "🚩 DISCIPLINA: Bonus de faltas cerca. Cuidado con las manos y entradas tardías.",
        type: "error"
      });
    }

    // 4. Superiority: Si la formación es 5x4 y no hay goles en 2 minutos
    // Check for 5x4 events and see if there are any goals in the last 120 seconds
    const currentGameState = matchData?.events?.[matchData.events.length - 1]?.gameState;
    if (currentGameState === GameState.PJ_ATTACK) {
      const twoMinutesAgo = matchData.matchClock - 120000;
      const recentGoalsInPJ = matchData.events.filter(e =>  e.timestamp >= twoMinutesAgo && e.type === ActionType.GOAL && e.gameState === GameState.PJ_ATTACK);
      
      if (recentGoalsInPJ.length === 0) {
         pills.push({
          icon: <Timer className="w-4 h-4 text-blue-400" />,
          text: "⏱️ ESTRATEGIA: Portero-Jugador poco efectivo. Circular el balón con más velocidad.",
          type: "info"
        });
      }
    }

    return pills;
  };

  const pills = getTacticalPills();

  return (
    <div className="glass p-4 mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-wider text-white/90 uppercase flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          RESUMEN DEL ANALISTA
        </h3>
        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-white/50">LOCAL SYSTEM</span>
      </div>
      
      <div className="grid gap-2">
        {pills.length > 0 ? (
          pills.map((pill, index) => (
            <div 
              key={index} 
              className={`flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm transition-all hover:bg-white/10`}
            >
              <div className="shrink-0">{pill.icon}</div>
              <p className="text-xs font-medium text-slate-200 leading-relaxed">
                {pill.text}
              </p>
            </div>
          ))
        ) : (
          <div className="text-center py-6">
             <p className="text-xs text-slate-500 italic">Esperando datos tácticos suficientes para análisis...</p>
          </div>
        )}
      </div>
    </div>
  );
};
