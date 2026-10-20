/**
 * EXPERIMENTO · vista dual: las dos plantillas y la selección directa.
 *
 * `MatchTracker.tsx` no se monta en jsdom, así que el CABLEADO se comprueba
 * sobre el fuente, igual que en PR #24A/#25/#27. Lo que aquí se protege es lo
 * que distingue este experimento de la vista validada: que el equipo del
 * evento salga del JUGADOR tocado y no del panel desplegado, y que tocar a un
 * rival no mueva nada más.
 *
 * La aritmética (marcador, gol en propia, fases) no se repite: es la misma de
 * PR #27 y sigue probada en `goalModel`, `phaseModel` y la integración.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CAPTURE_MODE_KEY,
  CAPTURE_MODE_LABEL,
  DUAL_COLUMNS_MIN_WIDTH,
  DUAL_MIN_WIDTH,
  isCaptureMode,
  readCaptureMode,
  writeCaptureMode,
} from "../utils/captureMode";

const fuente = readFileSync(resolve(__dirname, "./MatchTracker.tsx"), "utf-8");
const panel = readFileSync(resolve(__dirname, "../components/DualRosterPanel.tsx"), "utf-8");

const codigo = fuente
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

/** Una ventana de N caracteres desde un ancla, cuando no hay final natural. */
const ventana = (desde: string, largo: number) => {
  const i = codigo.indexOf(desde);
  expect(i, `ancla: ${desde}`).toBeGreaterThan(-1);
  return codigo.slice(i, i + largo);
};

/** El cuerpo de una función, de su firma a su cierre a dos espacios. */
const cuerpo = (firma: string) => {
  const i = codigo.indexOf(firma);
  expect(i, `firma: ${firma}`).toBeGreaterThan(-1);
  const j = codigo.indexOf("\n  };", i);
  expect(j, `cierre de: ${firma}`).toBeGreaterThan(i);
  return codigo.slice(i, j);
};

const trozo = (desde: string, hasta: string) => {
  const i = codigo.indexOf(desde);
  const j = codigo.indexOf(hasta, i);
  expect(i, `ancla inicial: ${desde}`).toBeGreaterThan(-1);
  expect(j, `ancla final: ${hasta}`).toBeGreaterThan(i);
  return codigo.slice(i, j);
};

// ── 1-3 · SELECCIÓN DIRECTA Y BANDO DERIVADO ────────────────────────────

describe("1-3 · el equipo lo decide el jugador, no el panel", () => {
  it("1-2 · las dos plantillas son seleccionables desde la misma pantalla", () => {
    expect(codigo).toContain("<DualRosterPanel");
    expect(codigo.match(/<DualRosterPanel/g) ?? []).toHaveLength(2);
    expect(codigo).toContain("isOpponent={false}");
    expect(codigo).toContain("isOpponent\n                    onPitch={rosterEnPista(true)}");
    expect(panel).toContain("data-roster-player={p.id}");
    expect(panel).toContain('data-roster-side={isOpponent ? "opponent" : "team"}');
  });

  it("3 · el bando sale de la PLANTILLA del jugador tocado", () => {
    const sel = cuerpo("const selectActor = (playerId: string)");
    expect(sel).toContain("matchData.players.find((x) => x.id === playerId)");
    expect(sel).toContain("isOpponent: !!p.isOpponent");
    // Lo que no puede pasar: deducirlo del panel desplegado.
    expect(sel).not.toContain("pitchView");
  });

  it("y la acción usa ese bando, con `pitchView` solo como respaldo", () => {
    const bando = trozo("const bandoDeAccion = ()", "const actorDeAccion");
    expect(bando).toContain("dualActive && selectedActor ? selectedActor.isOpponent");
    expect(bando).toContain('pitchView === "opponent"');
  });

  it("7-8 · la acción se atribuye al equipo del jugador, sea cual sea", () => {
    // Los siete botones pasan por el mismo resolutor; ninguno vuelve a leer
    // `pitchView` por su cuenta.
    const barra = trozo('data-action-button="gol"', 'data-other-team-quick');
    expect(barra).toContain("lanzarConJugador(ActionType.GOAL)");
    expect(barra).toContain("lanzarConJugador(ActionType.SHOT)");
    expect(barra).toContain("handleFoul(!bandoDeAccion(), actorDeAccion())");
    expect(barra).toContain("handleFreeKickPlay(bandoDeAccion(), actorDeAccion())");
    expect(barra).toContain("setPendingCorner({ isOpponent: bandoDeAccion() })");
    expect(barra).toContain("lanzarConJugador(ActionType.STEAL)");
    expect(barra).toContain("lanzarConJugador(ActionType.LOSS)");
    expect(barra).not.toContain("pitchView === 'opponent'");
  });
});

// ── 4-6 · TOCAR A UN RIVAL NO MUEVE NADA MÁS ────────────────────────────

describe("4-6 · seleccionar no es registrar", () => {
  const sel = cuerpo("const selectActor = (playerId: string)");

  it("4 · no cambia Atacamos/Defendemos", () => {
    expect(sel).not.toContain("applyPhaseOfPlay");
    expect(sel).not.toContain("setPhaseOfPlay");
    expect(sel).not.toContain("phaseOfPlayRef");
  });

  it("5 · no cambia el equipo desplegado", () => {
    expect(sel).not.toContain("setPitchView");
  });

  it("6 · no invierte el campo", () => {
    expect(sel).not.toContain("setIsFieldFlipped");
  });

  it("ni toca el partido, el marcador o la formación", () => {
    for (const prohibido of ["setMatchData", "handleGameStateChange", "setFormation"]) {
      expect(sel).not.toContain(prohibido);
    }
  });

  it("y no abre ningún modal: solo deja al jugador listo", () => {
    expect(sel).not.toContain("setPendingAction");
    expect(sel).not.toContain("setActiveActionPlayerId");
  });

  it("volver a tocar al mismo jugador lo deselecciona", () => {
    expect(sel).toContain("prev?.id === playerId ? null");
  });
});

// ── 9 · GOL EN PROPIA ───────────────────────────────────────────────────

describe("9 · el gol en propia conserva actor y beneficiario", () => {
  it("el conmutador de PR #27 sigue ahí y el autor es el jugador tocado", () => {
    expect(codigo).toContain('data-goal-kind=');
    expect(codigo).toContain("ActionType.OWN_GOAL");
    // El tipo se decide en el modal; el bando ya viene del jugador.
    expect(codigo).toContain("lanzarConJugador(ActionType.GOAL)");
  });

  it("y la regla de beneficiario no se duplica aquí", () => {
    expect(codigo).not.toMatch(/OWN_GOAL[\s\S]{0,120}beneficiar/i);
  });
});

// ── 10 · SUSTITUCIONES ──────────────────────────────────────────────────

describe("10 · banquillos sin salir de la pantalla", () => {
  it("usan el flujo de sustitución existente, no uno nuevo", () => {
    expect(codigo).toContain("onBenchSelect={executeSwap}");
    expect(panel).not.toContain("setMatchData");
    expect(panel).not.toContain("SUBSTITUTION");
  });

  it("los cinco visibles salen del estado, así que el cambio se refleja solo", () => {
    expect(codigo).toContain("onPitch={rosterEnPista(false)}");
    expect(codigo).toContain("onPitch={rosterEnPista(true)}");
    expect(codigo).toContain("p.isOnPitch &&");
  });

  it("no se abren los dos banquillos a la vez", () => {
    expect(codigo).toContain('useState<"team" | "opponent" | null>(null)');
    expect(codigo).toContain('setOpenBench((b) => (b === "team" ? null : "team"))');
    expect(codigo).toContain('setOpenBench((b) => (b === "opponent" ? null : "opponent"))');
  });
});

// ── 11-12 · LOS DOS MODOS PRODUCEN LO MISMO ─────────────────────────────

describe("11-12 · el modo es una preferencia, no un dato", () => {
  it("11 · ninguno de los dos modos cambia cómo se construye el evento", () => {
    // `handleAction` no sabe que el experimento existe: recibe tipo, jugador
    // y bando, exactamente igual en los dos modos.
    const handleAction = trozo("const handleAction = (", "const handleFreeKickPlay = (");
    expect(handleAction).not.toContain("captureMode");
    expect(handleAction).not.toContain("dualActive");
    expect(handleAction).not.toContain("selectedActor");
  });

  it("12 · el modo no entra en el partido ni en nada que se exporte", () => {
    const servicios = ["../services/matchExportService", "../services/matchSnapshotService", "../services/tacticalProPayload"];
    for (const ruta of servicios) {
      const f = readFileSync(resolve(__dirname, ruta + ".ts"), "utf-8");
      expect(f).not.toContain("captureMode");
      expect(f).not.toContain("CAPTURE_MODE");
    }
    const tipos = readFileSync(resolve(__dirname, "../types/futsal.ts"), "utf-8");
    expect(tipos).not.toContain("captureMode");
  });

  it("vive en el navegador y aguanta que el almacenamiento falle", () => {
    expect(CAPTURE_MODE_KEY).toBe("futsal_capture_mode_v1");
    expect(isCaptureMode("dual")).toBe(true);
    expect(isCaptureMode("otra")).toBe(false);
    const original = globalThis.localStorage;
    // Sin almacenamiento se trabaja en la interfaz validada.
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem() { throw new Error("bloqueado"); },
        setItem() { throw new Error("bloqueado"); },
      },
      configurable: true,
    });
    expect(readCaptureMode()).toBe("focal");
    expect(() => writeCaptureMode("dual")).not.toThrow();
    Object.defineProperty(globalThis, "localStorage", { value: original, configurable: true });
  });

  it("un valor corrupto no deja la pantalla en un modo inexistente", () => {
    const store = new Map<string, string>();
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      configurable: true,
    });
    store.set(CAPTURE_MODE_KEY, "{}");
    expect(readCaptureMode()).toBe("focal");
    store.set(CAPTURE_MODE_KEY, "dual");
    expect(readCaptureMode()).toBe("dual");
    writeCaptureMode("focal");
    expect(store.get(CAPTURE_MODE_KEY)).toBe("focal");
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as Record<string, unknown>).localStorage;
  });
});

// ── 13-15 · PARTIDO, MÓVIL Y ANCHO ──────────────────────────────────────

describe("13-15 · el experimento no toca el partido ni rompe el móvil", () => {
  it("13 · el snapshot sigue guardando lo de siempre", () => {
    const snap = readFileSync(resolve(__dirname, "../services/matchSnapshotService.ts"), "utf-8");
    expect(snap).toContain("currentPhaseOfPlay");
    expect(snap).not.toContain("captureMode");
  });

  it("14 · por debajo de 768 px no hay vista dual", () => {
    expect(DUAL_MIN_WIDTH).toBe(768);
    expect(DUAL_COLUMNS_MIN_WIDTH).toBe(1024);
    expect(codigo).toContain("const dualFits = viewportWidth >= DUAL_MIN_WIDTH;");
    expect(codigo).toContain('const dualActive = captureMode === "dual" && dualFits;');
    // Y el botón se deshabilita donde no cabe, en vez de mentir.
    expect(codigo).toContain('const cabe = m === "focal" || dualFits;');
  });

  it("la franja validada vuelve en cuanto no hay vista dual", () => {
    expect(codigo).toContain("{!dualActive && (() => {");
    expect(codigo).toContain("data-other-team-quick");
  });

  it("15 · la composición cambia por ancho medido, no por suposición", () => {
    expect(codigo).toContain("const dualColumns = viewportWidth >= DUAL_COLUMNS_MIN_WIDTH;");
    expect(codigo).toContain('"grid grid-cols-[132px_1fr_132px] gap-1.5"');
    expect(codigo).toContain('data-dual-layout={dualActive ? (dualColumns ? "columns" : "rows") : "none"}');
    expect(panel).toContain('orientation === "row"');
  });

  it("los dos modos tienen rótulo legible, no un identificador", () => {
    expect(CAPTURE_MODE_LABEL.dual).toBe("Vista dual");
    expect(CAPTURE_MODE_LABEL.focal).toBe("Vista focal");
    expect(codigo).toContain("{CAPTURE_MODE_LABEL[m]}");
  });
});

// ── EL JUGADOR NO SE ARRASTRA ───────────────────────────────────────────

describe("no se reutiliza en silencio el último jugador", () => {
  it("la selección se suelta al registrar", () => {
    const conf = trozo("const confirmRegistered = (event: GameEvent)", "const undoLastRegistered");
    expect(conf).toContain("setSelectedActor(null);");
  });

  it("sin jugador, la acción lo pregunta ofreciendo LAS DOS plantillas", () => {
    const lanzar = trozo("const lanzarConJugador = (type: ActionType)", "const rosterEnPista");
    expect(lanzar).toContain('{ step: "player" as const }');
    expect(lanzar).toContain("anyTeam: dualActive");
    expect(panel).not.toContain("último");
  });

  it("y el paso de jugador deriva el bando del elegido", () => {
    expect(codigo).toContain("isOpponent: !!elegido.isOpponent");
    expect(codigo).toContain('data-player-group={opp ? "opponent" : "team"}');
  });
});
