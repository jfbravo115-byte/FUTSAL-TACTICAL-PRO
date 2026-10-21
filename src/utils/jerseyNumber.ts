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
 * Un partido puede empezar sin conocer la alineación rival. Lo señala una
 * marca propia, `jerseyNumberKnown: false`, y NO un valor reservado: si el
 * editor admite el 0 —hay competiciones que lo permiten—, usar el 0 como
 * «no lo sé» confundiría tres cosas distintas:
 *
 *   · un dorsal real 0;
 *   · un dorsal todavía por conocer;
 *   · el 0 histórico del cuerpo técnico, que nunca fue un dorsal.
 *
 * Con la marca, ningún número queda prohibido y nada colisiona. Y su AUSENCIA
 * significa conocido, que es lo que hace compatible cualquier partido
 * guardado antes: allí el dorsal siempre estaba puesto.
 */
import { Player, Role } from "../types/futsal";

/**
 * El número que se guarda mientras no se sabe cuál es.
 *
 * Es solo un relleno: quien manda es `jerseyNumberKnown`. Un jugador con
 * dorsal real 0 lleva el mismo número y la marca en `true`, y se distinguen.
 */
export const UNKNOWN_PLACEHOLDER = 0;

/**
 * Rango que admite el editor rápido: 0–99.
 *
 * El modelo no declara ninguno, así que esto es una regla DEL EDITOR, no del
 * dato: un dorsal de futbol sala va de 1 a 99 y el 0 queda reservado para el
 * desconocido. Nada de lo ya guardado se revisa ni se corrige con esta regla.
 */
export const JERSEY_MIN = 0;
export const JERSEY_MAX = 99;

/** Lo mínimo que hace falta para saber si un dorsal se conoce. */
export type ConDorsal = { number: number; jerseyNumberKnown?: boolean };

/**
 * ¿Está este dorsal por conocer?
 *
 * Solo lo dice la marca. Un `number` cualquiera —0 incluido— es un dorsal
 * legítimo mientras nadie haya declarado lo contrario, y un partido antiguo,
 * sin marca, tiene todos sus dorsales conocidos.
 */
export function isJerseyUnknown(p: ConDorsal | undefined | null): boolean {
  return !!p && p.jerseyNumberKnown === false;
}

/** Lo que se pinta: el número, o `?` si aún no se sabe. */
export function formatJerseyNumber(p: ConDorsal | undefined | null): string {
  if (!p) return "?";
  if (isJerseyUnknown(p)) return "?";
  const n = Number(p.number);
  return Number.isFinite(n) ? String(Math.trunc(n)) : "?";
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
  if (limpio === "") return { ok: true, value: UNKNOWN_PLACEHOLDER };
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
  return isJerseyUnknown(player) ? provisionalLabel(player, players) : player.name;
}

/** Rótulo corto para la ficha: «POR ?», «?», «7». */
export function shortJerseyLabel(player: Player): string {
  const dorsal = formatJerseyNumber(player);
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
  const sujeto = players.find((p) => p.id === playerId);
  if (!sujeto) return null;
  return (
    players.find(
      (p) =>
        p.id !== playerId &&
        !!p.isOpponent === !!sujeto.isOpponent &&
        p.role !== Role.COACH &&
        p.role !== Role.DELEGATE &&
        // Quien todavía no tiene dorsal no ocupa ninguno: varios jugadores
        // pueden estar pendientes de número a la vez sin estorbarse.
        !isJerseyUnknown(p) &&
        p.number === number,
    ) ?? null
  );
}

// ── LAS DOS ÚNICAS ESCRITURAS ───────────────────────────────────────────
//
// Las dos devuelven una plantilla nueva en la que SOLO cambia `number`. Ni
// id, ni tiempos, ni estadísticas, ni posición, ni pista/banquillo.

/**
 * Asignar un dorsal. Cualquiera, incluido el 0: a partir de aquí se conoce.
 */
export function setPlayerNumber(players: Player[], playerId: string, number: number): Player[] {
  return players.map((p) => (p.id === playerId ? { ...p, number, jerseyNumberKnown: true } : p));
}

/**
 * Volver a «no lo sé». El número que quede debajo da igual: lo que manda es
 * la marca, y el `id` del jugador no se toca.
 */
export function markJerseyUnknown(players: Player[], playerId: string): Player[] {
  return players.map((p) =>
    p.id === playerId ? { ...p, number: UNKNOWN_PLACEHOLDER, jerseyNumberKnown: false } : p,
  );
}

/**
 * ¿Qué operación toca cuando el dorsal pedido ya lo lleva otro?
 *
 * No siempre es un intercambio. Si quien edita TODAVÍA NO TIENE DORSAL, no
 * hay nada que dar a cambio: su `number` es un relleno que nadie ha
 * confirmado, y entregárselo al otro inventaría un dorsal.
 */
export type JerseyTakeover = "intercambiar" | "reasignar";

export function takeoverKind(editado: Player | undefined | null): JerseyTakeover {
  return isJerseyUnknown(editado) ? "reasignar" : "intercambiar";
}

/**
 * REASIGNAR · el que no tenía dorsal se queda con el de otro.
 *
 * A toma el número de B y pasa a conocido. B NO recibe nada a cambio: se
 * queda sin dorsal conocido y se muestra como `?`, conservando por debajo su
 * propio número —no el relleno de A— por si hubo un error y hay que
 * devolvérselo. Ese número ya no se enseña ni ocupa dorsal: para eso manda
 * `jerseyNumberKnown`.
 *
 * No es simétrico, y por eso no se llama intercambio.
 */
export function reassignJerseyNumber(players: Player[], fromId: string, holderId: string): Player[] {
  const a = players.find((p) => p.id === fromId);
  const b = players.find((p) => p.id === holderId);
  if (!a || !b || a.id === b.id) return players;
  return players.map((p) =>
    p.id === fromId
      ? { ...p, number: b.number, jerseyNumberKnown: true }
      : p.id === holderId
        ? { ...p, jerseyNumberKnown: false }   // conserva SU número, oculto
        : p,
  );
}

export function swapPlayerNumbers(players: Player[], aId: string, bId: string): Player[] {
  const a = players.find((p) => p.id === aId);
  const b = players.find((p) => p.id === bId);
  if (!a || !b || a.id === b.id) return players;
  // Los dos acaban con un dorsal conocido: el del otro.
  return players.map((p) =>
    p.id === aId
      ? { ...p, number: b.number, jerseyNumberKnown: true }
      : p.id === bId
        ? { ...p, number: a.number, jerseyNumberKnown: true }
        : p,
  );
}
