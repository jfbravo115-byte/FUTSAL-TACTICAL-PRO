export enum Role {
  GOALKEEPER = 'GOALKEEPER',
  PLAYER = 'PLAYER',
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
};

export type SavedMatch = MatchData & { id: string };
