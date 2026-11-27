/**
 * La jugada a balón parado, cableada en MatchTracker.
 *
 * MatchTracker es un componente de diez mil líneas que no se puede montar
 * entero en una prueba sin simular medio navegador. Estas pruebas leen su
 * código y exigen las decisiones que sostienen la jugada atómica, igual que
 * hacen las de fase, falta y gol en propia. Lo que protegen no es el texto
 * exacto, sino que nadie pueda, sin que se note:
 *
 *   - guardar media jugada (dos `setMatchData`, o uno por evento);
 *   - tener una segunda copia de las reglas de estadísticas;
 *   - leer la fase dos veces, o moverla dos veces;
 *   - absorber el despeje o la falta de origen en la jugada, de modo que
 *     borrar la jugada se lleve una parada o una falta del reglamentario;
 *   - inventar una pérdida o una recuperación al salir un despeje de banda.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fuente = readFileSync(resolve(__dirname, "./MatchTracker.tsx"), "utf-8");

function trozo(desde: string, hasta: string): string {
  const i = fuente.indexOf(desde);
  const j = fuente.indexOf(hasta, i + desde.length);
  expect(i, desde).toBeGreaterThan(-1);
  expect(j, hasta).toBeGreaterThan(i);
  return fuente.slice(i, j);
}

const commit = trozo("const commitSetPieceSequence = (", "const resolveDeflectOutcome = (");
const despeje = trozo("const resolveDeflectOutcome = (", "\n  };\n");
const handleAction = trozo("const handleAction = (", "const openSetPiece = (");
const abrir = trozo("const openSetPiece = (", "const targetGoalkeeperIdFor = ");
const borrar = trozo("const handleDeleteEvent = (event: GameEvent) => {", "deleteEventRef.current = handleDeleteEvent");

describe("la jugada se guarda entera o no se guarda", () => {
  it("todos sus eventos se aplican dentro de UN solo setMatchData", () => {
    expect(commit.match(/setMatchData\(/g)).toHaveLength(1);
    expect(commit).toContain("construidos.reduce((acc, c) => applyActionToState(acc, c), prev)");
  });

  it("cada evento se construye con las MISMAS reglas que cualquier acción", () => {
    expect(commit).toContain("buildActionEvent(");
    // Ni una regla de estadísticas copiada aquí.
    expect(commit).not.toMatch(/stats\.(goals|shots|losses)\s*\+=/);
    expect(commit).not.toContain("goalieStatsDelta");
  });

  it("todos comparten la fase leída UNA vez, y el mismo instante", () => {
    expect(commit.match(/phaseOfPlayRef\.current/g)).toHaveLength(1);
    expect(commit).toContain("instante ??= newEvent.wallClock;");
    expect(commit).toContain("wallClock: instante");
  });

  it("la fase se mueve UNA vez, por el desenlace", () => {
    expect(commit.match(/applyPhaseOfPlay\(/g)).toHaveLength(1);
    expect(commit).toContain("const final = construidos[construidos.length - 1];");
    expect(commit).toContain(
      "applyPhaseOfPlay(nextPhaseAfterEvent(final.type, draft.isOpponent, phaseAtTap));",
    );
  });

  it("y confirma la jugada una sola vez", () => {
    expect(commit.match(/confirmRegistered\(/g)).toHaveLength(1);
  });

  it("cancelar no guarda nada: cerrar la ventana solo limpia el borrador", () => {
    expect(fuente).toContain("onCancel={() => setPendingSetPiece(null)}");
  });
});

describe("enlazado, no absorbido", () => {
  it("el despeje o la falta de origen llevan linkedSequenceId, NO sequenceId", () => {
    expect(commit).toContain("linkedSequenceId: sequenceId");
    // Si el origen recibiera `sequenceId`, borrar la jugada se lo llevaría.
    expect(commit).not.toMatch(/e\.id === origen[\s\S]{0,120}sequenceId: sequenceId/);
  });
});

describe("las reanudaciones van a su ventana", () => {
  it("handleAction desvía córner, falta a favor y banda ANTES de pedir zona", () => {
    const desvio = handleAction.indexOf("const raizDeJugada = ROOT_KIND_BY_ACTION[type];");
    const zona = handleAction.indexOf("const needsOrigin = shouldAskOriginZone(");
    expect(desvio).toBeGreaterThan(-1);
    expect(desvio).toBeLessThan(zona);
  });

  it("y el jugador de la llamada pasa a ser el sacador", () => {
    expect(handleAction).toContain("openSetPiece(raizDeJugada, isOpponentEvent, playerId);");
  });

  it("un evento que ya trae sequenceId no se vuelve a desviar", () => {
    expect(handleAction).toContain("raizDeJugada && !metadata?.metadata?.sequenceId");
  });

  it("abrir la ventana no toca vista, formación ni fase", () => {
    expect(abrir).not.toContain("setPitchView");
    expect(abrir).not.toContain("applyPhaseOfPlay");
    expect(abrir).not.toContain("phaseOfPlayRef");
    expect(abrir).not.toContain("FORMATION_CHANGE");
  });

  it("la falta propone después la falta a favor del OTRO equipo, enlazada", () => {
    const falta = trozo("const handleFoul = (", "const assignFoulLocation = (");
    expect(falta).toContain(
      'openSetPiece("free_kick", isTeam, undefined, { fromFoulEventId: foulEventId });',
    );
    // Y el contador reglamentario sigue siendo cosa de la falta, no de la jugada.
    expect(falta).toContain("applyFoulToCounters(prev.fouls, foulEvent, 1)");
  });

  it("la ventana espera a que se cierren los pasos que la preceden", () => {
    expect(fuente).toMatch(
      /pendingSetPiece &&\s*!pendingFoulLocation &&\s*!pendingInterventionLocation &&\s*!pendingDeflectOutcome/,
    );
  });
});

describe("el despeje solo describe", () => {
  it("escribe deflectOutcome en el despeje y propone la banda correcta", () => {
    expect(despeje).toContain("deflectOutcome: outcome");
    expect(despeje).toContain("deflectOutcomeLeadsToThrowIn(outcome)");
    expect(despeje).toContain("throwInTakerIsOpponent(outcome)");
    expect(despeje).toContain("fromDeflectEventId: pendiente.eventId");
  });

  it("y NUNCA inventa una pérdida ni una recuperación", () => {
    expect(despeje).not.toContain("ActionType.LOSS");
    expect(despeje).not.toContain("ActionType.STEAL");
    expect(despeje).not.toContain("ActionType.INTERCEPTION");
    expect(despeje).not.toContain("handleAction(");
    expect(despeje).not.toContain("applyPhaseOfPlay");
  });

  it("se pregunta solo después de un despeje registrado", () => {
    expect(fuente).toContain("if (newEvent.type === GoalieAction.SAVE_DEFLECT) {");
  });
});

describe("borrar se lleva la jugada", () => {
  it("handleDeleteEvent borra todos los eventos de la jugada de una vez", () => {
    expect(borrar).toContain("eventIdsToDeleteWith(matchData.events, event.id)");
    expect(borrar.match(/setMatchData\(/g)).toHaveLength(1);
    expect(borrar).toContain("revertEventFromState(estado, objetivo)");
  });

  it("deshacer desde la confirmación pasa por el mismo camino", () => {
    expect(fuente).toContain("deleteEventRef.current?.(event);");
    expect(fuente).toContain("deleteEventRef.current = handleDeleteEvent;");
  });
});

describe("nueva banda", () => {
  it("se encadena en una ventana nueva, sin restos del borrador anterior", () => {
    expect(commit).toContain('draft.root === "throw_in" && draft.outcome === "new_set_piece"');
    expect(commit).toContain('openSetPiece("throw_in", draft.isOpponent);');
    // `token` remonta la ventana: el borrador anterior no sobrevive.
    expect(fuente).toContain("key={pendingSetPiece.token}");
  });
});

describe("las tres superficies de captura", () => {
  const barra = trozo('data-action-button="gol"', "data-other-team-quick");

  it("la barra principal ofrece córner, falta a favor y banda", () => {
    expect(barra).toContain('openSetPiece("corner", bandoDeAccion(), actorDeAccion())');
    expect(barra).toContain('openSetPiece("free_kick", bandoDeAccion(), actorDeAccion())');
    expect(barra).toContain('openSetPiece("throw_in", bandoDeAccion(), actorDeAccion())');
  });

  it("la franja del otro equipo también", () => {
    expect(fuente).toContain('{ id: "corner", label: "Córner", onClick: () => openSetPiece("corner", otroEsRival) }');
    expect(fuente).toContain('{ id: "banda", label: "Banda", onClick: () => openSetPiece("throw_in", otroEsRival) }');
  });

  it("el radial entra por handleAction, que desvía a la ventana", () => {
    expect(fuente).toMatch(/<PlayerActionRadialMenu[\s\S]{0,200}onAction=\{handleAction\}/);
  });
});

describe("responsive · lo que se rompió al añadir córner y banda", () => {
  it("la barra principal va en dos filas de cuatro en móvil", () => {
    // Con ocho botones en una sola fila de 375 px cada uno se quedaba en 38
    // px de ancho, por debajo de lo que se acierta con el pulgar.
    expect(fuente).toContain(
      'className="w-full grid grid-cols-4 sm:flex sm:flex-row gap-1.5 p-1',
    );
  });

  it("la franja del otro equipo puede ir en dos filas en CUALQUIER ancho", () => {
    // A 1024 px, en una sola fila, «T. muerto» quedaba escondido bajo la
    // columna derecha: el botón existía pero no se podía tocar.
    const franja = trozo("data-other-team-actions", "{acciones.map((a) => (");
    expect(franja).toContain("flex-wrap");
    expect(franja).not.toContain("sm:flex-nowrap");
  });
});
