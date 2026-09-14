export enum Role {
  GOALKEEPER = 'GOALKEEPER',
  PLAYER = 'PLAYER',
  WING = 'WING',
  PIVOT = 'PIVOT',
  DEFENSE = 'DEFENSE',
  COACH = 'COACH',
  DELEGATE = 'DELEGATE',
}

export enum Period {
  FIRST = 0,
  SECOND = 1,
  OVERTIME_1 = 2,
  OVERTIME_2 = 3,
  FINISHED = 4,
}

export enum GameState {
  FOUR_VS_FOUR = '4vs4',
  PJ_ATTACK = 'PJ Ataque',
  PJ_DEFENSE = 'PJ Defensa',
  SUPERIORITY = 'Superioridad',
  INFERIORITY = 'Inferioridad',
  THREE_VS_THREE = '3vs3',
}

export enum ActionType {
  GOAL = 'GOAL',
  SHOT = 'SHOT',
  ASSIST = 'ASSIST',
  FOUL = 'FOUL',
  STEAL = 'STEAL',
  INTERCEPTION = 'INTERCEPTION',
  LOSS = 'LOSS',
  UNFORCED_ERROR = 'UNFORCED_ERROR',
  YELLOW_CARD = 'YELLOW_CARD',
  RED_CARD = 'RED_CARD',
  CORNER = 'CORNER',
  SUBSTITUTION = 'SUBSTITUTION',
  TIMEOUT = 'TIMEOUT',
  FORMATION_CHANGE = 'FORMATION_CHANGE',
}

export enum GoalieAction {
  SAVE = 'SAVE',
  SAVE_PARRY = 'SAVE_PARRY',
  SAVE_CATCH = 'SAVE_CATCH',
  GOAL_CONCEDED = 'GOAL_CONCEDED',
}

export type PlayerStats = {
  goals: number;
  assists: number;
  steals: number;
  interceptions: number;
  losses: number;
  errors: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  shots: number;
  shotsOffTarget: number;
  saves: number;
  conceded: number;
  stealsWithPossession?: number;
  stealsClearance?: number;
  lossesBadPass?: number;
  lossesBadDribble?: number;
  lossesBadControl?: number;
};

export type Player = {
  id: string;
  number: number;
  name: string;
  role: Role;
  isOnPitch: boolean;
  pitchPosition?: number;
  plusMinus: number;
  individualTimeSeconds: number;
  // Tiempo (segundos) transcurrido desde la última entrada a pista. Se
  // reinicia a 0 en cada entrada (titular en el saque inicial cuenta como
  // una entrada) y deja de incrementarse al salir — el valor queda
  // congelado hasta la siguiente entrada, momento en que vuelve a 0.
  // Opcional para aceptar datos guardados anteriores sin este campo
  // (se trata como 0 en ese caso, igual que otras stats opcionales).
  rotationTimeSeconds?: number;
  isStarter?: boolean;
  isOpponent: boolean;
  stats: PlayerStats;
};

export type GameEvent = {
  id: string;
  timestamp: number;
  wallClock: number;
  period: Period;
  playerIds: string[];
  onPitchPlayerIds?: string[];
  type: ActionType | GoalieAction;
  gameState: GameState;
  originGrid?: string;
  destinationGrid?: string;
  /**
   * Dirección de ataque del equipo que EJECUTA la acción, en el momento del
   * evento. Desnormalizado a propósito: hace que el evento sea autodescriptivo
   * y por tanto inmune a una edición posterior de la cabecera del partido.
   *
   * Ausente = evento legacy, anterior al sistema de 12 zonas. Su ausencia
   * NUNCA se rellena por defecto ni se deduce: sin este dato la perspectiva
   * real es desconocida y así debe presentarse.
   */
  attackDirection?: 'ltr' | 'rtl';
  metadata?: Record<string, any>;
  scoreAtEvent?: { team: number; opponent: number };
};

export type MatchData = {
  teamName: string;
  opponentName: string;
  teamLogo?: string;
  opponentLogo?: string;
  period: Period;
  matchClock: number;
  isClockRunning: boolean;
  fouls: { team: number; opponent: number };
  timeoutsUsed: {
    team: { period1: boolean; period2: boolean };
    opponent: { period1: boolean; period2: boolean };
  };
  players: Player[];
  events: GameEvent[];
  timestamp?: string;
  tacticalAnalysis?: string;
  /**
   * Portería que defiende MI EQUIPO en la 1ª parte, sobre la pista horizontal
   * de captura. Es el único dato desde el que se deriva la perspectiva de
   * ataque de cualquier evento (ver src/utils/attackDirection.ts).
   *
   * Ausente = partido legacy: no se registró la orientación y no puede
   * reconstruirse. No inventar un valor por defecto al leer.
   */
  teamDefendsAtKickoff?: 'left' | 'right';
};

export type SavedMatch = MatchData & { id: string };
