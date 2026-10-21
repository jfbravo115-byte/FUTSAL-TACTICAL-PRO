/**
 * src/hooks/useLongPress.ts
 *
 * La máquina de `utils/longPress` atada a los eventos de puntero de React.
 *
 * Se usan POINTER EVENTS y no `touchstart`/`mousedown`: el mismo código vale
 * para ratón, dedo y lápiz, que es justo lo que hace falta en una tablet con
 * teclado conectado. Al desmontar, el temporizador se limpia siempre.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LONG_PRESS_MS,
  LongPressMachine,
  createLongPressMachine,
} from "../utils/longPress";

export function useLongPress({
  onTap,
  onLongPress,
  thresholdMs = LONG_PRESS_MS,
  disabled = false,
}: {
  onTap: () => void;
  /** Ausente: la ficha solo responde al toque corto. */
  onLongPress?: () => void;
  thresholdMs?: number;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const tapRef = useRef(onTap);
  const longRef = useRef(onLongPress);
  const armadoRef = useRef(false);
  tapRef.current = onTap;
  longRef.current = onLongPress;
  armadoRef.current = !!onLongPress && !disabled;

  const maquinaRef = useRef<LongPressMachine | null>(null);
  if (maquinaRef.current === null) {
    maquinaRef.current = createLongPressMachine({
      onTap: () => tapRef.current(),
      onLongPress: () => longRef.current?.(),
      onPendingChange: setPending,
      longPressEnabled: () => armadoRef.current,
      thresholdMs,
    });
  }
  const m = maquinaRef.current;

  // Desmontar SIEMPRE limpia: un temporizador vivo sobre un componente que ya
  // no existe abriría un editor sobre un jugador que ya no está en pantalla.
  useEffect(() => () => m.dispose(), [m]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => m.down({ x: e.clientX, y: e.clientY }),
    [m],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => m.move({ x: e.clientX, y: e.clientY }),
    [m],
  );

  const onPointerUp = useCallback(() => m.up(), [m]);
  const onPointerCancel = useCallback(() => m.cancel(), [m]);
  const onPointerLeave = useCallback(() => m.cancel(), [m]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      // El `click` que viene detrás de una pulsación larga se come aquí: si
      // no, el editor y el radial se abrirían a la vez.
      if (m.shouldSwallowClick()) {
        e.preventDefault();
        e.stopPropagation();
        m.clickHandled();
      }
    },
    [m],
  );

  // Sin esto, mantener pulsado abre el menú contextual del navegador encima.
  const onContextMenu = useCallback((e: React.MouseEvent) => e.preventDefault(), []);

  return {
    pending,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onClick,
      onContextMenu,
    },
  };
}
