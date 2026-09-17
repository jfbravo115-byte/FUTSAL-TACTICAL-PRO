/**
 * src/utils/fieldZones.ts
 *
 * Modelo espacial NUEVO de la pista: 4 franjas longitudinales × 3 carriles
 * = 12 sectores. Función pura, sin React y sin DOM.
 *
 * SEMÁNTICA (no negociable, de ella dependen todos los mapas e informes):
 *
 *   PORTERÍA PROPIA → Zona 1 → Zona 2 → Zona 3 → Zona 4 → PORTERÍA RIVAL
 *
 * y dentro de cada zona, izquierda / centro / derecha.
 *
 * El identificador se guarda YA NORMALIZADO a la perspectiva del equipo que
 * ejecuta la acción. Es decir: "Z1L" significa siempre "cerca de MI portería,
 * por MI izquierda", tanto en 1ª como en 2ª parte y tanto para mi equipo como
 * para el rival (cada uno desde la suya). Ningún lector necesita conocer la
 * dirección de ataque para analizar.
 *
 * Esto es deliberado: la causa raíz del desorden anterior fue que cada
 * componente interpretaba por su cuenta una rejilla guardada en coordenadas
 * de pantalla, y acabaron conviviendo tres lecturas incompatibles del mismo
 * dato. Aquí la transformación ocurre UNA vez, en el momento de capturar, y
 * nunca más.
 *
 * La posición absoluta en pista no se pierde: es recuperable combinando el id
 * con la dirección de ataque (ver attackDirection.ts).
 *
 * Los identificadores internos NUNCA se muestran al usuario: para eso están
 * formatZoneLabel() y las funciones de descripción de este mismo módulo.
 */
import { ActionType, GoalieAction } from "../types/futsal";

/** Franja longitudinal: 1 = junto a la portería propia, 4 = junto a la rival. */
export type ZoneBand = 1 | 2 | 3 | 4;

/** Carril transversal desde la perspectiva del equipo que ataca. */
export type ZoneLane = "L" | "C" | "R";

/** Identificador interno de sector. Formato fijo de 3 caracteres: `Z` + franja + carril. */
export type Zone12Id = `Z${ZoneBand}${ZoneLane}`;

export const ZONE_BANDS: readonly ZoneBand[] = [1, 2, 3, 4];
export const ZONE_LANES: readonly ZoneLane[] = ["L", "C", "R"];

/** Los 12 sectores, en orden de lectura: franja 1 a 4, y dentro L → C → R. */
export const ZONE_12_IDS: readonly Zone12Id[] = ZONE_BANDS.flatMap((band) =>
  ZONE_LANES.map((lane) => `Z${band}${lane}` as Zone12Id),
);

/**
 * Discriminador de sistema espacial. El prefijo `Z` es lo que permite
 * distinguir un sector nuevo de una celda legacy `A1-C3` mirando solo el
 * valor guardado, sin campo de versión y sin migrar un solo evento.
 */
export const ZONE_12_PATTERN = /^Z[1-4][LCR]$/;

export function isZone12Id(raw: unknown): raw is Zone12Id {
  return typeof raw === "string" && ZONE_12_PATTERN.test(raw);
}

export function makeZone12(band: ZoneBand, lane: ZoneLane): Zone12Id {
  return `Z${band}${lane}` as Zone12Id;
}

/** Descompone un sector. Devuelve null si el valor no es del sistema de 12 zonas. */
export function parseZone12(raw: unknown): { band: ZoneBand; lane: ZoneLane } | null {
  if (!isZone12Id(raw)) return null;
  return {
    band: Number(raw[1]) as ZoneBand,
    lane: raw[2] as ZoneLane,
  };
}

// ── ETIQUETAS DE USUARIO ────────────────────────────────────────────────
// Única vía autorizada para poner una zona delante del usuario. Ningún
// componente debe imprimir un Zone12Id crudo.

const LANE_LABEL: Record<ZoneLane, string> = {
  L: "izquierda",
  C: "centro",
  R: "derecha",
};

export function formatBandLabel(band: ZoneBand): string {
  return `Zona ${band}`;
}

export function formatLaneLabel(lane: ZoneLane): string {
  return LANE_LABEL[lane];
}

/** `Z2C` → `"Zona 2 · centro"`. Devuelve null si el id no es del sistema nuevo. */
export function formatZoneLabel(raw: unknown): string | null {
  const parsed = parseZone12(raw);
  if (!parsed) return null;
  return `${formatBandLabel(parsed.band)} · ${formatLaneLabel(parsed.lane)}`;
}

/**
 * Espejo de PRESENTACIÓN: convierte un sector a la perspectiva del equipo
 * contrario. `Z1 ↔ Z4`, `Z2 ↔ Z3`, `L ↔ R`, `C → C`.
 *
 * Se usa, por ejemplo, para mostrar una falta RECIBIDA: el evento guarda la
 * zona desde la perspectiva de quien la comete, y esta función la traduce a
 * la de quien la recibe. Es una transformación pura y sin pérdida — nunca se
 * guarda una segunda zona ni se modifica el evento original.
 */
export function mirrorZone12(raw: Zone12Id): Zone12Id;
export function mirrorZone12(raw: unknown): Zone12Id | null;
export function mirrorZone12(raw: unknown): Zone12Id | null {
  const parsed = parseZone12(raw);
  if (!parsed) return null;
  const band = (5 - parsed.band) as ZoneBand;
  const lane: ZoneLane = parsed.lane === "L" ? "R" : parsed.lane === "R" ? "L" : "C";
  return makeZone12(band, lane);
}

// ── CATÁLOGO DE ACCIONES ESPACIALES ─────────────────────────────────────
// Antes esta lista estaba duplicada en cuatro sitios distintos de
// MatchTracker.tsx (y FOUL se escapaba por una quinta vía), que es como se
// coló el hueco de las faltas sin ubicación. Fuente única a partir de aquí.

/** Acciones que registran SOLO origen en pista, sin destino en portería. */
export const ORIGIN_ONLY_ACTIONS: readonly (ActionType | GoalieAction)[] = [
  ActionType.STEAL,
  ActionType.INTERCEPTION,
  ActionType.LOSS,
  ActionType.UNFORCED_ERROR,
  ActionType.FOUL,
  ActionType.CORNER,
  // La jugada de falta se ubica desde la perspectiva de quien EJECUTA, igual
  // que el resto: el sector dice desde dónde se puso el balón en juego.
  ActionType.SET_PIECE,
];

/** Acciones que registran origen en pista Y destino en portería. */
export const ORIGIN_AND_TARGET_ACTIONS: readonly (ActionType | GoalieAction)[] = [
  ActionType.SHOT,
  ActionType.GOAL,
  GoalieAction.GOAL_CONCEDED,
  GoalieAction.SAVE,
  GoalieAction.SAVE_PARRY,
  GoalieAction.SAVE_CATCH,
  GoalieAction.SAVE_DEFLECT,
];

/**
 * GoalieAction.EXIT queda DELIBERADAMENTE fuera del catálogo de origen.
 *
 * Una salida no tiene "origen de tiro": tiene un lugar de intervención, que
 * se guarda en su propio campo `goalkeeperZone` (dominio GK1-GK5). Meterla
 * aquí haría que su
 * ubicación se contabilizara como origen en los agregados y volveríamos a
 * mezclar dos conceptos espaciales distintos, que es justo lo que Fase 4
 * viene a separar.
 */

/** Todas las acciones que admiten ubicación espacial. */
export const SPATIAL_ACTIONS: readonly (ActionType | GoalieAction)[] = [
  ...ORIGIN_ONLY_ACTIONS,
  ...ORIGIN_AND_TARGET_ACTIONS,
];

export function acceptsOrigin(type: ActionType | GoalieAction): boolean {
  return SPATIAL_ACTIONS.includes(type);
}

export function acceptsTarget(type: ActionType | GoalieAction): boolean {
  return ORIGIN_AND_TARGET_ACTIONS.includes(type);
}

/**
 * ¿La ubicación es opcional para esta acción?
 *
 * Solo las faltas: su contador reglamentario (4ª/5ª falta) debe registrarse
 * de forma inmediata e incondicional, así que la zona se ofrece DESPUÉS y
 * puede descartarse sin afectar a la falta ya contabilizada.
 */
export function originIsOptional(type: ActionType | GoalieAction): boolean {
  // La falta, porque su contador reglamentario no puede esperar a ningún paso
  // adicional. La jugada de falta, porque el botón ya dice todo lo que la
  // define: la zona es información extra y omitirla no la invalida.
  return type === ActionType.FOUL || type === ActionType.SET_PIECE;
}

// ── LECTURA TEXTUAL AGREGADA ────────────────────────────────────────────
// El usuario nunca debe tener que interpretar la rejilla a ojo: además del
// gráfico, todo mapa puede producir su equivalente en palabras.

export type ZoneTally = Record<Zone12Id, number>;

export function emptyZoneTally(): ZoneTally {
  const tally = {} as ZoneTally;
  for (const id of ZONE_12_IDS) tally[id] = 0;
  return tally;
}

/** Cuenta ids de sector, ignorando en silencio cualquier valor que no sea del sistema nuevo. */
export function tallyZones(raws: Iterable<unknown>): ZoneTally {
  const tally = emptyZoneTally();
  for (const raw of raws) {
    if (isZone12Id(raw)) tally[raw] += 1;
  }
  return tally;
}

export function bandTotal(tally: ZoneTally, band: ZoneBand): number {
  return ZONE_LANES.reduce((acc, lane) => acc + tally[makeZone12(band, lane)], 0);
}

export function tallyTotal(tally: ZoneTally): number {
  return ZONE_12_IDS.reduce((acc, id) => acc + tally[id], 0);
}

/** Sustantivo de la acción, para redactar frases en singular y plural. */
export type ActionNoun = { one: string; many: string };

export const ACTION_NOUN: Partial<Record<ActionType | GoalieAction, ActionNoun>> = {
  [ActionType.SHOT]: { one: "tiro", many: "tiros" },
  [ActionType.GOAL]: { one: "gol", many: "goles" },
  [ActionType.LOSS]: { one: "pérdida", many: "pérdidas" },
  [ActionType.UNFORCED_ERROR]: { one: "error no forzado", many: "errores no forzados" },
  [ActionType.STEAL]: { one: "recuperación", many: "recuperaciones" },
  [ActionType.INTERCEPTION]: { one: "intercepción", many: "intercepciones" },
  [ActionType.FOUL]: { one: "falta", many: "faltas" },
  [ActionType.CORNER]: { one: "córner", many: "córners" },
  [ActionType.SET_PIECE]: { one: "jugada de falta", many: "jugadas de falta" },
};

function plural(count: number, noun: ActionNoun): string {
  return count === 1 ? noun.one : noun.many;
}

/**
 * Desglose de una franja por carriles, ordenado de mayor a menor y omitiendo
 * los carriles sin datos:
 *
 *   `"Zona 2: 5 pérdidas — 3 derecha, 1 izquierda, 1 centro"`
 *
 * Devuelve null si la franja no tiene ninguna acción — no se redactan frases
 * sobre datos que no existen.
 */
export function describeBand(band: ZoneBand, tally: ZoneTally, noun: ActionNoun): string | null {
  const total = bandTotal(tally, band);
  if (total === 0) return null;

  const parts = ZONE_LANES.map((lane) => ({ lane, count: tally[makeZone12(band, lane)] }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count || ZONE_LANES.indexOf(a.lane) - ZONE_LANES.indexOf(b.lane))
    .map((p) => `${p.count} ${formatLaneLabel(p.lane)}`);

  return `${formatBandLabel(band)}: ${total} ${plural(total, noun)} — ${parts.join(", ")}`;
}

/** Una línea por franja con datos, en orden de zona 1 a 4. */
export function describeAllBands(tally: ZoneTally, noun: ActionNoun): string[] {
  return ZONE_BANDS.map((band) => describeBand(band, tally, noun)).filter(
    (line): line is string => line !== null,
  );
}

/**
 * Sector con más acciones: `"Mayor concentración de pérdidas en Zona 3 · izquierda"`.
 * Devuelve null si no hay ninguna acción ubicada.
 */
export function describeTopZone(tally: ZoneTally, noun: ActionNoun): string | null {
  const top = ZONE_12_IDS.map((id) => ({ id, count: tally[id] }))
    .filter((z) => z.count > 0)
    .sort((a, b) => b.count - a.count || ZONE_12_IDS.indexOf(a.id) - ZONE_12_IDS.indexOf(b.id))[0];

  if (!top) return null;
  return `Mayor concentración de ${noun.many} en ${formatZoneLabel(top.id)}`;
}

/** `"5 pérdidas en Zona 2 · centro"`. Devuelve null si el sector no tiene datos. */
export function describeZoneCount(id: Zone12Id, count: number, noun: ActionNoun): string | null {
  if (count <= 0) return null;
  return `${count} ${plural(count, noun)} en ${formatZoneLabel(id)}`;
}
