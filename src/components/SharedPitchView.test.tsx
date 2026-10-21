// @vitest-environment jsdom
/**
 * LOS CRONÓMETROS DE LA PISTA 5v5.
 *
 * Una ficha sin TOT ni ROT no sirve para decidir una rotación, que es para
 * lo que se mira la pista durante el partido. Lo que se protege aquí es que
 * los diez los enseñen SIEMPRE —sin tocar nada, sin desplegar nada— y que los
 * segundos sean los del partido, no una cuenta nueva.
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Player, Role } from "../types/futsal";
import { SharedPitchPlayers } from "./SharedPitchView";
import { DEFAULT_PITCH_METRICS, SharedPitchPlacement } from "../utils/sharedPitch";
import { formatPlayerTime } from "../utils/playerClock";

const jugador = (o: Partial<Player> = {}): Player => ({
  id: "p1",
  number: 7,
  name: "Jugador Uno",
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

const sitio = (id: string, side: "team" | "opponent", left: number): SharedPitchPlacement => ({
  id, side, left, top: 50, nudged: false,
});

function pintar(
  players: Player[],
  placements: SharedPitchPlacement[],
  onSelect: (id: string) => void = () => {},
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const mapa: Record<string, Player> = {};
  for (const p of players) mapa[p.id] = p;
  act(() => {
    root.render(
      <SharedPitchPlayers placements={placements} players={mapa} onSelect={onSelect} />,
    );
  });
  return { host, root, desmontar: () => act(() => root.unmount()) };
}

describe("1 · los diez enseñan dorsal, TOT y ROT sin tocar nada", () => {
  it("una ficha local muestra los dos cronómetros", () => {
    const p = jugador({ individualTimeSeconds: 342, rotationTimeSeconds: 78 });
    const { host, desmontar } = pintar([p], [sitio("p1", "team", 20)]);
    const ficha = host.querySelector('[data-shared-pitch-player="p1"]')!;
    expect(ficha.textContent).toContain("7");
    expect(host.querySelector("[data-shared-pitch-tot]")!.textContent).toContain("TOT 05:42");
    expect(host.querySelector("[data-shared-pitch-rot]")!.textContent).toContain("ROT 01:18");
    desmontar();
  });

  it("y la ficha RIVAL también: en focal solo los veía el equipo propio", () => {
    const r = jugador({ id: "r1", isOpponent: true, number: 9, name: "Rival Uno", individualTimeSeconds: 61, rotationTimeSeconds: 61 });
    const { host, desmontar } = pintar([r], [sitio("r1", "opponent", 80)]);
    expect(host.querySelector("[data-shared-pitch-tot]")!.textContent).toContain("TOT 01:01");
    expect(host.querySelector("[data-shared-pitch-rot]")!.textContent).toContain("ROT 01:01");
    desmontar();
  });

  it("los DIEZ los enseñan, locales y rivales, porteros incluidos", () => {
    const players = [
      ...Array.from({ length: 5 }, (_, i) =>
        jugador({ id: `L${i}`, number: i + 1, individualTimeSeconds: 60 * i, rotationTimeSeconds: i,
                  role: i === 0 ? Role.GOALKEEPER : Role.PLAYER })),
      ...Array.from({ length: 5 }, (_, i) =>
        jugador({ id: `R${i}`, number: i + 1, isOpponent: true, individualTimeSeconds: 30 * i, rotationTimeSeconds: i,
                  role: i === 0 ? Role.GOALKEEPER : Role.PLAYER })),
    ];
    const placements = [
      ...Array.from({ length: 5 }, (_, i) => sitio(`L${i}`, "team", 10 + i * 7)),
      ...Array.from({ length: 5 }, (_, i) => sitio(`R${i}`, "opponent", 60 + i * 7)),
    ];
    const { host, desmontar } = pintar(players, placements);
    expect(host.querySelectorAll("[data-shared-pitch-player]")).toHaveLength(10);
    expect(host.querySelectorAll("[data-shared-pitch-tot]")).toHaveLength(10);
    expect(host.querySelectorAll("[data-shared-pitch-rot]")).toHaveLength(10);
    // Y el portero se distingue sin depender del color.
    expect(host.querySelector('[data-shared-pitch-player="L0"]')!.textContent).toContain("POR");
    expect(host.querySelector('[data-shared-pitch-player="R0"]')!.textContent).toContain("POR");
    desmontar();
  });

  it("los cronómetros NO están escondidos tras un tooltip ni una selección", () => {
    const p = jugador({ individualTimeSeconds: 125, rotationTimeSeconds: 5 });
    // Sin seleccionar y sin pasar el ratón: tienen que estar en el documento.
    const { host, desmontar } = pintar([p], [sitio("p1", "team", 20)]);
    const tot = host.querySelector("[data-shared-pitch-tot]")!;
    expect(tot.getAttribute("title")).toBeNull();
    expect(tot.closest("[hidden]")).toBeNull();
    expect(tot.textContent).toContain("TOT 02:05");
    desmontar();
  });

  it("la ficha es un ÚNICO botón: nada dentro intercepta el toque", () => {
    const tocados: string[] = [];
    const p = jugador();
    const { host, desmontar } = pintar([p], [sitio("p1", "team", 20)], (id) => {
      tocados.push(id);
    });
    const ficha = host.querySelector('[data-shared-pitch-player="p1"]') as HTMLButtonElement;
    expect(ficha.tagName).toBe("BUTTON");
    expect(ficha.querySelectorAll("button, a, input")).toHaveLength(0);
    act(() => { ficha.click(); });
    expect(tocados).toEqual(["p1"]);   // primer toque, una sola vez
    desmontar();
  });

  it("la ficha mide lo que dicen las medidas, y cumple el mínimo táctil", () => {
    const p = jugador();
    const { host, desmontar } = pintar([p], [sitio("p1", "team", 20)]);
    const ficha = host.querySelector('[data-shared-pitch-player="p1"]') as HTMLElement;
    expect(ficha.style.width).toBe(`${DEFAULT_PITCH_METRICS.cardWidth}px`);
    expect(ficha.style.height).toBe(`${DEFAULT_PITCH_METRICS.cardHeight}px`);
    expect(DEFAULT_PITCH_METRICS.cardWidth).toBeGreaterThanOrEqual(56);
    expect(DEFAULT_PITCH_METRICS.cardHeight).toBeGreaterThanOrEqual(56);
    desmontar();
  });

  it("un nombre larguísimo no ensancha la ficha: se recorta", () => {
    const p = jugador({ name: "Rodríguez-Fernández de la Torre y Villalobos" });
    const { host, desmontar } = pintar([p], [sitio("p1", "team", 20)]);
    const ficha = host.querySelector('[data-shared-pitch-player="p1"]') as HTMLElement;
    expect(ficha.style.width).toBe(`${DEFAULT_PITCH_METRICS.cardWidth}px`);
    expect(ficha.className).toContain("overflow-hidden");
    expect([...ficha.querySelectorAll("span")].some((s) => s.className.includes("truncate"))).toBe(true);
    desmontar();
  });

  it("el lector de pantalla también oye los dos tiempos", () => {
    const p = jugador({ individualTimeSeconds: 342, rotationTimeSeconds: 78 });
    const { host, desmontar } = pintar([p], [sitio("p1", "team", 20)]);
    const etiqueta = host.querySelector('[data-shared-pitch-player="p1"]')!.getAttribute("aria-label")!;
    expect(etiqueta).toContain("05:42");
    expect(etiqueta).toContain("01:18");
    desmontar();
  });
});

describe("2 · los segundos son los del partido, no una cuenta nueva", () => {
  it("la ficha solo FORMATEA: mismos campos y mismo formato que en focal", () => {
    for (const seg of [0, 1, 59, 60, 61, 342, 3599, 3600, 3601]) {
      const p = jugador({ individualTimeSeconds: seg, rotationTimeSeconds: seg });
      const { host, desmontar } = pintar([p], [sitio("p1", "team", 20)]);
      expect(host.querySelector("[data-shared-pitch-tot]")!.textContent)
        .toContain(`TOT ${formatPlayerTime(seg)}`);
      desmontar();
    }
  });

  it("con el reloj parado, los valores se quedan donde estaban", () => {
    // La ficha no tiene temporizador propio: si nadie cambia el jugador, no
    // cambia nada. Se vuelve a pintar el mismo jugador y da lo mismo.
    const p = jugador({ individualTimeSeconds: 100, rotationTimeSeconds: 10 });
    const a = pintar([p], [sitio("p1", "team", 20)]);
    const primero = a.host.querySelector("[data-shared-pitch-tot]")!.textContent;
    a.desmontar();
    const b = pintar([p], [sitio("p1", "team", 20)]);
    expect(b.host.querySelector("[data-shared-pitch-tot]")!.textContent).toBe(primero);
    b.desmontar();
  });

  it("y al avanzar el reloj, la ficha refleja el valor nuevo", () => {
    const antes = jugador({ individualTimeSeconds: 100, rotationTimeSeconds: 10 });
    const despues = { ...antes, individualTimeSeconds: 160, rotationTimeSeconds: 70 };
    const a = pintar([antes], [sitio("p1", "team", 20)]);
    expect(a.host.querySelector("[data-shared-pitch-tot]")!.textContent).toContain("TOT 01:40");
    a.desmontar();
    const b = pintar([despues], [sitio("p1", "team", 20)]);
    expect(b.host.querySelector("[data-shared-pitch-tot]")!.textContent).toContain("TOT 02:40");
    expect(b.host.querySelector("[data-shared-pitch-rot]")!.textContent).toContain("ROT 01:10");
    b.desmontar();
  });

  it("tras una sustitución: el que entra conserva su TOT y estrena ROT", () => {
    // Es lo que hace `aplicarSustitucion`: ROT a 0 solo en una entrada real,
    // TOT intacto. La ficha enseña exactamente eso.
    const entra = jugador({ id: "p9", number: 9, individualTimeSeconds: 540, rotationTimeSeconds: 0 });
    const { host, desmontar } = pintar([entra], [sitio("p9", "team", 30)]);
    expect(host.querySelector("[data-shared-pitch-tot]")!.textContent).toContain("TOT 09:00");
    expect(host.querySelector("[data-shared-pitch-rot]")!.textContent).toContain("ROT 00:00");
    desmontar();
  });
});

// ── 3 · LAS DOS ESCALAS, SOBRE LA FICHA ─────────────────────────────────

describe("3 · TOT y ROT se colorean por separado y por equipo", () => {
  /** El caso que motivó todo: A juega mucho pero acaba de entrar; B al revés. */
  const cruzado = () => [
    jugador({ id: "A", number: 4, individualTimeSeconds: 20 * 60, rotationTimeSeconds: 60 }),
    jugador({ id: "B", number: 6, individualTimeSeconds: 8 * 60, rotationTimeSeconds: 4 * 60 }),
  ];
  const sitios = [sitio("A", "team", 20), sitio("B", "team", 35)];
  const nivel = (host: HTMLElement, id: string, campo: "tot" | "rot") =>
    host.querySelector(`[data-shared-pitch-player="${id}"] [data-shared-pitch-${campo}]`)!
      .getAttribute("data-load-level");

  it("A sale rojo en TOT y verde en ROT; B al contrario", () => {
    const { host, desmontar } = pintar(cruzado(), sitios);
    expect(nivel(host, "A", "tot")).toBe("high");
    expect(nivel(host, "A", "rot")).toBe("low");
    expect(nivel(host, "B", "tot")).toBe("low");
    expect(nivel(host, "B", "rot")).toBe("high");
    desmontar();
  });

  it("y cada cápsula lleva SU color, no el de la otra", () => {
    const { host, desmontar } = pintar(cruzado(), sitios);
    const a = host.querySelector('[data-shared-pitch-player="A"]')!;
    const tot = a.querySelector("[data-shared-pitch-tot]") as HTMLElement;
    const rot = a.querySelector("[data-shared-pitch-rot]") as HTMLElement;
    expect(tot.style.color).not.toBe(rot.style.color);
    expect(tot.style.backgroundColor).not.toBe(rot.style.backgroundColor);
    expect(tot.style.color).toBeTruthy();
    expect(rot.style.borderColor).toBeTruthy();
    desmontar();
  });

  it("el color NO es la única señal: cada cápsula lleva su flecha y su rótulo", () => {
    const { host, desmontar } = pintar(cruzado(), sitios);
    const a = host.querySelector('[data-shared-pitch-player="A"]')!;
    expect(a.querySelector("[data-shared-pitch-tot] [data-load-marker]")!.textContent).toBe("↑");
    expect(a.querySelector("[data-shared-pitch-rot] [data-load-marker]")!.textContent).toBe("↓");
    expect(a.querySelector("[data-shared-pitch-tot]")!.getAttribute("aria-label"))
      .toBe("Tiempo total 20:00 · mayor carga del equipo");
    expect(a.querySelector("[data-shared-pitch-rot]")!.getAttribute("aria-label"))
      .toBe("Rotación 01:00 · menor carga del equipo");
    desmontar();
  });

  it("el cuerpo de la ficha conserva el color del EQUIPO, no el de la carga", () => {
    const players = [
      ...cruzado(),
      jugador({ id: "R", number: 9, isOpponent: true, individualTimeSeconds: 600, rotationTimeSeconds: 600 }),
    ];
    const { host, desmontar } = pintar(players, [...sitios, sitio("R", "opponent", 80)]);
    const local = host.querySelector('[data-shared-pitch-player="A"]') as HTMLElement;
    const rival = host.querySelector('[data-shared-pitch-player="R"]') as HTMLElement;
    expect(local.className).toContain("bg-blue-700/85");
    expect(rival.className).toContain("bg-red-900/85");
    // El color de carga vive SOLO en las cápsulas.
    expect(local.style.backgroundColor).toBe("");
    expect(rival.style.backgroundColor).toBe("");
    desmontar();
  });

  it("locales y rivales se clasifican por separado", () => {
    // El local con 200 s es el que más ha jugado de los suyos aunque el rival
    // lleve 900: cada equipo tiene su propia escala.
    const players = [
      jugador({ id: "L1", individualTimeSeconds: 100, rotationTimeSeconds: 100 }),
      jugador({ id: "L2", individualTimeSeconds: 200, rotationTimeSeconds: 10 }),
      jugador({ id: "R1", isOpponent: true, individualTimeSeconds: 900, rotationTimeSeconds: 10 }),
      jugador({ id: "R2", isOpponent: true, individualTimeSeconds: 950, rotationTimeSeconds: 100 }),
    ];
    const { host, desmontar } = pintar(players, [
      sitio("L1", "team", 15), sitio("L2", "team", 35),
      sitio("R1", "opponent", 65), sitio("R2", "opponent", 85),
    ]);
    expect(nivel(host, "L2", "tot")).toBe("high");
    expect(nivel(host, "R1", "tot")).toBe("low");
    expect(nivel(host, "L1", "rot")).toBe("high");
    expect(nivel(host, "R1", "rot")).toBe("low");
    desmontar();
  });

  it("un suplente a cero minutos entra en la escala TOT y marca el verde", () => {
    const players = [
      jugador({ id: "A", individualTimeSeconds: 600, rotationTimeSeconds: 60 }),
      jugador({ id: "B", individualTimeSeconds: 300, rotationTimeSeconds: 30 }),
      jugador({ id: "S", isOnPitch: false, individualTimeSeconds: 0, rotationTimeSeconds: 0 }),
    ];
    const { host, desmontar } = pintar(players, [sitio("A", "team", 20), sitio("B", "team", 35)]);
    // Con el suplente dentro, B queda a media escala en vez de ser el mínimo.
    expect(nivel(host, "B", "tot")).toBe("mid");
    // Y el suplente NO entra en ROT: ahí solo están A y B.
    expect(nivel(host, "A", "rot")).toBe("high");
    expect(nivel(host, "B", "rot")).toBe("low");
    desmontar();
  });

  it("todos con el mismo tiempo → neutro, no todos rojos", () => {
    const players = [
      jugador({ id: "A", individualTimeSeconds: 300, rotationTimeSeconds: 60 }),
      jugador({ id: "B", number: 6, individualTimeSeconds: 300, rotationTimeSeconds: 60 }),
    ];
    const { host, desmontar } = pintar(players, sitios);
    expect(nivel(host, "A", "tot")).toBe("neutral");
    expect(nivel(host, "B", "rot")).toBe("neutral");
    desmontar();
  });

  it("un solo jugador en pista → neutro", () => {
    const { host, desmontar } = pintar([jugador({ id: "A" })], [sitio("A", "team", 20)]);
    expect(nivel(host, "A", "tot")).toBe("neutral");
    expect(nivel(host, "A", "rot")).toBe("neutral");
    desmontar();
  });

  it("con los mismos segundos, los mismos colores: nada parpadea solo", () => {
    const a = pintar(cruzado(), sitios);
    const colorA = (a.host.querySelector('[data-shared-pitch-player="A"] [data-shared-pitch-tot]') as HTMLElement).style.color;
    a.desmontar();
    const b = pintar(cruzado(), sitios);
    const colorB = (b.host.querySelector('[data-shared-pitch-player="A"] [data-shared-pitch-tot]') as HTMLElement).style.color;
    expect(colorB).toBe(colorA);
    b.desmontar();
  });

  it("y la ficha sigue sin tener temporizador propio", () => {
    const fuente = SharedPitchPlayers.toString();
    expect(fuente).not.toMatch(/setInterval|setTimeout|Date\.now/);
  });
});
