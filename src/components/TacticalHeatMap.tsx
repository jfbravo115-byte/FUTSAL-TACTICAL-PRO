import React, { useMemo, useState } from 'react';
import { SavedMatch, ActionType, GoalieAction } from '../types/futsal';
import { FutsalPitch } from './field/FutsalPitch';
import { ZONE_12_IDS, isZone12Id } from '../utils/fieldZones';
import { GOALIE_SAVE_TYPES } from '../utils/goalkeeperActions';
import { LEGACY_ZONE_IDS, formatAnyZoneLabel, isLegacyZoneId } from '../utils/legacyZoneMap';

// ─── ZONAS ──────────────────────────────────────────────────────
// CORRECCIÓN DE FASE 3. Este componente interpretaba A1-C3 como
// "letra = tercio de ataque/medio/defensa" y lo pintaba sobre una pista
// VERTICAL, es decir girado 90° respecto a la pantalla en la que el usuario
// registraba los datos: el selector de captura siempre fue una pista
// HORIZONTAL, donde el eje longitudinal es la COLUMNA y la letra es la banda
// transversal.
//
// Se elimina la interpretación propia y se pasa al modelo compartido, que
// decide el sistema (12 zonas o rejilla histórica) a partir de los datos del
// propio partido y nunca convierte de uno a otro.

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
      ...GOALIE_SAVE_TYPES, GoalieAction.GOAL_CONCEDED,
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
    actions: [ActionType.STEAL, ActionType.INTERCEPTION, ...GOALIE_SAVE_TYPES],
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

  const { zoneCounts, maxCount, totalActions, topZone, isLegacyData } = useMemo(() => {
    const config = LAYER_CONFIG[layer];

    const scoped = (match.events ?? []).filter(e => {
      const isLocal = !e.metadata?.isOpponent;
      if (team === 'local' && !isLocal) return false;
      if (team === 'rival' && isLocal) return false;
      return config.actions.includes(e.type as any);
    });

    // Un partido histórico solo si NO hay ningún sector del sistema nuevo.
    const legacy =
      !scoped.some(e => isZone12Id(e.originGrid?.toUpperCase())) &&
      scoped.some(e => isLegacyZoneId(e.originGrid));

    const ids: readonly string[] = legacy ? LEGACY_ZONE_IDS : ZONE_12_IDS;
    const counts: Record<string, number> = {};
    ids.forEach(z => { counts[z] = 0; });
    let total = 0;

    scoped.forEach(e => {
      const zone = e.originGrid?.toUpperCase();
      if (zone && ids.includes(zone)) {
        counts[zone] = (counts[zone] || 0) + 1;
        total++;
      }
    });

    const maxC = Math.max(...Object.values(counts), 1);
    const topZ = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    return {
      zoneCounts: counts,
      maxCount: maxC,
      totalActions: total,
      topZone: topZ,
      isLegacyData: legacy,
    };
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
        {/* Pista compartida, en la MISMA orientación en la que se registró:
            horizontal, portería propia a la izquierda. */}
        <FutsalPitch
          mode={isLegacyData ? 'legacy3x3' : 'zone12'}
          theme="dark"
          counts={zoneCounts}
          accent={config.color}
          maxWidth={320}
          emptyLabel="Sin acciones ubicadas"
        />

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
            <div className="text-[11px] font-black uppercase leading-tight" style={{ color: config.color }}>
              {topZone?.[0] ? formatAnyZoneLabel(topZone[0]) : '—'}
            </div>
            <div className="text-[9px] text-slate-500">{topZone?.[1] || 0} acciones</div>
          </div>

          {/* Zona más ofensiva y más defensiva. En datos históricos no puede
              afirmarse cuál es cuál — la perspectiva no se registró — así que
              se nombran por franja y no por "ataque"/"defensa". */}
          {(isLegacyData
            ? ([
                { label: 'Franja 3', ids: ['A3', 'B3', 'C3'], color: '#34d399' },
                { label: 'Franja 1', ids: ['A1', 'B1', 'C1'], color: '#60a5fa' },
              ] as const)
            : ([
                { label: 'Zona 4', ids: ['Z4L', 'Z4C', 'Z4R'], color: '#34d399' },
                { label: 'Zona 1', ids: ['Z1L', 'Z1C', 'Z1R'], color: '#60a5fa' },
              ] as const)
          ).map(band => {
            const value = band.ids.reduce((acc, z) => acc + (zoneCounts[z] || 0), 0);
            return (
              <div key={band.label} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-[9px] font-black text-slate-500 uppercase mb-1">{band.label}</div>
                <div className="text-lg font-black" style={{ color: band.color }}>{value}</div>
                <div className="text-[9px] text-slate-500">
                  {totalActions > 0 ? Math.round((value / totalActions) * 100) : 0}%
                </div>
              </div>
            );
          })}
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
