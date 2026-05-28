import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Wifi, WifiOff, Play, Pause, Rewind, FastForward,
  Target, Trophy, Zap, Shield, Save, Settings, X, ChevronRight,
  AlertTriangle, Activity, Camera, Check
} from 'lucide-react';
import {
  TrackingConfig, TrackingFrame, TacticalAlert, SavedPlay,
  TeamColor, TEAM_COLOR_LABELS, TEAM_COLOR_HEX, CalibrationPoint
} from '../types/tracking';

// ── PITCH DIMENSIONS ─────────────────────────────────────────────
const PITCH_W_M = 20; // metros ancho
const PITCH_H_M = 40; // metros largo

type Screen = 'config' | 'calibration' | 'tracking';
type ReplayState = { active: boolean; frameIdx: number; speed: 0.5 | 1 | 2 };

// ── FUTSAL PITCH CANVAS RENDERER ─────────────────────────────────
function drawPitch(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const scaleX = W / PITCH_W_M;
  const scaleY = H / PITCH_H_M;

  // Background
  ctx.fillStyle = '#1a6b9a';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 8);
  ctx.fill();

  // Stripes
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
    ctx.fillRect(0, i * (H / 6), W, H / 6);
  }

  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;

  // Boundary
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Center line
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();

  // Center circle (r=3m)
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 3 * scaleY, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Penalty areas (semicircle r=6m)
  const penR = 6 * scaleY;
  // Top
  ctx.save();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(W / 2, 0, penR, 0, Math.PI);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Bottom
  ctx.beginPath();
  ctx.arc(W / 2, H, penR, Math.PI, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Penalty spots
  const penY1 = 6 * scaleY;
  const penY2 = H - 6 * scaleY;
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(W / 2, penY1, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W / 2, penY2, 3, 0, Math.PI * 2); ctx.fill();

  // Second penalty spots (10m)
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.arc(W / 2, 10 * scaleY, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W / 2, H - 10 * scaleY, 2.5, 0, Math.PI * 2); ctx.fill();

  // Goals
  const gW = W * 0.38;
  const gX = (W - gW) / 2;
  const gH = 8;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.fillRect(gX, -gH, gW, gH);
  ctx.strokeRect(gX, -gH, gW, gH);
  ctx.fillRect(gX, H, gW, gH);
  ctx.strokeRect(gX, H, gW, gH);

  // Corner arcs
  const cR = scaleY * 0.8;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1.5;
  [[0, 0, 0, Math.PI / 2], [W, 0, Math.PI / 2, Math.PI],
   [0, H, -Math.PI / 2, 0], [W, H, Math.PI, 3 * Math.PI / 2]
  ].forEach(([cx, cy, a1, a2]) => {
    ctx.beginPath();
    ctx.arc(cx as number, cy as number, cR, a1 as number, a2 as number);
    ctx.stroke();
  });
}

function drawPlayers(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  frame: TrackingFrame, localColor: string, rivalColor: string,
  highlightIds: string[] = []
) {
  const scaleX = W / PITCH_W_M;
  const scaleY = H / PITCH_H_M;

  const drawPlayer = (p: any, color: string) => {
    const px = p.x_m * scaleX;
    const py = p.y_m * scaleY;
    const r = 10;
    const isHighlighted = highlightIds.includes(p.id);

    // Glow for highlighted
    if (isHighlighted) {
      ctx.shadowBlur = 16;
      ctx.shadowColor = color;
    }

    // Circle
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = isHighlighted ? 2.5 : 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Number
    if (p.numero) {
      ctx.fillStyle = 'white';
      ctx.font = 'bold 8px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.numero), px, py);
    }

    // Speed indicator
    if (p.velocidad_kmh && p.velocidad_kmh > 15) {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(px + r - 2, py - r + 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  frame.posiciones_render.local.forEach(p => drawPlayer(p, localColor));
  frame.posiciones_render.rival.forEach(p => drawPlayer(p, rivalColor));

  // Ball
  if (frame.posiciones_render.balon) {
    const bx = frame.posiciones_render.balon.x_m * scaleX;
    const by = frame.posiciones_render.balon.y_m * scaleY;
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ── ZONE LABELS ──────────────────────────────────────────────────
function drawZones(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const zones = [
    { label: 'Z1', y: H * 0.875 },
    { label: 'Z2', y: H * 0.625 },
    { label: 'Z3', y: H * 0.375 },
    { label: 'Z4', y: H * 0.125 },
  ];
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = 'bold 9px Inter';
  ctx.textAlign = 'left';
  zones.forEach(z => {
    ctx.fillText(z.label, 4, z.y);
  });
  // Zone dividers
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  [0.25, 0.5, 0.75].forEach(f => {
    ctx.beginPath();
    ctx.moveTo(0, H * f);
    ctx.lineTo(W, H * f);
    ctx.stroke();
  });
  ctx.setLineDash([]);
}

// ── MAIN COMPONENT ───────────────────────────────────────────────
export default function LiveTracking() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameBufferRef = useRef<TrackingFrame[]>([]);
  const animFrameRef = useRef<number>(0);

  const [screen, setScreen] = useState<Screen>('config');
  const [config, setConfig] = useState<TrackingConfig>({
    localColor: 'blue',
    rivalColor: 'red',
    calibrationPoints: [],
    wsUrl: 'ws://localhost:8000/ws/partido_en_vivo',
  });

  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [currentFrame, setCurrentFrame] = useState<TrackingFrame | null>(null);
  const [alerts, setAlerts] = useState<TacticalAlert[]>([]);
  const [sistema, setSistema] = useState<string>('—');
  const [savedPlays, setSavedPlays] = useState<SavedPlay[]>([]);
  const [showPlays, setShowPlays] = useState(false);

  const [replay, setReplay] = useState<ReplayState>({ active: false, frameIdx: 0, speed: 1 });
  const [replayPlay, setReplayPlay] = useState<SavedPlay | null>(null);
  const replayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calibration
  const [calibImgUrl, setCalibImgUrl] = useState<string | null>(null);
  const calibCanvasRef = useRef<HTMLCanvasElement>(null);
  const [calibPoints, setCalibPoints] = useState<CalibrationPoint[]>([]);
  const CALIB_LABELS = ['↖ Esquina superior izquierda', '↗ Esquina superior derecha',
                         '↘ Esquina inferior derecha', '↙ Esquina inferior izquierda'];

  // ── CANVAS RENDER ────────────────────────────────────────────
  const renderCanvas = useCallback((frame: TrackingFrame | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    drawPitch(ctx, W, H);
    drawZones(ctx, W, H);

    if (frame) {
      const highlightIds = alerts.flatMap(a => a.jugadores || []);
      drawPlayers(ctx, W, H, frame,
        TEAM_COLOR_HEX[config.localColor],
        TEAM_COLOR_HEX[config.rivalColor],
        highlightIds
      );
    }
  }, [config.localColor, config.rivalColor, alerts]);

  useEffect(() => {
    if (screen === 'tracking') {
      const frameToRender = replay.active && replayPlay
        ? replayPlay.frames[replay.frameIdx]
        : currentFrame;
      renderCanvas(frameToRender || null);
    }
  }, [screen, currentFrame, replay, replayPlay, renderCanvas]);

  // ── WEBSOCKET ────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    setWsStatus('connecting');

    try {
      const ws = new WebSocket(config.wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        // Send config
        ws.send(JSON.stringify({
          tipo: 'init',
          prompts_tacticos: {
            local: `players wearing ${config.localColor} shirts`,
            rival: `players wearing ${config.rivalColor} shirts`,
          },
          calibration_points: config.calibrationPoints,
        }));
      };

      ws.onmessage = (e) => {
        try {
          const frame: TrackingFrame = JSON.parse(e.data);
          setCurrentFrame(frame);

          // Buffer last 450 frames (~15s at 30fps)
          frameBufferRef.current.push(frame);
          if (frameBufferRef.current.length > 450) {
            frameBufferRef.current.shift();
          }

          // Update tactical info
          if (frame.alertas_tacticas?.length > 0) {
            setAlerts(prev => [...frame.alertas_tacticas, ...prev].slice(0, 10));
          }
          if (frame.sistema_detectado) {
            setSistema(frame.sistema_detectado);
          }
        } catch (err) {
          console.error('Frame parse error:', err);
        }
      };

      ws.onclose = () => setWsStatus('disconnected');
      ws.onerror = () => setWsStatus('disconnected');
    } catch (err) {
      setWsStatus('disconnected');
    }
  }, [config]);

  const disconnectWS = () => {
    wsRef.current?.close();
    setWsStatus('disconnected');
  };

  // ── COMMANDS ────────────────────────────────────────────────
  const sendCommand = (comando: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ comando_accion: comando }));
    }
    // Save locally regardless
    const play: SavedPlay = {
      id: `play-${Date.now()}`,
      timestamp: Date.now(),
      frames: [...frameBufferRef.current.slice(-150)], // last 5s
      evento: comando,
      sistema,
      alertas: alerts.slice(0, 5),
    };
    setSavedPlays(prev => [play, ...prev]);
  };

  // ── REPLAY ──────────────────────────────────────────────────
  const startReplay = (play: SavedPlay) => {
    setReplayPlay(play);
    setReplay({ active: true, frameIdx: 0, speed: 1 });
    setShowPlays(false);
  };

  useEffect(() => {
    if (!replay.active || !replayPlay) return;
    if (replayTimerRef.current) clearTimeout(replayTimerRef.current);

    const delay = (1000 / 30) / replay.speed; // 30fps / speed
    replayTimerRef.current = setTimeout(() => {
      setReplay(r => {
        if (r.frameIdx >= (replayPlay.frames.length - 1)) {
          return { ...r, active: false };
        }
        return { ...r, frameIdx: r.frameIdx + 1 };
      });
    }, delay);

    return () => { if (replayTimerRef.current) clearTimeout(replayTimerRef.current); };
  }, [replay.active, replay.frameIdx, replay.speed, replayPlay]);

  // ── CALIBRATION ─────────────────────────────────────────────
  const handleCalibTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (calibPoints.length >= 4) return;
    const canvas = calibCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const newPoints = [...calibPoints, { x, y }];
    setCalibPoints(newPoints);

    // Draw point on canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#a3e635';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(newPoints.length), x, y);
    }
  };

  const handleCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());

      setCalibImgUrl(canvas.toDataURL('image/jpeg'));
      setCalibPoints([]);

      // Draw image on calib canvas
      setTimeout(() => {
        const cc = calibCanvasRef.current;
        if (!cc) return;
        const ctx = cc.getContext('2d');
        if (!ctx) return;
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, cc.width, cc.height);
        img.src = canvas.toDataURL('image/jpeg');
      }, 100);
    } catch (err) {
      alert('No se pudo acceder a la cámara. Puedes saltarte la calibración y usar coordenadas manuales.');
    }
  };

  const finishCalibration = () => {
    setConfig(c => ({ ...c, calibrationPoints: calibPoints }));
    setScreen('tracking');
  };

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
    };
  }, []);

  // ════════════════════════════════════════════════════════════
  // ── SCREEN: CONFIG ──────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  if (screen === 'config') {
    return (
      <div className="flex flex-col bg-[#0A0B0E] text-slate-200 allow-scroll"
           style={{ height: 'var(--app-height, 100vh)', overflowY: 'auto' }}>
        <header className="shrink-0 border-b border-white/10 bg-[#0E1015]/95 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-white/10 rounded-xl text-slate-400">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-sm font-black text-white uppercase tracking-tight">
              TRACKING <span className="text-lime-400">EN VIVO</span>
            </h1>
            <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Configuración inicial</p>
          </div>
        </header>

        <div className="flex-1 p-4 space-y-6 pb-8">
          {/* Team colors */}
          {(['local', 'rival'] as const).map(team => (
            <div key={team} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                Color equipación — {team === 'local' ? 'Equipo Local' : 'Equipo Rival'}
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {(Object.entries(TEAM_COLOR_HEX) as [TeamColor, string][]).map(([color, hex]) => {
                  const selected = config[team === 'local' ? 'localColor' : 'rivalColor'] === color;
                  return (
                    <button key={color}
                      onClick={() => setConfig(c => ({
                        ...c,
                        [team === 'local' ? 'localColor' : 'rivalColor']: color,
                      }))}
                      className={`aspect-square rounded-xl border-2 flex items-center justify-center transition-all ${
                        selected ? 'border-white scale-110' : 'border-transparent hover:border-white/30'
                      }`}
                      style={{ backgroundColor: hex }}>
                      {selected && <Check size={14} className="text-white drop-shadow" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Seleccionado: <span className="font-black text-white">
                  {TEAM_COLOR_LABELS[config[team === 'local' ? 'localColor' : 'rivalColor']]}
                </span>
              </p>
            </div>
          ))}

          {/* WebSocket URL */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              URL del Servidor (WebSocket)
            </h3>
            <input
              value={config.wsUrl}
              onChange={e => setConfig(c => ({ ...c, wsUrl: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-lime-400 font-mono"
              placeholder="ws://tu-servidor:8000/ws/partido_en_vivo"
            />
            <p className="text-[9px] text-slate-600 mt-2">
              Introduce la URL del servidor Python con SAM 3 cuando esté disponible
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={() => setScreen('calibration')}
              className="w-full py-4 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/30 rounded-2xl text-sm font-black text-blue-300 flex items-center justify-center gap-3 active:scale-98 transition-all">
              <Camera size={18} />
              Calibrar Cámara (Recomendado)
            </button>
            <button
              onClick={() => setScreen('tracking')}
              className="w-full py-4 bg-lime-400 text-slate-900 rounded-2xl text-sm font-black flex items-center justify-center gap-3 active:scale-98 transition-all">
              <Activity size={18} />
              Ir al Tracking →
            </button>
            <p className="text-center text-[9px] text-slate-600">
              Sin calibración la posición en metros será aproximada
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // ── SCREEN: CALIBRATION ─────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  if (screen === 'calibration') {
    return (
      <div className="flex flex-col bg-[#0A0B0E] text-slate-200"
           style={{ height: 'var(--app-height, 100vh)' }}>
        <header className="shrink-0 border-b border-white/10 bg-[#0E1015]/95 backdrop-blur-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setScreen('config')} className="p-2 hover:bg-white/10 rounded-xl text-slate-400">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-sm font-black text-white uppercase">CALIBRACIÓN</h1>
              <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Toca las 4 esquinas de la pista</p>
            </div>
          </div>
          <button onClick={finishCalibration}
            className="px-3 py-2 bg-lime-400 text-slate-900 rounded-xl text-[10px] font-black uppercase">
            {calibPoints.length >= 4 ? 'Confirmar' : 'Saltar'}
          </button>
        </header>

        <div className="flex-1 flex flex-col p-4 gap-4">
          {/* Instruction */}
          <div className={`border rounded-xl p-3 text-center ${
            calibPoints.length >= 4
              ? 'bg-lime-400/10 border-lime-400/30'
              : 'bg-blue-500/10 border-blue-500/20'
          }`}>
            <p className="text-xs font-black text-white">
              {calibPoints.length >= 4
                ? '✅ 4 puntos marcados — pulsa Confirmar'
                : `${calibPoints.length}/4 — ${CALIB_LABELS[calibPoints.length] || ''}`
              }
            </p>
          </div>

          {/* Camera / Canvas */}
          <div className="flex-1 relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800">
            {!calibImgUrl ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <Camera size={40} className="text-slate-600" />
                <p className="text-sm text-slate-500 text-center px-4">
                  Haz una foto de la pista desde las gradas para calibrar
                </p>
                <button onClick={handleCameraCapture}
                  className="px-6 py-3 bg-blue-500 text-white rounded-xl font-black text-sm flex items-center gap-2">
                  <Camera size={16} /> Abrir Cámara
                </button>
                <button onClick={finishCalibration}
                  className="text-xs text-slate-600 underline">
                  Continuar sin calibrar
                </button>
              </div>
            ) : (
              <canvas
                ref={calibCanvasRef}
                width={600}
                height={400}
                className="w-full h-full touch-none"
                onPointerDown={handleCalibTap}
              />
            )}
          </div>

          {/* Points list */}
          {calibPoints.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {calibPoints.map((pt, i) => (
                <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-xl p-2 text-center">
                  <div className="text-[9px] text-slate-500 font-black uppercase mb-1">Punto {i + 1}</div>
                  <div className="text-[10px] text-lime-400 font-mono">
                    {Math.round(pt.x)}, {Math.round(pt.y)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // ── SCREEN: TRACKING ────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  const isConnected = wsStatus === 'connected';
  const replayFrame = replay.active && replayPlay ? replayPlay.frames[replay.frameIdx] : null;
  const displayFrame = replayFrame || currentFrame;

  return (
    <div className="flex flex-col bg-[#0A0B0E] text-slate-200"
         style={{ height: 'var(--app-height, 100vh)', overflow: 'hidden' }}>

      {/* ── HEADER ─────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/10 bg-[#0E1015]/95 backdrop-blur-xl px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/')} className="p-1.5 hover:bg-white/10 rounded-xl text-slate-400">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xs font-black text-white uppercase tracking-tight leading-none">
              TRACKING <span className="text-lime-400">EN VIVO</span>
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-lime-400 animate-pulse' :
                wsStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-slate-600'
              }`} />
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                {isConnected ? 'Conectado' : wsStatus === 'connecting' ? 'Conectando...' : 'Desconectado'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Sistema detectado */}
          <div className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg">
            <span className="text-[8px] font-black text-blue-400 uppercase">{sistema}</span>
          </div>

          {/* Connect/Disconnect */}
          <button
            onClick={isConnected ? disconnectWS : connectWS}
            className={`p-2 rounded-xl transition-all ${
              isConnected
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-lime-400/20 text-lime-400 border border-lime-400/30'
            }`}>
            {isConnected ? <WifiOff size={14} /> : <Wifi size={14} />}
          </button>

          {/* Settings */}
          <button onClick={() => setScreen('config')}
            className="p-2 bg-white/5 border border-white/10 rounded-xl text-slate-400">
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* ── CANVAS ─────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden" style={{ maxHeight: 'calc(var(--app-height, 100vh) - 200px)' }}>
        <canvas
          ref={canvasRef}
          width={300}
          height={480}
          className="w-full h-full"
          style={{ imageRendering: 'crisp-edges' }}
        />

        {/* Replay overlay */}
        {replay.active && replayPlay && (
          <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-sm rounded-xl p-2 border border-white/10">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-black text-amber-400 uppercase">
                REPLAY — {replayPlay.evento}
              </span>
              <button onClick={() => setReplay(r => ({ ...r, active: false }))}
                className="text-slate-500 hover:text-white">
                <X size={12} />
              </button>
            </div>
            {/* Progress */}
            <div className="h-1 bg-white/10 rounded-full mb-2">
              <div className="h-full bg-amber-400 rounded-full transition-all"
                style={{ width: `${(replay.frameIdx / (replayPlay.frames.length - 1)) * 100}%` }} />
            </div>
            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {([0.5, 1, 2] as const).map(s => (
                  <button key={s} onClick={() => setReplay(r => ({ ...r, speed: s }))}
                    className={`px-2 py-1 rounded text-[8px] font-black transition-all ${
                      replay.speed === s ? 'bg-amber-400 text-slate-900' : 'bg-white/5 text-slate-500'
                    }`}>
                    {s}×
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setReplay(r => ({ ...r, frameIdx: 0 }))}
                  className="p-1 bg-white/5 rounded text-slate-400">
                  <Rewind size={10} />
                </button>
                <button onClick={() => setReplay(r => ({ ...r, active: !r.active }))}
                  className="px-3 py-1 bg-amber-400 text-slate-900 rounded text-[8px] font-black flex items-center gap-1">
                  {replay.active ? <Pause size={10} /> : <Play size={10} />}
                  {replay.active ? 'Pausar' : 'Play'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* No signal */}
        {!isConnected && !replay.active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm gap-3">
            <WifiOff size={32} className="text-slate-600" />
            <p className="text-xs text-slate-500 text-center px-8">
              Conecta al servidor para ver el tracking en tiempo real
            </p>
            <button onClick={connectWS}
              className="px-4 py-2 bg-lime-400 text-slate-900 rounded-xl text-xs font-black">
              Conectar
            </button>
          </div>
        )}
      </div>

      {/* ── COMMAND BUTTONS ──────────────────────────────── */}
      <div className="shrink-0 border-t border-white/10 bg-[#0E1015]/95 px-2 py-2 space-y-2">
        {/* Event commands */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { cmd: 'GOL', icon: Trophy, color: 'text-lime-400 bg-lime-400/15 border-lime-400/25' },
            { cmd: 'TIRO_A_PUERTA', icon: Target, color: 'text-red-400 bg-red-400/15 border-red-400/25' },
            { cmd: 'RECUPERACION', icon: Zap, color: 'text-blue-400 bg-blue-400/15 border-blue-400/25' },
            { cmd: 'GUARDAR_JUGADA', icon: Save, color: 'text-amber-400 bg-amber-400/15 border-amber-400/25' },
          ].map(({ cmd, icon: Icon, color }) => (
            <button key={cmd} onClick={() => sendCommand(cmd)}
              className={`py-2.5 rounded-xl border flex flex-col items-center gap-1 ${color} transition-all active:scale-95`}>
              <Icon size={14} />
              <span className="text-[7px] font-black uppercase leading-none text-center">
                {cmd.replace(/_/g, ' ')}
              </span>
            </button>
          ))}
        </div>

        {/* Alerts + Replay */}
        <div className="flex gap-1.5">
          {/* Latest alert */}
          <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 overflow-hidden">
            {alerts[0] ? (
              <div>
                <span className="text-[8px] font-black text-purple-400 uppercase">{alerts[0].tipo_evento}</span>
                <p className="text-[9px] text-slate-400 truncate">{alerts[0].descripcion}</p>
              </div>
            ) : (
              <p className="text-[9px] text-slate-600 italic">Sin alertas tácticas</p>
            )}
          </div>

          {/* Saved plays */}
          <button onClick={() => setShowPlays(true)}
            className={`px-3 py-2 rounded-xl border text-[9px] font-black uppercase flex flex-col items-center gap-1 ${
              savedPlays.length > 0
                ? 'bg-amber-400/15 border-amber-400/25 text-amber-400'
                : 'bg-white/5 border-white/10 text-slate-600'
            }`}>
            <FastForward size={12} />
            <span>Jugadas</span>
            {savedPlays.length > 0 && (
              <span className="text-[7px] bg-amber-400 text-slate-900 rounded-full w-4 h-4 flex items-center justify-center font-black">
                {savedPlays.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── SAVED PLAYS MODAL ─────────────────────────────── */}
      <AnimatePresence>
        {showPlays && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowPlays(false)}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#0E1015] border-t border-white/10 rounded-t-3xl"
              style={{ maxHeight: '70vh' }}>
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-widest">
                  Jugadas Guardadas ({savedPlays.length})
                </h3>
                <button onClick={() => setShowPlays(false)} className="p-1 hover:bg-white/10 rounded-lg">
                  <X size={16} className="text-slate-400" />
                </button>
              </div>
              <div className="overflow-y-auto allow-scroll p-4 space-y-2" style={{ maxHeight: 'calc(70vh - 60px)' }}>
                {savedPlays.length === 0 ? (
                  <p className="text-center text-slate-600 text-sm py-8">
                    Guarda jugadas durante el partido pulsando los botones de evento
                  </p>
                ) : (
                  savedPlays.map(play => (
                    <div key={play.id}
                      className="border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black text-white">{play.evento.replace(/_/g, ' ')}</div>
                        <div className="text-[9px] text-slate-500">
                          {new Date(play.timestamp).toLocaleTimeString('es-ES')} · {play.frames.length} frames
                          {play.sistema && ` · ${play.sistema}`}
                        </div>
                      </div>
                      <button onClick={() => startReplay(play)}
                        className="px-3 py-2 bg-amber-400/20 border border-amber-400/30 rounded-lg text-amber-400 flex items-center gap-1.5 text-[9px] font-black">
                        <Play size={10} /> Replay
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
