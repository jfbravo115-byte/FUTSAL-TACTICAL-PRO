/**
 * La máquina del toque corto y la pulsación mantenida.
 *
 * Lo delicado no es medir 1.200 ms: es que al soltar después de una
 * pulsación larga el navegador dispara también un `click`. Sin tratarlo, el
 * editor de dorsal y el menú radial se abrirían a la vez sobre el mismo
 * jugador.
 */
import { describe, expect, it, vi } from "vitest";
import {
  LONG_PRESS_MOVE_PX,
  LONG_PRESS_MS,
  createLongPressMachine,
} from "./longPress";

/** Reloj de mentira: nada depende del tiempo real. */
function conReloj() {
  let pendientes: { fn: () => void; ms: number; id: number }[] = [];
  let siguiente = 1;
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = siguiente++;
      pendientes.push({ fn, ms, id });
      return id;
    },
    clearTimer: (h: unknown) => {
      pendientes = pendientes.filter((p) => p.id !== h);
    },
    avanzar(ms: number) {
      const disparan = pendientes.filter((p) => p.ms <= ms);
      pendientes = pendientes.filter((p) => p.ms > ms).map((p) => ({ ...p, ms: p.ms - ms }));
      disparan.forEach((p) => p.fn());
    },
    vivos: () => pendientes.length,
  };
}

function maquina(extra: Partial<Parameters<typeof createLongPressMachine>[0]> = {}) {
  const reloj = conReloj();
  const onTap = vi.fn();
  const onLongPress = vi.fn();
  const m = createLongPressMachine({
    onTap,
    onLongPress,
    setTimer: reloj.setTimer,
    clearTimer: reloj.clearTimer,
    ...extra,
  });
  return { m, reloj, onTap, onLongPress };
}

describe("1 · toque corto y pulsación mantenida", () => {
  it("soltar antes del umbral es un TOQUE: abre el radial", () => {
    const { m, reloj, onTap, onLongPress } = maquina();
    m.down({ x: 0, y: 0 });
    reloj.avanzar(LONG_PRESS_MS - 1);        // 1.199 ms
    expect(onLongPress).not.toHaveBeenCalled();
    m.up();
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(m.shouldSwallowClick()).toBe(false);
  });

  it("1.200 ms exactos abren el editor, y NO el radial", () => {
    const { m, reloj, onTap, onLongPress } = maquina();
    m.down({ x: 0, y: 0 });
    reloj.avanzar(LONG_PRESS_MS);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
    m.up();
    expect(onTap).not.toHaveBeenCalled();     // soltar ya no es un toque
  });

  it("y el `click` que viene detrás se lo come la máquina", () => {
    const { m, reloj } = maquina();
    m.down({ x: 0, y: 0 });
    reloj.avanzar(LONG_PRESS_MS);
    expect(m.shouldSwallowClick()).toBe(true);
    m.clickHandled();
    expect(m.shouldSwallowClick()).toBe(false);   // solo se come UNO
  });

  it("y un segundo `down` no deja un temporizador huérfano", () => {
    // Sin la guardia, el segundo `down` pisa el identificador del primero:
    // el temporizador viejo sigue vivo y `dispose` ya no puede limpiarlo.
    const { m, reloj } = maquina();
    m.down({ x: 0, y: 0 });
    m.down({ x: 0, y: 0 });
    expect(reloj.vivos()).toBe(1);
    m.dispose();
    expect(reloj.vivos()).toBe(0);
  });

  it("el editor se abre UNA sola vez por gesto", () => {
    const { m, reloj, onLongPress } = maquina();
    m.down({ x: 0, y: 0 });
    m.down({ x: 0, y: 0 });                  // un segundo down no reinicia
    reloj.avanzar(LONG_PRESS_MS * 3);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});

describe("2 · lo que cancela el gesto", () => {
  it("arrastrar más de la tolerancia cancela: ni toque ni editor", () => {
    const { m, reloj, onTap, onLongPress } = maquina();
    m.down({ x: 0, y: 0 });
    m.move({ x: LONG_PRESS_MOVE_PX + 1, y: 0 });
    reloj.avanzar(LONG_PRESS_MS * 2);
    m.up();
    expect(onTap).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
    expect(reloj.vivos()).toBe(0);
  });

  it("un temblor dentro de la tolerancia NO cancela", () => {
    const { m, reloj, onLongPress } = maquina();
    m.down({ x: 100, y: 100 });
    m.move({ x: 100 + LONG_PRESS_MOVE_PX - 1, y: 100 });
    reloj.avanzar(LONG_PRESS_MS);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("`pointercancel` no ejecuta NINGUNA acción", () => {
    const { m, reloj, onTap, onLongPress } = maquina();
    m.down({ x: 0, y: 0 });
    reloj.avanzar(500);
    m.cancel();
    reloj.avanzar(LONG_PRESS_MS);
    m.up();
    expect(onTap).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("desmontar limpia el temporizador", () => {
    const { m, reloj, onLongPress } = maquina();
    m.down({ x: 0, y: 0 });
    expect(reloj.vivos()).toBe(1);
    m.dispose();
    expect(reloj.vivos()).toBe(0);
    reloj.avanzar(LONG_PRESS_MS * 2);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(m.state()).toBe("idle");
  });

  it("avisa de cuándo hay que pintar el progreso", () => {
    const avisos: boolean[] = [];
    const { m, reloj } = maquina({ onPendingChange: (p) => avisos.push(p) });
    m.down({ x: 0, y: 0 });
    expect(avisos).toEqual([true]);
    m.up();
    expect(avisos).toEqual([true, false]);
    m.down({ x: 0, y: 0 });
    reloj.avanzar(LONG_PRESS_MS);
    expect(avisos).toEqual([true, false, true, false]);   // se apaga al disparar
  });
});

describe("3 · sin editor que abrir, la ficha sigue respondiendo al toque", () => {
  it("no arma el temporizador, pero el toque corto funciona", () => {
    const { m, reloj, onTap, onLongPress } = maquina({ longPressEnabled: () => false });
    m.down({ x: 0, y: 0 });
    expect(reloj.vivos()).toBe(0);
    reloj.avanzar(LONG_PRESS_MS * 2);
    m.up();
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
