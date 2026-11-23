import React, { useEffect, useRef, useState } from "react";
import { X, FileJson, FileSpreadsheet, Printer, Download, Users, ShieldHalf, Layers, RotateCcw } from "lucide-react";
import { MatchData } from "../types/futsal";
import {
  downloadActionsCsv,
  downloadMatchJson,
  downloadPlayersCsv,
} from "../services/matchExportService";
import { exportMatchReportPdf, exportGoalkeeperReportPdf } from "../services/pdfExportService";
import { exportFullMatchDossierPdf } from "../services/fullDossierPdfService";
import type { FlowProgress } from "../services/pdfFlow";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  matchData: MatchData;
};

/** «GENERANDO DOSSIER · PÁGINA 3 DE 12». */
export function progressLabel(documento: string, p: FlowProgress | null): string {
  if (!p || p.phase === "layout" || p.total === 0) return `Generando ${documento} · maquetando`;
  if (p.phase === "save") return `Generando ${documento} · guardando`;
  return `Generando ${documento} · página ${p.page} de ${p.total}`;
}

type Tarea = { id: string; documento: string; ok: string; fn: () => void | Promise<void> };

/**
 * El modal de exportación.
 *
 * INCLUIR EQUIPO RIVAL es una elección de ESTA exportación: empieza activada
 * cada vez que se abre el modal, no se guarda en el partido y no toca CSV ni
 * JSON —solo los dos PDF de análisis—.
 */
export function SimpleExportModal({ isOpen, onClose, matchData }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ documento: string; p: FlowProgress | null } | null>(null);
  const [includeOpponent, setIncludeOpponent] = useState(true);
  const ultima = useRef<Tarea | null>(null);

  // Cada apertura empieza con el rival incluido: la elección no se arrastra.
  useEffect(() => {
    if (isOpen) {
      setIncludeOpponent(true);
      setError(null);
      setMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const run = async (tarea: Tarea) => {
    ultima.current = tarea;
    setBusy(true);
    setError(null);
    setMessage(null);
    setProgress({ documento: tarea.documento, p: null });
    try {
      await tarea.fn();
      setMessage(tarea.ok);
      setTimeout(() => setMessage(null), 2200);
    } catch (err: any) {
      setError(err?.message || "No se pudo exportar");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const conProgreso = (documento: string) => (p: FlowProgress) => setProgress({ documento, p });

  const tareas: Record<string, Tarea> = {
    dossier: {
      id: "dossier",
      documento: "dossier",
      ok: "Dossier completo generado",
      fn: () => exportFullMatchDossierPdf(matchData, { includeOpponent, onProgress: conProgreso("dossier") }),
    },
    summary: {
      id: "summary",
      documento: "informe",
      ok: "PDF del informe generado",
      fn: () => exportMatchReportPdf(matchData, { includeOpponent, onProgress: conProgreso("informe") }),
    },
  };

  const boton =
    "p-4 min-h-[56px] rounded-2xl flex items-center gap-4 text-left disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="fixed inset-0 z-[1600] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        className="w-full max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden bg-slate-900 border border-white/10 rounded-3xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 id="export-modal-title" className="text-white font-black uppercase italic flex items-center gap-2"><Download size={18} className="text-blue-400" /> Exportar</h2>
            <p className="text-[10px] text-slate-500 uppercase mt-1">Dossier, informe, jugadores, acciones o respaldo</p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Cerrar" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40"><X size={18} /></button>
        </div>
        <div className="p-5 grid gap-3">
          {/* Estado ARRIBA: en un móvil la lista de botones no cabe entera y
              el progreso o el error quedarían bajo el pliegue. */}
          {busy && progress && (
            <div data-export-progress role="status" aria-live="polite" className="text-center text-xs font-black uppercase text-violet-200 bg-violet-500/10 border border-violet-500/25 rounded-xl p-3">
              {progressLabel(progress.documento, progress.p)}
            </div>
          )}
          {error && (
            <div data-export-error role="alert" className="text-xs font-bold text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3 grid gap-2">
              <span>No se pudo exportar: {error}</span>
              <button
                data-export-retry
                onClick={() => ultima.current && run(ultima.current)}
                className="min-h-[44px] rounded-xl bg-red-500/20 border border-red-500/40 text-white font-black uppercase text-xs flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} /> Reintentar
              </button>
            </div>
          )}
          {message && <div className="text-center text-xs font-black text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">{message}</div>}
          {/* INCLUIR EQUIPO RIVAL. Afecta solo a los dos PDF de análisis. */}
          <button
            type="button"
            role="switch"
            aria-checked={includeOpponent}
            data-export-include-opponent={includeOpponent ? "on" : "off"}
            disabled={busy}
            onClick={() => setIncludeOpponent((v) => !v)}
            className="min-h-[56px] px-4 py-3 rounded-2xl border-2 border-white/15 bg-white/5 flex items-center justify-between gap-3 text-left disabled:opacity-50"
          >
            <span>
              <span className="block font-black text-white uppercase text-sm">Incluir equipo rival</span>
              <span className="block text-[10px] text-slate-400">
                {includeOpponent
                  ? `Análisis de ambos equipos`
                  : `Centrado en ${matchData.teamName}: sin tablas, mapas ni porteros del rival`}
                {" · solo dossier e informe resumido"}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${includeOpponent ? "bg-emerald-500" : "bg-slate-600"}`}
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${includeOpponent ? "left-6" : "left-1"}`} />
            </span>
          </button>

          {/* DOS PRODUCTOS DISTINTOS, DOS BOTONES.
              El de arriba se llamaba «Informe completo» y no lo era: traía los
              mapas esenciales del equipo analizado y ninguno del rival. Ahora
              dice lo que es, y al lado está el que sí lo trae todo. */}
          <button data-export-dossier disabled={busy} onClick={() => run(tareas.dossier)} className={`${boton} bg-violet-500/15 border-2 border-violet-500/40 hover:bg-violet-500/25`}>
            <Layers className="text-violet-300 shrink-0" />
            <div><div className="font-black text-white uppercase text-sm">Dossier completo (PDF)</div><div className="text-[10px] text-slate-400">Informe automático, Tactical Pro y todos los mapas registrados</div></div>
          </button>
          <button data-export-summary disabled={busy} onClick={() => run(tareas.summary)} className={`${boton} bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20`}>
            <Printer className="text-blue-400 shrink-0" />
            <div><div className="font-black text-white uppercase text-sm">Informe resumido (PDF)</div><div className="text-[10px] text-slate-500">Datos principales, jugadores, porteros, mapas esenciales y Tactical Pro</div></div>
          </button>
          <button disabled={busy} onClick={() => run({ id: "gk", documento: "informe de porteros", ok: "PDF de porteros generado", fn: () => exportGoalkeeperReportPdf(matchData) })} className={`${boton} bg-indigo-500/10 border border-indigo-500/25 hover:bg-indigo-500/20`}>
            <ShieldHalf className="text-indigo-400 shrink-0" />
            <div><div className="font-black text-white uppercase text-sm">Informe de porteros (PDF)</div><div className="text-[10px] text-slate-500">Uno o varios porteros · minutos, paradas, mapas</div></div>
          </button>
          <button disabled={busy} onClick={() => run({ id: "players-csv", documento: "CSV", ok: "CSV de jugadores generado", fn: () => downloadPlayersCsv(matchData) })} className={`${boton} bg-cyan-500/10 border border-cyan-500/25 hover:bg-cyan-500/20`}>
            <Users className="text-cyan-400 shrink-0" />
            <div><div className="font-black text-white uppercase text-sm">CSV de jugadores</div><div className="text-[10px] text-slate-500">TOT, ROT, goles, tiros, recuperaciones y pérdidas</div></div>
          </button>
          <button disabled={busy} onClick={() => run({ id: "actions-csv", documento: "CSV", ok: "CSV de acciones generado", fn: () => downloadActionsCsv(matchData) })} className={`${boton} bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20`}>
            <FileSpreadsheet className="text-emerald-400 shrink-0" />
            <div><div className="font-black text-white uppercase text-sm">CSV de acciones</div><div className="text-[10px] text-slate-500">Una fila por acción · tiempo, jugador, tipo y zona</div></div>
          </button>
          <button disabled={busy} onClick={() => run({ id: "json", documento: "JSON", ok: "JSON de respaldo generado", fn: () => downloadMatchJson(matchData) })} className={`${boton} bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20`}>
            <FileJson className="text-amber-400 shrink-0" />
            <div><div className="font-black text-white uppercase text-sm">JSON de respaldo</div><div className="text-[10px] text-slate-500">MatchData completo y recuperable</div></div>
          </button>
        </div>
      </div>
    </div>
  );
}
