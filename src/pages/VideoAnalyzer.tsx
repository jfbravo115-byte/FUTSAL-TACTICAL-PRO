import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import analysisService, { AnalysisConfig } from '../services/analysisService';

export default function VideoAnalyzer() {
  const navigate = useNavigate();
  const [serverUrl, setServerUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoType, setVideoType] = useState<'fijo' | 'clips'>('fijo');
  const [localColor, setLocalColor] = useState('blue');
  const [rivalColor, setRivalColor] = useState('red');
  
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [serverConnected, setServerConnected] = useState<boolean | null>(null);

  const handleCheckServer = async () => {
    if (!serverUrl) {
      setError('Ingresa la URL del servidor');
      return;
    }
    try {
      const connected = await analysisService.checkServer(serverUrl);
      setServerConnected(connected);
      setError(connected ? '' : 'No se puede conectar con el servidor');
    } catch (err: any) {
      setError(err.message);
      setServerConnected(false);
    }
  };

  const handleAnalyze = async () => {
    if (!serverConnected) {
      setError('Verifica la conexión con el servidor primero');
      return;
    }
    if (!videoUrl) {
      setError('Ingresa la URL del vídeo');
      return;
    }

    setAnalyzing(true);
    setError('');
    setProgress(0);

    try {
      const config: AnalysisConfig = {
        serverUrl,
        videoUrl,
        videoType,
        calibration: {
          localColor,
          rivalColor
        }
      };

      const jobId = await analysisService.startAnalysis(config);
      setStatus(`Análisis iniciado: ${jobId}`);

      const result = await analysisService.pollAnalysis(
        jobId,
        (job) => {
          setProgress(job.progress || 0);
          setStatus(`${job.status}: ${job.progress || 0}%`);
        }
      );

      setStatus('✅ Análisis completado');
      
      sessionStorage.setItem('analysisResult', JSON.stringify(result.result));
      navigate('/visor_scouting');

    } catch (err: any) {
      setError(`Error: ${err.message}`);
      setStatus('');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-white p-6">
      <h1 className="text-3xl font-bold mb-8 text-lime-400">Analizar Partido</h1>

      <div className="max-w-2xl mx-auto space-y-8">
        
        <div className="bg-[#141A22] rounded-lg p-6 border border-lime-400/30">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-lime-400">1</span> Conectar con servidor
          </h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="URL del túnel (https://...trycloudflare.com)"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a2a3a] border border-gray-600 rounded text-white"
            />
            <button
              onClick={handleCheckServer}
              disabled={analyzing}
              className="px-6 py-2 bg-lime-400 text-black font-bold rounded hover:bg-lime-300 disabled:opacity-50"
            >
              {serverConnected === null ? 'Conectar' : serverConnected ? '✅ Conectado' : '❌ Error'}
            </button>
          </div>
        </div>

        <div className="bg-[#141A22] rounded-lg p-6 border border-lime-400/30">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-lime-400">2</span> Vídeo del partido
          </h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="URL de YouTube o video_id del servidor"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a2a3a] border border-gray-600 rounded text-white"
            />
          </div>
        </div>

        <div className="bg-[#141A22] rounded-lg p-6 border border-lime-400/30">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-lime-400">3</span> Configuración
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2">Tipo de vídeo</label>
              <select
                value={videoType}
                onChange={(e) => setVideoType(e.target.value as 'fijo' | 'clips')}
                className="w-full px-4 py-2 bg-[#1a2a3a] border border-gray-600 rounded text-white"
              >
                <option value="fijo">Cámara fija (análisis completo)</option>
                <option value="clips">Montaje de clips (detectar cortes)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-2">Color Equipo Local</label>
                <select
                  value={localColor}
                  onChange={(e) => setLocalColor(e.target.value)}
                  className="w-full px-4 py-2 bg-[#1a2a3a] border border-gray-600 rounded text-white"
                >
                  <option value="blue">Azul</option>
                  <option value="red">Rojo</option>
                  <option value="yellow">Amarillo</option>
                  <option value="white">Blanco</option>
                  <option value="black">Negro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Color Equipo Rival</label>
                <select
                  value={rivalColor}
                  onChange={(e) => setRivalColor(e.target.value)}
                  className="w-full px-4 py-2 bg-[#1a2a3a] border border-gray-600 rounded text-white"
                >
                  <option value="blue">Azul</option>
                  <option value="red">Rojo</option>
                  <option value="yellow">Amarillo</option>
                  <option value="white">Blanco</option>
                  <option value="black">Negro</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#141A22] rounded-lg p-6 border border-lime-400/30">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-lime-400">4</span> Lanzar análisis
          </h2>
          
          {error && (
            <div className="mb-4 p-4 bg-red-900/20 border border-red-600 rounded flex gap-3 text-red-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {analyzing && (
            <div className="mb-4 p-4 bg-blue-900/20 border border-blue-600 rounded">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                <span>{status}</span>
              </div>
              <div className="w-full bg-gray-700 rounded h-2">
                <div
                  className="bg-lime-400 h-2 rounded transition-all"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={analyzing || !serverConnected}
            className="w-full px-6 py-3 bg-lime-400 text-black font-bold text-lg rounded hover:bg-lime-300 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analizando...
              </>
            ) : (
              <>
                ⚡ Analizar Partido
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
