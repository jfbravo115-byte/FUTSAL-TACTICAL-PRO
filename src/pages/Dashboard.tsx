import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, where, limit, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { SavedMatch, ActionType, GoalieAction, Role } from '../types/futsal';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  Activity, Trophy, ArrowLeft, Cpu, Users, Target, TrendingUp, LogOut, Trash2, CheckSquare, Square, X
} from 'lucide-react';

function getGoals(match: SavedMatch) {
  return match.events?.filter(
    e => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent
  ).length ?? 0;
}

function getOpponentGoals(match: SavedMatch) {
  return match.events?.filter(
    e => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && e.metadata?.isOpponent
  ).length ?? 0;
}

function getMatchDate(match: SavedMatch) {
  const ts = match.timestamp;
  if (!ts) return 'Sin fecha';
  try {
    return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return ts;
  }
}

export default function Dashboard() {
  const { user, login, loading, logout } = useAuth();
  const [matches, setMatches] = useState<SavedMatch[]>([]);
  const [fetching, setFetching] = useState(true);
  const navigate = useNavigate();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!user) { setFetching(false); return; }
    const fetchMatches = async () => {
      try {
        const q = query(
          collection(db, 'partidos'),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
        const sn = await getDocs(q);
        const list = sn.docs.map(d => ({ id: d.id, ...d.data() } as SavedMatch));
        setMatches(list);
      } catch (err) {
        console.error(err);
      } finally {
        setFetching(false);
      }
    };
    fetchMatches();
  }, [user]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await Promise.all([...selected].map(id => deleteDoc(doc(db, 'partidos', id))));
      setMatches(prev => prev.filter(m => !selected.has(m.id)));
      setSelected(new Set());
      setSelectMode(false);
      setConfirmDelete(false);
    } catch (err) {
      console.error(err);
      alert('Error al eliminar los partidos');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0A0B0E]">
      <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="bg-[#0A0B0E] text-slate-200 font-sans overflow-y-auto allow-scroll" style={{ height: "var(--app-height, 100vh)" }}>
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0E1015]/95 sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-white/10 rounded-xl transition-all text-slate-400 hover:text-white"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-lg font-black text-white uppercase tracking-tight">
                HISTORIAL <span className="text-lime-400 font-mono">PRO</span>
              </h1>
              <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Partidos y Análisis</p>
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              {matches.length > 0 && (
                <button
                  onClick={() => { setSelectMode(s => !s); setSelected(new Set()); setConfirmDelete(false); }}
                  className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase transition-all ${
                    selectMode
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-white/5 text-slate-400 border border-white/10 hover:text-white'
                  }`}
                >
                  {selectMode ? <X size={14} /> : <CheckSquare size={14} />}
                </button>
              )}
              <button
                onClick={logout}
                className="p-2 hover:bg-white/10 rounded-xl transition-all text-slate-500 hover:text-red-400"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </header>

      {selectMode && (
        <div className="sticky top-[57px] z-40 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-black text-white">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (selected.size === matches.length) {
                  setSelected(new Set());
                } else {
                  setSelected(new Set(matches.map(m => m.id)));
                }
              }}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[11px] font-black text-slate-400 hover:text-white transition-all"
            >
              {selected.size === matches.length ? 'Deselec. todo' : 'Selec. todo'}
            </button>
            {selected.size > 0 && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-1.5 bg-red-500/20 border border-red-500/30 rounded-lg text-[11px] font-black text-red-400 flex items-center gap-1.5 hover:bg-red-500/30 transition-all"
              >
                <Trash2 size={12} /> Eliminar ({selected.size})
              </button>
            )}
            {confirmDelete && (
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="px-3 py-1.5 bg-red-600 rounded-lg text-[11px] font-black text-white flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
              >
                {deleting ? '...' : <><Trash2 size={12} /> ¿Confirmar?</>}
              </button>
            )}
          </div>
        </div>
      )}
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8 pb-16">
        {!user ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Trophy className="w-16 h-16 text-lime-400 mb-6" />
            <h2 className="text-3xl font-black mb-4 text-white">Accede a tu Historial</h2>
            <p className="text-slate-400 max-w-md mb-8">
              Inicia sesión con Google para ver todos tus partidos guardados y análisis TACTICAL PRO.
            </p>
            <button
              onClick={login}
              className="bg-lime-400 text-slate-950 font-black px-8 py-3 rounded-xl hover:bg-lime-500 transition-colors"
            >
              Iniciar sesión con Google
            </button>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            {matches.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Partidos',
                    value: matches.length,
                    icon: Activity,
                    color: 'text-blue-400',
                    bg: 'bg-blue-500/10 border-blue-500/20',
                  },
                  {
                    label: 'Victorias',
                    value: matches.filter(m => getGoals(m) > getOpponentGoals(m)).length,
                    icon: Trophy,
                    color: 'text-lime-400',
                    bg: 'bg-lime-500/10 border-lime-500/20',
                  },
                  {
                    label: 'Goles Marcados',
                    value: matches.reduce((acc, m) => acc + getGoals(m), 0),
                    icon: Target,
                    color: 'text-amber-400',
                    bg: 'bg-amber-500/10 border-amber-500/20',
                  },
                  {
                    label: 'Con Análisis IA',
                    value: matches.filter(m => m.tacticalAnalysis).length,
                    icon: Cpu,
                    color: 'text-purple-400',
                    bg: 'bg-purple-500/10 border-purple-500/20',
                  },
                ].map((stat) => (
                  <div key={stat.label} className={`border rounded-2xl p-4 flex flex-col items-center text-center ${stat.bg}`}>
                    <stat.icon className={`w-6 h-6 ${stat.color} mb-2`} />
                    <div className={`text-3xl font-black ${stat.color}`}>{stat.value}</div>
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Matches List */}
            <div>
              <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-3">
                <TrendingUp className="w-6 h-6 text-lime-400" />
                Partidos Recientes
              </h2>

              {fetching ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : matches.length === 0 ? (
                <div className="p-12 border border-slate-800 rounded-2xl bg-slate-900/50 flex flex-col items-center text-center">
                  <Activity className="w-12 h-12 text-slate-600 mb-4" />
                  <h3 className="text-xl font-black text-white mb-2">Sin partidos guardados</h3>
                  <p className="text-slate-500 mb-6">Usa el botón TACTICAL PRO durante un partido para guardar el análisis automáticamente.</p>
                  <button
                    onClick={() => navigate('/')}
                    className="bg-lime-400 text-slate-950 font-black px-6 py-2 rounded-xl hover:bg-lime-500 transition-colors"
                  >
                    Ir al Partido
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {matches.map(m => {
                    const goals = getGoals(m);
                    const opGoals = getOpponentGoals(m);
                    const won = goals > opGoals;
                    const lost = goals < opGoals;
                    const resultColor = won ? 'bg-lime-400/20 text-lime-400' : lost ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-300';
                    const localShots = m.events?.filter(e =>
                      (e.type === ActionType.SHOT || e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent
                    ).length ?? 0;
                    const localSteals = m.players?.filter(p => !p.isOpponent).reduce((acc, p) => acc + (p.stats?.steals || 0), 0) ?? 0;

                    return (
                      <div
                        key={m.id}
                        onClick={() => selectMode && toggleSelect(m.id)}
                        className={`border rounded-2xl bg-slate-900/40 p-5 flex flex-col transition-all ${
                          selectMode
                            ? selected.has(m.id)
                              ? 'border-red-500 bg-red-500/10 cursor-pointer'
                              : 'border-slate-700 cursor-pointer hover:border-slate-600'
                            : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-start gap-2">
                            {selectMode && (
                              <div className={`mt-0.5 shrink-0 ${selected.has(m.id) ? 'text-red-400' : 'text-slate-600'}`}>
                                {selected.has(m.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                              </div>
                            )}
                            <div>
                              <h3 className="font-black text-base text-white">{m.teamName || 'Mi Equipo'}</h3>
                              <p className="text-slate-500 text-xs font-bold uppercase">vs {m.opponentName || 'Rival'}</p>
                              <p className="text-slate-600 text-[10px] mt-1">{getMatchDate(m)}</p>
                            </div>
                          </div>
                          <div className={`px-3 py-1 rounded-lg font-black text-sm whitespace-nowrap shrink-0 ${resultColor}`}>
                            {goals}-{opGoals}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                          <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/50">
                            <div className="text-[9px] text-slate-500 font-black uppercase mb-1">Tiros</div>
                            <div className="font-mono text-white font-black">{localShots}</div>
                          </div>
                          <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/50">
                            <div className="text-[9px] text-slate-500 font-black uppercase mb-1">Recuper.</div>
                            <div className="font-mono text-white font-black">{localSteals}</div>
                          </div>
                        </div>

                        {m.tacticalAnalysis && (
                          <div className="mb-3 flex items-center gap-2 bg-lime-400/10 border border-lime-400/20 rounded-lg px-3 py-2">
                            <Cpu size={12} className="text-lime-400" />
                            <span className="text-[9px] font-black text-lime-400 uppercase tracking-widest">Análisis IA disponible</span>
                          </div>
                        )}

                        {!selectMode && (
                          <div className="flex gap-2 mb-2">
                            <button
                              onClick={() => navigate(`/analysis/${m.id}?export=team`)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl font-black text-[10px] bg-blue-500/15 border border-blue-500/20 text-blue-400 hover:bg-blue-500/25 transition-colors"
                            >
                              <Download size={11} />
                              Global
                            </button>
                            <button
                              onClick={() => navigate(`/analysis/${m.id}?export=goalkeeper`)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl font-black text-[10px] bg-amber-500/15 border border-amber-500/20 text-amber-400 hover:bg-amber-500/25 transition-colors"
                            >
                              <Download size={11} />
                              Porteros
                            </button>
                          </div>
                        )}
                        <button
                          onClick={() => !selectMode && navigate(`/analysis/${m.id}`)}
                          className={`mt-auto w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs transition-colors ${
                            selectMode ? 'bg-slate-800 text-slate-600 cursor-default' : 'bg-lime-400 text-slate-900 hover:bg-lime-500'
                          }`}
                        >
                          <Cpu className="w-4 h-4" />
                          VER ANÁLISIS
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
