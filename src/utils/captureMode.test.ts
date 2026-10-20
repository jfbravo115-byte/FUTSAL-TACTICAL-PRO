// @vitest-environment jsdom
/**
 * El modo de captura: tres vistas, una preferencia y un refugio.
 *
 * Lo que se protege aquí es que ningún tamaño de pantalla pueda dejar al
 * entrenador con una interfaz que no se puede pulsar, y que la preferencia no
 * se filtre jamás al partido.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAPTURE_MODES,
  CAPTURE_MODE_KEY,
  CAPTURE_MODE_LABEL,
  COLUMNS_MIN_HEIGHT,
  COLUMNS_MIN_WIDTH,
  PITCH_MIN_HEIGHT,
  PITCH_MIN_WIDTH,
  ROWS_MIN_HEIGHT,
  ROWS_MIN_WIDTH,
  captureUnavailableReason,
  columnsLayoutFor,
  effectiveCaptureMode,
  isCaptureMode,
  isCaptureModeAvailable,
  normalizeCaptureMode,
  pitchAvailableFor,
  readCaptureMode,
  writeCaptureMode,
} from "./captureMode";

beforeEach(() => localStorage.clear());

describe("16 · los tres modos conviven", () => {
  it("son exactamente tres, y cada uno tiene su nombre", () => {
    expect(CAPTURE_MODES).toEqual(["focal", "columns", "pitch"]);
    expect(CAPTURE_MODE_LABEL).toEqual({
      focal: "Vista focal",
      columns: "Vista columnas",
      pitch: "Vista pista 5v5",
    });
  });

  it("«Vista dual» ya no existe como nombre visible", () => {
    expect(Object.values(CAPTURE_MODE_LABEL).join(" ")).not.toMatch(/dual/i);
  });
});

describe("17 · la preferencia guardada sobrevive al cambio de nombre", () => {
  it("quien tenía elegida «dual» se encuentra «columnas»", () => {
    localStorage.setItem(CAPTURE_MODE_KEY, "dual");
    expect(readCaptureMode()).toBe("columns");
    expect(normalizeCaptureMode("dual")).toBe("columns");
  });

  it("los tres nombres nuevos se leen tal cual", () => {
    for (const modo of CAPTURE_MODES) {
      localStorage.setItem(CAPTURE_MODE_KEY, modo);
      expect(readCaptureMode()).toBe(modo);
    }
  });

  it("basura, vacío o ausencia caen en focal", () => {
    for (const malo of ["", "DUAL", "pista", "{}", "null"]) {
      localStorage.setItem(CAPTURE_MODE_KEY, malo);
      expect(readCaptureMode()).toBe("focal");
    }
    localStorage.removeItem(CAPTURE_MODE_KEY);
    expect(readCaptureMode()).toBe("focal");
    expect(normalizeCaptureMode(undefined)).toBeNull();
    expect(isCaptureMode("dual")).toBe(false);
  });

  it("y si localStorage falla, se captura en focal sin romper nada", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("modo privado");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cuota");
    });
    expect(readCaptureMode()).toBe("focal");
    expect(() => writeCaptureMode("pitch")).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });

  it("escribir y leer es simétrico", () => {
    writeCaptureMode("pitch");
    expect(localStorage.getItem(CAPTURE_MODE_KEY)).toBe("pitch");
    expect(readCaptureMode()).toBe("pitch");
  });
});

describe("18 · ningún tamaño deja una interfaz impulsable", () => {
  it("focal cabe SIEMPRE: es lo que hace seguro el fallback", () => {
    for (const [w, h] of [[320, 480], [375, 812], [1024, 768], [1920, 1080], [0, 0]] as const) {
      expect(isCaptureModeAvailable("focal", w, h)).toBe(true);
      expect(captureUnavailableReason("focal", w, h)).toBeNull();
    }
  });

  it("1024×768 —el iPad horizontal— cae a focal en los dos modos nuevos", () => {
    // Medido: con columnas, dos de las diez fichas quedaban bajo la barra de
    // acciones e `elementFromPoint` devolvía otro elemento.
    expect(columnsLayoutFor(1024, 768)).toBeNull();
    expect(pitchAvailableFor(1024, 768)).toBe(false);
    expect(effectiveCaptureMode("columns", 1024, 768)).toBe("focal");
    expect(effectiveCaptureMode("pitch", 1024, 768)).toBe("focal");
  });

  it("375×812 —el móvil— también cae a focal", () => {
    expect(columnsLayoutFor(375, 812)).toBeNull();
    expect(pitchAvailableFor(375, 812)).toBe(false);
    expect(effectiveCaptureMode("pitch", 375, 812)).toBe("focal");
  });

  it("en un escritorio holgado caben los tres", () => {
    for (const modo of CAPTURE_MODES) {
      expect(isCaptureModeAvailable(modo, 1680, 1050)).toBe(true);
    }
    expect(columnsLayoutFor(1680, 1050)).toBe("columns");
  });

  it("la pista 5v5 pide menos ancho que las columnas, no menos alto", () => {
    // No lleva plantillas laterales, pero la separación de fichas que se tapan
    // es vertical: el alto sigue siendo el que manda.
    expect(PITCH_MIN_WIDTH).toBeLessThan(COLUMNS_MIN_WIDTH);
    expect(PITCH_MIN_HEIGHT).toBe(COLUMNS_MIN_HEIGHT);
    expect(pitchAvailableFor(PITCH_MIN_WIDTH, PITCH_MIN_HEIGHT)).toBe(true);
    expect(pitchAvailableFor(PITCH_MIN_WIDTH - 1, PITCH_MIN_HEIGHT)).toBe(false);
    expect(pitchAvailableFor(PITCH_MIN_WIDTH, PITCH_MIN_HEIGHT - 1)).toBe(false);
  });

  it("los umbrales de columnas siguen exactamente donde estaban", () => {
    expect([COLUMNS_MIN_WIDTH, COLUMNS_MIN_HEIGHT]).toEqual([1024, 820]);
    expect([ROWS_MIN_WIDTH, ROWS_MIN_HEIGHT]).toEqual([768, 900]);
    expect(columnsLayoutFor(COLUMNS_MIN_WIDTH, COLUMNS_MIN_HEIGHT)).toBe("columns");
    expect(columnsLayoutFor(800, 950)).toBe("rows");
    expect(columnsLayoutFor(800, 899)).toBeNull();
  });

  it("el aviso dice si falta ancho o falta alto, y de qué vista", () => {
    expect(captureUnavailableReason("columns", 1200, 700)).toBe(
      "Vista columnas no disponible con esta altura de pantalla",
    );
    expect(captureUnavailableReason("columns", 600, 1200)).toBe(
      "Vista columnas no disponible con esta anchura de pantalla",
    );
    expect(captureUnavailableReason("pitch", 1200, 700)).toBe(
      "Vista pista 5v5 no disponible con esta altura de pantalla",
    );
    expect(captureUnavailableReason("pitch", 600, 1200)).toBe(
      "Vista pista 5v5 no disponible con esta anchura de pantalla",
    );
  });

  it("un modo que no cabe NO se guarda como preferencia resuelta", () => {
    // El fallback es de presentación: si el entrenador gira la tablet y vuelve
    // a girarla, recupera la vista que eligió.
    writeCaptureMode("pitch");
    expect(effectiveCaptureMode(readCaptureMode(), 1024, 768)).toBe("focal");
    expect(localStorage.getItem(CAPTURE_MODE_KEY)).toBe("pitch");
    expect(effectiveCaptureMode(readCaptureMode(), 1680, 1050)).toBe("pitch");
  });
});
