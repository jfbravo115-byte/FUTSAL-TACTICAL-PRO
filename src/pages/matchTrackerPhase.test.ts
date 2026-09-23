/**
 * La captura de fase dentro de MatchTracker, comprobada sobre el fuente.
 *
 * `MatchTracker.tsx` son 8.600 líneas y arrastra la aplicación entera: no se
 * monta en jsdom. La lógica de transición vive fuera, en `phaseModel`, donde
 * sí se prueba de verdad; lo que queda por proteger aquí es el CABLEADO, y
 * eso es exactamente lo que un fallo silencioso rompería:
 *
 *   · que se estampe el ref y no el state (stale state → datos falsos);
 *   · que se lea ANTES de crear el evento y se mueva DESPUÉS;
 *   · que el descanso resetee;
 *   · que ningún flujo de acción gane un paso de fase.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fuente = readFileSync(resolve(__dirname, "./MatchTracker.tsx"), "utf-8");

/** El cuerpo de `handleAction`, de su firma al siguiente handler. */
const handleAction = (() => {
  const ini = fuente.indexOf("const handleAction = (");
  const fin = fuente.indexOf("const handleSetPieceRestart", ini) > -1
    ? fuente.indexOf("const handleSetPieceRestart", ini)
    : fuente.indexOf("\n  /**\n   * Jugada de falta", ini);
  expect(ini).toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(ini);
  return fuente.slice(ini, fin);
})();

describe("7 · el ref es el autoritativo", () => {
  it("existe el ref y su escritura es síncrona", () => {
    expect(fuente).toContain("const phaseOfPlayRef = useRef<PhaseOfPlay | undefined>(undefined);");
    expect(fuente).toContain("phaseOfPlayRef.current = next;");
    expect(fuente).toContain("setPhaseOfPlay(next);");
  });

  it("el estampado lee el REF, nunca el state", () => {
    expect(handleAction).toContain("const phaseAtTap = phaseOfPlayRef.current;");
    // Si alguien sustituyera el ref por el state, este test lo vería.
    expect(handleAction).not.toMatch(/const phaseAtTap = phaseOfPlay\b/);
  });
});

describe("6 · el orden del estampado", () => {
  it("se lee la fase ANTES de construir el evento", () => {
    const lectura = handleAction.indexOf("const phaseAtTap = phaseOfPlayRef.current;");
    const evento = handleAction.indexOf("const newEvent: GameEvent = {");
    expect(lectura).toBeGreaterThan(-1);
    expect(lectura).toBeLessThan(evento);
  });

  it("el evento se queda con phaseAtTap", () => {
    expect(handleAction).toContain("...(phaseAtTap ? { phaseOfPlay: phaseAtTap } : {}),");
  });

  it("y la transición se aplica DESPUÉS de registrar el evento", () => {
    const evento = handleAction.indexOf("const newEvent: GameEvent = {");
    const transicion = handleAction.indexOf("applyPhaseOfPlay(nextPhaseAfterEvent(");
    expect(transicion).toBeGreaterThan(evento);
    expect(handleAction).toContain(
      "applyPhaseOfPlay(nextPhaseAfterEvent(type, isOpponentEvent, phaseAtTap));",
    );
  });

  it("la transición NO se calcula dentro de MatchTracker: la decide el helper puro", () => {
    expect(fuente).toContain('from "../utils/phaseModel"');
    // Ninguna rama de fase escrita a mano dentro del componente.
    expect(handleAction).not.toContain('"attack_transition"');
    expect(handleAction).not.toContain('"defense_transition"');
    expect(handleAction).not.toContain('"attack_positional"');
    expect(handleAction).not.toContain('"defense_organized"');
  });
});

describe("8, 12, 13 · estado inicial, descanso y snapshot", () => {
  it("22 · arranca SIN fase registrada", () => {
    expect(fuente).toContain(
      "const [phaseOfPlay, setPhaseOfPlay] = useState<PhaseOfPlay | undefined>(undefined);",
    );
  });

  it("12 · el descanso resetea la fase", () => {
    const ini = fuente.indexOf("const handleConfirmEndFirst");
    const fin = fuente.indexOf("const handleConfirmEndSecond", ini);
    expect(fuente.slice(ini, fin)).toContain("applyPhaseOfPlay(undefined);");
  });

  it("13 · se persiste en el snapshot y se restaura validada", () => {
    expect(fuente).toContain("currentPhaseOfPlay: phaseOfPlay,");
    expect(fuente).toContain("applyPhaseOfPlay(parsePhaseOfPlay(snap.uiState?.currentPhaseOfPlay));");
  });
});

describe("9 · el selector", () => {
  it("muestra siempre la fase con texto completo", () => {
    expect(fuente).toContain("{phaseHeaderLabel(phaseOfPlay)}");
  });

  it("tiene los dos botones, sin gestos ocultos", () => {
    expect(fuente).toContain("applyPhaseOfPlay(phaseAfterAttackTap())");
    expect(fuente).toContain("applyPhaseOfPlay(phaseAfterDefenseTap())");
    expect(fuente).toMatch(/>\s*Atacamos\s*</);
    expect(fuente).toMatch(/>\s*Defendemos\s*</);
    expect(fuente).not.toMatch(/onDoubleClick|onLongPress|longPress/);
  });

  it("20 · convive con FORMACIÓN sin fusionarse ni derivarse", () => {
    expect(fuente).toContain("FORMACIÓN");
    expect(fuente).toContain("handleGameStateChange");
    // Nadie deriva una de la otra.
    expect(fuente).not.toMatch(/applyPhaseOfPlay\([^)]*gameState/);
    expect(fuente).not.toMatch(/setGameState\([^)]*phaseOfPlay/);
  });

  it("20b · cambiar de formación NO toca la fase", () => {
    // Son dos dimensiones independientes: pasar a superioridad no dice nada
    // sobre si atacamos o defendemos, y al revés tampoco.
    const ini = fuente.indexOf("const handleGameStateChange");
    const fin = fuente.indexOf("const handleFoul", ini);
    expect(ini).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(ini);
    const cuerpo = fuente.slice(ini, fin);
    // No ESCRIBE la fase por ningún camino…
    expect(cuerpo).not.toContain("applyPhaseOfPlay");
    expect(cuerpo).not.toContain("setPhaseOfPlay");
    expect(cuerpo).not.toMatch(/phaseOfPlayRef\.current\s*=/);
    // …aunque sí la LEE, para que el evento de cambio de formación sea tan
    // autodescriptivo como los demás.
    expect(cuerpo).toContain("...(phaseOfPlayRef.current ? { phaseOfPlay: phaseOfPlayRef.current } : {}),");
  });
});

describe("19, 35 · ningún flujo de acción gana un paso", () => {
  it("los pasos del modal siguen siendo los de siempre", () => {
    expect(fuente).toContain(
      'step: "origin" | "target" | "player" | "subtype" | "response" | "exitOutcome" | null;',
    );
    expect(fuente).not.toContain('"phase"');
  });

  it("registrar una acción no abre ninguna pantalla de fase", () => {
    expect(handleAction).not.toMatch(/setPendingAction\(\{[^}]*step:\s*"phase"/);
    expect(handleAction).not.toContain("pendingPhase");
  });
});

describe("17 · borrar un evento no reconstruye la fase", () => {
  it("handleDeleteEvent no toca el estado de fase", () => {
    const ini = fuente.indexOf("const handleDeleteEvent");
    const fin = fuente.indexOf("const executeSwap", ini);
    expect(ini).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(ini);
    const cuerpo = fuente.slice(ini, fin);
    expect(cuerpo).not.toContain("applyPhaseOfPlay");
    expect(cuerpo).not.toContain("phaseOfPlayRef");
  });
});
