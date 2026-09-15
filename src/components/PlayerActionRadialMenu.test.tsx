// @vitest-environment jsdom
/**
 * Captura de acciones de portero desde el menú radial.
 *
 * Lo que fija este test es el mapeo BOTÓN → TIPO INTERNO, que es justo lo que
 * estaba roto antes de Fase 4: el botón decía "PARADA" y emitía SAVE_PARRY,
 * que los informes rotulaban "Despeje".
 */
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ActionType, GoalieAction, Player, Role } from "../types/futsal";
import { PlayerActionRadialMenu, RADIAL_BUTTON_PX, radialGeometry } from "./PlayerActionRadialMenu";

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "gk1",
    number: 1,
    name: "Portero",
    role: Role.GOALKEEPER,
    isOnPitch: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isOpponent: false,
    stats: {
      goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
      fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
    },
    ...overrides,
  };
}

function mount(overrides: Partial<Player> = {}) {
  const onAction = vi.fn();
  const onClose = vi.fn();
  const onSwap = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <PlayerActionRadialMenu
        player={player(overrides)}
        onAction={onAction}
        onSwap={onSwap}
        onClose={onClose}
      />,
    );
  });
  return { host, onAction, onClose };
}

/**
 * Pulsa el botón cuyo texto visible o etiqueta accesible contiene `label`.
 * Las celdas de la pista no llevan texto (solo el conteo), se identifican por
 * aria-label — que es exactamente lo que lee el usuario.
 */
function click(host: HTMLElement, label: string) {
  const needle = label.toUpperCase();
  const button = Array.from(host.querySelectorAll("button")).find((b) => {
    const text = (b.textContent || "").toUpperCase();
    const aria = (b.getAttribute("aria-label") || "").toUpperCase();
    return text.includes(needle) || aria.includes(needle);
  });
  if (!button) throw new Error(`botón "${label}" no encontrado`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("Botones de portero → tipo interno", () => {
  it("PARADA produce SAVE", () => {
    const { host, onAction } = mount();
    click(host, "PARADA");
    // Las paradas piden zona; el tipo queda fijado en ese momento.
    click(host, "Zona 1 · izquierda");
    click(host, "Alto · izquierda");
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toBe(GoalieAction.SAVE);
  });

  it("BLOCAJE produce SAVE_CATCH, tras el selector de tipo", () => {
    const { host, onAction } = mount();
    click(host, "TIPO PARADA");
    click(host, "BLOCAJE");
    click(host, "Zona 1 · izquierda");
    click(host, "Alto · izquierda");
    expect(onAction.mock.calls[0][0]).toBe(GoalieAction.SAVE_CATCH);
  });

  it("DESPEJE produce SAVE_DEFLECT, tras el selector de tipo", () => {
    const { host, onAction } = mount();
    click(host, "TIPO PARADA");
    click(host, "DESPEJE");
    click(host, "Zona 1 · izquierda");
    click(host, "Alto · izquierda");
    expect(onAction.mock.calls[0][0]).toBe(GoalieAction.SAVE_DEFLECT);
  });

  it("SALIDA produce EXIT", () => {
    const { host, onAction } = mount();
    click(host, "SALIDA");
    click(host, "Éxito");
    expect(onAction.mock.calls[0][0]).toBe(GoalieAction.EXIT);
  });

  it("cancelar el selector de tipo NO registra ningún evento", () => {
    const { host, onAction } = mount();
    click(host, "TIPO PARADA");
    click(host, "Cancelar");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("NINGÚN camino produce SAVE_PARRY", () => {
    const rapido = mount();
    click(rapido.host, "PARADA");
    click(rapido.host, "Zona 1 · izquierda");
    click(rapido.host, "Alto · izquierda");
    expect(rapido.onAction.mock.calls[0][0]).not.toBe(GoalieAction.SAVE_PARRY);

    for (const subtipo of ["BLOCAJE", "DESPEJE"]) {
      const { host, onAction } = mount();
      click(host, "TIPO PARADA");
      click(host, subtipo);
      click(host, "Zona 1 · izquierda");
      click(host, "Alto · izquierda");
      expect(onAction.mock.calls[0][0]).not.toBe(GoalieAction.SAVE_PARRY);
    }

    const salida = mount();
    click(salida.host, "SALIDA");
    click(salida.host, "Éxito");
    expect(salida.onAction.mock.calls[0][0]).not.toBe(GoalieAction.SAVE_PARRY);

    expect(mount().host.textContent || "").not.toContain("SAVE_PARRY");
  });

  it("PARADA sigue siendo una acción completa: NO pide subtipo", () => {
    const { host, onAction } = mount();
    click(host, "PARADA");
    // Directamente al flujo espacial; ningún paso intermedio de subtipo.
    expect(host.textContent || "").not.toContain("Tipo de parada");
    click(host, "Zona 1 · izquierda");
    click(host, "Alto · izquierda");
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toBe(GoalieAction.SAVE);
  });
});

describe("Geometría del anillo", () => {
  // El anillo de 11 botones de 64 px solapaba 12 px en escritorio y 20 en
  // móvil, y el hermano superior se quedaba el toque.
  const MOVIL = 360 * 0.88 - 40;   // 88vw menos el padding p-5
  const ESCRITORIO = 384 - 40;     // max-w-sm menos el padding

  it("el botón supera el mínimo táctil de 44 px", () => {
    expect(RADIAL_BUTTON_PX).toBeGreaterThanOrEqual(44);
  });

  it("10 botones (portero) no solapan ni en móvil ni en escritorio", () => {
    for (const ancho of [MOVIL, ESCRITORIO]) {
      const g = radialGeometry(10, RADIAL_BUTTON_PX, ancho);
      expect(g.fits).toBe(true);
      expect(g.separation).toBeGreaterThanOrEqual(RADIAL_BUTTON_PX);
    }
  });

  it("8 botones (jugador de campo) tampoco solapan", () => {
    for (const ancho of [MOVIL, ESCRITORIO]) {
      expect(radialGeometry(8, RADIAL_BUTTON_PX, ancho).fits).toBe(true);
    }
  });

  it("el anillo del portero tiene exactamente 10 botones", () => {
    const { host } = mount();
    const anillo = Array.from(host.querySelectorAll("button")).filter(
      (b) => b.style.width === `${RADIAL_BUTTON_PX}px`,
    );
    expect(anillo).toHaveLength(10);
  });

  it("detecta el solapamiento que tenía la versión de 11 botones de 64 px", () => {
    expect(radialGeometry(11, 64, MOVIL).fits).toBe(false);
  });
});

describe("Salida / intervención", () => {
  it("SALIDA con ÉXITO emite EXIT y el resultado, sin pedir zona", () => {
    const { host, onAction } = mount();
    click(host, "SALIDA");
    click(host, "Éxito");

    expect(onAction).toHaveBeenCalledTimes(1);
    const [type, playerId, meta] = onAction.mock.calls[0];
    expect(type).toBe(GoalieAction.EXIT);
    expect(playerId).toBe("gk1");
    expect(meta.metadata.exitOutcome).toBe("success");
    // La ubicación NO se pide aquí: llega después y es omitible.
    expect(meta.interventionGrid).toBeUndefined();
    expect(meta.originGrid).toBeUndefined();
  });

  it("SALIDA con FALLO emite EXIT con resultado fail", () => {
    const { host, onAction } = mount();
    click(host, "SALIDA");
    click(host, "Fallo");
    expect(onAction.mock.calls[0][0]).toBe(GoalieAction.EXIT);
    expect(onAction.mock.calls[0][2].metadata.exitOutcome).toBe("fail");
  });

  it("la salida se resuelve en 2 toques: no abre selector de pista", () => {
    const { host, onAction } = mount();
    click(host, "SALIDA");
    // Tras elegir SALIDA solo se ofrece el resultado, ninguna zona.
    expect(host.textContent || "").not.toContain("Zona 1 · izquierda");
    click(host, "Éxito");
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("cancelar la salida no registra nada", () => {
    const { host, onAction } = mount();
    click(host, "SALIDA");
    click(host, "Cancelar");
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("Jugador de campo", () => {
  it("no ofrece acciones de portero", () => {
    const { host } = mount({ role: Role.PLAYER });
    const texto = (host.textContent || "").toUpperCase();
    expect(texto).not.toContain("TIPO PARADA");
    expect(texto).not.toContain("SALIDA");
  });

  it("sigue ofreciendo sus acciones de siempre", () => {
    const { host, onAction } = mount({ role: Role.PLAYER });
    click(host, "ASIST");
    expect(onAction.mock.calls[0][0]).toBe(ActionType.ASSIST);
  });
});
