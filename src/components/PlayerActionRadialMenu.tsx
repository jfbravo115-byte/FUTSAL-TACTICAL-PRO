import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, Target, AlertTriangle, Zap, RefreshCw, Handshake, RotateCcw, X
} from 'lucide-react';
import { ActionType, GoalieAction, Player, Role } from '../types/futsal';

interface PlayerActionRadialMenuProps {
  player: Player;
  onAction: (type: ActionType | GoalieAction, playerId: string, metadata?: any) => void;
  onSwap: (id: string) => void;
  onClose: () => void;
}

export const PlayerActionRadialMenu = ({ player, onAction, onSwap, onClose }: PlayerActionRadialMenuProps) => {
  const isGoalkeeper = player.role === Role.GOALKEEPER;
  const [selectingZone, setSelectingZone] = React.useState<boolean>(false);
  const [selectionStep, setSelectionStep] = React.useState<'shot' | 'goal'>('shot');
  const [pendingShotZone, setPendingShotZone] = React.useState<string | null>(null);
  const [pendingActionType, setPendingActionType] = React.useState<GoalieAction | null>(null);
  const [selectingSubtype, setSelectingSubtype] = React.useState<'steal' | 'loss' | null>(null);

  const goalZones = Array.from({ length: 9 }).map((_, i) => ({ id: `G${i + 1}`, label: '' }));

  const playerActions = [
    { type: ActionType.GOAL,        label: 'GOL',    icon: '⚽',                         color: 'bg-green-500',  count: player.stats.goals },
    { type: ActionType.SHOT,        label: 'TIRO',   icon: <Target size={14} />,         color: 'bg-rose-500',   count: player.stats.shots },
    { type: ActionType.ASSIST,      label: 'ASIST',  icon: <Handshake size={14} />,      color: 'bg-yellow-500', count: player.stats.assists },
    { type: ActionType.FOUL,        label: 'FALTA',  icon: <AlertTriangle size={14} />,  color: 'bg-orange-500', count: player.stats.fouls },
    { type: ActionType.STEAL,       label: 'RECUP.', icon: <Zap size={14} />,            color: 'bg-purple-600', count: player.stats.steals },
    { type: ActionType.LOSS,        label: 'PÉRD.',  icon: <RefreshCw size={14} />,      color: 'bg-red-500',    count: player.stats.losses },
    { type: 'SWAP',                 label: 'CAMBIO', icon: <RotateCcw size={14} />,      color: 'bg-amber-500',  count: undefined },
  ];

  const goalkeeperActions = [
    { type: GoalieAction.SAVE_PARRY,    label: 'PARADA',   icon: <Handshake size={14} />,     color: 'bg-blue-500',   count: player.stats.saves },
    { type: ActionType.GOAL,            label: 'GOL',      icon: '⚽',                        color: 'bg-green-500',  count: player.stats.goals },
    { type: ActionType.SHOT,            label: 'TIRO',     icon: <Target size={14} />,        color: 'bg-rose-500',   count: player.stats.shots },
    { type: ActionType.ASSIST,          label: 'ASIST',    icon: <Handshake size={14} />,     color: 'bg-yellow-500', count: player.stats.assists },
    { type: ActionType.LOSS,            label: 'PÉRD.',    icon: <RefreshCw size={14} />,     color: 'bg-red-500',    count: player.stats.losses },
    { type: ActionType.STEAL,           label: 'RECUP.',   icon: <Zap size={14} />,           color: 'bg-purple-600', count: player.stats.steals },
    { type: ActionType.FOUL,            label: 'FALTA',    icon: <AlertTriangle size={14} />, color: 'bg-orange-500', count: player.stats.fouls },
    { type: 'SWAP',                     label: 'CAMBIO',   icon: <RotateCcw size={14} />,     color: 'bg-amber-500',  count: undefined },
  ];

  const actions = isGoalkeeper ? goalkeeperActions : playerActions;
  const radius = typeof window !== "undefined" && window.innerWidth < 400 ? 78 : 92;
  const interventions = player.stats.saves + player.stats.conceded;
  const savePercentage = interventions > 0 ? Math.round((player.stats.saves / interventions) * 100) : 0;

  const handleShotZoneSelect = (zoneId: string) => {
    setPendingShotZone(zoneId);
    setSelectionStep('goal');
  };

  const handleGoalZoneSelect = (zoneId: string) => {
    if (pendingActionType) {
      onAction(pendingActionType, player.id, { 
        originGrid: pendingShotZone,
        destinationGrid: zoneId,
        metadata: { zone: zoneId } 
      });
      onClose();
    }
  };

  const handleActionClick = (actionType: any) => {
    if (actionType === 'SWAP') {
      onSwap(player.id);
    } else if (actionType === GoalieAction.SAVE_PARRY || actionType === GoalieAction.GOAL_CONCEDED) {
      setPendingActionType(actionType);
      setSelectionStep('shot');
      setSelectingZone(true);
    } else if (actionType === ActionType.STEAL) {
      setSelectingSubtype('steal');
    } else if (actionType === ActionType.LOSS) {
      setSelectingSubtype('loss');
    } else {
      onAction(actionType, player.id);
      onClose();
    }
  };

  const handleSubtypeSelect = (subType: string) => {
    const type = selectingSubtype === 'steal' ? ActionType.STEAL : ActionType.LOSS;
    onAction(type, player.id, { metadata: { subType } });
    onClose();
  };

  const stealSubtypes = [
    { id: 'with_possession', label: 'Con posesión', desc: 'El equipo controla el balón', icon: '✅', color: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' },
    { id: 'clearance',       label: 'Despeje',      desc: 'Interrumpe pero sin control',  icon: '↗️', color: 'bg-white/10 border-white/20 text-slate-300' },
  ];

  const lossSubtypes = [
    { id: 'bad_pass',    label: 'Error de pase',    desc: 'El pase va al rival o fuera',    icon: '🎯', color: 'bg-red-500/20 border-red-500/40 text-red-300' },
    { id: 'bad_dribble', label: 'Error de regate',  desc: 'Pierde el balón conduciendo',    icon: '🏃', color: 'bg-orange-500/20 border-orange-500/40 text-orange-300' },
    { id: 'bad_control', label: 'Error de control', desc: 'No controla un balón recibido',  icon: '🤲', color: 'bg-amber-500/20 border-amber-500/40 text-amber-300' },
  ];

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm"
      />

      {/* Subtype selector modal */}
      {selectingSubtype && (
        <motion.div
          key="subtype"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[88vw] max-w-sm z-[300] bg-[#0E1015] border border-white/10 rounded-3xl p-5 flex flex-col gap-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-[12px] font-black uppercase tracking-widest ${selectingSubtype === 'steal' ? 'text-cyan-400' : 'text-red-400'}`}>
                {selectingSubtype === 'steal' ? '✅ Tipo de recuperación' : '❌ Tipo de pérdida'}
              </h3>
              <p className="text-[9px] text-slate-500 mt-0.5">{player.name} · #{player.number}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-slate-500">
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {(selectingSubtype === 'steal' ? stealSubtypes : lossSubtypes).map(opt => (
              <button
                key={opt.id}
                onClick={() => handleSubtypeSelect(opt.id)}
                className={`flex items-center gap-3 p-3 rounded-2xl border transition-all active:scale-95 text-left ${opt.color}`}
              >
                <span className="text-2xl shrink-0">{opt.icon}</span>
                <div>
                  <div className="text-[11px] font-black uppercase">{opt.label}</div>
                  <div className="text-[9px] text-slate-500 mt-0.5">{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Zone selector for goalkeeper */}
      {selectingZone && (
        <motion.div
          key="zone-selector"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[300] bg-[#0E1015] border border-amber-500/20 rounded-3xl p-4"
        >
          <h3 className="text-[11px] font-black text-amber-400 uppercase tracking-widest mb-3 text-center">
            {selectionStep === 'shot' ? '📍 Zona de tiro' : '🥅 Zona de portería'}
          </h3>

          {selectionStep === 'shot' ? (
            /* ── ZONA DE TIRO: cuadrícula 3×3 sobre imagen de pista (horizontal) ── */
            <div className="relative aspect-[3/2] w-full max-w-[320px] mx-auto rounded-2xl border-4 border-slate-800 overflow-hidden shadow-2xl"
              style={{ background: 'linear-gradient(90deg, #15803d 0%, #166534 50%, #15803d 100%)' }}>
              {/* Franjas de césped (verticales) */}
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="absolute top-0 bottom-0" style={{ left: `${(i / 6) * 100}%`, width: `${100 / 6}%`, background: i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent' }} />
                ))}
              </div>
              {/* Marcas de pista (horizontal) */}
              <div className="absolute inset-0 pointer-events-none opacity-60">
                <div className="absolute inset-2 border-2 border-white/70 rounded-sm" />
                <div className="absolute left-1/2 top-2 bottom-2 w-[2px] bg-white/70 -translate-x-1/2" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border-2 border-white/70 rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-white/70 rounded-full" />
                <div className="absolute left-2 top-1/2 -translate-y-1/2 h-24 w-10 border-y-2 border-r-2 border-white/70 rounded-r-[3rem]" />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 h-24 w-10 border-y-2 border-l-2 border-white/70 rounded-l-[3rem]" />
                <div className="absolute left-1 top-1/2 -translate-y-1/2 h-10 w-1.5 border-2 border-white/80 bg-white/20" />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-1.5 border-2 border-white/80 bg-white/20" />
              </div>
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-1 p-1">
                {Array.from({ length: 9 }).map((_, i) => {
                  const row = Math.floor(i / 3);
                  const col = i % 3;
                  const id = `${'ABC'[row]}${col + 1}`;
                  return (
                    <button
                      key={id}
                      onClick={() => handleShotZoneSelect(id)}
                      className="rounded-lg border border-white/20 bg-black/10 flex items-center justify-center text-[10px] font-black text-white/80 hover:bg-amber-500/40 hover:border-white/50 hover:text-white transition-all active:scale-95"
                    >
                      <span className="bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-md">{id}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── ZONA DE PORTERÍA: cuadrícula 3×3 con forma de portería ── */
            <div className="relative pt-3 px-3 w-full max-w-[300px] mx-auto">
              {/* Larguero superior */}
              <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-white to-slate-300 rounded-t-lg shadow-md z-20 border-x-[6px] border-t-[3px] border-white" />
              {/* Postes laterales */}
              <div className="absolute top-0 bottom-6 left-0 w-3 bg-gradient-to-r from-white to-slate-300 shadow-md z-20" />
              <div className="absolute top-0 bottom-6 right-0 w-3 bg-gradient-to-l from-white to-slate-300 shadow-md z-20" />
              <div className="grid grid-cols-3 gap-1 aspect-[3/2] rounded-b-sm p-2 relative overflow-hidden"
                style={{
                  background: '#0f172a',
                  backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
                  backgroundSize: '11px 11px',
                }}>
                {goalZones.map(zone => (
                  <button
                    key={zone.id}
                    onClick={() => handleGoalZoneSelect(zone.id)}
                    className="rounded-md border border-white/10 bg-white/[0.03] flex items-center justify-center text-[10px] font-black text-slate-400 hover:bg-amber-500/30 hover:text-amber-300 hover:border-white/30 transition-all active:scale-95"
                  >
                    {zone.label}
                  </button>
                ))}
              </div>
              {/* Suelo / línea de gol */}
              <div className="h-6 relative">
                <div className="absolute top-1 left-0 right-0 h-[3px] bg-white/80 rounded-full" />
                <div className="absolute top-1 left-0 right-0 h-6 bg-gradient-to-b from-green-700/40 to-transparent" />
              </div>
            </div>
          )}

          {selectionStep === 'goal' && pendingActionType === ActionType.SHOT && (
            <button
              onClick={() => handleGoalZoneSelect('OUT')}
              className="mt-2 w-full py-2.5 rounded-xl bg-slate-700/40 border border-slate-500/30 text-[10px] font-black text-slate-300 uppercase tracking-widest hover:bg-slate-700/60 active:scale-95 transition-all"
            >
              ↗️ Desviado / Fuera
            </button>
          )}
          <button onClick={onClose} className="mt-3 w-full py-2 text-[10px] font-black text-slate-500 uppercase">Cancelar</button>
        </motion.div>
      )}

      {/* Main radial menu */}
      {!selectingZone && !selectingSubtype && (
        <motion.div
          key="radial"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.1 }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[250]"
        >
          {/* Center info */}
          <div className="absolute -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-[#0E1015] border-2 border-white/20 flex flex-col items-center justify-center z-10 shadow-xl">
            <span className="text-xl font-black text-white">#{player.number}</span>
            {isGoalkeeper ? (
              <span className="text-[7px] text-amber-400 font-black uppercase">{savePercentage}% par.</span>
            ) : (
              <span className="text-[7px] text-slate-400 font-black uppercase truncate max-w-[72px] text-center px-1">
                {player.name.split(' ')[0]}
              </span>
            )}
          </div>

          {/* Action buttons */}
          {actions.map((action, i) => {
            const angle = (i / actions.length) * 2 * Math.PI - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            return (
              <motion.button
                key={action.type.toString()}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, x, y, opacity: 1 }}
                exit={{ scale: 0, x: 0, y: 0, opacity: 0 }}
                transition={{ duration: 0.1 }}
                whileHover={{ scale: 1.15, filter: 'brightness(1.1)' }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleActionClick(action.type);
                }}
                className={`absolute flex flex-col items-center justify-center w-16 h-16 rounded-full ${action.color} border-4 border-white shadow-[0_10px_25px_rgba(0,0,0,0.3)] text-white transition-all -translate-x-1/2 -translate-y-1/2`}
              >
                <div className="text-lg shadow-sm">{action.icon}</div>
                <span className="text-[8px] font-black mt-0.5 tracking-tighter uppercase">{action.label}</span>
                {action.count !== undefined && action.count > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-black text-[8px] font-black flex items-center justify-center border border-black/10">
                    {action.count}
                  </span>
                )}
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {/* Card buttons — separate bar below the radial, not part of it */}
      {!selectingZone && !selectingSubtype && (
        <motion.div
          key="card-buttons"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-4 left-4 right-4 z-[260] flex gap-3"
        >
          <button
            onClick={(e) => { e.stopPropagation(); onAction(ActionType.YELLOW_CARD, player.id); onClose(); }}
            className="flex-1 py-3 rounded-2xl bg-yellow-600 border-2 border-white shadow-lg flex items-center justify-center gap-2 text-white active:scale-95 transition-all"
          >
            <div className="w-3 h-4 bg-yellow-300 rounded-[1px] border border-yellow-700" />
            <span className="text-[11px] font-black uppercase tracking-tighter">Amarilla</span>
            {player.stats.yellowCards > 0 && (
              <span className="w-5 h-5 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center">
                {player.stats.yellowCards}
              </span>
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onAction(ActionType.RED_CARD, player.id); onClose(); }}
            className="flex-1 py-3 rounded-2xl bg-red-700 border-2 border-white shadow-lg flex items-center justify-center gap-2 text-white active:scale-95 transition-all"
          >
            <div className="w-3 h-4 bg-red-500 rounded-[1px] border border-red-900" />
            <span className="text-[11px] font-black uppercase tracking-tighter">Roja</span>
            {player.stats.redCards > 0 && (
              <span className="w-5 h-5 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center">
                {player.stats.redCards}
              </span>
            )}
          </button>
        </motion.div>
      )}

      {/* Goalkeeper stats bar */}
      {isGoalkeeper && !selectingZone && !selectingSubtype && (
        <motion.div
          key="gk-stats"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-24 left-4 right-4 z-[260] bg-[#0E1015]/90 border border-white/10 rounded-2xl px-4 py-3 flex justify-around"
        >
          {[
            { label: 'Paradas', val: player.stats.saves, color: 'text-blue-400' },
            { label: 'Encajados', val: player.stats.conceded, color: 'text-red-400' },
            { label: '% Paradas', val: `${savePercentage}%`, color: 'text-amber-400' },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center">
              <span className="text-[8px] text-slate-500 uppercase font-black">{s.label}</span>
              <span className={`text-[16px] font-black ${s.color}`}>{s.val}</span>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
