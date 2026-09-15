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
import { PlayerActionRadialMenu } from "./PlayerActionRadialMenu";

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

  it("BLOCAJE produce SAVE_CATCH", () => {
    const { host, onAction } = mount();
    click(host, "BLOCAJE");
    click(host, "Zona 1 · izquierda");
    click(host, "Alto · izquierda");
    expect(onAction.mock.calls[0][0]).toBe(GoalieAction.SAVE_CATCH);
  });

  it("DESPEJE produce SAVE_DEFLECT", () => {
    const { host, onAction } = mount();
    click(host, "DESPEJE");
    click(host, "Zona 1 · izquierda");
    click(host, "Alto · izquierda");
    expect(onAction.mock.calls[0][0]).toBe(GoalieAction.SAVE_DEFLECT);
  });

  it("NINGÚN flujo nuevo produce SAVE_PARRY", () => {
    for (const boton of ["PARADA", "BLOCAJE", "DESPEJE"]) {
      const { host, onAction } = mount();
      click(host, boton);
      click(host, "Zona 1 · izquierda");
      click(host, "Alto · izquierda");
      expect(onAction.mock.calls[0][0]).not.toBe(GoalieAction.SAVE_PARRY);
    }
    const { host } = mount();
    expect(host.textContent || "").not.toContain("SAVE_PARRY");
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
    expect(texto).not.toContain("BLOCAJE");
    expect(texto).not.toContain("SALIDA");
  });

  it("sigue ofreciendo sus acciones de siempre", () => {
    const { host, onAction } = mount({ role: Role.PLAYER });
    click(host, "ASIST");
    expect(onAction.mock.calls[0][0]).toBe(ActionType.ASSIST);
  });
});
