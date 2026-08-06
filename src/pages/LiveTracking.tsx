import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';

interface Player {
  id: number;
  team: 'local' | 'rival';
  x: number;
  y: number;
  confidence?: number;
}

interface DrawShape {
  type: 'circle' | 'cone' | 'line' | 'text' | 'box';
  anchored_to_player_id?: number;
  offset?: { x: number; y: number };
  color: string;
  data: any;
}

export default function VisorScouting() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [shapes, setShapes] = useState<DrawShape[]>([]);
  const [selectedTool, setSelectedTool] = useState<'circle' | 'cone' | 'line' | 'text' | 'box' | 'select'>('circle');
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [localColor, setLocalColor] = useState('blue');
  const [rivalColor, setRivalColor] = useState('red');

  // Cargar análisis desde Modal
  useEffect(() => {
    const loadAnalysis = async () => {
      const jobId = sessionStorage.getItem('currentJobId');
      if (!jobId) return;

      try {
        const res = await fetch(`/api/resultado/${jobId}`);
        if (!res.ok) return;
        
        const data = await res.json();
        sessionStorage.setItem('analysisData', JSON.stringify(data));
      } catch (err) {
        console.error("Error cargando análisis:", err);
      }
    };

    loadAnalysis();
  }, []);

  // Renderizar canvas con jugadores + herramientas
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawFrame = () => {
      ctx.drawImage(videoRef.current!, 0, 0, canvas.width, canvas.height);

      // Dibujar jugadores
      players.forEach(player => {
        const color = player.team === 'local' ? localColor : rivalColor;
        
        ctx.beginPath();
        ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = color;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${player.id}`, player.x, player.y + 4);
      });

      // Dibujar herramientas ancladas a jugadores
      shapes.forEach(shape => {
        let x = shape.data.x;
        let y = shape.data.y;

        if (shape.anchored_to_player_id !== undefined) {
          const anchorPlayer = players.find(p => p.id === shape.anchored_to_player_id);
          if (anchorPlayer) {
            x = anchorPlayer.x + (shape.offset?.x || 0);
            y = anchorPlayer.y + (shape.offset?.y || 0);
          }
        }

        ctx.strokeStyle = shape.color;
        ctx.fillStyle = shape.color;
        ctx.lineWidth = 2;

        switch (shape.type) {
          case 'circle':
            ctx.beginPath();
            ctx.arc(x, y, shape.data.radius || 20, 0, Math.PI * 2);
            ctx.stroke();
            break;

          case 'cone':
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 20, y + 40);
            ctx.lineTo(x + 20, y + 40);
            ctx.closePath();
            ctx.stroke();
            break;

          case 'line':
            ctx.beginPath();
            ctx.moveTo(shape.data.x1, shape.data.y1);
            ctx.lineTo(shape.data.x2, shape.data.y2);
            ctx.stroke();
            break;

          case 'box':
            ctx.strokeRect(x - 20, y - 20, 40, 40);
            break;

          case 'text':
            ctx.fillStyle = shape.color;
            ctx.font = '14px Arial';
            ctx.fillText(shape.data.text, x, y);
            break;
        }
      });
    };

    drawFrame();
  }, [players, shapes, localColor, rivalColor, currentFrame]);

  // Mouse events
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clickedPlayer = players.find(p => {
      const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
      return dist < 20;
    });

    if (clickedPlayer) {
      setSelectedPlayer(clickedPlayer.id);
    }

    if (selectedPlayer !== null) {
      const newShape: DrawShape = {
        type: selectedTool as any,
        anchored_to_player_id: selectedPlayer,
        offset: { x: x - (clickedPlayer?.x || 0), y: y - (clickedPlayer?.y || 0) },
        color: clickedPlayer?.team === 'local' ? localColor : rivalColor,
        data: { x, y, radius: 20, x1: x, y1: y, x2: x + 50, y2: y + 50, text: "Anotación" }
      };
      setShapes([...shapes, newShape]);
    }
  };

  // Actualizar jugadores conforme avanza vídeo
  useEffect(() => {
    const analysisStr = sessionStorage.getItem('analysisData');
    if (!analysisStr) return;

    try {
      const analysis = JSON.parse(analysisStr);
      const frameData = analysis.frames?.find((f: any) => f.frame === Math.floor(currentFrame));
      
      if (frameData && frameData.players) {
        setPlayers(frameData.players);
      }
    } catch (err) {
      console.error("Error parseando análisis:", err);
    }
  }, [currentFrame]);

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-white p-6">
      <h1 className="text-3xl font-bold mb-6 text-lime-400">Visor Scouting - Tracking Automático</h1>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* CANVAS PRINCIPAL */}
        <div className="lg:col-span-3">
          <div className="relative bg-black rounded-lg overflow-hidden">
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              onClick={handleCanvasClick}
              className="w-full cursor-crosshair"
            />
          </div>

          {/* CONTROLES REPRODUCCIÓN */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-4 py-2 bg-lime-400 text-black rounded hover:bg-lime-300"
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <input
              type="range"
              min="0"
              max="300"
              value={currentFrame}
              onChange={(e) => setCurrentFrame(parseInt(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm">{currentFrame} / 300</span>
          </div>
        </div>

        {/* PANEL DERECHO */}
        <div className="bg-[#141A22] rounded-lg p-4 space-y-4">
          <h2 className="font-bold text-lime-400">Herramientas</h2>

          <div>
            <label className="text-sm mb-2 block">Herramienta:</label>
            <select
              value={selectedTool}
              onChange={(e) => setSelectedTool(e.target.value as any)}
              className="w-full px-3 py-2 bg-[#1a2a3a] border border-gray-600 rounded text-white"
            >
              <option value="circle">Círculo</option>
              <option value="cone">Cono</option>
              <option value="line">Línea</option>
              <option value="box">Caja</option>
              <option value="text">Texto</option>
            </select>
          </div>

          <div>
            <label className="text-sm mb-2 block">Jugador anclado:</label>
            <div className="p-3 bg-[#1a2a3a] rounded text-center">
              {selectedPlayer ? `Jugador #${selectedPlayer}` : "Ninguno"}
            </div>
          </div>

          <div>
            <label className="text-sm mb-2 block">Color Local:</label>
            <select
              value={localColor}
              onChange={(e) => setLocalColor(e.target.value)}
              className="w-full px-3 py-2 bg-[#1a2a3a] border border-gray-600 rounded"
            >
              <option value="blue">Azul</option>
              <option value="red">Rojo</option>
              <option value="yellow">Amarillo</option>
              <option value="white">Blanco</option>
            </select>
          </div>

          <div className="border-t border-gray-600 pt-4">
            <h3 className="font-bold text-sm mb-2">Jugadores</h3>
            <div className="text-xs space-y-1">
              <div>Total: {players.length}</div>
              <div>Local: {players.filter(p => p.team === 'local').length}</div>
              <div>Rival: {players.filter(p => p.team === 'rival').length}</div>
            </div>
          </div>

          <div className="border-t border-gray-600 pt-4">
            <h3 className="font-bold text-sm mb-2">Anotaciones ({shapes.length})</h3>
            <button
              onClick={() => setShapes([])}
              className="w-full px-2 py-1 bg-red-600 text-xs rounded hover:bg-red-700"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 text-xs text-gray-500">
        <p>✅ Clic en jugador → Herramienta se ancla automáticamente</p>
        <p>✅ Conforme avanza el vídeo, las anotaciones se mueven con los jugadores 🎯</p>
      </div>
    </div>
  );
}
