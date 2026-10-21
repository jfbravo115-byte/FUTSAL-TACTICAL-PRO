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
  ROWS_MIN_HEIGHT,
  ROWS_MIN_WIDTH,
  captureAvailability,
  captureUnavailableReason,
  columnsLayoutFor,
  effectiveCaptureMode,
  isCaptureMode,
  isCaptureModeAvailable,
  normalizeCaptureMode,
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

/** La pista cabe (lo habitual en escritorio y en tablet vertical). */
const CABE = { ok: true, measured: true };
/** Medida, pero estas formaciones no se pueden separar en ella. */
const NO_CABE = { ok: false, measured: true };
/** Todavía sin medir: primer render, pestaña oculta. */
const SIN_MEDIR = { ok: false, measured: false };

describe("18 · ningún tamaño deja una interfaz impulsable", () => {
  it("focal cabe SIEMPRE: es lo que hace seguro el fallback", () => {
    for (const [w, h] of [[320, 480], [375, 812], [1024, 768], [1920, 1080], [0, 0]] as const) {
      for (const pista of [CABE, NO_CABE, SIN_MEDIR]) {
        const av = captureAvailability(w, h, pista);
        expect(isCaptureModeAvailable("focal", av)).toBe(true);
        expect(captureUnavailableReason("focal", av, w)).toBeNull();
      }
    }
  });

  it("la pista 5v5 NO depende del ancho de la ventana", () => {
    // Era el fallo: 900 px fijos dejaban fuera una tablet vertical donde la
    // pista medía 746×262 y los diez cabían.
    const tablet = captureAvailability(768, 1024, CABE);
    expect(tablet.pitch).toBe(true);
    expect(isCaptureModeAvailable("pitch", tablet)).toBe(true);
    expect(effectiveCaptureMode("pitch", tablet)).toBe("pitch");
    // Y al revés: una ventana enorme con una pista donde no caben separados
    // tampoco la ofrece.
    const escritorioEstrecho = captureAvailability(1920, 1080, NO_CABE);
    expect(escritorioEstrecho.pitch).toBe(false);
    expect(effectiveCaptureMode("pitch", escritorioEstrecho)).toBe("focal");
  });

  it("mientras no haya medida, no se promete una vista que quizá no quepa", () => {
    const av = captureAvailability(1440, 900, SIN_MEDIR);
    expect(av.pitch).toBe(false);
    expect(av.pitchReason).toBe("sin-medir");
    expect(captureUnavailableReason("pitch", av, 1440)).toBe(
      "Vista pista 5v5 no disponible con el tamaño actual de la pista",
    );
  });

  it("y cuando el problema son las formaciones, lo dice", () => {
    const av = captureAvailability(1440, 900, NO_CABE);
    expect(av.pitchReason).toBe("formacion");
    expect(captureUnavailableReason("pitch", av, 1440)).toBe(
      "Vista pista 5v5 no disponible: estas formaciones no caben separadas en la pista",
    );
  });

  it("columnas sigue decidiéndose por los umbrales medidos", () => {
    expect([COLUMNS_MIN_WIDTH, COLUMNS_MIN_HEIGHT]).toEqual([1024, 820]);
    expect([ROWS_MIN_WIDTH, ROWS_MIN_HEIGHT]).toEqual([768, 900]);
    expect(columnsLayoutFor(COLUMNS_MIN_WIDTH, COLUMNS_MIN_HEIGHT)).toBe("columns");
    expect(columnsLayoutFor(800, 950)).toBe("rows");
    expect(columnsLayoutFor(800, 899)).toBeNull();
    expect(columnsLayoutFor(1024, 768)).toBeNull(); // esconde un jugador por equipo
    expect(columnsLayoutFor(768, 1024)).toBe("rows");
    expect(columnsLayoutFor(375, 812)).toBeNull();
  });

  it("el aviso de columnas dice si falta ancho o falta alto", () => {
    const bajo = captureAvailability(1200, 700, CABE);
    expect(captureUnavailableReason("columns", bajo, 1200)).toBe(
      "Vista columnas no disponible con esta altura de pantalla",
    );
    const estrecho = captureAvailability(600, 1200, CABE);
    expect(captureUnavailableReason("columns", estrecho, 600)).toBe(
      "Vista columnas no disponible con esta anchura de pantalla",
    );
  });

  it("un modo que no cabe NO se guarda como preferencia resuelta", () => {
    // El repliegue es de presentación: si deja de caber y vuelve a caber, el
    // entrenador recupera la vista que eligió.
    writeCaptureMode("pitch");
    expect(effectiveCaptureMode(readCaptureMode(), captureAvailability(768, 1024, NO_CABE))).toBe("focal");
    expect(localStorage.getItem(CAPTURE_MODE_KEY)).toBe("pitch");
    expect(effectiveCaptureMode(readCaptureMode(), captureAvailability(768, 1024, CABE))).toBe("pitch");
  });
});
