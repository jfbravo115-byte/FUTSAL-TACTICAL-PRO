// @vitest-environment jsdom
/**
 * La ventana única de balón parado.
 *
 * LO QUE PROTEGEN ESTAS PRUEBAS
 * -----------------------------
 * Que cancelar no guarde NADA —ni medio evento— y que confirmar produzca la
 * jugada entera de una vez. Y que la ventana no pida lo que no aplica: el
 * tiro directo no se ofrece en una banda porque el reglamento no lo permite,
 * y las secciones del remate no aparecen si la jugada no acabó en remate.
 */
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Player, Role } from "../types/futsal";
import { SetPieceSequenceModal } from "./SetPieceSequenceModal";
import { SetPieceSequenceDraft } from "../utils/setPieceSequence";

const jugador = (o: Partial<Player> & { id: string; number: number; name: string }): Player => ({
  role: Role.PLAYER,
  isOnPitch: true,
  plusMinus: 0,
  individualTimeSeconds: 0,
  rotationTimeSeconds: 0,
  isOpponent: false,
  stats: {
    goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
    fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
  },
  ...o,
});

const PLANTILLA: Player[] = [
  jugador({ id: "l7", number: 7, name: "Ramón" }),
  jugador({ id: "l10", number: 10, name: "José" }),
  jugador({ id: "lbanco", number: 15, name: "Suplente", isOnPitch: false }),
  jugador({ id: "lcoach", number: 0, name: "ENTRENADOR LOCAL", role: Role.COACH, isOnPitch: false }),
  jugador({ id: "r1", number: 1, name: "POR RIVAL 1", role: Role.GOALKEEPER, isOpponent: true }),
  jugador({ id: "r9", number: 9, name: "Rival Nueve", isOpponent: true }),
];

function montar(props: Partial<React.ComponentProps<typeof SetPieceSequenceModal>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(
      <SetPieceSequenceModal
        root="corner"
        teamName="CD MURCIA"
        opponentName="JIMBEE"
        players={PLANTILLA}
        defaultIsOpponent={false}
        targetGoalkeeperIdFor={(rival) => (rival ? "lgk" : "r1")}
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...props}
      />,
    );
  });
  const pulsar = (selector: string) => {
    const b = host.querySelector<HTMLButtonElement>(selector);
    if (!b) throw new Error(`No existe el control ${selector}`);
    act(() => {
      b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };
  const draft = (): SetPieceSequenceDraft => onConfirm.mock.calls[0][0];
  return { host, onConfirm, onCancel, pulsar, draft };
}

const texto = (host: HTMLElement) => (host.textContent || "").replace(/\s+/g, " ");

describe("cancelar no guarda nada", () => {
  it("ni siquiera con media jugada rellenada", () => {
    const { pulsar, onCancel, onConfirm } = montar();
    pulsar('[data-visual-corner="top-right"]');
    pulsar('[data-seq-taker="l7"]');
    pulsar('[data-seq-outcome="goal"]');
    pulsar("[data-seq-cancel]");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("y confirmar sin lo mínimo tampoco hace nada", () => {
    const { pulsar, onConfirm, host } = montar();
    // Sin esquina ni desenlace, el botón está deshabilitado.
    const confirmar = host.querySelector<HTMLButtonElement>("[data-seq-confirm]")!;
    expect(confirmar.disabled).toBe(true);
    pulsar("[data-seq-confirm]");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(texto(host)).toContain("Falta la ubicación");
  });
});

describe("córner", () => {
  it("una jugada completa sale de una sola ventana", () => {
    const { pulsar, draft, onConfirm } = montar();
    pulsar('[data-visual-corner="top-right"]');
    pulsar('[data-seq-modality="prepared"]');
    pulsar('[data-seq-taker="l7"]');
    pulsar('[data-seq-outcome="goal"]');
    pulsar('[data-seq-finisher="l10"]');
    pulsar('[data-seq-destination="G1"]');
    pulsar("[data-seq-confirm]");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(draft()).toMatchObject({
      root: "corner",
      isOpponent: false,
      cornerSide: "left",
      modality: "prepared",
      outcome: "goal",
      takerId: "l7",
      shot: { finisherId: "l10", destinationGrid: "G1", targetGoalkeeperId: "r1" },
    });
  });

  it("el sacador llega preseleccionado desde el radial", () => {
    const { pulsar, draft } = montar({ presetTakerId: "l10" });
    pulsar('[data-visual-corner="bottom-right"]');
    pulsar('[data-seq-outcome="keep"]');
    pulsar("[data-seq-confirm]");
    expect(draft().takerId).toBe("l10");
  });

  it("si no se elige finalizador, remata quien saca", () => {
    const { pulsar, draft } = montar();
    pulsar('[data-visual-corner="top-right"]');
    pulsar('[data-seq-taker="l7"]');
    pulsar('[data-seq-outcome="shot"]');
    pulsar("[data-seq-confirm]");
    expect(draft().shot?.finisherId).toBe("l7");
  });

  it("el sacador puede quedar sin identificar, y no se inventa", () => {
    const { pulsar, draft } = montar();
    pulsar('[data-visual-corner="top-right"]');
    pulsar('[data-seq-taker="unknown"]');
    pulsar('[data-seq-outcome="keep"]');
    pulsar("[data-seq-confirm]");
    expect(draft().takerId).toBeUndefined();
  });
});

describe("el equipo se corrige sin salir", () => {
  it("y al cambiarlo no se queda elegido un jugador del otro bando", () => {
    const { pulsar, draft } = montar();
    pulsar('[data-visual-corner="top-right"]');
    pulsar('[data-seq-taker="l7"]');
    pulsar('[data-seq-team="opponent"]');
    pulsar('[data-seq-outcome="keep"]');
    pulsar("[data-seq-confirm]");
    expect(draft().isOpponent).toBe(true);
    expect(draft().takerId).toBeUndefined();
  });

  it("los jugadores que se ofrecen son los del bando elegido", () => {
    const { pulsar, host } = montar();
    expect(host.querySelector('[data-seq-taker="l7"]')).not.toBeNull();
    expect(host.querySelector('[data-seq-taker="r9"]')).toBeNull();
    pulsar('[data-seq-team="opponent"]');
    expect(host.querySelector('[data-seq-taker="r9"]')).not.toBeNull();
    expect(host.querySelector('[data-seq-taker="l7"]')).toBeNull();
  });

  it("el cuerpo técnico no saca ni remata: no aparece", () => {
    const { host } = montar();
    expect(host.querySelector('[data-seq-taker="lcoach"]')).toBeNull();
  });

  it("un suplente sí puede salir a sacar", () => {
    const { host } = montar();
    expect(host.querySelector('[data-seq-taker="lbanco"]')).not.toBeNull();
  });
});

describe("saque de banda", () => {
  it("no ofrece tiro directo: de banda no se marca", () => {
    const { host } = montar({ root: "throw_in" });
    expect(host.querySelector('[data-seq-modality="direct"]')).toBeNull();
    expect(host.querySelector('[data-seq-modality="quick"]')).not.toBeNull();
    expect(host.querySelector('[data-seq-modality="prepared"]')).not.toBeNull();
    expect(texto(host)).toContain("De banda no se puede marcar directamente");
  });

  it("la mini pista elige banda y sector de una vez", () => {
    const { pulsar, draft } = montar({ root: "throw_in" });
    pulsar('[data-seq-throw-cell="left-Z3"]');
    pulsar('[data-seq-outcome="keep"]');
    pulsar("[data-seq-confirm]");
    expect(draft()).toMatchObject({
      root: "throw_in",
      throwInSide: "left",
      throwInSector: "Z3",
      modality: "quick",
    });
  });

  it("la pérdida pide su subtipo y crea UNA sola pérdida", () => {
    const { pulsar, draft, host } = montar({ root: "throw_in" });
    pulsar('[data-seq-throw-cell="right-Z1"]');
    pulsar('[data-seq-outcome="loss"]');
    expect(host.querySelector("[data-seq-loss-section]")).not.toBeNull();
    pulsar('[data-seq-loss="intercepted"]');
    pulsar("[data-seq-confirm]");
    expect(draft().loss).toMatchObject({ subType: "intercepted" });
    expect(texto(host)).toContain("cuenta una sola vez");
  });

  it("«nueva banda» se rotula como tal", () => {
    const { host } = montar({ root: "throw_in" });
    expect(texto(host)).toContain("Nueva banda");
  });

  it("conserva el enlace con el despeje del que nació", () => {
    const { pulsar, draft } = montar({ root: "throw_in", fromDeflectEventId: "desp-1" });
    pulsar('[data-seq-throw-cell="left-Z2"]');
    pulsar('[data-seq-outcome="keep"]');
    pulsar("[data-seq-confirm]");
    expect(draft().fromDeflectEventId).toBe("desp-1");
  });
});

describe("falta a favor", () => {
  it("se puede confirmar sin zona: la ubicación es opcional", () => {
    const { pulsar, draft } = montar({ root: "free_kick" });
    pulsar('[data-seq-outcome="keep"]');
    pulsar("[data-seq-confirm]");
    expect(draft()).toMatchObject({ root: "free_kick", outcome: "keep" });
    expect(draft().originGrid).toBeUndefined();
  });

  it("y con zona la guarda", () => {
    const { pulsar, draft } = montar({ root: "free_kick" });
    pulsar('[data-visual-zone="1-3"]'); // carril central · zona alta
    pulsar('[data-seq-outcome="shot"]');
    pulsar("[data-seq-confirm]");
    expect(draft().originGrid).toBe("Z4C");
  });

  it("ofrece tiro directo, que ahí sí existe", () => {
    const { host } = montar({ root: "free_kick" });
    expect(host.querySelector('[data-seq-modality="direct"]')).not.toBeNull();
  });
});

describe("solo se pide lo que aplica", () => {
  it("sin remate no hay sección de remate", () => {
    const { pulsar, host } = montar();
    pulsar('[data-visual-corner="top-right"]');
    pulsar('[data-seq-outcome="keep"]');
    expect(host.querySelector("[data-seq-shot-section]")).toBeNull();
    expect(host.querySelector("[data-seq-loss-section]")).toBeNull();
  });

  it("con remate aparecen finalizador, destino y respuesta del portero", () => {
    const { pulsar, host } = montar();
    pulsar('[data-visual-corner="top-right"]');
    pulsar('[data-seq-outcome="shot"]');
    const seccion = host.querySelector("[data-seq-shot-section]")!;
    expect(seccion).not.toBeNull();
    expect(seccion.querySelector('[data-seq-finisher="l7"]')).not.toBeNull();
    expect(seccion.querySelector('[data-seq-destination="OUT"]')).not.toBeNull();
    expect(seccion.querySelector('[data-seq-response="UNSPECIFIED"]')).not.toBeNull();
  });

  it("los desenlaces que no crean evento lo dicen", () => {
    const { pulsar, host } = montar();
    pulsar('[data-visual-corner="top-right"]');
    pulsar('[data-seq-outcome="blocked"]');
    expect(texto(host)).toContain("No crea ningún evento aparte");
  });
});
