import { describe, it, expect } from "vitest";
import { safeImageSrc } from "./safeImageSrc";

describe("safeImageSrc", () => {
  it("data:image válido → permitido (formato real usado por PreMatch.tsx FileReader.readAsDataURL)", () => {
    const valid = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    expect(safeImageSrc(valid)).toBe(valid);
  });

  it("https válido → permitido", () => {
    const valid = "https://cdn.example.com/logo.png";
    expect(safeImageSrc(valid)).toBe(valid);
  });

  it("blob válido → permitido", () => {
    const valid = "blob:https://app.example.com/1234-5678";
    expect(safeImageSrc(valid)).toBe(valid);
  });

  // F. logos con javascript: no se renderizan
  it("F: javascript: → rechazado", () => {
    expect(safeImageSrc("javascript:alert(1)")).toBeNull();
    expect(safeImageSrc('javascript:alert(document.cookie)')).toBeNull();
  });

  // G. data:text/html no se renderiza
  it("G: data:text/html → rechazado", () => {
    expect(safeImageSrc("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeImageSrc("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBeNull();
  });

  it("esquema http (sin cifrar) → rechazado (sin evidencia de uso real en la app)", () => {
    expect(safeImageSrc("http://example.com/logo.png")).toBeNull();
  });

  it("esquemas arbitrarios/desconocidos → rechazados", () => {
    expect(safeImageSrc("ftp://example.com/logo.png")).toBeNull();
    expect(safeImageSrc("file:///etc/passwd")).toBeNull();
    expect(safeImageSrc("vbscript:msgbox(1)")).toBeNull();
  });

  it("valores vacíos/undefined/null → rechazados sin lanzar", () => {
    expect(safeImageSrc(undefined)).toBeNull();
    expect(safeImageSrc(null)).toBeNull();
    expect(safeImageSrc("")).toBeNull();
    expect(safeImageSrc("   ")).toBeNull();
  });

  it("data:image malformado (sin base64, o sin coma) → rechazado", () => {
    expect(safeImageSrc("data:image/png")).toBeNull();
    expect(safeImageSrc("data:image/png;base64,")).toBeNull();
  });
});
