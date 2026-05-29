/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Map as MapIcon,
  Crosshair,
  History,
  Download,
  Settings,
  Menu,
  X,
  Activity,
  ShieldAlert,
  ShieldCheck,
  FileText,
  LayoutDashboard,
  Timer as TimerIcon,
  Trophy,
  Users,
  Image as ImageIcon,
  TrendingUp,
  ChevronDown,
  Layers,
  Volume2,
  VolumeX,
  BellRing,
  Target,
  AlertTriangle,
  Zap,
  RefreshCw,
  Handshake,
  Trash2,
  Plus,
  Check,
  Shield,
  Sparkles,
  Edit2,
  Pencil,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import {
  Player,
  GameEvent,
  MatchData,
  Period,
  GameState,
  ActionType,
  GoalieAction,
  Role,
} from "../types/futsal";
import { exportToCSV, exportForNotebookLM } from "../lib/exportUtils";
import { PlayerActionRadialMenu } from "../components/PlayerActionRadialMenu";
import { TacticalAnalyst } from "../components/TacticalAnalyst";
import { generateTacticalReport } from "../services/tacticalAnalysisService";
import { TacticalReportModal } from "../components/TacticalReportModal";

import Markdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";



// Datos iniciales de prueba - Plantilla completa de 14 jugadores
const INITIAL_STATS = {
  goals: 0,
  assists: 0,
  steals: 0,
  interceptions: 0,
  losses: 0,
  errors: 0,
  fouls: 0,
  yellowCards: 0,
  redCards: 0,
  shots: 0,
  shotsOffTarget: 0,
  saves: 0,
  conceded: 0,
};

const INITIAL_PLAYERS: Player[] = [
  {
    id: "p1",
    number: 1,
    name: "POR LOCAL 1",
    role: Role.GOALKEEPER,
    isOnPitch: true,
    pitchPosition: 0,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: true,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p2",
    number: 7,
    name: "PJ LOCAL 1",
    role: Role.PLAYER,
    isOnPitch: true,
    pitchPosition: 1,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: true,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p3",
    number: 10,
    name: "PJ LOCAL 2",
    role: Role.PLAYER,
    isOnPitch: true,
    pitchPosition: 2,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: true,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p4",
    number: 8,
    name: "PJ LOCAL 3",
    role: Role.PLAYER,
    isOnPitch: true,
    pitchPosition: 3,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: true,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p5",
    number: 11,
    name: "PJ LOCAL 4",
    role: Role.PLAYER,
    isOnPitch: true,
    pitchPosition: 4,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: true,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p6",
    number: 5,
    name: "PJ LOCAL 5",
    role: Role.PLAYER,
    isOnPitch: false,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p7",
    number: 14,
    name: "PJ LOCAL 6",
    role: Role.PLAYER,
    isOnPitch: false,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p8",
    number: 2,
    name: "PJ LOCAL 7",
    role: Role.PLAYER,
    isOnPitch: false,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p9",
    number: 3,
    name: "POR LOCAL 2",
    role: Role.GOALKEEPER,
    isOnPitch: false,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p10",
    number: 17,
    name: "PJ LOCAL 8",
    role: Role.PLAYER,
    isOnPitch: false,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p11",
    number: 4,
    name: "PJ LOCAL 9",
    role: Role.PLAYER,
    isOnPitch: false,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p12",
    number: 9,
    name: "PJ LOCAL 10",
    role: Role.PLAYER,
    isOnPitch: false,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p13",
    number: 6,
    name: "PJ LOCAL 11",
    role: Role.PLAYER,
    isOnPitch: false,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "p14",
    number: 12,
    name: "PJ LOCAL 12",
    role: Role.PLAYER,
    isOnPitch: false,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "s1",
    number: 0,
    name: "ENTRENADOR LOCAL",
    role: Role.COACH,
    isOnPitch: false,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "s2",
    number: 0,
    name: "DELEGADO LOCAL",
    role: Role.DELEGATE,
    isOnPitch: false,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isOpponent: false,
    stats: { ...INITIAL_STATS },
  },
  // INITIAL OPPONENTS
  {
    id: "opp_p1",
    number: 1,
    name: "POR RIVAL 1",
    role: Role.GOALKEEPER,
    isOnPitch: true,
    pitchPosition: 0,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: true,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p2",
    number: 10,
    name: "PJ RIVAL 1",
    role: Role.PLAYER,
    isOnPitch: true,
    pitchPosition: 1,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: true,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p3",
    number: 7,
    name: "PJ RIVAL 2",
    role: Role.PLAYER,
    isOnPitch: true,
    pitchPosition: 2,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: true,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p4",
    number: 8,
    name: "PJ RIVAL 3",
    role: Role.PLAYER,
    isOnPitch: true,
    pitchPosition: 3,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: true,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p5",
    number: 9,
    name: "PJ RIVAL 4",
    role: Role.PLAYER,
    isOnPitch: true,
    pitchPosition: 4,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: true,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p6",
    number: 12,
    name: "PJ RIVAL 5",
    role: Role.PLAYER,
    isOnPitch: false,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p7",
    number: 14,
    name: "PJ RIVAL 6",
    role: Role.PLAYER,
    isOnPitch: false,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p8",
    number: 11,
    name: "PJ RIVAL 7",
    role: Role.PLAYER,
    isOnPitch: false,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p9",
    number: 13,
    name: "POR RIVAL 2",
    role: Role.GOALKEEPER,
    isOnPitch: false,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p10",
    number: 2,
    name: "PJ RIVAL 8",
    role: Role.PLAYER,
    isOnPitch: false,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p11",
    number: 3,
    name: "PJ RIVAL 9",
    role: Role.PLAYER,
    isOnPitch: false,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p12",
    number: 4,
    name: "PJ RIVAL 10",
    role: Role.PLAYER,
    isOnPitch: false,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p13",
    number: 5,
    name: "PJ RIVAL 11",
    role: Role.PLAYER,
    isOnPitch: false,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_p14",
    number: 6,
    name: "PJ RIVAL 12",
    role: Role.PLAYER,
    isOnPitch: false,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isStarter: false,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_s1",
    number: 0,
    name: "ENTRENADOR RIVAL",
    role: Role.COACH,
    isOnPitch: false,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    stats: { ...INITIAL_STATS },
  },
  {
    id: "opp_s2",
    number: 0,
    name: "DELEGADO RIVAL",
    role: Role.DELEGATE,
    isOnPitch: false,
    isOpponent: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    stats: { ...INITIAL_STATS },
  },
];

const PITCH_SYSTEMS: Record<
  string,
  { left: number; top: number; label: string }[]
> = {
  [GameState.FOUR_VS_FOUR]: [
    { left: 7, top: 50, label: "POR" },
    { left: 28, top: 50, label: "CIE" },
    { left: 55, top: 18, label: "AI" },
    { left: 55, top: 82, label: "AD" },
    { left: 85, top: 50, label: "PIV" },
  ],
  [GameState.PJ_ATTACK]: [
    { left: 15, top: 50, label: "P-J" },
    { left: 35, top: 18, label: "AL" },
    { left: 35, top: 82, label: "AL" },
    { left: 80, top: 25, label: "PIV" },
    { left: 80, top: 75, label: "PIV" },
  ],
  [GameState.PJ_DEFENSE]: [
    { left: 7, top: 50, label: "POR" },
    { left: 25, top: 22, label: "DEF" },
    { left: 25, top: 78, label: "DEF" },
    { left: 45, top: 22, label: "DEF" },
    { left: 45, top: 78, label: "DEF" },
  ],
  [GameState.INFERIORITY]: [
    { left: 7, top: 50, label: "POR" },
    { left: 28, top: 50, label: "CIE" },
    { left: 55, top: 22, label: "AL" },
    { left: 55, top: 78, label: "AL" },
  ],
  [GameState.THREE_VS_THREE]: [
    { left: 7, top: 50, label: "POR" },
    { left: 28, top: 50, label: "CIE" },
    { left: 55, top: 22, label: "AL" },
    { left: 55, top: 78, label: "AL" },
  ],
  [GameState.SUPERIORITY]: [
    { left: 7, top: 50, label: "POR" },
    { left: 28, top: 50, label: "CIE" },
    { left: 55, top: 18, label: "AL" },
    { left: 55, top: 82, label: "AL" },
    { left: 85, top: 50, label: "PIV" },
  ],
};

interface StatsExportTemplateProps {
  matchData: MatchData;
  goals: number;
  opponentGoals: number;
  formatTime: (ms: number) => string;
  reportType?: "TEAM" | Role;
}

const renderPitchOriginMap = (goalie: Player, isOpponent: boolean, events: GameEvent[], compact: boolean = false) => {
  const rows = ["A", "B", "C"];
  const cols = ["1", "2", "3"];
  const goalieEvents = events.filter((e) => {
    // Note: In some contexts (like the report) we might not have goalie.isOnPitch reliably if it's a static snapshot
    // but usually report only includes relevant players.
    const isGoalieInvolved = e.playerIds.includes(goalie.id) || (e.metadata?.isOpponent !== goalie.isOpponent && (goalie.isOnPitch ?? true));
    return isGoalieInvolved && (
      e.type === GoalieAction.SAVE || 
      e.type === GoalieAction.SAVE_PARRY || 
      e.type === GoalieAction.SAVE_CATCH || 
      e.type === GoalieAction.GOAL_CONCEDED || 
      e.type === ActionType.SHOT ||
      e.type === ActionType.GOAL
    );
  });

  return (
    <div className={`grid grid-cols-3 grid-rows-3 gap-1 aspect-[2/3] w-full ${compact ? 'max-w-[100px]' : 'max-w-[140px]'} mx-auto border border-white/10 rounded-lg bg-black/40 p-1 relative overflow-hidden`}>
      <div className="absolute inset-0 pointer-events-none opacity-20 flex flex-col">
        <div className="flex-1 border-b border-dashed border-white/30" />
        <div className="flex-1" />
      </div>
      
      {rows.map((r) =>
        cols.map((c) => {
          const id = `${r}${c}`;
          const count = goalieEvents.filter((e) => e.originGrid === id).length;
          return (
            <div
              key={id}
              className={`relative flex items-center justify-center rounded-sm border ${count > 0 ? (isOpponent ? "bg-red-500/20 border-red-500/30" : "bg-blue-500/20 border-blue-500/30") : "bg-white/[0.02] border-white/5"}`}
            >
              {count > 0 && (
                <span className={`text-[10px] font-black ${isOpponent ? 'text-red-400' : 'text-blue-400'}`}>
                  {count}
                </span>
              )}
              <span className="absolute bottom-0.5 right-0.5 text-[5px] font-mono opacity-10 text-white uppercase">{id}</span>
            </div>
          );
        })
      )}
    </div>
  );
};

const StatsExportTemplate = React.forwardRef<
  HTMLDivElement,
  StatsExportTemplateProps
>(({ matchData, goals, opponentGoals, formatTime, reportType = "TEAM" }, ref) => {
  const isGoalkeeperReport = reportType === Role.GOALKEEPER;
  
  const relevantPlayers = matchData.players.filter(p => 
    p.role !== Role.COACH && 
    p.role !== Role.DELEGATE &&
    (reportType === "TEAM" || p.role === reportType)
  );

  const localPlayers = relevantPlayers.filter(p => !p.isOpponent);
  const rivalPlayers = relevantPlayers.filter(p => p.isOpponent);

  const renderGoalieSection = (players: Player[], teamName: string, isOpponent: boolean) => (
    <div className="flex flex-col gap-10">
      <div className="flex items-center gap-4 border-b border-white/10 pb-4">
        <div className={`w-3 h-3 rounded-full ${isOpponent ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]'}`} />
        <h3 className="text-xl font-black italic uppercase tracking-wider text-slate-100">
          PORTEROS {isOpponent ? 'RIVALES' : 'LOCALES'} - {teamName.toUpperCase()}
        </h3>
      </div>
      
      <div className="flex flex-col gap-12">
        {players.map((p) => {
          const goalieEvents = matchData.events.filter((e) => e.playerIds.includes(p.id));
          const saves = p.stats.saves;
          const conceded = p.stats.conceded;
          const shotsFaced = saves + conceded;
          const effectiveness = shotsFaced > 0 ? ((saves / shotsFaced) * 100).toFixed(1) : "0.0";

          return (
            <div
              key={p.id}
              className="flex flex-col gap-8 bg-white/[0.02] border border-white/5 rounded-[40px] p-10"
            >
              {/* GK Identity and Quick Stats */}
              <div className="flex justify-between items-center border-b border-white/10 pb-8">
                <div className="flex items-center gap-6">
                  <div className={`w-20 h-20 ${isOpponent ? 'bg-red-600 shadow-[0_10px_30px_rgba(220,38,38,0.3)]' : 'bg-blue-600 shadow-[0_10px_30px_rgba(37,99,235,0.3)]'} rounded-3xl flex items-center justify-center text-3xl font-black text-white`}>
                    {p.number}
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white">
                      {p.name}
                    </h2>
                    <div className="flex gap-4 mt-2">
                      <span className={`text-[10px] font-black ${isOpponent ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/20'} px-3 py-1 rounded-full border uppercase tracking-widest`}>
                        {formatPlayerTime(p.individualTimeSeconds)} EN PISTA
                      </span>
                      <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 uppercase tracking-widest">
                        {effectiveness}% EFECTIVIDAD
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-8">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      PARADAS
                    </span>
                    <span className={`text-4xl font-black ${isOpponent ? 'text-rose-400' : 'text-amber-500'} tabular-nums`}>
                      {saves}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      G. ENC
                    </span>
                    <span className="text-4xl font-black text-red-500 tabular-nums">
                      {conceded}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      T. REC
                    </span>
                    <span className={`text-4xl font-black ${isOpponent ? 'text-red-400' : 'text-blue-500'} tabular-nums`}>
                      {shotsFaced}
                    </span>
                  </div>
                </div>
              </div>

              {/* Goal Map and Pitch Map Row */}
              <div className="grid grid-cols-3 gap-8">
                <div className="flex flex-col gap-4">
                  <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <MapIcon size={14} /> ORIGEN DE TIRO (PISTA)
                  </h4>
                  <div className="flex-1 flex items-center justify-center">
                    {renderPitchOriginMap(p, isOpponent, matchData.events)}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Shield size={14} /> IMPACTO (PORTERÍA)
                  </h4>
                  <div className="aspect-[3/2] bg-slate-900 rounded-[32px] border border-white/5 relative overflow-hidden flex items-center justify-center p-4">
                    {/* Simplified Goal Representation */}
                    <div className="absolute inset-x-8 bottom-0 top-6 border-x-4 border-t-4 border-white/40 rounded-t-lg"></div>
                    <div className="absolute inset-x-8 bottom-0 h-[2px] bg-white/20"></div>

                    {[...Array(9)].map((_, i) => {
                      const zoneId = `G${i + 1}`;
                      const zoneEvents = goalieEvents.filter(e => e.metadata?.zone === zoneId || e.destinationGrid === zoneId);
                      const zoneSaves = zoneEvents.filter(e => e.type !== GoalieAction.GOAL_CONCEDED && e.type !== ActionType.GOAL).length;
                      const zoneGoals = zoneEvents.filter(e => e.type === GoalieAction.GOAL_CONCEDED || e.type === ActionType.GOAL).length;
                      
                      // Zone coordinates (standard 3x3 grid)
                      const x = (i % 3) * 30 + 20;
                      const y = Math.floor(i / 3) * 30 + 25;

                      if (zoneSaves === 0 && zoneGoals === 0) return null;

                      return (
                        <div 
                          key={zoneId}
                          className="absolute flex flex-col items-center"
                          style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                        >
                          <div className="flex gap-1">
                             {zoneSaves > 0 && (
                               <div className="w-6 h-6 rounded-full bg-amber-500 border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-lg">
                                 {zoneSaves}
                               </div>
                             )}
                             {zoneGoals > 0 && (
                               <div className="w-6 h-6 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-lg">
                                 {zoneGoals}
                               </div>
                             )}
                          </div>
                        </div>
                      );
                    })}

                    {goalieEvents.filter(e => e.metadata?.zone || e.destinationGrid).length === 0 && (
                      <span className="text-[10px] font-black text-slate-700 uppercase italic">Sin datos de zona</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Activity size={14} /> ACCIONES REGISTRADAS
                  </h4>
                  <div className="grid grid-cols-2 gap-4 h-full">
                    {[
                      { label: 'GOLES', value: p.stats.goals, color: 'text-green-500' },
                      { label: 'TIROS', value: p.stats.shots, color: 'text-amber-500' },
                      { label: 'RECUPER.', value: p.stats.steals, color: 'text-purple-400' },
                      { label: 'PÉRDIDAS', value: p.stats.losses, color: 'text-red-400' },
                      { label: 'FALTAS', value: p.stats.fouls, color: 'text-orange-400' },
                      { label: 'ASIST.', value: p.stats.assists, color: 'text-blue-400' },
                    ].map((action, i) => (
                      <div key={i} className="bg-black/30 border border-white/5 p-4 rounded-2xl flex flex-col justify-center">
                         <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">{action.label}</span>
                         <span className={`text-2xl font-black ${action.color} tabular-nums leading-none`}>{action.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Timeline simple */}
              <div className="flex flex-col gap-3">
                 <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-2 mb-1">Últimas Intervenciones</h4>
                 <div className="grid grid-cols-3 gap-3">
                    {goalieEvents
                      .filter(e => e.type === GoalieAction.SAVE || e.type === GoalieAction.SAVE_PARRY || e.type === GoalieAction.SAVE_CATCH || e.type === GoalieAction.GOAL_CONCEDED)
                      .slice(-6)
                      .reverse()
                      .map((e, idx) => (
                        <div key={idx} className="bg-white/5 p-3 rounded-xl border border-white/5 flex items-center gap-3">
                           <span className="font-mono text-[9px] text-blue-400 font-bold">{formatTime(e.timestamp)}</span>
                           <span className={`text-[8px] font-black uppercase ${e.type === GoalieAction.GOAL_CONCEDED ? 'text-red-400' : 'text-amber-400'}`}>
                             {e.type === GoalieAction.GOAL_CONCEDED ? 'GOL ENCAJADO' : 'PARADA'}
                           </span>
                        </div>
                    ))}
                 </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "850px",
        minHeight: "1200px",
        height: "auto",
        backgroundColor: "#0A0B0E",
        color: "white",
        padding: "50px",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: "40px",
        zIndex: -100,
        opacity: 0.01,
        pointerEvents: "none",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@400;700;800&display=swap');
      `}</style>
      
      {/* Header Corporativo / Técnico */}
      <div className="flex justify-between items-start border-b-2 border-blue-500/30 pb-10">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-[10px] font-black text-white px-3 py-1 uppercase tracking-[0.3em] rounded-sm">
              {isGoalkeeperReport ? "GOALKEEPER SPECIALIST REPORT" : "TECHNICAL DEPARTMENT"}
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Match Analysis Report • ID #STAT-{Math.floor(Math.random() * 9000 + 1000)}
            </span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-4">
              {matchData.teamLogo && (
                <img src={matchData.teamLogo} alt="Logo" className="w-12 h-12 object-contain rounded-lg" />
              )}
              <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white">
                {matchData.teamName}
              </h1>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-slate-500 text-sm font-bold uppercase">vs</span>
              <div className="flex items-center gap-3">
                {matchData.opponentLogo && (
                  <img src={matchData.opponentLogo} alt="Logo Rival" className="w-8 h-8 object-contain rounded-lg opacity-80" />
                )}
                <span className="text-xl font-black text-slate-400 uppercase tracking-tight">
                  {matchData.opponentName}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-3">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-6 backdrop-blur-md">
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-black text-blue-400 uppercase mb-1">FINAL SCORE</span>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black text-white">{goals}</span>
                <span className="text-xl font-black text-slate-600">-</span>
                <span className="text-5xl font-black text-slate-400">{opponentGoals}</span>
              </div>
            </div>
          </div>
          <div className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-widest">
            {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()}
          </div>
        </div>
      </div>

      {isGoalkeeperReport ? (
        /* SPECIALIZED GOALKEEPER VIEW - DETAILED */
        <div className="flex-1 flex flex-col gap-20">
          {localPlayers.length > 0 && renderGoalieSection(localPlayers, matchData.teamName, false)}
          {rivalPlayers.length > 0 && renderGoalieSection(rivalPlayers, matchData.opponentName, true)}
        </div>
      ) : (
        /* GLOBAL TEAM VIEW — TABLA + BARRAS + ARAÑA */
        (() => {
          const allTeams = [
            { players: localPlayers, teamName: matchData.teamName, accent: '#3b82f6', isOpponent: false },
            { players: rivalPlayers, teamName: matchData.opponentName, accent: '#ef4444', isOpponent: true },
          ].filter(t => t.players.length > 0);

          const ITEMS = [
            { key: 'goals', label: 'Goles', color: '#22c55e', fn: (p: Player) => p.stats.goals || 0 },
            { key: 'shots', label: 'Tiros tot.', color: '#f59e0b', fn: (p: Player) => (p.stats.shots || 0) + (p.stats.goals || 0) },
            { key: 'shotsOT', label: 'Tiros p.', color: '#fb923c', fn: (p: Player) => p.stats.shots || 0 },
            { key: 'losses', label: 'Pérdidas', color: '#ef4444', fn: (p: Player) => p.stats.losses || 0 },
            { key: 'recoveries', label: 'Recuperac.', color: '#a855f7', fn: (p: Player) => p.stats.steals || 0 },
            { key: 'foulsC', label: 'Faltas com.', color: '#f97316', fn: (p: Player) => p.stats.fouls || 0 },
            { key: 'foulsR', label: 'Faltas rec.', color: '#64748b', fn: (p: Player) => p.stats.errors || 0 },
            { key: 'cards', label: 'Tarjetas', color: '#fbbf24', fn: (p: Player) => (p.stats.yellowCards || 0) + (p.stats.redCards || 0) },
            { key: 'minutes', label: 'Minutos', color: '#38bdf8', fn: (p: Player) => Math.round((p.individualTimeSeconds || 0) / 60) },
          ];

          const ROLE_ORDER = [Role.GOALKEEPER, Role.PLAYER];
          const ROLE_LABELS: Record<string, string> = { GOALKEEPER: 'Porteros', PLAYER: 'Jugadores de campo' };

          const renderTable = (players: Player[], accent: string) => (
            <div style={{ overflowX: 'auto', marginBottom: 32 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px', color: '#94a3b8', fontWeight: 900, fontSize: 9, textTransform: 'uppercase', minWidth: 100 }}>Jugador</th>
                    {ITEMS.map(it => (
                      <th key={it.key} style={{ textAlign: 'center', padding: '4px 4px', color: it.color, fontWeight: 900, fontSize: 8, textTransform: 'uppercase' }}>{it.label.replace('.', '')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROLE_ORDER.map(role => {
                    const group = players.filter(p => p.role === role);
                    if (group.length === 0) return null;
                    return [
                      <tr key={`grp-${role}`} style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <td colSpan={ITEMS.length + 1} style={{ padding: '3px 6px', color: '#64748b', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {ROLE_LABELS[role] || role}
                        </td>
                      </tr>,
                      ...group.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '4px 6px', color: 'white', fontWeight: 700, fontSize: 10 }}>
                            <span style={{ color: accent, marginRight: 4, fontWeight: 900 }}>{p.number}</span>{p.name}
                          </td>
                          {ITEMS.map(it => (
                            <td key={it.key} style={{ textAlign: 'center', padding: '4px 4px', color: it.fn(p) > 0 ? it.color : '#334155', fontWeight: it.fn(p) > 0 ? 900 : 400, fontSize: 10 }}>
                              {it.fn(p)}
                            </td>
                          ))}
                        </tr>
                      ))
                    ];
                  })}
                </tbody>
              </table>
            </div>
          );

          const renderBarCharts = (players: Player[], accent: string) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginBottom: 40 }}>
              {ITEMS.map(item => {
                const vals = players.map(p => item.fn(p));
                const maxVal = Math.max(...vals, 1);
                const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
                const avgPct = Math.round((avg / maxVal) * 100);
                return (
                  <div key={item.key}>
                    <div style={{ fontSize: 9, fontWeight: 900, color: item.color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{item.label}</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
                      {players.map((p, i) => {
                        const pct = maxVal > 0 ? (vals[i] / maxVal) * 100 : 0;
                        const barH = Math.max(2, Math.round((pct / 100) * 52));
                        return (
                          <div key={p.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 700 }}>{vals[i]}</div>
                            <div style={{ width: '60%', height: barH, background: item.color, borderRadius: '2px 2px 0 0', opacity: pct > 0 ? 1 : 0.15 }} />
                            <div style={{ fontSize: 8, color: '#64748b', textAlign: 'center', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.name.split(' ')[0]}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <div style={{ fontSize: 8, color: '#64748b', fontWeight: 900, minWidth: 52 }}>Prom.</div>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${avgPct}%`, height: '100%', background: item.color, borderRadius: 3, opacity: 0.7 }} />
                      </div>
                      <div style={{ fontSize: 8, color: '#64748b', minWidth: 24, textAlign: 'right' }}>{avg.toFixed(1)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );

          const renderSpiders = (players: Player[]) => {
            const SPIDER_ITEMS = [
              { label: 'Goles', fn: (p: Player) => p.stats.goals || 0, isRed: false },
              { label: 'Tiros', fn: (p: Player) => p.stats.shots || 0, isRed: true },
              { label: 'Pérd.', fn: (p: Player) => p.stats.losses || 0, isRed: true },
              { label: 'Recup.', fn: (p: Player) => p.stats.steals || 0, isRed: false },
              { label: 'Min.', fn: (p: Player) => Math.round((p.individualTimeSeconds || 0) / 60), isRed: true },
            ];
            const maxVals = SPIDER_ITEMS.map(it => Math.max(...players.map(p => it.fn(p)), 1));
            const W = 160, H = 160, cx = 80, cy = 80, R = 55;
            const n = SPIDER_ITEMS.length;
            const angles = SPIDER_ITEMS.map((_, i) => (Math.PI * 2 * i / n) - Math.PI / 2);

            const redGrad = (v: number) => {
              const t = (v - 1) / 4;
              const r = Math.round(140 + t * 90);
              const g = Math.round(45 - t * 45);
              const b = Math.round(45 - t * 45);
              return `rgb(${r},${g},${b})`;
            };

            const gridPts = (lv: number) => angles.map(a => `${cx + (lv / 5) * R * Math.cos(a)},${cy + (lv / 5) * R * Math.sin(a)}`).join(' ');

            const maxAtkVal = Math.max(...players.map(p => (p.stats.goals || 0) * 2 + (p.stats.shots || 0)), 1);
            const maxDefVal = Math.max(...players.map(p => Math.max(0, (p.stats.steals || 0) - (p.stats.losses || 0) * 0.5)), 0.1);

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {players.map(p => {
                  const normVals = SPIDER_ITEMS.map((it, i) => {
                    const raw = it.fn(p);
                    return maxVals[i] === 0 ? 1 : Math.round((raw / maxVals[i]) * 4) + 1;
                  });
                  const dataR = normVals.map(v => (v / 5) * R);
                  const dataPts = angles.map((a, i) => `${cx + dataR[i] * Math.cos(a)},${cy + dataR[i] * Math.sin(a)}`).join(' ');

                  const atkScore = (p.stats.goals || 0) * 2 + (p.stats.shots || 0);
                  const defScore = Math.max(0, (p.stats.steals || 0) - (p.stats.losses || 0) * 0.5);
                  const atkPct = Math.round((atkScore / maxAtkVal) * 100);
                  const defPct = Math.round((defScore / maxDefVal) * 100);
                  const diff = atkPct - defPct;
                  const verdict = diff > 15 ? 'Perfil atacante' : diff < -15 ? 'Perfil defensivo' : 'Equilibrado';
                  const verdictColor = diff > 15 ? '#ef4444' : diff < -15 ? '#22c55e' : '#64748b';

                  return (
                    <div key={p.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 9, fontWeight: 900, color: 'white', textAlign: 'center', textTransform: 'uppercase' }}>
                        <span style={{ color: '#64748b', marginRight: 4 }}>#{p.number}</span>{p.name.split(' ')[0]}
                      </div>
                      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                        {[1,2,3,4,5].map(lv => (
                          <polygon key={lv} points={gridPts(lv)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
                        ))}
                        {angles.map((a, i) => (
                          <line key={i} x1={cx} y1={cy} x2={cx + R * Math.cos(a)} y2={cy + R * Math.sin(a)} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
                        ))}
                        <polygon points={dataPts} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth="1.5"/>
                        {angles.map((a, i) => {
                          const px2 = cx + dataR[i] * Math.cos(a);
                          const py2 = cy + dataR[i] * Math.sin(a);
                          const c = SPIDER_ITEMS[i].isRed ? redGrad(normVals[i]) : '#3b82f6';
                          return <circle key={i} cx={px2} cy={py2} r="3" fill={c} stroke="white" strokeWidth="0.5"/>;
                        })}
                        {SPIDER_ITEMS.map((it, i) => {
                          const lx = cx + (R + 12) * Math.cos(angles[i]);
                          const ly = cy + (R + 12) * Math.sin(angles[i]);
                          const c = it.isRed ? redGrad(normVals[i]) : '#94a3b8';
                          return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="7" fill={c}>{it.label}</text>;
                        })}
                      </svg>
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 8, color: '#94a3b8', width: 44 }}>Ataque</span>
                          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${atkPct}%`, height: '100%', background: '#ef4444', borderRadius: 3 }}/>
                          </div>
                          <span style={{ fontSize: 8, color: '#94a3b8', width: 22, textAlign: 'right' }}>{atkPct}%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 8, color: '#94a3b8', width: 44 }}>Defensa</span>
                          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${defPct}%`, height: '100%', background: '#22c55e', borderRadius: 3 }}/>
                          </div>
                          <span style={{ fontSize: 8, color: '#94a3b8', width: 22, textAlign: 'right' }}>{defPct}%</span>
                        </div>
                        <div style={{ marginTop: 4, padding: '3px 8px', borderRadius: 6, background: `${verdictColor}20`, border: `1px solid ${verdictColor}40`, fontSize: 8, fontWeight: 900, color: verdictColor, textAlign: 'center' }}>
                          {verdict}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
              {allTeams.map((team, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: team.accent, boxShadow: `0 0 10px ${team.accent}80` }}/>
                    <h3 style={{ fontSize: 14, fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                      {team.teamName}
                    </h3>
                  </div>

                  <div>
                    <div style={{ fontSize: 9, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                      1. Tabla de estadísticas por posición
                    </div>
                    {renderTable(team.players, team.accent)}
                  </div>

                  <div>
                    <div style={{ fontSize: 9, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                      2. Comparativa por ítem
                    </div>
                    {renderBarCharts(team.players, team.accent)}
                  </div>

                  <div>
                    <div style={{ fontSize: 9, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
                      3. Perfil táctico por jugador
                    </div>
                    {renderSpiders(team.players)}
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      )}

      {/* Footer Branding Analytical */}
      <div className="mt-auto pt-10 border-t border-white/10 flex justify-between items-center">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="text-lg font-black text-white italic tracking-tighter uppercase leading-none">
              Control Táctico Futsal
            </span>
            <div className="h-4 w-[1px] bg-white/20"></div>
            <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em]">
              PRO ANALYTICS
            </span>
          </div>
          <p className="text-[8px] text-slate-600 uppercase font-black tracking-widest mt-1">
            Sistema de Inteligencia Deportiva • Todos los derechos reservados • 2024
          </p>
        </div>
        <div className="flex gap-4 text-slate-700">
          <ShieldCheck size={24} />
          <LayoutDashboard size={24} />
        </div>
      </div>
    </div>
  );
});

const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

const formatPlayerTime = (totalSeconds: number) => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

export default function MatchTracker() {
  const navigate = useNavigate();
  const [matchData, setMatchData] = useState<MatchData>({
    teamName: "EQUIPO LOCAL",
    opponentName: "EQUIPO VISITANTE",
    period: Period.FIRST,
    matchClock: 0,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: {
      team: { period1: false, period2: false },
      opponent: { period1: false, period2: false },
    },
    players: INITIAL_PLAYERS,
    events: [],
  });

  const [gameState, setGameState] = useState<GameState>(GameState.FOUR_VS_FOUR);
  const [rivalGameState, setRivalGameState] = useState<GameState>(GameState.FOUR_VS_FOUR);
  const [isGameStateMenuOpen, setIsGameStateMenuOpen] = useState(false);
  const [isRivalGameStateMenuOpen, setIsRivalGameStateMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "pitch" | "goalie" | "history" | "stats" | "more"
  >("pitch");
  const [statsView, setStatsView] = useState<
    "players" | "team" | "positions" | "maps" | "config"
  >("players");
  const [selectedMapMetric, setSelectedMapMetric] = useState<
    "goals" | "conceded" | "shots" | "received-shots" | "recoveries" | "losses"
  >("goals");
  const [selectedMapPlayerId, setSelectedMapPlayerId] = useState<string | "all">("all");
  const [statsSortKey, setStatsSortKey] = useState<string>("goals");
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isEndFirstConfirmOpen, setIsEndFirstConfirmOpen] = useState(false);
  const [isEndSecondConfirmOpen, setIsEndSecondConfirmOpen] = useState(false);
  const [isDataLocked, setIsDataLocked] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pitchView, setPitchView] = useState<"local" | "opponent">("local");
  const [isExporting, setIsExporting] = useState(false);
  const [reportType, setReportType] = useState<"TEAM" | Role>("TEAM");
  const [showRivalStats, setShowRivalStats] = useState(false);
  const [isConfigVisible, setIsConfigVisible] = useState(false);
  const [swapSelection, setSwapSelection] = useState<string | null>(null);
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [activeActionPlayerId, setActiveActionPlayerId] = useState<
    string | null
  >(null);
  const [activeSlotToAdd, setActiveSlotToAdd] = useState<{
    index: number;
    isOpponent: boolean;
  } | null>(null);
  const [selectedGoalieId, setSelectedGoalieId] = useState<string | null>(null);
  const [deleteConfirmEvent, setDeleteConfirmEvent] =
    useState<GameEvent | null>(null);
  const [isEditingTeams, setIsEditingTeams] = useState(false);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const [flashFeedback, setFlashFeedback] = useState<string | null>(null);
  const [showFoulWarning, setShowFoulWarning] = useState<{
    team: string;
    isLocal: boolean;
    count: number;
  } | null>(null);
  const [isLocalTeamOpen, setIsLocalTeamOpen] = useState(false);
  const [isOpponentTeamOpen, setIsOpponentTeamOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: ActionType | GoalieAction;
    playerId?: string;
    isOpponent: boolean;
    originGrid?: string;
    destinationGrid?: string;
    setPiece?: "normal" | "penalty" | "double_penalty";
    step: "origin" | "target" | "player" | null;
  } | null>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const pdfPage1Ref = useRef<HTMLDivElement>(null);
  const pdfPage2Ref = useRef<HTMLDivElement>(null);
  const pdfPage3Ref = useRef<HTMLDivElement>(null);
  const pdfPage4Ref = useRef<HTMLDivElement>(null);
  const pdfPage5Ref = useRef<HTMLDivElement>(null);
  const pdfPage6Ref = useRef<HTMLDivElement>(null);
  const dynamicExportRef = useRef<HTMLDivElement>(null);

  const [isTacticalModalOpen, setIsTacticalModalOpen] = useState(false);
  const [tacticalReport, setTacticalReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isEditingLocalName, setIsEditingLocalName] = useState(false);
  const [isEditingOpponentName, setIsEditingOpponentName] = useState(false);
  const [isSyncingTacticalPro, setIsSyncingTacticalPro] = useState(false);

  const handleTacticalAnalysis = async () => {
    setIsTacticalModalOpen(true);
    setIsGeneratingReport(true);
    setTacticalReport(null);
    try {
      const res = await fetch('/api/tactical-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchData }),
      });
      const data = await res.json();
      if (data.analysis) {
        setTacticalReport(data.analysis);
        try {
          const cleanData = JSON.parse(JSON.stringify({
            ...matchData,
            timestamp: new Date().toISOString(),
            tacticalAnalysis: data.analysis,
          }));
          await addDoc(collection(db, 'partidos'), cleanData);
        } catch (saveErr) {
          console.warn('No se pudo guardar en Firestore:', saveErr);
        }
      } else {
        alert('Error en el análisis: ' + JSON.stringify(data));
      }
    } catch (e: any) {
      console.error(e);
      alert('Error al conectar con TACTICAL PRO: ' + (e.message || 'Error desconocido'));
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const playAlertSound = (count: number) => {
    if (!soundAlertsEnabled) return;
    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      
      const playBeep = (freq: number, startTime: number, duration: number) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };

      // Sound logic
      if (count === 5) {
        // Triple urgent beep for 5th foul
        playBeep(1100, context.currentTime, 0.2);
        playBeep(1100, context.currentTime + 0.25, 0.2);
        playBeep(1300, context.currentTime + 0.5, 0.5);
      } else {
        // Double beep for 4th foul
        playBeep(880, context.currentTime, 0.3);
        playBeep(1100, context.currentTime + 0.35, 0.4);
      }
    } catch (e) {
      console.error("Error playing sound:", e);
    }
  };

  useEffect(() => {
    if (activeTab === "pitch" || !editingPlayerId) {
      window.scrollTo(0, 0);
    }
  }, [activeTab, editingPlayerId]);

  useEffect(() => {
    // Prevent scroll restoration on iOS
    window.scrollTo(0, 0);
  }, []);

  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (matchData.isClockRunning) {
      lastTickRef.current = Date.now();
      interval = setInterval(() => {
        const now = Date.now();
        const delta = now - lastTickRef.current;
        lastTickRef.current = now;

        setMatchData((prev) => ({
          ...prev,
          matchClock: prev.matchClock + delta,
          players: prev.players.map((p) =>
            p.isOnPitch
              ? {
                  ...p,
                  individualTimeSeconds: p.individualTimeSeconds + delta / 1000,
                }
              : p,
          ),
        }));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [matchData.isClockRunning]);

  const toggleClock = () => {
    if (isDataLocked) return;
    setMatchData((prev) => ({ ...prev, isClockRunning: !prev.isClockRunning }));
  };

  const handlePeriodTransition = () => {
    setMatchData((prev) => {
      const currentGoals = prev.events.filter((e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent).length;
      const currentOpponentGoals = prev.events.filter((e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && e.metadata?.isOpponent).length;
      const score = { team: currentGoals, opponent: currentOpponentGoals };

      if (prev.period === Period.FIRST) {
        return {
          ...prev,
          period: Period.SECOND,
          matchClock: 0,
          isClockRunning: false,
          fouls: { team: 0, opponent: 0 },
          events: [
            {
              id: `event-p1-end-${Date.now()}`,
              timestamp: prev.matchClock,
              wallClock: Date.now(),
              period: Period.FIRST,
              playerIds: [],
              type: ActionType.FORMATION_CHANGE,
              gameState: GameState.FOUR_VS_FOUR,
              metadata: { system: true, label: "FIN 1ª PARTE" },
              scoreAtEvent: score
            },
            ...prev.events
          ]
        };
      }
      return {
        ...prev,
        period: Period.FINISHED,
        isClockRunning: false,
        events: [
          {
            id: `event-match-end-${Date.now()}`,
            timestamp: prev.matchClock,
            wallClock: Date.now(),
            period: prev.period,
            playerIds: [],
            type: ActionType.FORMATION_CHANGE,
            gameState: GameState.FOUR_VS_FOUR,
            metadata: { system: true, label: "FIN PARTIDO" },
            scoreAtEvent: score
          },
          ...prev.events
        ]
      };
    });
  };

  const resetTimer = () => {
    setIsResetConfirmOpen(true);
  };

  const handleConfirmReset = () => {
    setMatchData((prev) => ({
      ...prev,
      matchClock: 0,
      isClockRunning: false,
      players: prev.players.map((p) => ({ ...p, individualTimeSeconds: 0 })),
    }));
    setIsResetConfirmOpen(false);
    setIsDataLocked(false);
  };

  const handleConfirmEndFirst = () => {
    setMatchData((prev) => ({
      ...prev,
      period: Period.SECOND,
      matchClock: 0,
      isClockRunning: false,
      fouls: { team: 0, opponent: 0 },
    }));
    setIsEndFirstConfirmOpen(false);
    setIsDataLocked(true);
  };

  const handleConfirmEndSecond = () => {
    setMatchData((prev) => ({
      ...prev,
      period: Period.FINISHED,
      matchClock: 0,
      isClockRunning: false,
    }));
    setIsEndSecondConfirmOpen(false);
    setIsDataLocked(true);
  };

  const copySummaryToClipboard = () => {
    const goalsList = matchData.events
      .filter((e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent)
      .map((e) => {
        const p = matchData.players.find((pl) => pl.id === e.playerIds[0]);
        return `• ${p?.name || "N/A"} (${formatTime(e.timestamp)})`;
      });

    const opponentGoalsList = matchData.events
      .filter((e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && e.metadata?.isOpponent)
      .map((e) => {
        const p = matchData.players.find((pl) => pl.id === e.playerIds[0]);
        return `• ${p?.name || "N/A"} (${formatTime(e.timestamp)})`;
      });

    const localStats = {
      shots: matchData.players.filter(p => !p.isOpponent).reduce((acc, p) => acc + (p.stats.shots || 0), 0),
      steals: matchData.players.filter(p => !p.isOpponent).reduce((acc, p) => acc + (p.stats.steals || 0), 0),
      losses: matchData.players.filter(p => !p.isOpponent).reduce((acc, p) => acc + (p.stats.losses || 0), 0),
      yellowCards: matchData.players.filter(p => !p.isOpponent).reduce((acc, p) => acc + (p.stats.yellowCards || 0), 0),
      redCards: matchData.players.filter(p => !p.isOpponent).reduce((acc, p) => acc + (p.stats.redCards || 0), 0),
    };

    const summaryText = `⚽ *RESULTADO FINAL* ⚽\n` +
      `*${matchData.teamName} ${goals} - ${opponentGoals} ${matchData.opponentName}*\n\n` +
      `🥅 *Goleadores (${matchData.teamName}):*\n${goalsList.length > 0 ? goalsList.join("\n") : "Sin goles registrados"}\n\n` +
      `🥅 *Goleadores (${matchData.opponentName}):*\n${opponentGoalsList.length > 0 ? opponentGoalsList.join("\n") : "Sin goles registrados"}\n\n` +
      `📊 *ESTADÍSTICAS LOCAL (${matchData.teamName})* 📊\n` +
      `• Remates Totales: ${localStats.shots}\n` +
      `• Recuperaciones: ${localStats.steals}\n` +
      `• Pérdidas de Balón: ${localStats.losses}\n` +
      `• Faltas Cometidas: ${matchData.fouls.team}\n` +
      `• Tarjetas: ${localStats.yellowCards}🟨 ${localStats.redCards}🟥\n\n` +
      `⚠️ *Faltas Rival:* ${matchData.fouls.opponent}\n\n` +
      `📊 _Enviado desde Futsal Commander Pro_`;

    navigator.clipboard.writeText(summaryText).then(() => {
      setFlashFeedback("Resumen Completo Copiado");
      setTimeout(() => setFlashFeedback(null), 3000);
    }).catch(err => {
      console.error('Error al copiar: ', err);
    });
  };

  const handleExportCSV = () => {
    exportToCSV(matchData);
    
    setFlashFeedback("Exportación para Sheets generada");
    setTimeout(() => setFlashFeedback(null), 3000);
  };

  const handleDynamicExport = async (format: "PNG" | "PDF") => {
    if (!dynamicExportRef.current) return;
    setIsExporting(true);

    try {
      // Small delay to ensure styles are applied
      await new Promise((resolve) => setTimeout(resolve, 300));

      const dataUrl = await toPng(dynamicExportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0A0B0E",
        style: {
          opacity: "1",
          visibility: "visible",
        },
      });

      if (!dataUrl || dataUrl === "data:," || dataUrl.length < 1000) {
        throw new Error("Generación de imagen fallida o imagen vacía");
      }

      const teamNameStr = showRivalStats ? matchData.opponentName : matchData.teamName;
      const baseFileName = `export_${activeTab === "goalie" ? "porteros" : `stats_${statsView}`}_${teamNameStr.replace(/\s+/g, "_")}_${Date.now()}`;

      if (format === "PNG") {
        const link = document.createElement("a");
        link.download = `${baseFileName}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (format === "PDF") {
        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve) => {
          img.onload = resolve;
        });

        const pdf = new jsPDF({
          orientation: img.width > img.height ? "landscape" : "portrait",
          unit: "px",
          format: [img.width, img.height]
        });

        pdf.addImage(dataUrl, "PNG", 0, 0, img.width, img.height);
        pdf.save(`${baseFileName}.pdf`);
      }
    } catch (err) {
      console.error("Export failed", err);
      alert("Hubo un error al exportar. Por favor, inténtalo de nuevo.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = async (type: "TEAM" | Role = "TEAM") => {
    setReportType(type);
    setIsExporting(true);

    // For TEAM type generate a proper multi-page PDF
    if (type === "TEAM") {
      try {
        await new Promise(r => setTimeout(r, 600));

        const captureOpts = {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: "#ffffff",
          style: { opacity: "1", visibility: "visible" },
        };

        const refs = [pdfPage1Ref, pdfPage2Ref, pdfPage3Ref, pdfPage4Ref, pdfPage5Ref, pdfPage6Ref];
        const images: string[] = [];

        for (const ref of refs) {
          if (!ref.current) continue;
          const url = await toPng(ref.current, { ...captureOpts, width: ref.current.offsetWidth });
          if (url && url.length > 1000) images.push(url);
        }

        if (images.length === 0) throw new Error("No pages generated");

        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pdfW = pdf.internal.pageSize.getWidth();   // 210mm
        const pdfH = pdf.internal.pageSize.getHeight();  // 297mm

        for (let i = 0; i < images.length; i++) {
          if (i > 0) pdf.addPage();
          const img = new Image();
          img.src = images[i];
          await new Promise(r => { img.onload = r; });
          const imgAspect = img.height / img.width;
          const imgH = Math.min(pdfH, pdfW * imgAspect);
          pdf.addImage(images[i], "PNG", 0, 0, pdfW, imgH);
        }

        const fileName = `informe_${matchData.teamName.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
        pdf.save(fileName);
      } catch (err) {
        console.error("PDF export failed", err);
        alert("Error al generar el PDF. Inténtalo de nuevo.");
      } finally {
        setIsExporting(false);
      }
      return;
    }

    // For other types (goalkeeper) keep PNG export
    if (!exportRef.current) { setIsExporting(false); return; }
    try {
      await new Promise(r => setTimeout(r, 500));
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true, pixelRatio: 2, backgroundColor: "#0A0B0E", width: 850,
        style: { opacity: "1", visibility: "visible" },
      });
      if (!dataUrl || dataUrl === "data:," || dataUrl.length < 1000) throw new Error("Empty image");
      const fileName = `stats_${matchData.teamName.replace(/\s+/g, "_")}_${Date.now()}.png`;
      const downloadImage = () => {
        const link = document.createElement("a");
        link.download = fileName; link.href = dataUrl;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
      };
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], fileName, { type: "image/png" });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `Estadísticas ${matchData.teamName}` });
        } else { downloadImage(); }
      } catch { downloadImage(); }
    } catch (err) { console.error("Export failed", err); }
    finally { setIsExporting(false); }
  };

  const handleGameStateChange = (newState: GameState, isOpponent: boolean) => {
    if (isOpponent) {
      setRivalGameState(newState);
      setIsRivalGameStateMenuOpen(false);
    } else {
      setGameState(newState);
      setIsGameStateMenuOpen(false);
    }

    setMatchData((prev) => {
      // Automatic player adjustments based on new formation
      const newSlots = PITCH_SYSTEMS[newState] || PITCH_SYSTEMS[GameState.FOUR_VS_FOUR];
      const maxSlots = newSlots.length;
      const isFixedGK = newState !== GameState.PJ_ATTACK;

      const updatedPlayers = prev.players.map(p => {
        if (p.isOpponent !== isOpponent) return p;
        if (!p.isOnPitch) return p;

        let shouldKeep = true;
        const pos = p.pitchPosition ?? 0;

        // 1. Remove if position index no longer exists in new formation
        if (pos >= maxSlots) {
          shouldKeep = false;
        }

        // 2. Fixed GK enforcement: Position with label "POR" must be a Goalkeeper
        if (isFixedGK && shouldKeep) {
          const slotLabel = newSlots[pos]?.label;
          if (slotLabel === "POR" && p.role !== Role.GOALKEEPER) {
            shouldKeep = false;
          }
          // Also, Goalkeepers shouldn't be in field positions in fixed GK formations
          if (slotLabel !== "POR" && p.role === Role.GOALKEEPER) {
            shouldKeep = false;
          }
        }

        if (!shouldKeep) {
          return { ...p, isOnPitch: false, pitchPosition: undefined };
        }

        return p;
      });

      const currentGoals = prev.events.filter(
        (e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent
      ).length;
      const currentOpponentGoals = prev.events.filter(
        (e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && e.metadata?.isOpponent
      ).length;

      return {
        ...prev,
        players: updatedPlayers,
        events: [
          ...prev.events,
          {
            id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: prev.matchClock,
            wallClock: Date.now(),
            period: prev.period,
            playerIds: [],
            type: ActionType.FORMATION_CHANGE,
            gameState: newState,
            metadata: { isOpponent },
            onPitchPlayerIds: updatedPlayers.filter(p => p.isOnPitch).map(p => p.id),
            scoreAtEvent: { team: currentGoals, opponent: currentOpponentGoals },
          },
        ],
      };
    });
  };

  const handleFoul = (isTeam: boolean, playerId?: string) => {
    if (isDataLocked) return;
    const newCount = matchData.fouls[isTeam ? "team" : "opponent"] + 1;

    if (newCount === 4 || newCount === 5) {
      playAlertSound(newCount);
      setShowFoulWarning({
        team: isTeam ? matchData.teamName : matchData.opponentName,
        isLocal: isTeam,
        count: newCount,
      });
      // Auto-hide after 5 seconds
      setTimeout(() => setShowFoulWarning(null), 5000);
    }

    setMatchData((prev) => {
      const nextPlayers = prev.players.map((p) => {
        if (p.id === playerId) {
          return {
            ...p,
            stats: { ...p.stats, fouls: p.stats.fouls + 1 },
          };
        }
        return p;
      });

      return {
        ...prev,
        fouls: {
          ...prev.fouls,
          [isTeam ? "team" : "opponent"]: newCount,
        },
        events: [
          {
            id: `event-foul-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: prev.matchClock,
            wallClock: Date.now(),
            period: prev.period,
            playerIds: playerId ? [playerId] : [],
            type: ActionType.FOUL,
            gameState,
            metadata: { isOpponent: !isTeam },
            scoreAtEvent: {
              team: prev.events.filter((e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent).length,
              opponent: prev.events.filter((e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && e.metadata?.isOpponent).length,
            },
          },
          ...prev.events,
        ],
        players: nextPlayers,
      };
    });
  };

  const handleAction = (
    type: ActionType | GoalieAction,
    playerId?: string,
    metadata?: any,
  ) => {
    if (matchData.period === Period.FINISHED || isDataLocked) return;
    const actingPlayer = playerId
      ? matchData.players.find((p) => p.id === playerId)
      : null;
    const isOpponentEvent =
      metadata?.metadata?.isOpponent ??
      (actingPlayer
        ? type === GoalieAction.GOAL_CONCEDED
          ? !actingPlayer.isOpponent
          : actingPlayer.isOpponent
        : false);

    if (type === ActionType.FOUL) {
      handleFoul(!isOpponentEvent, playerId);
      return;
    }
    const isGoal =
      type === ActionType.GOAL || type === GoalieAction.GOAL_CONCEDED;
    
    const needsOrigin = [
      ActionType.SHOT, 
      ActionType.GOAL, 
      GoalieAction.GOAL_CONCEDED, 
      ActionType.STEAL, 
      ActionType.INTERCEPTION, 
      ActionType.LOSS, 
      ActionType.UNFORCED_ERROR
    ].includes(type as any);

    if (needsOrigin && !metadata?.originGrid) {
      const onlyNeedsOrigin = [
        ActionType.STEAL, 
        ActionType.INTERCEPTION, 
        ActionType.LOSS, 
        ActionType.UNFORCED_ERROR
      ].includes(type as any);

      setPendingAction({
        type: type as any,
        playerId,
        isOpponent: isOpponentEvent,
        step:
          type === GoalieAction.GOAL_CONCEDED && !playerId
            ? "player"
            : isOpponentEvent
              ? "origin"
              : playerId
                ? "origin"
                : "player",
      });
      return;
    }

    const activeGK = matchData.players.find(
      (p) => p.isOnPitch && p.role === Role.GOALKEEPER && !p.isOpponent,
    );
    const activeOppGK = matchData.players.find(
      (p) => p.isOnPitch && p.role === Role.GOALKEEPER && p.isOpponent,
    );

    // Identify target goalie (Opposite of the event team)
    const targetGoalieId = isOpponentEvent ? activeGK?.id : activeOppGK?.id;

    const effectivePlayerId =
      playerId ||
      (isOpponentEvent &&
      (type === ActionType.SHOT || type === GoalieAction.GOAL_CONCEDED)
        ? activeGK?.id
        : !isOpponentEvent && type === ActionType.GOAL
          ? activeOppGK?.id
          : undefined);

    const onPitchIds = matchData.players
      .filter((p) => p.isOnPitch)
      .map((p) => p.id);

    const eventPlayerIds = [];
    if (playerId) eventPlayerIds.push(playerId);
    if (targetGoalieId && !eventPlayerIds.includes(targetGoalieId)) {
      if (type === ActionType.SHOT || isGoal || type === GoalieAction.SAVE_CATCH || type === GoalieAction.SAVE_PARRY) {
        eventPlayerIds.push(targetGoalieId);
      }
    }
    if (effectivePlayerId && !eventPlayerIds.includes(effectivePlayerId)) {
      eventPlayerIds.push(effectivePlayerId);
    }

    const currentGoals = matchData.events.filter(
      (e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent
    ).length;
    const currentOpponentGoals = matchData.events.filter(
      (e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && e.metadata?.isOpponent
    ).length;

    const newEvent: GameEvent = {
      id: `event-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: matchData.matchClock,
      wallClock: Date.now(),
      period: matchData.period,
      playerIds: eventPlayerIds,
      onPitchPlayerIds: onPitchIds,
      type,
      gameState,
      ...metadata,
      metadata: {
        ...metadata?.metadata,
        isOpponent: isOpponentEvent,
      },
      scoreAtEvent: {
        team: currentGoals + (isGoal && !isOpponentEvent ? 1 : 0),
        opponent: currentOpponentGoals + (isGoal && isOpponentEvent ? 1 : 0),
      },
    };

    setMatchData((prev) => {
      const nextPlayers = prev.players.map((p) => {
        let stats = { ...p.stats };
        let pm = p.plusMinus;

        // 1. Stats for the actor (Shooter, Stealer, etc.)
        if (p.id === playerId || (p.id === effectivePlayerId && p.id !== targetGoalieId)) {
          if (type === ActionType.GOAL) stats.goals += 1;
          if (type === ActionType.SHOT) {
            stats.shots += 1;
            if (metadata?.destinationGrid === "OUT") {
              stats.shotsOffTarget += 1;
            }
          }
          if (type === ActionType.ASSIST) stats.assists += 1;
          if (type === ActionType.STEAL) stats.steals += 1;
          if (type === ActionType.INTERCEPTION) stats.interceptions += 1;
          if (type === ActionType.LOSS) stats.losses += 1;
          if (type === ActionType.UNFORCED_ERROR) stats.errors += 1;
          if (type === ActionType.YELLOW_CARD) {
            stats.yellowCards += 1;
            if (stats.yellowCards >= 2) {
              stats.redCards += 1;
              return { ...p, stats, plusMinus: pm, isOnPitch: false, pitchPosition: undefined };
            }
          }
          if (type === ActionType.RED_CARD) {
            stats.redCards += 1;
            return { ...p, stats, plusMinus: pm, isOnPitch: false, pitchPosition: undefined };
          }
        }

        // 2. Stats for the target Goalkeeper (Saves/Conceded)
        if (p.id === targetGoalieId && p.role === Role.GOALKEEPER) {
          if (isGoal) {
            stats.conceded += 1;
          } else if (type === ActionType.SHOT || type === GoalieAction.SAVE_CATCH || type === GoalieAction.SAVE_PARRY) {
            if (metadata?.destinationGrid !== "OUT") {
              stats.saves += 1;
            }
          }
        }

        // 3. Fallback for specific Goalie Buttons if they were assigned as effectivePlayerId
        if (p.id === effectivePlayerId && p.role === Role.GOALKEEPER && p.id !== targetGoalieId) {
           if (type === GoalieAction.GOAL_CONCEDED) stats.conceded += 1;
           if (type === GoalieAction.SAVE_CATCH || type === GoalieAction.SAVE_PARRY) stats.saves += 1;
        }

        // Global Plus/Minus logic (only for Local Team)
        if (!p.isOpponent && p.isOnPitch) {
          if (type === ActionType.GOAL && !isOpponentEvent) {
            pm += 1;
          }
          if (
            isOpponentEvent &&
            (type === ActionType.GOAL || type === GoalieAction.GOAL_CONCEDED)
          ) {
            pm -= 1;
          }
        }

        return { ...p, stats, plusMinus: pm };
      });

      let nextTimeouts = { ...prev.timeoutsUsed };
      let updatedIsClockRunning = prev.isClockRunning;
      if (type === ActionType.TIMEOUT) {
        updatedIsClockRunning = false;
        const teamKey = isOpponentEvent ? 'opponent' : 'team';
        const periodKey = prev.period === Period.FIRST ? 'period1' : 
                         prev.period === Period.SECOND ? 'period2' : null;
        
        if (periodKey) {
          nextTimeouts[teamKey] = { ...nextTimeouts[teamKey], [periodKey]: true };
        }
      }

      return {
        ...prev,
        isClockRunning: updatedIsClockRunning,
        events: [newEvent, ...prev.events],
        players: nextPlayers,
        timeoutsUsed: nextTimeouts,
      };
    });
  };

  const handleDeleteEvent = (event: GameEvent) => {
    if (isDataLocked) return;
    setMatchData((prev) => {
      const nextPlayers = prev.players.map((p) => {
        let stats = { ...p.stats };
        let pm = p.plusMinus;

        const isEffective = event.playerIds.includes(p.id);

        if (isEffective) {
          const isOpponentEvent = event.metadata?.isOpponent;
          const isOpposingKeeper = p.role === Role.GOALKEEPER && (
            (isOpponentEvent ? !p.isOpponent : p.isOpponent)
          );

          if (event.type === ActionType.GOAL) {
            if (isOpposingKeeper) stats.conceded = Math.max(0, stats.conceded - 1);
            else stats.goals = Math.max(0, stats.goals - 1);
          }
          if (event.type === ActionType.SHOT) {
            if (isOpposingKeeper) {
              if (event.destinationGrid !== "OUT") stats.saves = Math.max(0, stats.saves - 1);
            } else {
              stats.shots = Math.max(0, stats.shots - 1);
              if (event.destinationGrid === "OUT") {
                stats.shotsOffTarget = Math.max(0, stats.shotsOffTarget - 1);
              }
            }
          }
          if (event.type === ActionType.ASSIST)
            stats.assists = Math.max(0, stats.assists - 1);
          if (event.type === ActionType.STEAL)
            stats.steals = Math.max(0, stats.steals - 1);
          if (event.type === ActionType.INTERCEPTION)
            stats.interceptions = Math.max(0, stats.interceptions - 1);
          if (event.type === ActionType.LOSS)
            stats.losses = Math.max(0, stats.losses - 1);
          if (event.type === ActionType.UNFORCED_ERROR)
            stats.errors = Math.max(0, stats.errors - 1);
          if (event.type === ActionType.YELLOW_CARD) {
            if (stats.yellowCards >= 2) {
              stats.redCards = Math.max(0, stats.redCards - 1);
            }
            stats.yellowCards = Math.max(0, stats.yellowCards - 1);
          }
          if (event.type === ActionType.RED_CARD)
            stats.redCards = Math.max(0, stats.redCards - 1);
          
          // Specific goalie actions
          if (event.type === GoalieAction.GOAL_CONCEDED)
            stats.conceded = Math.max(0, stats.conceded - 1);
          if (
            event.type === GoalieAction.SAVE_CATCH ||
            event.type === GoalieAction.SAVE_PARRY
          )
            stats.saves = Math.max(0, stats.saves - 1);
        }

        // Revert plusMinus if we have the on-pitch list
        if (event.onPitchPlayerIds?.includes(p.id)) {
          if (event.type === ActionType.GOAL) pm -= 1;
          if (event.type === GoalieAction.GOAL_CONCEDED) pm += 1;
        }

        return { ...p, stats, plusMinus: pm };
      });

      // Special case: team fouls
      let nextFouls = { ...prev.fouls };
      if (event.type === ActionType.FOUL) {
        const isOpponent = event.metadata?.isOpponent ?? false;
        if (isOpponent) {
          nextFouls.opponent = Math.max(0, nextFouls.opponent - 1);
        } else {
          nextFouls.team = Math.max(0, nextFouls.team - 1);
        }
      }

      let nextTimeouts = { ...prev.timeoutsUsed };
      if (event.type === ActionType.TIMEOUT) {
        const isOpponentEvent = event.metadata?.isOpponent;
        const teamKey = isOpponentEvent ? "opponent" : "team";
        const periodKey =
          event.period === Period.FIRST
            ? "period1"
            : event.period === Period.SECOND
            ? "period2"
            : null;

        if (periodKey) {
          nextTimeouts[teamKey] = {
            ...nextTimeouts[teamKey],
            [periodKey]: false,
          };
        }
      }

      return {
        ...prev,
        events: prev.events.filter((e) => e.id !== event.id),
        players: nextPlayers,
        fouls: nextFouls,
        timeoutsUsed: nextTimeouts,
      };
    });
    setDeleteConfirmEvent(null);
  };

  const executeSwap = (id: string, forceTargetSelection = false) => {
    if (isDataLocked) return;
    // If we click the already selected source, deselect it
    if (swapSelection === id) {
      setSwapSelection(null);
      return;
    }

    if (!swapSelection && !forceTargetSelection) {
      // Opening menu instead of auto-selecting for swap
      setActiveActionPlayerId(id);
    } else if (!swapSelection && forceTargetSelection) {
      // Explicitly starting a swap from the menu
      setSwapSelection(id);
      setActiveActionPlayerId(null);
    } else {
      // We have a selection and now a target
      const sourceId = swapSelection;
      const targetId = id;

      setMatchData((prev) => {
        const sourcePlayer = prev.players.find((p) => p.id === sourceId);
        const targetPlayer = prev.players.find((p) => p.id === targetId);

        if (!sourcePlayer || !targetPlayer) return prev;

        // If one is on pitch and other isn't, swap them
        // If both are on pitch, maybe they want to swap positions? (Futsal, positions are flexible but let's allow it)

        return {
          ...prev,
          players: prev.players.map((p) => {
            if (p.id === sourceId) {
              return {
                ...p,
                isOnPitch: targetPlayer.isOnPitch,
                pitchPosition: targetPlayer.isOnPitch
                  ? targetPlayer.pitchPosition
                  : undefined,
              };
            }
            if (p.id === targetId) {
              return {
                ...p,
                isOnPitch: sourcePlayer.isOnPitch,
                pitchPosition: sourcePlayer.isOnPitch
                  ? sourcePlayer.pitchPosition
                  : undefined,
              };
            }
            return p;
          }),
        };
      });

      handleAction(ActionType.SUBSTITUTION, targetId);
      setSwapSelection(null);
      setSwapTargetId(null);
    }
  };

  const executeDirectSub = (benchPlayerId: string, slotIndex: number) => {
    if (isDataLocked) return;
    setMatchData((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === benchPlayerId
          ? { ...p, isOnPitch: true, pitchPosition: slotIndex }
          : p,
      ),
    }));
    handleAction(ActionType.SUBSTITUTION, benchPlayerId);
  };

  // Remove finalizeSwap as it's now integrated into executeSwap

  const handlePitchDragEnd = (playerId: string, info: any) => {
    if (!pitchRef.current || isDataLocked) return;

    const rect = pitchRef.current.getBoundingClientRect();
    const xPercent = ((info.point.x - rect.left) / rect.width) * 100;
    const yPercent = ((info.point.y - rect.top) / rect.height) * 100;

    // Check if drop is approximately over the pitch area
    const isOverPitch =
      xPercent >= -10 && xPercent <= 110 && yPercent >= -10 && yPercent <= 110;
    if (!isOverPitch) return;

    // Find nearest slot
    let nearestSlotIndex = -1;
    let minDistance = Infinity;

    const currentSlots =
      PITCH_SYSTEMS[gameState] || PITCH_SYSTEMS[GameState.FOUR_VS_FOUR];

    currentSlots.forEach((slot, idx) => {
      const dist = Math.sqrt(
        Math.pow(xPercent - slot.left, 2) + Math.pow(yPercent - slot.top, 2),
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestSlotIndex = idx;
      }
    });

    if (nearestSlotIndex !== -1 && minDistance < 20) {
      setMatchData((prev) => {
        const movingPlayer = prev.players.find((p) => p.id === playerId);
        const targetPlayer = prev.players.find(
          (p) => p.isOnPitch && p.pitchPosition === nearestSlotIndex,
        );

        if (
          !movingPlayer ||
          (targetPlayer && movingPlayer.id === targetPlayer.id)
        )
          return prev;

        // If movingPlayer is not on pitch, it's a substitution
        const isSubstitution = !movingPlayer.isOnPitch;

        const nextPlayers = prev.players.map((p) => {
          if (p.id === movingPlayer.id) {
            return {
              ...p,
              isOnPitch: true,
              pitchPosition: nearestSlotIndex,
            };
          }
          if (targetPlayer && p.id === targetPlayer.id) {
            return {
              ...p,
              isOnPitch: movingPlayer.isOnPitch,
              pitchPosition: movingPlayer.isOnPitch
                ? movingPlayer.pitchPosition
                : undefined,
            };
          }
          return p;
        });

        if (isSubstitution) {
          // We'll call handleAction outside or via an effect-like trigger if we wanted,
          // but we can just do it here if we're careful.
          // However, handleAction also calls setMatchData.
          // It's better to log the event separately.
        }

        return { ...prev, players: nextPlayers };
      });

      const movingPlayer = matchData.players.find((p) => p.id === playerId);
      if (movingPlayer && !movingPlayer.isOnPitch) {
        handleAction(ActionType.SUBSTITUTION, playerId);
      }
    }
  };

  const updatePlayerDetails = (id: string, name: string, number: number) => {
    setMatchData((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === id ? { ...p, name, number } : p,
      ),
    }));
    setEditingPlayerId(null);
  };

  const updateTeams = (teamName: string, opponentName: string) => {
    setMatchData((prev) => ({ ...prev, teamName, opponentName }));
    setIsEditingTeams(false);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, isOpponent: boolean = false) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMatchData((prev) => ({
          ...prev,
          [isOpponent ? 'opponentLogo' : 'teamLogo']: reader.result as string,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const addPlayer = (isOpponent: boolean) => {
    const newPlayer: Player = {
      id: `${isOpponent ? "opp" : "p"}_${Date.now()}`,
      number: 0,
      name: "NUEVO JUGADOR",
      role: Role.PLAYER,
      isOnPitch: false,
      plusMinus: 0,
      individualTimeSeconds: 0,
      isOpponent,
      stats: { ...INITIAL_STATS },
    };
    setMatchData((prev) => ({
      ...prev,
      players: [...prev.players, newPlayer],
    }));
  };

  const updatePlayer = (id: string, updates: Partial<Player>) => {
    setMatchData((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      ),
    }));
  };

  const toggleStarter = (playerId: string) => {
    setMatchData(prev => ({
      ...prev,
      players: prev.players.map(p => {
        if (p.id === playerId) {
          const isStarter = !p.isStarter;
          // If match hasn't started, also toggle pitch presence
          const shouldBeOnPitch = prev.events.length === 0 ? isStarter : p.isOnPitch;
          
          let finalPitchPos = p.pitchPosition;
          if (shouldBeOnPitch && !p.isOnPitch) {
            const maxSlots = 5;
            const occupied = new Set(prev.players.filter(pl => pl.isOnPitch && pl.isOpponent === p.isOpponent).map(pl => pl.pitchPosition));
            for (let i = 0; i < maxSlots; i++) {
              if (!occupied.has(i)) {
                finalPitchPos = i;
                break;
              }
            }
          }

          return { ...p, isStarter, isOnPitch: shouldBeOnPitch, pitchPosition: shouldBeOnPitch ? finalPitchPos : undefined };
        }
        return p;
      })
    }));
  };

  const toggleOnPitch = (playerId: string) => {
    setMatchData((prev) => {
      const player = prev.players.find(p => p.id === playerId);
      if (!player) return prev;
      
      const isNowOnPitch = !player.isOnPitch;
      const maxSlots = 5;
      const currentOnPitchCount = prev.players.filter((p) => p.isOpponent === player.isOpponent && p.isOnPitch).length;
      
      if (isNowOnPitch && currentOnPitchCount >= maxSlots) return prev;
      
      return {
        ...prev,
        players: prev.players.map((p) => {
          if (p.id === playerId) {
            if (isNowOnPitch) {
              const occupied = new Set(prev.players.filter((pl) => pl.isOnPitch && pl.isOpponent === player.isOpponent).map((pl) => pl.pitchPosition));
              let firstFree = 0;
              for (let i = 0; i < maxSlots; i++) {
                if (!occupied.has(i)) {
                  firstFree = i;
                  break;
                }
              }
              return { ...p, isOnPitch: true, pitchPosition: firstFree };
            }
            return { ...p, isOnPitch: false, pitchPosition: undefined };
          }
          return p;
        }),
      };
    });
  };

  const removePlayer = (id: string) => {
    setMatchData((prev) => ({
      ...prev,
      players: prev.players.filter((p) => p.id !== id),
    }));
  };

  const renderGoalieCard = (goalie: Player, isOpponent: boolean) => {
    const totalShotsAgainst = goalie.stats.saves + goalie.stats.conceded;
    const saveRate = totalShotsAgainst > 0 ? (goalie.stats.saves / totalShotsAgainst) * 100 : 0;

    return (
      <div
        className={`p-4 rounded-2xl border transition-all ${goalie.isOnPitch ? (isOpponent ? "bg-red-600/10 border-red-500/30 ring-1 ring-red-500/20" : "bg-blue-600/10 border-blue-500/30 ring-1 ring-blue-500/20") : "bg-white/5 border-white/5 opacity-60"}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm border ${goalie.isOnPitch ? (isOpponent ? "bg-red-600 text-white border-red-400" : "bg-blue-600 text-white border-blue-400") : "bg-black/40 text-slate-400 border-white/10"}`}
            >
              {goalie.number}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black text-white uppercase">
                {goalie.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-slate-500 font-mono uppercase italic">
                  {goalie.isOnPitch ? "En Pista" : "Banquillo"}
                </span>
                <span className={`text-[8px] font-mono font-black ${isOpponent ? 'text-red-400 bg-red-400/10' : 'text-blue-400 bg-blue-400/10'} px-1 rounded`}>
                  ⏱️ {formatPlayerTime(goalie.individualTimeSeconds)}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-black text-white">
              {saveRate.toFixed(1)}%
            </div>
            <div className="text-[7px] font-black text-slate-500 uppercase">
              Eficacia
            </div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          <div className="bg-black/20 p-1.5 rounded-xl flex flex-col items-center">
            <span className="text-[7px] font-black text-slate-500 uppercase mb-1 text-center truncate w-full">Paradas</span>
            <span className={`text-lg font-black ${isOpponent ? 'text-rose-400' : 'text-blue-400'}`}>{goalie.stats.saves}</span>
          </div>
          <div className="bg-black/20 p-1.5 rounded-xl flex flex-col items-center">
            <span className="text-[7px] font-black text-slate-500 uppercase mb-1 text-center truncate w-full">G. Enc</span>
            <span className="text-lg font-black text-red-500">{goalie.stats.conceded}</span>
          </div>
          <div className={`${isOpponent ? 'bg-red-600/20 border-red-500/20' : 'bg-blue-600/20 border-blue-500/20'} p-1.5 rounded-xl flex flex-col items-center border`}>
            <span className={`text-[7px] font-black ${isOpponent ? 'text-red-400' : 'text-blue-400'} uppercase mb-1 text-center truncate w-full`}>T. Rec.</span>
            <span className="text-lg font-black text-white">{totalShotsAgainst}</span>
          </div>
          <div className="bg-green-500/10 p-1.5 rounded-xl flex flex-col items-center border border-green-500/10">
            <span className="text-[7px] font-black text-green-500 uppercase mb-1 text-center truncate w-full">Goles</span>
            <span className="text-lg font-black text-green-400">{goalie.stats.goals}</span>
          </div>
          <div className="bg-amber-500/10 p-1.5 rounded-xl flex flex-col items-center border border-amber-500/10">
            <span className="text-[7px] font-black text-amber-500 uppercase mb-1 text-center truncate w-full">Tiros</span>
            <span className="text-lg font-black text-amber-400">{goalie.stats.shots}</span>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <div className="flex-1 p-3 bg-black/40 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[8px] font-black ${isOpponent ? 'text-red-400' : 'text-blue-400'} uppercase tracking-widest flex items-center gap-1`}>
                <MapIcon size={10} /> Origen (Pista)
              </span>
            </div>
            {renderPitchOriginMap(goalie, isOpponent, matchData.events, true)}
          </div>

          <div className="flex-[1.5] p-3 bg-black/40 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[8px] font-black ${isOpponent ? 'text-red-400' : 'text-blue-400'} uppercase tracking-widest flex items-center gap-1`}>
                <Crosshair size={10} /> Impacto (Portería)
              </span>
              <span className="text-[7px] font-bold text-slate-500 uppercase">Zonificación</span>
            </div>
            <div className="grid grid-cols-3 grid-rows-3 gap-1 aspect-[3/2] w-full max-w-[200px] mx-auto border-t-[4px] border-x-[4px] border-slate-700 rounded-t-xl relative bg-black/80 shadow-2xl overflow-hidden p-1">
              <div className={`absolute inset-0 bg-gradient-to-b ${isOpponent ? 'from-red-600/5' : 'from-blue-600/5'} to-transparent pointer-events-none`}></div>
              {Array.from({ length: 9 }).map((_, i) => {
                const z = `G${i + 1}`;
                const saves = matchData.events.filter((e) => {
                  const isGoalieInvolved = e.playerIds.includes(goalie.id) || (e.metadata?.isOpponent !== goalie.isOpponent && goalie.isOnPitch);
                  return isGoalieInvolved && (e.type === GoalieAction.SAVE_PARRY || e.type === GoalieAction.SAVE_CATCH || (e.type === ActionType.SHOT && e.destinationGrid !== "OUT")) && (e.destinationGrid === z || e.metadata?.zone === z);
                }).length;
                const goals = matchData.events.filter((e) => {
                  const isGoalieInvolved = e.playerIds.includes(goalie.id) || (e.metadata?.isOpponent !== goalie.isOpponent && goalie.isOnPitch);
                  return isGoalieInvolved && (e.type === GoalieAction.GOAL_CONCEDED || e.type === ActionType.GOAL) && (e.destinationGrid === z || e.metadata?.zone === z);
                }).length;

                return (
                  <div key={z} className="relative flex items-center justify-center border-white/10 border bg-white/5 rounded-sm overflow-hidden group">
                    {saves > 0 && (
                      <div className={`absolute inset-0 ${isOpponent ? 'bg-red-500/20' : 'bg-blue-500/20'} flex items-center justify-center`}>
                        <span className={`text-[10px] font-black ${isOpponent ? 'text-red-400' : 'text-blue-400'} drop-shadow-sm`}>{saves}</span>
                      </div>
                    )}
                    {goals > 0 && (
                      <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center border border-slate-900 z-10 shadow-lg">
                        <span className="text-[8px] font-black text-white">{goals}</span>
                      </div>
                    )}
                    <div className="absolute bottom-0.5 left-0.5 opacity-20 text-[5px] font-mono text-white">{z}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {goalie.isOnPitch && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={() => setActiveActionPlayerId(goalie.id)}
              className={`py-2.5 ${isOpponent ? 'bg-red-600/20 border-red-500/40 hover:bg-red-600/30' : 'bg-blue-600/20 border-blue-500/40 hover:bg-blue-600/30'} text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95`}
            >
              Nueva Acción
            </button>
            <button
              onClick={() => executeSwap(goalie.id, true)}
              className={`py-2.5 ${isOpponent ? 'bg-red-600/10 border-red-500/20 hover:bg-red-600/20' : 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20'} ${isOpponent ? 'text-red-400' : 'text-amber-500'} text-[9px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95`}
            >
              Cambio
            </button>
          </div>
        )}
      </div>
    );
  };

  const goals = matchData?.events?.filter(
    (e) =>
      (e?.type === ActionType?.GOAL || e?.type === GoalieAction?.GOAL_CONCEDED) &&
      !e?.metadata?.isOpponent,
  )?.length || 0;
  const opponentGoals = matchData?.events?.filter(
    (e) =>
      (e?.type === ActionType?.GOAL || e?.type === GoalieAction?.GOAL_CONCEDED) &&
      e?.metadata?.isOpponent,
  )?.length || 0;

  const localStaff = matchData?.players?.filter(p => !p.isOpponent && (p.role === Role.COACH || p.role === Role.DELEGATE)) || [];
  const localStaffYellows = localStaff.reduce((sum, p) => sum + p.stats.yellowCards, 0);
  const localStaffReds = localStaff.reduce((sum, p) => sum + p.stats.redCards, 0);

  const rivalStaff = matchData?.players?.filter(p => p.isOpponent && (p.role === Role.COACH || p.role === Role.DELEGATE)) || [];
  const rivalStaffYellows = rivalStaff.reduce((sum, p) => sum + p.stats.yellowCards, 0);
  const rivalStaffReds = rivalStaff.reduce((sum, p) => sum + p.stats.redCards, 0);

  return (
    <>
      <StatsExportTemplate
        ref={exportRef}
        matchData={matchData}
        goals={goals}
        opponentGoals={opponentGoals}
        formatTime={formatTime}
        reportType={reportType}
      />
      {/* ── PDF PAGE TEMPLATES (hidden, white background) ─────── */}
      {(() => {
        const PDF_W = 794;
        const allTeamsForPDF = [
          { players: matchData.players.filter(p => !p.isOpponent && p.role !== Role.COACH && p.role !== Role.DELEGATE), name: matchData.teamName, accent: '#3b82f6' },
          { players: matchData.players.filter(p => p.isOpponent && p.role !== Role.COACH && p.role !== Role.DELEGATE), name: matchData.opponentName, accent: '#ef4444' },
        ].filter(t => t.players.length > 0);

        const getPosLabel = (p: Player) => {
          if (p.role === Role.GOALKEEPER) return { label: 'PR', bg: '#fef9c3', color: '#854d0e' };
          if (p.pitchPosition !== undefined) {
            const slots = PITCH_SYSTEMS[GameState.FOUR_VS_FOUR];
            const slot = slots[p.pitchPosition];
            if (slot?.label === 'CIE') return { label: 'C', bg: '#dcfce7', color: '#166534' };
            if (slot?.label === 'PIV' || slot?.label === 'PIV') return { label: 'PV', bg: '#f3e8ff', color: '#6b21a8' };
            if (slot?.label === 'AI' || slot?.label === 'AD' || slot?.label === 'AL') return { label: 'ALA', bg: '#dbeafe', color: '#1e40af' };
          }
          return { label: 'ALA', bg: '#dbeafe', color: '#1e40af' };
        };

        const ITEMS = [
          { label: 'Goles', color: '#16a34a', fn: (p: Player) => p.stats.goals || 0 },
          { label: 'Tiros tot.', color: '#d97706', fn: (p: Player) => (p.stats.shots || 0) + (p.stats.goals || 0) },
          { label: 'Tiros p.', color: '#ea580c', fn: (p: Player) => p.stats.shots || 0 },
          { label: 'Pérdidas', color: '#dc2626', fn: (p: Player) => p.stats.losses || 0 },
          { label: 'Recuperac.', color: '#9333ea', fn: (p: Player) => p.stats.steals || 0 },
          { label: 'Faltas com.', color: '#ea580c', fn: (p: Player) => p.stats.fouls || 0 },
          { label: 'Tarjetas', color: '#ca8a04', fn: (p: Player) => (p.stats.yellowCards || 0) + (p.stats.redCards || 0) },
          { label: 'Minutos', color: '#0284c7', fn: (p: Player) => Math.round((p.individualTimeSeconds || 0) / 60) },
        ];

        const SPIDER_ITEMS = [
          { label: 'Goles', fn: (p: Player) => p.stats.goals || 0, isRed: false },
          { label: 'Tiros', fn: (p: Player) => p.stats.shots || 0, isRed: true },
          { label: 'Pérd.', fn: (p: Player) => p.stats.losses || 0, isRed: true },
          { label: 'Recup.', fn: (p: Player) => p.stats.steals || 0, isRed: false },
          { label: 'Min.', fn: (p: Player) => Math.round((p.individualTimeSeconds || 0) / 60), isRed: true },
        ];

        const redGrad = (v: number) => {
          const t = (v - 1) / 4;
          return `rgb(${Math.round(160 + t * 80)},${Math.round(40 - t * 40)},${Math.round(40 - t * 40)})`;
        };

        const pageStyle: React.CSSProperties = {
          position: 'absolute', top: 0, left: 0, zIndex: -200,
          opacity: 0.01, pointerEvents: 'none',
          width: PDF_W, backgroundColor: '#ffffff',
          fontFamily: "'Inter', sans-serif", color: '#0f172a',
          padding: 40,
        };

        const headerStyle: React.CSSProperties = {
          background: '#0f172a', color: 'white', padding: '20px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 24,
        };

        const sectionLabelStyle: React.CSSProperties = {
          fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
          letterSpacing: '0.1em', marginBottom: 12, paddingBottom: 6,
          borderBottom: '0.5px solid #e2e8f0',
        };

        const footerStyle: React.CSSProperties = {
          marginTop: 24, borderTop: '0.5px solid #e2e8f0', paddingTop: 10,
          display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#94a3b8',
        };

        const Header = ({ page, total }: { page: number; total: number }) => (
          <>
            <div style={headerStyle}>
              <div>
                <div style={{ fontSize: 8, color: '#3b82f6', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Technical Department · Pro Analytics
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {matchData.teamName}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>vs {matchData.opponentName}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 8, color: '#94a3b8', marginBottom: 4 }}>Resultado final</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'white', letterSpacing: '0.05em' }}>
                  {goals} — {opponentGoals}
                </div>
                <div style={{ fontSize: 8, color: '#64748b', marginTop: 4 }}>
                  {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                </div>
              </div>
            </div>
          </>
        );

        const Footer = ({ page, total }: { page: number; total: number }) => (
          <div style={footerStyle}>
            <span>Futsal Commander Pro · Informe Técnico</span>
            <span>Página {page} / {total}</span>
          </div>
        );

        const totalPages = allTeamsForPDF.length * 3;
        let pageCounter = 0;

        return (
          <>
            {/* ── LOCAL: Page 1 (table) */}
            <div ref={pdfPage1Ref} style={pageStyle}>
              {(() => {
                const team = allTeamsForPDF[0];
                if (!team) return null;
                return (
                  <>
                    <Header page={1} total={allTeamsForPDF.length * 3} />
                    <div style={{ marginBottom: 8, ...sectionLabelStyle }}>1. estadísticas por posición — {team.name.toLowerCase()}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '5px 6px', color: '#64748b', fontWeight: 700, fontSize: 9, minWidth: 100 }}>Jugador</th>
                          <th style={{ padding: '5px 5px', color: '#64748b', fontWeight: 700, fontSize: 9 }}>Pos</th>
                          {ITEMS.map(it => (<th key={it.label} style={{ padding: '5px 4px', color: it.color, fontWeight: 700, fontSize: 9, textAlign: 'center' }}>{it.label.split(' ')[0]}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {team.players.map(p => { const pos = getPosLabel(p); return (
                          <tr key={p.id} style={{ borderBottom: '0.5px solid #f1f5f9' }}>
                            <td style={{ padding: '5px 6px', color: '#0f172a', fontWeight: 600, fontSize: 10 }}><span style={{ color: team.accent, marginRight: 4, fontWeight: 700 }}>{p.number}</span>{p.name}</td>
                            <td style={{ padding: '5px 4px', textAlign: 'center' }}><span style={{ display: 'inline-block', fontSize: 8, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: pos.bg, color: pos.color }}>{pos.label}</span></td>
                            {ITEMS.map(it => { const v = it.fn(p); const isCard = it.label === 'Tarjetas'; return (<td key={it.label} style={{ padding: '5px 4px', textAlign: 'center', color: v > 0 ? it.color : '#cbd5e1', fontWeight: v > 0 ? 700 : 400, fontSize: 10 }}>{isCard && v > 0 ? `${p.stats.yellowCards > 0 ? p.stats.yellowCards + 'A' : ''}${p.stats.redCards > 0 ? p.stats.redCards + 'R' : ''}` : v}</td>); })}
                          </tr>
                        );})}
                      </tbody>
                    </table>
                    <Footer page={1} total={allTeamsForPDF.length * 3} />
                  </>
                );
              })()}
            </div>

            {/* ── LOCAL: Page 2 (bar charts) */}
            <div ref={pdfPage2Ref} style={pageStyle}>
              {(() => {
                const team = allTeamsForPDF[0];
                if (!team) return null;
                const total = allTeamsForPDF.length * 3;
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: team.accent }} /><span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{team.name} — comparativa por ítem</span></div>
                      <span style={{ fontSize: 8, color: '#94a3b8' }}>Página 2 / {total}</span>
                    </div>
                    {ITEMS.map(item => { const vals = team.players.map(p => item.fn(p)); const maxV = Math.max(...vals, 1); const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1); const avgPct = Math.round((avg / maxV) * 100); return (
                      <div key={item.label} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: item.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{item.label}</div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 52 }}>
                          {team.players.map((p, i) => { const pct = maxV > 0 ? vals[i] / maxV : 0; const h = Math.max(2, Math.round(pct * 44)); return (<div key={p.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><div style={{ fontSize: 8, color: '#64748b' }}>{vals[i]}</div><div style={{ width: '65%', height: h, background: item.color, borderRadius: '2px 2px 0 0', opacity: vals[i] > 0 ? 0.9 : 0.15 }} /><div style={{ fontSize: 8, color: '#94a3b8', textAlign: 'center', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name.split(' ')[0]}</div></div>); })}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}><span style={{ fontSize: 8, color: '#94a3b8', width: 44 }}>Promedio</span><div style={{ flex: 1, height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${avgPct}%`, height: '100%', background: item.color, borderRadius: 3, opacity: 0.7 }} /></div><span style={{ fontSize: 8, color: '#94a3b8', width: 24, textAlign: 'right' }}>{avg.toFixed(1)}</span></div>
                      </div>
                    );})}
                    <Footer page={2} total={total} />
                  </>
                );
              })()}
            </div>

            {/* ── LOCAL: Page 3 (spider charts) */}
            <div ref={pdfPage3Ref} style={pageStyle}>
              {(() => {
                const team = allTeamsForPDF[0];
                if (!team) return null;
                const total = allTeamsForPDF.length * 3;
                const maxVals = SPIDER_ITEMS.map(it => Math.max(...team.players.map(p => it.fn(p)), 1));
                const maxAtkV = Math.max(...team.players.map(p => (p.stats.goals || 0) * 2 + (p.stats.shots || 0)), 1);
                const maxDefV = Math.max(...team.players.map(p => Math.max(0, (p.stats.steals || 0) - (p.stats.losses || 0) * 0.5)), 0.1);
                const W = 140, H = 140, cx = 70, cy = 70, R = 50;
                const angles = SPIDER_ITEMS.map((_, i) => (Math.PI * 2 * i / SPIDER_ITEMS.length) - Math.PI / 2);
                const gridPts = (lv: number) => angles.map(a => `${cx + (lv / 5) * R * Math.cos(a)},${cy + (lv / 5) * R * Math.sin(a)}`).join(' ');
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: team.accent }} /><span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{team.name} — perfil táctico</span></div>
                      <span style={{ fontSize: 8, color: '#94a3b8' }}>Página 3 / {total}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      {team.players.map(p => {
                        const normV = SPIDER_ITEMS.map((it, i) => Math.round((it.fn(p) / maxVals[i]) * 4) + 1);
                        const dataR = normV.map(v => (v / 5) * R);
                        const dataPts = angles.map((a, i) => `${cx + dataR[i] * Math.cos(a)},${cy + dataR[i] * Math.sin(a)}`).join(' ');
                        const atk = (p.stats.goals || 0) * 2 + (p.stats.shots || 0); const def = Math.max(0, (p.stats.steals || 0) - (p.stats.losses || 0) * 0.5);
                        const atkPct = Math.round((atk / maxAtkV) * 100); const defPct = Math.round((def / maxDefV) * 100);
                        const diff = atkPct - defPct; const verdict = diff > 15 ? 'Perfil atacante' : diff < -15 ? 'Perfil defensivo' : 'Equilibrado';
                        const vc = diff > 15 ? '#dc2626' : diff < -15 ? '#16a34a' : '#64748b'; const vbg = diff > 15 ? '#fef2f2' : diff < -15 ? '#f0fdf4' : '#f8fafc';
                        const pos = getPosLabel(p);
                        return (
                          <div key={p.id} style={{ border: '0.5px solid #e2e8f0', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#0f172a', textAlign: 'center' }}><span style={{ color: team.accent, marginRight: 3 }}>#{p.number}</span>{p.name.split(' ')[0]}<span style={{ display: 'inline-block', fontSize: 7, fontWeight: 600, padding: '1px 4px', borderRadius: 3, background: pos.bg, color: pos.color, marginLeft: 4 }}>{pos.label}</span></div>
                            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                              {[1,2,3,4,5].map(lv => (<polygon key={lv} points={gridPts(lv)} fill="none" stroke="#e2e8f0" strokeWidth="0.5"/>))}
                              {angles.map((a, i) => (<line key={i} x1={cx} y1={cy} x2={cx+R*Math.cos(a)} y2={cy+R*Math.sin(a)} stroke="#e2e8f0" strokeWidth="0.5"/>))}
                              <polygon points={dataPts} fill="rgba(59,130,246,0.1)" stroke="#3b82f6" strokeWidth="1.5"/>
                              {angles.map((a, i) => { const px = cx+dataR[i]*Math.cos(a), py = cy+dataR[i]*Math.sin(a); const c = SPIDER_ITEMS[i].isRed ? redGrad(normV[i]) : '#3b82f6'; return <circle key={i} cx={px} cy={py} r="3" fill={c} stroke="white" strokeWidth="0.5"/>; })}
                              {SPIDER_ITEMS.map((it, i) => { const lx = cx+(R+11)*Math.cos(angles[i]), ly = cy+(R+11)*Math.sin(angles[i]); const c = it.isRed ? redGrad(normV[i]) : '#94a3b8'; return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="7" fill={c}>{it.label}</text>; })}
                            </svg>
                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {[{ label: 'Ataque', pct: atkPct, color: '#ef4444' }, { label: 'Defensa', pct: defPct, color: '#22c55e' }].map(b => (<div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ fontSize: 7, color: '#94a3b8', width: 36 }}>{b.label}</span><div style={{ flex: 1, height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${b.pct}%`, height: '100%', background: b.color, borderRadius: 3 }}/></div><span style={{ fontSize: 7, color: '#94a3b8', width: 22, textAlign: 'right' }}>{b.pct}%</span></div>))}
                              <div style={{ marginTop: 3, padding: '2px 8px', borderRadius: 4, background: vbg, border: `0.5px solid ${vc}30`, fontSize: 8, fontWeight: 600, color: vc, textAlign: 'center' }}>{verdict}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <Footer page={3} total={total} />
                  </>
                );
              })()}
            </div>

            {/* ── RIVAL: Pages 4-6 (only if rival has players) */}
            <div ref={pdfPage4Ref} style={pageStyle}>
              {(() => {
                const team = allTeamsForPDF[1];
                if (!team) return null;
                const total = allTeamsForPDF.length * 3;
                return (
                  <>
                    <Header page={4} total={total} />
                    <div style={{ marginBottom: 8, ...sectionLabelStyle }}>1. estadísticas por posición — {team.name.toLowerCase()}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '5px 6px', color: '#64748b', fontWeight: 700, fontSize: 9, minWidth: 100 }}>Jugador</th>
                          <th style={{ padding: '5px 5px', color: '#64748b', fontWeight: 700, fontSize: 9 }}>Pos</th>
                          {ITEMS.map(it => (<th key={it.label} style={{ padding: '5px 4px', color: it.color, fontWeight: 700, fontSize: 9, textAlign: 'center' }}>{it.label.split(' ')[0]}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {team.players.map(p => { const pos = getPosLabel(p); return (
                          <tr key={p.id} style={{ borderBottom: '0.5px solid #f1f5f9' }}>
                            <td style={{ padding: '5px 6px', color: '#0f172a', fontWeight: 600, fontSize: 10 }}><span style={{ color: team.accent, marginRight: 4, fontWeight: 700 }}>{p.number}</span>{p.name}</td>
                            <td style={{ padding: '5px 4px', textAlign: 'center' }}><span style={{ display: 'inline-block', fontSize: 8, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: pos.bg, color: pos.color }}>{pos.label}</span></td>
                            {ITEMS.map(it => { const v = it.fn(p); const isCard = it.label === 'Tarjetas'; return (<td key={it.label} style={{ padding: '5px 4px', textAlign: 'center', color: v > 0 ? it.color : '#cbd5e1', fontWeight: v > 0 ? 700 : 400, fontSize: 10 }}>{isCard && v > 0 ? `${p.stats.yellowCards > 0 ? p.stats.yellowCards + 'A' : ''}${p.stats.redCards > 0 ? p.stats.redCards + 'R' : ''}` : v}</td>); })}
                          </tr>
                        );})}
                      </tbody>
                    </table>
                    <Footer page={4} total={total} />
                  </>
                );
              })()}
            </div>

            <div ref={pdfPage5Ref} style={pageStyle}>
              {(() => {
                const team = allTeamsForPDF[1];
                if (!team) return null;
                const total = allTeamsForPDF.length * 3;
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: team.accent }} /><span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{team.name} — comparativa por ítem</span></div>
                      <span style={{ fontSize: 8, color: '#94a3b8' }}>Página 5 / {total}</span>
                    </div>
                    {ITEMS.map(item => { const vals = team.players.map(p => item.fn(p)); const maxV = Math.max(...vals, 1); const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1); const avgPct = Math.round((avg / maxV) * 100); return (
                      <div key={item.label} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: item.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{item.label}</div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 52 }}>
                          {team.players.map((p, i) => { const pct = maxV > 0 ? vals[i] / maxV : 0; const h = Math.max(2, Math.round(pct * 44)); return (<div key={p.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><div style={{ fontSize: 8, color: '#64748b' }}>{vals[i]}</div><div style={{ width: '65%', height: h, background: item.color, borderRadius: '2px 2px 0 0', opacity: vals[i] > 0 ? 0.9 : 0.15 }} /><div style={{ fontSize: 8, color: '#94a3b8', textAlign: 'center', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name.split(' ')[0]}</div></div>); })}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}><span style={{ fontSize: 8, color: '#94a3b8', width: 44 }}>Promedio</span><div style={{ flex: 1, height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${avgPct}%`, height: '100%', background: item.color, borderRadius: 3, opacity: 0.7 }} /></div><span style={{ fontSize: 8, color: '#94a3b8', width: 24, textAlign: 'right' }}>{avg.toFixed(1)}</span></div>
                      </div>
                    );})}
                    <Footer page={5} total={total} />
                  </>
                );
              })()}
            </div>

            <div ref={pdfPage6Ref} style={pageStyle}>
              {(() => {
                const team = allTeamsForPDF[1];
                if (!team) return null;
                const total = allTeamsForPDF.length * 3;
                const maxVals = SPIDER_ITEMS.map(it => Math.max(...team.players.map(p => it.fn(p)), 1));
                const maxAtkV = Math.max(...team.players.map(p => (p.stats.goals || 0) * 2 + (p.stats.shots || 0)), 1);
                const maxDefV = Math.max(...team.players.map(p => Math.max(0, (p.stats.steals || 0) - (p.stats.losses || 0) * 0.5)), 0.1);
                const W = 140, H = 140, cx = 70, cy = 70, R = 50;
                const angles = SPIDER_ITEMS.map((_, i) => (Math.PI * 2 * i / SPIDER_ITEMS.length) - Math.PI / 2);
                const gridPts = (lv: number) => angles.map(a => `${cx + (lv / 5) * R * Math.cos(a)},${cy + (lv / 5) * R * Math.sin(a)}`).join(' ');
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: team.accent }} /><span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{team.name} — perfil táctico</span></div>
                      <span style={{ fontSize: 8, color: '#94a3b8' }}>Página 6 / {total}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      {team.players.map(p => {
                        const normV = SPIDER_ITEMS.map((it, i) => Math.round((it.fn(p) / maxVals[i]) * 4) + 1);
                        const dataR = normV.map(v => (v / 5) * R);
                        const dataPts = angles.map((a, i) => `${cx + dataR[i] * Math.cos(a)},${cy + dataR[i] * Math.sin(a)}`).join(' ');
                        const atk = (p.stats.goals || 0) * 2 + (p.stats.shots || 0); const def = Math.max(0, (p.stats.steals || 0) - (p.stats.losses || 0) * 0.5);
                        const atkPct = Math.round((atk / maxAtkV) * 100); const defPct = Math.round((def / maxDefV) * 100);
                        const diff = atkPct - defPct; const verdict = diff > 15 ? 'Perfil atacante' : diff < -15 ? 'Perfil defensivo' : 'Equilibrado';
                        const vc = diff > 15 ? '#dc2626' : diff < -15 ? '#16a34a' : '#64748b'; const vbg = diff > 15 ? '#fef2f2' : diff < -15 ? '#f0fdf4' : '#f8fafc';
                        const pos = getPosLabel(p);
                        return (
                          <div key={p.id} style={{ border: '0.5px solid #e2e8f0', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#0f172a', textAlign: 'center' }}><span style={{ color: team.accent, marginRight: 3 }}>#{p.number}</span>{p.name.split(' ')[0]}<span style={{ display: 'inline-block', fontSize: 7, fontWeight: 600, padding: '1px 4px', borderRadius: 3, background: pos.bg, color: pos.color, marginLeft: 4 }}>{pos.label}</span></div>
                            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                              {[1,2,3,4,5].map(lv => (<polygon key={lv} points={gridPts(lv)} fill="none" stroke="#e2e8f0" strokeWidth="0.5"/>))}
                              {angles.map((a, i) => (<line key={i} x1={cx} y1={cy} x2={cx+R*Math.cos(a)} y2={cy+R*Math.sin(a)} stroke="#e2e8f0" strokeWidth="0.5"/>))}
                              <polygon points={dataPts} fill="rgba(239,68,68,0.1)" stroke="#ef4444" strokeWidth="1.5"/>
                              {angles.map((a, i) => { const px = cx+dataR[i]*Math.cos(a), py = cy+dataR[i]*Math.sin(a); const c = SPIDER_ITEMS[i].isRed ? redGrad(normV[i]) : '#ef4444'; return <circle key={i} cx={px} cy={py} r="3" fill={c} stroke="white" strokeWidth="0.5"/>; })}
                              {SPIDER_ITEMS.map((it, i) => { const lx = cx+(R+11)*Math.cos(angles[i]), ly = cy+(R+11)*Math.sin(angles[i]); const c = it.isRed ? redGrad(normV[i]) : '#94a3b8'; return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="7" fill={c}>{it.label}</text>; })}
                            </svg>
                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {[{ label: 'Ataque', pct: atkPct, color: '#ef4444' }, { label: 'Defensa', pct: defPct, color: '#22c55e' }].map(b => (<div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ fontSize: 7, color: '#94a3b8', width: 36 }}>{b.label}</span><div style={{ flex: 1, height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${b.pct}%`, height: '100%', background: b.color, borderRadius: 3 }}/></div><span style={{ fontSize: 7, color: '#94a3b8', width: 22, textAlign: 'right' }}>{b.pct}%</span></div>))}
                              <div style={{ marginTop: 3, padding: '2px 8px', borderRadius: 4, background: vbg, border: `0.5px solid ${vc}30`, fontSize: 8, fontWeight: 600, color: vc, textAlign: 'center' }}>{verdict}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <Footer page={6} total={total} />
                  </>
                );
              })()}
            </div>
          </>
        );
      })()}

      <div 
        className="bg-[#0A0B0E] text-slate-100 font-sans selection:bg-blue-600/30 overflow-hidden grid grid-rows-[auto_1fr_64px] lg:grid-rows-[auto_1fr] w-screen max-w-screen overflow-x-hidden"
        style={{ height: 'var(--app-height, 100vh)', maxHeight: 'var(--app-height, 100vh)' } as React.CSSProperties}
      >
        {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/80 z-40 backdrop-blur-md"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              className="fixed left-0 top-0 bottom-0 w-80 bg-slate-900/95 z-50 p-6 flex flex-col backdrop-blur-xl border-r border-white/10"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="text-xl font-black italic text-blue-400">
                  CONTROL TÁCTICO V2.5
                </div>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                <section className="bg-white/5 p-4 rounded-xl border border-white/10">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Configuración
                    </h3>
                    <button
                      onClick={() => setIsEditingTeams(!isEditingTeams)}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <Settings size={14} />
                    </button>
                  </div>
                  {isEditingTeams ? (
                    <div className="space-y-3">
                      <input
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                        placeholder="Equipo Local"
                        defaultValue={matchData.teamName}
                        onBlur={(e) =>
                          updateTeams(e.target.value, matchData.opponentName)
                        }
                      />
                      <input
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                        placeholder="Oponente"
                        defaultValue={matchData.opponentName}
                        onBlur={(e) =>
                          updateTeams(matchData.teamName, e.target.value)
                        }
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-xs font-black uppercase text-blue-400">
                        {matchData.teamName}
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase">
                        CONTRA {matchData.opponentName}
                      </div>
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <ImageIcon size={14} className="text-blue-500" /> Escudo Local
                  </h3>
                  <label className="w-full p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 flex items-center justify-between cursor-pointer group transition-all active:scale-[0.98]">
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-black">SUBIR ESCUDO</span>
                      <span className="text-[10px] text-slate-500 font-mono uppercase italic">
                        Local
                      </span>
                    </div>
                    {matchData.teamLogo ? (
                      <img src={matchData.teamLogo} className="w-8 h-8 object-contain rounded" alt="Local Logo" />
                    ) : (
                      <ImageIcon size={20} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleLogoUpload(e, false)}
                    />
                  </label>
                </section>

                <section className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <ImageIcon size={14} className="text-red-500" /> Escudo Rival
                  </h3>
                  <label className="w-full p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 flex items-center justify-between cursor-pointer group transition-all active:scale-[0.98]">
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-black">SUBIR ESCUDO</span>
                      <span className="text-[10px] text-slate-500 font-mono uppercase italic">
                        Oponente
                      </span>
                    </div>
                    {matchData.opponentLogo ? (
                      <img src={matchData.opponentLogo} className="w-8 h-8 object-contain rounded" alt="Opponent Logo" />
                    ) : (
                      <ImageIcon size={20} className="text-slate-600 group-hover:text-red-500 transition-colors" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleLogoUpload(e, true)}
                    />
                  </label>
                </section>

                <button
                  onClick={() => {
                    setActiveTab("more");
                    setIsConfigVisible(true);
                  }}
                  className="w-full p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 flex items-center justify-between group"
                >
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-black">CONFIGURACIÓN</span>
                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
                      EQUIPOS Y ESCUDOS
                    </span>
                  </div>
                  <Settings
                    size={20}
                    className="text-slate-600 group-hover:text-blue-400 transition-colors"
                  />
                </button>

                <button
                  onClick={() => { setIsSidebarOpen(false); navigate('/tactical-board'); }}
                  className="w-full p-5 bg-gradient-to-br from-lime-500/10 to-emerald-500/10 rounded-xl border border-lime-500/20 hover:border-lime-500/40 flex items-center justify-between group transition-all active:scale-95 shadow-lg"
                >
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-black text-white">PIZARRA</span>
                    <span className="text-[10px] text-lime-400 font-black tracking-widest">TÁCTICA INTERACTIVA</span>
                  </div>
                  <Pencil size={24} className="text-lime-600 group-hover:text-lime-400 transition-colors" />
                </button>

                <button
                  onClick={() => { setIsSidebarOpen(false); navigate('/dashboard'); }}
                  className="w-full p-5 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 flex items-center justify-between group transition-all active:scale-95 shadow-lg"
                >
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-black text-white">HISTORIAL</span>
                    <span className="text-[10px] text-blue-400 font-black tracking-widest">PARTIDOS GUARDADOS</span>
                  </div>
                  <LayoutDashboard size={24} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
                </button>
                <button
                  onClick={handleTacticalAnalysis}
                  className="w-full p-5 bg-gradient-to-br from-red-600/10 to-blue-600/10 rounded-xl border border-white/10 hover:border-blue-500/50 flex items-center justify-between group relative overflow-hidden active:scale-95 transition-all shadow-lg"
                >
                  <div className="flex flex-col text-left relative z-10">
                    <span className="text-sm font-black text-white italic">INFORME IA</span>
                    <span className="text-[10px] text-blue-400 font-black tracking-widest">
                      TÁCTICAL PRO
                    </span>
                  </div>
                  <Sparkles
                    size={24}
                    className="text-amber-400 group-hover:scale-110 transition-transform relative z-10"
                  />
                  <div className="absolute inset-0 bg-blue-500/5 blur-xl -z-0"></div>
                </button>

                <section className="bg-white/5 p-4 rounded-xl border border-white/10">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      {soundAlertsEnabled ? (
                        <Volume2 size={12} />
                      ) : (
                        <VolumeX size={12} />
                      )}
                      Alertas Sonoras
                    </h3>
                    <button
                      onClick={() => setSoundAlertsEnabled(!soundAlertsEnabled)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${soundAlertsEnabled ? "bg-blue-600" : "bg-slate-700"}`}
                    >
                      <motion.div
                        animate={{ x: soundAlertsEnabled ? 20 : 2 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 30,
                        }}
                        className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-lg"
                      />
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-500 uppercase leading-relaxed">
                    AVISAR AL LLEGAR A LAS 4 FALTAS (ZONA CRÍTICA)
                  </p>
                </section>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>


      <TacticalReportModal 
        isOpen={isTacticalModalOpen}
        onClose={() => setIsTacticalModalOpen(false)}
        report={tacticalReport}
        isLoading={isGeneratingReport}
      />

      <header
        className="py-1 bg-[#0E1015]/95 backdrop-blur-3xl border-b border-white/5 relative z-[100] shadow-2xl shrink-0"
      >
        <div className="max-w-5xl mx-auto flex flex-col px-2 gap-1">
          {/* TOP ROW: LOGOS, NAMES, FOULS */}
          <div className="flex items-center justify-between gap-2 px-1">
            {/* LOCAL INFO */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-10 h-10 bg-blue-600/10 border border-blue-500/30 rounded-xl flex items-center justify-center font-black text-sm text-blue-400 shrink-0 shadow-lg overflow-hidden relative group">
                {matchData.teamLogo ? <img src={matchData.teamLogo} className="w-full h-full object-contain" /> : matchData.teamName.substring(0, 1).toUpperCase()}
                {!isDataLocked && (
                  <>
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ImageIcon size={14} className="text-white" />
                    </div>
                    <input
                      title="Cambiar escudo"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleLogoUpload(e, false)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                {isEditingLocalName ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      type="text"
                      className="text-[11px] font-black uppercase text-blue-400 bg-white/5 border border-blue-500/50 rounded px-1 outline-none w-24"
                      value={matchData.teamName}
                      onChange={(e) => setMatchData(prev => ({ ...prev, teamName: e.target.value }))}
                      onBlur={() => setIsEditingLocalName(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setIsEditingLocalName(false);
                      }}
                    />
                    <button 
                      onClick={() => setIsEditingLocalName(false)}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <Check size={10} />
                    </button>
                  </div>
                ) : (
                  <div 
                    className="flex items-center gap-1 group cursor-pointer"
                    onClick={() => !isDataLocked && setIsEditingLocalName(true)}
                  >
                    <span className="text-[11px] font-black uppercase text-blue-400 truncate tracking-tight leading-none mb-0.5">
                      {matchData.teamName}
                    </span>
                    <Edit2 size={8} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span className="text-[7px] font-black text-slate-500">FALTAS:</span>
                  <span className={`transition-all duration-300 font-mono font-black leading-none ${
                    matchData.fouls.team >= 6
                      ? 'text-[18px] text-red-600 animate-[bounce_0.5s_infinite]'
                      : matchData.fouls.team === 5
                        ? 'text-[16px] text-red-500 animate-pulse'
                        : matchData.fouls.team === 4 
                          ? 'text-[13px] text-yellow-400' 
                          : 'text-[11px] text-slate-300'
                  }`}>{matchData.fouls.team}</span>
                  <div className="flex gap-[2px] ml-1.5 items-center">
                    <span className="text-[5px] font-black text-slate-600 mr-0.5">T.M:</span>
                    <div className={`w-1.5 h-2.5 rounded-sm ${matchData.timeoutsUsed.team.period1 ? 'bg-blue-400 shadow-[0_0_5px_rgba(96,165,250,0.5)]' : 'bg-slate-800 border border-white/5'}`} title="T.M. P1" />
                    <div className={`w-1.5 h-2.5 rounded-sm ${matchData.timeoutsUsed.team.period2 ? 'bg-blue-400 shadow-[0_0_5px_rgba(96,165,250,0.5)]' : 'bg-slate-800 border border-white/5'}`} title="T.M. P2" />
                  </div>

                </div>
              </div>
            </div>

             {/* RIVAL INFO */}
             <div className="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
               <div className="flex flex-col min-w-0">
                {isEditingOpponentName ? (
                  <div className="flex items-center justify-end gap-1">
                    <button 
                      onClick={() => setIsEditingOpponentName(false)}
                      className="text-red-500 hover:text-red-400"
                    >
                      <Check size={10} />
                    </button>
                    <input
                      autoFocus
                      type="text"
                      className="text-[11px] font-black uppercase text-red-500 bg-white/5 border border-red-500/50 rounded px-1 outline-none w-24 text-right"
                      value={matchData.opponentName}
                      onChange={(e) => setMatchData(prev => ({ ...prev, opponentName: e.target.value }))}
                      onBlur={() => setIsEditingOpponentName(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setIsEditingOpponentName(false);
                      }}
                    />
                  </div>
                ) : (
                  <div 
                    className="flex items-center justify-end gap-1 group cursor-pointer"
                    onClick={() => !isDataLocked && setIsEditingOpponentName(true)}
                  >
                    <Edit2 size={8} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="text-[11px] font-black uppercase text-red-500 truncate tracking-tight leading-none mb-0.5">
                      {matchData.opponentName}
                    </span>
                  </div>
                )}
                 <div className="flex items-center justify-end gap-1">

                   <div className="flex gap-[2px] mr-1.5 items-center">
                    <div className={`w-1.5 h-2.5 rounded-sm ${matchData.timeoutsUsed.opponent.period2 ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-slate-800 border border-white/5'}`} title="T.M. P2" />
                    <div className={`w-1.5 h-2.5 rounded-sm ${matchData.timeoutsUsed.opponent.period1 ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-slate-800 border border-white/5'}`} title="T.M. P1" />
                    <span className="text-[5px] font-black text-slate-600 ml-0.5">:T.M</span>
                  </div>
                  <span className={`transition-all duration-300 font-mono font-black leading-none ${
                    matchData.fouls.opponent >= 6
                      ? 'text-[18px] text-red-600 animate-[bounce_0.5s_infinite]'
                      : matchData.fouls.opponent === 5
                        ? 'text-[16px] text-red-500 animate-pulse'
                        : matchData.fouls.opponent === 4 
                          ? 'text-[13px] text-yellow-400' 
                          : 'text-[11px] text-slate-300'
                  }`}>{matchData.fouls.opponent}</span>
                  <span className="text-[7px] font-black text-slate-500 uppercase">:FALTAS</span>
                </div>
              </div>
              <div className="w-10 h-10 bg-red-600/10 border border-red-500/30 rounded-xl flex items-center justify-center font-black text-sm text-red-500 shrink-0 shadow-lg overflow-hidden relative group">
                {matchData.opponentLogo ? <img src={matchData.opponentLogo} className="w-full h-full object-contain" /> : matchData.opponentName.substring(0, 1).toUpperCase()}
                {!isDataLocked && (
                  <>
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ImageIcon size={14} className="text-white" />
                    </div>
                    <input
                      title="Cambiar escudo"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleLogoUpload(e, true)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* MAIN SCORE AND CLOCK ROW */}
          <div className="flex items-center justify-between px-2 pb-1 overflow-hidden">
            {/* LOCAL GOALS */}
            <div className="flex-1 flex flex-col items-start justify-center min-w-0 overflow-hidden">
              <motion.span 
                key={goals}
                initial={{ scale: 1.5, color: '#fff' }}
                animate={{ scale: 1, color: '#3b82f6' }}
                className="text-6xl font-black tabular-nums leading-none tracking-tighter drop-shadow-[0_0_20px_rgba(59,130,246,0.5)]"
              >
                {goals}
              </motion.span>

            </div>

            {/* INTEGRATED CLOCK AND CONTROLS (Reduced size) */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-2xl border border-white/10 backdrop-blur-md shadow-xl relative">
                <button 
                  onClick={resetTimer} 
                  className="group flex flex-col items-center justify-center transition-all active:scale-90"
                  title="Reiniciar"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-slate-500 group-hover:bg-red-500/20 group-hover:text-red-400 transition-all">
                    <RotateCcw size={14} />
                  </div>
                </button>

                <div className="flex flex-col items-center min-w-[90px] gap-0">
                  <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
                    {matchData.period === Period.FIRST ? "1º PARTE" : matchData.period === Period.SECOND ? "2º PARTE" : matchData.period === Period.FINISHED ? "PARTIDO FINALIZADO" : "PRÓRROGA"}
                  </span>
                  <span className={`text-4xl font-mono font-black tabular-nums leading-none tracking-tighter ${matchData.isClockRunning ? "text-amber-400" : "text-white/20"}`}>
                    {formatTime(matchData.matchClock)}
                  </span>
                </div>

                <button 
                  onClick={toggleClock} 
                  className="group flex flex-col items-center justify-center transition-all active:scale-90"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all shadow-lg ${matchData.isClockRunning ? "bg-amber-500/10 text-amber-500 border-amber-500/40 shadow-amber-500/20" : "bg-green-600/20 text-green-400 border-green-500/40 shadow-green-600/20"}`}>
                    {matchData.isClockRunning ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                  </div>
                </button>
              </div>

              {/* PERIOD MANAGEMENT BUTTONS */}
              <div className="flex items-center justify-center gap-2">
                {isDataLocked ? (
                  <button
                    onClick={() => setIsDataLocked(false)}
                    className="px-6 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all bg-green-500 hover:bg-green-400 text-white shadow-[0_0_20px_rgba(34,197,94,0.4)] animate-pulse flex items-center gap-2"
                  >
                    <Play size={14} fill="currentColor" />
                    Iniciar {matchData.period === Period.SECOND ? "2ª Parte" : matchData.period === Period.OVERTIME_1 ? "Prórroga" : "Periodo"}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        if (matchData.period === Period.FIRST) {
                          setIsEndFirstConfirmOpen(true);
                        }
                      }}
                      disabled={matchData.period !== Period.FIRST}
                      className={`px-4 py-1 rounded-md text-[10px] font-black uppercase tracking-tight transition-all border ${matchData.period === Period.FIRST ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 hover:bg-blue-600/30' : 'bg-white/5 border-white/10 text-slate-500 opacity-50 cursor-not-allowed'}`}
                    >
                      FIN 1ª
                    </button>
                    <button
                      onClick={() => {
                        if (matchData.period === Period.SECOND) {
                          setIsEndSecondConfirmOpen(true);
                        }
                      }}
                      disabled={matchData.period !== Period.SECOND}
                      className={`px-4 py-1 rounded-md text-[10px] font-black uppercase tracking-tight transition-all border ${matchData.period === Period.SECOND ? 'bg-red-600/20 border-red-500/50 text-red-400 hover:bg-red-600/30' : 'bg-white/5 border-white/10 text-slate-500 opacity-50 cursor-not-allowed'}`}
                    >
                      FIN 2ª
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* RIVAL GOALS */}
            <div className="flex-1 flex flex-col items-end justify-center min-w-0 overflow-hidden">
              <motion.span 
                key={opponentGoals}
                initial={{ scale: 1.5, color: '#fff' }}
                animate={{ scale: 1, color: '#ef4444' }}
                className="text-6xl font-black tabular-nums leading-none tracking-tighter drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]"
              >
                {opponentGoals}
              </motion.span>

            </div>
          </div>
        </div>
      </header>

      {/* DASHBOARD BODY - REORGANIZED FOR NO SCROLLING */}
      <main className={`px-2 py-1 grid gap-1 overflow-hidden min-h-0
        ${activeTab === "pitch" ? "grid-cols-1 lg:grid-cols-[240px_1fr]" : "grid-cols-1 lg:grid-cols-[240px_1fr_240px]"} mb-0 mt-0 h-full`}>
        {/* LEFT: ANALYSIS CONSOLE (Goalie, Timeline, Stats) */}
        <aside
          className={`bg-white/5 border border-white/5 rounded-2xl flex flex-col overflow-hidden backdrop-blur-md ${activeTab === "pitch" ? "hidden lg:flex" : "flex h-full lg:h-auto"}`}
        >
          <div
            className={`p-4 bg-white/5 border-b border-white/5 flex items-center justify-between lg:hidden ${activeTab !== "pitch" ? "hidden" : ""}`}
          >
            <div className="flex flex-col">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {activeTab === "goalie"
                  ? "Análisis Porteros"
                  : "Línea Temporal"}
              </h3>
              <p className="text-[8px] text-blue-400 font-black uppercase mt-0.5">
                Control Profesional
              </p>
            </div>
            <button
              onClick={() => setActiveTab("pitch")}
              className="px-3 py-1.5 bg-blue-600/10 border border-blue-500/30 rounded-lg text-[9px] font-black text-blue-400 uppercase"
            >
              Ver Campo
            </button>
          </div>

          <div
            className={`p-4 bg-white/5 border-b border-white/5 flex items-center justify-between ${activeTab !== "pitch" ? "hidden lg:flex" : "flex"}`}
          >
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Activity size={12} /> Consola de Análisis
            </h3>
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-1.5 hover:bg-white/5 rounded-lg text-slate-500 transition-colors"
            >
              <Menu size={16} />
            </button>
          </div>

          <nav
            className={`p-2 flex flex-col gap-1 bg-white/5 border-b border-white/5 ${activeTab !== "pitch" ? "hidden lg:flex" : "flex"}`}
          >
            {[
              { id: "pitch", label: "Campo", icon: MapIcon, mobileOnly: true },
              { id: "goalie", label: "Porteros", icon: Crosshair },
              { id: "history", label: "Timeline", icon: History },
              { id: "stats", label: "Estadísticas", icon: Trophy },
              { id: "more", label: "Más", icon: Settings },
            ]
              .filter((tab) => !tab.mobileOnly || (tab.mobileOnly && true))
              .map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full py-3 rounded-lg flex items-center px-4 gap-3 text-[9px] font-black uppercase tracking-widest transition-all 
                        ${tab.mobileOnly ? "lg:hidden" : ""}
                        ${activeTab === tab.id ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-slate-500 hover:text-slate-200 hover:bg-white/5"}
                     `}
                >
                  <tab.icon size={14} /> {tab.label}
                </button>
              ))}
          </nav>

          <div className="flex-1 p-4 custom-scrollbar overflow-y-auto flex flex-col h-full">
            <AnimatePresence mode="wait">
              {activeTab === "goalie" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col gap-8"
                >
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => handleDynamicExport("PNG")}
                      disabled={isExporting}
                      className="flex-1 py-2 rounded-xl flex items-center justify-center gap-2 bg-slate-800 text-white hover:bg-slate-700 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                    >
                      <ImageIcon size={14} /> PNG
                    </button>
                    <button
                      onClick={() => handleDynamicExport("PDF")}
                      disabled={isExporting}
                      className="flex-1 py-2 rounded-xl flex items-center justify-center gap-2 bg-slate-800 text-white hover:bg-slate-700 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                    >
                      <Download size={14} /> PDF
                    </button>
                  </div>

                  <div ref={dynamicExportRef} className={`flex flex-col gap-8 py-2 px-1 bg-[#0A0B0E] ${isExporting ? "p-6" : ""}`}>
                    {isExporting && (
                      <div className="flex flex-col items-center justify-center pb-4 border-b border-white/10 mb-2 mt-2">
                        <h2 className="text-2xl font-black text-white uppercase tracking-widest text-center mb-1">
                          ANÁLISIS DE PORTEROS
                        </h2>
                        <p className="text-sm font-black text-amber-500 uppercase tracking-widest text-center">
                          {matchData.teamName} vs {matchData.opponentName}
                        </p>
                      </div>
                    )}
                    {/* LOCAL GOALKEEPERS SECTION */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                        <ShieldAlert size={14} /> Nuestros Porteros
                      </h4>
                    </div>

                    {matchData.players
                      .filter((p) => p.role === Role.GOALKEEPER && !p.isOpponent)
                      .map((goalie) => (
                        <div key={goalie.id}>
                          {renderGoalieCard(goalie, false)}
                        </div>
                      ))}
                  </div>

                  {/* RIVAL GOALKEEPERS SECTION */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                        <Shield size={14} /> Porteros Rivales ({matchData.opponentName || "Rival"})
                      </h4>
                    </div>

                    {matchData.players
                      .filter((p) => p.role === Role.GOALKEEPER && p.isOpponent)
                      .map((goalie) => (
                        <div key={goalie.id}>
                          {renderGoalieCard(goalie, true)}
                        </div>
                      ))}
                  </div>
                  </div>
                </motion.div>
              )}

              {activeTab === "history" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  {(() => {
                    const eventsByPeriod = matchData.events.reduce((acc, event) => {
                      const period = event.period;
                      if (!acc[period]) acc[period] = [];
                      acc[period].push(event);
                      return acc;
                    }, {} as Record<number, GameEvent[]>);

                    return Object.entries(eventsByPeriod)
                      .sort(([a], [b]) => Number(b) - Number(a)) // Latest period first
                      .map(([period, periodEvents]) => (
                        <div key={period} className="space-y-2">
                          <div className="flex items-center gap-2 px-1">
                            <div className="h-[1px] flex-1 bg-white/10" />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                              {period === String(Period.FIRST) ? "1ª PARTE" : 
                               period === String(Period.SECOND) ? "2ª PARTE" : 
                               period === String(Period.OVERTIME_1) ? "PRÓRROGA 1" : 
                               period === String(Period.OVERTIME_2) ? "PRÓRROGA 2" : "FINAL"}
                            </span>
                            <div className="h-[1px] flex-1 bg-white/10" />
                          </div>
                          
                          {periodEvents
                            .sort((a, b) => b.timestamp - a.timestamp)
                            .map((e) => (
                              <div
                                key={e.id}
                                className={`p-2 bg-white/5 border border-white/5 rounded-lg flex items-center justify-between gap-3 group transition-all hover:bg-white/10 ${
                                  e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED 
                                    ? "ring-1 ring-green-500/30 bg-green-500/5" 
                                    : ""
                                }`}
                              >
                                <div className="flex flex-col gap-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[8px] font-mono font-black ${
                                      e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED ? "text-green-400" : "text-blue-400"
                                    }`}>
                                      {formatTime(e.timestamp)}
                                    </span>
                                    {e.scoreAtEvent && (
                                      <span className="text-[7px] font-black bg-black/60 px-1 rounded text-white border border-white/5">
                                        {e.scoreAtEvent.team}-{e.scoreAtEvent.opponent}
                                      </span>
                                    )}
                                    <span className="text-[7px] font-black text-slate-600 uppercase">
                                      {e.gameState}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className={`w-5 h-5 rounded-md bg-black/40 flex items-center justify-center font-black text-[9px] border border-white/5 shrink-0 ${
                                      e.metadata?.isOpponent ? "text-red-400" : "text-blue-400"
                                    }`}>
                                      {matchData.players.find(
                                        (p) => p.id === e.playerIds[0],
                                      )?.number || "--"}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[9px] font-black uppercase truncate text-white">
                                        {e.type.replace(/_/g, " ")}
                                      </span>
                                      <span className="text-[7px] font-bold text-slate-500 uppercase tracking-tighter">
                                        {matchData.players.find(
                                          (p) => p.id === e.playerIds[0],
                                        )?.name || "Equipo"}
                                      </span>
                                    </div>
                                    {e.metadata?.setPiece &&
                                      e.metadata.setPiece !== "normal" && (
                                        <span
                                          className={`text-[6px] font-black px-1 rounded-sm border shrink-0 ${
                                            e.metadata.setPiece === "penalty"
                                              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                              : "bg-red-500/20 text-red-400 border-red-500/30"
                                          }`}
                                        >
                                          {e.metadata.setPiece === "penalty"
                                            ? "PENALTI"
                                            : "DOBLE P."}
                                        </span>
                                      )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-[10px] font-mono font-bold text-slate-500">
                                    #{matchData.events.indexOf(e) + 1}
                                  </span>
                                  <button
                                    onClick={() => setDeleteConfirmEvent(e)}
                                    className="p-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-md transition-all shadow-sm shrink-0"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      ));
                  })()}
                </motion.div>
              )}

              {activeTab === "stats" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col gap-6"
                >
                  <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
                    {[
                      { id: "players", label: "Jugadores", icon: Users },
                      { id: "team", label: "Equipo", icon: Activity },
                      { id: "positions", label: "Puestos", icon: Layers },
                      { id: "maps", label: "Mapas", icon: MapIcon },
                    ].map((view) => (
                      <button
                        key={view.id}
                        onClick={() => setStatsView(view.id as any)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${statsView === view.id ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:bg-white/5"}`}
                      >
                        <view.icon size={12} /> {view.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowRivalStats(false)}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${!showRivalStats ? "bg-blue-600 text-white shadow-lg" : "bg-white/5 text-slate-500 hover:bg-white/10"}`}
                    >
                      LOCAL
                    </button>
                    <button
                      onClick={() => setShowRivalStats(true)}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${showRivalStats ? "bg-red-600 text-white shadow-lg" : "bg-white/5 text-slate-500 hover:bg-white/10"}`}
                    >
                      RIVAL
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDynamicExport("PNG")}
                      disabled={isExporting}
                      className="flex-1 py-2 rounded-xl flex items-center justify-center gap-2 bg-slate-800 text-white hover:bg-slate-700 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                    >
                      <ImageIcon size={14} /> PNG
                    </button>
                    <button
                      onClick={() => handleDynamicExport("PDF")}
                      disabled={isExporting}
                      className="flex-1 py-2 rounded-xl flex items-center justify-center gap-2 bg-slate-800 text-white hover:bg-slate-700 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                    >
                      <Download size={14} /> PDF
                    </button>
                  </div>

                  <div ref={dynamicExportRef} className={`flex flex-col gap-6 py-2 px-1 bg-[#0A0B0E] ${isExporting ? "p-6" : ""}`}>
                    {isExporting && (
                      <div className="flex flex-col items-center justify-center pb-4 border-b border-white/10 mb-2">
                        <h2 className="text-2xl font-black text-white uppercase tracking-widest text-center mb-1">
                          {showRivalStats ? matchData.opponentName : matchData.teamName}
                        </h2>
                        <p className="text-sm font-black text-blue-400 uppercase tracking-widest text-center">
                          {statsView === "team" ? "Estadísticas del Equipo" :
                           statsView === "positions" ? "Estadísticas por Puestos" :
                           statsView === "players" ? "Estadísticas de Jugadores" :
                           statsView === "maps" ? `Mapas - ${
                             selectedMapMetric === "goals" ? "Goles" :
                             selectedMapMetric === "conceded" ? "Goles Recibidos" :
                             selectedMapMetric === "shots" ? "Tiros" :
                             selectedMapMetric === "received-shots" ? "Tiros Recibidos" :
                             selectedMapMetric === "recoveries" ? "Recuperaciones" :
                             "Pérdidas"
                           }${selectedMapPlayerId !== "all" ? ` - Jugador: ${matchData.players.find(p => p.id === selectedMapPlayerId)?.name}` : " - Equipo Completo"}`
                           : "Estadísticas"}
                        </p>
                      </div>
                    )}
                  {statsView === "team" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col gap-6"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {(() => {
                          const myPlayers = matchData?.players?.filter(
                            (p) => !!p?.isOpponent === showRivalStats,
                          ) || [];
                          const myEvents = matchData?.events?.filter(
                            (e) => !!e?.metadata?.isOpponent === showRivalStats
                          ) || [];
                          const totalGoals = myPlayers.reduce(
                            (acc, p) => acc + (p?.stats?.goals || 0),
                            0,
                          );
                          const teamGoalEvents = myEvents.filter(e => e?.type === ActionType.GOAL);
                          const totalGoalPenalties = teamGoalEvents.filter(e => e?.metadata?.setPiece === "penalty").length;
                          const totalGoalDoublePenalties = teamGoalEvents.filter(e => e?.metadata?.setPiece === "double_penalty").length;

                          const totalAssists = myPlayers.reduce(
                            (acc, p) => acc + (p?.stats?.assists || 0),
                            0,
                          );
                          const teamShotsEvents = myEvents.filter(e => 
                            e?.type === ActionType.SHOT || 
                            e?.type === ActionType.GOAL || 
                            e?.type === GoalieAction.GOAL_CONCEDED
                          );
                          const totalShots = teamShotsEvents.length;
                          const totalShotsOnTarget = teamShotsEvents.filter(e => 
                            e?.type === ActionType.GOAL || 
                            e?.type === GoalieAction.GOAL_CONCEDED || 
                            (e?.type === ActionType.SHOT && e?.metadata?.destinationGrid !== "OUT")
                          ).length;
                          const totalShotsOffTarget = teamShotsEvents.filter(e => 
                            e?.type === ActionType.SHOT && e?.metadata?.destinationGrid === "OUT"
                          ).length;

                          const totalPenalties = teamShotsEvents.filter(e => e?.metadata?.setPiece === "penalty").length;
                          const totalDoublePenalties = teamShotsEvents.filter(e => e?.metadata?.setPiece === "double_penalty").length;

                          const totalSteals = myPlayers.reduce(
                            (acc, p) => acc + (p?.stats?.steals || 0),
                            0,
                          );

                          return (
                            <>
                              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex flex-col items-center">
                                <span className="text-[8px] font-black text-green-500 uppercase mb-1">
                                  Goles Totales
                                </span>
                                <span className="text-2xl font-black text-white">
                                  {totalGoals}
                                </span>
                                <div className="flex gap-2 mt-1">
                                  <div className="flex flex-col items-center">
                                    <span className="text-[6px] font-bold text-slate-500 uppercase leading-none">PEN</span>
                                    <span className="text-[10px] font-black text-green-400">{totalGoalPenalties}</span>
                                  </div>
                                  <div className="w-[1px] h-4 bg-white/10 mx-0.5 self-center" />
                                  <div className="flex flex-col items-center">
                                    <span className="text-[6px] font-bold text-slate-500 uppercase leading-none">D.PEN</span>
                                    <span className="text-[10px] font-black text-green-400">{totalGoalDoublePenalties}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex flex-col items-center">
                                <span className="text-[8px] font-black text-blue-500 uppercase mb-1">
                                  Asistencias
                                </span>
                                <span className="text-2xl font-black text-white">
                                  {totalAssists}
                                </span>
                              </div>
                              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col items-center relative group">
                                <span className="text-[8px] font-black text-amber-500 uppercase mb-1">
                                  Tiros Totales
                                </span>
                                <span className="text-2xl font-black text-white">
                                  {totalShots}
                                </span>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
                                  <div className="flex flex-col items-center">
                                    <span className="text-[5px] font-bold text-slate-500 uppercase leading-none">PORT.</span>
                                    <span className="text-[9px] font-black text-amber-400">{totalShotsOnTarget}</span>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <span className="text-[5px] font-bold text-slate-500 uppercase leading-none">FUERA</span>
                                    <span className="text-[9px] font-black text-slate-400">{totalShotsOffTarget}</span>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <span className="text-[5px] font-bold text-slate-500 uppercase leading-none">PEN</span>
                                    <span className="text-[9px] font-black text-amber-600/80">{totalPenalties}</span>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <span className="text-[5px] font-bold text-slate-500 uppercase leading-none">D.PEN</span>
                                    <span className="text-[9px] font-black text-amber-600/80">{totalDoublePenalties}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex flex-col items-center">
                                <span className="text-[8px] font-black text-purple-500 uppercase mb-1">
                                  Recuperaciones
                                </span>
                                <span className="text-2xl font-black text-white">
                                  {totalSteals}
                                </span>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                        <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">
                          Distribución de Juego
                        </h4>
                        <div className="space-y-4">
                          {(() => {
                            const stats = matchData.players
                              .filter((p) => !!p.isOpponent === showRivalStats)
                              .reduce(
                                (acc, p) => ({
                                  steals: acc.steals + p.stats.steals,
                                  losses: acc.losses + p.stats.losses,
                                  fouls: acc.fouls + p.stats.fouls,
                                }),
                                {
                                  steals: 0,
                                  losses: 0,
                                  fouls: 0,
                                },
                              );

                            const items = [
                              {
                                label: "Recuperaciones",
                                val: stats.steals,
                                color: "bg-green-500",
                              },
                              {
                                label: "Pérdidas",
                                val: stats.losses,
                                color: "bg-red-500",
                              },
                              {
                                label: "Faltas",
                                val: stats.fouls,
                                color: "bg-orange-500",
                              },
                            ];
                            const max = Math.max(...items.map((i) => i.val), 1);

                            return items.map((item) => (
                              <div
                                key={item.label}
                                className="flex flex-col gap-1.5"
                              >
                                <div className="flex justify-between text-[8px] font-black uppercase text-slate-400">
                                  <span>{item.label}</span>
                                  <span className="text-white">{item.val}</span>
                                </div>
                                <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{
                                      width: `${(item.val / max) * 100}%`,
                                    }}
                                    className={`h-full ${item.color} rounded-full`}
                                  />
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {statsView === "positions" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col gap-4"
                    >
                      {[Role.GOALKEEPER, Role.PLAYER].map((role) => {
                        const players = matchData.players.filter(
                          (p) => p.role === role && !!p.isOpponent === showRivalStats,
                        );
                        if (players.length === 0) return null;

                        const aggregate = players.reduce(
                          (acc, p) => ({
                            goals: acc.goals + p.stats.goals,
                            assists: acc.assists + p.stats.assists,
                            shots: acc.shots + p.stats.shots,
                            interceptions:
                              acc.interceptions + p.stats.interceptions,
                            losses: acc.losses + p.stats.losses,
                            time: acc.time + p.individualTimeSeconds,
                          }),
                          {
                            goals: 0,
                            assists: 0,
                            shots: 0,
                            interceptions: 0,
                            losses: 0,
                            time: 0,
                          },
                        );

                        return (
                          <div
                            key={role}
                            className="p-4 bg-white/5 border border-white/5 rounded-2xl"
                          >
                            <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                              <h4 className="text-[10px] font-black text-white uppercase tracking-widest">
                                {role === Role.GOALKEEPER
                                  ? "Portería"
                                  : "Jugadores de Pista"}
                              </h4>
                              <span className="text-[8px] font-black text-slate-500 uppercase">
                                {players.length} Efectivos
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex flex-col gap-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-[8px] font-black text-slate-500 uppercase">
                                    Goles
                                  </span>
                                  <span className="text-xs font-black text-white">
                                    {aggregate.goals}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-[8px] font-black text-slate-500 uppercase">
                                    Asistencias
                                  </span>
                                  <span className="text-xs font-black text-white">
                                    {aggregate.assists}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-[8px] font-black text-slate-500 uppercase">
                                    Intercep.
                                  </span>
                                  <span className="text-xs font-black text-white">
                                    {aggregate.interceptions}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-[8px] font-black text-slate-500 uppercase">
                                    Pérdidas
                                  </span>
                                  <span className="text-xs font-black text-red-400">
                                    {aggregate.losses}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-[8px] font-black text-slate-500 uppercase">
                                    Tiros
                                  </span>
                                  <span className="text-xs font-black text-white">
                                    {aggregate.shots}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-[8px] font-black text-slate-500 uppercase">
                                    Media Tiempo
                                  </span>
                                  <span className="text-xs font-black text-blue-400">
                                    {Math.floor(
                                      aggregate.time / players.length / 60,
                                    )}
                                    m
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}

                  {statsView === "maps" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col gap-6"
                    >
                      {/* Player Selector for Maps */}
                      <div className="flex flex-col gap-2 bg-black/20 p-3 rounded-2xl border border-white/5">
                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">Filtrar por Jugador</label>
                        <select 
                          value={selectedMapPlayerId}
                          onChange={(e) => setSelectedMapPlayerId(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-white outline-none focus:border-blue-500 transition-all font-sans"
                        >
                          <option value="all">Equipo Completo</option>
                          {matchData.players
                            .filter(p => !!p.isOpponent === showRivalStats && p.role !== Role.COACH && p.role !== Role.DELEGATE)
                            .map(p => (
                              <option key={p.id} value={p.id}>{p.number} - {p.name}</option>
                            ))
                          }
                        </select>
                      </div>

                      {/* Metric Selector for Maps */}
                      <div className="grid grid-cols-3 gap-2 bg-black/20 p-2 rounded-2xl border border-white/5">
                        {[
                          { id: "goals", label: "Goles", color: "bg-green-600" },
                          { id: "conceded", label: "Recibidos", color: "bg-red-600" },
                          { id: "shots", label: "Tiros", color: "bg-blue-600" },
                          { id: "received-shots", label: "Tiros Rec", color: "bg-rose-600" },
                          { id: "recoveries", label: "Recupera.", color: "bg-cyan-600" },
                          { id: "losses", label: "Pérdidas", color: "bg-amber-600" },
                        ].map((metric) => (
                          <button
                            key={metric.id}
                            onClick={() => setSelectedMapMetric(metric.id as any)}
                            className={`py-2 px-1 rounded-xl text-[7px] font-black uppercase tracking-widest transition-all border flex flex-col items-center gap-1
                              ${selectedMapMetric === metric.id 
                                ? `${metric.color} text-white border-white shadow-lg` 
                                : "bg-white/5 text-slate-500 border-transparent hover:bg-white/10"}`}
                          >
                            {metric.label}
                          </button>
                        ))}
                      </div>

                      <div className="bg-white/5 border border-white/5 p-4 rounded-[2rem] backdrop-blur-xl flex flex-col gap-8">
                        {selectedMapMetric === "goals" && (
                          <>
                            <FutsalHeatMap
                              title={`Mapa de Goles ${showRivalStats ? "Rival" : "Local"}`}
                              colorScheme={showRivalStats ? "red" : "green"}
                              players={matchData.players}
                              events={matchData.events.filter(ev => 
                                (ev.type === ActionType.GOAL || ev.type === GoalieAction.GOAL_CONCEDED) && 
                                !!ev.metadata?.isOpponent === showRivalStats &&
                                (selectedMapPlayerId === "all" || ev.playerIds.includes(selectedMapPlayerId))
                              )}
                            />
                            <div className="h-px bg-white/5 w-full" />
                            <GoalHeatMap
                              title={`Portería Goles ${showRivalStats ? "Rival" : "Local"}`}
                              colorScheme={showRivalStats ? "red" : "green"}
                              players={matchData.players}
                              events={matchData.events.filter(ev => 
                                (ev.type === ActionType.GOAL || ev.type === GoalieAction.GOAL_CONCEDED) && 
                                !!ev.metadata?.isOpponent === showRivalStats &&
                                (selectedMapPlayerId === "all" || ev.playerIds.includes(selectedMapPlayerId))
                              )}
                            />
                          </>
                        )}
                        {selectedMapMetric === "recoveries" && (
                          <FutsalHeatMap
                            title={`Zonas de Recuperación ${showRivalStats ? "Rival" : "Local"}`}
                            colorScheme="cyan"
                            players={matchData.players}
                            events={matchData.events.filter(ev => 
                              (ev.type === ActionType.STEAL || ev.type === ActionType.INTERCEPTION) && 
                              !!ev.metadata?.isOpponent === showRivalStats &&
                              (selectedMapPlayerId === "all" || ev.playerIds.includes(selectedMapPlayerId))
                            )}
                          />
                        )}
                        {selectedMapMetric === "losses" && (
                          <FutsalHeatMap
                            title={`Zonas de Pérdidas ${showRivalStats ? "Rival" : "Local"}`}
                            colorScheme="amber"
                            players={matchData.players}
                            events={matchData.events.filter(ev => 
                              (ev.type === ActionType.LOSS || ev.type === ActionType.UNFORCED_ERROR) && 
                              !!ev.metadata?.isOpponent === showRivalStats &&
                              (selectedMapPlayerId === "all" || ev.playerIds.includes(selectedMapPlayerId))
                            )}
                          />
                        )}
                        {selectedMapMetric === "conceded" && (
                          <>
                            <FutsalHeatMap
                              title={`Mapa de Goles Encajados ${showRivalStats ? "Rival" : "Local"}`}
                              colorScheme={showRivalStats ? "green" : "red"}
                              players={matchData.players}
                              events={matchData.events.filter(ev => 
                                (ev.type === ActionType.GOAL || ev.type === GoalieAction.GOAL_CONCEDED) && 
                                !!ev.metadata?.isOpponent !== showRivalStats &&
                                (selectedMapPlayerId === "all" || ev.playerIds.includes(selectedMapPlayerId))
                              )}
                            />
                            <div className="h-px bg-white/5 w-full" />
                            <GoalHeatMap
                              title={`Portería Goles Encajados ${showRivalStats ? "Rival" : "Local"}`}
                              colorScheme={showRivalStats ? "green" : "red"}
                              players={matchData.players}
                              events={matchData.events.filter(ev => 
                                (ev.type === ActionType.GOAL || ev.type === GoalieAction.GOAL_CONCEDED) && 
                                !!ev.metadata?.isOpponent !== showRivalStats &&
                                (selectedMapPlayerId === "all" || ev.playerIds.includes(selectedMapPlayerId))
                              )}
                            />
                          </>
                        )}
                        {selectedMapMetric === "shots" && (
                          <>
                            <FutsalHeatMap
                              title={`Mapa de Tiros ${showRivalStats ? "Rival" : "Local"}`}
                              colorScheme={showRivalStats ? "red" : "blue"}
                              players={matchData.players}
                              events={matchData.events.filter(ev => 
                                (ev.type === ActionType.SHOT || ev.type === GoalieAction.SAVE_CATCH || ev.type === GoalieAction.SAVE_PARRY) && 
                                !!ev.metadata?.isOpponent === showRivalStats &&
                                (selectedMapPlayerId === "all" || ev.playerIds.includes(selectedMapPlayerId))
                              )}
                            />
                            <div className="h-px bg-white/5 w-full" />
                            <GoalHeatMap
                              title={`Portería Tiros ${showRivalStats ? "Rival" : "Local"}`}
                              colorScheme={showRivalStats ? "red" : "blue"}
                              players={matchData.players}
                              events={matchData.events.filter(ev => 
                                (ev.type === ActionType.SHOT || ev.type === GoalieAction.SAVE_CATCH || ev.type === GoalieAction.SAVE_PARRY) && 
                                !!ev.metadata?.isOpponent === showRivalStats &&
                                (selectedMapPlayerId === "all" || ev.playerIds.includes(selectedMapPlayerId))
                              )}
                            />
                          </>
                        )}
                        {selectedMapMetric === "received-shots" && (
                          <>
                            <FutsalHeatMap
                              title={`Mapa de Tiros Recibidos ${showRivalStats ? "Rival" : "Local"}`}
                              colorScheme="orange"
                              players={matchData.players}
                              events={matchData.events.filter(ev => 
                                (ev.type === ActionType.SHOT || ev.type === GoalieAction.SAVE_CATCH || ev.type === GoalieAction.SAVE_PARRY) && 
                                !!ev.metadata?.isOpponent !== showRivalStats &&
                                (selectedMapPlayerId === "all" || ev.playerIds.includes(selectedMapPlayerId))
                              )}
                            />
                            <div className="h-px bg-white/5 w-full" />
                            <GoalHeatMap
                              title={`Portería Tiros Recibidos ${showRivalStats ? "Rival" : "Local"}`}
                              colorScheme="orange"
                              players={matchData.players}
                              events={matchData.events.filter(ev => 
                                (ev.type === ActionType.SHOT || ev.type === GoalieAction.SAVE_CATCH || ev.type === GoalieAction.SAVE_PARRY) && 
                                !!ev.metadata?.isOpponent !== showRivalStats &&
                                (selectedMapPlayerId === "all" || ev.playerIds.includes(selectedMapPlayerId))
                              )}
                            />
                          </>
                        )}
                      </div>

                      <div className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl">
                        <p className="text-[8px] text-blue-300 uppercase font-black tracking-widest flex items-center gap-2">
                          <Zap size={12} /> Insight Táctico
                        </p>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                          Utiliza estos mapas para identificar zonas calientes de finalización y debilidades defensivas en la cobertura de espacios.
                        </p>
                      </div>
                    </motion.div>
                  )}



                  {statsView === "players" && (
                    <>
                      <div className="flex gap-2 mb-4">
                        <button
                          onClick={copySummaryToClipboard}
                          className="flex-1 py-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:bg-white/10 active:scale-95 transition-all"
                        >
                          <Activity size={14} /> Copiar Resumen
                        </button>
                        <button
                          onClick={handleExportCSV}
                          className="flex-1 py-3 bg-green-600/10 border border-green-500/30 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-green-400 hover:bg-green-600/20 active:scale-95 transition-all"
                        >
                          <Download size={14} /> Sheets/CSV
                        </button>
                        <button
                          onClick={handleTacticalAnalysis}
                          className="flex-[1.5] py-3 bg-gradient-to-r from-red-600/20 to-blue-600/20 border border-white/20 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-white hover:from-red-600/30 hover:to-blue-600/30 active:scale-95 transition-all shadow-lg relative overflow-hidden"
                        >
                          <Sparkles size={14} className="text-amber-400 group-hover:scale-110 transition-transform" />
                          <span className="italic">TÁCTICAL PRO</span>
                        </button>
                      </div>

                      <div className={`${showRivalStats ? "bg-red-600/10 border-red-500/20 text-red-400" : "bg-blue-600/10 border-blue-500/20 text-blue-400"} border p-4 rounded-3xl shadow-xl mb-4`}>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                             <Trophy size={14} className="animate-pulse" />{" "}
                             Resumen Estadístico {showRivalStats ? "Rival" : "Local"}
                          </div>
                          {!showRivalStats && (
                            <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-1">
                              <Sparkles size={10} className="text-amber-500" />
                              <span className="text-[7px] text-amber-500">AUTO-ANALYSIS ON</span>
                            </div>
                          )}
                        </div>

                        {/* Tactical Analyst Card */}
                        {!showRivalStats && (
                          <TacticalAnalyst matchData={matchData} />
                        )}
                         
                        {/* Comparison Bars */}
                        <div className="space-y-3 mb-6 bg-black/20 p-4 rounded-2xl border border-white/5">
                          {[
                            { 
                              label: "Goles", 
                              local: goals, 
                              rival: opponentGoals, 
                              color: "bg-green-500" 
                            },
                            { 
                              label: "Tiros", 
                              local: matchData.events.filter(e => (e.type === ActionType.SHOT || e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent).length,
                              rival: matchData.events.filter(e => (e.type === ActionType.SHOT || e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && e.metadata?.isOpponent).length,
                              color: "bg-blue-500" 
                            },
                            { 
                              label: "Faltas", 
                              local: matchData.fouls.team, 
                              rival: matchData.fouls.opponent, 
                              color: "bg-orange-500" 
                            }
                          ].map((item) => {
                            const total = item.local + item.rival || 1;
                            const localPct = (item.local / total) * 100;
                            return (
                              <div key={item.label} className="space-y-1">
                                <div className="flex justify-between text-[7px] font-black uppercase tracking-tighter text-slate-500">
                                  <span>{item.local} {matchData.teamName}</span>
                                  <span className="text-slate-300">{item.label}</span>
                                  <span>{matchData.opponentName} {item.rival}</span>
                                </div>
                                <div className="h-1.5 flex gap-0.5 rounded-full overflow-hidden bg-white/5">
                                  <div 
                                    className={`h-full ${item.color} opacity-80 rounded-l-full transition-all duration-700`}
                                    style={{ width: `${localPct}%` }}
                                  />
                                  <div 
                                    className={`h-full ${item.color} grayscale opacity-30 rounded-r-full transition-all duration-700`}
                                    style={{ width: `${100 - localPct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                          <div className="flex flex-col">
                            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1 italic">
                              Goles (L/R)
                            </span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-black text-white tabular-nums">
                                {goals}
                              </span>
                              <span className="text-xs font-black text-slate-600">
                                /
                              </span>
                              <span className="text-2xl font-black text-slate-400 tabular-nums">
                                {opponentGoals}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1 italic">
                              Tiros (L/R)
                            </span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-black text-white tabular-nums">
                                {
                                  matchData.events.filter(
                                    (e) =>
                                      (e.type === ActionType.SHOT || e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) &&
                                      !e.metadata?.isOpponent,
                                  ).length
                                }
                              </span>
                              <span className="text-xs font-black text-slate-600">
                                /
                              </span>
                              <span className="text-2xl font-black text-slate-400 tabular-nums">
                                {
                                  matchData.events.filter(
                                    (e) =>
                                      (e.type === ActionType.SHOT || e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) &&
                                      e.metadata?.isOpponent,
                                  ).length
                                }
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1 italic">
                              Faltas (L/R)
                            </span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-black text-white tabular-nums">
                                {matchData.fouls.team}
                              </span>
                              <span className="text-xs font-black text-slate-600">
                                /
                              </span>
                              <span className="text-2xl font-black text-slate-400 tabular-nums">
                                {matchData.fouls.opponent}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex flex-col gap-1 border-b border-white/5 pb-2">
                          <div className={`${showRivalStats ? "bg-red-600/10 border-red-500/20" : "bg-blue-600/10 border-blue-500/20"} rounded-xl p-3 flex items-center justify-between`}>
                            <div className="flex flex-col">
                              <span className={`text-[8px] font-black ${showRivalStats ? "text-red-400" : "text-blue-400"} uppercase tracking-[0.2em]`}>
                                Total {showRivalStats ? "Oponente" : "Equipo"}
                              </span>
                              <div className="relative flex items-center gap-1 group mt-1">
                                <select
                                  value={statsSortKey}
                                  onChange={(e) =>
                                    setStatsSortKey(e.target.value)
                                  }
                                  className={`bg-white/10 border border-white/20 rounded-lg pl-2 pr-6 py-1 text-[9px] font-black text-white uppercase outline-none cursor-pointer appearance-none hover:bg-white/20 transition-all shadow-inner`}
                                >
                                  <option value="goals" className="bg-slate-900 text-white">Goles</option>
                                  <option value="shots" className="bg-slate-900 text-white">Tiros</option>
                                  <option value="assists" className="bg-slate-900 text-white">Asistencias</option>
                                  <option value="losses" className="bg-slate-900 text-white">Pérdidas</option>
                                  <option value="plusMinus" className="bg-slate-900 text-white">Balance (+/-)</option>
                                  <option value="individualTimeSeconds" className="bg-slate-900 text-white">Tiempo</option>
                                  <option value="saves" className="bg-slate-900 text-white">Pr. Recibidas</option>
                                  <option value="conceded" className="bg-slate-900 text-white">Encajados</option>
                                </select>
                                <ChevronDown
                                  size={10}
                                  className="text-blue-400 absolute right-2 pointer-events-none group-hover:text-white transition-colors"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {statsSortKey === "saves" && (
                                <div className="flex flex-col items-end mr-2">
                                  <span className="text-[8px] font-black text-green-400 uppercase tracking-widest">
                                    % Eficacia Global
                                  </span>
                                  <span className="text-sm font-black text-green-400">
                                    {(() => {
                                      const totalSaves =
                                        matchData.players.filter(p => p.isOpponent === showRivalStats).reduce(
                                          (acc, p) => acc + p.stats.saves,
                                          0,
                                        );
                                      const totalConceded =
                                        matchData.players.filter(p => p.isOpponent === showRivalStats).reduce(
                                          (acc, p) => acc + p.stats.conceded,
                                          0,
                                        );
                                      const totalTir =
                                        totalSaves + totalConceded;
                                      return totalTir > 0
                                        ? Math.round(
                                            (totalSaves / totalTir) * 100,
                                          )
                                        : 0;
                                    })()}
                                    %
                                  </span>
                                </div>
                              )}
                              <div className={`${showRivalStats ? "bg-red-600" : "bg-blue-600"} px-3 py-1 rounded-lg`}>
                                <span className="text-xl font-black text-white tabular-nums">
                                  {(() => {
                                    const total = matchData.players
                                      .filter(
                                        (p) =>
                                          p.isOpponent === showRivalStats &&
                                          p.role !== Role.COACH &&
                                          p.role !== Role.DELEGATE,
                                      )
                                      .reduce((acc, p) => {
                                        if (statsSortKey === "plusMinus")
                                          return acc + p.plusMinus;
                                        if (statsSortKey === "shots")
                                          return acc + p.stats.shots + p.stats.goals;
                                        if (
                                          statsSortKey ===
                                          "individualTimeSeconds"
                                        )
                                          return acc + p.individualTimeSeconds;
                                        if (statsSortKey === "saves")
                                          return (
                                            acc +
                                            p.stats.saves +
                                            p.stats.conceded
                                          );
                                        const k =
                                          statsSortKey as keyof Player["stats"];
                                        return acc + (p.stats[k] || 0);
                                      }, 0);

                                    if (
                                      statsSortKey === "individualTimeSeconds"
                                    ) {
                                      return `${Math.floor(total / 60)}m`;
                                    }
                                    return total;
                                  })()}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          {matchData.players
                            .filter(
                              (p) =>
                                p.role !== Role.COACH &&
                                p.role !== Role.DELEGATE &&
                                p.isOpponent === showRivalStats,
                            )
                            .sort((a, b) => {
                              if (statsSortKey === "plusMinus")
                                return b.plusMinus - a.plusMinus;
                              if (statsSortKey === "individualTimeSeconds")
                                return (
                                  b.individualTimeSeconds -
                                  a.individualTimeSeconds
                                );
                              if (statsSortKey === "shots")
                                return (b.stats.shots + b.stats.goals) - (a.stats.shots + a.stats.goals);
                              if (statsSortKey === "saves")
                                return (
                                  b.stats.saves +
                                  b.stats.conceded -
                                  (a.stats.saves + a.stats.conceded)
                                );
                              const key = statsSortKey as keyof Player["stats"];
                              return (b.stats[key] || 0) - (a.stats[key] || 0);
                            })
                            .map((p) => (
                              <div
                                key={p.id}
                                className="p-3 bg-white/5 border border-white/5 rounded-xl flex flex-col gap-3"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs border relative ${p.role === Role.GOALKEEPER ? "bg-amber-500/20 border-amber-500/40 text-amber-500" : "bg-black/40 border-white/10 text-white"}`}
                                    >
                                      {p.number}
                                      {p.isStarter && (
                                        <div className="absolute -top-1 -right-1 bg-amber-500 text-black p-0.5 rounded-sm shadow-sm">
                                          <Trophy size={6} fill="currentColor" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[10px] font-black text-white uppercase">
                                        {p.name}
                                      </span>
                                      <span className="text-[8px] text-slate-500 font-mono">
                                        ⏱️{" "}
                                        {Math.floor(
                                          p.individualTimeSeconds / 60,
                                        )}
                                        m{" "}
                                        {Math.floor(
                                          p.individualTimeSeconds % 60,
                                        )}
                                        s
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[8px] font-black text-slate-500 uppercase">
                                      +/-
                                    </span>
                                    <span
                                      className={`text-[10px] font-black ${p.plusMinus > 0 ? "text-green-500" : p.plusMinus < 0 ? "text-red-500" : "text-slate-500"}`}
                                    >
                                      {p.plusMinus > 0
                                        ? `+${p.plusMinus}`
                                        : p.plusMinus}
                                    </span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-5 gap-2 border-t border-white/5 pt-2">
                                  <div className="flex flex-col items-center">
                                    <span className="text-[6px] font-black text-slate-500 uppercase">
                                      GOL
                                    </span>
                                    <span
                                      className={`text-[10px] font-black ${p.stats.goals > 0 ? "text-green-400" : "text-slate-600"}`}
                                    >
                                      {p.stats.goals}
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <span className="text-[6px] font-black text-slate-500 uppercase">
                                      ASI
                                    </span>
                                    <span
                                      className={`text-[10px] font-black ${p.stats.assists > 0 ? "text-blue-400" : "text-slate-600"}`}
                                    >
                                      {p.stats.assists}
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <span className="text-[6px] font-black text-slate-500 uppercase">
                                      PER
                                    </span>
                                    <span
                                      className={`text-[10px] font-black ${p.stats.losses > 0 ? "text-red-400" : "text-slate-600"}`}
                                    >
                                      {p.stats.losses}
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <span className="text-[6px] font-black text-slate-500 uppercase">
                                      TIR (P/F)
                                    </span>
                                    <span
                                      className={`text-[9px] font-black ${p.stats.shots + p.stats.goals > 0 ? "text-amber-400" : "text-slate-600"} flex items-baseline gap-0.5`}
                                    >
                                      <span>{(p.stats.shots - p.stats.shotsOffTarget) + p.stats.goals}</span>
                                      <span className="text-[7px] text-slate-500">/</span>
                                      <span className="text-[8px] text-slate-400 font-normal">{p.stats.shotsOffTarget}</span>
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <span className="text-[6px] font-black text-slate-500 uppercase">
                                      REC
                                    </span>
                                    <span
                                      className={`text-[10px] font-black ${p.stats.steals + p.stats.interceptions > 0 ? "text-cyan-400" : "text-slate-600"}`}
                                    >
                                      {p.stats.steals + p.stats.interceptions}
                                    </span>
                                  </div>
                                </div>

                                {p.role === Role.GOALKEEPER && (
                                  <>
                                    <div className="grid grid-cols-4 gap-2 border-t border-white/5 pt-2 bg-black/20 -mx-3 px-3 py-1 rounded-b-none">
                                      <div className="flex flex-col items-center">
                                        <span className="text-[6px] font-black text-slate-500 uppercase">
                                          PARAD
                                        </span>
                                        <span className="text-[10px] font-black text-blue-400">
                                          {p.stats.saves}
                                        </span>
                                      </div>
                                      <div className="flex flex-col items-center">
                                        <span className="text-[6px] font-black text-slate-500 uppercase">
                                          ENC
                                        </span>
                                        <span className="text-[10px] font-black text-red-400">
                                          {p.stats.conceded}
                                        </span>
                                      </div>
                                      <div className="flex flex-col items-center border-l border-white/10 px-1">
                                        <span className="text-[6px] font-black text-white uppercase">
                                          TIR. PORT.
                                        </span>
                                        <span className="text-[10px] font-black text-white font-mono">
                                          {p.stats.saves + p.stats.conceded}
                                        </span>
                                      </div>
                                      <div className="flex flex-col items-center border-l border-white/10 px-1">
                                        <span className="text-[6px] font-black text-green-400 uppercase">
                                          %
                                        </span>
                                        <span className="text-[10px] font-black text-green-400">
                                          {p.stats.saves + p.stats.conceded > 0
                                            ? Math.round(
                                                (p.stats.saves /
                                                  (p.stats.saves +
                                                    p.stats.conceded)) *
                                                  100,
                                              )
                                            : 0}
                                          %
                                        </span>
                                      </div>
                                    </div>
                                    <div className="bg-black/40 -mx-3 px-3 py-2 border-t border-white/5 rounded-b-xl">
                                      <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest leading-none">
                                          Mapa de Paradas (Portería)
                                        </span>
                                        <div className="h-0.5 flex-1 bg-white/5 mx-2" />
                                      </div>
                                      <div className="grid grid-cols-3 gap-0.5 aspect-[3/2] w-full max-w-[100px] mx-auto border-t-2 border-x-2 border-slate-700/50 rounded-t-sm relative bg-black/40">
                                        {Array.from({ length: 9 }).map(
                                          (_, i) => {
                                            const z = `G${i + 1}`;
                                            const count =
                                              matchData.events.filter(
                                                (e) =>
                                                  e.playerIds.includes(p.id) &&
                                                  (e.type ===
                                                    GoalieAction.SAVE_PARRY ||
                                                    e.type ===
                                                      GoalieAction.SAVE_CATCH ||
                                                    (e.type ===
                                                      ActionType.SHOT &&
                                                      e.metadata
                                                        ?.isOpponent)) &&
                                                  (e.destinationGrid === z ||
                                                    e.metadata?.zone === z),
                                              ).length;
                                            return (
                                              <div
                                                key={z}
                                                className={`flex items-center justify-center text-[7px] font-black transition-all aspect-square ${count > 0 ? "bg-blue-500/40 text-blue-200 ring-1 ring-blue-400/30" : "bg-white/5 text-slate-800"}`}
                                              >
                                                {count > 0 ? count : ""}
                                              </div>
                                            );
                                          },
                                        )}
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
                  </div>
                </motion.div>
              )}

              {activeTab === "more" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col gap-6"
                >
                  <section className="bg-white/10 border border-white/10 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 blur-3xl -z-10 rounded-full"></div>
                    <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                      <div className="p-2 bg-blue-600/20 rounded-lg">
                        <Download size={14} className="text-blue-400" />
                      </div>
                      Centro de Exportación Pro
                    </h3>
                    
                    <div className="flex flex-col gap-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                            Informes de Cuerpo Técnico:
                          </p>
                          <div className="h-[1px] bg-white/5 flex-1 ml-4"></div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => handleExport("TEAM")}
                            disabled={isExporting}
                            className="group py-4 bg-white/5 border border-white/5 rounded-2xl text-[9px] font-black uppercase hover:bg-blue-600/10 hover:border-blue-500/30 transition-all text-slate-400 hover:text-blue-400 flex flex-col items-center gap-2 shadow-inner"
                          >
                            <LayoutDashboard size={18} className="group-hover:scale-110 transition-transform" />
                            <span>Global Equipo</span>
                          </button>
                          
                          <button
                            onClick={() => handleExport(Role.GOALKEEPER)}
                            disabled={isExporting}
                            className="group py-4 bg-white/5 border border-white/5 rounded-2xl text-[9px] font-black uppercase hover:bg-amber-600/10 hover:border-amber-500/30 transition-all text-slate-400 hover:text-amber-500 flex flex-col items-center gap-2 shadow-inner"
                          >
                            <ShieldCheck size={18} className="group-hover:scale-110 transition-transform" />
                            <span>Porteros + Mapa</span>
                          </button>
                          
                          <button
                            onClick={handleExportCSV}
                            className="group py-4 bg-green-600/5 border border-green-500/10 rounded-2xl text-[9px] font-black uppercase hover:bg-green-600/10 hover:border-green-500/30 transition-all text-green-500/70 hover:text-green-400 flex flex-col items-center gap-2 shadow-inner"
                          >
                            <div className="relative">
                              <FileText size={18} />
                              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse border border-black"></div>
                            </div>
                            <span>Cargar en Sheets</span>
                          </button>

                          <button
                            onClick={handleTacticalAnalysis}
                            className="group py-4 bg-gradient-to-br from-red-600/15 to-blue-600/15 border border-white/15 rounded-2xl text-[9px] font-black uppercase hover:from-red-600/25 hover:to-blue-600/25 transition-all text-white flex flex-col items-center gap-2 shadow-inner relative overflow-hidden"
                          >
                            <Sparkles size={18} className="text-amber-400 group-hover:scale-110 transition-transform z-10" />
                            <span className="z-10 italic font-black">TÁCTICAL PRO</span>
                            <div className="absolute inset-0 bg-blue-500/5 blur-xl -z-0"></div>
                          </button>

                          <button
                            onClick={() => navigate('/tactical-board')}
                            className="group py-4 bg-gradient-to-br from-lime-600/15 to-emerald-600/15 border border-lime-500/20 rounded-2xl text-[9px] font-black uppercase hover:from-lime-600/25 hover:to-emerald-600/25 transition-all text-lime-400 flex flex-col items-center gap-2 shadow-inner"
                          >
                            <Pencil size={18} className="group-hover:scale-110 transition-transform" />
                            <span className="font-black">PIZARRA</span>
                          </button>

                          <button
                            onClick={() => navigate('/live-tracking')}
                            className="group py-4 bg-gradient-to-br from-cyan-600/15 to-blue-600/15 border border-cyan-500/20 rounded-2xl text-[9px] font-black uppercase hover:from-cyan-600/25 hover:to-blue-600/25 transition-all text-cyan-400 flex flex-col items-center gap-2 shadow-inner relative overflow-hidden"
                          >
                            <Activity size={18} className="group-hover:scale-110 transition-transform" />
                            <span className="font-black">TRACKING</span>
                            <span className="text-[6px] text-cyan-600">EN VIVO</span>
                          </button>

                          <button
                            onClick={() => navigate('/dashboard')}
                            className="group py-4 bg-white/5 border border-white/10 rounded-2xl text-[9px] font-black uppercase hover:bg-white/10 transition-all text-slate-400 hover:text-white flex flex-col items-center gap-2 shadow-inner"
                          >
                            <LayoutDashboard size={18} className="group-hover:scale-110 transition-transform" />
                            <span className="font-black">HISTORIAL</span>
                          </button>
                        </div>
                      </div>


                    </div>
                  </section>

                  {/* BOTÓN DE ACTIVACIÓN DE CONFIGURACIÓN */}
                  {!isConfigVisible ? (
                    <button
                      onClick={() => setIsConfigVisible(true)}
                      className="w-full py-8 border-2 border-dashed border-white/10 rounded-[2rem] flex flex-col items-center justify-center gap-4 hover:bg-white/5 hover:border-blue-500/30 transition-all group"
                    >
                      <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform text-blue-500">
                        <Settings size={32} />
                      </div>
                      <div className="text-center">
                        <span className="block text-sm font-black text-white uppercase tracking-widest">Configuración de Equipos</span>
                        <span className="block text-[10px] text-slate-500 uppercase font-black mt-1">Nombre, Logos y Plantillas de Jugadores</span>
                      </div>
                    </button>
                  ) : (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Settings size={14} /> Gestión de Equipos
                        </h3>
                        <button 
                          onClick={() => setIsConfigVisible(false)}
                          className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest px-3 py-1 bg-white/5 rounded-lg transition-colors"
                        >
                          Cerrar
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowRivalStats(false)}
                          className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${!showRivalStats ? "bg-blue-600 text-white shadow-lg" : "bg-white/5 text-slate-500 hover:bg-white/10"}`}
                        >
                          LOCAL
                        </button>
                        <button
                          onClick={() => setShowRivalStats(true)}
                          className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${showRivalStats ? "bg-red-600 text-white shadow-lg" : "bg-white/5 text-slate-500 hover:bg-white/10"}`}
                        >
                          RIVAL
                        </button>
                      </div>

                      <div className={`${showRivalStats ? "bg-red-600/10 border-red-500/20" : "bg-blue-600/10 border-blue-500/20"} border p-4 rounded-3xl`}>
                        <div className="flex items-center justify-between mb-6">
                          <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <Settings size={14} className={showRivalStats ? "text-red-500" : "text-blue-500"} />
                            Configuración {showRivalStats ? matchData.opponentName || "Equipo Rival" : matchData.teamName || "Mi Equipo"}
                          </h4>
                          <button
                            onClick={() => addPlayer(showRivalStats)}
                            className={`${showRivalStats ? "bg-red-600/20 text-red-400 border-red-500/30" : "bg-blue-600/20 text-blue-400 border-blue-500/30"} border px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all flex items-center gap-2`}
                          >
                            <Users size={12} />
                            Añadir
                          </button>
                        </div>

                        <div className="flex gap-4 mb-6">
                          <div className="flex-1">
                            <label className="text-[8px] font-black text-slate-500 uppercase mb-1 block">
                              Nombre {showRivalStats ? "Rival" : "Local"}
                            </label>
                            <input
                              type="text"
                              value={showRivalStats ? matchData.opponentName : matchData.teamName}
                              onChange={(e) =>
                                setMatchData((prev) => ({
                                  ...prev,
                                  [showRivalStats ? "opponentName" : "teamName"]: e.target.value.toUpperCase(),
                                }))
                              }
                              className={`w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-black text-white outline-none transition-all ${showRivalStats ? "focus:border-red-500" : "focus:border-blue-500"}`}
                              placeholder={showRivalStats ? "OPONENTE" : "NOMBRE EQUIPO"}
                            />
                          </div>
                          <div className="w-12 h-12 flex-shrink-0">
                            <label className={`w-full h-full bg-black/40 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden cursor-pointer hover:border-white/20 transition-all ${showRivalStats ? "hover:border-red-500/50" : "hover:border-blue-500/50"}`}>
                              {showRivalStats ? (
                                matchData.opponentLogo ? (
                                  <img
                                    src={matchData.opponentLogo}
                                    alt="Logo"
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <ImageIcon size={18} className="text-slate-600" />
                                )
                              ) : (
                                matchData.teamLogo ? (
                                  <img
                                    src={matchData.teamLogo}
                                    alt="Logo"
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <ImageIcon size={18} className="text-slate-600" />
                                )
                              )}
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => handleLogoUpload(e, showRivalStats)}
                                accept="image/*"
                              />
                            </label>
                          </div>
                        </div>

                        <div className="space-y-6">
                          {/* STARTERS SECTION */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 mb-2 px-1">
                              <Trophy size={14} className="text-amber-500" />
                              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Titulares (Cinco Inicial)</span>
                            </div>
                            {matchData.players
                              .filter((p) => p.isOpponent === showRivalStats && p.isStarter)
                              .map((player) => (
                                <div
                                  key={player.id}
                                  className="bg-amber-500/10 border border-amber-500/30 p-1.5 rounded-xl flex items-center gap-1.5 shadow-lg shadow-amber-500/5 group"
                                >
                                  <input
                                    type="number"
                                    value={player.number}
                                    onChange={(e) => updatePlayer(player.id, { number: parseInt(e.target.value) || 0 })}
                                    className="w-8 bg-black/40 border border-white/10 rounded-lg py-1 text-[10px] font-black text-white text-center"
                                  />
                                  <input
                                    type="text"
                                    value={player.name}
                                    onChange={(e) => updatePlayer(player.id, { name: e.target.value.toUpperCase() })}
                                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-0 text-[10px] h-6 font-black text-white"
                                  />
                                  <select
                                    value={player.role}
                                    onChange={(e) => updatePlayer(player.id, { role: e.target.value as Role })}
                                    className="bg-black/40 border border-white/10 rounded-lg py-0 h-6 text-[8px] font-black text-slate-400 outline-none px-1"
                                  >
                                    {Object.values(Role).map((r) => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                  <button
                                    onClick={() => toggleStarter(player.id)}
                                    className="p-1 rounded-lg transition-all bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                                    title="Marcar/Desmarcar Titular"
                                  >
                                    <Trophy size={10} fill="currentColor" />
                                  </button>
                                  <button
                                    onClick={() => removePlayer(player.id)}
                                    className="p-1 text-slate-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              ))}
                          </div>

                          {/* REST OF ROSTER SECTION */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 mb-2 px-1">
                              <Users size={14} className="text-slate-500" />
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Resto de Plantilla</span>
                            </div>
                            {matchData.players
                              .filter((p) => p.isOpponent === showRivalStats && !p.isStarter)
                              .map((player) => (
                                <div
                                  key={player.id}
                                  className="bg-black/30 border border-white/5 p-1.5 rounded-xl flex items-center gap-1.5 group"
                                >
                                  <input
                                    type="number"
                                    value={player.number}
                                    onChange={(e) => updatePlayer(player.id, { number: parseInt(e.target.value) || 0 })}
                                    className="w-8 bg-black/40 border border-white/10 rounded-lg py-1 text-[10px] font-black text-white text-center"
                                  />
                                  <input
                                    type="text"
                                    value={player.name}
                                    onChange={(e) => updatePlayer(player.id, { name: e.target.value.toUpperCase() })}
                                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-0 text-[10px] h-6 font-black text-white"
                                  />
                                  <select
                                    value={player.role}
                                    onChange={(e) => updatePlayer(player.id, { role: e.target.value as Role })}
                                    className="bg-black/40 border border-white/10 rounded-lg py-0 h-6 text-[8px] font-black text-slate-400 outline-none px-1"
                                  >
                                    {Object.values(Role).map((r) => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                  <button
                                    onClick={() => toggleStarter(player.id)}
                                    className="p-1 rounded-lg transition-all bg-white/5 text-slate-500 hover:text-amber-500 hover:bg-amber-500/10"
                                    title="Marcar como Titular"
                                  >
                                    <Trophy size={10} fill="none" />
                                  </button>
                                  <button
                                    onClick={() => removePlayer(player.id)}
                                    className="p-1 text-slate-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}


                  <section className="bg-white/5 border border-white/5 p-4 rounded-2xl">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Settings size={14} /> Preferencias
                    </h3>
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-white uppercase">
                            Sincronización
                          </span>
                          <span className="text-[8px] text-slate-500 uppercase">
                            Exportar auto. al final
                          </span>
                        </div>
                        <div className="w-8 h-4 bg-slate-800 rounded-full"></div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-white uppercase">
                            Idioma UI
                          </span>
                          <span className="text-[8px] text-slate-500 uppercase">
                            Español (Castellano)
                          </span>
                        </div>
                        <span className="text-[10px] font-black text-blue-400">
                          ES
                        </span>
                      </div>
                    </div>
                  </section>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </aside>

        {/* CENTER: PITCH & QUICK ACTIONS */}
        <div
          className={`flex flex-col gap-1 overflow-hidden ${activeTab !== "pitch" ? "hidden lg:flex" : "flex"} flex-1 min-h-0 relative max-h-full`}
        >
          {/* PITCH TOGGLE HUD - Always visible to switch views */}
          <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/10 gap-1 flex-shrink-0">
            <button
              onClick={() => setPitchView("local")}
              className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all flex items-center justify-center gap-2 ${pitchView === "local" ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" : "text-slate-500 hover:text-slate-300"}`}
            >
              <Shield size={10} />
              {matchData.teamName || "LOCAL"}
            </button>
            <button
              onClick={() => setPitchView("opponent")}
              className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all flex items-center justify-center gap-2 ${pitchView === "opponent" ? "bg-red-600 text-white shadow-lg shadow-red-500/30" : "text-slate-500 hover:text-slate-300"}`}
            >
              <ShieldAlert size={10} />
              {matchData.opponentName || "RIVAL"}
            </button>
          </div>

          <div className="bg-white/5 border border-white/5 rounded-2xl flex flex-col backdrop-blur-md relative overflow-hidden flex-1 min-h-0">
            {/* Context Header (Formation & State) */}
            <div className="p-1 border-b border-white/5 flex items-center justify-between relative bg-black/20 flex-shrink-0">
              <h4 className={`text-[8px] font-black uppercase tracking-widest flex items-center gap-2 ${pitchView === 'local' ? 'text-blue-400' : 'text-red-400'}`}>
                <MapIcon size={8} /> {pitchView === 'local' ? (matchData.teamName || "NUESTRO") : (matchData.opponentName || "RIVAL")} - {pitchView === 'local' ? gameState : rivalGameState}
              </h4>
              
              <button
                onClick={() => pitchView === 'local' ? setIsGameStateMenuOpen(!isGameStateMenuOpen) : setIsRivalGameStateMenuOpen(!isRivalGameStateMenuOpen)}
                className="glass px-2 py-0.5 rounded-full flex items-center gap-1 border-white/20 hover:bg-white/20 transition-all focus:outline-none"
              >
                <Users size={8} className={pitchView === 'local' ? "text-blue-400" : "text-red-400"} />
                <span className="text-[7px] font-black uppercase text-white tracking-widest">FORMACIÓN</span>
                <ChevronDown size={8} className={`text-slate-400 transition-transform ${(pitchView === 'local' ? isGameStateMenuOpen : isRivalGameStateMenuOpen) ? "rotate-180" : ""}`} />
              </button>

              <FormationMenu
                currentValue={pitchView === 'local' ? gameState : rivalGameState}
                isOpen={pitchView === 'local' ? isGameStateMenuOpen : isRivalGameStateMenuOpen}
                onSelect={(val) => handleGameStateChange(val, pitchView === 'opponent')}
                isOpponent={pitchView === 'opponent'}
              />
            </div>

            <div className="flex-1 flex flex-row gap-1 p-0.5 min-h-0 overflow-hidden relative">
              {/* LOCK OVERLAY */}
              {isDataLocked && (
                <div className="absolute inset-0 z-[500] bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center pointer-events-auto cursor-not-allowed border-2 border-dashed border-white/10 rounded-2xl m-0.5">
                  <div className="bg-slate-900/90 p-6 rounded-[32px] border border-white/10 shadow-2xl flex flex-col items-center gap-3 scale-90 sm:scale-100">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 border-2 border-slate-700">
                        <Shield className="animate-pulse" size={32} />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest italic">DATOS BLOQUEADOS</h4>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight text-center max-w-[180px]">
                            {matchData.period === Period.SECOND ? "La primera parte ha finalizado. Pulsa el botón verde para iniciar la segunda parte." : "El periodo ha finalizado y los datos están protegidos."}
                        </p>
                    </div>
                  </div>
                </div>
              )}

              {/* LEFT SIDEBAR: STAFF CONTROLS */}
              <div className="w-12 sm:w-14 flex flex-col gap-1.5 p-1 bg-black/20 backdrop-blur-xl border-r border-white/10 h-full overflow-y-auto no-scrollbar pt-2 shrink-0 allow-scroll">
                <div className="flex flex-col items-center gap-1 mb-2">
                  <Users size={14} className="text-slate-500" />
                  <span className="text-[7px] font-black text-slate-500 uppercase text-center leading-none">STAFF</span>
                </div>
                
                {matchData.players
                  .filter(p => (p.role === Role.COACH || p.role === Role.DELEGATE) && p.isOpponent === (pitchView === 'opponent'))
                  .sort((a, b) => Number(a.isOpponent) - Number(b.isOpponent))
                  .map(staff => (
                    <div key={staff.id} className={`w-full flex flex-col gap-1 p-1 bg-white/5 rounded-lg border-2 transition-all ${
                  staff.stats.redCards > 0
                    ? 'border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                    : staff.stats.yellowCards > 0
                      ? 'border-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.35)]'
                      : 'border-white/10'
                }`}>
                      <span className={`text-[6px] font-black uppercase text-center ${staff.isOpponent ? 'text-red-400' : 'text-blue-400'}`}>{staff.role === Role.COACH ? 'ENT' : 'DEL'} {staff.isOpponent ? 'V' : 'L'}</span>
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1 justify-center">
                          <button
                            onPointerDown={(e) => { e.preventDefault(); if (!staff.stats.redCards && staff.stats.yellowCards < 2) handleAction(ActionType.YELLOW_CARD, staff.id); }}
                            disabled={staff.stats.redCards > 0 || staff.stats.yellowCards >= 2}
                            className="flex-1 h-8 bg-yellow-400 rounded-md border border-black/20 active:scale-95 transition-all disabled:opacity-20"
                          />
                          <button
                            onPointerDown={(e) => { e.preventDefault(); if (!staff.stats.redCards) handleAction(ActionType.RED_CARD, staff.id); }}
                            disabled={staff.stats.redCards > 0}
                            className="flex-1 h-8 bg-red-600 rounded-md border border-black/20 active:scale-95 transition-all disabled:opacity-20"
                          />
                        </div>

                        {staff.role === Role.COACH && (
                          <button
                            onPointerDown={(e) => { e.preventDefault(); handleAction(ActionType.TIMEOUT, staff.id); }}
                            disabled={
                              (matchData.period !== Period.FIRST && matchData.period !== Period.SECOND) ||
                              (staff.isOpponent ? 
                                (matchData.period === Period.FIRST ? matchData.timeoutsUsed.opponent.period1 : matchData.timeoutsUsed.opponent.period2) : 
                                (matchData.period === Period.FIRST ? matchData.timeoutsUsed.team.period1 : matchData.timeoutsUsed.team.period2)
                              )
                            }
                            className={`w-full h-8 rounded-sm border border-black/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-30 flex flex-col items-center justify-center gap-0 mt-0.5 shadow-sm
                              ${(staff.isOpponent ? 
                                 (matchData.period === Period.FIRST ? matchData.timeoutsUsed.opponent.period1 : matchData.timeoutsUsed.opponent.period2) : 
                                 (matchData.period === Period.FIRST ? matchData.timeoutsUsed.team.period1 : matchData.timeoutsUsed.team.period2)
                                ) ? "bg-green-600 text-white border-green-400/50" : "bg-blue-600 text-white border-blue-400/50"}
                            `}
                          >
                            <TimerIcon size={12} strokeWidth={3} />
                            <span className="text-[6px] font-black uppercase leading-none">T. MORT.</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                }
              </div>

              {/* CENTER: PITCH VISUAL */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                {/* PITCH VISUAL - VERTICAL ORIENTATION (Optimized height for footer buttons) */}
                <div className={`relative w-full h-[86%] mb-auto bg-gradient-to-b ${pitchView === 'local' ? 'from-blue-950/40 to-slate-900/40 border-blue-500/30' : 'from-slate-900/40 to-red-950/40 border-red-500/30'} rounded-xl border-2 shadow-2xl overflow-hidden flex items-center justify-center`}>
                  {/* Grid Marks */}
                  <div className="absolute inset-0 grid grid-cols-8 grid-rows-10 opacity-5 z-0">
                    {Array.from({ length: 80 }).map((_, i) => (
                      <div key={i} className="border-[0.5px] border-white"></div>
                    ))}
                  </div>

                  {/* Vertical Pitch Markings */}
                  <div className="absolute inset-0 pointer-events-none z-0">
                    <div className="absolute inset-2 border border-white/20 rounded-sm"></div>
                    <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-white/20"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35%] aspect-square border border-white/20 rounded-full"></div>
                    
                    {/* Goal Areas - Own goal (bottom) is what we defend */}
                    {/* Bottom Area (Defended) */}
                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[60%] h-[18%] border-x border-t border-white/30 rounded-t-[3rem] bg-white/5"></div>
                    {/* Top Area (Attacking) */}
                    <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-[60%] h-[18%] border-x border-b border-white/20 rounded-b-[3rem]"></div>
                    
                    <div className="absolute top-[12%] left-1/2 -translate-x-1/2 w-1 h-1 bg-white/40 rounded-full"></div>
                    <div className="absolute bottom-[12%] left-1/2 -translate-x-1/2 w-1 h-1 bg-white/40 rounded-full"></div>
                  </div>

                  {/* Tactical Slots and Players */}
                  {(() => {
                    const currentGameState = pitchView === 'local' ? gameState : rivalGameState;
                    const isOpp = pitchView === 'opponent';
                    const currentSlots = PITCH_SYSTEMS[currentGameState] || PITCH_SYSTEMS[GameState.FOUR_VS_FOUR];
                    const onPitchPlayers = matchData.players.filter((p) => p.isOnPitch && !!p.isOpponent === isOpp);
                    const occupiedSlots = onPitchPlayers.map((p) => p.pitchPosition);

                    return (
                      <>
                        {currentSlots.map((slot, index) => {
                          if (occupiedSlots.includes(index)) return null;
                          // Vertical Mirror Logic: Own goal (left:8 in Horizontal) -> Bottom (high uiTop in Vertical)
                          const uiTop = 100 - slot.left; 
                          const uiLeft = slot.top;

                          return (
                            <div
                              key={`${pitchView}-slot-${index}`}
                              onClick={() => {
                                if (swapSelection) {
                                  const p = matchData.players.find(pl => pl.id === swapSelection);
                                  if (p && !!p.isOpponent === isOpp) {
                                    setMatchData(prev => ({
                                      ...prev,
                                      players: prev.players.map(pl => pl.id === swapSelection ? { ...pl, isOnPitch: true, pitchPosition: index } : pl)
                                    }));
                                    setSwapSelection(null);
                                  }
                                } else {
                                  setActiveSlotToAdd(activeSlotToAdd?.index === index && activeSlotToAdd.isOpponent === isOpp ? null : { index, isOpponent: isOpp });
                                }
                              }}
                              className={`absolute w-[18vw] h-[7vh] max-w-[55px] max-h-[50px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-dashed flex flex-col items-center justify-center transition-all cursor-pointer ${activeSlotToAdd?.index === index && activeSlotToAdd.isOpponent === isOpp ? (isOpp ? "border-red-500 bg-red-500/10 z-[100]" : "border-blue-500 bg-blue-500/10 z-[100]") : "border-white/10 bg-white/5 z-10"}`}
                              style={{ top: `${uiTop}%`, left: `${uiLeft}%` }}
                            >
                              <div className="w-4 h-4 rounded-lg bg-black/20 flex items-center justify-center font-black text-[6px] text-white/20 border border-white/5">{index + 1}</div>
                            </div>
                          );
                        })}

                        {onPitchPlayers.map((player) => {
                          const slot = currentSlots[player.pitchPosition ?? 0] || currentSlots[0];
                          const uiTop = 100 - slot.left;
                          const uiLeft = slot.top;

                          return (
                            <motion.div
                              key={player.id}
                              layout
                              animate={{ top: `${uiTop}%`, left: `${uiLeft}%` }}
                              className={`absolute w-[20vw] h-[10vh] max-w-[75px] max-h-[85px] -translate-x-1/2 -translate-y-1/2 ${activeActionPlayerId === player.id ? "z-[155]" : "z-[30]"}`}
                            >
                              <PlayerCard
                                player={player}
                                onClick={() => {
                                  if (swapSelection) {
                                    const swapper = matchData.players.find(p => p.id === swapSelection);
                                  if (swapper && !!swapper.isOpponent === isOpp) executeSwap(player.id);
                                  } else {
                                    setActiveActionPlayerId(activeActionPlayerId === player.id ? null : player.id);
                                  }
                                }}
                                isMenuActive={activeActionPlayerId === player.id}
                              />
                            </motion.div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* RIGHT SIDEBAR: QUICK ACTIONS */}
              <div className="w-12 sm:w-14 flex flex-col gap-1.5 p-1 bg-black/20 backdrop-blur-xl border-l border-white/10 h-full overflow-y-auto no-scrollbar pt-2 shrink-0 allow-scroll">

                {/* Match Actions */}
                <button
                  onClick={() => setPendingAction({ type: ActionType.GOAL, step: "player", isOpponent: pitchView === 'opponent' })}
                  className={`w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 hover:opacity-80 transition-all font-black shadow-lg border ${pitchView === 'opponent' ? 'bg-red-600/30 text-red-500 border-red-500/50' : 'bg-green-600/30 text-green-400 border-green-500/50'}`}
                >
                  <Trophy size={16} />
                  <span className="text-[7px] uppercase">Gol</span>
                </button>
                
                <button
                  onClick={() => setPendingAction({ type: ActionType.SHOT, step: "player", isOpponent: pitchView === 'opponent' })}
                  className="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 hover:bg-slate-700 transition-all font-black shadow-lg bg-white/10 border border-white/20 text-slate-200"
                >
                  <Target size={16} />
                  <span className="text-[7px] uppercase">Tiro</span>
                </button>

                <button
                  onClick={() => handleFoul(pitchView === 'local')}
                  className="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 hover:bg-orange-600/30 text-slate-200 hover:text-orange-300 transition-all font-black shadow-lg bg-white/10 border border-white/20"
                >
                  <AlertTriangle size={16} />
                  <span className="text-[7px] uppercase">Falta</span>
                </button>

                <button
                  onClick={() => handleAction(ActionType.STEAL, undefined, { metadata: { isOpponent: pitchView === 'opponent' } })}
                  className="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 hover:bg-cyan-600/30 text-slate-200 hover:text-cyan-300 transition-all font-black shadow-lg bg-white/10 border border-white/20"
                >
                  <Zap size={16} />
                  <span className="text-[7px] uppercase leading-none px-0.5 text-slate-200">RECUP.</span>
                </button>

                <button
                  onClick={() => handleAction(ActionType.LOSS, undefined, { metadata: { isOpponent: pitchView === 'opponent' } })}
                  className="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 hover:bg-red-600/30 text-slate-200 hover:text-red-300 transition-all font-black shadow-lg bg-white/10 border border-white/20"
                >
                  <RefreshCw size={16} />
                  <span className="text-[7px] uppercase leading-none px-0.5 text-slate-200">PÉRD.</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: BENCH & ROSTER (Player Management) - HIDDEN ON PITCH TAB AS REQUESTED */}
        <aside
          className={`bg-white/5 border border-white/5 rounded-2xl flex flex-col overflow-hidden backdrop-blur-md ${activeTab === "pitch" ? "hidden" : "hidden lg:flex"}`}
        >
          <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Users size={12} /> Gestión de Equipo
            </h3>
          </div>

          {/* BENCH SECTION (Middle) */}
          <div className="p-3 flex flex-col gap-3 min-h-0 flex-1">
            <div className="flex items-center justify-between border-b border-white/5 pb-1">
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">
                BANQUILLO / DISPONIBLES
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 overflow-y-auto custom-scrollbar">
              {matchData.players
                .filter(
                  (p) =>
                    !p.isOnPitch &&
                    p.role !== Role.COACH &&
                    p.role !== Role.DELEGATE &&
                    p.stats.redCards === 0,
                )
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => executeSwap(p.id)}
                    className={`p-1 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all h-12 overflow-hidden relative
                              ${swapSelection === p.id ? "bg-amber-600 border-white ring-2 ring-amber-500/30" : "bg-white/5 border-white/10 opacity-80 hover:opacity-100 hover:bg-white/10"}
                           `}
                  >
                    <div className="w-5 h-5 rounded bg-black/40 flex items-center justify-center font-black text-[10px] shrink-0 border border-white/10">
                      {p.number}
                    </div>
                    <div className="flex flex-col items-center min-w-0">
                      <span className="text-[8px] font-black text-white uppercase truncate w-full px-0.5 text-center">
                        {p.name.split(" ")[0]}
                      </span>
                      {p.isStarter && (
                        <div className="absolute top-0.5 right-5 text-amber-500">
                          <Trophy size={8} fill="currentColor" />
                        </div>
                      )}
                      {p.stats.yellowCards > 0 && (
                        <div className="absolute top-0.5 right-0.5 w-1.5 h-2.5 bg-yellow-400 rounded-sm border-[0.5px] border-black/20" />
                      )}
                      <span className={`text-[6px] font-mono font-black ${p.isOpponent ? "text-red-400" : "text-blue-400"} leading-none mt-0.5`}>
                        {formatPlayerTime(p.individualTimeSeconds)}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          </div>

          {/* Technical Staff (Bottom) */}
          <div className="p-4 bg-white/5 border-t border-white/5 grid grid-cols-2 gap-2 mt-auto">
            {matchData.players
              .filter((p) => (p.role === Role.COACH || p.role === Role.DELEGATE) && !p.isOpponent)
              .map((p) => (
                <div
                  key={p.id}
                  className={`p-2 rounded-xl border flex flex-col gap-1 relative group transition-all ${p.stats.redCards > 0 ? "bg-red-950/20 border-red-900/50 opacity-60" : "bg-white/5 border-white/5 hover:bg-white/10"}`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[7px] font-black text-slate-500 uppercase tracking-tighter">
                      {p.role === Role.COACH ? "Directiva" : "Delegado"}
                    </span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: p.stats.yellowCards }).map(
                        (_, idx) => (
                          <div
                            key={idx}
                            className="w-1.5 h-2.5 bg-yellow-400 rounded-[1px] shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                          />
                        ),
                      )}
                      {p.stats.redCards > 0 && (
                        <div className="w-1.5 h-2.5 bg-red-600 rounded-[1px] shadow-[0_1px_2px_rgba(0,0,0,0.3)] animate-pulse" />
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] font-black text-white uppercase truncate px-0.5">
                    {p.name}
                  </span>

                  <button
                    onClick={() => setEditingPlayerId(p.id)}
                    className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white bg-slate-900 rounded-full border border-white/10 z-10"
                  >
                    <Settings size={8} />
                  </button>
                </div>
              ))}
          </div>
        </aside>
      </main>



      <nav className="lg:hidden bg-slate-900/95 backdrop-blur-2xl border-t border-white/10 z-[100] px-2 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <div className="flex justify-around items-center h-12 max-w-sm mx-auto">
          <button
            onClick={() => setActiveTab("pitch")}
            className={`flex flex-col items-center justify-center gap-1 flex-1 transition-all relative ${activeTab === "pitch" ? "text-blue-500" : "text-slate-500"}`}
          >
            {activeTab === "pitch" && (
              <motion.div
                layoutId="nav-pill"
                className="absolute -top-1 w-10 h-1 bg-blue-500 rounded-full"
              />
            )}
            <MapIcon size={18} strokeWidth={activeTab === "pitch" ? 2.5 : 2} />
            <span className="text-[8px] font-black uppercase tracking-tighter">
              Campo
            </span>
          </button>

          <button
            onClick={() => setActiveTab("goalie")}
            className={`flex flex-col items-center justify-center gap-1 flex-1 transition-all relative ${activeTab === "goalie" ? "text-amber-500" : "text-slate-500"}`}
          >
            {activeTab === "goalie" && (
              <motion.div
                layoutId="nav-pill"
                className="absolute -top-1 w-10 h-1 bg-amber-500 rounded-full"
              />
            )}
            <Crosshair
              size={18}
              strokeWidth={activeTab === "goalie" ? 2.5 : 2}
            />
            <span className="text-[8px] font-black uppercase tracking-tighter">
              Portero
            </span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`flex flex-col items-center justify-center gap-1 flex-1 transition-all relative ${activeTab === "history" ? "text-cyan-500" : "text-slate-500"}`}
          >
            {activeTab === "history" && (
              <motion.div
                layoutId="nav-pill"
                className="absolute -top-1 w-10 h-1 bg-cyan-500 rounded-full"
              />
            )}
            <History
              size={18}
              strokeWidth={activeTab === "history" ? 2.5 : 2}
            />
            <span className="text-[8px] font-black uppercase tracking-tighter">
              Timeline
            </span>
          </button>

          <button
            onClick={() => setActiveTab("stats")}
            className={`flex flex-col items-center justify-center gap-1 flex-1 transition-all relative ${activeTab === "stats" ? "text-blue-500" : "text-slate-500"}`}
          >
            {activeTab === "stats" && (
              <motion.div
                layoutId="nav-pill"
                className="absolute -top-1 w-10 h-1 bg-blue-500 rounded-full"
              />
            )}
            <Trophy
              size={18}
              strokeWidth={activeTab === "stats" ? 2.5 : 2}
            />
            <span className="text-[7px] font-black uppercase tracking-tighter">
              Stats
            </span>
          </button>

          <button
            onClick={() => setActiveTab("more")}
            className={`flex flex-col items-center justify-center gap-1 flex-1 transition-all relative ${activeTab === "more" ? "text-blue-500" : "text-slate-500"}`}
          >
            {activeTab === "more" && (
              <motion.div
                layoutId="nav-pill"
                className="absolute -top-1 w-10 h-1 bg-blue-500 rounded-full"
              />
            )}
            <Settings size={18} strokeWidth={activeTab === "more" ? 2.5 : 2} />
            <span className="text-[8px] font-black uppercase tracking-tighter">
              Más
            </span>
          </button>
        </div>
      </nav>

      {/* Hide Goalie Map on mobile if not in goalie tab */}
      <style>{`
        @media (max-width: 1024px) {
          .custom-scrollbar::-webkit-scrollbar { width: 0px; }
          body { overflow-x: hidden !important; max-width: 100vw !important; }
        }
      `}</style>

      {/* MODALS & OVERLAYS */}
      <AnimatePresence>
        {/* Shot Tracking Modal */}
        {pendingAction && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingAction(null)}
              className="fixed inset-0 bg-black/80 z-[320] backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md glass p-6 z-[330] border-amber-500/30 flex flex-col gap-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <h3 className="text-sm font-black uppercase text-amber-400 flex items-center gap-2">
                    {pendingAction.type === ActionType.GOAL ? (
                      <Trophy size={16} />
                    ) : pendingAction.type === GoalieAction.GOAL_CONCEDED ? (
                      <ShieldAlert size={16} className="text-red-500" />
                    ) : (
                      <Crosshair size={16} />
                    )}
                    {pendingAction.type === ActionType.GOAL
                      ? "Seguimiento de GOL"
                      : pendingAction.type === GoalieAction.GOAL_CONCEDED
                        ? "GOL ENCAJADO"
                        : [ActionType.STEAL, ActionType.INTERCEPTION].includes(pendingAction.type as any)
                          ? "ZONA DE RECUPERACIÓN"
                          : [ActionType.LOSS, ActionType.UNFORCED_ERROR].includes(pendingAction.type as any)
                            ? "ZONA DE PÉRDIDA"
                            : "Seguimiento de TIRO"}
                  </h3>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                    {pendingAction.isOpponent
                      ? "Analizando Rival"
                      : "Acción Local"}
                  </p>
                </div>
                <button
                  onClick={() => setPendingAction(null)}
                  className="p-2 hover:bg-white/10 rounded-full text-slate-500"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-6">
                {/* Set Piece Selector */}
                {![ActionType.STEAL, ActionType.INTERCEPTION, ActionType.LOSS, ActionType.UNFORCED_ERROR].includes(pendingAction.type as any) && (
                <div className="bg-white/5 p-3 rounded-2xl border border-white/5 flex items-center justify-between">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">
                    ¿Acción desde?
                  </span>
                  <div className="flex gap-1">
                    {[
                      { id: "normal", label: "Jugada" },
                      { id: "penalty", label: "Penalti" },
                      { id: "double_penalty", label: "Doble P." },
                    ].map((opt) => {
                      const isSel =
                        (pendingAction.setPiece || "normal") === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() =>
                            setPendingAction((prev) => ({
                              ...prev!,
                              setPiece: opt.id as any,
                            }))
                          }
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${
                            isSel
                              ? "bg-amber-500/20 border-amber-500 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                              : "bg-white/5 border-white/10 text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                )}

                {/* Step Indicator */}
                <div className="flex items-center justify-between px-2">
                  {["Jugador", "Origen", "Portería"].map((label, i) => {
                    const onlyNeedsOrigin = [
                      ActionType.STEAL, 
                      ActionType.INTERCEPTION, 
                      ActionType.LOSS, 
                      ActionType.UNFORCED_ERROR
                    ].includes(pendingAction.type as any);

                    if (label === "Portería" && onlyNeedsOrigin) return null;

                    const steps: any[] = ["player", "origin", "target"];
                    const currentIdx = steps.indexOf(pendingAction.step);
                    const isActive = i === currentIdx;
                    const isDone = i < currentIdx;
                    if (
                      pendingAction.isOpponent &&
                      label === "Jugador" &&
                      pendingAction.type !== GoalieAction.GOAL_CONCEDED
                    )
                      return null;
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                            isDone
                              ? "bg-green-500 text-white"
                              : isActive
                                ? pendingAction.type === ActionType.GOAL ||
                                  pendingAction.type ===
                                    GoalieAction.GOAL_CONCEDED
                                  ? "bg-green-500 text-black"
                                  : "bg-amber-500 text-black"
                                : "bg-white/10 text-slate-500"
                          }`}
                        >
                          {isDone ? "✓" : i + 1}
                        </div>
                        <span
                          className={`text-[10px] font-black uppercase tracking-tighter ${isActive ? "text-white" : "text-slate-600"}`}
                        >
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Content based on Step */}
                <div className="min-h-[200px] flex flex-col items-center justify-center">
                  {pendingAction.step === "player" && (
                    <div className="w-full space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center block">
                        {pendingAction.type === GoalieAction.GOAL_CONCEDED
                          ? "¿Quién encajó el gol?"
                          : "¿Quién realizó la acción?"}
                      </label>
                      <PlayerSelector
                        players={matchData.players.filter(p => 
                          (pendingAction.type === ActionType.GOAL || pendingAction.type === ActionType.SHOT) 
                          ? p.isOpponent === pendingAction.isOpponent
                          : true
                        )}
                        onSelect={(id) =>
                          setPendingAction((prev) => ({
                            ...prev!,
                            playerId: id,
                            step: "origin",
                          }))
                        }
                        selectedId={pendingAction.playerId}
                        showOnlyRoles={
                          pendingAction.type === GoalieAction.GOAL_CONCEDED
                            ? [Role.GOALKEEPER]
                            : undefined
                        }
                      />
                    </div>
                  )}

                  {pendingAction.step === "origin" && (
                    <div className="w-full space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center block italic">
                        Selecciona Zona de Origen (Pista)
                      </label>
                      <PitchZones
                        onSelect={(id) => {
                          const onlyNeedsOrigin = [
                            ActionType.STEAL, 
                            ActionType.INTERCEPTION, 
                            ActionType.LOSS, 
                            ActionType.UNFORCED_ERROR
                          ].includes(pendingAction.type as any);

                          if (onlyNeedsOrigin) {
                            handleAction(
                              pendingAction.type,
                              pendingAction.playerId,
                              {
                                originGrid: id,
                                metadata: {
                                  isOpponent: pendingAction.isOpponent,
                                  setPiece: pendingAction.setPiece || "normal",
                                },
                              },
                            );
                            setPendingAction(null);
                          } else {
                            setPendingAction((prev) => ({
                              ...prev!,
                              originGrid: id,
                              step: "target",
                            }));
                          }
                        }}
                        selected={pendingAction.originGrid}
                      />
                    </div>
                  )}

                  {pendingAction.step === "target" && (
                    <div className="w-full space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center block italic">
                        Selecciona Objetivo (Portería)
                      </label>
                      <GoalMap
                        onSelect={(id) => {
                          handleAction(
                            pendingAction.type,
                            pendingAction.playerId,
                            {
                              originGrid: pendingAction.originGrid,
                              destinationGrid: id,
                              metadata: {
                                isOpponent: pendingAction.isOpponent,
                                setPiece: pendingAction.setPiece || "normal",
                              },
                            },
                          );
                          setPendingAction(null);
                        }}
                        selected={pendingAction.destinationGrid}
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {pendingAction.step !== "player" &&
                    (!pendingAction.isOpponent ||
                      pendingAction.step !== "origin") && (
                      <button
                        onClick={() =>
                          setPendingAction((prev) => ({
                            ...prev!,
                            step: prev?.step === "target" ? "origin" : "player",
                          }))
                        }
                        className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase transition-all"
                      >
                        Atrás
                      </button>
                    )}
                  <button
                    onClick={() => setPendingAction(null)}
                    className="flex-1 py-3 bg-red-600/20 hover:bg-red-600/40 rounded-xl text-[10px] font-black uppercase text-red-400 transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}

        {editingPlayerId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingPlayerId(null)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 glass p-6 z-[60] border-blue-500/30"
            >
              <h3 className="text-sm font-black uppercase mb-4 text-blue-400">
                {matchData.players.find((p) => p.id === editingPlayerId)
                  ?.role === Role.COACH ||
                matchData.players.find((p) => p.id === editingPlayerId)
                  ?.role === Role.DELEGATE
                  ? "Editar Técnico"
                  : "Editar Jugador"}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Nombre Completo
                  </label>
                  <input
                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-xs text-white outline-none focus:border-blue-500"
                    defaultValue={
                      matchData.players.find((p) => p.id === editingPlayerId)
                        ?.name
                    }
                    placeholder={
                      matchData.players.find((p) => p.id === editingPlayerId)
                        ?.role === Role.COACH
                        ? "ENTRENADOR"
                        : "Nombre"
                    }
                    autoFocus
                    onBlur={(e) => {
                      const p = matchData.players.find(
                        (p) => p.id === editingPlayerId,
                      );
                      if (p)
                        updatePlayerDetails(
                          p.id,
                          e.target.value.toUpperCase(),
                          p.number,
                        );
                    }}
                  />
                </div>
                {!(
                  matchData.players.find((p) => p.id === editingPlayerId)
                    ?.role === Role.COACH ||
                  matchData.players.find((p) => p.id === editingPlayerId)
                    ?.role === Role.DELEGATE
                ) && (
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                      Dorsal
                    </label>
                    <input
                      type="number"
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-xs text-white outline-none focus:border-blue-500"
                      defaultValue={
                        matchData.players.find((p) => p.id === editingPlayerId)
                          ?.number
                      }
                      onBlur={(e) => {
                        const p = matchData.players.find(
                          (p) => p.id === editingPlayerId,
                        );
                        if (p)
                          updatePlayerDetails(
                            p.id,
                            p.name,
                            parseInt(e.target.value) || 0,
                          );
                      }}
                    />
                  </div>
                )}
              </div>
              <button
                onClick={() => setEditingPlayerId(null)}
                className="w-full mt-6 py-3 bg-blue-600 text-xs font-black rounded-xl hover:bg-blue-500 transition-all"
              >
                GUARDAR CAMBIOS
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeSlotToAdd && (
          <BenchRadialMenu
            isOpponent={activeSlotToAdd.isOpponent}
            benchPlayers={matchData.players.filter((p) => {
              const currentGS = activeSlotToAdd.isOpponent ? rivalGameState : gameState;
              const currentSlots = PITCH_SYSTEMS[currentGS] || PITCH_SYSTEMS[GameState.FOUR_VS_FOUR];
              const slotLabel = currentSlots[activeSlotToAdd.index]?.label;
              const isFixedGK = currentGS !== GameState.PJ_ATTACK;
              
              const baseFilter = !p.isOnPitch &&
                p.role !== Role.COACH &&
                p.role !== Role.DELEGATE &&
                p.stats.redCards === 0 &&
                p.isOpponent === activeSlotToAdd.isOpponent;
                
              if (!baseFilter) return false;
              
              if (isFixedGK) {
                if (slotLabel === "POR") return p.role === Role.GOALKEEPER;
              // If it's a field player slot, don't allow GKs
              return p.role !== Role.GOALKEEPER;
            }
            
            return true;
          })}
          onSelect={(benchId) => {
            setMatchData((prev) => ({
                ...prev,
                players: prev.players.map((p) =>
                  p.id === benchId
                    ? {
                        ...p,
                        isOnPitch: true,
                        pitchPosition: activeSlotToAdd.index,
                      }
                    : p,
                ),
              }));
              setActiveSlotToAdd(null);
            }}
            onClose={() => setActiveSlotToAdd(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {swapSelection && (
          <BenchRadialMenu
            isOpponent={matchData.players.find(pl => pl.id === swapSelection)?.isOpponent}
            benchPlayers={matchData.players.filter((p) => {
              const swapper = matchData.players.find(
                (pl) => pl.id === swapSelection,
              );
              if (!swapper) return false;

              const currentGS = swapper.isOpponent ? rivalGameState : gameState;
              const currentSlots = PITCH_SYSTEMS[currentGS] || PITCH_SYSTEMS[GameState.FOUR_VS_FOUR];
              const pos = swapper.pitchPosition ?? 0;
              const slotLabel = currentSlots[pos]?.label;
              const isFixedGK = currentGS !== GameState.PJ_ATTACK;

              const baseFilter = !p.isOnPitch &&
                p.role !== Role.COACH &&
                p.role !== Role.DELEGATE &&
                p.stats.redCards === 0 &&
                !!p.isOpponent === !!swapper?.isOpponent;

              if (!baseFilter) return false;

              if (isFixedGK) {
                if (slotLabel === "POR") return p.role === Role.GOALKEEPER;
                return p.role !== Role.GOALKEEPER;
              }

              return true;
            })}
            onSelect={(benchId) => executeSwap(benchId)}
            onClose={() => setSwapSelection(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeActionPlayerId && (
          <PlayerActionRadialMenu
            player={
              matchData.players.find((p) => p.id === activeActionPlayerId)!
            }
            onAction={handleAction}
            onSwap={(id) => executeSwap(id, true)}
            onClose={() => setActiveActionPlayerId(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirmEvent && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmEvent(null)}
              className="fixed inset-0 z-[320] bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass fixed left-1/2 top-1/2 z-[330] w-[280px] -translate-x-1/2 -translate-y-1/2 border-red-500/30 p-6 text-center"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/20">
                <AlertTriangle className="text-red-500" size={24} />
              </div>
              <h3 className="mb-2 text-sm font-black uppercase text-white">
                ¿Eliminar Acción?
              </h3>
              <p className="mb-6 px-2 text-[10px] font-bold uppercase leading-relaxed tracking-widest text-slate-400">
                Esta acción restará las estadísticas del jugador y ajustará el
                marcador si es necesario.
              </p>

              <div className="mb-6 rounded-xl border border-white/5 bg-black/40 p-3 text-left">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-[8px] text-blue-400">
                    {formatTime(deleteConfirmEvent.timestamp)}
                  </span>
                  <span className="text-[7px] font-black uppercase text-slate-600">
                    {deleteConfirmEvent.gameState}
                  </span>
                </div>
                <span className="text-[10px] font-black uppercase text-white">
                  {deleteConfirmEvent.type.replace(/_/g, " ")} - #
                  {matchData.players.find(
                    (p) => p.id === deleteConfirmEvent.playerIds[0],
                  )?.number || "--"}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleDeleteEvent(deleteConfirmEvent)}
                  className="w-full rounded-xl bg-red-600 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-red-500"
                >
                  Confirmar Eliminación
                </button>
                <button
                  onClick={() => setDeleteConfirmEvent(null)}
                  className="w-full rounded-xl bg-white/5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all hover:bg-white/10"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* CONFIRM RESET MODAL */}
      <AnimatePresence>
        {isResetConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 border border-red-500/30">
                  <RotateCcw size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white uppercase italic">¿Reiniciar Cronómetro?</h3>
                  <p className="text-slate-400 text-sm mt-1">Se borrarán todos los tiempos y el cronómetro volverá a cero.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full mt-4">
                  <button
                    onClick={() => setIsResetConfirmOpen(false)}
                    className="py-3 px-6 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase text-xs hover:bg-white/10 transition-all font-sans"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmReset}
                    className="py-3 px-6 rounded-2xl bg-red-600 text-white font-black uppercase text-xs shadow-lg shadow-red-600/20 hover:bg-red-50 transition-all font-sans"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONFIRM END FIRST HALF MODAL */}
      <AnimatePresence>
        {isEndFirstConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 border border-blue-500/30">
                  <TimerIcon size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white uppercase italic">¿Finalizar 1ª Parte?</h3>
                  <p className="text-slate-400 text-sm mt-1">El cronómetro volverá a cero y se pasará a la segunda parte.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full mt-4">
                  <button
                    onClick={() => setIsEndFirstConfirmOpen(false)}
                    className="py-3 px-6 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase text-xs hover:bg-white/10 transition-all font-sans"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmEndFirst}
                    className="py-3 px-6 rounded-2xl bg-blue-600 text-white font-black uppercase text-xs shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all font-sans"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONFIRM END SECOND HALF MODAL */}
      <AnimatePresence>
        {isEndSecondConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 border border-red-500/30">
                  <Trophy size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white uppercase italic">¿Finalizar 2ª Parte?</h3>
                  <p className="text-slate-400 text-sm mt-1">El partido se dará por finalizado y se cerrará la inclusión de datos.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full mt-4">
                  <button
                    onClick={() => setIsEndSecondConfirmOpen(false)}
                    className="py-3 px-6 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase text-xs hover:bg-white/10 transition-all font-sans"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmEndSecond}
                    className="py-3 px-6 rounded-2xl bg-red-600 text-white font-black uppercase text-xs shadow-lg shadow-red-600/20 hover:bg-red-500 transition-all font-sans"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFoulWarning && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] pointer-events-none"
          >
            <div className={`px-6 py-4 rounded-3xl border-2 flex flex-col items-center gap-2 backdrop-blur-2xl shadow-2xl ${
              showFoulWarning.isLocal 
                ? "bg-blue-600/90 border-blue-400 text-white" 
                : "bg-red-600/90 border-red-400 text-white"
            }`}>
              <div className="flex items-center gap-3">
                <div className="bg-white text-slate-900 w-10 h-10 rounded-full flex items-center justify-center font-black animate-bounce">
                  !
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-tighter italic">
                    AVISO: {showFoulWarning.count}ª FALTA
                  </h4>
                  <p className="text-[10px] font-bold uppercase opacity-80">{showFoulWarning.team}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@400;700;800&display=swap');
        
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .custom-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
      `}</style>
    </div>
    </>
  );
}

// Helper Components for Shot Tracking
const GoalMap = ({
  onSelect,
  selected,
}: {
  onSelect: (id: string) => void;
  selected?: string;
}) => (
  <div className="flex flex-col gap-4 w-full">
    <div className="relative group">
      <div className="grid grid-cols-3 grid-rows-3 gap-2 p-2 bg-slate-900 border-[6px] border-slate-700 rounded-2xl aspect-[3/2] w-full shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
        {Array.from({ length: 9 }).map((_, i) => {
          const id = `G${i + 1}`;
          return (
            <motion.button
              key={i}
              whileHover={{ scale: 0.98 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(id)}
              className={`relative rounded-lg transition-all border flex items-center justify-center
                ${selected === id 
                  ? "bg-red-500 border-white shadow-[0_0_20px_rgba(239,68,68,0.5)] z-10 scale-105" 
                  : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20"
                }`}
            >
              <span className={`text-[10px] font-black font-mono transition-opacity ${selected === id ? "text-white opacity-100" : "text-slate-600 opacity-40 group-hover:opacity-100"}`}>
                {id}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect("OUT")}
      className={`py-4 rounded-2xl border-2 font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-lg
        ${selected === "OUT" 
          ? "bg-red-600 border-white text-white shadow-red-900/40" 
          : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-red-400 hover:border-red-500/50"}
      `}
    >
      <X size={16} className={selected === "OUT" ? "text-white" : "text-slate-500"} />
      Tiro Fuera / Desviado
    </motion.button>
  </div>
);

// component logic for the maps
const FutsalHeatMap = ({
  events,
  title,
  colorScheme = "blue",
  players = [],
}: {
  events: GameEvent[];
  title: string;
  colorScheme?: "blue" | "red" | "green" | "orange" | "cyan" | "amber";
  players?: Player[];
}) => {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const gridCounts: Record<string, number> = {};
  events.forEach((ev) => {
    if (ev.originGrid) {
      gridCounts[ev.originGrid] = (gridCounts[ev.originGrid] || 0) + 1;
    }
  });

  const maxCount = Math.max(...Object.values(gridCounts), 1);
  const rows = ["A", "B", "C"];
  const cols = ["1", "2", "3"];

  const colors = {
    blue: "bg-blue-500",
    red: "bg-red-500",
    green: "bg-green-500",
    orange: "bg-orange-500",
    cyan: "bg-cyan-500",
    amber: "bg-amber-500",
  };

  const borders = {
    blue: "border-blue-500/30",
    red: "border-red-500/30",
    green: "border-green-500/30",
    orange: "border-orange-500/30",
    cyan: "border-cyan-500/30",
    amber: "border-amber-500/30",
  };

  const getZonePlayers = (zoneId: string) => {
    const zoneEvents = events.filter(e => e.originGrid === zoneId);
    const playerStats: Record<string, number> = {};
    zoneEvents.forEach(e => {
      const pId = e.playerIds[0];
      if (pId) playerStats[pId] = (playerStats[pId] || 0) + 1;
    });
    return Object.entries(playerStats)
      .map(([id, count]) => {
        const p = players.find(player => player.id === id);
        return { name: p?.name || "N/A", count, number: p?.number };
      })
      .sort((a, b) => b.count - a.count);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
          <MapIcon size={14} className={colorScheme === "red" ? "text-red-400" : "text-blue-400"} />
          {title}
        </h4>
        <span className="text-[8px] font-black text-slate-500 uppercase px-2 py-1 bg-white/5 rounded-md">
          {events.length} Eventos / {Object.keys(gridCounts).length} Zonas
        </span>
      </div>

      <div className="relative aspect-[2/3] w-full max-w-[280px] mx-auto bg-slate-900/50 rounded-[2.5rem] border-4 border-slate-800 overflow-hidden shadow-2xl backdrop-blur-md">
        {/* Pitch markings */}
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <div className="absolute top-1/2 w-full h-[2px] bg-white -translate-y-1/2" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border-2 border-white rounded-full" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-12 border-x-2 border-b-2 border-white rounded-b-3xl" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-12 border-x-2 border-t-2 border-white rounded-t-3xl" />
          <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
          <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
        </div>

        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 p-3 gap-3">
          {rows.map((r) =>
            cols.map((c) => {
              const id = `${r}${c}`;
              const count = gridCounts[id] || 0;
              const intensity = count / maxCount;
              const isSelected = selectedZone === id;
              return (
                <button
                  key={id}
                  onClick={() => setSelectedZone(isSelected ? null : id)}
                  className={`rounded-2xl transition-all border flex flex-col items-center justify-center relative overflow-hidden backdrop-blur-sm ${borders[colorScheme]} ${isSelected ? 'border-white ring-4 ring-white/10 scale-[1.05] z-20 shadow-2xl' : 'hover:bg-white/5'}`}
                >
                  {count > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`absolute inset-0 ${colors[colorScheme]}`}
                      style={{ opacity: intensity * 0.5 + 0.1 }}
                    />
                  )}
                  <span className={`relative z-10 text-[9px] font-black uppercase mb-1 transition-colors ${isSelected ? 'text-white' : 'text-slate-500'}`}>
                    {id}
                  </span>
                  {count > 0 && (
                    <span className="relative z-10 text-xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                      {count}
                    </span>
                  )}
                  {isSelected && (
                    <div className="absolute inset-0 bg-white/10" />
                  )}
                </button>
              );
            }),
          )}
        </div>
      </div>

      {/* Selected Zone Details */}
      <AnimatePresence>
        {selectedZone && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="overflow-hidden"
          >
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 flex flex-col gap-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Detalle Zona {selectedZone}</span>
                  <span className="text-[8px] font-bold text-slate-500 uppercase italic">Protagonistas de esta zona</span>
                </div>
                <button onClick={() => setSelectedZone(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={14} className="text-slate-500" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {getZonePlayers(selectedZone).length > 0 ? (
                  getZonePlayers(selectedZone).map((p, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-3 shadow-lg">
                      <div className="w-6 h-6 rounded-lg bg-blue-600/20 flex items-center justify-center text-[10px] font-black text-blue-400 border border-blue-500/20">
                        {p.number}
                      </div>
                      <span className="text-[10px] font-black text-white uppercase">{p.name}</span>
                      <div className="h-4 w-px bg-white/10 mx-1" />
                      <span className="text-[10px] font-black text-blue-400">{p.count}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center w-full py-8 text-center bg-black/20 rounded-2xl border border-dashed border-white/5">
                    <History size={24} className="text-slate-800 mb-2" />
                    <span className="text-[10px] text-slate-600 font-bold uppercase">Sin historial en esta zona</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const GoalHeatMap = ({
  events,
  title,
  colorScheme = "blue",
  players = [],
}: {
  events: GameEvent[];
  title: string;
  colorScheme?: "blue" | "red" | "green" | "orange" | "cyan" | "amber";
  players?: Player[];
}) => {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const gridCounts: Record<string, number> = {};
  events.forEach((ev) => {
    if (ev.destinationGrid) {
      gridCounts[ev.destinationGrid] = (gridCounts[ev.destinationGrid] || 0) + 1;
    }
  });

  const maxCount = Math.max(...Object.values(gridCounts), 1);
  const zones = Array.from({ length: 9 }).map((_, i) => `G${i + 1}`);

  const colors = {
    blue: "bg-blue-500",
    red: "bg-red-500",
    green: "bg-green-500",
    orange: "bg-orange-500",
    cyan: "bg-cyan-500",
    amber: "bg-amber-500",
  };

  const borders = {
    blue: "border-blue-500/30",
    red: "border-red-500/30",
    green: "border-green-500/30",
    orange: "border-orange-500/30",
    cyan: "border-cyan-500/30",
    amber: "border-amber-500/30",
  };

  const getZonePlayers = (zoneId: string) => {
    const zoneEvents = events.filter(e => e.destinationGrid === zoneId);
    const playerStats: Record<string, number> = {};
    zoneEvents.forEach(e => {
      const pId = e.playerIds[0];
      if (pId) playerStats[pId] = (playerStats[pId] || 0) + 1;
    });
    return Object.entries(playerStats)
      .map(([id, count]) => {
        const p = players.find(player => player.id === id);
        return { name: p?.name || "N/A", count, number: p?.number };
      })
      .sort((a, b) => b.count - a.count);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
          <Target size={14} className={colorScheme === "red" ? "text-red-400" : "text-blue-400"} />
          {title}
        </h4>
        <div className="flex gap-2">
           <span className="text-[8px] font-black text-slate-500 uppercase px-2 py-1 bg-white/5 rounded-md">
            {gridCounts["OUT"] || 0} Fuera
          </span>
          <span className="text-[8px] font-black text-slate-500 uppercase px-2 py-1 bg-white/5 rounded-md">
            {events.length} Totales
          </span>
        </div>
      </div>

      <div className="relative aspect-[3/2] w-full max-w-[320px] mx-auto bg-slate-900 border-[6px] border-slate-700 rounded-t-[2rem] shadow-2xl overflow-hidden p-3 group">
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
        <div className="grid grid-cols-3 grid-rows-3 gap-2 h-full">
          {zones.map((id) => {
            const count = gridCounts[id] || 0;
            const intensity = count / maxCount;
            const isSelected = selectedZone === id;
            return (
              <button
                key={id}
                onClick={() => setSelectedZone(isSelected ? null : id)}
                className={`rounded-xl transition-all border flex flex-col items-center justify-center relative overflow-hidden backdrop-blur-sm ${borders[colorScheme]} ${isSelected ? 'border-white ring-4 ring-white/10 z-20 scale-[1.05] shadow-2xl' : 'hover:bg-white/5'}`}
              >
                {count > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`absolute inset-0 ${colors[colorScheme]}`}
                    style={{ opacity: intensity * 0.5 + 0.1 }}
                  />
                )}
                <span className={`relative z-10 text-[8px] font-black uppercase transition-colors ${isSelected ? 'text-white' : 'text-slate-500'}`}>
                  {id}
                </span>
                {count > 0 && (
                  <span className="relative z-10 text-lg font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                    {count}
                  </span>
                )}
                {isSelected && (
                  <div className="absolute inset-0 bg-white/20" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Goal Zone Details */}
      <AnimatePresence>
        {selectedZone && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="overflow-hidden"
          >
            <div className="bg-slate-900/80 border border-slate-700 rounded-[2rem] p-5 shadow-2xl backdrop-blur-2xl">
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">A puerta: {selectedZone}</span>
                  <span className="text-[7px] font-bold text-slate-500 uppercase italic mt-0.5">Efectividad por jugador</span>
                </div>
                <button onClick={() => setSelectedZone(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <X size={14} className="text-slate-600" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {getZonePlayers(selectedZone).length > 0 ? (
                  getZonePlayers(selectedZone).map((p, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 px-4 py-2 rounded-2xl">
                      <span className="text-[10px] font-black text-slate-400">#{p.number}</span>
                      <span className="text-[10px] font-black text-white uppercase">{p.name}</span>
                      <div className="h-3 w-px bg-white/10" />
                      <span className="text-[10px] font-black text-blue-400">{p.count}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-[9px] text-slate-500 italic px-2">Sin disparos registrados en esta sección.</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const PitchZones = ({
  onSelect,
  selected,
}: {
  onSelect: (id: string) => void;
  selected?: string;
}) => {
  const rows = ["A", "B", "C"];
  const cols = ["1", "2", "3"];
  return (
    <div className="relative aspect-[2/3] w-full max-w-[200px] mx-auto bg-slate-950 rounded-xl border-4 border-slate-800 overflow-hidden shadow-2xl">
      {/* Marcas de la pista realistas */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        {/* Línea Medio Campo */}
        <div className="absolute top-1/2 w-full h-[2px] bg-white -translate-y-1/2" />
        {/* Círculo Central */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border-2 border-white rounded-full" />
        {/* Áreas de 6 metros */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-12 border-x-2 border-b-2 border-white rounded-b-3xl" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-12 border-x-2 border-t-2 border-white rounded-t-3xl" />
        {/* Punto de Penalti */}
        <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
        <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
      </div>

      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 p-1 gap-1">
        {rows.map((r) =>
          cols.map((c) => {
            const id = `${r}${c}`;
            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                className={`rounded-lg transition-all border flex items-center justify-center font-mono text-[10px] font-black uppercase
                ${
                  selected === id
                    ? "bg-blue-600/80 border-white text-white scale-[0.98] z-10 shadow-[0_0_15px_rgba(37,99,235,0.5)]"
                    : "bg-white/5 border-white/5 text-slate-500 hover:bg-white/10 hover:text-white"
                }
              `}
              >
                <span className="bg-black/60 px-2 py-1 rounded backdrop-blur-md">
                  {id}
                </span>
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
};

const PlayerSelector = ({
  players,
  onSelect,
  selectedId,
  showOnlyRoles,
}: {
  players: Player[];
  onSelect: (id: string) => void;
  selectedId?: string;
  showOnlyRoles?: Role[];
}) => (
  <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 custom-scrollbar">
    {players
      .filter((p) => {
        if (showOnlyRoles) return showOnlyRoles.includes(p.role);
        return p.role !== Role.COACH && p.role !== Role.DELEGATE && p.isOnPitch;
      })
      .map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={`p-2 rounded-xl border-2 flex flex-col items-center gap-1 transition-all
          ${selectedId === p.id ? "bg-blue-600 border-white" : "bg-white/5 border-white/10 opacity-70 hover:opacity-100"}
        `}
        >
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center font-black text-[9px] ${p.role === Role.GOALKEEPER ? "bg-amber-500 text-black" : "bg-black/40 text-white"}`}
          >
            {p.number}
          </div>
          <span className="text-[8px] font-black uppercase truncate w-full text-center">
            {p.name}
          </span>
        </button>
      ))}
  </div>
);

const BenchRadialMenu = ({
  onSelect,
  benchPlayers,
  playerPosition,
  onClose,
  isOpponent = false,
}: {
  onSelect: (id: string) => void;
  benchPlayers: Player[];
  playerPosition?: { top: number; left: number };
  onClose?: () => void;
  isOpponent?: boolean;
}) => {
  const radius = benchPlayers.length > 5 ? 95 : 80;
  const themeColor = isOpponent ? "red" : "blue";
  const themeHex = isOpponent ? "rgba(239, 68, 68, 0.2)" : "rgba(59, 130, 246, 0.2)";
  const themeBorder = isOpponent ? "border-red-500/30" : "border-blue-500/30";
  const themeTitle = isOpponent ? "text-red-400" : "text-blue-400";
  const themeBtnBg = isOpponent ? "bg-red-600 hover:bg-red-500 active:bg-red-700" : "bg-blue-600 hover:bg-blue-500 active:bg-blue-700";
  const themeRing = isOpponent ? "ring-red-400/20" : "ring-blue-400/20";
  const themeText = isOpponent ? "text-red-50" : "text-blue-50";

  // Boundary adjustments in pixels
  let offsetX = 0;
  let offsetY = 0;
  if (playerPosition) {
    if (playerPosition.left < 25) offsetX = 45;
    else if (playerPosition.left > 75) offsetX = -45;

    if (playerPosition.top < 25) offsetY = 45;
    else if (playerPosition.top > 75) offsetY = -45;
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => {
          e.stopPropagation();
          if (onClose) onClose();
        }}
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-[4px] z-[300] pointer-events-auto"
      />
      <div
        className="fixed inset-0 z-[310] flex items-center justify-center pointer-events-none"
        style={{ transform: `translate(${offsetX}px, ${offsetY}px)` }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`absolute w-44 h-44 rounded-full bg-slate-900/80 backdrop-blur-xl border-2 ${themeBorder} shadow-[0_0_60px_rgba(0,0,0,0.8),0_0_20px_${themeHex}]`}
        />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute flex flex-col items-center"
        >
          <span className={`text-[10px] font-black tracking-widest ${themeTitle} uppercase leading-none drop-shadow-md`}>
            CAMBIO
          </span>
          <span className="text-[7px] font-bold text-white/40 uppercase mt-0.5">
            SELECCIONAR
          </span>
        </motion.div>

        <AnimatePresence>
          {benchPlayers.map((p, i) => {
            const angle =
              (i / benchPlayers.length) * (2 * Math.PI) - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                animate={{ opacity: 1, scale: 1, x, y }}
                exit={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                className="absolute pointer-events-auto"
              >
                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(p.id);
                  }}
                  className={`flex flex-col items-center justify-center gap-0.5 p-2 min-w-[52px] min-h-[52px] rounded-2xl ${themeBtnBg} border-2 border-white shadow-[0_10px_30px_rgba(0,0,0,0.6)] text-white transition-all ring-4 ${themeRing} relative overflow-visible`}
                >
                  <span className="text-[11px] font-black leading-none">
                    {p.number}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className={`text-[7px] font-bold uppercase truncate max-w-[40px] leading-tight ${themeText}`}>
                      {p.name.split(" ")[0]}
                    </span>
                    {p.stats.yellowCards > 0 && (
                      <div className="w-1.5 h-2 bg-yellow-400 rounded-[1px] shadow-[0_0_4px_rgba(250,204,21,0.5)]" />
                    )}
                  </div>
                  <span className="text-[6px] font-black text-white/60 tabular-nums">
                    {Math.floor(p.individualTimeSeconds / 60)}'
                  </span>
                </motion.button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </>
  );
};

const PlayerCard = ({
  player,
  onClick,
  isSelected,
  isSwapTarget,
  isMenuActive,
}: {
  player: Player;
  onClick: () => void;
  isSelected?: boolean;
  isSwapTarget?: boolean;
  isMenuActive?: boolean;
}) => {
  return (
    <button
      onClick={onClick}
      className={`relative w-full h-full rounded-xl flex flex-col items-center justify-center transition-all border-2 overflow-visible
            ${
              isSelected
                ? "bg-amber-600 border-white ring-4 ring-amber-500/30 font-black shadow-[0_0_20px_rgba(217,119,6,0.6)] scale-110 z-[150]"
                : isSwapTarget
                  ? "bg-cyan-600 border-white ring-4 ring-cyan-500/30 scale-110 z-[150] shadow-[0_0_20px_rgba(8,145,178,0.6)]"
                  : isMenuActive
                    ? `${player.isOpponent ? "bg-red-700 shadow-red-900/40" : "bg-blue-500 shadow-blue-950/40"} border-white ring-4 ${player.isOpponent ? "ring-red-500/30" : "ring-blue-400/30"} scale-110 z-[150] shadow-xl`
                    : player.isOpponent
                      ? "bg-red-900/80 border-red-500/30 hover:scale-105 hover:bg-red-800 shadow-xl"
                      : "bg-blue-600/80 border-blue-400/50 hover:scale-105 hover:bg-blue-500 shadow-xl"
            }
         `}
    >
      <div className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-full border shadow-lg z-20
        ${player.isOpponent ? "bg-red-600 border-red-400" : "bg-blue-600 border-blue-400"}
      `}>
        <span className="text-[10px] font-black text-white leading-none">{player.number}</span>
      </div>

      <div className="flex flex-col items-center gap-0.5 w-full px-1 py-1">
        <span className="text-[clamp(8px,2vw,12px)] font-black text-white uppercase truncate w-full text-center leading-none">
          {player.name.split(" ")[0]}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[7px] font-black text-slate-400 uppercase leading-none opacity-80">
            {player.role === Role.GOALKEEPER ? "POR" : "JUG"}
          </span>
          {!player.isOpponent && (
            <span className={`text-[8px] font-mono font-black ${player.isOpponent ? "text-red-400" : "text-blue-400"} leading-none`}>
              {formatPlayerTime(player.individualTimeSeconds)}
            </span>
          )}
        </div>
      </div>

      {/* Card Indicators */}
      <div className="absolute -right-1 -top-1 flex flex-col gap-0.5 z-30">
        {player.isStarter && (
          <div className="bg-amber-500 text-black p-0.5 rounded-sm mb-0.5 shadow-sm self-end">
            <Trophy size={6} fill="currentColor" />
          </div>
        )}
        <div className="flex gap-0.5">
          {player.stats.yellowCards > 0 && (
            <div className="w-1.5 h-2.5 bg-yellow-400 rounded-sm border border-black/20" title="Tarjeta Amarilla" />
          )}
          {player.stats.redCards > 0 && (
            <div className="w-1.5 h-2.5 bg-red-600 rounded-sm border border-black/20" title="Tarjeta Roja" />
          )}
        </div>
      </div>

      {/* Swap Confirmation Indicator */}
      {isSelected && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-amber-600 text-white text-[7px] font-black py-1 px-3 rounded-full shadow-xl ring-2 ring-white z-40"
        >
          ¿CAMBIAR POR?
        </motion.div>
      )}
    </button>
  );
};

const FormationMenu = ({
  currentValue,
  isOpen,
  onSelect,
  isOpponent,
}: {
  currentValue: GameState;
  isOpen: boolean;
  onSelect: (val: GameState) => void;
  isOpponent: boolean;
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          className="absolute top-12 right-4 z-[100] min-w-[200px] bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden p-1"
        >
          <div className="p-2 border-b border-white/5 bg-white/5 mb-1 flex items-center justify-between">
            <h5 className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em]">
              {isOpponent ? "Formación Rival" : "Formación Local"}
            </h5>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {Object.values(GameState).map((state) => (
              <button
                key={state}
                onClick={() => onSelect(state)}
                className={`flex items-center justify-between p-2.5 rounded-xl transition-all ${
                  currentValue === state
                    ? isOpponent 
                      ? "bg-red-600/20 text-red-100" 
                      : "bg-blue-600/20 text-blue-100"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${currentValue === state ? (isOpponent ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]') : 'bg-transparent border border-white/20'}`} />
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">{state}</span>
                </div>
                {currentValue === state && (
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center ${isOpponent ? 'bg-red-500' : 'bg-blue-500'}`}>
                    <Check size={8} className="text-white" strokeWidth={4} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
