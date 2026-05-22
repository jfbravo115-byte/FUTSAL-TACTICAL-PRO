import React from "react";
import { X, Download, FileText, Loader2, Trophy, Shield, TrendingUp, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";

interface TacticalReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: string | null;
  isLoading: boolean;
}

export const TacticalReportModal: React.FC<TacticalReportModalProps> = ({
  isOpen,
  onClose,
  report,
  isLoading,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-[#0A0B0E] border border-white/10 w-full max-w-lg rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-2">
                <FileText className="text-blue-400" size={18} />
                <span className="text-xs font-black uppercase tracking-widest italic">Informe Táctico Local</span>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                  <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Generando Análisis...</p>
                </div>
              ) : report ? (
                <div className="prose prose-invert prose-sm max-w-none prose-headings:text-blue-400 prose-headings:uppercase prose-headings:italic prose-headings:font-black prose-strong:text-blue-300">
                  <Markdown>{report}</Markdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-30">
                  <AlertCircle size={32} />
                  <p className="text-xs font-bold uppercase tracking-widest">No hay datos suficientes</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/5 bg-white/5 flex gap-3">
              <button
                onClick={() => {
                   if (!report) return;
                   const blob = new Blob([report], { type: 'text/markdown' });
                   const url = URL.createObjectURL(blob);
                   const a = document.createElement('a');
                   a.href = url;
                   a.download = `Informe_Tactico_${Date.now()}.md`;
                   a.click();
                }}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Download size={14} /> Guardar Informe
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
