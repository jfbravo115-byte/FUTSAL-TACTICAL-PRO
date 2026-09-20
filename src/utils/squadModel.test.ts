/**
 * Convocatoria del partido.
 *
 * EL BUG QUE ESTO FIJA
 * --------------------
 * Con 16 jugadores en plantilla y 12 convocados, el radial de CAMBIO ofrecía
 * 11 suplentes en vez de 7: cuatro de ellos ni siquiera estaban en el
 * pabellón. La causa no era un filtro roto sino uno que nunca se escribió —
 * `startMatch` volcaba la plantilla entera en el partido, así que el radial,
 * que ofrece "todo el que no está en pista", ofrecía la plantilla menos la
 * pista.
 *
 * Se prueba sobre helpers puros y sobre el código fuente de las pantallas.
 * `MatchTracker` son 8.000 líneas y no se puede montar en jsdom; leer el
 * fuente es lo que ya hacemos en reportPagination y tacticalProRoutes, y es
 * la única forma de fijar que las TRES puertas al banquillo usan el mismo
 * helper.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Player, Role } from "../types/futsal";
import { normalizeLineup } from "./lineupIntegrity";
import {
  MAX_STARTERS,
  MAX_STARTING_GOALKEEPERS,
  STARTER_BLOCK_MESSAGE,
  availableForSubstitution,
  calledUpPlayers,
  isAvailableForSubstitution,
  disciplinaryState,
  isSentOff,
  isStaff,
  starterBlockReason,
} from "./squadModel";

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf-8");
const matchTracker = leer("../pages/MatchTracker.tsx");

const STATS = {
  goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
  fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0,
  saves: 0, conceded: 0,
};

/** Una fila de plantilla, como las que maneja PreMatch. */
type Fila = { id: string; role: Role; isStarter: boolean; isOpponent: boolean };

/** Plantilla de 16: 2 porteros y 14 de campo. */
function plantilla16(): Fila[] {
  return [
    { id: "p1", role: Role.GOALKEEPER, isStarter: true, isOpponent: false },
    { id: "p2", role: Role.PLAYER, isStarter: true, isOpponent: false },
    { id: "p3", role: Role.PLAYER, isStarter: true, isOpponent: false },
    { id: "p4", role: Role.PLAYER, isStarter: true, isOpponent: false },
    { id: "p5", role: Role.PLAYER, isStarter: true, isOpponent: false },
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `p${i + 6}`, role: Role.PLAYER, isStarter: false, isOpponent: false,
    })),
    { id: "p16", role: Role.GOALKEEPER, isStarter: false, isOpponent: false },
  ];
}

/** Los 12 primeros. Los cuatro restantes se quedan en casa. */
const convocatoria12 = () =>
  new Set(plantilla16().slice(0, 12).map((p) => p.id));

const jugador = (o: Partial<Player> & { id: string }): Player => ({
  number: 0, name: o.id, role: Role.PLAYER, isOnPitch: false,
  plusMinus: 0, individualTimeSeconds: 0, isOpponent: false,
  stats: { ...STATS }, ...o,
});

/**
 * Reproduce lo que hace `startMatch` con la convocatoria: exactamente las
 * mismas dos llamadas, en el mismo orden.
 */
function construirPartido(filas: Fila[], convocados: ReadonlySet<string>): Player[] {
  const convocatoria = calledUpPlayers(filas, convocados);
  const normalized = new Map(
    normalizeLineup(
      convocatoria.map((p) => ({ id: p.id, role: p.role, wantsOnPitch: p.isStarter })),
    ).map((n) => [n.id, n]),
  );
  return convocatoria.map((p) =>
    jugador({
      id: p.id,
      role: p.role,
      isOnPitch: normalized.get(p.id)?.isOnPitch ?? false,
      pitchPosition: normalized.get(p.id)?.pitchPosition,
      isStarter: p.isStarter,
    }),
  );
}

describe("de la plantilla al partido", () => {
  it("plantilla 16 → convocatoria 12 → el partido recibe 12 locales", () => {
    const partido = construirPartido(plantilla16(), convocatoria12());
    expect(plantilla16()).toHaveLength(16);
    expect(partido).toHaveLength(12);
  });

  it("los 4 no convocados NO están en el partido", () => {
    const partido = construirPartido(plantilla16(), convocatoria12());
    const ids = partido.map((p) => p.id);
    for (const ausente of ["p13", "p14", "p15", "p16"]) {
      expect(ids).not.toContain(ausente);
    }
  });

  it("con 5 en pista, los sustitutos disponibles son 7", () => {
    const partido = construirPartido(plantilla16(), convocatoria12());
    expect(partido.filter((p) => p.isOnPitch)).toHaveLength(5);
    expect(availableForSubstitution(partido, false)).toHaveLength(7);
  });

  it("REGRESIÓN DEL BUG: 16 y 12 no pueden producir un banquillo de 11", () => {
    // Así se comportaba antes: la plantilla entera entraba en el partido.
    const comoAntes = construirPartido(plantilla16(), new Set(plantilla16().map((p) => p.id)));
    expect(availableForSubstitution(comoAntes, false)).toHaveLength(11); // el defecto
    // Y así se comporta ahora.
    const ahora = construirPartido(plantilla16(), convocatoria12());
    expect(availableForSubstitution(ahora, false)).toHaveLength(7);
    expect(availableForSubstitution(ahora, false)).not.toHaveLength(11);
  });

  it("un no convocado nunca puede aparecer en CAMBIO, porque no existe en el partido", () => {
    const partido = construirPartido(plantilla16(), convocatoria12());
    const banquillo = availableForSubstitution(partido, false).map((p) => p.id);
    expect(banquillo).not.toContain("p13");
    expect(banquillo).not.toContain("p16");
    expect(banquillo.every((id) => convocatoria12().has(id))).toBe(true);
  });

  it("un segundo partido admite una convocatoria distinta sobre la MISMA plantilla", () => {
    const plantilla = plantilla16();
    const partidoA = construirPartido(plantilla, new Set(plantilla.slice(0, 12).map((p) => p.id)));
    const partidoB = construirPartido(
      plantilla,
      new Set([...plantilla.slice(0, 8), ...plantilla.slice(12)].map((p) => p.id)),
    );
    expect(partidoA).toHaveLength(12);
    expect(partidoB).toHaveLength(12);
    expect(partidoB.map((p) => p.id)).toContain("p16");
    expect(partidoA.map((p) => p.id)).not.toContain("p16");
    // Y la plantilla sigue intacta para el siguiente.
    expect(plantilla).toHaveLength(16);
    expect(plantilla).toEqual(plantilla16());
  });

  it("la convocatoria no puede contener a quien no está en la plantilla", () => {
    const filas = plantilla16();
    const inventado = new Set([...convocatoria12(), "no-existe"]);
    expect(calledUpPlayers(filas, inventado).map((p) => p.id)).not.toContain("no-existe");
  });

  it("el rival nunca se convoca: se filtra por ser rival", () => {
    const filas = [
      ...plantilla16(),
      { id: "r1", role: Role.PLAYER, isStarter: true, isOpponent: true },
    ];
    const convocados = new Set([...convocatoria12(), "r1"]);
    expect(calledUpPlayers(filas, convocados).map((p) => p.id)).not.toContain("r1");
  });
});

describe("elegibilidad del banquillo", () => {
  const partido = (): Player[] => [
    jugador({ id: "enPista", isOnPitch: true }),
    jugador({ id: "suplente" }),
    jugador({ id: "coach", role: Role.COACH }),
    jugador({ id: "delegado", role: Role.DELEGATE }),
    jugador({ id: "expulsado", stats: { ...STATS, redCards: 1 } }),
    jugador({ id: "rival", isOpponent: true }),
  ];

  it("un jugador en pista no aparece como sustituto de sí mismo ni de nadie", () => {
    expect(availableForSubstitution(partido(), false).map((p) => p.id)).not.toContain("enPista");
  });

  it("el cuerpo técnico no aparece", () => {
    const ids = availableForSubstitution(partido(), false).map((p) => p.id);
    expect(ids).not.toContain("coach");
    expect(ids).not.toContain("delegado");
    expect(isStaff(Role.COACH)).toBe(true);
    expect(isStaff(Role.DELEGATE)).toBe(true);
    expect(isStaff(Role.GOALKEEPER)).toBe(false);
  });

  it("un expulsado no vuelve a entrar", () => {
    expect(availableForSubstitution(partido(), false).map((p) => p.id)).not.toContain("expulsado");
    expect(isSentOff({ stats: { ...STATS, redCards: 1 } })).toBe(true);
    expect(isSentOff({ stats: { ...STATS } })).toBe(false);
  });

  it("no se cruzan los bandos", () => {
    expect(availableForSubstitution(partido(), false).map((p) => p.id)).toEqual(["suplente"]);
    expect(availableForSubstitution(partido(), true).map((p) => p.id)).toEqual(["rival"]);
  });

  it("el predicado unitario coincide con el filtro", () => {
    for (const p of partido()) {
      expect(isAvailableForSubstitution(p, false)).toBe(
        availableForSubstitution(partido(), false).some((q) => q.id === p.id),
      );
    }
  });
});

describe("quinteto inicial", () => {
  const filas = (starters: string[], gk: string[] = ["p1"]): Fila[] =>
    Array.from({ length: 8 }, (_, i) => ({
      id: `p${i + 1}`,
      role: gk.includes(`p${i + 1}`) ? Role.GOALKEEPER : Role.PLAYER,
      isStarter: starters.includes(`p${i + 1}`),
      isOpponent: false,
    }));

  const todos = new Set(Array.from({ length: 8 }, (_, i) => `p${i + 1}`));

  it("los límites son los mismos que aplica normalizeLineup", () => {
    expect(MAX_STARTERS).toBe(5);
    expect(MAX_STARTING_GOALKEEPERS).toBe(1);
  });

  it("el sexto titular se rechaza, no se recorta en silencio", () => {
    const p = filas(["p1", "p2", "p3", "p4", "p5"]);
    const sexto = p.find((x) => x.id === "p6")!;
    expect(starterBlockReason(sexto, p, todos)).toBe("squad-full");
    expect(STARTER_BLOCK_MESSAGE["squad-full"]).toMatch(/ya tiene 5/);
  });

  it("un segundo portero titular se rechaza", () => {
    const p = filas(["p1"], ["p1", "p8"]);
    const segundoPortero = p.find((x) => x.id === "p8")!;
    expect(starterBlockReason(segundoPortero, p, todos)).toBe("goalkeeper-taken");
  });

  it("con hueco, no bloquea", () => {
    const p = filas(["p1", "p2"]);
    expect(starterBlockReason(p.find((x) => x.id === "p3")!, p, todos)).toBeNull();
  });

  it("re-marcar a quien ya es titular no cuenta dos veces", () => {
    const p = filas(["p1", "p2", "p3", "p4", "p5"]);
    expect(starterBlockReason(p.find((x) => x.id === "p5")!, p, todos)).toBeNull();
  });

  it("los titulares no convocados no ocupan plaza en el quinteto", () => {
    // p2..p5 son titulares pero se quedan fuera de la convocatoria: el
    // quinteto está vacío de hecho, así que p6 puede entrar.
    const p = filas(["p1", "p2", "p3", "p4", "p5"]);
    const soloDos = new Set(["p1", "p6"]);
    expect(starterBlockReason(p.find((x) => x.id === "p6")!, p, soloDos)).toBeNull();
  });

  it("el quinteto construido nunca supera 5 ni lleva dos porteros", () => {
    // Aunque llegaran ocho marcados, normalizeLineup sigue siendo la última
    // línea de defensa: la UI evita el caso, esto lo garantiza.
    const ocho = plantilla16().map((p) => ({ ...p, isStarter: true }));
    const partido = construirPartido(ocho, new Set(ocho.map((p) => p.id)));
    const enPista = partido.filter((p) => p.isOnPitch);
    expect(enPista.length).toBeLessThanOrEqual(MAX_STARTERS);
    expect(enPista.filter((p) => p.role === Role.GOALKEEPER).length)
      .toBeLessThanOrEqual(MAX_STARTING_GOALKEEPERS);
  });
});

describe("partidos históricos", () => {
  it("siguen siendo legibles sin migración ni campo nuevo", () => {
    // Un partido guardado antes de esto: su `players` es la plantilla de
    // aquel día, sin marca de convocatoria. Se lee tal cual.
    const historico: Player[] = [
      jugador({ id: "h1", isOnPitch: true }),
      jugador({ id: "h2" }),
      jugador({ id: "h3" }),
    ];
    expect(availableForSubstitution(historico, false).map((p) => p.id)).toEqual(["h2", "h3"]);
    // Ni un campo añadido a los jugadores guardados.
    expect(Object.keys(historico[0])).not.toContain("isCalledUp");
  });

  it("no se deduce la convocatoria de los minutos ni de quién pisó la pista", () => {
    // El helper no mira tiempos, ni estadísticas, ni eventos: si un partido
    // histórico no dice quién estaba convocado, no se inventa.
    const codigo = leer("./squadModel.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toContain("individualTimeSeconds");
    expect(codigo).not.toContain("stats.goals");
    expect(codigo).not.toContain("events");
    expect(codigo).not.toContain("isCalledUp");
  });
});

describe("una sola puerta al banquillo", () => {
  const matchTracker = leer("../pages/MatchTracker.tsx");
  const preMatch = leer("../pages/PreMatch.tsx");

  it("las DOS rutas de CAMBIO usan el helper compartido", () => {
    const usos = matchTracker.split("benchPlayers={availableForSubstitution(").length - 1;
    expect(usos).toBe(2);
  });

  it("y la tercera superficie de banquillo también", () => {
    // El panel "BANQUILLO / DISPONIBLES" de gestión de equipo llevaba una
    // tercera copia de las mismas reglas. Ahora son tres llamadas al helper:
    // los dos radiales y ese panel.
    expect(matchTracker.split("availableForSubstitution(").length - 1).toBe(3);
    expect(matchTracker).toContain("availableForSubstitution(matchData.players)");
  });

  it("ninguna reimplementa las reglas por su cuenta", () => {
    expect(matchTracker).not.toContain("p.stats.redCards === 0");
    expect(matchTracker).not.toContain("benchPlayers={matchData.players.filter(");
  });

  it("sin bando, el helper devuelve los dos equipos (lo que ese panel mostraba)", () => {
    const mixto: Player[] = [
      jugador({ id: "local" }),
      jugador({ id: "rival", isOpponent: true }),
      jugador({ id: "enPista", isOnPitch: true }),
    ];
    expect(availableForSubstitution(mixto).map((p) => p.id)).toEqual(["local", "rival"]);
  });

  it("startMatch construye el partido desde la convocatoria, no desde la plantilla", () => {
    expect(preMatch).toContain("calledUpPlayers(players, calledUp)");
    expect(preMatch).toContain("const localPlayers = convocatoria.map((p) => buildPlayer(p));");
    // La línea del bug ya no existe.
    expect(preMatch).not.toContain("players.filter((p) => !p.isOpponent).map((p) => buildPlayer(p))");
  });

  it("la convocatoria NO se guarda en la plantilla persistente", () => {
    // `buildTemplatePayload` sigue recibiendo la plantilla entera y nada más.
    expect(preMatch).toContain("buildTemplatePayload(teamName, teamLogo, players)");
    expect(preMatch).not.toMatch(/buildTemplatePayload\([^)]*calledUp/);
    expect(leer("../services/templateLoadService.ts")).not.toContain("calledUp");
  });

  it("desconvocar a un titular le quita isStarter", () => {
    expect(preMatch).toMatch(
      /next\.delete\(id\);[\s\S]{0,200}isStarter: false/,
    );
  });

  it("hacer titular a un no convocado lo convoca", () => {
    expect(preMatch).toContain("convocatoria.add(id);");
    expect(preMatch).toContain("setCalledUp(convocatoria);");
  });

  it("el tope del quinteto se aplica en la UI, no al arrancar", () => {
    expect(preMatch).toContain("starterBlockReason(player, players, convocatoria)");
    expect(preMatch).toContain("setSquadNotice(STARTER_BLOCK_MESSAGE[motivo]);");
  });

  it("no se ha añadido isCalledUp al modelo de datos", () => {
    expect(leer("../types/futsal.ts")).not.toContain("isCalledUp");
    expect(leer("../types/futsal.ts")).not.toContain("calledUpPlayerIds");
    expect(leer("../types/futsal.ts")).not.toContain("squadIds");
  });
});

// ── ESTADO DISCIPLINARIO ───────────────────────────────────────────────
//
// En CD MURCIA 2-4 PR7 el informe salió con 0 tarjetas de jugador. Los
// botones nunca se habían quitado: vivían en una barra fija al pie de la
// pantalla, sin área segura y por debajo de la navegación inferior, así que
// en un móvil no se encontraban. Estos tests fijan las dos cosas — la regla
// disciplinaria, que no cambia, y el sitio donde se pulsa, que sí.

describe("6-10 · el indicador se deriva de las estadísticas del jugador", () => {
  const conTarjetas = (yellowCards: number, redCards: number) =>
    jugador({ id: "x", stats: { ...STATS, yellowCards, redCards } });

  it("6 · una amarilla deja el estado en 'yellow'", () => {
    expect(disciplinaryState(conTarjetas(1, 0))).toBe("yellow");
  });

  it("7 · una roja deja el estado en 'red'", () => {
    expect(disciplinaryState(conTarjetas(0, 1))).toBe("red");
  });

  it("7b · la roja manda sobre la amarilla", () => {
    expect(disciplinaryState(conTarjetas(2, 1))).toBe("red");
  });

  it("sin tarjetas no hay indicador", () => {
    expect(disciplinaryState(conTarjetas(0, 0))).toBe("none");
    expect(disciplinaryState({ stats: undefined as any })).toBe("none");
  });

  it("10 · borrar la tarjeta devuelve el indicador solo, porque sale de stats", () => {
    // No hay estado visual paralelo que revertir: si handleDeleteEvent baja
    // el contador, el aura desaparece sin que nadie la toque.
    const amonestado = conTarjetas(1, 0);
    expect(disciplinaryState(amonestado)).toBe("yellow");
    const revertido = { ...amonestado, stats: { ...amonestado.stats, yellowCards: 0 } };
    expect(disciplinaryState(revertido)).toBe("none");
  });

  it("8 · la doble amarilla sigue produciendo expulsión, y se lee como roja", () => {
    // La regla vive en MatchTracker.handleAction y no se ha tocado.
    expect(matchTracker).toMatch(
      /stats\.yellowCards \+= 1;[\s\S]{0,160}stats\.yellowCards >= 2[\s\S]{0,160}stats\.redCards \+= 1;/,
    );
    expect(matchTracker).toMatch(/stats\.redCards \+= 1;[\s\S]{0,120}isOnPitch: false/);
    expect(disciplinaryState(conTarjetas(2, 1))).toBe("red");
  });

  it("9 · un expulsado no puede volver mediante sustitución", () => {
    const expulsado = jugador({ id: "x", stats: { ...STATS, redCards: 1 } });
    expect(isSentOff(expulsado)).toBe(true);
    expect(isAvailableForSubstitution(expulsado)).toBe(false);
    expect(availableForSubstitution([expulsado])).toEqual([]);
  });

  it("isSentOff y disciplinaryState no pueden discrepar: comparten fuente", () => {
    expect(readFileSync(path.resolve(__dirname, "squadModel.ts"), "utf-8")).toContain(
      'return disciplinaryState(player) === "red";',
    );
  });
});

describe("11 · las tarjetas se pulsan, y se pulsan sobre un jugador concreto", () => {
  const radial = leer("../components/PlayerActionRadialMenu.tsx");

  it("la barra respeta el área segura inferior", () => {
    // Era `bottom-4` a secas: en la PWA de iPhone caía sobre el indicador de
    // inicio y por debajo de la navegación.
    expect(radial).toContain("env(safe-area-inset-bottom, 0px)");
    expect(radial).toContain("style={{ bottom: CARD_BAR_BOTTOM }}");
    expect(radial).not.toContain('className="fixed bottom-4 left-4 right-4 z-[260] flex gap-3"');
  });

  it("se apoya por encima de la navegación inferior en vez de taparla", () => {
    expect(radial).toMatch(/BOTTOM_NAV_PX\s*=\s*48/);
    expect(leer("../pages/MatchTracker.tsx")).toContain(
      'className="lg:hidden bg-slate-900/95',
    );
  });

  it("la barra del portero no se solapa con la de tarjetas", () => {
    expect(radial).toContain("style={{ bottom: GK_BAR_BOTTOM }}");
    expect(radial).not.toContain("fixed bottom-24");
  });

  it("dice a quién se le saca la tarjeta", () => {
    expect(radial).toMatch(/Tarjetas[\s\S]{0,400}#\{player\.number\}/);
  });

  it("los botones superan el mínimo táctil", () => {
    const barra = radial.slice(radial.indexOf("key=\"card-buttons\""));
    expect(barra).toContain("min-h-[52px]");
  });

  it("siguen siendo los tipos de evento de siempre", () => {
    expect(radial).toContain("onAction(ActionType.YELLOW_CARD, player.id)");
    expect(radial).toContain("onAction(ActionType.RED_CARD, player.id)");
  });
});

describe("el aura disciplinaria llega a las tres representaciones del jugador", () => {
  it("pista, banquillo y radial de CAMBIO usan el mismo componente", () => {
    // Tres superficies, una sola implementación: es lo que evita que una de
    // ellas se quede sin el indicador rojo, como pasaba en el banquillo.
    const auras = matchTracker.match(/<DisciplinaryAura /g) || [];
    expect(auras.length).toBe(3);
    expect(matchTracker).toContain("disciplinaryState(player)");
    expect(matchTracker).toContain("disciplinaryState(p)");
  });

  it("no existe un estado visual paralelo al de las estadísticas", () => {
    const aura = leer("../components/DisciplinaryAura.tsx");
    expect(aura).toContain("DisciplinaryState");
    for (const prohibido of ["useState", "useEffect", "localStorage"]) {
      expect(aura).not.toContain(prohibido);
    }
  });

  it("el aura no captura toques ni tapa el dorsal", () => {
    const aura = leer("../components/DisciplinaryAura.tsx");
    expect(aura).toContain("pointer-events-none");
    expect(aura).toContain("absolute");
  });

  it("las estadísticas y las reglas de expulsión no se tocan desde el aura", () => {
    // Sobre el CÓDIGO, sin comentarios: la cabecera del archivo cita
    // `player.stats.yellowCards` a propósito, para explicar de dónde sale.
    const codigo = leer("../components/DisciplinaryAura.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const prohibido of ["stats.", "redCards", "yellowCards", "isOnPitch"]) {
      expect(codigo).not.toContain(prohibido);
    }
  });
});
