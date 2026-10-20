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
 * una paridad escrita aparte. NO se usa para dibujar: está aquí porque es la
 * trampa que hay documentada justo debajo, y las pruebas la vigilan.
 */
export function visualSideSwapped(period: Period): boolean {
  return (SIDE_SWAPS_BEFORE[period] ?? 0) % 2 === 1;
}

/**
 * La orientación con la que se dibuja la pista compartida.
 *
 * EL DESCANSO SÍ INVIERTE LAS PORTERÍAS, Y YA LLEGA INVERTIDO
 * -----------------------------------------------------------
 * `handleConfirmEndFirst` invierte `isFieldFlipped` al confirmar el fin de la
 * 1ª parte —una llamada imperativa, una sola vez por partido—. Es decir, el
 * cambio de campo del descanso YA está dentro de `isFieldFlipped` cuando esta
 * función lo recibe. Combinarlo aquí otra vez con el periodo lo contaría dos
 * veces y las dos inversiones se anularían: medido en el Deploy Preview #28,
 * el portero local se quedaba en x=316 en las dos partes.
 *
 * Por eso la tabla de verdad pedida sale de una sola variable:
 *
 *   1ª parte + sin cambio manual  →  inicial          (isFieldFlipped = false)
 *   1ª parte + con cambio manual  →  reflejada        (true)
 *   2ª parte + sin cambio manual  →  intercambiada    (true,  puesto por el descanso)
 *   2ª parte + con cambio manual  →  2ª reflejada     (false, el manual deshace el descanso)
 *
 * Se resuelve UNA vez por render, no una por ficha: si cada jugador la
 * resolviera, la inversión se aplicaría diez veces.
 */
export function sharedPitchFlipped(isFieldFlipped: boolean): boolean {
  return isFieldFlipped;
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

/** Lo mismo a izquierda y derecha. Aquí no se mueve a nadie: se comprueba. */
export function horizontalBoundsPct(m: PitchMetrics): { min: number; max: number } {
  const medio = pct(m.cardWidth / 2, m.width);
  return { min: medio, max: 100 - medio };
}

/** Rectángulo real de una ficha, en píxeles de la pista. */
export function cardRect(p: SharedPosition, m: PitchMetrics) {
  const cx = (p.left / 100) * m.width;
  const cy = (p.top / 100) * m.height;
  return {
    x0: cx - m.cardWidth / 2,
    x1: cx + m.cardWidth / 2,
    y0: cy - m.cardHeight / 2,
    y1: cy + m.cardHeight / 2,
  };
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
  const original = base.map((p) => p.top);

  // Se separa POR PASADAS, hasta que no quede ningún rectángulo tocando otro.
  //
  // Una sola pasada no basta: al abrir una pareja, una de las dos puede
  // caer encima de un tercero que no estaba en el grupo —medido con un
  // portero-jugador contra un 1-1-3: quedaba un solape—. Por eso se vuelve a
  // mirar hasta que no haya ninguno, con un tope para no girar en el vacío.
  const PASADAS = 8;
  let fits = true;
  let quedanSolapes = true;

  for (let pasada = 0; pasada < PASADAS && quedanSolapes; pasada++) {
    // Componentes conexas de lo que SE TAPA AHORA, no de lo que se tapaba al
    // principio: así solo se mueve quien lo necesita.
    const grupo = base.map((_, i) => i);
    const raiz = (i: number): number => (grupo[i] === i ? i : (grupo[i] = raiz(grupo[i])));
    quedanSolapes = false;
    for (let i = 0; i < base.length; i++) {
      for (let j = i + 1; j < base.length; j++) {
        const a = cardRect(base[i], metrics);
        const b = cardRect(base[j], metrics);
        if (a.x1 > b.x0 && b.x1 > a.x0 && a.y1 > b.y0 && b.y1 > a.y0) {
          quedanSolapes = true;
          grupo[raiz(i)] = raiz(j);
        }
      }
    }
    if (!quedanSolapes) break;

    const porGrupo = new Map<number, number[]>();
    base.forEach((_, i) => {
      const r = raiz(i);
      porGrupo.set(r, [...(porGrupo.get(r) ?? []), i]);
    });

    for (const indices of porGrupo.values()) {
      if (indices.length < 2) continue;
      // Orden estable: por altura actual y, a igualdad, por el orden de
      // entrada, que ya está ordenado por equipo y dorsal.
      indices.sort((a, b) => (base[a].top - base[b].top) || (a - b));

      const alto = paso * (indices.length - 1);
      if (alto > max - min) {
        // No cabe ni usando toda la pista: esta vista no sirve aquí. Se
        // reparte lo que se pueda y se avisa, en vez de amontonar.
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
      });
    }
  }

  if (quedanSolapes) fits = false;
  base.forEach((p, i) => {
    p.nudged = Math.abs(p.top - original[i]) > 0.0001;
  });

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

// ── ¿CABE DE VERDAD? ────────────────────────────────────────────────────
//
// La disponibilidad de la vista NO se decide por el ancho de la ventana. Se
// decide midiendo: con esta pista, estas dos formaciones y estas fichas, ¿los
// diez rectángulos quedan dentro y separados? Un umbral fijo sobre
// `window.innerWidth` dice que no a una tablet donde sí cabía.

/** Parejas cuyos objetivos táctiles se tocan. Debe ser 0. */
export function countOverlaps(placements: SharedPosition[], m: PitchMetrics): number {
  let n = 0;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = cardRect(placements[i], m);
      const b = cardRect(placements[j], m);
      if (a.x1 > b.x0 && b.x1 > a.x0 && a.y1 > b.y0 && b.y1 > a.y0) n++;
    }
  }
  return n;
}

/** Fichas que se salen de la pista por algún lado. Debe ser 0. */
export function countOutside(placements: SharedPosition[], m: PitchMetrics): number {
  const h = horizontalBoundsPct(m);
  const v = verticalBoundsPct(m);
  const fuera = (p: SharedPosition) =>
    p.left < h.min - 0.001 || p.left > h.max + 0.001 || p.top < v.min - 0.001 || p.top > v.max + 0.001;
  return placements.filter(fuera).length;
}

export type SharedPitchViability = {
  /** Todos los grupos que se tapan han podido separarse. */
  fits: boolean;
  /** Parejas de fichas que seguirían tocándose. */
  overlaps: number;
  /** Fichas que quedarían fuera de la pista. */
  outside: number;
  /** La pista tiene dimensiones utilizables (no es 0×0 ni está sin medir). */
  measured: boolean;
  /** La conjunción de todo lo anterior. Es lo único que decide. */
  ok: boolean;
};

/**
 * ¿Se puede jugar el 5v5 en ESTA pista con ESTAS formaciones?
 *
 * No mira la ventana: mira la pista medida y los diez rectángulos que
 * saldrían. Por eso una tablet vertical con una pista de 746 px de ancho
 * puede ofrecer la vista aunque un umbral de 900 px la hubiera descartado.
 */
export function sharedPitchViability(
  entries: SharedPitchEntry[],
  flipped: boolean,
  metrics: PitchMetrics,
): SharedPitchViability {
  const measured =
    metrics.width >= metrics.cardWidth && metrics.height >= metrics.cardHeight && entries.length > 0;
  if (!measured) {
    return { fits: false, overlaps: 0, outside: 0, measured: false, ok: false };
  }
  const { placements, fits } = layoutSharedPitch(entries, flipped, metrics);
  const overlaps = countOverlaps(placements, metrics);
  const outside = countOutside(placements, metrics);
  return { fits, overlaps, outside, measured, ok: fits && overlaps === 0 && outside === 0 };
}

/**
 * EL SUELO DE LA PISTA · lo que se le descuenta al espacio disponible.
 *
 * La disponibilidad se evalúa siempre sobre el espacio vertical que ocupan
 * juntos la pista y los banquillos, menos lo PEOR que los banquillos pueden
 * llegar a ocupar: la barra plegada más la lista desplegada, que tiene altura
 * máxima propia. Así la pista nunca baja de la caja que se validó, pase lo
 * que pase con el banquillo, y la vista no puede entrar y salir sola.
 */
export const BENCH_BAR_PX = 34;
/** Alto máximo de la lista de suplentes desplegada; más allá, se desplaza. */
export const BENCH_OPEN_MAX_PX = 96;
export const BENCH_SPACE_PX = BENCH_BAR_PX + BENCH_OPEN_MAX_PX;

export function pitchBoxForAvailability(
  box: { width: number; height: number },
  metrics: PitchMetrics = DEFAULT_PITCH_METRICS,
): PitchMetrics {
  return { ...metrics, width: box.width, height: Math.max(0, box.height - BENCH_SPACE_PX) };
}
