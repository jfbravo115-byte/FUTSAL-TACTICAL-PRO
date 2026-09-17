/**
 * Anclaje del prompt de TACTICAL PRO.
 *
 * El modelo recibe el resumen serializado en JSON, con claves que se parecen
 * mucho entre sí y nombran hechos distintos. Estos tests fijan lo que el
 * prompt tiene que dejar claro para que no las confunda ni invente relaciones
 * que la aplicación no registra.
 */
import { describe, expect, it } from "vitest";
import { buildPrompt, SYSTEM_INSTRUCTION } from "../../netlify/functions/tactical-pro.mts";

const prompt = () =>
  buildPrompt(
    '{"events":[]}',
    '{"score":{"team":1,"opponent":0}}',
    '{"glossary":["Z1-Z4 …"],"goalkeepers":[],"zones":{}}',
  );

describe("instrucciones del sistema", () => {
  it("prohíbe inventar métricas no registradas", () => {
    expect(SYSTEM_INSTRUCTION).toContain("No inventes estadísticas");
    expect(SYSTEM_INSTRUCTION).toContain("intervalos de 5 minutos");
  });

  it("prohíbe inferir causalidad o secuencias por cercanía temporal", () => {
    expect(SYSTEM_INSTRUCTION).toContain("No infieras secuencias ni relaciones causales");
    expect(SYSTEM_INSTRUCTION).toMatch(/cercanía temporal/);
    expect(SYSTEM_INSTRUCTION).toMatch(/falta.*córner.*reanudación.*tiro/i);
  });

  it("fija que la ausencia de dato no es un cero observado", () => {
    expect(SYSTEM_INSTRUCTION).toContain("no \"no ocurrió\"");
    expect(SYSTEM_INSTRUCTION).toContain("ausencia de registro");
  });

  it("declara el contexto determinista como fuente factual", () => {
    expect(SYSTEM_INSTRUCTION).toContain("CONTEXTO DETERMINISTA");
    expect(SYSTEM_INSTRUCTION).toContain("No la recalcules");
  });

  it("obliga a separar hecho registrado de interpretación", () => {
    expect(SYSTEM_INSTRUCTION).toContain("hecho registrado de interpretación táctica");
  });

  it("manda respetar el glosario", () => {
    expect(SYSTEM_INSTRUCTION).toContain("GLOSARIO");
  });
});

describe("prompt del informe", () => {
  it("presenta las tres fuentes y el contexto táctico antes que los datos crudos", () => {
    const p = prompt();
    expect(p).toContain("RESUMEN DETERMINISTA CANÓNICO");
    expect(p).toContain("CONTEXTO TÁCTICO");
    expect(p).toContain("DATOS CRUDOS");
    // El bloque de contexto va delante del de datos crudos, no solo en la
    // lista de fuentes: es lo que el modelo lee primero.
    expect(p.indexOf("CONTEXTO TÁCTICO (incluye el glosario")).toBeLessThan(
      p.lastIndexOf("DATOS CRUDOS:"),
    );
  });

  it("incluye literalmente las tres fuentes recibidas", () => {
    const p = prompt();
    expect(p).toContain('{"score":{"team":1,"opponent":0}}');
    expect(p).toContain('"glossary"');
    expect(p).toContain('{"events":[]}');
  });

  it("evita tramos ficticios", () => {
    expect(prompt()).toContain("No inventes tramos de cinco minutos");
  });

  it("recuerda la perspectiva de los sectores", () => {
    expect(prompt()).toContain("normalizados a la perspectiva del equipo que ejecuta");
  });

  it("pide portería con el vocabulario de Fase 4", () => {
    const p = prompt();
    expect(p).toContain("GK1-GK5");
    expect(p).toMatch(/salidas con su resultado/i);
  });

  it("separa las dos métricas de córner y las de falta", () => {
    const p = prompt();
    expect(p).toContain("tiros directos de córner de los tiros procedentes de córner");
    expect(p).toMatch(/faltas cometidas de las faltas puestas en juego y de los tiros de falta/);
    expect(p).toContain("No los sumes entre sí");
  });

  it("no pide recalcular nada a partir de los eventos", () => {
    expect(prompt()).toContain("nunca para recalcular una métrica");
  });
});
