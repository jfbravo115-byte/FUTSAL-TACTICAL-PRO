import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { MatchData, SavedMatch, ActionType, GoalieAction } from "../types/futsal";
import { listPartidos, savePartido, deletePartidos } from "../services/partidosService";
import { listFinalLocalCopies, markFinalLocalCopySynced, deleteFinalLocalCopy } from "../services/matchSnapshotService";
import { combineMatchHistory, MatchHistoryEntry } from "../services/matchHistoryService";
import { SimpleExportModal } from "../components/SimpleExportModal";
import {
  Activity,
  ArrowLeft,
  Cloud,
  CloudOff,
  Download,
  FileText,
  LogIn,
  LogOut,
  RefreshCw,
  Smartphone,
  Timer,
  Trash2,
  Trophy,
} from "lucide-react";

function getGoals(match: SavedMatch, opponent = false) {
  return match.events?.filter(
    (e) =>
      (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) &&
      !!e.metadata?.isOpponent === opponent,
  ).length ?? 0;
}

function getMatchDate(match: SavedMatch) {
  if (!match.timestamp) return "Sin fecha";
  try {
    return new Date(match.timestamp).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return match.timestamp;
  }
}

function asMatchData(entry: MatchHistoryEntry): MatchData {
  const {
    id: _id,
    historySource: _historySource,
    syncStatus: _syncStatus,
    localStorageId: _localStorageId,
    remoteId: _remoteId,
    ...data
  } = entry;
  return data;
}

export default function Dashboard() {
  const { user, login, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [remoteMatches, setRemoteMatches] = useState<SavedMatch[]>([]);
  const [localVersion, setLocalVersion] = useState(0);
  const [fetching, setFetching] = useState(true);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [exportMatch, setExportMatch] = useState<MatchData | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setFetching(true);
    setRemoteError(null);
    setLocalVersion((v) => v + 1); // fuerza releer localStorage
    if (!user) {
      setRemoteMatches([]);
      setFetching(false);
      return;
    }
    try {
      setRemoteMatches(await listPartidos());
    } catch (err) {
      console.error(err);
      setRemoteMatches([]);
      setRemoteError("No se pudo conectar con el historial remoto. Tus copias locales siguen disponibles.");
    } finally {
      setFetching(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const localCopies = useMemo(() => {
    void localVersion;
    return listFinalLocalCopies();
  }, [localVersion]);

  const matches = useMemo(
    () => combineMatchHistory(remoteMatches, localCopies),
    [remoteMatches, localCopies],
  );

  const syncLocal = async (entry: MatchHistoryEntry) => {
    if (!user || !entry.localStorageId) return;
    setSyncingId(entry.id);
    try {
      const remoteId = await savePartido(asMatchData(entry));
      markFinalLocalCopySynced(entry.localStorageId, remoteId);
      await refresh();
    } catch (err) {
      console.error(err);
      setRemoteError("No se pudo sincronizar ahora. La copia local permanece intacta.");
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (entry: MatchHistoryEntry) => {
    const key = `${entry.id}-${entry.localStorageId || ""}`;
    setDeletingKey(key);
    try {
      // Borra en cada sitio donde exista una copia real de este partido.
      // No se borra nada "en cascada" ni automáticamente: es una acción
      // explícita del usuario sobre esta entrada concreta.
      if (entry.localStorageId) deleteFinalLocalCopy(entry.localStorageId);
      if (entry.remoteId) {
        try {
          await deletePartidos([entry.remoteId]);
        } catch (err) {
          console.error(err);
          setRemoteError("Se borró la copia local, pero no se pudo borrar la copia remota ahora.");
        }
      }
      await refresh();
    } finally {
      setConfirmDeleteKey(null);
      setDeletingKey(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0A0B0E]">
        <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#0A0B0E] text-slate-200 font-sans overflow-y-auto allow-scroll" style={{ height: "var(--app-height, 100vh)" }}>
      <header className="border-b border-white/10 bg-[#0E1015]/95 sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate("/match")} className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white">
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-black text-white uppercase tracking-tight">HISTORIAL <span className="text-lime-400 font-mono">2.0</span></h1>
              <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Local primero · remoto cuando esté disponible</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void refresh()} className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white" title="Actualizar">
              <RefreshCw size={16} className={fetching ? "animate-spin" : ""} />
            </button>
            {user ? (
              <button onClick={logout} className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-red-400" title="Cerrar sesión">
                <LogOut size={16} />
              </button>
            ) : (
              <button onClick={login} className="px-3 py-2 rounded-xl bg-lime-400 text-slate-950 font-black text-[10px] uppercase flex items-center gap-2">
                <LogIn size={14} /> Sincronizar
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5 pb-16">
        {remoteError && (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-300 flex gap-3 items-center">
            <CloudOff size={18} className="shrink-0" /> {remoteError}
          </div>
        )}
        {!user && localCopies.length > 0 && (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-xs text-blue-300">
            Puedes consultar tus partidos guardados en este dispositivo sin iniciar sesión. Inicia sesión solo para recuperar/sincronizar el historial remoto.
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center"><Activity className="mx-auto text-blue-400 mb-1" size={18}/><b className="text-2xl text-white">{matches.length}</b><div className="text-[9px] uppercase text-slate-500 font-black">Partidos</div></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center"><Smartphone className="mx-auto text-amber-400 mb-1" size={18}/><b className="text-2xl text-white">{localCopies.length}</b><div className="text-[9px] uppercase text-slate-500 font-black">Copias locales</div></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center"><Cloud className="mx-auto text-lime-400 mb-1" size={18}/><b className="text-2xl text-white">{remoteMatches.length}</b><div className="text-[9px] uppercase text-slate-500 font-black">Remotos</div></div>
        </div>

        {fetching && matches.length === 0 ? (
          <div className="py-16 flex justify-center"><div className="w-7 h-7 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : matches.length === 0 ? (
          <div className="p-10 border border-slate-800 rounded-3xl bg-slate-900/40 text-center">
            <Trophy className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h2 className="font-black text-white text-xl mb-2">Sin partidos guardados</h2>
            <p className="text-slate-500 text-sm mb-5">Los partidos finalizados aparecerán aquí aunque falle el backend remoto.</p>
            <button onClick={() => navigate("/match")} className="bg-lime-400 text-slate-950 font-black px-6 py-2.5 rounded-xl">Ir al partido</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches.map((m) => {
              const gf = getGoals(m, false);
              const gc = getGoals(m, true);
              const status = m.historySource === "both" || m.historySource === "remote" ? "☁ Sincronizado" : m.syncStatus === "pending" ? "⚠ Pendiente de sincronizar" : "📱 Copia local";
              return (
                <article key={`${m.id}-${m.localStorageId || ""}`} className="border border-white/10 bg-slate-900/50 rounded-3xl p-5">
                  <div className="flex justify-between gap-3 items-start mb-4">
                    <div className="min-w-0"><h3 className="font-black text-white text-lg truncate">{m.teamName}</h3><p className="text-xs text-slate-500 uppercase truncate">vs {m.opponentName}</p><p className="text-[10px] text-slate-600 mt-1">{getMatchDate(m)}</p></div>
                    <div className="font-mono font-black text-3xl text-white shrink-0">{gf}-{gc}</div>
                  </div>
                  <div className={`mb-4 text-[10px] font-black uppercase tracking-wide ${m.historySource === "local" ? (m.syncStatus === "pending" ? "text-amber-400" : "text-blue-400") : "text-lime-400"}`}>{status}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => navigate(`/analysis/${encodeURIComponent(m.localStorageId || m.id)}`)} className="py-2.5 rounded-xl bg-lime-400 text-slate-950 font-black text-[10px] uppercase">Ver</button>
                    <button onClick={() => navigate(`/analysis/${encodeURIComponent(m.localStorageId || m.id)}?section=report`)} className="py-2.5 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-400 font-black text-[10px] uppercase flex items-center justify-center gap-1"><FileText size={12}/> Informe</button>
                    <button onClick={() => navigate(`/analysis/${encodeURIComponent(m.localStorageId || m.id)}?section=times`)} className="py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 font-black text-[10px] uppercase flex items-center justify-center gap-1"><Timer size={12}/> Tiempos</button>
                    <button onClick={() => setExportMatch(asMatchData(m))} className="py-2.5 rounded-xl bg-violet-500/15 border border-violet-500/25 text-violet-300 font-black text-[10px] uppercase flex items-center justify-center gap-1"><Download size={12}/> Exportar</button>
                  </div>
                  {m.historySource === "local" && m.syncStatus === "pending" && user && (
                    <button disabled={syncingId === m.id} onClick={() => void syncLocal(m)} className="mt-3 w-full py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 font-black text-[10px] uppercase hover:bg-white/10 disabled:opacity-50">
                      {syncingId === m.id ? "Sincronizando…" : "Sincronizar ahora"}
                    </button>
                  )}
                  {(() => {
                    const key = `${m.id}-${m.localStorageId || ""}`;
                    const isConfirming = confirmDeleteKey === key;
                    const isDeleting = deletingKey === key;
                    return (
                      <button
                        disabled={isDeleting}
                        onClick={() => (isConfirming ? void handleDelete(m) : setConfirmDeleteKey(key))}
                        className={`mt-2 w-full py-2 rounded-xl border font-black text-[10px] uppercase flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 ${
                          isConfirming
                            ? "bg-red-600 border-red-600 text-white"
                            : "bg-white/5 border-white/10 text-slate-500 hover:text-red-400 hover:border-red-500/30"
                        }`}
                      >
                        <Trash2 size={12} /> {isDeleting ? "Borrando…" : isConfirming ? "¿Confirmar borrado?" : "Borrar"}
                      </button>
                    );
                  })()}
                </article>
              );
            })}
          </div>
        )}
      </main>

      {exportMatch && <SimpleExportModal isOpen={true} onClose={() => setExportMatch(null)} matchData={exportMatch} />}
    </div>
  );
}
