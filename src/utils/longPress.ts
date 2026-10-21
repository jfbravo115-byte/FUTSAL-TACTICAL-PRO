/**
 * src/utils/longPress.ts
 *
 * TOQUE CORTO Y PULSACIÓN MANTENIDA, SIN AMBIGÜEDAD.
 *
 * El toque corto sigue haciendo lo de siempre —seleccionar y abrir el menú
 * radial— y la pulsación mantenida abre el editor de dorsal. Lo delicado es
 * que al soltar después de una pulsación larga el navegador dispara también
 * un `click`: sin tratarlo, el editor y el radial se abrirían a la vez.
 *
 * Por eso esto es una MÁQUINA explícita y no una mezcla de `onClick` con
 * `onDoubleClick`:
 *
 *   inactiva ──down──▶ esperando ──(umbral)──▶ cumplida
 *       ▲                 │                      │
 *       └──up/cancel/mover┘                      └── el click siguiente se come
 *
 * Es pura: recibe el reloj y el temporizador, así que una prueba puede
 * adelantar el tiempo y comprobar los 1.199 ms y los 1.200 ms exactos.
 */

export const LONG_PRESS_MS = 1200;
/** Lo que puede bailar un dedo sin que deje de ser una pulsación. */
export const LONG_PRESS_MOVE_PX = 10;

export type LongPressState = "idle" | "pending" | "fired";

export type LongPressMachineOptions = {
  /** Toque corto: se soltó antes del umbral. */
  onTap: () => void;
  /** Se cumplió el tiempo sin soltar ni moverse. */
  onLongPress: () => void;
  /** Para pintar el progreso; true mientras se mantiene pulsado. */
  onPendingChange?: (pending: boolean) => void;
  thresholdMs?: number;
  movePx?: number;
  /**
   * ¿Está armada la pulsación mantenida? Cuando no hay editor que abrir, la
   * ficha sigue respondiendo al toque corto: lo que se desactiva es el
   * temporizador, no el gesto.
   */
  longPressEnabled?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type LongPressMachine = {
  state: () => LongPressState;
  down: (point?: { x: number; y: number }) => void;
  move: (point: { x: number; y: number }) => void;
  up: () => void;
  cancel: () => void;
  /** ¿Hay que comerse el `click` que viene detrás? */
  shouldSwallowClick: () => boolean;
  clickHandled: () => void;
  dispose: () => void;
};

export function createLongPressMachine(opts: LongPressMachineOptions): LongPressMachine {
  const umbral = opts.thresholdMs ?? LONG_PRESS_MS;
  const tolerancia = opts.movePx ?? LONG_PRESS_MOVE_PX;
  const poner = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const quitar = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let estado: LongPressState = "idle";
  let temporizador: unknown = null;
  let origen: { x: number; y: number } | null = null;
  let comerClick = false;

  const limpiar = () => {
    if (temporizador !== null) {
      quitar(temporizador);
      temporizador = null;
    }
  };

  const aInactiva = () => {
    limpiar();
    origen = null;
    if (estado === "pending") opts.onPendingChange?.(false);
    estado = "idle";
  };

  return {
    state: () => estado,

    down(point) {
      // Un segundo `down` sin haber soltado no reinicia la cuenta: el gesto
      // es uno solo y el editor tiene que abrirse UNA vez.
      if (estado !== "idle") return;
      origen = point ?? null;
      estado = "pending";
      if (opts.longPressEnabled?.() === false) return;   // solo toque corto
      opts.onPendingChange?.(true);
      temporizador = poner(() => {
        temporizador = null;
        if (estado !== "pending") return;
        estado = "fired";
        comerClick = true;
        opts.onPendingChange?.(false);
        opts.onLongPress();
      }, umbral);
    },

    move(point) {
      if (estado !== "pending" || !origen) return;
      const dx = point.x - origen.x;
      const dy = point.y - origen.y;
      // Arrastrar es desplazar la pista, no pulsar una ficha.
      if (Math.hypot(dx, dy) > tolerancia) aInactiva();
    },

    up() {
      if (estado === "pending") {
        aInactiva();
        opts.onTap();
        return;
      }
      // Si ya saltó el editor, soltar no hace nada más.
      if (estado === "fired") estado = "idle";
      limpiar();
      origen = null;
    },

    cancel() {
      // `pointercancel`: el sistema se ha quedado el gesto. Ni toque ni
      // editor: lo que no se sabe qué era, no se ejecuta.
      if (estado === "fired") comerClick = true;
      aInactiva();
    },

    shouldSwallowClick: () => comerClick,
    clickHandled() {
      comerClick = false;
    },

    dispose() {
      limpiar();
      origen = null;
      estado = "idle";
      comerClick = false;
    },
  };
}
