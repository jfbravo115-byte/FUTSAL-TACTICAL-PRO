import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Wifi, WifiOff, Play, Pause, Rewind, FastForward,
  Target, Trophy, Zap, Shield, Save, Settings, X, ChevronRight,
  AlertTriangle, Activity, Camera, CameraOff, Check, Eye, EyeOff
} from 'lucide-react';
import {
  TrackingConfig, TrackingFrame, TacticalAlert, SavedPlay,
  TeamColor, TEAM_COLOR_LABELS, TEAM_COLOR_HEX, CalibrationPoint
} from '../types/tracking';

const PITCH_W_M = 20;
const PITCH_H_M = 40;

type Screen = 'config' | 'calibration' | 'tracking';
type ReplayState = { active: boolean; frameIdx: number; speed: 0.5 | 1 | 2 };
type ViewMode = 'split' | 'pitch' | 'camera';

function drawPitch(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const scaleX = W / PITCH_W_M;
  const scaleY = H / PITCH_H_M;
  ctx.fillStyle = '#1a6b9a';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 8);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
    ctx.fillRect(0, i * (H / 6), W, H / 6);
  }
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 3 * scaleY, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2); ctx.fill();
  const penR = 6 * scaleY;
  ctx.save();
  ctx.rect(0, 0, W, H); ctx.clip();
  ctx.beginPath(); ctx.arc(W / 2, 0, penR, 0, Math.PI);
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
  ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H, penR, Math.PI, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill(); ctx.stroke();
  ctx.restore();
  const penY1 = 6 * scaleY, penY2 = H - 6 * scaleY;
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(W / 2, penY1, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W / 2, penY2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.arc(W / 2, 10 * scaleY, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W / 2, H - 10 * scaleY, 2.5, 0, Math.PI * 2); ctx.fill();
  const gW = W * 0.38, gX = (W - gW) / 2, gH = 8;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
  ctx.fillRect(gX, -gH, gW, gH); ctx.strokeRect(gX, -gH, gW, gH);
  ctx.fillRect(gX, H, gW, gH); ctx.strokeRect(gX, H, gW, gH);
  const cR = scaleY * 0.8;
  ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5;
  [[0,0,0,Math.PI/2],[W,0,Math.PI/2,Math.PI],[0,H,-Math.PI/2,0],[W,H,Math.PI,3*Math.PI/2]].forEach(([cx,cy,a1,a2]) => {
    ctx.beginPath(); ctx.arc(cx as number, cy as number, cR, a1 as number, a2 as number); ctx.stroke();
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
    const px = p.x_m * scaleX, py = p.y_m * scaleY, r = 10;
    const isHighlighted = highlightIds.includes(p.id);
    if (isHighlighted) { ctx.shadowBlur = 16; ctx.shadowColor = color; }
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = 'white'; ctx.lineWidth = isHighlighted ? 2.5 : 1.5; ctx.stroke();
    ctx.shadowBlur = 0;
    if (p.numero) {
      ctx.fillStyle = 'white'; ctx.font = 'bold 8px Inter';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(p.numero), px, py);
    }
    if (p.velocidad_kmh && p.velocidad_kmh > 15) {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.arc(px + r - 2, py - r + 2, 3, 0, Math.PI * 2); ctx.fill();
    }
  };
  frame.posiciones_render.local.forEach(p => drawPlayer(p, localColor));
  frame.posiciones_render.rival.forEach(p => drawPlayer(p, rivalColor));
  if (frame.posiciones_render.balon) {
    const bx = frame.posiciones_render.balon.x_m * scaleX;
    const by = frame.posiciones_render.balon.y_m * scaleY;
    ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc'; ctx.fill();
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

function drawZones(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const zones = [
    { label: 'Z1', y: H * 0.875 }, { label: 'Z2', y: H * 0.625 },
    { label: 'Z3', y: H * 0.375 }, { label: 'Z4', y: H * 0.125 },
  ];
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = 'bold 9px Inter'; ctx.textAlign = 'left';
  zones.forEach(z => ctx.fillText(z.label, 4, z.y));
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  [0.25, 0.5, 0.75].forEach(f => {
    ctx.beginPath(); ctx.moveTo(0, H * f); ctx.lineTo(W, H * f); ctx.stroke();
  });
  ctx.setLineDash([]);
}

export default function LiveTracking() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameBufferRef = useRef<TrackingFrame[]>([]);

  const [screen, setScreen] = useState<Screen>('config');
  const [config, setConfig] = useState<TrackingConfig>({
    localColor: 'blue',
    rivalColor: 'red',
    calibrationPoints: [],
    wsUrl: 'wss://tu-servidor.trycloudflare.com',
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const cameraIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMode, setCameraMode] = useState<'simulation' | 'camera'>('simulation');
  const [fps, setFps] = useState(0);
  const fpsCounterRef = useRef(0);
  const fpsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const calibCanvasRef = useRef<HTMLCanvasElement>(null);
  const [calibPoints, setCalibPoints] = useState<CalibrationPoint[]>([]);
  const [calibImgUrl, setCalibImgUrl] = useState<string>('');
  const CALIB_LABELS = ['↖ Esquina superior izquierda', '↗ Esquina superior derecha',
                        '↘ Esquina inferior derecha', '↙ Esquina inferior izquierda'];

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [cameraFrameSrc, setCameraFrameSrc] = useState<string>('');
  const [liveBoxes, setLiveBoxes] = useState<any[]>([]);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayVideoRef = useRef<HTMLVideoElement>(null);
  const interpFrameRef = useRef<{ from: TrackingFrame | null; to: TrackingFrame | null; startTs: number; duration: number }>({ from: null, to: null, startTs: 0, duration: 250 });
  const rafRef = useRef<number>(0);
  const cameraImgRef = useRef<HTMLImageElement>(null);

  // ── CANVAS RENDER ────────────────────────────────────────────────────────
  const renderCanvas = useCallback((frame: TrackingFrame | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ajusta tamaño del canvas al contenedor (solo cuando cambia)
    const parent = canvas.parentElement;
    if (parent) {
      const w = parent.clientWidth, h = parent.clientHeight;
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w; canvas.height = h;
      }
    }

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    drawPitch(ctx, W, H);
    drawZones(ctx, W, H);
    if (frame) {
      const highlightIds = alerts.flatMap(a => a.jugadores || []);
      drawPlayers(ctx, W, H, frame, TEAM_COLOR_HEX[config.localColor], TEAM_COLOR_HEX[config.rivalColor], highlightIds);
    }
  }, [config.localColor, config.rivalColor, alerts]);

  // Interpola posiciones entre el frame anterior y el nuevo para movimiento suave
  const interpolatePlayers = (from: TrackingFrame | null, to: TrackingFrame, t: number): TrackingFrame => {
    if (!from) return to;
    const lerp = (a: number, b: number) => a + (b - a) * t;
    const interpList = (fromList: any[], toList: any[]) =>
      toList.map(tp => {
        const fp = fromList.find(f => f.id === tp.id);
        if (!fp) return tp;
        return { ...tp, x_m: lerp(fp.x_m, tp.x_m), y_m: lerp(fp.y_m, tp.y_m) };
      });
    return {
      ...to,
      posiciones_render: {
        local: interpList(from.posiciones_render?.local || [], to.posiciones_render?.local || []),
        rival: interpList(from.posiciones_render?.rival || [], to.posiciones_render?.rival || []),
        balon: to.posiciones_render?.balon || null,
      },
    };
  };

  // Cuando llega un frame nuevo, arranca una interpolación desde la posición actual
  useEffect(() => {
    if (screen !== 'tracking' || replay.active) return;
    if (!currentFrame) return;
    const prevTarget = interpFrameRef.current.to;
    interpFrameRef.current = { from: prevTarget, to: currentFrame, startTs: performance.now(), duration: 220 };
  }, [currentFrame, screen, replay.active]);

  // Loop de animación: ÚNICA fuente de dibujo del canvas de pista. Interpola y
  // dibuja a 60fps independientemente de cuándo llegan los datos del servidor.
  useEffect(() => {
    if (screen !== 'tracking') return;

    const tick = () => {
      if (replay.active && replayPlay) {
        renderCanvas(replayPlay.frames[replay.frameIdx] || null);
      } else {
        const { from, to, startTs, duration } = interpFrameRef.current;
        if (to) {
          const elapsed = performance.now() - startTs;
          const t = Math.min(1, elapsed / duration);
          renderCanvas(interpolatePlayers(from, to, t));
        } else {
          renderCanvas(null);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [screen, replay.active, replayPlay, replay.frameIdx, renderCanvas]);

  // ── WEBSOCKET ────────────────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    setWsStatus('connecting');
    try {
      const ws = new WebSocket(config.wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        setWsStatus('connected');
        ws.send(JSON.stringify({
          tipo: 'init',
          local_color: config.localColor,
          rival_color: config.rivalColor,
          prompts_tacticos: {
            local: `players wearing ${config.localColor} shirts`,
            rival: `players wearing ${config.rivalColor} shirts`,
          },
          calibration_points: config.calibrationPoints,
        }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          if (msg.tipo === 'frame_anotado' && msg.imagen) {
            setCameraFrameSrc(`data:image/jpeg;base64,${msg.imagen}`);
            return;
          }

          if (msg.tipo !== 'frame' || !msg.posiciones_render) return;

          if (msg.imagen) {
            setCameraFrameSrc(`data:image/jpeg;base64,${msg.imagen}`);
          }
          if (msg.boxes) {
            setLiveBoxes(msg.boxes);
          }
          const frame: TrackingFrame = msg;
          setCurrentFrame(frame);
          frameBufferRef.current.push(frame);
          if (frameBufferRef.current.length > 450) frameBufferRef.current.shift();
          if (frame.alertas_tacticas?.length > 0) {
            setAlerts(prev => [...frame.alertas_tacticas, ...prev].slice(0, 10));
          }
          if (frame.sistema_detectado) setSistema(frame.sistema_detectado);
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

  // ── CAMERA STREAMING ─────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        setCameraMode('camera');
        startFrameCapture();
      }
    } catch (err) {
      alert('No se pudo acceder a la cámara. Usando modo simulación.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    if (cameraIntervalRef.current) clearInterval(cameraIntervalRef.current);
    if (fpsTimerRef.current) clearInterval(fpsTimerRef.current);
    setCameraActive(false);
    setCameraMode('simulation');
  };

  const startFrameCapture = () => {
    if (cameraIntervalRef.current) clearInterval(cameraIntervalRef.current);
    fpsTimerRef.current = setInterval(() => {
      setFps(fpsCounterRef.current);
      fpsCounterRef.current = 0;
    }, 1000);
    cameraIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const captureCanvas = captureCanvasRef.current;
      const ws = wsRef.current;
      if (!video || !captureCanvas || !ws || ws.readyState !== WebSocket.OPEN) return;
      if (video.readyState < 2) return;
      const W = 480, H = 360;
      captureCanvas.width = W; captureCanvas.height = H;
      const ctx = captureCanvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, W, H);
      const b64 = captureCanvas.toDataURL('image/jpeg', 0.7).split(',')[1];
      ws.send(JSON.stringify({ tipo: 'frame_video', imagen: b64, width: W, height: H, timestamp: Date.now() }));
      fpsCounterRef.current++;
    }, 250);
  };

  // Sincroniza el video visible con el stream del video oculto (fuente real)
  useEffect(() => {
    if (cameraActive && videoRef.current?.srcObject && displayVideoRef.current) {
      displayVideoRef.current.srcObject = videoRef.current.srcObject;
      displayVideoRef.current.play().catch(() => {});
    }
  }, [cameraActive, viewMode]);

  // Dibuja los cajones de tracking sobre el canvas overlay transparente
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const video = displayVideoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const displayW = video.clientWidth;
    const displayH = video.clientHeight;
    if (canvas.width !== displayW || canvas.height !== displayH) {
      canvas.width = displayW;
      canvas.height = displayH;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const TEAM_HEX: Record<string, string> = {
      local: TEAM_COLOR_HEX[config.localColor],
      rival: TEAM_COLOR_HEX[config.rivalColor],
      desconocido: '#999999',
    };

    liveBoxes.forEach((b: any) => {
      const scaleX = displayW / (b.frame_w || 640);
      const scaleY = displayH / (b.frame_h || 480);
      const x1 = b.x1 * scaleX, y1 = b.y1 * scaleY;
      const x2 = b.x2 * scaleX, y2 = b.y2 * scaleY;
      const color = TEAM_HEX[b.team] || '#999999';

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      const label = `#${b.id} ${(b.team || '?').slice(0,3).toUpperCase()}`;
      ctx.font = 'bold 11px Inter';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(x1, y1 - 16, tw + 6, 16);
      ctx.fillStyle = 'white';
      ctx.fillText(label, x1 + 3, y1 - 4);
    });
  }, [liveBoxes, config.localColor, config.rivalColor]);

  useEffect(() => { return () => { stopCamera(); }; }, []);

  const sendCommand = (comando: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ comando_accion: comando }));
    }
    const play: SavedPlay = {
      id: `play-${Date.now()}`,
      timestamp: Date.now(),
      frames: [...frameBufferRef.current.slice(-150)],
      evento: comando,
      sistema,
      alertas: alerts.slice(0, 5),
    };
    setSavedPlays(prev => [play, ...prev]);
  };

  // ── REPLAY ───────────────────────────────────────────────────────────────
  const startReplay = (play: SavedPlay) => {
    setReplayPlay(play);
    setReplay({ active: true, frameIdx: 0, speed: 1 });
    setShowPlays(false);
  };

  useEffect(() => {
    if (!replay.active || !replayPlay) return;
    if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
    const delay = (1000 / 30) / replay.speed;
    replayTimerRef.current = setTimeout(() => {
      setReplay(r => {
        if (r.frameIdx >= (replayPlay.frames.length - 1)) return { ...r, active: false };
        return { ...r, frameIdx: r.frameIdx + 1 };
      });
    }, delay);
    return () => { if (replayTimerRef.current) clearTimeout(replayTimerRef.current); };
  }, [replay.active, replay.frameIdx, replay.speed, replayPlay]);

  // ── CALIBRATION ──────────────────────────────────────────────────────────
  const handleCalibTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (calibPoints.length >= 4) return;
    const canvas = calibCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const newPoints = [...calibPoints, { x, y }];
    setCalibPoints(newPoints);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#a3e635';
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'white'; ctx.font = 'bold 10px Inter';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      setCalibImgUrl(canvas.toDataURL('image/jpeg'));
      setCalibPoints([]);
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
      alert('No se pudo acceder a la cámara.');
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

  const isConnected = wsStatus === 'connected';

  // ════════════════════════════════════════════════════════════
  // ── SCREEN: CONFIG ──────────────────────────────────────════
  // ════════════════════════════════════════════════════════════
  if (screen === 'config') {
    return (
      <div className="flex flex-col bg-[#0A0B0E] text-slate-200 allow-scroll"
           style={{ height: 'var(--app-height, 100vh)', overflowY: 'auto' }}>
        <header className="shrink-0 border-b border-white/10 bg-[#0E1015]/95 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/match')} className="p-2 hover:bg-white/10 rounded-xl text-slate-400">
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
                      onClick={() => setConfig(c => ({ ...c, [team === 'local' ? 'localColor' : 'rivalColor']: color }))}
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

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              URL del Servidor (WebSocket)
            </h3>
            <input
              value={config.wsUrl}
              onChange={e => setConfig(c => ({ ...c, wsUrl: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-lime-400 font-mono"
              placeholder="wss://xxxx.trycloudflare.com"
            />
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              Modo de Visualización
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {([
                { mode: 'split', label: 'Pantalla dividida', desc: 'Cámara + Pista' },
                { mode: 'pitch', label: 'Solo pista', desc: 'Vista táctica' },
                { mode: 'camera', label: 'Solo cámara', desc: 'Vista real' },
              ] as { mode: ViewMode; label: string; desc: string }[]).map(({ mode, label, desc }) => (
                <button key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    viewMode === mode
                      ? 'bg-lime-400/20 border-lime-400/40 text-lime-400'
                      : 'bg-slate-950 border-slate-700 text-slate-400'
                  }`}>
                  <span className="text-[10px] font-black uppercase text-center leading-tight">{label}</span>
                  <span className="text-[8px] text-slate-500">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <button onClick={() => setScreen('calibration')}
              className="w-full py-4 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/30 rounded-2xl text-sm font-black text-blue-300 flex items-center justify-center gap-3 active:scale-95 transition-all">
              <Camera size={18} /> Calibrar Cámara (Recomendado)
            </button>
            <button onClick={() => { setScreen('tracking'); connectWS(); }}
              className="w-full py-4 bg-lime-400 text-slate-900 rounded-2xl text-sm font-black flex items-center justify-center gap-3 active:scale-95 transition-all">
              <Activity size={18} /> Ir al Tracking →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // ── SCREEN: CALIBRATION ─────────────────────────────════════
  // ════════════════════════════════════════════════════════════
  if (screen === 'calibration') {
    return (
      <div className="flex flex-col bg-[#0A0B0E] text-slate-200" style={{ height: 'var(--app-height, 100vh)' }}>
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
          <div className={`border rounded-xl p-3 text-center ${calibPoints.length >= 4 ? 'bg-lime-400/10 border-lime-400/30' : 'bg-blue-500/10 border-blue-500/20'}`}>
            <p className="text-xs font-black text-white">
              {calibPoints.length >= 4 ? '✅ 4 puntos marcados — pulsa Confirmar' : `${calibPoints.length}/4 — ${CALIB_LABELS[calibPoints.length] || ''}`}
            </p>
          </div>
          <div className="flex-1 relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800">
            {!calibImgUrl ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <Camera size={40} className="text-slate-600" />
                <p className="text-sm text-slate-500 text-center px-4">Haz una foto de la pista desde las gradas</p>
                <button onClick={handleCameraCapture}
                  className="px-6 py-3 bg-blue-500 text-white rounded-xl font-black text-sm flex items-center gap-2">
                  <Camera size={16} /> Abrir Cámara
                </button>
                <button onClick={finishCalibration} className="text-xs text-slate-600 underline">Continuar sin calibrar</button>
              </div>
            ) : (
              <canvas ref={calibCanvasRef} width={600} height={400} className="w-full h-full touch-none" onPointerDown={handleCalibTap} />
            )}
          </div>
          {calibPoints.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {calibPoints.map((pt, i) => (
                <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-xl p-2 text-center">
                  <div className="text-[9px] text-slate-500 font-black uppercase mb-1">Punto {i + 1}</div>
                  <div className="text-[10px] text-lime-400 font-mono">{Math.round(pt.x)}, {Math.round(pt.y)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // ── SCREEN: TRACKING ────────────────────────────────════════
  // ════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col bg-[#0A0B0E] text-slate-200"
         style={{ height: 'var(--app-height, 100vh)', overflow: 'hidden' }}>

      {/* ── HEADER ─────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/10 bg-[#0E1015]/95 backdrop-blur-xl px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/match')} className="p-1.5 hover:bg-white/10 rounded-xl text-slate-400">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xs font-black text-white uppercase tracking-tight leading-none">
              TRACKING <span className="text-lime-400">EN VIVO</span>
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-lime-400 animate-pulse' : wsStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-slate-600'}`} />
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                {isConnected ? 'Conectado' : wsStatus === 'connecting' ? 'Conectando...' : 'Desconectado'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg">
            <span className="text-[8px] font-black text-blue-400 uppercase">{sistema}</span>
          </div>
          {cameraActive && (
            <div className="px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-lg">
              <span className="text-[8px] font-black text-green-400 uppercase">{fps}fps</span>
            </div>
          )}

          <button
            onClick={() => setViewMode(v => v === 'split' ? 'pitch' : v === 'pitch' ? 'camera' : 'split')}
            className="p-2 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-lime-400 transition-all"
            title={viewMode === 'split' ? 'Vista dividida' : viewMode === 'pitch' ? 'Solo pista' : 'Solo cámara'}>
            <Eye size={14} />
          </button>

          <button
            onClick={cameraActive ? stopCamera : startCamera}
            disabled={!isConnected}
            className={`p-2 rounded-xl transition-all ${cameraActive ? 'bg-green-500/20 text-green-400 border border-green-500/30 animate-pulse' : isConnected ? 'bg-white/5 text-slate-400 border border-white/10' : 'bg-white/5 text-slate-600 border border-white/5 opacity-50 cursor-not-allowed'}`}>
            {cameraActive ? <CameraOff size={14} /> : <Camera size={14} />}
          </button>
          <button onClick={isConnected ? disconnectWS : connectWS}
            className={`p-2 rounded-xl transition-all ${isConnected ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-lime-400/20 text-lime-400 border border-lime-400/30'}`}>
            {isConnected ? <WifiOff size={14} /> : <Wifi size={14} />}
          </button>
          <button onClick={() => setScreen('config')} className="p-2 bg-white/5 border border-white/10 rounded-xl text-slate-400">
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* Video oculto: fuente de verdad para captura de frames */}
      <video ref={videoRef} playsInline muted className="hidden" />
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* ── ZONA PRINCIPAL DE VISUALIZACIÓN ─────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(var(--app-height, 100vh) - 200px)' }}>

        {/* ── MODO SPLIT: cámara arriba, pista abajo ── */}
        {viewMode === 'split' && (
          <>
            <div className="flex-1 relative bg-black border-b border-white/10 overflow-hidden">
              {cameraActive ? (
                <div className="relative w-full h-full">
                  <video ref={displayVideoRef} playsInline muted autoPlay
                    className="w-full h-full object-contain" />
                  <canvas ref={overlayCanvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none" />
                </div>
              ) : cameraFrameSrc ? (
                <img
                  ref={cameraImgRef}
                  src={cameraFrameSrc}
                  alt="Vista cámara"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Camera size={28} className="text-slate-700" />
                  <p className="text-[10px] text-slate-600 text-center px-4">
                    {isConnected ? 'Activa la cámara para ver la imagen en vivo' : 'Conecta al servidor para ver la imagen'}
                  </p>
                </div>
              )}
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded-lg">
                <span className="text-[8px] font-black text-white uppercase">📷 Cámara Real</span>
              </div>
            </div>

            <div className="flex-1 relative overflow-hidden">
              <canvas ref={canvasRef} width={300} height={240}
                className="w-full h-full bg-[#1a6b9a]" style={{ imageRendering: 'crisp-edges' }} />
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded-lg">
                <span className="text-[8px] font-black text-lime-400 uppercase">⚽ Pista Virtual</span>
              </div>
            </div>
          </>
        )}

        {/* ── MODO SOLO PISTA ── */}
        {viewMode === 'pitch' && (
          <div className="flex-1 relative overflow-hidden">
            <canvas ref={canvasRef} width={300} height={480}
              className="w-full h-full bg-[#1a6b9a]" style={{ imageRendering: 'crisp-edges' }} />
            {!isConnected && !replay.active && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm gap-3">
                <WifiOff size={32} className="text-slate-600" />
                <p className="text-xs text-slate-500 text-center px-8">Conecta al servidor para ver el tracking</p>
                <button onClick={connectWS} className="px-4 py-2 bg-lime-400 text-slate-900 rounded-xl text-xs font-black">Conectar</button>
              </div>
            )}
          </div>
        )}

        {/* ── MODO SOLO CÁMARA ── */}
        {viewMode === 'camera' && (
          <div className="flex-1 relative bg-black overflow-hidden">
            {cameraFrameSrc ? (
              <img src={cameraFrameSrc} alt="Vista cámara" className="w-full h-full object-contain" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <Camera size={40} className="text-slate-700" />
                <p className="text-[10px] text-slate-600 text-center px-4">
                  {isConnected ? 'Activa la cámara para ver la imagen con tracking' : 'Conecta al servidor'}
                </p>
              </div>
            )}
            {cameraFrameSrc && currentFrame && (
              <div className="absolute bottom-2 left-2 right-2 bg-black/70 backdrop-blur-sm rounded-xl p-2 flex justify-around">
                <div className="text-center">
                  <div className="text-[8px] text-slate-400 uppercase">Local</div>
                  <div className="text-sm font-black text-blue-400">{currentFrame.posiciones_render.local.length}</div>
                </div>
                <div className="text-center">
                  <div className="text-[8px] text-slate-400 uppercase">Sistema</div>
                  <div className="text-sm font-black text-lime-400">{sistema}</div>
                </div>
                <div className="text-center">
                  <div className="text-[8px] text-slate-400 uppercase">Rival</div>
                  <div className="text-sm font-black text-red-400">{currentFrame.posiciones_render.rival.length}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {replay.active && replayPlay && viewMode !== 'camera' && (
          <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-sm rounded-xl p-2 border border-white/10 z-10">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-black text-amber-400 uppercase">REPLAY — {replayPlay.evento}</span>
              <button onClick={() => setReplay(r => ({ ...r, active: false }))} className="text-slate-500 hover:text-white">
                <X size={12} />
              </button>
            </div>
            <div className="h-1 bg-white/10 rounded-full mb-2">
              <div className="h-full bg-amber-400 rounded-full transition-all"
                style={{ width: `${(replay.frameIdx / (replayPlay.frames.length - 1)) * 100}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {([0.5, 1, 2] as const).map(s => (
                  <button key={s} onClick={() => setReplay(r => ({ ...r, speed: s }))}
                    className={`px-2 py-1 rounded text-[8px] font-black transition-all ${replay.speed === s ? 'bg-amber-400 text-slate-900' : 'bg-white/5 text-slate-500'}`}>
                    {s}×
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setReplay(r => ({ ...r, frameIdx: 0 }))} className="p-1 bg-white/5 rounded text-slate-400">
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
      </div>

      {/* ── COMMAND BUTTONS ──────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/10 bg-[#0E1015]/95 px-2 py-2 space-y-2">
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
              <span className="text-[7px] font-black uppercase leading-none text-center">{cmd.replace(/_/g, ' ')}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
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
          <button onClick={() => setShowPlays(true)}
            className={`px-3 py-2 rounded-xl border text-[9px] font-black uppercase flex flex-col items-center gap-1 ${savedPlays.length > 0 ? 'bg-amber-400/15 border-amber-400/25 text-amber-400' : 'bg-white/5 border-white/10 text-slate-600'}`}>
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

      {/* ── SAVED PLAYS MODAL ────────────────────────────────── */}
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
                <h3 className="text-xs font-black text-white uppercase tracking-widest">Jugadas Guardadas ({savedPlays.length})</h3>
                <button onClick={() => setShowPlays(false)} className="p-1 hover:bg-white/10 rounded-lg">
                  <X size={16} className="text-slate-400" />
                </button>
              </div>
              <div className="overflow-y-auto allow-scroll p-4 space-y-2" style={{ maxHeight: 'calc(70vh - 60px)' }}>
                {savedPlays.length === 0 ? (
                  <p className="text-center text-slate-600 text-sm py-8">Guarda jugadas durante el partido pulsando los botones de evento</p>
                ) : (
                  savedPlays.map(play => (
                    <div key={play.id} className="border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
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
