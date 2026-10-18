/**
 * La captura del gol en propia y la convivencia de los dos equipos en una
 * sola pantalla, comprobadas sobre el fuente.
 *
 * `MatchTracker.tsx` arrastra la aplicación entera y no se monta en jsdom,
 * igual que en PR #24A/#25. Lo que se protege aquí es el CABLEADO: que el
 * marcador salga del modelo y no de un filtro a mano, que el equipo
 * seleccionado y Atacamos/Defendemos sigan siendo estados independientes, y
 * que las acciones rápidas del otro equipo vayan al equipo que anuncian.
 *
 * La aritmética del gol en propia —marcador, informe, exportaciones— se
 * ejecuta de verdad en `utils/goalModel.test.ts` y en
 * `services/ownGoal.integration.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fuente = readFileSync(resolve(__dirname, "./MatchTracker.tsx"), "utf-8");

/** El fuente sin comentarios, para las comprobaciones en negativo. */
const codigo = fuente
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

/**
 * Un trozo del fuente SIN comentarios, entre dos anclas de CÓDIGO.
 *
 * Las anclas no pueden ser texto de un comentario: `codigo` los ha quitado, y
 * entonces el corte se iría a cualquier sitio.
 */
const trozo = (desde: string, hasta: string) => {
  const i = codigo.indexOf(desde);
  const j = codigo.indexOf(hasta, i);
  expect(i, `ancla inicial no encontrada: ${desde}`).toBeGreaterThan(-1);
  expect(j, `ancla final no encontrada: ${hasta}`).toBeGreaterThan(i);
  return codigo.slice(i, j);
};

/** Una ventana de N caracteres desde un ancla, cuando no hay final natural. */
const ventana = (desde: string, largo: number) => {
  const i = codigo.indexOf(desde);
  expect(i, `ancla no encontrada: ${desde}`).toBeGreaterThan(-1);
  return codigo.slice(i, i + largo);
};

// ── 1 · EL MARCADOR SALE DEL MODELO ─────────────────────────────────────

describe("1 · ni un recuento de goles a mano", () => {
  it("no queda ninguna copia de la fórmula vieja del MARCADOR", () => {
    // Era la línea duplicada en dieciséis sitios: contar goles por el bando
    // del evento. Si reaparece, el gol en propia sumaría al equipo
    // equivocado en esa superficie.
    for (const vieja of [
      // El paréntesis de apertura es parte del ancla: sin él, la cadena
      // también casaría con el recuento de TIROS, que empieza por SHOT y es
      // legítimo.
      "(e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent",
      "(e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && e.metadata?.isOpponent",
      "ActionType?.GOAL || e?.type === GoalieAction?.GOAL_CONCEDED",
    ]) {
      expect(codigo).not.toContain(vieja);
    }
  });

  it("pero los recuentos OFENSIVOS se conservan tal cual, que es otra pregunta", () => {
    // Tiros y mapas de goles preguntan por producción ofensiva, no por el
    // marcador: ahí el bando del evento SÍ es el criterio correcto, y el gol
    // en propia queda fuera por no ser ninguno de esos tipos.
    expect(codigo).toContain(
      "e.type === ActionType.SHOT || e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED",
    );
    expect(codigo).not.toContain("ActionType.OWN_GOAL || e.type === GoalieAction");
  });

  it("la pantalla, el evento y el plus/minus usan goalModel", () => {
    expect(codigo).toContain("scoreOf(matchData?.events)");
    expect(codigo).toContain("scoreAfterAdding(matchData.events,");
    expect(codigo).toContain("beneficiarySide(esteGol)");
    expect(codigo).toContain('from "../utils/goalModel"');
  });

  it("el plus/minus se revierte con el MISMO criterio con el que se sumó", () => {
    const borrar = trozo("const handleDeleteEvent = (", "const executeSwap");
    expect(borrar).toContain("isGoalEvent(event)");
    expect(borrar).toContain('beneficiarySide(event) === "team"');
    // Ya no se decide por el tipo del evento, que era lo que fallaba.
    expect(borrar).not.toContain("event.type === ActionType.GOAL) pm -=");
  });
});

// ── 2 · LA CAPTURA DEL GOL EN PROPIA ────────────────────────────────────

describe("2 · el flujo del gol en propia", () => {
  it("es un conmutador entre dos TIPOS de evento, no una marca sobre el gol", () => {
    expect(codigo).toContain("{ tipo: ActionType.OWN_GOAL, label: OWN_GOAL_LABEL");
    expect(codigo).toContain("{ tipo: ActionType.GOAL, label: \"Gol\"");
    expect(codigo).toContain("data-goal-kind=");
  });

  it("al elegirlo se limpia lo que describe un tiro", () => {
    // `setPiece` es la procedencia de un TIRO y el destino es la portería
    // rival: ninguna de las dos cosas significa nada en un gol en propia.
    expect(codigo).toContain("setPiece: opt.tipo === ActionType.OWN_GOAL ? undefined : prev.setPiece");
    expect(codigo).toContain("destinationGrid: opt.tipo === ActionType.OWN_GOAL ? undefined : prev.destinationGrid");
  });

  it("antes de confirmar se dice a quién le suma", () => {
    expect(codigo).toContain("data-own-goal-notice");
    expect(codigo).toContain("describeOwnGoalBenefit(");
    expect(fuente).toContain("No cuenta como");
  });

  it("el autor es del equipo del EVENTO, no del beneficiario", () => {
    expect(codigo).toContain("pendingAction.type === ActionType.OWN_GOAL ||");
    expect(codigo).toContain("p.isOpponent === pendingAction.isOpponent");
  });

  it("se puede registrar sin identificar al jugador", () => {
    expect(codigo).toContain("data-own-goal-unknown-player");
    expect(codigo).toContain("playerId: undefined");
    expect(fuente).toContain("Jugador no identificado");
  });

  it("y sin zona: el marcador no espera a un dato opcional", () => {
    expect(codigo).toContain("data-own-goal-no-zone");
    expect(fuente).toContain("Registrar sin zona");
  });

  it("no se le escribe procedencia de tiro al registrarlo con zona", () => {
    expect(codigo).toContain(
      'current.type === ActionType.OWN_GOAL\n                                    ? {}\n                                    : { setPiece: current.setPiece || "normal" }',
    );
  });
});

// ── 3 · CONFIRMACIÓN Y DESHACER ─────────────────────────────────────────

describe("3 · se confirma lo registrado y se puede deshacer", () => {
  it("existe la confirmación con su botón", () => {
    expect(codigo).toContain("data-last-registered");
    expect(codigo).toContain("data-undo-last");
    expect(codigo).toContain("describeRegisteredAction(lastRegistered, matchData)");
  });

  it("deshacer usa el MISMO borrado que el historial", () => {
    expect(codigo).toContain("deleteEventRef.current?.(event)");
    expect(codigo).toContain("deleteEventRef.current = handleDeleteEvent");
  });

  it("se confirma al registrar una acción y también una falta", () => {
    expect(codigo).toContain("confirmRegistered(newEvent)");
    expect(codigo).toContain("confirmRegistered(foulEventParaConfirmar)");
  });

  it("no se confirma lo que no se registra de un toque sobre la pista", () => {
    expect(codigo).toContain("if (!deservesConfirmation(event)) return;");
  });
});

// ── 4 · DOS EQUIPOS, UNA PANTALLA ───────────────────────────────────────

describe("4 · equipo seleccionado y fase son estados INDEPENDIENTES", () => {
  const seleccion = trozo("data-team-select=", "setIsFieldFlipped((prev) => !prev)");

  it("cambiar de equipo no toca Atacamos/Defendemos", () => {
    expect(seleccion).toContain("setPitchView(id)");
    expect(seleccion).not.toContain("applyPhaseOfPlay");
    expect(seleccion).not.toContain("setPhaseOfPlay");
    expect(seleccion).not.toContain("phaseOfPlayRef");
  });

  it("ni invierte el campo", () => {
    expect(seleccion).not.toContain("setIsFieldFlipped");
  });

  it("ni toca el marcador, el reloj o el periodo", () => {
    for (const prohibido of ["setMatchData", "setPeriod", "setIsClockRunning"]) {
      expect(seleccion).not.toContain(prohibido);
    }
  });

  it("y cambiar de fase no cambia de equipo", () => {
    const fase = ventana("applyPhaseOfPlay(phaseAfterAttackTap())", 1400);
    expect(fase).not.toContain("setPitchView");
  });

  it("`applyPhaseOfPlay` sigue sin saber nada de `pitchView`", () => {
    const aplicar = ventana("const applyPhaseOfPlay = (", 260);
    expect(aplicar).toContain("phaseOfPlayRef.current = next;");
    expect(aplicar).not.toContain("pitchView");
  });

  it("el equipo seleccionado se marca con algo más que el color", () => {
    expect(codigo).toContain("aria-pressed={activo}");
    expect(fuente).toContain("● Seleccionado");
    expect(fuente).toContain("Equipo seleccionado · registra las acciones de la pista");
  });
});

// ── 5 · ACCIONES RÁPIDAS DEL OTRO EQUIPO ────────────────────────────────

describe("5 · las acciones rápidas van al equipo que anuncian", () => {
  const barra = trozo('const otroEsRival = pitchView === "local";', "data-other-team-panel");

  it("el otro equipo es exactamente el que NO está seleccionado", () => {
    expect(codigo).toContain('const otroEsRival = pitchView === "local";');
  });

  it("las cinco acciones existen y llevan el bando del OTRO equipo", () => {
    for (const id of ["gol", "tiro", "falta", "perdida", "timeout"]) {
      expect(barra).toContain(`id: "${id}"`);
    }
    expect(barra).toContain("isOpponent: otroEsRival");
    // La falta recibe «¿es del equipo local?», que es la negación.
    expect(barra).toContain("handleFoul(!otroEsRival)");
    expect(barra).toContain("metadata: { isOpponent: otroEsRival }");
  });

  it("gol y tiro siguen pidiendo jugador: no se gana un toque perdiendo precisión", () => {
    expect(barra).toContain('type: ActionType.GOAL, step: "player"');
    expect(barra).toContain('type: ActionType.SHOT, step: "player"');
    expect(barra).toContain('step: "subtype"');
  });

  it("y pulsarlas NO cambia el equipo seleccionado ni la fase", () => {
    expect(barra).not.toContain("setPitchView");
    expect(barra).not.toContain("applyPhaseOfPlay");
  });

  it("la franja dice en voz alta de quién son esas acciones", () => {
    expect(barra).toContain("{nombreOtro}");
    expect(barra).toContain("data-other-team=");
  });
});

// ── 6 · AMBOS EQUIPOS VISIBLES ──────────────────────────────────────────

describe("6 · un solo partido, dos equipos a la vista", () => {
  it("en escritorio hay columna para el equipo no seleccionado", () => {
    expect(codigo).toContain("data-other-team-panel");
    expect(codigo).toContain("lg:grid-cols-[240px_1fr_240px]");
    expect(codigo).toContain("data-select-other-team");
  });

  it("ese panel no duplica ni campo, ni marcador, ni reloj", () => {
    const panel = trozo("data-other-team-panel", "Gestión de Equipo");
    for (const prohibido of ["pitchRef", "FutsalPitch", "matchClock", "setIsClockRunning"]) {
      expect(panel).not.toContain(prohibido);
    }
  });

  it("y se cambia de equipo con una sola pulsación", () => {
    const panel = ventana("data-select-other-team", 400);
    expect(panel).toContain('setPitchView(otroEsRival ? "opponent" : "local")');
  });

  it("en móvil y tablet el otro equipo va en la franja compacta, no en una segunda plantilla", () => {
    expect(codigo).toContain('data-other-team-panel\n              className="hidden lg:flex');
  });
});
