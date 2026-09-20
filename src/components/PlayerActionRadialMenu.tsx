import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, Target, AlertTriangle, Zap, RefreshCw, Handshake, RotateCcw, X, PlayCircle
} from 'lucide-react';
import { ActionType, GoalieAction, Player, Role } from '../types/futsal';
import { ExitOutcome, EXIT_OUTCOME_LABEL } from '../utils/goalkeeperActions';
import { newSetPieceRestartMetadata } from '../utils/setPieceModel';

/** Botón que abre el selector de subtipo de parada. No es un tipo de evento. */
const SAVE_TYPE_PICKER = 'SAVE_TYPE_PICKER' as const;
import { FutsalPitch } from './field/FutsalPitch';
import { formatGoalZoneLabel } from '../utils/goalZones';

/**
 * Geometría del anillo. Pura y exportada para poder comprobarla por test: con
 * 11 botones de 64 px el anillo solapaba 12 px en escritorio y 20 px en móvil,
 * y el hermano superior se quedaba el toque.
 *
 * `button` es el diámetro del botón; la separación centro-centro debe ser
 * mayor o igual que él para que no haya solape.
 */
export function radialGeometry(count: number, button: number, maxDiameter: number) {
  if (count < 2) return { radius: 0, separation: Infinity, fits: true };
  const minRadius = button / (2 * Math.sin(Math.PI / count));
  const maxRadius = (maxDiameter - button) / 2;
  const radius = Math.min(maxRadius, Math.max(92, minRadius + 8));
  const separation = 2 * radius * Math.sin(Math.PI / count);
  return { radius, separation, fits: separation >= button };
}

/** Diámetro del botón del anillo. 56 px, por encima del mínimo táctil de 44. */
export const RADIAL_BUTTON_PX = 56;

/**
 * Altura de la navegación inferior de MatchTracker (`h-12`, solo en móvil).
 * Las barras flotantes se apoyan por encima de ella en vez de taparla.
 */
export const BOTTOM_NAV_PX = 48;

/**
 * Separación al borde inferior, con área segura.
 *
 * `env(safe-area-inset-bottom)` es lo que faltaba: en la PWA de iPhone el
 * indicador de inicio se come los últimos píxeles, y una barra a `bottom-4`
 * queda debajo de él. El valor de respaldo `0px` deja el comportamiento
 * intacto en navegadores que no lo definen.
 */
export const CARD_BAR_BOTTOM = `calc(0.75rem + ${BOTTOM_NAV_PX}px + env(safe-area-inset-bottom, 0px))`;

/** La barra del portero se apila encima de la de tarjetas, sin solaparla. */
export const GK_BAR_BOTTOM = `calc(0.75rem + ${BOTTOM_NAV_PX}px + 7rem + env(safe-area-inset-bottom, 0px))`;

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
  const [selectingExitOutcome, setSelectingExitOutcome] = React.useState(false);
  const [selectingSaveType, setSelectingSaveType] = React.useState(false);

  // Etiqueta en lenguaje natural: el usuario no debe leer G1-G9.
  const goalZones = Array.from({ length: 9 }).map((_, i) => {
    const id = `G${i + 1}`;
    return { id, label: formatGoalZoneLabel(id) ?? '' };
  });

  const playerActions = [
    { type: ActionType.GOAL,        label: 'GOL',    icon: '⚽',                         color: 'bg-green-500',  count: player.stats.goals },
    { type: ActionType.SHOT,        label: 'TIRO',   icon: <Target size={14} />,         color: 'bg-rose-500',   count: player.stats.shots },
    { type: ActionType.ASSIST,      label: 'ASIST',  icon: <Handshake size={14} />,      color: 'bg-yellow-500', count: player.stats.assists },
    { type: ActionType.FOUL,        label: 'FALTA',  icon: <AlertTriangle size={14} />,  color: 'bg-orange-500', count: player.stats.fouls },
    { type: ActionType.SET_PIECE,   label: 'J.FALTA', icon: <PlayCircle size={14} />,    color: 'bg-emerald-600', count: undefined },
    { type: ActionType.STEAL,       label: 'RECUP.', icon: <Zap size={14} />,            color: 'bg-purple-600', count: player.stats.steals },
    { type: ActionType.LOSS,        label: 'PÉRD.',  icon: <RefreshCw size={14} />,      color: 'bg-red-500',    count: player.stats.losses },
    { type: 'SWAP',                 label: 'CAMBIO', icon: <RotateCcw size={14} />,      color: 'bg-amber-500',  count: undefined },
  ];

  // El anillo del portero NO lleva "jugada de falta": ya tiene diez botones y
  // Fase 4 fijó ese número tras corregir un solapamiento. Una jugada de falta
  // ejecutada por el portero se registra desde el control de equipo, sin
  // ejecutor. Ampliar este anillo sería cambiar su arquitectura, y eso no
  // entra en esta fase.
  const goalkeeperActions = [
    // Taxonomía de Fase 4. SAVE_PARRY queda congelado y NO se emite nunca:
    // sus eventos históricos se capturaron bajo este mismo rótulo "PARADA",
    // así que su subtipo real es desconocido.
    { type: GoalieAction.SAVE,          label: 'PARADA',   icon: <Handshake size={14} />,     color: 'bg-blue-500',   count: player.stats.saves },
    { type: GoalieAction.EXIT,          label: 'SALIDA',   icon: <Target size={14} />,        color: 'bg-cyan-600',   count: player.stats.exits },
    // Un solo botón para los dos subtipos: mantiene PARADA y SALIDA a un
    // toque y evita un anillo de 11 botones, que solapaba.
    { type: SAVE_TYPE_PICKER,           label: 'TIPO PARADA', icon: <Zap size={14} />,        color: 'bg-indigo-500', count: undefined },
    { type: ActionType.GOAL,            label: 'GOL',      icon: '⚽',                        color: 'bg-green-500',  count: player.stats.goals },
    { type: ActionType.SHOT,            label: 'TIRO',     icon: <Target size={14} />,        color: 'bg-rose-500',   count: player.stats.shots },
    { type: ActionType.ASSIST,          label: 'ASIST',    icon: <Handshake size={14} />,     color: 'bg-yellow-500', count: player.stats.assists },
    { type: ActionType.LOSS,            label: 'PÉRD.',    icon: <RefreshCw size={14} />,     color: 'bg-red-500',    count: player.stats.losses },
    { type: ActionType.STEAL,           label: 'RECUP.',   icon: <Zap size={14} />,           color: 'bg-purple-600', count: player.stats.steals },
    { type: ActionType.FOUL,            label: 'FALTA',    icon: <AlertTriangle size={14} />, color: 'bg-orange-500', count: player.stats.fouls },
    { type: 'SWAP',                     label: 'CAMBIO',   icon: <RotateCcw size={14} />,     color: 'bg-amber-500',  count: undefined },
  ];

  const actions = isGoalkeeper ? goalkeeperActions : playerActions;
  // Ancho útil del panel: 88vw (máx. 384 por max-w-sm) menos el padding p-5.
  const panelWidth =
    typeof window !== "undefined" ? Math.min(window.innerWidth * 0.88, 384) : 384;
  const { radius } = radialGeometry(actions.length, RADIAL_BUTTON_PX, panelWidth - 40);
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
    } else if (actionType === SAVE_TYPE_PICKER) {
      setSelectingSaveType(true);
    } else if (actionType === GoalieAction.EXIT) {
      // La salida se resuelve por resultado; su ubicación se pide después y es
      // omitible, así que aquí no se abre ningún selector de zona.
      setSelectingExitOutcome(true);
    } else if (
      actionType === GoalieAction.SAVE ||
      actionType === GoalieAction.SAVE_CATCH ||
      actionType === GoalieAction.SAVE_DEFLECT
    ) {
      setPendingActionType(actionType);
      setSelectionStep('shot');
      setSelectingZone(true);
    } else if (actionType === ActionType.SET_PIECE) {
      // Jugada de falta: el botón ya dice qué es, así que se registra de un
      // toque. La ubicación la pide después MatchTracker y es omitible.
      onAction(actionType, player.id, { metadata: newSetPieceRestartMetadata() });
      onClose();
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
      {/* TIPO DE PARADA: los dos subtipos explícitos. PARADA genérica sigue
          siendo un botón directo del anillo, así que esto NO añade pasos al
          camino rápido. */}
      {selectingSaveType && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[88vw] max-w-sm z-[300] bg-[#0E1015] border border-white/10 rounded-3xl p-5 flex flex-col gap-4">
          <div className="w-full space-y-3">
            <h3 className="text-[12px] font-black uppercase tracking-widest text-indigo-400 text-center">
              🧤 Tipo de parada
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {([
                { type: GoalieAction.SAVE_CATCH, label: 'BLOCAJE', desc: 'Controla el balón' },
                { type: GoalieAction.SAVE_DEFLECT, label: 'DESPEJE', desc: 'Sigue en juego' },
              ] as const).map(opt => (
                <button
                  key={opt.type}
                  onClick={() => {
                    setSelectingSaveType(false);
                    setPendingActionType(opt.type);
                    setSelectionStep('shot');
                    setSelectingZone(true);
                  }}
                  className="py-4 px-2 rounded-2xl border-2 border-white/10 bg-white/5 hover:bg-indigo-500/25 flex flex-col items-center gap-1 transition-all active:scale-95"
                >
                  <span className="text-[11px] font-black uppercase text-white">{opt.label}</span>
                  <span className="text-[8px] text-slate-400 text-center leading-tight">{opt.desc}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setSelectingSaveType(false)}
              className="w-full py-2 text-[10px] font-black text-slate-500 uppercase"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* SALIDA: solo el resultado. La ubicación la ofrece MatchTracker
          después, y es omitible — nunca bloquea el registro. */}
      {selectingExitOutcome && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[88vw] max-w-sm z-[300] bg-[#0E1015] border border-white/10 rounded-3xl p-5 flex flex-col gap-4">
          <div className="w-full space-y-3">
            <h3 className="text-[12px] font-black uppercase tracking-widest text-cyan-400 text-center">
              🧤 Salida del portero
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(['success', 'fail'] as ExitOutcome[]).map(outcome => (
                <button
                  key={outcome}
                  onClick={() => {
                    setSelectingExitOutcome(false);
                    onAction(GoalieAction.EXIT, player.id, {
                      metadata: { isOpponent: player.isOpponent, exitOutcome: outcome },
                    });
                    onClose();
                  }}
                  className={`py-4 rounded-2xl border-2 border-white/10 bg-white/5 flex flex-col items-center gap-1 transition-all active:scale-95 ${
                    outcome === 'success' ? 'hover:bg-green-500/25' : 'hover:bg-red-500/25'
                  }`}
                >
                  <span className="text-lg">{outcome === 'success' ? '✔' : '✘'}</span>
                  <span className="text-[10px] font-black uppercase text-white">
                    {EXIT_OUTCOME_LABEL[outcome]}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setSelectingExitOutcome(false)}
              className="w-full py-2 text-[10px] font-black text-slate-500 uppercase"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

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
            /* ── ZONA DE TIRO: pista real de 12 zonas ──────────────────── */
            /* Misma pista y misma orientación que el selector principal: la
               portería propia siempre a la izquierda, desde la perspectiva de
               quien ejecuta. El toque devuelve el sector ya normalizado. */
            <FutsalPitch
              mode="zone12"
              theme="dark"
              onSelect={handleShotZoneSelect}
              selected={pendingShotZone ?? undefined}
              accent="#f59e0b"
              maxWidth={320}
            />
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
                    aria-label={zone.label}
                    title={zone.label}
                    className="rounded-md border border-white/10 bg-white/[0.03] flex items-center justify-center text-center leading-tight px-1 text-[8px] font-black uppercase text-slate-400 hover:bg-amber-500/30 hover:text-amber-300 hover:border-white/30 transition-all active:scale-95"
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

          {/* OUT eliminado: pendingActionType solo puede ser GoalieAction, esta rama era inalcanzable */}
          <button onClick={onClose} className="mt-3 w-full py-2 text-[10px] font-black text-slate-500 uppercase">Cancelar</button>
        </motion.div>
      )}

      {/* Main radial menu */}
      {!selectingZone && !selectingSubtype && !selectingExitOutcome && !selectingSaveType && (
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
                style={{ width: RADIAL_BUTTON_PX, height: RADIAL_BUTTON_PX }}
                className={`absolute flex flex-col items-center justify-center rounded-full ${action.color} border-4 border-white shadow-[0_10px_25px_rgba(0,0,0,0.3)] text-white transition-all -translate-x-1/2 -translate-y-1/2`}
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

      {/* TARJETAS — panel propio, no un botón más del anillo.

          POR QUÉ NO ESTÁN EN EL ANILLO
          Son sanción, no acción de juego, y meterlas entre los 18 botones
          invitaría a pulsarlas por error en medio de una secuencia rápida.

          POR QUÉ SE HA MOVIDO
          Estaba en `bottom-4`, sin área segura: en la PWA de iPhone la barra
          caía sobre el indicador de inicio y por debajo de la navegación
          inferior (h-12), así que en un partido real no se encontraba. Ahora
          se apoya sobre la navegación y respeta env(safe-area-inset-bottom).

          POR QUÉ LLEVA TÍTULO
          Dos botones sueltos al pie de la pantalla se leen como controles
          globales. Con el dorsal y el nombre delante queda claro a quién se
          le va a sacar la tarjeta. */}
      {!selectingZone && !selectingSubtype && !selectingExitOutcome && !selectingSaveType && (
        <motion.div
          key="card-buttons"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          style={{ bottom: CARD_BAR_BOTTOM }}
          className="fixed left-3 right-3 z-[280] rounded-3xl bg-[#0E1015]/95 border border-white/15 shadow-[0_10px_40px_rgba(0,0,0,0.7)] px-3 pt-2 pb-3"
        >
          <div className="flex items-center justify-center gap-2 pb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
              Tarjetas
            </span>
            <span className="text-[9px] font-black uppercase tracking-widest text-white truncate max-w-[55vw]">
              #{player.number} {player.name.split(' ')[0]}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); onAction(ActionType.YELLOW_CARD, player.id); onClose(); }}
              className="flex-1 min-h-[52px] py-4 rounded-2xl bg-yellow-600 border-2 border-white shadow-lg flex items-center justify-center gap-2 text-white active:scale-95 transition-all"
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
              className="flex-1 min-h-[52px] py-4 rounded-2xl bg-red-700 border-2 border-white shadow-lg flex items-center justify-center gap-2 text-white active:scale-95 transition-all"
            >
              <div className="w-3 h-4 bg-red-500 rounded-[1px] border border-red-900" />
              <span className="text-[11px] font-black uppercase tracking-tighter">Roja</span>
              {player.stats.redCards > 0 && (
                <span className="w-5 h-5 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center">
                  {player.stats.redCards}
                </span>
              )}
            </button>
          </div>
          {/* La segunda amarilla ya produce la roja y saca al jugador de
              pista (MatchTracker.handleAction). No hay que registrarla dos
              veces, y decirlo evita que alguien lo intente. */}
          {player.stats.yellowCards === 1 && player.stats.redCards === 0 && (
            <div className="pt-2 text-center text-[8px] font-black uppercase tracking-widest text-amber-400/80">
              Ya amonestado · la segunda amarilla expulsa automáticamente
            </div>
          )}
        </motion.div>
      )}

      {/* Goalkeeper stats bar */}
      {isGoalkeeper && !selectingZone && !selectingSubtype && !selectingExitOutcome && !selectingSaveType && (
        <motion.div
          key="gk-stats"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          style={{ bottom: GK_BAR_BOTTOM }}
          className="fixed left-4 right-4 z-[260] bg-[#0E1015]/90 border border-white/10 rounded-2xl px-4 py-3 flex justify-around"
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
