/**
 * src/utils/sharedPitch.ts
 *
 * EXPERIMENTO · proyectar las DOS formaciones sobre una sola pista.
 *
 * QUÉ SE GUARDA HOY, Y QUÉ NO
 * ---------------------------
 * Un jugador no guarda coordenadas: guarda `pitchPosition`, un ÍNDICE dentro
 * de `PITCH_SYSTEMS[gameState]`. Las coordenadas viven en esa tabla, en
 * porcentajes del contenedor, y están escritas desde la perspectiva de un
 * equipo que ataca de IZQUIERDA A DERECHA: el portero en `left: 7`, el pivot
 * en `left: 85`.
 *
 * Los dos equipos usan la MISMA tabla. No hay una tabla rival. Lo único que
 * los distingue es cómo se dibujan, y esa regla ya existía para la vista de un
 * solo equipo:
 *
 *     uiLeft = isOpponent ? 100 - slot.left : slot.left
 *
 * Aplicarla a los dos a la vez es, literalmente, todo lo que hace falta para
 * tener un 5 contra 5 enfrentado: el portero local queda en 7 y el rival en
 * 93, cada uno defendiendo su portería.
 *
 * SOLO PRESENTACIÓN
 * -----------------
 * Nada de esto toca datos. `pitchPosition` no se reescribe, `originGrid` y
 * `destinationGrid` no se miran siquiera, y `attackDirection` —que sí sabe de
 * lados— se deriva de `teamDefendsAtKickoff` y del periodo, nunca de lo que
 * se ve en pantalla.
 *
 * EL DESCANSO SE RESUELVE UNA SOLA VEZ, ARRIBA
 * --------------------------------------------
 * En la segunda parte los equipos cambian de portería, y esta vista quiere
 * representar lo que el analista está viendo, así que la pista se intercambia.
 * Pero `formationPositionToSharedPitch` sigue SIN conocer el periodo: recibe
 * un `flipped` ya resuelto. Quien mezcla las dos cosas es
 * `sharedPitchFlipped`, que se llama UNA vez por render y no una vez por
 * jugador. Así no hay forma de aplicar el cambio de campo dos veces.
 *
 * Y el cambio de campo del DATO —`attackDirection` de cada evento, derivado
 * de `teamDefendsAtKickoff` y del periodo— no se toca: son dos mecanismos
 * separados a propósito, uno para dibujar y otro para analizar.
 */
import { Period } from "../types/futsal";
import { applyFieldFlip } from "./fieldOrientation";
import { SIDE_SWAPS_BEFORE } from "./attackDirection";

/** Una posición de la tabla de formaciones. Porcentajes del contenedor. */
export type PitchSlot = { left: number; top: number; label?: string };

export type TeamSide = "team" | "opponent";

export type SharedPosition = { left: number; top: number };

/**
 * La posición de UN jugador sobre la pista compartida.
 *
 * `teamSide` decide hacia dónde mira su formación; `flipped` es el botón
 * «Cambiar lado», que se aplica después y por igual a los dos equipos, así
 * que siguen enfrentados.
 */
export function formationPositionToSharedPitch(
  slot: PitchSlot,
  teamSide: TeamSide,
  flipped: boolean,
): SharedPosition {
  const propio = teamSide === "opponent" ? 100 - slot.left : slot.left;
  return { left: applyFieldFlip(propio, flipped), top: slot.top };
}

/** Portería que DEFIENDE cada equipo sobre la pista compartida. */
export function defendedGoalSide(teamSide: TeamSide, flipped: boolean): "left" | "right" {
  const base = teamSide === "opponent" ? "right" : "left";
  if (!flipped) return base;
  return base === "left" ? "right" : "left";
}

/** Portería a la que ATACA cada equipo. Siempre la contraria a la que defiende. */
export function attackedGoalSide(teamSide: TeamSide, flipped: boolean): "left" | "right" {
  return defendedGoalSide(teamSide, flipped) === "left" ? "right" : "left";
}

// ── ORIENTACIÓN VISUAL EFECTIVA ─────────────────────────────────────────

/**
 * ¿Han cambiado ya de campo los equipos cuando empieza este periodo?
 *
 * Reutiliza la MISMA tabla que usa `attackDirection` para el dato, en vez de
 * una paridad escrita aparte: si algún día la prórroga se implementa de
 * verdad, los dos mecanismos cambiarán juntos.
 */
export function visualSideSwapped(period: Period): boolean {
  return (SIDE_SWAPS_BEFORE[period] ?? 0) % 2 === 1;
}

/**
 * La orientación con la que se dibuja la pista compartida.
 *
 * Es el XOR de las dos causas que pueden invertirla, y se calcula UNA vez por
 * render:
 *
 *   1ª parte  + sin cambio manual  →  orientación inicial
 *   1ª parte  + cambio manual      →  reflejada
 *   2ª parte  + sin cambio manual  →  inicial intercambiada
 *   2ª parte  + cambio manual      →  la de 2ª parte, reflejada
 *
 * Si las dos coinciden se anulan, que es lo correcto: cambiar de campo y
 * además pulsar «Cambiar lado» deja la pista como estaba.
 */
export function sharedPitchFlipped(isFieldFlipped: boolean, period: Period): boolean {
  return isFieldFlipped !== visualSideSwapped(period);
}

// ── COLISIONES ──────────────────────────────────────────────────────────
//
// Con los dos equipos sobre la misma pista hay parejas que caen casi en el
// mismo punto: el pivot local en (85,50) y el portero rival en (93,50) quedan
// a 8 puntos porcentuales. Dos fichas de 44 px superpuestas no se pueden
// pulsar por separado.
//
// LA SEPARACIÓN SE CALCULA EN PÍXELES, NO EN PORCENTAJES
// ------------------------------------------------------
// Un porcentaje fijo no sirve: 9 % son 33 px en una pista de 362 y 24 px en
// una de 265, y con fichas de 44 px los dos casos siguen solapando. Lo que
// tiene que cumplirse es geométrico —la distancia entre centros ha de ser al
// menos el alto de la ficha más el margen— así que las medidas reales entran
// como dato y el porcentaje sale de ellas.
//
// La separación es VISUAL y DETERMINISTA: no se tocan los datos, no se mueve
// nadie en horizontal y el mismo partido se dibuja siempre igual.

/** Medidas reales del dibujo, en píxeles. */
export type PitchMetrics = {
  width: number;
  height: number;
  cardWidth: number;
  cardHeight: number;
  /** Separación mínima entre los BORDES de dos fichas. */
  gap: number;
};

/** Lo medido en el experimento: 898×362 en escritorio, 746×265 en tablet. */
export const DEFAULT_PITCH_METRICS: PitchMetrics = {
  width: 898,
  height: 362,
  cardWidth: 46,
  cardHeight: 44,
  gap: 4,
};

const pct = (px: number, total: number) => (total > 0 ? (px / total) * 100 : 0);

/** Distancia MÍNIMA entre centros, en % del alto, para que no se toquen. */
export function minimumVerticalSeparationPct(m: PitchMetrics): number {
  return pct(m.cardHeight + m.gap, m.height);
}

/** Margen arriba y abajo para que la ficha entre entera en la pista. */
export function verticalBoundsPct(m: PitchMetrics): { min: number; max: number } {
  const medio = pct(m.cardHeight / 2, m.height);
  return { min: medio, max: 100 - medio };
}

export type SharedPitchEntry = {
  id: string;
  /** Dorsal. Solo se usa para ordenar de forma estable. */
  number: number;
  side: TeamSide;
  slot: PitchSlot;
};

export type SharedPitchPlacement = SharedPosition & {
  id: string;
  side: TeamSide;
  /** true si hubo que separarla de otra ficha. */
  nudged: boolean;
};

export type SharedPitchLayout = {
  placements: SharedPitchPlacement[];
  /**
   * false cuando la pista es tan baja que algún grupo no cabe separado. Es la
   * señal para NO ofrecer esta vista en ese tamaño, en vez de dibujar diez
   * fichas que se tapan.
   */
  fits: boolean;
};

/**
 * Coloca a los diez sobre la pista compartida, separando lo que se tape.
 *
 * El orden de entrada no importa: se ordena por (equipo, dorsal) antes de
 * nada, así que el resultado es el mismo se llame como se llame.
 */
export function layoutSharedPitch(
  entries: SharedPitchEntry[],
  flipped: boolean,
  metrics: PitchMetrics = DEFAULT_PITCH_METRICS,
): SharedPitchLayout {
  const paso = minimumVerticalSeparationPct(metrics);
  const { min, max } = verticalBoundsPct(metrics);
  const anchoChoque = pct(metrics.cardWidth + metrics.gap, metrics.width);

  const base: SharedPitchPlacement[] = [...entries]
    .sort((a, b) =>
      a.side === b.side ? a.number - b.number : a.side === "team" ? -1 : 1,
    )
    .map((e) => ({
      id: e.id,
      side: e.side,
      nudged: false,
      ...formationPositionToSharedPitch(e.slot, e.side, flipped),
    }));

  // Grupos de fichas cuyos rectángulos se tocan, medido en píxeles reales.
  const grupo: number[] = base.map(() => -1);
  let siguiente = 0;
  for (let i = 0; i < base.length; i++) {
    if (grupo[i] === -1) grupo[i] = siguiente++;
    for (let j = i + 1; j < base.length; j++) {
      const seTocan =
        Math.abs(base[i].left - base[j].left) < anchoChoque &&
        Math.abs(base[i].top - base[j].top) < paso;
      if (seTocan) grupo[j] = grupo[i];
    }
  }

  let fits = true;
  for (let g = 0; g < siguiente; g++) {
    const indices = base.map((_, i) => i).filter((i) => grupo[i] === g);
    if (indices.length < 2) continue;

    const alto = paso * (indices.length - 1);
    if (alto > max - min) {
      // No cabe ni aunque se use toda la pista: esta vista no sirve a este
      // tamaño. Se reparte lo que se pueda y se avisa.
      fits = false;
    }

    // Simétrico alrededor del centro del grupo mientras haya sitio; si el
    // reparto se sale, se DESPLAZA entero —no se comprime— para que la
    // separación mínima se conserve.
    const centro = indices.reduce((acc, i) => acc + base[i].top, 0) / indices.length;
    let inicio = centro - alto / 2;
    if (inicio < min) inicio = min;
    if (inicio + alto > max) inicio = Math.max(min, max - alto);

    indices.forEach((i, k) => {
      base[i].top = inicio + paso * k;
      base[i].nudged = true;
    });
  }

  return { placements: base, fits };
}

/** ¿Caben los diez con objetivos táctiles independientes a este tamaño? */
export function sharedPitchFits(
  entries: SharedPitchEntry[],
  flipped: boolean,
  metrics: PitchMetrics,
): boolean {
  return layoutSharedPitch(entries, flipped, metrics).fits;
}
