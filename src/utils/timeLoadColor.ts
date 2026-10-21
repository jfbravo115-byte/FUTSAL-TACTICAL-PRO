/**
 * src/utils/timeLoadColor.ts
 *
 * DOS ESCALAS, NO UNA.
 *
 * TOT y ROT responden a preguntas distintas y por eso se colorean por
 * separado: «quién lleva más minutos en el partido» no es «quién lleva más
 * rato sin descansar». El que más ha jugado puede acabar de entrar, y el que
 * menos puede llevar cuatro minutos seguidos en pista. Con una sola
 * clasificación para los dos valores, ese caso —que es justo el que decide
 * una rotación— no se vería.
 *
 * Son también dos UNIVERSOS distintos:
 *
 *   · TOT compara a todos los convocados del equipo, suplentes incluidos:
 *     un jugador con cero minutos es el extremo verde de su equipo.
 *   · ROT compara solo a los que están AHORA en pista: quien está sentado no
 *     tiene rotación en curso que medir.
 *
 * Y nunca entre equipos: los minutos del rival no dicen nada sobre a quién
 * conviene refrescar en el nuestro.
 *
 * Esto es una función pura. No sabe de React, ni del DOM, ni del reloj: los
 * segundos se los dan hechos, los mismos que pintan los cronómetros.
 */

export type TimeLoadLevel = "neutral" | "low" | "mid" | "high";

export type TimeLoadColor = {
  /** Posición dentro del conjunto, 0 el que menos y 1 el que más. */
  normalized: number | null;
  level: TimeLoadLevel;
  foreground: string;
  background: string;
  border: string;
  /** Señal corta para no depender solo del color: ↓, = o ↑. */
  marker: string;
};

/** La misma regla de seguridad que el modelo temporal: lo imposible es 0. */
export function safeSeconds(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Tono continuo verde → amarillo → naranja → rojo.
 *
 * El amarillo se ancla en la mitad exacta, así que la segunda mitad recorre
 * amarillo → naranja → rojo y el naranja cae donde se espera, sobre 0,75.
 */
const VERDE = 140;
const AMARILLO = 55;
const ROJO = 0;

export function loadHue(normalized: number): number {
  const n = Math.min(1, Math.max(0, normalized));
  return n <= 0.5
    ? VERDE + ((AMARILLO - VERDE) * n) / 0.5
    : AMARILLO + ((ROJO - AMARILLO) * (n - 0.5)) / 0.5;
}

/** Gris de pizarra: «aquí no hay nada que comparar», no «carga media». */
const NEUTRO: Omit<TimeLoadColor, "normalized" | "level"> = {
  foreground: "hsl(215, 16%, 82%)",
  background: "hsl(215, 22%, 18%)",
  border: "hsl(215, 16%, 38%)",
  marker: "=",
};

function nivel(normalized: number): TimeLoadLevel {
  if (normalized < 1 / 3) return "low";
  if (normalized < 2 / 3) return "mid";
  return "high";
}

const MARCA: Record<TimeLoadLevel, string> = {
  neutral: "=",
  low: "↓",
  mid: "=",
  high: "↑",
};

/**
 * El color de un valor dentro de su conjunto.
 *
 * Si todos valen lo mismo —o solo hay uno— no hay clasificación posible y
 * sale el neutro: pintarlos a todos de rojo diría que todos están fundidos, y
 * de verde que todos están frescos. Las dos cosas serían mentira.
 */
export function timeLoadColor(value: number, values: number[]): TimeLoadColor {
  const seguro = safeSeconds(value);
  const conjunto = values.map(safeSeconds);
  const min = Math.min(...conjunto);
  const max = Math.max(...conjunto);
  // Un conjunto vacío da min=+∞ y max=-∞, y uno de un solo valor da min=max:
  // los dos caen aquí, que es donde no hay nada que clasificar.
  if (!(max > min)) return { normalized: null, level: "neutral", ...NEUTRO };

  const normalized = Math.min(1, Math.max(0, (seguro - min) / (max - min)));
  const h = loadHue(normalized);
  const level = nivel(normalized);
  return {
    normalized,
    level,
    // Texto claro sobre fondo oscuro del mismo tono: se lee a distancia de
    // tablet y aguanta el contraste en los cuatro tramos de la escala.
    foreground: `hsl(${h.toFixed(1)}, 92%, 78%)`,
    background: `hsl(${h.toFixed(1)}, 60%, 16%)`,
    border: `hsl(${h.toFixed(1)}, 70%, 42%)`,
    marker: MARCA[level],
  };
}

/** Cómo se lee el nivel en voz alta, para el `aria-label` de la cápsula. */
export const LOAD_LABEL: Record<TimeLoadLevel, string> = {
  neutral: "sin comparación posible",
  low: "menor carga del equipo",
  mid: "carga intermedia del equipo",
  high: "mayor carga del equipo",
};

export function timeLoadAriaLabel(
  kind: "tot" | "rot",
  formatted: string,
  level: TimeLoadLevel,
): string {
  const que = kind === "tot" ? "Tiempo total" : "Rotación";
  return `${que} ${formatted} · ${LOAD_LABEL[level]}`;
}

// ── LOS DOS CONJUNTOS ───────────────────────────────────────────────────
//
// Quién entra en cada escala es la mitad del asunto. Aquí se decide una vez
// y lo usan las dos cápsulas, en vez de que cada una se arme su lista.

type ConJugador = {
  id: string;
  isOpponent?: boolean;
  isOnPitch?: boolean;
  role?: string;
  individualTimeSeconds: number;
  rotationTimeSeconds?: number;
};

/** Cuerpo técnico fuera: no juegan, así que no entran en ninguna escala. */
const ROLES_FUERA = new Set(["Entrenador", "Delegado", "COACH", "DELEGATE"]);

export function esConvocado(p: ConJugador): boolean {
  return !ROLES_FUERA.has(String(p.role ?? ""));
}

export type TimeScales = {
  /** Minutos totales de TODOS los convocados del equipo, suplentes incluidos. */
  tot: number[];
  /** Rotación en curso, solo de los que están en pista. */
  rot: number[];
};

export function teamTimeScales(players: ConJugador[], isOpponent: boolean): TimeScales {
  const delEquipo = players.filter((p) => !!p.isOpponent === isOpponent && esConvocado(p));
  return {
    tot: delEquipo.map((p) => safeSeconds(p.individualTimeSeconds)),
    rot: delEquipo.filter((p) => p.isOnPitch).map((p) => safeSeconds(p.rotationTimeSeconds)),
  };
}

/** Las dos escalas de los dos equipos, calculadas de una vez por render. */
export function bothTeamsTimeScales(players: ConJugador[]): {
  team: TimeScales;
  opponent: TimeScales;
} {
  return {
    team: teamTimeScales(players, false),
    opponent: teamTimeScales(players, true),
  };
}
