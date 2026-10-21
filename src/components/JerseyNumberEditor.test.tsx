// @vitest-environment jsdom
/**
 * El editor rápido de dorsal.
 *
 * Lo que se protege: que guarde solo el número, que avise de un duplicado del
 * MISMO equipo antes de crearlo, y que el camino principal ante un duplicado
 * sea intercambiar —que es lo que suele haber pasado de verdad—.
 */
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Player, Role } from "../types/futsal";
import { JerseyDecision, JerseyNumberEditor } from "./JerseyNumberEditor";

const jug = (o: Partial<Player> = {}): Player => ({
  id: "r1", number: 0, name: "PJ RIVAL 1", role: Role.PLAYER,
  isOnPitch: true, plusMinus: 0, individualTimeSeconds: 0, rotationTimeSeconds: 0, isOpponent: true,
  stats: { goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
    fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0 },
  ...o,
});

function abrir(player: Player, players: Player[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const decisiones: JerseyDecision[] = [];
  const cerrado = { veces: 0 };
  act(() => {
    root.render(
      <JerseyNumberEditor
        player={player}
        players={players}
        teamName="MI EQUIPO"
        opponentName="EQUIPO VISITANTE"
        onConfirm={(d) => { decisiones.push(d); }}
        onClose={() => { cerrado.veces += 1; }}
      />,
    );
  });
  const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
  const escribir = (valor: string) => {
    const input = q("[data-jersey-input]") as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, valor);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  return { host, q, escribir, decisiones, cerrado, desmontar: () => act(() => root.unmount()) };
}

describe("1 · lo que muestra y lo que guarda", () => {
  it("enseña equipo, identificación, dorsal actual y teclado numérico", () => {
    const p = jug({ number: 0, jerseyNumberKnown: false });
    const { q, desmontar } = abrir(p, [p]);
    expect(q("[data-jersey-editor]")!.textContent).toContain("EQUIPO VISITANTE");
    expect(q("[data-jersey-editor]")!.textContent).toContain("RIVAL A");   // aún sin dorsal
    expect(q("[data-jersey-editor]")!.textContent).toContain("Dorsal actual · ?");
    const input = q("[data-jersey-input]") as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.value).toBe("");
    desmontar();
  });

  it("guarda el número tecleado, con ceros y espacios normalizados", () => {
    const p = jug({ number: 0, jerseyNumberKnown: false });
    const { q, escribir, decisiones, desmontar } = abrir(p, [p]);
    escribir("007");
    act(() => { q("[data-jersey-save]")!.click(); });
    expect(decisiones).toEqual([{ tipo: "guardar", number: 7 }]);
    desmontar();
  });

  it("«dorsal desconocido» NO es guardar un 0: es su propia decisión", () => {
    const p = jug({ number: 7 });
    const { q, decisiones, desmontar } = abrir(p, [p]);
    act(() => { q("[data-jersey-unknown]")!.click(); });
    expect(decisiones).toEqual([{ tipo: "desconocido" }]);
    desmontar();
  });

  it("y dejar el campo VACÍO también es «desconocido», no el dorsal 0", () => {
    const p = jug({ number: 7 });
    const { q, escribir, decisiones, desmontar } = abrir(p, [p]);
    escribir("");
    act(() => { q("[data-jersey-save]")!.click(); });
    expect(decisiones).toEqual([{ tipo: "desconocido" }]);
    desmontar();
  });

  it("el dorsal 0 TECLEADO sí se guarda como dorsal real", () => {
    const p = jug({ number: 7 });
    const { q, escribir, decisiones, desmontar } = abrir(p, [p]);
    escribir("0");
    act(() => { q("[data-jersey-save]")!.click(); });
    expect(decisiones).toEqual([{ tipo: "guardar", number: 0 }]);
    desmontar();
  });

  it("avisa de lo que no es un número y bloquea guardar", () => {
    const p = jug({ number: 7 });
    const { q, escribir, decisiones, desmontar } = abrir(p, [p]);
    escribir("7a");
    expect(q("[data-jersey-error]")!.textContent).toContain("solo admite números");
    expect((q("[data-jersey-save]") as HTMLButtonElement).disabled).toBe(true);
    act(() => { q("[data-jersey-save]")!.click(); });
    expect(decisiones).toEqual([]);
    desmontar();
  });

  it("y de lo que se sale del rango", () => {
    const p = jug({ number: 7 });
    const { q, escribir, desmontar } = abrir(p, [p]);
    escribir("100");
    expect(q("[data-jersey-error]")!.textContent).toContain("0 a 99");
    desmontar();
  });

  it("cancelar no decide nada", () => {
    const p = jug({ number: 7 });
    const { q, escribir, decisiones, cerrado, desmontar } = abrir(p, [p]);
    escribir("9");
    act(() => { q("[data-jersey-cancel]")!.click(); });
    expect(decisiones).toEqual([]);
    expect(cerrado.veces).toBe(1);
    desmontar();
  });
});

describe("2 · duplicados", () => {
  const rival = [
    jug({ id: "r1", number: 0, jerseyNumberKnown: false }),
    jug({ id: "r2", number: 7, name: "PJ RIVAL 2" }),
  ];

  it("avisa de quién lleva ya ese dorsal y NO deja guardarlo", () => {
    const { q, escribir, desmontar } = abrir(rival[0], rival);
    escribir("7");
    expect(q("[data-jersey-duplicate]")!.textContent).toContain("ya está asignado a PJ RIVAL 2");
    expect((q("[data-jersey-save]") as HTMLButtonElement).disabled).toBe(true);
    desmontar();
  });

  it("y ofrece INTERCAMBIAR como camino principal", () => {
    const { q, escribir, decisiones, desmontar } = abrir(rival[0], rival);
    escribir("7");
    act(() => { q("[data-jersey-swap]")!.click(); });
    expect(decisiones).toEqual([{ tipo: "intercambiar", conId: "r2" }]);
    desmontar();
  });

  it("el camino completo r3 → 10: aviso, botón e intercambio con r2", () => {
    // El escenario exacto: r2 lleva el 10 y r3 el 7; se edita r3.
    const equipo = [
      jug({ id: "r2", number: 10, name: "PJ RIVAL 1" }),
      jug({ id: "r3", number: 7, name: "PJ RIVAL 2" }),
    ];
    const { q, escribir, decisiones, desmontar } = abrir(equipo[1], equipo);
    escribir("10");
    expect(q("[data-jersey-duplicate]")!.textContent).toContain("El dorsal 10 ya está asignado a PJ RIVAL 1");
    expect(q("[data-jersey-swap]")).not.toBeNull();
    expect((q("[data-jersey-save]") as HTMLButtonElement).disabled).toBe(true);
    act(() => { q("[data-jersey-swap]")!.click(); });
    expect(decisiones).toEqual([{ tipo: "intercambiar", conId: "r2" }]);
    desmontar();
  });

  it("y el mismo editor con un dorsal LIBRE: ni aviso ni botón, solo guardar", () => {
    const equipo = [
      jug({ id: "r2", number: 10, name: "PJ RIVAL 1" }),
      jug({ id: "r3", number: 7, name: "PJ RIVAL 2" }),
    ];
    const { q, escribir, decisiones, desmontar } = abrir(equipo[1], equipo);
    escribir("99");
    expect(q("[data-jersey-duplicate]")).toBeNull();
    expect(q("[data-jersey-swap]")).toBeNull();
    expect((q("[data-jersey-save]") as HTMLButtonElement).disabled).toBe(false);
    act(() => { q("[data-jersey-save]")!.click(); });
    expect(decisiones).toEqual([{ tipo: "guardar", number: 99 }]);
    desmontar();
  });

  it("el dorsal del OTRO equipo no estorba", () => {
    const mezcla = [
      jug({ id: "r1", number: 0, jerseyNumberKnown: false, isOpponent: true }),
      jug({ id: "L1", number: 7, isOpponent: false, name: "Nuestro siete" }),
    ];
    const { q, escribir, desmontar } = abrir(mezcla[0], mezcla);
    escribir("7");
    expect(q("[data-jersey-duplicate]")).toBeNull();
    expect((q("[data-jersey-save]") as HTMLButtonElement).disabled).toBe(false);
    desmontar();
  });

  it("un pendiente que pide el 0 SÍ choca con quien ya lleva el 0 real", () => {
    // El caso que distingue la marca del número: el editado está por conocer
    // —su 0 es relleno— y otro compañero lleva el dorsal 0 de verdad.
    const equipo = [
      jug({ id: "r1", number: 0, jerseyNumberKnown: false }),
      jug({ id: "r2", number: 0, jerseyNumberKnown: true, name: "EL CERO" }),
    ];
    const { q, escribir, desmontar } = abrir(equipo[0], equipo);
    escribir("0");
    expect(q("[data-jersey-duplicate]")!.textContent).toContain("ya está asignado a EL CERO");
    expect((q("[data-jersey-save]") as HTMLButtonElement).disabled).toBe(true);
    desmontar();
  });

  it("dejar el suyo tal cual no se considera duplicado", () => {
    const { q, escribir, desmontar } = abrir(rival[1], rival);
    escribir("7");
    expect(q("[data-jersey-duplicate]")).toBeNull();
    desmontar();
  });
});
