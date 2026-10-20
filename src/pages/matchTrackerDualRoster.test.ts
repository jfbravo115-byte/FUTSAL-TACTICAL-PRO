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
  captureUnavailableReason,
  columnsLayoutFor,
  effectiveCaptureMode,
  isCaptureMode,
  normalizeCaptureMode,
  readCaptureMode,
  writeCaptureMode,
} from "../utils/captureMode";
import { DEFAULT_PITCH_METRICS } from "../utils/sharedPitch";

const fuente = readFileSync(resolve(__dirname, "./MatchTracker.tsx"), "utf-8");
const panel = readFileSync(resolve(__dirname, "../components/DualRosterPanel.tsx"), "utf-8");
const pista = readFileSync(resolve(__dirname, "../components/SharedPitchView.tsx"), "utf-8");
/** La pista 5v5 sin comentarios: lo que se afirma es sobre el código. */
const pistaCodigo = pista
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

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
    // Y son de la vista COLUMNAS: en 5v5 las fichas están dentro del campo.
    expect((codigo.match(/\{columnsActive && \(\s*<DualRosterPanel/g) ?? [])).toHaveLength(2);
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
    expect(isCaptureMode("columns")).toBe(true);
    expect(isCaptureMode("pitch")).toBe(true);
    expect(isCaptureMode("dual")).toBe(false);
    expect(normalizeCaptureMode("dual")).toBe("columns");
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
    expect(() => writeCaptureMode("columns")).not.toThrow();
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
    expect(readCaptureMode()).toBe("columns");
    store.set(CAPTURE_MODE_KEY, "pitch");
    expect(readCaptureMode()).toBe("pitch");
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

  it("14 · cada modo solo se ofrece donde CABE, medido en los cuatro tamaños", () => {
    // Los cuatro de la validación, y el porqué de cada uno.
    expect(columnsLayoutFor(1440, 900)).toBe("columns");
    expect(columnsLayoutFor(768, 1024)).toBe("rows");
    expect(columnsLayoutFor(1024, 768)).toBeNull(); // columnas esconden un jugador; filas dejan el campo en 58 px
    expect(columnsLayoutFor(375, 812)).toBeNull();
    expect(effectiveCaptureMode("pitch", 1024, 768)).toBe("focal");
    expect(effectiveCaptureMode("pitch", 1440, 900)).toBe("pitch");
    expect(codigo).toContain("const dualLayout = columnsLayoutFor(viewportWidth, viewportHeight);");
    expect(codigo).toContain("const modoEfectivo = effectiveCaptureMode(captureMode, viewportWidth, viewportHeight);");
    // Y el botón se deshabilita donde no cabe, en vez de mentir.
    expect(codigo).toContain("const cabe = isCaptureModeAvailable(m, viewportWidth, viewportHeight);");
  });

  it("y donde no cabe se dice por qué, en vez de dejar un botón mudo", () => {
    expect(captureUnavailableReason("columns", 1024, 768)).toBe(
      "Vista columnas no disponible con esta altura de pantalla",
    );
    expect(captureUnavailableReason("pitch", 375, 812)).toBe(
      "Vista pista 5v5 no disponible con esta anchura de pantalla",
    );
    expect(captureUnavailableReason("columns", 1440, 900)).toBeNull();
    expect(captureUnavailableReason("columns", 768, 1024)).toBeNull();
    expect(codigo).toContain("data-dual-unavailable");
    // Y el título del botón apagado dice lo mismo que la línea de abajo.
    expect(codigo).toContain("title={captureUnavailableReason(m, viewportWidth, viewportHeight) ?? undefined}");
  });

  it("girar la pantalla la devuelve a focal sin tocar el partido", () => {
    // `modoEfectivo` es derivado: si deja de caber vuelve a focal solo. No hay
    // ningún efecto que reescriba el partido, el jugador ni la fase.
    expect(codigo).toContain('const columnsActive = modoEfectivo === "columns";');
    expect(codigo).toContain('const pitchActive = modoEfectivo === "pitch";');
    const deriva = codigo.slice(codigo.indexOf("const dualLayout = columnsLayoutFor("), codigo.indexOf("const bandoDeAccion"));
    for (const prohibido of ["setMatchData", "setSelectedActor", "applyPhaseOfPlay", "setPitchView", "writeCaptureMode"]) {
      expect(deriva).not.toContain(prohibido);
    }
  });

  it("un modo que no cabe NO se guarda en preferencias", () => {
    // Solo el botón escribe, y el botón está deshabilitado donde no cabe.
    expect(codigo).toContain("const elegirCaptureMode = (modo: CaptureMode) => {");
    expect(codigo).toContain("onClick={() => elegirCaptureMode(m)}");
    expect(codigo).not.toContain("useEffect(() => {\n    writeCaptureMode(captureMode);");
    expect((codigo.match(/writeCaptureMode\(/g) ?? []).length).toBe(1);
  });

  it("en los modos nuevos no quedan dos caminos para lo mismo", () => {
    // Ni la franja rápida del otro equipo ni su panel lateral: la plantilla
    // del rival ya está junto al campo. Mantener el panel estrangulaba el
    // campo a 238 px a 1024×768, medido.
    expect(codigo).toContain('{activeTab === "pitch" && !dualActive && (() => {');
    // Y la rejilla no reserva la columna que ya no se dibuja: una pista de
    // 238 px a 1024×768 era justo lo que medía antes de quitarla.
    expect(codigo).toContain('dualActive ? "lg:grid-cols-[240px_1fr]" : "lg:grid-cols-[240px_1fr_240px]"');
    expect(codigo).toContain("{!dualActive && (() => {");
  });

  it("la franja validada vuelve en cuanto no hay vista dual", () => {
    expect(codigo).toContain("{!dualActive && (() => {");
    expect(codigo).toContain("data-other-team-quick");
  });

  it("15 · la composición cambia por ancho medido, no por suposición", () => {
    expect(codigo).toContain('const dualColumns = dualLayout === "columns";');
    expect(codigo).toContain('"grid grid-cols-[132px_1fr_132px] grid-rows-1 gap-1.5"');
    expect(codigo).toContain('data-dual-layout={columnsActive ? (dualColumns ? "columns" : "rows") : "none"}');
    expect(codigo).toContain("data-capture-mode={modoEfectivo}");
    expect(panel).toContain('orientation === "row"');
  });

  it("los tres modos tienen rótulo legible, no un identificador", () => {
    expect(CAPTURE_MODE_LABEL.focal).toBe("Vista focal");
    expect(CAPTURE_MODE_LABEL.columns).toBe("Vista columnas");
    expect(CAPTURE_MODE_LABEL.pitch).toBe("Vista pista 5v5");
    expect(codigo).toContain("{CAPTURE_MODE_LABEL[m]}");
    expect(codigo).toContain("CAPTURE_MODES.map((m) => {");
  });
});

// ── EL JUGADOR NO SE ARRASTRA ───────────────────────────────────────────

describe("no se reutiliza en silencio el último jugador", () => {
  it("la selección se suelta al registrar", () => {
    const conf = trozo("const confirmRegistered = (event: GameEvent)", "const undoLastRegistered");
    expect(conf).toContain("setSelectedActor(null);");
  });

  it("la VISTA FOCAL conserva exactamente el flujo validado en PR #27", () => {
    // Una recuperación o una pérdida nunca preguntaron jugador. Si el
    // experimento les añadiera ese paso, estaría cambiando la interfaz que
    // viene a comparar, y la comparación dejaría de medir nada.
    const lanzar = cuerpo("const lanzarConJugador = (type: ActionType)");
    expect(lanzar).toContain("if (!dualActive) {");
    expect(lanzar).toContain('step: detalle === "subtype" ? "subtype" : "player"');
    const focal = lanzar.slice(lanzar.indexOf("if (!dualActive) {"), lanzar.indexOf("return;"));
    expect(focal).not.toContain("anyTeam");
    expect(focal).not.toContain("playerId");
  });

  it("sin jugador, la acción lo pregunta ofreciendo LAS DOS plantillas", () => {
    const lanzar = cuerpo("const lanzarConJugador = (type: ActionType)");
    expect(lanzar).toContain('{ step: "player" as const, anyTeam: true }');
    expect(panel).not.toContain("último");
  });

  it("y el paso de jugador deriva el bando del elegido", () => {
    expect(codigo).toContain("isOpponent: !!elegido.isOpponent");
    expect(codigo).toContain('data-player-group={opp ? "opponent" : "team"}');
  });
});

// ── 16-19 · LA PISTA 5v5 ────────────────────────────────────────────────
//
// Lo que se protege aquí es lo que distingue esta vista de las otras dos: que
// los diez salgan de la MISMA función de colocación ya probada, que la
// orientación se resuelva una sola vez, y que tocar una ficha dentro del campo
// sea exactamente lo mismo que tocarla en la columna.

describe("16 · los diez dentro de una sola pista", () => {
  it("se dibujan desde la colocación probada, no desde coordenadas a mano", () => {
    expect(codigo).toContain("<SharedPitchPlayers");
    expect(codigo).toContain("placements={sharedLayout.placements}");
    expect(codigo).toContain("const sharedLayout = layoutSharedPitch(sharedEntries, sharedFlipped, {");
    // Y la vista no recalcula nada: solo pinta lo que recibe.
    expect(pistaCodigo).not.toContain("100 - ");
    expect(pistaCodigo).not.toContain("layoutSharedPitch(");
    expect(pista).toContain("left: `${pos.left}%`, top: `${pos.top}%`");
  });

  it("entran los cinco de CADA equipo, cada uno con su sistema", () => {
    const entradas = trozo("const sharedEntries =", "const sharedLayout =");
    expect(entradas).toContain("([false, true] as const).flatMap");
    expect(entradas).toContain("PITCH_SYSTEMS[opponent ? rivalGameState : gameState]");
    expect(entradas).toContain("rosterEnPista(opponent)");
    expect(entradas).toContain('const side: TeamSide = opponent ? "opponent" : "team";');
  });

  it("el equipo se distingue sin depender del color", () => {
    // Forma, borde y rótulo: en una tablet a pleno sol el color es lo primero
    // que se pierde, y aquí equivocarse es apuntarle el gol al otro equipo.
    expect(pista).toContain('rounded-md border-2 border-double');
    expect(pista).toContain('rounded-full border-2');
    expect(pista).toContain('portero ? "POR" : rival ? "R" : nombreCorto(p.name)');
    expect(pista).toContain('data-shared-pitch-side={rival ? "opponent" : "team"}');
    expect(pista).toContain('aria-label={`${rival ? "Rival" : "Local"} ${p.number} ${p.name}`}');
  });

  it("la ficha cumple el objetivo táctil mínimo y se marca al seleccionar", () => {
    expect(pista).toContain("min-w-[46px] min-h-[44px]");
    expect(pista).toContain('activo ? "ring-4 ring-white z-[60] scale-110" : ""');
    expect(pista).toContain("aria-pressed={activo}");
  });

  it("la ficha que se DIBUJA mide lo que la separación CREE que mide", () => {
    // Si una se cambia y la otra no, la separación se calcula con un tamaño
    // que no existe y las fichas vuelven a taparse sin que falle nada.
    expect(DEFAULT_PITCH_METRICS.cardWidth).toBe(46);
    expect(DEFAULT_PITCH_METRICS.cardHeight).toBe(44);
    expect(pistaCodigo).toContain(
      `min-w-[${DEFAULT_PITCH_METRICS.cardWidth}px] min-h-[${DEFAULT_PITCH_METRICS.cardHeight}px]`,
    );
    expect(pistaCodigo).toContain(
      `w-[${DEFAULT_PITCH_METRICS.cardWidth}px] h-[${DEFAULT_PITCH_METRICS.cardHeight}px]`,
    );
  });

  it("tocar una ficha es exactamente lo mismo que tocarla en la columna", () => {
    // Un solo camino: `selectActor`. Si la pista tuviera el suyo, habría dos
    // reglas para decidir de quién es la acción.
    expect(codigo).toContain("onSelect={selectActor}");
    expect((codigo.match(/onSelect=\{selectActor\}/g) ?? []).length).toBe(3);
    expect(pista).not.toContain("setPendingAction");
    expect(pista).not.toContain("isOpponent:");
  });

  it("en 5v5 el bando sale del jugador tocado, igual que en columnas", () => {
    // Si la captura directa cubriera solo `columns`, en 5v5 se tocaría la
    // ficha de un rival y la acción se le apuntaría al equipo del panel
    // desplegado: el error exacto que este experimento viene a cerrar.
    expect(codigo).toContain("const dualActive = columnsActive || pitchActive;");
    const bando = trozo("const bandoDeAccion = ()", "const actorDeAccion");
    expect(bando).toContain("dualActive && selectedActor");
    const lanzar = cuerpo("const lanzarConJugador = (type: ActionType)");
    expect(lanzar).toContain("if (!dualActive) {");
    // Y la selección se suelta igual tras registrar, en los tres modos.
    const conf = trozo("const confirmRegistered = (event: GameEvent)", "const undoLastRegistered");
    expect(conf).toContain("setSelectedActor(null);");
  });

  it("en 5v5 no se arrastra ni se editan posiciones", () => {
    // Diez fichas juntas y arrastrables es una alineación cambiada sin querer.
    expect(codigo).toContain("{!pitchActive && (() => {");
    expect(pista).not.toContain("drag");
    expect(pista).not.toContain("setMatchData");
    expect(pista).not.toContain("pitchPosition");
  });

  it("y una alineación antigua con posición inválida no se dibuja", () => {
    const entradas = trozo("const sharedEntries =", "const sharedLayout =");
    expect(entradas).toContain("effectiveSlotIndex(p.pitchPosition, sistema.length)");
    expect(entradas).toContain("if (idx === null) return [];");
  });
});

describe("17 · la orientación se resuelve UNA vez", () => {
  it("el descanso entra por `isFieldFlipped`, que ya viene invertido", () => {
    expect(codigo).toContain("const sharedFlipped = sharedPitchFlipped(isFieldFlipped);");
    // Una sola llamada: resolverla por ficha invertiría la pista diez veces.
    expect((codigo.match(/sharedPitchFlipped\(/g) ?? []).length).toBe(1);
    // Y NO se combina aquí con el periodo: `handleConfirmEndFirst` ya lo hizo,
    // y contarlo dos veces dejaba la pista sin cambiar —medido en el preview—.
    const bloque = trozo("const sharedFlipped =", "const sharedPlayers");
    expect(bloque).not.toContain("matchData.period");
    expect(bloque).not.toContain("visualSideSwapped");
  });

  it("las porterías se rotulan con el equipo que las defiende", () => {
    expect(codigo).toContain('defendedGoalSide("team", sharedFlipped) === lado');
    expect(codigo).toContain("data-shared-goal={lado}");
    expect(codigo).toContain('data-shared-goal-side={esLocal ? "team" : "opponent"}');
  });

  it("y el dato del cambio de campo sigue siendo el de siempre", () => {
    // `attackDirection` manda en el evento; esta vista no lo toca.
    const bloque = trozo("const sharedFlipped =", "const sharedPlayers");
    expect(bloque).not.toContain("attackDirection");
    expect(bloque).not.toContain("setMatchData");
    expect(bloque).not.toContain("originGrid");
  });
});

describe("18 · la separación usa la pista MEDIDA, no la supuesta", () => {
  it("se mide el campo real con ResizeObserver", () => {
    expect(codigo).toContain("const ro = new ResizeObserver(medir);");
    expect(codigo).toContain("const r = el.getBoundingClientRect();");
    expect(codigo).toContain("if (r.width > 0 && r.height > 0) setPitchBox({ width: r.width, height: r.height });");
  });

  it("y esa medida es la que decide cuánto separar", () => {
    const layout = trozo("const sharedLayout = layoutSharedPitch(", "const sharedPlayers");
    expect(layout).toContain("...DEFAULT_PITCH_METRICS");
    expect(layout).toContain("width: pitchBox.width");
    expect(layout).toContain("height: pitchBox.height");
  });

  it("si el navegador no tiene ResizeObserver, se sigue capturando", () => {
    expect(codigo).toContain('if (!el || typeof ResizeObserver === "undefined") return;');
    expect(codigo).toContain("width: DEFAULT_PITCH_METRICS.width");
  });
});

describe("19 · los banquillos, fuera del campo", () => {
  it("van debajo de la pista y usan la sustitución existente", () => {
    expect(codigo).toContain("<SharedPitchBenches");
    expect(codigo).toContain("onSelect={sustituirDesdeBanquillo}");
    // Y el cambio en sí es el de siempre: una sola copia de las reglas.
    const sub = cuerpo("const sustituirDesdeBanquillo = (benchId: string)");
    expect(sub).toContain("aplicarSustitucion(sale.id, benchId);");
    expect(codigo).toContain("aplicarSustitucion(swapSelection, id);");
    expect(pistaCodigo).not.toContain("SUBSTITUTION");
    expect(pistaCodigo).not.toContain("setMatchData");
  });

  it("sin nadie tocado en la pista NO se cambia a nadie", () => {
    // Adivinar quién sale es como se acaba sacando al que no era.
    const sub = cuerpo("const sustituirDesdeBanquillo = (benchId: string)");
    expect(sub).toContain("if (!entra || !sale || !sale.isOnPitch) return;");
    expect(pistaCodigo).toContain("disabled={disabled || !puedeCambiar}");
    expect(pistaCodigo).toContain("Toca primero en la pista al jugador que SALE");
  });

  it("y nunca se cambia un jugador por uno del otro equipo", () => {
    const sub = cuerpo("const sustituirDesdeBanquillo = (benchId: string)");
    expect(sub).toContain("if (!!sale.isOpponent !== !!entra.isOpponent) return;");
    expect(pistaCodigo).toContain("saliente.lado === abierto.lado");
  });

  it("la validación de rol no se duplica: la pista entra por la misma puerta", () => {
    const aplicar = cuerpo("const aplicarSustitucion = (sourceId: string, targetId: string)");
    expect(aplicar).toContain("isRoleAllowedInSlot(sourcePlayer.role, targetPlayer.pitchPosition)");
    expect(aplicar).toContain("handleAction(ActionType.SUBSTITUTION, targetId);");
    expect(pistaCodigo).not.toContain("isRoleAllowedInSlot");
  });

  it("solo uno abierto a la vez, con el mismo estado que en columnas", () => {
    expect(codigo).toContain("open={openBench}");
    expect(codigo).toContain("onToggle={(lado) => setOpenBench((b) => (b === lado ? null : lado))}");
    expect(pista).toContain('data-shared-bench-toggle={lado}');
    expect(pista).toContain("const abierto = lados.find((l) => l.lado === open);");
  });

  it("y un suplente no se puede confundir con alguien que está jugando", () => {
    expect(pista).toContain("data-shared-bench-player={p.id}");
    expect(pista).toContain("data-shared-pitch-player={p.id}");
    expect(pista).toContain("Sin suplentes");
  });
});
