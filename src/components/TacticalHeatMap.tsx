import React, { useMemo, useState } from 'react';
import { SavedMatch, ActionType, GoalieAction } from '../types/futsal';

// ─── FIELD ZONES ───────────────────────────────────────────────
// The field is divided into a 3x3 grid (cols x rows):
//   A1 A2 A3   ← Attacking third  (opponent goal end)
//   B1 B2 B3   ← Middle third
//   C1 C2 C3   ← Defensive third  (own goal end)
// Column: 1=left, 2=center, 3=right

const ZONES = ['A1','A2','A3','B1','B2','B3','C1','C2','C3'];
const ZONE_LABELS: Record<string, string> = {
  A1: 'Atq\nIzq', A2: 'Atq\nCen', A3: 'Atq\nDer',
  B1: 'Med\nIzq', B2: 'Med\nCen', B3: 'Med\nDer',
  C1: 'Def\nIzq', C2: 'Def\nCen', C3: 'Def\nDer',
};

type Layer = 'all' | 'attack' | 'defense' | 'loss' | 'recovery';
type Team = 'local' | 'rival';

const LAYER_CONFIG: Record<Layer, {
  label: string;
  color: string;
  actions: (ActionType | GoalieAction)[];
  description: string;
}> = {
  all: {
    label: 'Todo',
    color: '#a78bfa',
    actions: [
      ActionType.GOAL, ActionType.SHOT, ActionType.ASSIST,
      ActionType.STEAL, ActionType.INTERCEPTION,
      ActionType.LOSS, ActionType.UNFORCED_ERROR,
      GoalieAction.SAVE_PARRY, GoalieAction.GOAL_CONCEDED,
    ],
    description: 'Todas las acciones registradas',
  },
  attack: {
    label: 'Ataque',
    color: '#34d399',
    actions: [ActionType.GOAL, ActionType.SHOT, ActionType.ASSIST],
    description: 'Goles, tiros y asistencias',
  },
  defense: {
    label: 'Defensa',
    color: '#60a5fa',
    actions: [ActionType.STEAL, ActionType.INTERCEPTION, GoalieAction.SAVE_PARRY],
    description: 'Recuperaciones, interceptaciones y paradas',
  },
  loss: {
    label: 'Pérdidas',
    color: '#f87171',
    actions: [ActionType.LOSS, ActionType.UNFORCED_ERROR, GoalieAction.GOAL_CONCEDED],
    description: 'Pérdidas de balón y goles encajados',
  },
  recovery: {
    label: 'Recuper.',
    color: '#fbbf24',
    actions: [ActionType.STEAL, ActionType.INTERCEPTION],
    description: 'Recuperaciones e interceptaciones',
  },
};

function interpolateColor(intensity: number, hex: string): string {
  // intensity 0→1, from transparent to full color
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Math.max(0.05, intensity * 0.85)})`;
}

interface HeatMapProps {
  match: SavedMatch;
}

export default function TacticalHeatMap({ match }: HeatMapProps) {
  const [layer, setLayer] = useState<Layer>('all');
  const [team, setTeam] = useState<Team>('local');

  const { zoneCounts, maxCount, totalActions, topZone } = useMemo(() => {
    const config = LAYER_CONFIG[layer];
    const counts: Record<string, number> = {};
    ZONES.forEach(z => counts[z] = 0);
    let total = 0;

    match.events?.forEach(e => {
      const isLocal = !e.metadata?.isOpponent;
      if (team === 'local' && !isLocal) return;
      if (team === 'rival' && isLocal) return;
      if (!config.actions.includes(e.type as any)) return;
      if (!e.originGrid) return;
      const zone = e.originGrid.toUpperCase();
      if (ZONES.includes(zone)) {
        counts[zone] = (counts[zone] || 0) + 1;
        total++;
      }
    });

    const maxC = Math.max(...Object.values(counts), 1);
    const topZ = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    return { zoneCounts: counts, maxCount: maxC, totalActions: total, topZone: topZ };
  }, [match, layer, team]);

  const config = LAYER_CONFIG[layer];
  const teamName = team === 'local' ? (match.teamName || 'Local') : (match.opponentName || 'Rival');

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-black text-white uppercase tracking-tight">
            Mapa de Calor Táctico
          </h3>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            {totalActions} acciones
          </span>
        </div>
        <p className="text-[11px] text-slate-500">{config.description}</p>
      </div>

      {/* Team toggle */}
      <div className="flex border-b border-slate-800">
        {(['local', 'rival'] as Team[]).map(t => (
          <button
            key={t}
            onClick={() => setTeam(t)}
            className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all ${
              team === t
                ? t === 'local'
                  ? 'bg-blue-500/20 text-blue-400 border-b-2 border-blue-400'
                  : 'bg-red-500/20 text-red-400 border-b-2 border-red-400'
                : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {t === 'local' ? match.teamName || 'Local' : match.opponentName || 'Rival'}
          </button>
        ))}
      </div>

      {/* Layer filters */}
      <div className="flex gap-1.5 p-3 border-b border-slate-800 overflow-x-auto no-scrollbar">
        {(Object.keys(LAYER_CONFIG) as Layer[]).map(l => (
          <button
            key={l}
            onClick={() => setLayer(l)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all shrink-0 ${
              layer === l
                ? 'text-slate-900'
                : 'bg-white/5 text-slate-500 hover:text-slate-300 border border-white/10'
            }`}
            style={layer === l ? { backgroundColor: LAYER_CONFIG[l].color } : {}}
          >
            {LAYER_CONFIG[l].label}
          </button>
        ))}
      </div>

      {/* Heat map pitch */}
      <div className="p-5">
        <div className="relative mx-auto max-w-[280px]">
          {/* Pitch background */}
          <div className="relative bg-slate-950 rounded-xl border-2 border-slate-700 overflow-hidden"
               style={{ aspectRatio: '2/3' }}>

            {/* Pitch lines */}
            <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none" viewBox="0 0 200 300">
              {/* Center line */}
              <line x1="0" y1="150" x2="200" y2="150" stroke="white" strokeWidth="1.5"/>
              {/* Center circle */}
              <circle cx="100" cy="150" r="30" stroke="white" strokeWidth="1.5" fill="none"/>
              {/* Top penalty area */}
              <rect x="55" y="0" width="90" height="55" stroke="white" strokeWidth="1.5" fill="none"/>
              {/* Top goal */}
              <rect x="75" y="0" width="50" height="15" stroke="white" strokeWidth="1.5" fill="none"/>
              {/* Bottom penalty area */}
              <rect x="55" y="245" width="90" height="55" stroke="white" strokeWidth="1.5" fill="none"/>
              {/* Bottom goal */}
              <rect x="75" y="285" width="50" height="15" stroke="white" strokeWidth="1.5" fill="none"/>
            </svg>

            {/* Zone grid — 3 cols × 3 rows */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
              {['A','B','C'].map((row, rowIdx) =>
                ['1','2','3'].map((col, colIdx) => {
                  const zoneId = `${row}${col}`;
                  const count = zoneCounts[zoneId] || 0;
                  const intensity = maxCount > 0 ? count / maxCount : 0;
                  const isTop = topZone && topZone[0] === zoneId && topZone[1] > 0;

                  return (
                    <div
                      key={zoneId}
                      className="relative flex flex-col items-center justify-center border border-white/5 transition-all"
                      style={{ backgroundColor: interpolateColor(intensity, config.color) }}
                    >
                      {count > 0 && (
                        <>
                          <span className={`text-[10px] font-black leading-none ${
                            isTop ? 'text-white' : 'text-white/70'
                          }`}
                            style={isTop ? { textShadow: `0 0 8px ${config.color}` } : {}}
                          >
                            {count}
                          </span>
                          {isTop && (
                            <div className="absolute inset-0 rounded-[2px] pointer-events-none"
                                 style={{ boxShadow: `inset 0 0 0 1.5px ${config.color}` }} />
                          )}
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Zone labels left axis */}
          <div className="absolute -left-8 inset-y-0 flex flex-col justify-around py-1">
            {['ATQ', 'MED', 'DEF'].map(label => (
              <span key={label} className="text-[8px] font-black text-slate-600 uppercase">{label}</span>
            ))}
          </div>

          {/* Zone labels bottom axis */}
          <div className="flex justify-around mt-1.5 px-1">
            {['IZQ', 'CEN', 'DER'].map(label => (
              <span key={label} className="text-[8px] font-black text-slate-600 uppercase flex-1 text-center">{label}</span>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-2 justify-center">
          <span className="text-[9px] text-slate-600 font-black uppercase">Baja</span>
          <div className="flex gap-px">
            {[0.1, 0.25, 0.45, 0.65, 0.85].map((v, i) => (
              <div key={i} className="w-5 h-3 rounded-[2px]"
                   style={{ backgroundColor: interpolateColor(v, config.color) }} />
            ))}
          </div>
          <span className="text-[9px] text-slate-600 font-black uppercase">Alta</span>
        </div>
      </div>

      {/* Stats summary */}
      {totalActions > 0 && (
        <div className="px-5 pb-5 grid grid-cols-3 gap-3">
          {/* Top zone */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Zona top</div>
            <div className="text-lg font-black font-mono" style={{ color: config.color }}>
              {topZone?.[0] || '—'}
            </div>
            <div className="text-[9px] text-slate-500">{topZone?.[1] || 0} acciones</div>
          </div>

          {/* Attacking third total */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Tercio atq</div>
            <div className="text-lg font-black font-mono text-emerald-400">
              {['A1','A2','A3'].reduce((acc, z) => acc + (zoneCounts[z] || 0), 0)}
            </div>
            <div className="text-[9px] text-slate-500">
              {totalActions > 0
                ? Math.round(['A1','A2','A3'].reduce((acc, z) => acc + (zoneCounts[z] || 0), 0) / totalActions * 100)
                : 0}%
            </div>
          </div>

          {/* Defensive third total */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Tercio def</div>
            <div className="text-lg font-black font-mono text-blue-400">
              {['C1','C2','C3'].reduce((acc, z) => acc + (zoneCounts[z] || 0), 0)}
            </div>
            <div className="text-[9px] text-slate-500">
              {totalActions > 0
                ? Math.round(['C1','C2','C3'].reduce((acc, z) => acc + (zoneCounts[z] || 0), 0) / totalActions * 100)
                : 0}%
            </div>
          </div>
        </div>
      )}

      {totalActions === 0 && (
        <div className="px-5 pb-5 text-center text-slate-600 text-xs">
          No hay acciones registradas con posición en el campo para este filtro.
        </div>
      )}
    </div>
  );
}
