import React, { useState } from "react";
import { X, FileJson, FileSpreadsheet, Printer, Download } from "lucide-react";
import { MatchData } from "../types/futsal";
import { downloadActionsCsv, downloadMatchJson, printMatchReport } from "../services/matchExportService";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  matchData: MatchData;
};

export function SimpleExportModal({ isOpen, onClose, matchData }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  if (!isOpen) return null;

  const run = (fn: () => void, ok: string) => {
    try {
      fn();
      setMessage(ok);
      setTimeout(() => setMessage(null), 2200);
    } catch (err: any) {
      setMessage(err?.message || "No se pudo exportar");
    }
  };

  return (
    <div className="fixed inset-0 z-[1600] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-white font-black uppercase italic flex items-center gap-2"><Download size={18} className="text-blue-400" /> Exportar</h2>
            <p className="text-[10px] text-slate-500 uppercase mt-1">Simple, recuperable y sin depender de mapas</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><X size={18} /></button>
        </div>
        <div className="p-5 grid gap-3">
          <button onClick={() => run(() => printMatchReport(matchData), "Vista de impresión abierta")} className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 flex items-center gap-4 text-left">
            <Printer className="text-blue-400" />
            <div><div className="font-black text-white uppercase text-sm">Informe / Imprimir</div><div className="text-[10px] text-slate-500">Usa la impresión del navegador · Guardar como PDF</div></div>
          </button>
          <button onClick={() => run(() => downloadActionsCsv(matchData), "CSV de acciones generado")} className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 flex items-center gap-4 text-left">
            <FileSpreadsheet className="text-emerald-400" />
            <div><div className="font-black text-white uppercase text-sm">CSV de acciones</div><div className="text-[10px] text-slate-500">Una fila por acción · tiempo, jugador, tipo y zona</div></div>
          </button>
          <button onClick={() => run(() => downloadMatchJson(matchData), "JSON de respaldo generado")} className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 flex items-center gap-4 text-left">
            <FileJson className="text-amber-400" />
            <div><div className="font-black text-white uppercase text-sm">JSON de respaldo</div><div className="text-[10px] text-slate-500">MatchData completo y recuperable</div></div>
          </button>
          {message && <div className="text-center text-xs font-black text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">{message}</div>}
        </div>
      </div>
    </div>
  );
}
