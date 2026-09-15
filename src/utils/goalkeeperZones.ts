/**
 * src/utils/goalkeeperZones.ts
 *
 * Zonas de INTERVENCIÓN del portero (`GK1`-`GK5`). Función pura, sin React y
 * sin DOM.
 *
 * DOMINIO PROPIO, A PROPÓSITO
 * ---------------------------
 * No reutiliza las 12 zonas de pista. Una intervención del portero no es un
 * origen de tiro: se mide por PROFUNDIDAD respecto a su portería, no por
 * avance hacia la portería rival. Mezclarlas habría vuelto a juntar dos
 * preguntas distintas en un mismo dato, que es justo lo que Fase 3 y Fase 4
 * vienen separando.
 *
 *   originGrid      → ¿desde dónde tiran?        Z1L-Z4R
 *   destinationGrid → ¿dónde entra el balón?     G1-G9 / OUT
 *   goalkeeperZone  → ¿dónde interviene el GK?   GK1-GK5
 *
 * La referencia es visual y táctica. NO se codifican metros: la app no los
 * registra y fingirlos sería inventar precisión.
 */
import { GameEvent, GoalkeeperInterventionZone } from "../types/futsal";

export const GK_ZONE_IDS: readonly GoalkeeperInterventionZone[] = [
  "GK1",
  "GK2",
  "GK3",
  "GK4",
  "GK5",
];

export const GK_ZONE_PATTERN = /^GK[1-5]$/;

export function isGoalkeeperZone(raw: unknown): raw is GoalkeeperInterventionZone {
  return typeof raw === "string" && GK_ZONE_PATTERN.test(raw.toUpperCase());
}

/** Zona de intervención del evento, o null si no se registró. */
export function goalkeeperZoneOf(event: GameEvent): GoalkeeperInterventionZone | null {
  const raw = typeof event.goalkeeperZone === "string" ? event.goalkeeperZone.toUpperCase() : null;
  return isGoalkeeperZone(raw) ? (raw as GoalkeeperInterventionZone) : null;
}

// ── ETIQUETAS DE USUARIO ────────────────────────────────────────────────
// Única vía autorizada. `GK1`-`GK5` no se muestran nunca.

/** Nombre corto, el que se pinta dentro del mapa. */
export const GK_ZONE_LABEL: Record<GoalkeeperInterventionZone, string> = {
  GK1: "Zona 1",
  GK2: "Zona 2",
  GK3: "Zona 3",
  GK4: "Zona 4",
  GK5: "Zona 5",
};

/** Descripción táctica, para tooltips, aria-label e informes. */
export const GK_ZONE_DESCRIPTION: Record<GoalkeeperInterventionZone, string> = {
  GK1: "Bajo palos",
  GK2: "Dentro del área, profundidad corta",
  GK3: "Dentro del área, profundidad media",
  GK4: "Zona avanzada, hasta el límite del área",
  GK5: "Fuera del área",
};

/** `GK3` → `"Zona 3"`. Null si no es una zona de portero. */
export function formatGoalkeeperZone(raw: unknown): string | null {
  if (!isGoalkeeperZone(raw)) return null;
  return GK_ZONE_LABEL[(raw as string).toUpperCase() as GoalkeeperInterventionZone];
}

/** `GK3` → `"Zona 3 · Dentro del área, profundidad media"`. */
export function formatGoalkeeperZoneLong(raw: unknown): string | null {
  if (!isGoalkeeperZone(raw)) return null;
  const id = (raw as string).toUpperCase() as GoalkeeperInterventionZone;
  return `${GK_ZONE_LABEL[id]} · ${GK_ZONE_DESCRIPTION[id]}`;
}

/** Texto para una intervención cuya zona no se registró. Nunca se infiere. */
export const GK_NO_ZONE_LABEL = "Sin ubicación registrada";

// ── AGREGADOS ───────────────────────────────────────────────────────────

export type GkZoneTally = Record<GoalkeeperInterventionZone, number>;

export function emptyGkTally(): GkZoneTally {
  return { GK1: 0, GK2: 0, GK3: 0, GK4: 0, GK5: 0 };
}

/**
 * Cuenta eventos por zona de intervención. Devuelve también cuántos se
 * quedaron sin ubicación: se declara, no se reparte.
 */
export function tallyGoalkeeperZones(events: GameEvent[]): {
  byZone: GkZoneTally;
  located: number;
  unlocated: number;
} {
  const byZone = emptyGkTally();
  let located = 0;
  let unlocated = 0;

  for (const event of events) {
    const zone = goalkeeperZoneOf(event);
    if (zone) {
      byZone[zone] += 1;
      located += 1;
    } else {
      unlocated += 1;
    }
  }

  return { byZone, located, unlocated };
}

export function gkTallyTotal(tally: GkZoneTally): number {
  return GK_ZONE_IDS.reduce((acc, id) => acc + tally[id], 0);
}

/**
 * `"Zona 3: 4 intervenciones"`. Devuelve null si la zona no tiene datos — no
 * se redactan frases sobre lo que no ocurrió.
 */
export function describeGkZone(
  zone: GoalkeeperInterventionZone,
  count: number,
  noun: { one: string; many: string } = { one: "intervención", many: "intervenciones" },
): string | null {
  if (count <= 0) return null;
  return `${GK_ZONE_LABEL[zone]}: ${count} ${count === 1 ? noun.one : noun.many}`;
}
