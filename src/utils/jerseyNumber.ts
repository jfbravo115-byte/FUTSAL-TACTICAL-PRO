/**
 * src/utils/jerseyNumber.ts
 *
 * EL DORSAL ES UNA ETIQUETA, NO LA IDENTIDAD.
 *
 * La identidad de un jugador es `player.id`, y es lo único que guardan los
 * eventos (`playerIds: string[]`). Ningún evento, exportación ni informe
 * congela el número: todos lo resuelven leyendo el jugador por su id en el
 * momento de pintar. Por eso corregir un dorsal a mitad de partido es seguro:
 * cambia la etiqueta y todo lo demás sigue apuntando al mismo jugador.
 *
 * EL CONTRATO QUE YA HABÍA
 * ------------------------
 * `Player.number` es un `number` obligatorio y sin rango declarado. El cuerpo
 * técnico se crea con 0, la pantalla de preparación escribe `Number(input)`
 * sin mínimo ni máximo, y los jugadores nuevos toman `max + 1`. Nada de eso
 * se toca aquí.
 *
 * DORSAL DESCONOCIDO
 * ------------------
 * Un partido puede empezar sin conocer la alineación rival. `0` significa
 * «todavía no lo sé», que es el valor que ya usaba el cuerpo técnico y que
 * ningún jugador real lleva: así no hace falta cambiar el tipo ni migrar un
 * solo partido antiguo, donde el dorsal siempre estaba puesto.
 */
import { Player, Role } from "../types/futsal";

/** «Todavía no lo sé». Coincide con el 0 que ya usaba el cuerpo técnico. */
export const UNKNOWN_NUMBER = 0;

/**
 * Rango que admite el editor rápido: 0–99.
 *
 * El modelo no declara ninguno, así que esto es una regla DEL EDITOR, no del
 * dato: un dorsal de futbol sala va de 1 a 99 y el 0 queda reservado para el
 * desconocido. Nada de lo ya guardado se revisa ni se corrige con esta regla.
 */
export const JERSEY_MIN = 0;
export const JERSEY_MAX = 99;

export function isUnknownNumber(n: number | undefined | null): boolean {
  return !Number.isFinite(Number(n)) || Number(n) === UNKNOWN_NUMBER;
}

/** Lo que se pinta en la ficha: el número, o `?` si aún no se sabe. */
export function formatJerseyNumber(n: number | undefined | null): string {
  return isUnknownNumber(n) ? "?" : String(Math.trunc(Number(n)));
}

export type JerseyParse =
  | { ok: true; value: number }
  | { ok: false; reason: "vacio" | "no-numerico" | "fuera-de-rango" };

/**
 * Normaliza lo que se teclea: espacios, ceros a la izquierda, vacío, letras.
 *
 * El vacío NO es un error silencioso: significa «desconocido», que es una
 * respuesta legítima en mitad de un partido y la que hace falta cuando el
 * analista se equivoca y quiere volver atrás.
 */
export function parseJerseyInput(raw: string): JerseyParse {
  const limpio = (raw ?? "").trim();
  if (limpio === "") return { ok: true, value: UNKNOWN_NUMBER };
  if (!/^\d+$/.test(limpio)) return { ok: false, reason: "no-numerico" };
  const n = Number(limpio);              // "007" → 7
  if (n < JERSEY_MIN || n > JERSEY_MAX) return { ok: false, reason: "fuera-de-rango" };
  return { ok: true, value: n };
}

export const JERSEY_ERROR_TEXT: Record<Exclude<JerseyParse, { ok: true }>["reason"], string> = {
  vacio: "Escribe un dorsal o deja el campo vacío para dejarlo sin asignar",
  "no-numerico": "El dorsal solo admite números",
  "fuera-de-rango": `El dorsal va de ${JERSEY_MIN} a ${JERSEY_MAX}`,
};

// ── IDENTIFICADOR PROVISIONAL ───────────────────────────────────────────

const ABECEDARIO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Jugadores de un equipo, sin cuerpo técnico y en orden estable por id. */
function plantillaDe(players: Player[], isOpponent: boolean): Player[] {
  return players
    .filter((p) => !!p.isOpponent === isOpponent && p.role !== Role.COACH && p.role !== Role.DELEGATE)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * «RIVAL C», «LOCAL B»… para quien todavía no tiene dorsal.
 *
 * La letra sale de la POSICIÓN DEL JUGADOR en su plantilla, no del orden
 * entre los desconocidos: así, en cuanto a uno se le asigna su número, los
 * demás no se renombran. Dos jugadores con `?` nunca comparten etiqueta.
 */
export function provisionalLabel(player: Player, players: Player[]): string {
  const plantilla = plantillaDe(players, !!player.isOpponent);
  const i = plantilla.findIndex((p) => p.id === player.id);
  const indice = i < 0 ? plantilla.length : i;
  const letra =
    indice < ABECEDARIO.length
      ? ABECEDARIO[indice]
      : `${ABECEDARIO[indice % ABECEDARIO.length]}${Math.floor(indice / ABECEDARIO.length)}`;
  return `${player.isOpponent ? "RIVAL" : "LOCAL"} ${letra}`;
}

/** Cómo llamar a un jugador en pantalla: su nombre, o su etiqueta provisional. */
export function playerLabel(player: Player, players: Player[]): string {
  return isUnknownNumber(player.number) ? provisionalLabel(player, players) : player.name;
}

/** Rótulo corto para la ficha: «POR ?», «?», «7». */
export function shortJerseyLabel(player: Player): string {
  const dorsal = formatJerseyNumber(player.number);
  return player.role === Role.GOALKEEPER ? `POR ${dorsal}` : dorsal;
}

// ── DUPLICADOS ──────────────────────────────────────────────────────────

/**
 * Quién lleva YA ese dorsal en el MISMO equipo, si alguien lo lleva.
 *
 * Nunca se compara entre equipos: que el 7 rival exista no impide que
 * nuestro 7 exista. Y el desconocido no duplica: varios jugadores pueden
 * estar pendientes de número a la vez.
 */
export function duplicateHolder(
  players: Player[],
  playerId: string,
  number: number,
): Player | null {
  if (isUnknownNumber(number)) return null;
  const sujeto = players.find((p) => p.id === playerId);
  if (!sujeto) return null;
  return (
    players.find(
      (p) =>
        p.id !== playerId &&
        !!p.isOpponent === !!sujeto.isOpponent &&
        p.role !== Role.COACH &&
        p.role !== Role.DELEGATE &&
        p.number === number,
    ) ?? null
  );
}

// ── LAS DOS ÚNICAS ESCRITURAS ───────────────────────────────────────────
//
// Las dos devuelven una plantilla nueva en la que SOLO cambia `number`. Ni
// id, ni tiempos, ni estadísticas, ni posición, ni pista/banquillo.

export function setPlayerNumber(players: Player[], playerId: string, number: number): Player[] {
  return players.map((p) => (p.id === playerId ? { ...p, number } : p));
}

export function swapPlayerNumbers(players: Player[], aId: string, bId: string): Player[] {
  const a = players.find((p) => p.id === aId);
  const b = players.find((p) => p.id === bId);
  if (!a || !b || a.id === b.id) return players;
  return players.map((p) =>
    p.id === aId ? { ...p, number: b.number } : p.id === bId ? { ...p, number: a.number } : p,
  );
}
