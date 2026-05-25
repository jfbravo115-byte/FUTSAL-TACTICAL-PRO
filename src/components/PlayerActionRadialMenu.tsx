import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, Target, AlertTriangle, Zap, RefreshCw, Handshake, RotateCcw
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

  const goalZones = Array.from({ length: 9 }).map((_, i) => ({ id: `G${i + 1}`, label: '' }));

  const playerActions = [
    { type: ActionType.GOAL, label: 'GOL', icon: '⚽', color: 'bg-green-500', count: player.stats.goals },
    { type: ActionType.ASSIST, label: 'ASIST', icon: <Handshake size={14} />, color: 'bg-yellow-500', count: player.stats.assists },
    { type: ActionType.SHOT, label: 'TIRO', icon: <Target size={14} />, color: 'bg-rose-500', count: player.stats.shots },
    { type: ActionType.FOUL, label: 'FALTA', icon: <AlertTriangle size={14} />, color: 'bg-orange-500', count: player.stats.fouls },
    { type: ActionType.STEAL, label: 'RECUP.', icon: <Zap size={14} />, color: 'bg-purple-600', count: player.stats.steals },
    { type: ActionType.LOSS, label: 'PÉRD.', icon: <RefreshCw size={14} />, color: 'bg-red-500', count: player.stats.losses },
    { type: 'SWAP', label: 'CAMBIO', icon: <RotateCcw size={14} />, color: 'bg-amber-500', count: undefined },
  ];

  const goalkeeperActions = [
    { type: GoalieAction.SAVE_PARRY, label: 'PARADA', icon: <Handshake size={14} />, color: 'bg-blue-500', count: player.stats.saves },
    { type: GoalieAction.GOAL_CONCEDED, label: 'ENCAJADO', icon: '🥅', color: 'bg-red-600', count: player.stats.conceded },
    { type: ActionType.GOAL, label: 'GOL', icon: '⚽', color: 'bg-green-500', count: player.stats.goals },
    { type: ActionType.SHOT, label: 'TIRO', icon: <Target size={14} />, color: 'bg-rose-500', count: player.stats.shots },
    { type: ActionType.LOSS, label: 'PÉRD.', icon: <RefreshCw size={14} />, color: 'bg-red-500', count: player.stats.losses },
    { type: ActionType.STEAL, label: 'RECUP.', icon: <Zap size={14} />, color: 'bg-purple-600', count: player.stats.steals },
    { type: ActionType.FOUL, label: 'FALTA', icon: <AlertTriangle size={14} />, color: 'bg-orange-500', count: player.stats.fouls },
    { type: 'SWAP', label: 'CAMBIO', icon: <RotateCcw size={14} />, color: 'bg-amber-500', count: undefined },
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
        metadata: { 
          zone: zoneId 
        } 
      });
      onClose();
    }
  };

  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[300] bg-slate-950/90 backdrop-blur-[12px]"
      />
      <div className="fixed inset-0 z-[310] flex items-center justify-center pointer-events-none overflow-hidden">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="relative w-1 h-1 flex items-center justify-center"
          style={{ touchAction: 'none' }}
        >
          {selectingZone ? (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute bg-slate-900 border-2 border-white/20 p-6 rounded-[40px] shadow-2xl pointer-events-auto w-[88vw] max-w-[340px] flex flex-col items-center"
            >
              {selectionStep === 'shot' ? (
                <>
                  <div className="text-center mb-6">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-1">Punto de Lanzamiento</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase italic">¿Desde dónde han chutado?</span>
                  </div>
                  
                  <div className="relative aspect-[2/3] w-[180px] bg-slate-950 rounded-xl border-4 border-slate-800 overflow-hidden shadow-2xl mb-6">
                    {/* Pitch markings */}
                    <div className="absolute inset-0 pointer-events-none opacity-20">
                      <div className="absolute top-1/2 w-full h-[1px] bg-white -translate-y-1/2" />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 border border-white rounded-full" />
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-8 border-x border-b border-white rounded-b-2xl" />
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-8 border-x border-t border-white rounded-t-2xl" />
                    </div>

                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 p-1 gap-1">
                      {['A', 'B', 'C'].map(r => ['1', '2', '3'].map(c => {
                        const id = `${r}${c}`;
                        return (
                          <button 
                            key={id} 
                            onClick={() => handleShotZoneSelect(id)}
                            className="rounded-lg transition-all border border-white/5 bg-white/5 hover:bg-blue-600/40 hover:border-blue-400 flex items-center justify-center font-mono text-[9px] font-black uppercase text-slate-600 hover:text-white"
                          >
                            {id}
                          </button>
                        );
                      }))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-1">Destino en Portería</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase italic">¿Por dónde ha ido el balón?</span>
                  </div>
                  <div className="flex flex-col gap-4 w-full px-4">
                    <div className="grid grid-cols-3 grid-rows-3 gap-1 p-2 bg-black border-4 border-slate-700 rounded-lg aspect-[3/2] w-full shadow-xl">
                      {goalZones.map((zone, i) => (
                        <button
                          key={zone.id}
                          onClick={() => handleGoalZoneSelect(zone.id)}
                          className="rounded-sm transition-all border border-white/10 bg-white/5 hover:bg-blue-600/40 hover:border-blue-400"
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
              
              <div className="flex gap-2 w-full mt-6 px-4">
                <button 
                  onClick={() => {
                    if (selectionStep === 'goal') {
                      setSelectionStep('shot');
                    } else {
                      setSelectingZone(false);
                    }
                  }}
                  className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-slate-400 uppercase hover:bg-white/10 transition-all"
                >
                  {selectionStep === 'goal' ? 'Atrás' : 'Volver'}
                </button>
                <button 
                  onClick={() => setSelectingZone(false)}
                  className="flex-1 py-3 bg-red-600/10 border border-red-500/20 rounded-xl text-[10px] font-black text-red-500 uppercase hover:bg-red-600/20 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          ) : (
            <>
              {/* Central indicator - Improved visibility */}
              <div className="absolute w-20 h-20 rounded-full bg-slate-900 border-4 border-white shadow-[0_0_30px_rgba(255,255,255,0.2)] flex flex-col items-center justify-center z-10">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-black text-white">{player.number}</span>
                  {player.stats.yellowCards > 0 && (
                    <div className="w-2 h-3 bg-yellow-400 rounded-[1px] shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
                  )}
                </div>
                <span className="text-[8px] font-bold text-slate-400 font-mono uppercase truncate max-w-[64px]">{player.name.split(' ')[0]}</span>
                <span className="text-[7px] font-black text-cyan-400/80 mt-0.5">
                  {Math.floor(player.individualTimeSeconds / 60)}'
                </span>
              </div>

              {actions.map((action, i) => {
                const angle = (i / actions.length) * (2 * Math.PI) - (Math.PI / 2);
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                return (
                  <motion.div
                    key={action.label}
                    initial={{ opacity: 0, x: 0, y: 0 }}
                    animate={{ opacity: 1, x, y }}
                    className="absolute pointer-events-auto"
                  >
                    <motion.button
                      whileHover={{ scale: 1.15, filter: 'brightness(1.1)' }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (action.type === 'SWAP') {
                          onSwap(player.id);
                        } else if (action.type === GoalieAction.SAVE_PARRY || action.type === GoalieAction.GOAL_CONCEDED) {
                          setPendingActionType(action.type as GoalieAction);
                          setSelectionStep('shot');
                          setSelectingZone(true);
                        } else {
                          onAction(action.type as any, player.id);
                          onClose();
                        }
                      }}
                      className={`relative flex flex-col items-center justify-center w-16 h-16 rounded-full ${action.color} border-4 border-white shadow-[0_10px_25px_rgba(0,0,0,0.3)] text-white transition-all`}
                    >
                      <div className="text-lg shadow-sm">{action.icon}</div>
                      <span className="text-[8px] font-black mt-0.5 tracking-tighter uppercase">{action.label}</span>
                      
                      {action.count !== undefined && action.count > 0 && (
                        <div className="absolute -top-1 -right-1 bg-white text-slate-900 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg border border-slate-200">
                          {action.count}
                        </div>
                      )}
                    </motion.button>
                  </motion.div>
                );
              })}

              {/* Cards toggle at bottom - More prominent */}
              <div className="absolute flex gap-4 pointer-events-auto" style={{ top: "clamp(110px, 18vh, 145px)" }}>
                 <button 
                    onClick={() => { onAction(ActionType.YELLOW_CARD, player.id); onClose(); }}
                    className="w-10 h-14 bg-yellow-400 rounded-lg border-4 border-white shadow-2xl active:scale-95 transition-transform hover:scale-110"
                 />
                 <button 
                    onClick={() => { onAction(ActionType.RED_CARD, player.id); onClose(); }}
                    className="w-10 h-14 bg-red-600 rounded-lg border-4 border-white shadow-2xl active:scale-95 transition-transform hover:scale-110"
                 />
              </div>
            </>
          )}
        </motion.div>
      </div>
    </>
  );
};
