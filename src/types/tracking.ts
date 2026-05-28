// ── TIPOS PARA EL SISTEMA DE TRACKING EN TIEMPO REAL ──────────

export type TeamColor = 
  | 'red' | 'blue' | 'green' | 'yellow' | 'white' 
  | 'black' | 'orange' | 'purple' | 'pink' | 'cyan';

export const TEAM_COLOR_LABELS: Record<TeamColor, string> = {
  red: 'Rojo', blue: 'Azul', green: 'Verde', yellow: 'Amarillo',
  white: 'Blanco', black: 'Negro', orange: 'Naranja',
  purple: 'Morado', pink: 'Rosa', cyan: 'Celeste',
};

export const TEAM_COLOR_HEX: Record<TeamColor, string> = {
  red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308',
  white: '#f8fafc', black: '#1e293b', orange: '#f97316',
  purple: '#a855f7', pink: '#ec4899', cyan: '#06b6d4',
};

export type CalibrationPoint = { x: number; y: number }; // píxeles en imagen

export type TrackingConfig = {
  localColor: TeamColor;
  rivalColor: TeamColor;
  calibrationPoints: CalibrationPoint[]; // 4 esquinas: TL, TR, BR, BL
  wsUrl: string;
};

// ── TIPOS DEL STREAM WEBSOCKET ──────────────────────────────────

export type TrackedPlayer = {
  id: string;
  x_m: number;   // posición en metros (0-20 ancho)
  y_m: number;   // posición en metros (0-40 largo)
  equipo: 'local' | 'rival';
  numero?: number;
  velocidad_kmh?: number;
};

export type TrackedBall = {
  x_m: number;
  y_m: number;
};

export type TacticalAlert = {
  tipo_evento: string;
  descripcion: string;
  zona?: string;
  jugadores?: string[];
  frame?: number;
};

export type TrackingFrame = {
  frame_idx: number;
  timestamp: number;
  posiciones_render: {
    local: TrackedPlayer[];
    rival: TrackedPlayer[];
    balon?: TrackedBall;
  };
  alertas_tacticas: TacticalAlert[];
  sistema_detectado?: string;
};

export type SavedPlay = {
  id: string;
  timestamp: number;
  frames: TrackingFrame[];
  evento: string;
  sistema?: string;
  alertas: TacticalAlert[];
};

export type TrackingCommand = {
  comando_accion: 'TIRO_A_PUERTA' | 'GOL' | 'RECUPERACION' | 'PERDIDA' | 'GUARDAR_JUGADA';
};
