import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../lib/AuthContext';
import { Role } from '../types/futsal';
import { normalizeLineup } from '../utils/lineupIntegrity';
import { loadTemplateLocalFirst, buildTemplatePayload, StoredTemplate } from '../services/templateLoadService';
import {
  STARTER_BLOCK_MESSAGE,
  calledUpPlayers,
  starterBlockReason,
} from '../utils/squadModel';
import {
  Plus, Trash2, Save, Play, Shield, Users, ChevronDown,
  Upload, Star, Edit3, Check, X, UserCheck, UserMinus
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────
interface TemplatPlayer {
  id: string;
  number: number;
  name: string;
  role: Role;
  isStarter: boolean;
  isOpponent: boolean;
}

interface TeamTemplate {
  teamName: string;
  teamLogo?: string;
  players: TemplatPlayer[];
  updatedAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  GOALKEEPER: 'PORT', PLAYER: 'ALA', WING: 'ALA',
  PIVOT: 'PIVOT', DEFENSE: 'CIERRE', COACH: 'COACH', DELEGATE: 'DELEGADO',
};

const ROLE_COLORS: Record<string, string> = {
  GOALKEEPER: '#f59e0b', PLAYER: '#3b82f6', WING: '#3b82f6',
  PIVOT: '#a855f7', DEFENSE: '#22c55e', COACH: '#f97316', DELEGATE: '#64748b',
};

const INITIAL_STATS = {
  goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
  fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0,
  saves: 0, conceded: 0,
};

// ─── Component ───────────────────────────────────────────────────
export default function PreMatch() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Team data
  const [teamName, setTeamName] = useState('MI EQUIPO');
  const [teamLogo, setTeamLogo] = useState<string | undefined>();
  const [opponentName, setOpponentName] = useState('EQUIPO VISITANTE');
  /**
   * Portería que defiende MI EQUIPO en la 1ª parte. Es el único dato desde el
   * que se deriva la perspectiva de ataque de cada acción, y no puede
   * reconstruirse después: sin él, las zonas quedarían sin orientación como
   * ocurre en los partidos históricos. El valor por defecto reproduce la
   * convención que ya usaba la pizarra de alineación (local a la izquierda).
   */
  const [teamDefendsAtKickoff, setTeamDefendsAtKickoff] = useState<'left' | 'right'>('left');
  const [players, setPlayers] = useState<TemplatPlayer[]>([
    { id: 'tp1', number: 1,  name: 'Portero 1',   role: Role.GOALKEEPER, isStarter: true,  isOpponent: false },
    { id: 'tp2', number: 7,  name: 'Jugador 1',   role: Role.PLAYER,     isStarter: true,  isOpponent: false },
    { id: 'tp3', number: 10, name: 'Jugador 2',   role: Role.PLAYER,     isStarter: true,  isOpponent: false },
    { id: 'tp4', number: 8,  name: 'Jugador 3',   role: Role.PLAYER,     isStarter: true,  isOpponent: false },
    { id: 'tp5', number: 11, name: 'Jugador 4',   role: Role.PLAYER,     isStarter: true,  isOpponent: false },
    { id: 'tp6', number: 5,  name: 'Jugador 5',   role: Role.PLAYER,     isStarter: false, isOpponent: false },
    { id: 'tp7', number: 14, name: 'Jugador 6',   role: Role.PLAYER,     isStarter: false, isOpponent: false },
    { id: 'tp8', number: 3,  name: 'Portero 2',   role: Role.GOALKEEPER, isStarter: false, isOpponent: false },
  ]);

  // CONVOCATORIA: solo los jugadores que van a ESTE partido. Vive únicamente
  // aquí, en el estado prepartido; NO se guarda en `futsal_template`, porque
  // la plantilla es permanente y la convocatoria pertenece al encuentro.
  // Arranca con todos marcados: el gesto normal es quitar a los que no van.
  const [calledUp, setCalledUp] = useState<Set<string>>(new Set());
  const [squadNotice, setSquadNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNumber, setEditNumber] = useState(0);
  const [editRole, setEditRole] = useState<Role>(Role.PLAYER);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Load template: LOCAL-FIRST, Firestore solo como respaldo ────────────
  // Si hay copia local válida se usa y no se consulta red. Iniciar partido
  // nunca depende de Firestore.
  useEffect(() => {
    const loadTemplate = async () => {
      const { template } = await loadTemplateLocalFirst(
        () => localStorage.getItem('futsal_template'),
        user
          ? async () => {
              const ref = doc(db, 'plantillas', user.uid);
              const snap = await getDoc(ref);
              return snap.exists() ? (snap.data() as StoredTemplate) : null;
            }
          : null,
        (json) => localStorage.setItem('futsal_template', json),
      );
      if (template) {
        setTeamName(template.teamName || 'MI EQUIPO');
        setTeamLogo(template.teamLogo);
        setPlayers((template.players as TemplatPlayer[]) || []);
      }
      setLoading(false);
    };
    loadTemplate();
  }, [user]);

  // Todo jugador local nuevo entra convocado por defecto; los que ya no
  // están en la plantilla salen del conjunto. La convocatoria NUNCA puede
  // contener a alguien que no esté en la plantilla.
  useEffect(() => {
    setCalledUp((prev) => {
      const vivos = players.filter((p) => !p.isOpponent).map((p) => p.id);
      const siguiente = new Set(vivos.filter((id) => prev.has(id) || !prev.size));
      // Primera carga (`prev` vacío): todos convocados.
      if (!prev.size) return new Set(vivos);
      return siguiente;
    });
  }, [players]);

  const isCalledUp = (id: string) => calledUp.has(id);

  /**
   * Convocar / desconvocar. Desconvocar a un titular lo saca también del
   * quinteto: dejarlo marcado como titular sin estar convocado sería una
   * inconsistencia que luego `startMatch` tendría que resolver en silencio.
   */
  const toggleCalledUp = (id: string) => {
    setSquadNotice(null);
    setCalledUp((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, isStarter: false } : p)));
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // ── Save template ──────────────────────────────────────────────
  const saveTemplate = async () => {
    setSaving(true);
    const template = buildTemplatePayload(teamName, teamLogo, players);
    // Save to localStorage always
    localStorage.setItem('futsal_template', JSON.stringify(template));
    // Save to Firestore if logged in
    if (user) {
      try {
        await setDoc(doc(db, 'plantillas', user.uid), template);
      } catch (e) {
        console.warn('Firestore save failed:', e);
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // ── Start match ───────────────────────────────────────────────
  const startMatch = () => {
    // Guarda automáticamente MI EQUIPO antes de iniciar el partido.
    // Es persistencia únicamente local: no guarda ni sincroniza el rival.
    const template = buildTemplatePayload(teamName, teamLogo, players);
    localStorage.setItem('futsal_template', JSON.stringify(template));
    // Build MatchTracker-compatible players.
    // Integridad de alineación: normalizeLineup garantiza —
    // - como máximo 1 portero activo (slot de portero, pitchPosition 0);
    // - hasta 4 jugadores de campo (pitchPosition 1-4), sin duplicados;
    // - ningún pitchPosition fuera de 0-4;
    // - un segundo portero marcado como titular NO queda en pista, pero se
    //   conserva en la plantilla (banquillo).
    // AQUÍ se materializa la convocatoria. Todo lo que venga después —el
    // quinteto, el banquillo, el radial de CAMBIO, los tiempos, el informe—
    // trabaja sobre este subconjunto y no sobre la plantilla.
    //
    // Era justo lo que faltaba: antes esto era `players.filter(!isOpponent)`,
    // la plantilla entera, y por eso el banquillo ofrecía a jugadores que no
    // estaban en el pabellón.
    const convocatoria = calledUpPlayers(players, calledUp);

    const localCandidates = convocatoria
      .map((p) => ({ id: p.id, role: p.role, wantsOnPitch: p.isStarter }));
    const normalized = new Map(normalizeLineup(localCandidates).map((n) => [n.id, n]));

    const buildPlayer = (p: TemplatPlayer) => {
      const n = normalized.get(p.id);
      return {
        id: p.id,
        number: p.number,
        name: p.name,
        role: p.role,
        isOnPitch: n?.isOnPitch ?? false,
        pitchPosition: n?.pitchPosition,
        plusMinus: 0,
        individualTimeSeconds: 0,
        isStarter: p.isStarter,
        isOpponent: false,
        stats: { ...INITIAL_STATS },
      };
    };

    const localPlayers = convocatoria.map((p) => buildPlayer(p));

    // Garantiza que siempre exista cuerpo técnico LOCAL para poder
    // registrar tarjetas, aunque el usuario no lo haya añadido manualmente
    const hasLocalCoach = localPlayers.some(p => p.role === Role.COACH);
    const hasLocalDelegate = localPlayers.some(p => p.role === Role.DELEGATE);
    if (!hasLocalCoach) {
      localPlayers.push({
        id: 'auto_coach_local', number: 0, name: 'ENTRENADOR LOCAL', role: Role.COACH,
        isOnPitch: false, pitchPosition: undefined, plusMinus: 0, individualTimeSeconds: 0,
        isStarter: false, isOpponent: false, stats: { ...INITIAL_STATS },
      });
    }
    if (!hasLocalDelegate) {
      localPlayers.push({
        id: 'auto_delegate_local', number: 0, name: 'DELEGADO LOCAL', role: Role.DELEGATE,
        isOnPitch: false, pitchPosition: undefined, plusMinus: 0, individualTimeSeconds: 0,
        isStarter: false, isOpponent: false, stats: { ...INITIAL_STATS },
      });
    }

    // Default rival players
    const rivalPlayers = [
      { id: 'r1', number: 1, name: 'POR RIVAL 1', role: Role.GOALKEEPER, isOnPitch: true, pitchPosition: 0, plusMinus: 0, individualTimeSeconds: 0, isStarter: true, isOpponent: true, stats: { ...INITIAL_STATS } },
      { id: 'r2', number: 7, name: 'PJ RIVAL 1', role: Role.PLAYER, isOnPitch: true, pitchPosition: 1, plusMinus: 0, individualTimeSeconds: 0, isStarter: true, isOpponent: true, stats: { ...INITIAL_STATS } },
      { id: 'r3', number: 10, name: 'PJ RIVAL 2', role: Role.PLAYER, isOnPitch: true, pitchPosition: 2, plusMinus: 0, individualTimeSeconds: 0, isStarter: true, isOpponent: true, stats: { ...INITIAL_STATS } },
      { id: 'r4', number: 8, name: 'PJ RIVAL 3', role: Role.PLAYER, isOnPitch: true, pitchPosition: 3, plusMinus: 0, individualTimeSeconds: 0, isStarter: true, isOpponent: true, stats: { ...INITIAL_STATS } },
      { id: 'r5', number: 11, name: 'PJ RIVAL 4', role: Role.PLAYER, isOnPitch: true, pitchPosition: 4, plusMinus: 0, individualTimeSeconds: 0, isStarter: true, isOpponent: true, stats: { ...INITIAL_STATS } },
      // Cuerpo técnico rival predeterminado — garantiza que siempre se puedan
      // registrar tarjetas al staff visitante aunque no se configure manualmente
      { id: 'auto_coach_rival', number: 0, name: 'ENTRENADOR VISITANTE', role: Role.COACH, isOnPitch: false, pitchPosition: undefined, plusMinus: 0, individualTimeSeconds: 0, isStarter: false, isOpponent: true, stats: { ...INITIAL_STATS } },
      { id: 'auto_delegate_rival', number: 0, name: 'DELEGADO VISITANTE', role: Role.DELEGATE, isOnPitch: false, pitchPosition: undefined, plusMinus: 0, individualTimeSeconds: 0, isStarter: false, isOpponent: true, stats: { ...INITIAL_STATS } },
    ];

    const matchSetup = {
      teamName: teamName.toUpperCase(),
      opponentName: opponentName.toUpperCase(),
      teamLogo,
      teamDefendsAtKickoff,
      players: [...localPlayers, ...rivalPlayers],
    };

    sessionStorage.setItem('matchSetup', JSON.stringify(matchSetup));
    navigate('/match');
  };

  // ── Player edit ───────────────────────────────────────────────
  const startEdit = (p: TemplatPlayer) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditNumber(p.number);
    setEditRole(p.role);
  };

  const confirmEdit = () => {
    setPlayers(prev => prev.map(p =>
      p.id === editingId ? { ...p, name: editName, number: editNumber, role: editRole } : p
    ));
    setEditingId(null);
  };

  /**
   * Marcar/desmarcar titular, con los límites APLICADOS AQUÍ.
   *
   * Antes se podían marcar ocho titulares y `normalizeLineup` recortaba en
   * silencio al arrancar: el usuario elegía una cosa y empezaba otra. Ahora
   * el gesto que rompería el quinteto se rechaza y se dice por qué, con las
   * mismas reglas que sigue aplicando `normalizeLineup` (5 y un portero).
   *
   * Y hacer titular a un no convocado lo convoca: es lo que el usuario
   * quiere decir con ese gesto, y bloquearlo sería pedirle dos pasos para
   * una sola intención.
   */
  const toggleStarter = (id: string) => {
    const player = players.find((p) => p.id === id);
    if (!player) return;
    setSquadNotice(null);

    if (player.isStarter) {
      setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, isStarter: false } : p)));
      return;
    }

    const convocatoria = new Set(calledUp);
    convocatoria.add(id);
    const motivo = starterBlockReason(player, players, convocatoria);
    if (motivo) {
      setSquadNotice(STARTER_BLOCK_MESSAGE[motivo]);
      return;
    }

    setCalledUp(convocatoria);
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, isStarter: true } : p)));
  };

  const removePlayer = (id: string) => {
    setPlayers(prev => prev.filter(p => p.id !== id));
  };

  const addPlayer = () => {
    const maxNum = Math.max(...players.map(p => p.number), 0);
    const newP: TemplatPlayer = {
      id: `tp${Date.now()}`,
      number: maxNum + 1,
      name: 'Nuevo Jugador',
      role: Role.PLAYER,
      isStarter: false,
      isOpponent: false,
    };
    setPlayers(prev => [...prev, newP]);
    startEdit(newP);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setTeamLogo(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const locales = players.filter((p) => !p.isOpponent);
  const convocados = locales.filter((p) => calledUp.has(p.id));
  const noConvocados = locales.filter((p) => !calledUp.has(p.id));
  const starters = convocados.filter((p) => p.isStarter);
  const bench = convocados.filter((p) => !p.isStarter);

  if (loading) {
    return (
      <div className="h-screen bg-[#0A0B0E] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-transparent border-t-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0A0B0E] text-slate-100 flex flex-col overflow-hidden font-sans"
      style={{ height: 'var(--app-height, 100vh)' }}>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <header className="bg-[#0E1015]/95 border-b border-white/5 px-4 py-3 flex items-center justify-between shrink-0"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
            <Shield size={16} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-[13px] font-black uppercase tracking-widest text-white">Preparar Partido</h1>
            <p className="text-[9px] text-slate-500 uppercase tracking-wider">Configura tu equipo antes de empezar</p>
          </div>
        </div>
        <button
          onClick={saveTemplate}
          disabled={saving}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${saved ? 'bg-green-500/20 border border-green-500/40 text-green-400' : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'}`}
        >
          {saved ? <Check size={12} /> : <Save size={12} />}
          {saved ? 'Guardado' : 'Guardar'}
        </button>
      </header>

      {/* ── BODY ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-5">

        {/* Team name + logo */}
        <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <button
              onClick={() => logoInputRef.current?.click()}
              className="w-14 h-14 rounded-2xl bg-blue-600/10 border-2 border-dashed border-blue-500/30 flex items-center justify-center shrink-0 hover:bg-blue-600/20 transition-all overflow-hidden"
            >
              {teamLogo
                ? <img src={teamLogo} className="w-full h-full object-contain" />
                : <Upload size={16} className="text-blue-400/60" />
              }
            </button>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            {/* Team name */}
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Nombre del equipo</p>
              <input
                type="text"
                value={teamName}
                onChange={e => setTeamName(e.target.value.toUpperCase())}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[13px] font-black text-blue-400 uppercase outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
        </section>

        {/* Rival name */}
        <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">Nombre del rival</p>
          <input
            type="text"
            value={opponentName}
            onChange={e => setOpponentName(e.target.value.toUpperCase())}
            placeholder="EQUIPO VISITANTE"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[13px] font-black text-red-400 uppercase outline-none focus:border-red-500/50"
          />
        </section>

        {/* Orientación del partido. Sin este dato las zonas quedarían sin
            perspectiva y no podría reconstruirse después. */}
        <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">
            ¿Qué portería defiende tu equipo en la 1ª parte?
          </p>
          <p className="text-[9px] text-slate-600 mb-3 leading-relaxed">
            Sirve para leer todas las zonas desde la perspectiva del equipo que ataca.
            El cambio de campo del descanso se aplica solo.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'left' as const, label: 'Izquierda', hint: 'Atacamos hacia la derecha' },
              { value: 'right' as const, label: 'Derecha', hint: 'Atacamos hacia la izquierda' },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTeamDefendsAtKickoff(opt.value)}
                className={`py-3 px-2 rounded-xl border text-center transition-all ${
                  teamDefendsAtKickoff === opt.value
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="block text-[11px] font-black uppercase">{opt.label}</span>
                <span className="block text-[8px] mt-0.5 opacity-70">{opt.hint}</span>
              </button>
            ))}
          </div>
        </section>

        {/* CONVOCATORIA: plantilla contra los que van a este partido */}
        <section>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
              <span className="text-slate-400">Plantilla</span>
              <span className="text-white">{locales.length}</span>
              <span className="text-slate-600">·</span>
              <span className="text-blue-300">Convocados</span>
              <span className="text-white">{convocados.length}</span>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Solo los convocados juegan
            </span>
          </div>
          {squadNotice && (
            <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-bold text-amber-300">
              {squadNotice}
            </p>
          )}
        </section>

        {/* Starters */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <UserCheck size={14} className="text-green-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-white">Titulares</span>
              <span className="text-[10px] font-black text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">{starters.length}</span>
            </div>
          </div>
          <div className="space-y-2">
            {starters.map(p => (
              <PlayerRow
                key={p.id} player={p}
                isEditing={editingId === p.id}
                editName={editName} editNumber={editNumber} editRole={editRole}
                onEdit={() => startEdit(p)}
                onConfirm={confirmEdit}
                onCancel={() => setEditingId(null)}
                onToggleStarter={() => toggleStarter(p.id)}
                onToggleCalledUp={() => toggleCalledUp(p.id)}
                isCalledUp={isCalledUp(p.id)}
                onRemove={() => removePlayer(p.id)}
                setEditName={setEditName} setEditNumber={setEditNumber} setEditRole={setEditRole}
              />
            ))}
          </div>
        </section>

        {/* Bench */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <UserMinus size={14} className="text-slate-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Suplentes</span>
              <span className="text-[10px] font-black text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{bench.length}</span>
            </div>
            <button
              onClick={addPlayer}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <Plus size={11} /> Añadir
            </button>
          </div>
          <div className="space-y-2">
            {bench.map(p => (
              <PlayerRow
                key={p.id} player={p}
                isEditing={editingId === p.id}
                editName={editName} editNumber={editNumber} editRole={editRole}
                onEdit={() => startEdit(p)}
                onConfirm={confirmEdit}
                onCancel={() => setEditingId(null)}
                onToggleStarter={() => toggleStarter(p.id)}
                onToggleCalledUp={() => toggleCalledUp(p.id)}
                isCalledUp={isCalledUp(p.id)}
                onRemove={() => removePlayer(p.id)}
                setEditName={setEditName} setEditNumber={setEditNumber} setEditRole={setEditRole}
              />
            ))}
            {bench.length === 0 && (
              <p className="text-[10px] text-slate-600 text-center py-3 italic">Sin suplentes</p>
            )}
          </div>
        </section>

        {/* No convocados: siguen en la plantilla, no van a este partido */}
        {noConvocados.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <UserMinus size={14} className="text-slate-600" />
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">No convocados</span>
                <span className="text-[10px] font-black text-slate-600 bg-white/5 px-2 py-0.5 rounded-full">{noConvocados.length}</span>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-700">
                Siguen en la plantilla
              </span>
            </div>
            <div className="space-y-2 opacity-60">
              {noConvocados.map(p => (
                <PlayerRow
                  key={p.id} player={p}
                  isEditing={editingId === p.id}
                  editName={editName} editNumber={editNumber} editRole={editRole}
                  onEdit={() => startEdit(p)}
                  onConfirm={confirmEdit}
                  onCancel={() => setEditingId(null)}
                  onToggleStarter={() => toggleStarter(p.id)}
                  onToggleCalledUp={() => toggleCalledUp(p.id)}
                  isCalledUp={false}
                  onRemove={() => removePlayer(p.id)}
                  setEditName={setEditName} setEditNumber={setEditNumber} setEditRole={setEditRole}
                />
              ))}
            </div>
          </section>
        )}

        <div className="h-28" /> {/* Padding for bottom button */}
      </div>

      {/* ── START MATCH BUTTON ───────────────────────────────── */}
      <div className="shrink-0 px-4 pb-6 pt-3 bg-gradient-to-t from-[#0A0B0E] to-transparent">
        <button
          onClick={startMatch}
          className="w-full py-5 bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl flex items-center justify-center gap-3 text-white font-black text-[14px] uppercase tracking-widest shadow-2xl shadow-blue-900/50 hover:from-blue-500 hover:to-blue-400 transition-all active:scale-[0.98]"
        >
          <Play size={18} className="fill-white" />
          Iniciar Partido
        </button>
      </div>
    </div>
  );
}

// ─── PlayerRow subcomponent ───────────────────────────────────────
function PlayerRow({
  player, isEditing,
  editName, editNumber, editRole,
  onEdit, onConfirm, onCancel,
  onToggleStarter, onToggleCalledUp, isCalledUp, onRemove,
  setEditName, setEditNumber, setEditRole,
}: {
  player: TemplatPlayer;
  isEditing: boolean;
  editName: string; editNumber: number; editRole: Role;
  onEdit: () => void; onConfirm: () => void; onCancel: () => void;
  onToggleStarter: () => void;
  onToggleCalledUp: () => void;
  isCalledUp: boolean;
  onRemove: () => void;
  setEditName: (v: string) => void;
  setEditNumber: (v: number) => void;
  setEditRole: (v: Role) => void;
}) {
  const roleColor = ROLE_COLORS[player.role] || '#64748b';

  if (isEditing) {
    return (
      <div className="bg-blue-950/30 border border-blue-500/20 rounded-2xl p-3 space-y-2">
        <div className="flex gap-2">
          <input
            type="number"
            value={editNumber}
            onChange={e => setEditNumber(Number(e.target.value))}
            className="w-14 bg-white/10 border border-white/10 rounded-xl px-2 py-2 text-[12px] font-black text-center text-white outline-none"
          />
          <input
            autoFocus
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="flex-1 bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-[12px] font-black text-white outline-none"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={editRole}
            onChange={e => setEditRole(e.target.value as Role)}
            className="flex-1 bg-white/10 border border-white/10 rounded-xl px-2 py-2 text-[11px] font-black text-white outline-none"
          >
            {Object.values(Role).map(r => (
              <option key={r} value={r} className="bg-slate-900">{ROLE_LABELS[r] || r}</option>
            ))}
          </select>
          <button onClick={onConfirm} className="px-4 py-2 bg-green-500/20 border border-green-500/40 rounded-xl text-green-400">
            <Check size={14} />
          </button>
          <button onClick={onCancel} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-slate-400">
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-2xl px-3 py-2.5">
      {/* Convocatoria: si va o no a este partido. Es una pregunta distinta
          de "sale de inicio", y por eso es un botón distinto. */}
      <button
        onClick={onToggleCalledUp}
        title={isCalledUp ? 'Convocado · quitar del partido' : 'No convocado · convocar'}
        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-all ${
          isCalledUp
            ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300'
            : 'bg-white/5 border border-white/10 text-slate-600'
        }`}
      >
        {isCalledUp ? <UserCheck size={11} /> : <UserMinus size={11} />}
      </button>

      {/* Titular: de los convocados, quién sale de inicio */}
      <button
        onClick={onToggleStarter}
        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-all ${
          player.isStarter
            ? 'bg-green-500/20 border border-green-500/30 text-green-400'
            : 'bg-white/5 border border-white/10 text-slate-600'
        }`}
      >
        <Star size={11} className={player.isStarter ? 'fill-green-400' : ''} />
      </button>

      {/* Number */}
      <span className="w-7 text-center text-[13px] font-black shrink-0" style={{ color: roleColor }}>
        {player.number}
      </span>

      {/* Name */}
      <span className="flex-1 text-[12px] font-black text-white truncate">{player.name}</span>

      {/* Role badge */}
      <span className="text-[9px] font-black px-2 py-0.5 rounded-lg shrink-0"
        style={{ background: `${roleColor}20`, color: roleColor }}>
        {ROLE_LABELS[player.role] || player.role}
      </span>

      {/* Edit */}
      <button onClick={onEdit} className="w-7 h-7 rounded-xl bg-white/5 flex items-center justify-center text-slate-500 hover:text-white shrink-0">
        <Edit3 size={11} />
      </button>

      {/* Remove */}
      <button onClick={onRemove} className="w-7 h-7 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500/60 hover:text-red-400 shrink-0">
        <Trash2 size={11} />
      </button>
    </div>
  );
}
