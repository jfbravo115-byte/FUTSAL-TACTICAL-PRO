import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import {
  ArrowLeft, Play, Pause, Trash2, Save, RotateCcw, Cpu,
  Users, Pencil, MousePointer, ChevronDown, BookOpen, X,
  Loader2, FastForward, Rewind, Plus
} from 'lucide-react';
import {
  TacticalPlay, TacticalPlayerMarker, TacticalPath, PathType,
  PlayType, PLAY_TYPE_LABELS, PLAY_TYPE_COLORS, PATH_TYPE_LABELS
} from '../types/tactical';

// ─── PITCH CONSTANTS ─────────────────────────────────────────────
const VW = 300;
const VH = 480;
const PITCH = {
  x: 10, y: 10, w: VW - 20, h: VH - 20,
  goalW: 46, goalD: 10,
  penaltyR: 60,
  centerR: 28,
};

const PLAYER_COLORS = {
  local: '#3b82f6',
  rival: '#ef4444',
  gk_local: '#f59e0b',
  gk_rival: '#f97316',
};

type Tool = 'select' | 'draw' | 'player_local' | 'player_rival' | 'erase';

function PitchSVG() {
  const { x, y, w, h } = PITCH;
  const cx = x + w / 2;
  const cy = y + h / 2;

  // Pista fútbol sala: 40m × 20m en vertical (h=largo, w=ancho)
  // Escala: 1m = h/40
  const m = h / 40;

  // Portería: 3m ancho
  const gW = w * 0.38;
  const gX = cx - gW / 2;
  const gD = 10;

  // Semicírculo área: radio 6m
  const penR = 6 * m;

  // Puntos de penalti
  const penY1 = y + 6 * m;
  const penY2 = y + h - 6 * m;
  const pen2Y1 = y + 10 * m;
  const pen2Y2 = y + h - 10 * m;

  // Círculo central: radio 3m
  const cR = 3 * m;

  // Arco esquina: 25cm
  const cArc = m * 1;

  return (
    <g>
      <defs>
        <clipPath id="pitchClip">
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>

      {/* Fondo azul pista */}
      <rect x={x} y={y} width={w} height={h} fill="#1a6b9a" rx={6} />

      {/* Degradado sutil */}
      <rect x={x} y={y} width={w} height={h / 2}
        fill="rgba(255,255,255,0.04)" rx={6} />

      {/* Límite */}
      <rect x={x} y={y} width={w} height={h}
        fill="none" stroke="white" strokeWidth={3} rx={6} />

      {/* Línea central */}
      <line x1={x} y1={cy} x2={x + w} y2={cy}
        stroke="white" strokeWidth={2} />

      {/* Círculo central */}
      <circle cx={cx} cy={cy} r={cR}
        fill="none" stroke="white" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={3} fill="white" />

      {/* Semicírculo área superior */}
      <path
        d={`M ${cx - penR} ${y} A ${penR} ${penR} 0 0 1 ${cx + penR} ${y}`}
        fill="rgba(255,255,255,0.07)" stroke="white" strokeWidth={2}
        clipPath="url(#pitchClip)" />

      {/* Semicírculo área inferior */}
      <path
        d={`M ${cx - penR} ${y + h} A ${penR} ${penR} 0 0 0 ${cx + penR} ${y + h}`}
        fill="rgba(255,255,255,0.07)" stroke="white" strokeWidth={2}
        clipPath="url(#pitchClip)" />

      {/* Punto penalti superior */}
      <circle cx={cx} cy={penY1} r={3} fill="white" />
      {/* Punto penalti inferior */}
      <circle cx={cx} cy={penY2} r={3} fill="white" />

      {/* 2º punto superior */}
      <circle cx={cx} cy={pen2Y1} r={2.5} fill="white" opacity={0.6} />
      {/* 2º punto inferior */}
      <circle cx={cx} cy={pen2Y2} r={2.5} fill="white" opacity={0.6} />

      {/* Arcos esquina */}
      <path d={`M ${x} ${y + cArc} A ${cArc} ${cArc} 0 0 1 ${x + cArc} ${y}`}
        fill="none" stroke="white" strokeWidth={1.5} />
      <path d={`M ${x + w} ${y + cArc} A ${cArc} ${cArc} 0 0 0 ${x + w - cArc} ${y}`}
        fill="none" stroke="white" strokeWidth={1.5} />
      <path d={`M ${x} ${y + h - cArc} A ${cArc} ${cArc} 0 0 0 ${x + cArc} ${y + h}`}
        fill="none" stroke="white" strokeWidth={1.5} />
      <path d={`M ${x + w} ${y + h - cArc} A ${cArc} ${cArc} 0 0 1 ${x + w - cArc} ${y + h}`}
        fill="none" stroke="white" strokeWidth={1.5} />

      {/* Portería superior */}
      <rect x={gX} y={y - gD} width={gW} height={gD}
        fill="rgba(0,0,0,0.4)" stroke="white" strokeWidth={2.5} />

      {/* Portería inferior */}
      <rect x={gX} y={y + h} width={gW} height={gD}
        fill="rgba(0,0,0,0.4)" stroke="white" strokeWidth={2.5} />
    </g>
  );
}
function arrowHead(points: { x: number; y: number }[], color: string, scale: number) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
  const size = 10 * scale;
  const p1 = { x: last.x - size * Math.cos(angle - 0.5), y: last.y - size * Math.sin(angle - 0.5) };
  const p2 = { x: last.x - size * Math.cos(angle + 0.5), y: last.y - size * Math.sin(angle + 0.5) };
  return <polygon points={`${last.x},${last.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill={color} />;
}

function denorm(v: number, dim: number, offset: number) {
  return offset + v * dim;
}
function norm(v: number, dim: number, offset: number) {
  return (v - offset) / dim;
}

interface ReplayState {
  playing: boolean;
  progress: number; // 0-1
  speed: number; // 1 = normal, 0.5 = slow, 2 = fast
}

export default function TacticalBoard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const svgRef = useRef<SVGSVGElement>(null);

  // ─── EDITOR STATE ───────────────────────────────────────────────
  const [tool, setTool] = useState<Tool>('draw');
  const [pathType, setPathType] = useState<PathType>('run');
  const [players, setPlayers] = useState<TacticalPlayerMarker[]>([]);
  const [paths, setPaths] = useState<TacticalPath[]>([]);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[] | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [playerCounter, setPlayerCounter] = useState({ local: 1, rival: 1 });

  // ─── PLAY METADATA ──────────────────────────────────────────────
  const [playName, setPlayName] = useState('');
  const [playType, setPlayType] = useState<PlayType>('attack_positional');
  const [notes, setNotes] = useState('');
  const [showMeta, setShowMeta] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  // ─── LIBRARY ────────────────────────────────────────────────────
  const [savedPlays, setSavedPlays] = useState<TacticalPlay[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  // ─── REPLAY ─────────────────────────────────────────────────────
  const [replay, setReplay] = useState<ReplayState>({ playing: false, progress: 0, speed: 1 });
  const replayRef = useRef<number | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [replayPlay, setReplayPlay] = useState<TacticalPlay | null>(null);

  // ─── AI ─────────────────────────────────────────────────────────
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [showAI, setShowAI] = useState(false);

  // ─── SAVING ─────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  // ── Pitch dimensions in SVG ──────────────────────────────────────
  const pw = PITCH.w;
  const ph = PITCH.h;
  const px = PITCH.x;
  const py = PITCH.y;

  const getSVGPoint = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = VW / rect.width;
    const scaleY = VH / rect.height;
    const svgX = (e.clientX - rect.left) * scaleX;
    const svgY = (e.clientY - rect.top) * scaleY;
    // Clamp to pitch
    const cx = Math.max(px, Math.min(px + pw, svgX));
    const cy = Math.max(py, Math.min(py + ph, svgY));
    return { x: norm(cx, pw, px), y: norm(cy, ph, py) };
  }, []);

  // ─── POINTER EVENTS ─────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getSVGPoint(e);
    if (!pt) return;

    if (tool === 'draw') {
      setCurrentPath([pt]);
    } else if (tool === 'player_local' || tool === 'player_rival') {
      const isOpponent = tool === 'player_rival';
      const key = isOpponent ? 'rival' : 'local';
      const num = playerCounter[key];
      setPlayers(prev => [...prev, {
        id: `p-${Date.now()}`,
        x: pt.x, y: pt.y,
        number: num,
        isOpponent,
        isGoalkeeper: num === 1,
      }]);
      setPlayerCounter(prev => ({ ...prev, [key]: prev[key] + 1 }));
    } else if (tool === 'erase') {
      // Erase nearby path
      setPaths(prev => prev.filter(path => {
        const hit = path.points.some(p =>
          Math.hypot(
            denorm(p.x, pw, px) - denorm(pt.x, pw, px),
            denorm(p.y, ph, py) - denorm(pt.y, ph, py)
          ) < 15
        );
        return !hit;
      }));
      // Erase nearby player
      setPlayers(prev => prev.filter(pl =>
        Math.hypot(
          denorm(pl.x, pw, px) - denorm(pt.x, pw, px),
          denorm(pl.y, ph, py) - denorm(pt.y, ph, py)
        ) > 16
      ));
    } else if (tool === 'select') {
      // Find nearby player
      const hit = players.find(pl =>
        Math.hypot(
          denorm(pl.x, pw, px) - denorm(pt.x, pw, px),
          denorm(pl.y, ph, py) - denorm(pt.y, ph, py)
        ) < 20
      );
      if (hit) {
        setSelectedPlayer(hit.id);
        setIsDragging(true);
      } else {
        setSelectedPlayer(null);
      }
    }
  }, [tool, players, playerCounter, getSVGPoint, px, py, pw, ph]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const pt = getSVGPoint(e);
    if (!pt) return;
    if (tool === 'draw' && currentPath) {
      setCurrentPath(prev => prev ? [...prev, pt] : [pt]);
    } else if (tool === 'select' && isDragging && selectedPlayer) {
      setPlayers(prev => prev.map(pl =>
        pl.id === selectedPlayer ? { ...pl, x: pt.x, y: pt.y } : pl
      ));
    }
  }, [tool, currentPath, isDragging, selectedPlayer, getSVGPoint]);

  const onPointerUp = useCallback(() => {
    if (tool === 'draw' && currentPath && currentPath.length > 1) {
      const pathColors: Record<PathType, string> = {
        run: '#ffffff',
        pass: '#60a5fa',
        shot: '#f87171',
        block: '#fbbf24',
      };
      setPaths(prev => [...prev, {
        id: `path-${Date.now()}`,
        points: currentPath,
        pathType,
        color: pathColors[pathType],
      }]);
    }
    setCurrentPath(null);
    setIsDragging(false);
  }, [tool, currentPath, pathType]);

  // ─── RENDER PATH ────────────────────────────────────────────────
  const renderPath = (path: TacticalPath, scale = 1, alpha = 1) => {
    if (path.points.length < 2) return null;
    const pts = path.points.map(p => ({
      x: denorm(p.x, pw, px),
      y: denorm(p.y, ph, py),
    }));
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const dash = path.pathType === 'pass' ? '8,4' :
                 path.pathType === 'block' ? '2,4' : undefined;
    return (
      <g key={path.id} opacity={alpha}>
        <path d={d} fill="none" stroke={path.color}
          strokeWidth={2.5 * scale} strokeDasharray={dash}
          strokeLinecap="round" strokeLinejoin="round" />
        {(path.pathType === 'run' || path.pathType === 'shot' || path.pathType === 'pass') &&
          arrowHead(pts, path.color, scale)}
      </g>
    );
  };

  // ─── REPLAY LOGIC ───────────────────────────────────────────────
  const startReplay = (play: TacticalPlay) => {
    setReplayPlay(play);
    setShowReplay(true);
    setReplay({ playing: false, progress: 0, speed: 1 });
  };

  useEffect(() => {
    if (!replay.playing) {
      if (replayRef.current) cancelAnimationFrame(replayRef.current);
      return;
    }
    const duration = 3000 / replay.speed;
    let start: number | null = null;
    const startProgress = replay.progress;

    const tick = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const delta = elapsed / duration;
      const newProgress = Math.min(1, startProgress + delta);
      setReplay(r => ({ ...r, progress: newProgress }));
      if (newProgress < 1) {
        replayRef.current = requestAnimationFrame(tick);
      } else {
        setReplay(r => ({ ...r, playing: false }));
      }
    };
    replayRef.current = requestAnimationFrame(tick);
    return () => { if (replayRef.current) cancelAnimationFrame(replayRef.current); };
  }, [replay.playing, replay.speed]);

  const getReplayPaths = (play: TacticalPlay) => {
    return play.paths.map(path => ({
      ...path,
      points: path.points.slice(0, Math.max(2, Math.floor(path.points.length * replay.progress))),
    }));
  };

  // ─── SAVE ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) return alert('Inicia sesión para guardar jugadas');
    if (paths.length === 0 && players.length === 0) return alert('Dibuja algo primero');
    setSaving(true);
    try {
      const play: Omit<TacticalPlay, 'id'> = {
        userId: user.uid,
        name: playName || `Jugada ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
        playType,
        players,
        paths,
        notes,
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'tactical_plays'), play);
      alert('✅ Jugada guardada');
    } catch (e) {
      console.error(e);
      alert('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // ─── LOAD LIBRARY ───────────────────────────────────────────────
  const loadLibrary = async () => {
    if (!user) return;
    setLoadingLibrary(true);
    try {
      const q = query(collection(db, 'tactical_plays'), orderBy('createdAt', 'desc'));
      const sn = await getDocs(q);
      setSavedPlays(sn.docs.map(d => ({ id: d.id, ...d.data() } as TacticalPlay)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLibrary(false);
    }
  };

  const loadPlay = (play: TacticalPlay) => {
    setPlayers(play.players);
    setPaths(play.paths);
    setPlayName(play.name);
    setPlayType(play.playType);
    setNotes(play.notes || '');
    setShowLibrary(false);
  };

  const deletePlay = async (id: string) => {
    await deleteDoc(doc(db, 'tactical_plays', id));
    setSavedPlays(prev => prev.filter(p => p.id !== id));
  };

  // ─── AI ANALYSIS ────────────────────────────────────────────────
  const analyzeWithAI = async () => {
    if (paths.length === 0 && players.length === 0) return alert('Dibuja una jugada primero');
    setAnalyzingAI(true);
    setShowAI(true);
    setAiAnalysis(null);
    try {
      const playData = {
        name: playName || 'Jugada sin nombre',
        type: PLAY_TYPE_LABELS[playType],
        players: players.map(p => ({
          number: p.number,
          team: p.isOpponent ? 'Rival' : 'Local',
          role: p.isGoalkeeper ? 'Portero' : 'Jugador',
          position: {
            zone: p.y < 0.33 ? 'Tercio Atacante' : p.y < 0.66 ? 'Tercio Medio' : 'Tercio Defensivo',
            side: p.x < 0.33 ? 'Izquierda' : p.x < 0.66 ? 'Centro' : 'Derecha',
          },
        })),
        movements: paths.map(path => ({
          type: PATH_TYPE_LABELS[path.pathType],
          from: {
            zone: path.points[0]?.y < 0.33 ? 'Tercio Atacante' : path.points[0]?.y < 0.66 ? 'Tercio Medio' : 'Tercio Defensivo',
            side: path.points[0]?.x < 0.33 ? 'Izquierda' : path.points[0]?.x < 0.66 ? 'Centro' : 'Derecha',
          },
          to: {
            zone: path.points[path.points.length - 1]?.y < 0.33 ? 'Tercio Atacante' : path.points[path.points.length - 1]?.y < 0.66 ? 'Tercio Medio' : 'Tercio Defensivo',
            side: path.points[path.points.length - 1]?.x < 0.33 ? 'Izquierda' : path.points[path.points.length - 1]?.x < 0.66 ? 'Centro' : 'Derecha',
          },
          distance: Math.round(Math.hypot(
            (path.points[path.points.length - 1]?.x - path.points[0]?.x) * 40,
            (path.points[path.points.length - 1]?.y - path.points[0]?.y) * 20
          ) * 10) / 10 + 'm (aprox)',
        })),
        notes,
      };

      const res = await fetch('/api/tactical-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchData: playData,
          prompt: `Analiza esta jugada táctica de fútbol sala dibujada por el entrenador y proporciona un análisis táctico detallado en español. La jugada es de tipo: ${PLAY_TYPE_LABELS[playType]}. Incluye: 1) Descripción del patrón de movimiento 2) Fortalezas tácticas 3) Vulnerabilidades y cómo el rival puede contrarrestarla 4) Variaciones recomendadas 5) Jugadores clave en esta jugada`,
        }),
      });
      const data = await res.json();
      setAiAnalysis(data.analysis || 'Error al analizar');
    } catch (e) {
      setAiAnalysis('Error al conectar con el análisis IA');
    } finally {
      setAnalyzingAI(false);
    }
  };

  // ─── CLEAR ──────────────────────────────────────────────────────
  const clearAll = () => {
    setPaths([]);
    setPlayers([]);
    setCurrentPath(null);
    setPlayerCounter({ local: 1, rival: 1 });
    setPlayName('');
    setNotes('');
  };

  const typeColor = PLAY_TYPE_COLORS[playType];

  return (
    <div className="flex flex-col bg-[#0A0B0E] text-slate-200"
         style={{ height: 'var(--app-height, 100vh)', overflow: 'hidden' }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/10 bg-[#0E1015]/95 backdrop-blur-xl px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/')}
            className="p-2 hover:bg-white/10 rounded-xl transition-all text-slate-400 hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-sm font-black text-white uppercase tracking-tight leading-none">
              PIZARRA <span className="text-lime-400">TÁCTICA</span>
            </h1>
            <button onClick={() => setShowTypeMenu(true)}
              className="flex items-center gap-1 mt-0.5">
              <span className="text-[9px] font-black uppercase tracking-widest"
                    style={{ color: typeColor }}>
                {PLAY_TYPE_LABELS[playType]}
              </span>
              <ChevronDown size={10} style={{ color: typeColor }} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => { loadLibrary(); setShowLibrary(true); }}
            className="p-2 hover:bg-white/10 rounded-xl transition-all text-slate-400 hover:text-white">
            <BookOpen size={16} />
          </button>
          <button onClick={clearAll}
            className="p-2 hover:bg-white/10 rounded-xl transition-all text-slate-400 hover:text-red-400">
            <RotateCcw size={16} />
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-lime-400 text-slate-900 rounded-xl text-[10px] font-black uppercase transition-all active:scale-95 disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Guardar
          </button>
        </div>
      </header>

      {/* ── CANVAS ─────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-[#0A0B0E]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          className="w-full h-full touch-none"
          style={{ maxHeight: '100%', maxWidth: '100%', cursor: tool === 'erase' ? 'crosshair' : 'default' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <PitchSVG />

          {/* Saved paths */}
          {paths.map(path => renderPath(path))}

          {/* Current drawing path */}
          {currentPath && currentPath.length > 1 && renderPath({
            id: 'current',
            points: currentPath,
            pathType,
            color: pathType === 'pass' ? '#60a5fa' : pathType === 'shot' ? '#f87171' : pathType === 'block' ? '#fbbf24' : '#ffffff',
          })}

          {/* Players */}
          {players.map(pl => {
            const sx = denorm(pl.x, pw, px);
            const sy = denorm(pl.y, ph, py);
            const color = pl.isGoalkeeper
              ? (pl.isOpponent ? PLAYER_COLORS.gk_rival : PLAYER_COLORS.gk_local)
              : (pl.isOpponent ? PLAYER_COLORS.rival : PLAYER_COLORS.local);
            const isSelected = selectedPlayer === pl.id;
            return (
              <g key={pl.id} transform={`translate(${sx},${sy})`}>
                {isSelected && <circle r={16} fill="white" opacity={0.3} />}
                <circle r={12} fill={color} stroke="white" strokeWidth={isSelected ? 2.5 : 1.5} />
                <text textAnchor="middle" dominantBaseline="central"
                  fill="white" fontSize={9} fontWeight="900"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {pl.number}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── TOOLBAR ────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/10 bg-[#0E1015]/95 backdrop-blur-xl px-2 py-2">
        {/* Tools row */}
        <div className="flex items-center gap-1.5 mb-2">
          {([
            { id: 'draw', icon: Pencil, label: 'Dibujar' },
            { id: 'select', icon: MousePointer, label: 'Mover' },
            { id: 'player_local', icon: null, label: 'Local' },
            { id: 'player_rival', icon: null, label: 'Rival' },
            { id: 'erase', icon: Trash2, label: 'Borrar' },
          ] as any[]).map(t => (
            <button key={t.id} onClick={() => setTool(t.id)}
              className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase transition-all flex flex-col items-center gap-0.5 ${
                tool === t.id
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'bg-white/5 text-slate-500 border border-white/5 hover:text-slate-300'
              }`}>
              {t.id === 'player_local' ? (
                <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center">
                  <span className="text-[7px] font-black text-white">{playerCounter.local}</span>
                </div>
              ) : t.id === 'player_rival' ? (
                <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-white flex items-center justify-center">
                  <span className="text-[7px] font-black text-white">{playerCounter.rival}</span>
                </div>
              ) : (
                <t.icon size={14} />
              )}
              {t.label}
            </button>
          ))}
        </div>

        {/* Path type row (only when draw mode) */}
        {tool === 'draw' && (
          <div className="flex gap-1.5 mb-2">
            {(Object.keys(PATH_TYPE_LABELS) as PathType[]).map(pt => {
              const colors: Record<PathType, string> = { run: '#ffffff', pass: '#60a5fa', shot: '#f87171', block: '#fbbf24' };
              return (
                <button key={pt} onClick={() => setPathType(pt)}
                  className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${
                    pathType === pt ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/5 text-slate-500'
                  }`}
                  style={{ color: pathType === pt ? colors[pt] : undefined }}>
                  {PATH_TYPE_LABELS[pt].split(' ')[0]}
                </button>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-1.5">
          <button onClick={() => setShowMeta(true)}
            className="flex-1 py-2 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase text-slate-400 hover:text-white transition-all flex items-center justify-center gap-1">
            <Plus size={11} /> Notas
          </button>
          <button onClick={analyzeWithAI} disabled={analyzingAI}
            className="flex-1 py-2 bg-gradient-to-r from-purple-600/30 to-blue-600/30 border border-purple-500/30 rounded-xl text-[9px] font-black uppercase text-purple-300 transition-all flex items-center justify-center gap-1 active:scale-95">
            <Cpu size={11} /> Analizar IA
          </button>
        </div>
      </div>

      {/* ── PLAY TYPE MENU ─────────────────────────────────────── */}
      <AnimatePresence>
        {showTypeMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowTypeMenu(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#0E1015] border-t border-white/10 rounded-t-3xl p-4">
              <div className="w-8 h-1 bg-white/20 rounded-full mx-auto mb-4" />
              <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3">Tipo de Jugada</h3>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto allow-scroll">
                {(Object.keys(PLAY_TYPE_LABELS) as PlayType[]).map(pt => (
                  <button key={pt} onClick={() => { setPlayType(pt); setShowTypeMenu(false); }}
                    className={`py-2.5 px-3 rounded-xl text-left transition-all border ${
                      playType === pt ? 'border-opacity-50' : 'border-white/5 bg-white/5'
                    }`}
                    style={playType === pt ? {
                      backgroundColor: `${PLAY_TYPE_COLORS[pt]}20`,
                      borderColor: `${PLAY_TYPE_COLORS[pt]}50`,
                    } : {}}>
                    <span className="text-[10px] font-black uppercase"
                      style={{ color: PLAY_TYPE_COLORS[pt] }}>
                      {PLAY_TYPE_LABELS[pt]}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── NOTES MODAL ────────────────────────────────────────── */}
      <AnimatePresence>
        {showMeta && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowMeta(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#0E1015] border-t border-white/10 rounded-t-3xl p-4">
              <div className="w-8 h-1 bg-white/20 rounded-full mx-auto mb-4" />
              <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3">Detalles de la Jugada</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Nombre</label>
                  <input value={playName} onChange={e => setPlayName(e.target.value)}
                    placeholder="Ej: Ataque por banda derecha..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-lime-400" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Notas tácticas</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Observaciones, variantes, puntos clave..."
                    rows={3}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-lime-400 resize-none" />
                </div>
                <button onClick={() => setShowMeta(false)}
                  className="w-full py-3 bg-lime-400 text-slate-900 rounded-xl font-black text-xs uppercase">
                  Guardar Notas
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── LIBRARY MODAL ──────────────────────────────────────── */}
      <AnimatePresence>
        {showLibrary && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowLibrary(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#0E1015] border-t border-white/10 rounded-t-3xl"
              style={{ maxHeight: '75vh' }}>
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-widest">Biblioteca de Jugadas</h3>
                <button onClick={() => setShowLibrary(false)} className="p-1 hover:bg-white/10 rounded-lg">
                  <X size={16} className="text-slate-400" />
                </button>
              </div>
              <div className="overflow-y-auto allow-scroll p-4 space-y-2" style={{ maxHeight: 'calc(75vh - 60px)' }}>
                {loadingLibrary ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-lime-400" size={24} />
                  </div>
                ) : savedPlays.length === 0 ? (
                  <div className="text-center py-8 text-slate-600 text-sm">No hay jugadas guardadas</div>
                ) : (
                  savedPlays.map(play => (
                    <div key={play.id}
                      className="border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm text-white truncate">{play.name}</div>
                        <div className="text-[9px] font-black uppercase mt-0.5"
                          style={{ color: PLAY_TYPE_COLORS[play.playType] }}>
                          {PLAY_TYPE_LABELS[play.playType]}
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => startReplay(play)}
                          className="p-2 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400">
                          <Play size={12} />
                        </button>
                        <button onClick={() => loadPlay(play)}
                          className="p-2 bg-lime-400/20 border border-lime-400/30 rounded-lg text-lime-400">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => play.id && deletePlay(play.id)}
                          className="p-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── REPLAY MODAL ───────────────────────────────────────── */}
      <AnimatePresence>
        {showReplay && replayPlay && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setShowReplay(false); if (replayRef.current) cancelAnimationFrame(replayRef.current); }}
              className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-[#0E1015] border border-white/10 rounded-3xl overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="font-black text-sm text-white">{replayPlay.name}</div>
                  <div className="text-[9px] font-black uppercase"
                    style={{ color: PLAY_TYPE_COLORS[replayPlay.playType] }}>
                    {PLAY_TYPE_LABELS[replayPlay.playType]}
                  </div>
                </div>
                <button onClick={() => setShowReplay(false)} className="p-1.5 hover:bg-white/10 rounded-lg">
                  <X size={16} className="text-slate-400" />
                </button>
              </div>

              {/* Replay canvas */}
              <div className="p-3 bg-black">
                <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full">
                  <PitchSVG />
                  {getReplayPaths(replayPlay).map(path => renderPath(path as TacticalPath, 1, 1))}
                  {replayPlay.players.map(pl => {
                    const sx = denorm(pl.x, pw, px);
                    const sy = denorm(pl.y, ph, py);
                    const color = pl.isGoalkeeper
                      ? (pl.isOpponent ? PLAYER_COLORS.gk_rival : PLAYER_COLORS.gk_local)
                      : (pl.isOpponent ? PLAYER_COLORS.rival : PLAYER_COLORS.local);
                    return (
                      <g key={pl.id} transform={`translate(${sx},${sy})`}>
                        <circle r={12} fill={color} stroke="white" strokeWidth={1.5} />
                        <text textAnchor="middle" dominantBaseline="central"
                          fill="white" fontSize={9} fontWeight="900">
                          {pl.number}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Replay controls */}
              <div className="px-4 py-3 border-t border-white/10">
                {/* Progress bar */}
                <div className="h-1.5 bg-white/10 rounded-full mb-3 overflow-hidden">
                  <div className="h-full bg-lime-400 rounded-full transition-all"
                    style={{ width: `${replay.progress * 100}%` }} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  {/* Speed */}
                  <div className="flex gap-1">
                    {[0.5, 1, 2].map(s => (
                      <button key={s} onClick={() => setReplay(r => ({ ...r, speed: s }))}
                        className={`px-2 py-1 rounded-lg text-[9px] font-black transition-all ${
                          replay.speed === s ? 'bg-lime-400 text-slate-900' : 'bg-white/5 text-slate-500'
                        }`}>
                        {s === 0.5 ? '0.5×' : s === 1 ? '1×' : '2×'}
                      </button>
                    ))}
                  </div>
                  {/* Play controls */}
                  <div className="flex gap-2">
                    <button onClick={() => setReplay(r => ({ ...r, progress: 0, playing: false }))}
                      className="p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all">
                      <Rewind size={14} />
                    </button>
                    <button onClick={() => setReplay(r => ({
                      ...r,
                      playing: !r.playing,
                      progress: r.progress >= 1 ? 0 : r.progress,
                    }))}
                      className="px-4 py-2 bg-lime-400 text-slate-900 rounded-xl font-black text-xs flex items-center gap-1.5 active:scale-95 transition-all">
                      {replay.playing ? <Pause size={14} /> : <Play size={14} />}
                      {replay.playing ? 'Pausar' : replay.progress >= 1 ? 'Repetir' : 'Reproducir'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── AI ANALYSIS MODAL ──────────────────────────────────── */}
      <AnimatePresence>
        {showAI && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !analyzingAI && setShowAI(false)}
              className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#0E1015] border-t border-white/10 rounded-t-3xl"
              style={{ maxHeight: '80vh' }}>
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-purple-500/20 rounded-lg">
                    <Cpu size={14} className="text-purple-400" />
                  </div>
                  <span className="text-xs font-black text-white uppercase tracking-widest">Análisis IA Táctica</span>
                </div>
                {!analyzingAI && (
                  <button onClick={() => setShowAI(false)} className="p-1 hover:bg-white/10 rounded-lg">
                    <X size={16} className="text-slate-400" />
                  </button>
                )}
              </div>
              <div className="overflow-y-auto allow-scroll p-4" style={{ maxHeight: 'calc(80vh - 60px)' }}>
                {analyzingAI ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 size={28} className="animate-spin text-purple-400" />
                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">
                      Analizando jugada...
                    </p>
                  </div>
                ) : aiAnalysis ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-headings:text-purple-400 prose-headings:font-black prose-strong:text-purple-300 prose-p:text-slate-300">
                    <Markdown>{aiAnalysis}</Markdown>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
