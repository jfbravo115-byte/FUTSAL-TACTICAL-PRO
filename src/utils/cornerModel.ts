/**
 * src/utils/cornerModel.ts
 *
 * Modelo del córner. Función pura, sin React y sin DOM.
 *
 * DOS CAMPOS ESPACIALES, A PROPÓSITO
 * ----------------------------------
 * Un córner ocurre físicamente en una esquina, no en una celda. Por eso el
 * evento guarda dos cosas que no compiten entre sí:
 *
 *   metadata.cornerSide : 'left' | 'right'  ← DATO AUTORITATIVO
 *       La esquina real desde la que se saca, en la perspectiva del equipo
 *       que ejecuta. No se deriva de nada y no puede perderse.
 *
 *   originGrid : 'Z4L' | 'Z4R'              ← ENLACE DERIVADO
 *       Vincula el córner con la nomenclatura de 12 zonas para que entre en
 *       los mapas y agregados junto al resto de acciones.
 *
 * En la pista, un córner se dibuja como MARCADOR en el vértice real, nunca
 * como celda coloreada: solo suma a `Z4L`/`Z4R` cuando se piden totales por
 * zona. Ver ZoneHeatLayer.
 *
 * SUBTIPO TIRO / JUGADA — FASE 4
 * ------------------------------
 * En Fase 3 NO se guarda absolutamente nada sobre el desenlace del córner.
 * Esa omisión es la que garantiza que añadir el subtipo después no obligue a
 * migrar: un `metadata.cornerOutcome?: 'shot' | 'play'` opcional es
 * puramente aditivo, y su AUSENCIA significa "no registrado" — nunca se
 * infiere si un córner acabó en tiro o en jugada.
 *
 * (Guardar hoy un `cornerOutcome: 'unknown'` por defecto sí obligaría a
 * migrar más adelante. De ahí que no exista el campo.)
 */
import { ActionType, GameEvent } from "../types/futsal";
import { formatSetPieceOutcome } from "./setPieceModel";
import { Zone12Id, ZoneLane, makeZone12 } from "./fieldZones";

export type CornerSide = "left" | "right";

/** Franja del córner: siempre la más ofensiva, junto a la portería rival. */
const CORNER_BAND = 4 as const;

const SIDE_TO_LANE: Record<CornerSide, ZoneLane> = { left: "L", right: "R" };

export function isCornerSide(raw: unknown): raw is CornerSide {
  return raw === "left" || raw === "right";
}

/** Sector de 12 zonas con el que se integra un córner en mapas y agregados. */
export function cornerOriginGrid(side: CornerSide): Zone12Id {
  return makeZone12(CORNER_BAND, SIDE_TO_LANE[side]);
}

/** Inversa de cornerOriginGrid. Devuelve null si el sector no es de esquina. */
export function cornerSideFromGrid(raw: unknown): CornerSide | null {
  if (raw === cornerOriginGrid("left")) return "left";
  if (raw === cornerOriginGrid("right")) return "right";
  return null;
}

/** Espejo de presentación, coherente con mirrorZone12. */
export function mirrorCornerSide(side: CornerSide): CornerSide {
  return side === "left" ? "right" : "left";
}

const SIDE_LABEL: Record<CornerSide, string> = {
  left: "izquierda",
  right: "derecha",
};

export function formatCornerSideLabel(side: CornerSide): string {
  return SIDE_LABEL[side];
}

/** `"Córner · izquierda"`. */
export function formatCornerLabel(side: CornerSide): string {
  return `Córner · ${SIDE_LABEL[side]}`;
}

/**
 * Etiqueta de un córner concreto para Historial y listados.
 *
 *   "Córner · izquierda · Tiro"   lado y desenlace registrados
 *   "Córner · izquierda"          sin desenlace: no se inventa
 *   "Córner"                      sin lado ni desenlace
 *
 * Nunca devuelve el código interno: el Historial llegó a imprimir `CORNER`
 * en crudo porque no había ninguna etiqueta para este tipo.
 */
export function formatCornerEventLabel(event: GameEvent): string {
  const side = isCornerSide(event.metadata?.cornerSide)
    ? (event.metadata!.cornerSide as CornerSide)
    : cornerSideFromGrid(event.originGrid);
  const outcome = formatSetPieceOutcome(event);
  return ["Córner", side ? SIDE_LABEL[side] : null, outcome].filter(Boolean).join(" · ");
}

// ── AGREGADOS ───────────────────────────────────────────────────────────

export type CornerSummary = {
  total: number;
  left: number;
  right: number;
  /** Córners registrados sin lado — no se reparten ni se adivinan. */
  unspecified: number;
};

export function isCornerEvent(event: GameEvent): boolean {
  return event.type === ActionType.CORNER;
}

/**
 * Resume los córners de un equipo. `opponent` selecciona el bando igual que
 * el resto de agregados de la app: `metadata.isOpponent`.
 */
export function summarizeCorners(events: GameEvent[], opponent = false): CornerSummary {
  const corners = events.filter(
    (e) => isCornerEvent(e) && !!e.metadata?.isOpponent === opponent,
  );

  let left = 0;
  let right = 0;
  let unspecified = 0;

  for (const corner of corners) {
    const side = isCornerSide(corner.metadata?.cornerSide)
      ? (corner.metadata!.cornerSide as CornerSide)
      : cornerSideFromGrid(corner.originGrid);

    if (side === "left") left += 1;
    else if (side === "right") right += 1;
    else unspecified += 1;
  }

  return { total: corners.length, left, right, unspecified };
}

/**
 * `"Córners: 6 — izquierda 4 · derecha 2"`.
 *
 * Devuelve null si no hay ninguno: no se redactan frases sobre datos que no
 * existen. Los córners sin lado registrado se declaran explícitamente en vez
 * de repartirse.
 */
export function describeCorners(summary: CornerSummary): string | null {
  if (summary.total === 0) return null;

  const parts = [`izquierda ${summary.left}`, `derecha ${summary.right}`];
  if (summary.unspecified > 0) {
    parts.push(`sin lado registrado ${summary.unspecified}`);
  }

  return `Córners: ${summary.total} — ${parts.join(" · ")}`;
}
