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
 * NO HAY DOBLE INVERSIÓN EN EL DESCANSO
 * -------------------------------------
 * Estas funciones NO reciben el periodo, y es deliberado: hoy la pista no se
 * voltea sola al empezar la segunda parte —`handleConfirmEndFirst` solo
 * cambia `period`— y el cambio de campo real se refleja en el DATO, dentro de
 * `attackDirection` de cada evento. Si además se volteara aquí, el mismo
 * cambio de campo se aplicaría dos veces.
 */
import { applyFieldFlip } from "./fieldOrientation";

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

// ── COLISIONES ──────────────────────────────────────────────────────────
//
// Con los dos equipos sobre la misma pista hay parejas que caen casi en el
// mismo punto: el pivot local en (85,50) y el cierre rival en (72,50) quedan a
// 13 puntos, y en algunos sistemas a 8. Dos fichas de 44 px superpuestas no se
// pueden pulsar por separado.
//
// La separación es VISUAL y DETERMINISTA: no se tocan los datos, no se mueve
// nadie a otra parte de la pista y el mismo partido se dibuja siempre igual.
// Se reparte en vertical alrededor del punto original, en el orden
// (local antes que rival, y dentro de cada equipo por dorsal), de modo que el
// jugador sigue donde estaba, solo que sin taparse con el otro.

/** Distancias por debajo de las cuales dos fichas se tapan. En % del contenedor. */
export const COLLISION_LEFT = 9;
export const COLLISION_TOP = 14;
/** Separación vertical que se aplica entre fichas en conflicto. */
export const COLLISION_STEP = 9;
/** Margen para no sacar una ficha de la pista al separarla. */
export const TOP_MIN = 8;
export const TOP_MAX = 92;

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
  /** true si hubo que separarla de otra ficha. Útil para explicarlo y testarlo. */
  nudged: boolean;
};

const clampTop = (top: number) => Math.min(TOP_MAX, Math.max(TOP_MIN, top));

/**
 * Coloca a los diez sobre la pista compartida, separando lo que se tape.
 *
 * El orden de entrada no importa: se ordena por (equipo, dorsal) antes de
 * nada, así que el resultado es el mismo se llame como se llame.
 */
export function layoutSharedPitch(
  entries: SharedPitchEntry[],
  flipped: boolean,
): SharedPitchPlacement[] {
  const base = [...entries]
    .sort((a, b) =>
      a.side === b.side ? a.number - b.number : a.side === "team" ? -1 : 1,
    )
    .map((e) => ({
      id: e.id,
      side: e.side,
      nudged: false,
      ...formationPositionToSharedPitch(e.slot, e.side, flipped),
    }));

  // Grupos de fichas que se tapan entre sí, por cercanía en los dos ejes.
  const grupo: number[] = base.map(() => -1);
  let siguiente = 0;
  for (let i = 0; i < base.length; i++) {
    if (grupo[i] === -1) grupo[i] = siguiente++;
    for (let j = i + 1; j < base.length; j++) {
      const cerca =
        Math.abs(base[i].left - base[j].left) < COLLISION_LEFT &&
        Math.abs(base[i].top - base[j].top) < COLLISION_TOP;
      if (cerca) grupo[j] = grupo[i];
    }
  }

  for (let g = 0; g < siguiente; g++) {
    const indices = base.map((_, i) => i).filter((i) => grupo[i] === g);
    if (indices.length < 2) continue;
    // Se reparten alrededor del centro del grupo, sin alejarse de su sitio.
    const centro = indices.reduce((acc, i) => acc + base[i].top, 0) / indices.length;
    const inicio = centro - (COLLISION_STEP * (indices.length - 1)) / 2;
    indices.forEach((i, k) => {
      base[i].top = clampTop(inicio + COLLISION_STEP * k);
      base[i].nudged = true;
    });
  }

  return base;
}
