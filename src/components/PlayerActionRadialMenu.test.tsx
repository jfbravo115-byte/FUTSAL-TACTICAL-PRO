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
    expect(meta.goalkeeperZone).toBeUndefined();
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

describe("Contexto de apilamiento de los paneles secundarios", () => {
  /**
   * Regresión del bug del Deploy Preview de la PR #13.
   *
   * Los dos paneles nuevos usaban `absolute inset-0 z-[60]`. `absolute` los
   * posicionaba respecto al body (y los habría roto dentro de cualquier
   * ancestro con transform), y z-60 los dejaba POR DEBAJO del backdrop, que
   * es `fixed z-[200]`. El botón respondía pero la pantalla se veía
   * oscurecida y vacía.
   *
   * Todos los paneles hermanos de este componente usan `fixed … z-[300]`.
   */
  const BACKDROP_Z = 200;

  function panelDe(host: HTMLElement, titulo: string): HTMLElement {
    const panel = Array.from(host.querySelectorAll("div")).find((d) =>
      (d.textContent || "").trim().startsWith(titulo),
    );
    if (!panel) throw new Error(`panel "${titulo}" no encontrado`);
    return panel;
  }

  function comprobarPanel(panel: HTMLElement) {
    // fixed: no depende de ancestros posicionados ni transformados.
    expect(panel.className).toContain("fixed");
    expect(panel.className).not.toContain("absolute");

    // Y por encima del backdrop.
    const z = Number(/z-\[(\d+)\]/.exec(panel.className)?.[1] ?? 0);
    expect(z).toBeGreaterThan(BACKDROP_Z);
  }

  it("el panel de TIPO PARADA se monta por encima del backdrop", () => {
    const { host } = mount();
    click(host, "TIPO PARADA");
    comprobarPanel(panelDe(host, "🧤 Tipo de parada"));
  });

  it("el panel de SALIDA se monta por encima del backdrop", () => {
    const { host } = mount();
    click(host, "SALIDA");
    comprobarPanel(panelDe(host, "🧤 Salida del portero"));
  });

  it("ambos paneles usan la MISMA convención que los paneles ya existentes", () => {
    // El selector de subtipo de recuperación/pérdida es el patrón de
    // referencia del componente: si algún panel nuevo se desvía, este test
    // lo detecta.
    const referencia = mount();
    click(referencia.host, "RECUP.");
    const patron = panelDe(referencia.host, "✅ Tipo de recuperación").className;

    for (const [boton, titulo] of [
      ["TIPO PARADA", "🧤 Tipo de parada"],
      ["SALIDA", "🧤 Salida del portero"],
    ] as const) {
      const { host } = mount();
      click(host, boton);
      const clases = panelDe(host, titulo).className;
      for (const critica of ["fixed", "z-[300]", "top-1/2", "left-1/2", "max-w-sm"]) {
        expect(patron).toContain(critica);
        expect(clases).toContain(critica);
      }
    }
  });

  it("ningún panel secundario queda dentro de un elemento del anillo", () => {
    // Si un panel se renderizara dentro de un botón del anillo heredaría su
    // transform y su escala, y quedaría deformado.
    for (const [boton, titulo] of [
      ["TIPO PARADA", "🧤 Tipo de parada"],
      ["SALIDA", "🧤 Salida del portero"],
    ] as const) {
      const { host } = mount();
      click(host, boton);
      const panel = panelDe(host, titulo);
      expect(panel.closest("button")).toBeNull();
    }
  });
});

// ── TARJETAS ───────────────────────────────────────────────────────────
//
// En un partido real no se encontró la amarilla. Los botones nunca se habían
// quitado: estaban en una barra fija a `bottom-4`, sin área segura y por
// debajo de la navegación inferior. Estos tests montan el menú de verdad, no
// leen el fuente.

describe("las tarjetas se ven y pertenecen a un jugador concreto", () => {
  const barra = (host: HTMLElement) =>
    Array.from(host.querySelectorAll("div")).find((d) =>
      (d.textContent || "").includes("Tarjetas"),
    )!;

  const boton = (host: HTMLElement, texto: string) =>
    Array.from(host.querySelectorAll("button")).find((b) =>
      (b.textContent || "").includes(texto),
    )!;

  it("ambas tarjetas están a la vista nada más abrir el menú", () => {
    const { host } = mount();
    expect(boton(host, "Amarilla")).toBeTruthy();
    expect(boton(host, "Roja")).toBeTruthy();
  });

  it("la barra dice a quién se le saca la tarjeta", () => {
    const { host } = mount({ number: 7, name: "Carlos Ruiz" });
    const texto = barra(host).textContent || "";
    expect(texto).toContain("#7");
    expect(texto).toContain("Carlos");
  });

  it("respeta el área segura inferior y se apoya sobre la navegación", () => {
    const { host } = mount();
    const estilo = barra(host).getAttribute("style") || "";
    expect(estilo).toContain("env(safe-area-inset-bottom");
    expect(estilo).toContain("48px");
  });

  it("emite el tipo de evento de siempre y cierra el menú", () => {
    const { host, onAction, onClose } = mount();
    act(() => {
      boton(host, "Amarilla").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAction).toHaveBeenCalledWith(ActionType.YELLOW_CARD, "gk1");
    expect(onClose).toHaveBeenCalled();
  });

  it("la roja también", () => {
    const { host, onAction } = mount();
    act(() => {
      boton(host, "Roja").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAction).toHaveBeenCalledWith(ActionType.RED_CARD, "gk1");
  });

  it("avisa de que la segunda amarilla expulsa, sin cambiar ninguna regla", () => {
    const { host } = mount({
      stats: { ...player().stats, yellowCards: 1 },
    });
    expect(barra(host).textContent || "").toContain("segunda amarilla expulsa");
  });

  it("un jugador sin tarjetas no recibe ese aviso", () => {
    const { host } = mount();
    expect(barra(host).textContent || "").not.toContain("segunda amarilla expulsa");
  });

  it("muestra cuántas lleva acumuladas", () => {
    const { host } = mount({ stats: { ...player().stats, yellowCards: 1, redCards: 1 } });
    expect(boton(host, "Amarilla").textContent).toContain("1");
    expect(boton(host, "Roja").textContent).toContain("1");
  });

  it("la barra del portero no se apila sobre la de tarjetas", () => {
    const { host } = mount();
    const gk = Array.from(host.querySelectorAll("div")).find((d) =>
      (d.textContent || "").includes("% Paradas"),
    )!;
    const estilo = gk.getAttribute("style") || "";
    expect(estilo).toContain("env(safe-area-inset-bottom");
    expect(estilo).toContain("7rem");
  });
});
