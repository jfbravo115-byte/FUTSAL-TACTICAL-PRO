export type PlayType =
  | 'attack_positional'
  | 'attack_counter'
  | 'defense_zone'
  | 'defense_man'
  | 'defense_high_press'
  | 'defense_low_block'
  | 'defense_mid_block'
  | 'superiority_5x4'
  | 'inferiority_4x5'
  | 'set_piece'
  | 'goalkeeper_player'
  | 'free';

export const PLAY_TYPE_LABELS: Record<PlayType, string> = {
  attack_positional: 'Ataque Posicional',
  attack_counter: 'Contraataque',
  defense_zone: 'Defensa en Zona',
  defense_man: 'Defensa Individual',
  defense_high_press: 'Presión Alta',
  defense_low_block: 'Bloque Bajo',
  defense_mid_block: 'Bloque Medio',
  superiority_5x4: 'Superioridad 5×4',
  inferiority_4x5: 'Inferioridad 4×5',
  set_piece: 'Jugada a Balón Parado',
  goalkeeper_player: 'Portero-Jugador',
  free: 'Análisis Libre',
};

export const PLAY_TYPE_COLORS: Record<PlayType, string> = {
  attack_positional: '#34d399',
  attack_counter: '#fbbf24',
  defense_zone: '#60a5fa',
  defense_man: '#818cf8',
  defense_high_press: '#f87171',
  defense_low_block: '#94a3b8',
  defense_mid_block: '#64748b',
  superiority_5x4: '#a78bfa',
  inferiority_4x5: '#fb923c',
  set_piece: '#e879f9',
  goalkeeper_player: '#2dd4bf',
  free: '#e2e8f0',
};

export type PathType = 'run' | 'pass' | 'shot' | 'block';

export const PATH_TYPE_LABELS: Record<PathType, string> = {
  run: 'Desplazamiento',
  pass: 'Pase',
  shot: 'Tiro',
  block: 'Bloqueo',
};

export type TacticalPlayerMarker = {
  id: string;
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  number: number;
  isOpponent: boolean;
  isGoalkeeper: boolean;
};

export type TacticalPath = {
  id: string;
  playerId?: string; // linked player
  points: { x: number; y: number }[]; // normalized 0-1
  pathType: PathType;
  color: string;
};

export type TacticalPlay = {
  id?: string;
  userId: string;
  name: string;
  playType: PlayType;
  players: TacticalPlayerMarker[];
  paths: TacticalPath[];
  notes: string;
  createdAt: string;
  matchId?: string;
};
