import { describe, expect, it } from "vitest";
import { buildPrompt, SYSTEM_INSTRUCTION } from "../../netlify/functions/tactical-pro.mts";

describe("TACTICAL PRO prompt grounding", () => {
  it("prohíbe inventar métricas no registradas", () => {
    expect(SYSTEM_INSTRUCTION).toContain("No inventes posesión");
    expect(SYSTEM_INSTRUCTION).toContain("intervalos de 5 minutos");
  });

  it("presenta el resumen determinista como fuente canónica y evita tramos ficticios", () => {
    const prompt = buildPrompt('{"events":[]}', '{"score":{"team":1,"opponent":0}}');
    expect(prompt).toContain("RESUMEN DETERMINISTA CANÓNICO");
    expect(prompt).toContain("No inventes tramos de cinco minutos");
    expect(prompt).toContain('{"score":{"team":1,"opponent":0}}');
  });
});
