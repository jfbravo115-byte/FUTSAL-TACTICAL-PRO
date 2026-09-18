/**
 * Contrato del informe de TACTICAL PRO.
 *
 * El destinatario es el entrenador y su cuerpo técnico. Hasta el paso 2M el
 * informe salía escrito en el vocabulario del esquema —"Ambos tiros se
 * originaron en Z4L", "no se registran eventos FOUL en los datos crudos"— y
 * eso no se puede leer en voz alta en una reunión de equipo.
 *
 * Aquí se fijan las dos mitades del contrato, que tiran en direcciones
 * opuestas y por eso necesitan tests:
 *
 *   FUERA  los códigos internos, los nombres de campo y las restricciones del
 *          propio modelo no pueden salir en el informe.
 *   DENTRO las reglas de seguridad factual siguen enteras: no inventar, no
 *          recalcular, no encadenar por cercanía, ausencia ≠ cero, y la
 *          semántica de las Fases 3, 4 y 5 intacta.
 *
 * Perder cualquiera de las dos rompe el producto: sin la primera es ilegible,
 * sin la segunda es mentira.
 */
import { describe, expect, it } from "vitest";
import { buildPrompt, SYSTEM_INSTRUCTION } from "../../netlify/functions/tactical-pro.mts";

const prompt = () =>
  buildPrompt(
    '{"events":[]}',
    '{"score":{"team":1,"opponent":0}}',
    '{"glossary":["Z1-Z4 …"],"goalkeepers":[],"zones":{}}',
  );

/** Las dos piezas que ve el modelo, juntas. */
const contrato = () => SYSTEM_INSTRUCTION + "\n" + prompt();

describe("para quién se escribe", () => {
  it("declara al entrenador y al cuerpo técnico como destinatarios", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/entrenador y el cuerpo técnico/);
    expect(SYSTEM_INSTRUCTION).toMatch(/compartirse tal cual en una reunión/);
  });

  it("pide lenguaje de fútbol sala, sobrio y sin coloquialismos", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/Lenguaje de fútbol sala/);
    expect(SYSTEM_INSTRUCTION).toMatch(/sin entusiasmo ni coloquialismos/);
  });

  it("pide interpretación, no repetir el inventario que ya tienen", () => {
    expect(SYSTEM_INSTRUCTION).toContain("Interpretas, no inventarías");
    expect(SYSTEM_INSTRUCTION).toMatch(/ya tiene las tablas, los mapas y el marcador/);
    expect(SYSTEM_INSTRUCTION).toMatch(/dónde estuvo la diferencia/);
  });
});

describe("los códigos internos no salen en el informe", () => {
  it("prohíbe explícitamente imprimirlos", () => {
    expect(SYSTEM_INSTRUCTION).toContain("NUNCA IMPRIMAS CÓDIGOS INTERNOS");
    expect(SYSTEM_INSTRUCTION).toMatch(/PROHIBIDO que aparezcan en el informe/);
  });

  it("nombra uno por uno los que ha estado imprimiendo", () => {
    for (const codigo of [
      "Z1L-Z4R", "GK1-GK5", "G1-G9", "OUT",
      "FOUL", "SHOT", "GOAL", "STEAL", "LOSS", "CORNER", "SET_PIECE",
      "SAVE_CATCH", "SAVE_DEFLECT", "EXIT",
      "originGrid", "destinationGrid", "setPieceOutcome", "setPieceOrigin",
      "attackDirection", "goalkeeperZone", "metadata", "timestamp", "period",
      "shotsFromCorner", "recoveryLossBalance", "stats.saves",
    ]) {
      expect(SYSTEM_INSTRUCTION).toContain(codigo);
    }
  });

  it("prohíbe también las muletillas que los arrastran", () => {
    expect(SYSTEM_INSTRUCTION).toContain('"según originGrid"');
    expect(SYSTEM_INSTRUCTION).toContain('"evento FOUL"');
    expect(SYSTEM_INSTRUCTION).toContain('"period 1"');
    expect(SYSTEM_INSTRUCTION).toContain('"timestamp 24035"');
  });

  it("enseña a traducir los sectores, no solo a callarlos", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/Z1 a Z4 son la profundidad/);
    expect(SYSTEM_INSTRUCTION).toMatch(/campo propio, zona media o campo ofensivo/);
    expect(SYSTEM_INSTRUCTION).toMatch(/carril: izquierda, centro o derecha/);
    expect(SYSTEM_INSTRUCTION).toContain("el sector izquierdo en campo ofensivo");
  });

  it("enseña a traducir la portería y el destino del remate", () => {
    // Desde el paso 2N la escala es la autoritativa completa, no una
    // paráfrasis: decir "distancia" a secas invitaba a leerla como conducta.
    expect(SYSTEM_INSTRUCTION).toMatch(/GK1 a GK5 son DÓNDE interviene el portero/);
    expect(SYSTEM_INSTRUCTION).toMatch(/GK1 bajo palos.*GK5 fuera del área/s);
    expect(SYSTEM_INSTRUCTION).toMatch(/destino del remate es la zona de la portería/);
  });

  it("enseña a traducir las tres formas de falta", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/falta es una falta o infracción/);
    expect(SYSTEM_INSTRUCTION).toMatch(/puesta en juego en corto es un saque de falta jugado/);
    expect(SYSTEM_INSTRUCTION).toMatch(/declarado de falta es un remate de falta/);
  });
});

describe("no se le explica la base de datos al entrenador", () => {
  it("prohíbe contar las propias restricciones", () => {
    expect(SYSTEM_INSTRUCTION).toContain("No expliques la base de datos ni tus propias restricciones");
    expect(SYSTEM_INSTRUCTION).toContain("no se registran eventos en los datos crudos suministrados");
    expect(SYSTEM_INSTRUCTION).toContain("no hay dato equivalente explícito");
    expect(SYSTEM_INSTRUCTION).toContain("no se debe inferir causalidad por proximidad temporal");
  });

  it("da la forma natural de decir que falta información", () => {
    expect(SYSTEM_INSTRUCTION).toContain("No hay información suficiente para valorar este aspecto");
    expect(SYSTEM_INSTRUCTION).toMatch(/mejor omítelo/);
  });

  it("marca las reglas de razonamiento como internas, no como prosa", () => {
    expect(SYSTEM_INSTRUCTION).toContain("gobiernan tu análisis; NO las cites en el informe");
  });

  it("el informe puede omitir secciones sin evidencia", () => {
    const p = prompt();
    expect(p).toMatch(/No hace falta rellenar todas las subsecciones/);
    expect(p).toMatch(/más corto y sostenido vale más que uno largo y especulativo/);
  });
});

describe("hecho, interpretación y propuesta van separados", () => {
  it("nombra los tres planos y prohíbe confundirlos", () => {
    expect(SYSTEM_INSTRUCTION).toContain("HECHO OBSERVADO");
    expect(SYSTEM_INSTRUCTION).toContain("INTERPRETACIÓN TÁCTICA");
    expect(SYSTEM_INSTRUCTION).toContain("PROPUESTA");
    expect(SYSTEM_INSTRUCTION).toMatch(/interpretación nunca se presenta como un hecho/);
  });

  it("las claves para el cuerpo técnico van en hallazgo, evidencia e implicación", () => {
    const p = prompt();
    expect(p).toMatch(/el hallazgo, la evidencia que lo sostiene y la implicación/);
    expect(p).toMatch(/Entre tres y cinco conclusiones/);
  });
});

describe("no inventar conceptos tácticos", () => {
  it("lista los que exigen evidencia registrada", () => {
    for (const concepto of [
      "Presión alta", "defensa zonal", "3-1 / 4-0 / 2-2", "bloque alto",
      "superioridades", "coberturas", "asistencias", "posesiones",
      "transiciones", "segundo palo",
    ]) {
      expect(SYSTEM_INSTRUCTION).toContain(concepto);
    }
    expect(SYSTEM_INSTRUCTION).toMatch(/solo pueden aparecer si hay evidencia registrada/);
  });

  it("el portero-jugador solo si consta", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/Portero-jugador, únicamente si consta/);
  });

  it("sigue prohibiendo las métricas que no existen", () => {
    expect(SYSTEM_INSTRUCTION).toContain("No inventes estadísticas");
    expect(SYSTEM_INSTRUCTION).toMatch(/posesión, xG, distancias, velocidades/);
    expect(SYSTEM_INSTRUCTION).toMatch(/intervalos de cinco minutos/);
  });
});

describe("muestras pequeñas", () => {
  it("prohíbe convertir un porcentaje en tendencia", () => {
    expect(SYSTEM_INSTRUCTION).toContain("MUESTRAS PEQUEÑAS");
    expect(SYSTEM_INSTRUCTION).toMatch(/no conviertas un porcentaje en una tendencia/);
  });

  it("usa el caso real de los dos remates como ejemplo", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/Con dos remates no se habla de "efectividad del 100%"/);
    expect(SYSTEM_INSTRUCTION).toMatch(/demasiado pequeña para hablar de tendencia/);
  });

  it("prohíbe recomendaciones fuertes sobre una o dos acciones", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/No hagas recomendaciones fuertes apoyadas en una o dos acciones/);
  });
});

describe("la seguridad factual sigue entera", () => {
  it("el contexto determinista sigue siendo la fuente factual", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/fuente factual de toda métrica ya calculada/);
    expect(SYSTEM_INSTRUCTION).toMatch(/No la recalcules/);
  });

  it("prohíbe encadenar acciones por cercanía temporal", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/No infieras secuencias ni relaciones causales/);
    expect(SYSTEM_INSTRUCTION).toMatch(/NUNCA encadenes una falta, un córner, una reanudación y un remate/);
    expect(SYSTEM_INSTRUCTION).toMatch(/cercanía temporal/);
  });

  it("ausencia de registro no es un cero observado", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/ausencia de un registro no es un cero observado/);
  });

  it("Fase 3: conserva la perspectiva normalizada de los sectores", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/normalizados a la perspectiva del equipo que ejecuta/);
    expect(SYSTEM_INSTRUCTION).toMatch(/sector del rival está dicho desde SU punto de vista/);
  });

  it("Fase 4: la portería del contexto táctico es la única fuente", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/única fuente válida sobre el portero/);
  });

  it("Fase 5: córner directo y remate procedente de córner siguen separados", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/dos registros independientes/);
    expect(SYSTEM_INSTRUCTION).toMatch(/no los sumes ni hagas que uno implique al otro/);
  });

  it("Fase 5: falta cometida, puesta en juego y remate de falta son tres cosas", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/tres cosas distintas y separadas/);
  });

  it("toda propuesta se apoya en evidencia", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/Toda propuesta debe apoyarse en evidencia concreta/);
    expect(SYSTEM_INSTRUCTION).toMatch(/Si no la hay, no la incluyas/);
  });
});

describe("estructura del informe", () => {
  it("son las seis secciones para el cuerpo técnico", () => {
    const p = prompt();
    expect(p).toContain("# INFORME TACTICAL PRO");
    expect(p).toContain("## 1. Lectura del partido");
    expect(p).toContain("## 2. Con balón");
    expect(p).toContain("## 3. Sin balón");
    expect(p).toContain("## 4. Portería");
    expect(p).toContain("## 5. Claves para el cuerpo técnico");
    expect(p).toContain("## 6. Propuestas de trabajo");
  });

  it("ya no quedan las secciones del informe de auditoría", () => {
    const p = prompt();
    expect(p).not.toContain("Lectura objetiva del partido");
    expect(p).not.toContain("Ataque y finalización");
    expect(p).not.toContain("Rotaciones y utilización");
    expect(p).not.toContain("Recomendaciones TACTICAL PRO");
  });

  it("la portería se pide en lenguaje de fútbol, no en códigos", () => {
    const p = prompt();
    expect(p).toMatch(/a qué distancia de la portería se produjo/);
    expect(p).toMatch(/Lectura táctica, en lenguaje de fútbol/);
    expect(p).not.toContain("GK1-GK5");
  });
});

describe("las tres fuentes", () => {
  it("el contexto táctico va antes que los datos del partido", () => {
    const p = prompt();
    expect(p).toContain("RESUMEN DETERMINISTA");
    expect(p).toContain("CONTEXTO TÁCTICO");
    expect(p).toContain("DATOS DEL PARTIDO");
    expect(p.indexOf("CONTEXTO TÁCTICO (incluye el glosario")).toBeLessThan(
      p.lastIndexOf("DATOS DEL PARTIDO:"),
    );
  });

  it("incluye literalmente las tres que recibe", () => {
    const p = prompt();
    expect(p).toContain('{"score":{"team":1,"opponent":0}}');
    expect(p).toContain('"glossary"');
    expect(p).toContain('{"events":[]}');
  });

  it("las fuentes son material de trabajo, no algo que citar en el informe", () => {
    expect(prompt()).toMatch(/no menciona esas fuentes ni sus nombres de campo: habla de fútbol/);
  });

  it("los datos del partido no sirven para recalcular", () => {
    expect(prompt()).toMatch(/nunca para recalcular una métrica que ya venga en las dos primeras/);
  });
});

describe("el contrato no se contradice a sí mismo", () => {
  it("los códigos aparecen para prohibirlos, nunca en la estructura del informe", () => {
    // El system prompt los nombra porque tiene que prohibirlos. La plantilla
    // del informe, que es lo que el modelo copia, no puede contener ninguno.
    const p = prompt();
    for (const codigo of ["Z4L", "GK5", "originGrid", "setPieceOutcome", "recoveryLossBalance"]) {
      expect(p).not.toContain(codigo);
    }
  });

  it("todo el contrato cabe sin volverse gigante", () => {
    // Si esto se dispara, el contrato se ha convertido en un manual y compite
    // con los datos por el presupuesto de entrada.
    expect(contrato().length).toBeLessThan(12_000);
  });
});

// ── PASO 2N ────────────────────────────────────────────────────────────
//
// El informe real del paso 2M ya no imprime códigos, pero cometió cuatro
// errores de rigor. Los ejemplos de abajo son literales de esa salida: si
// alguien afloja el contrato, estos tests lo dicen.

describe("coherencia aritmética", () => {
  it("prohíbe llamar iguales a dos cifras distintas", () => {
    expect(SYSTEM_INSTRUCTION).toContain("COHERENCIA ARITMÉTICA");
    expect(SYSTEM_INSTRUCTION).toMatch(
      /No llames iguales, equivalentes, similares ni parejas a dos cifras distintas/,
    );
  });

  it("usa el error real como ejemplo, con las dos cifras", () => {
    // "igualdad en la efectividad de ambos guardametas (67% frente a 50%)"
    expect(SYSTEM_INSTRUCTION).toContain("67% frente a 50%");
    expect(SYSTEM_INSTRUCTION).toMatch(/67% no es 50%/);
    expect(SYSTEM_INSTRUCTION).toMatch(/hay que nombrar como diferencia/);
  });

  it("obliga a comprobar cada comparación antes de escribirla", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/Comprueba cada comparación antes de escribirla/);
  });

  it("prohíbe que una diferencia estadística explique el resultado sin evidencia", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(
      /no digas que una diferencia estadística explica el resultado del partido salvo que haya evidencia/,
    );
  });
});

describe("la zona del portero dice dónde, no por qué", () => {
  it("da la escala espacial autoritativa completa", () => {
    // La misma que fija types/futsal.ts. Ni una interpretación de más.
    expect(SYSTEM_INSTRUCTION).toContain("GK1 bajo palos");
    expect(SYSTEM_INSTRUCTION).toContain("GK2 dentro del área a profundidad corta");
    expect(SYSTEM_INSTRUCTION).toContain("GK3 dentro del área a profundidad media");
    expect(SYSTEM_INSTRUCTION).toContain("GK4 en zona avanzada hasta el límite del área");
    expect(SYSTEM_INSTRUCTION).toContain("GK5 fuera del área");
  });

  it("declara que la zona es ubicación, no comportamiento", () => {
    expect(SYSTEM_INSTRUCTION).toContain("LA ZONA DEL PORTERO DICE DÓNDE, NO POR QUÉ");
    expect(SYSTEM_INSTRUCTION).toMatch(/el lugar donde ocurrió/);
    expect(SYSTEM_INSTRUCTION).toMatch(/DÓNDE interviene el portero, por profundidad/);
  });

  it("prohíbe una por una las lecturas tácticas que se coló", () => {
    for (const invento of [
      "estaba adelantado",
      "achicó",
      "salió a reducir espacios",
      "participó activamente fuera de su posición",
      "colocación fue buena o mala",
    ]) {
      expect(SYSTEM_INSTRUCTION).toContain(invento);
    }
    expect(SYSTEM_INSTRUCTION).toMatch(/NO autoriza/);
  });

  it("exige un dato registrado para afirmar un comportamiento del portero", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(
      /hace falta un dato que lo registre, y la zona no lo es/,
    );
  });
});

describe("un sector no es una receta", () => {
  it("prohíbe convertir la correlación espacial en prescripción", () => {
    expect(SYSTEM_INSTRUCTION).toContain("UN SECTOR NO ES UNA RECETA");
    expect(SYSTEM_INSTRUCTION).toMatch(/no demuestra que atacar más por ahí vaya a generar más ocasiones/);
    expect(SYSTEM_INSTRUCTION).toMatch(/ni que defender peor por ahí sea la causa de encajar/);
  });

  it("da la fórmula correcta y la incorrecta, literales", () => {
    expect(SYSTEM_INSTRUCTION).toContain(
      "conviene revisar en vídeo esas acciones y valorar si existe un mecanismo reproducible",
    );
    expect(SYSTEM_INSTRUCTION).toContain("insistir por ese carril aumentará las ocasiones");
    expect(SYSTEM_INSTRUCTION).toMatch(/nunca "insistir por ese carril/);
  });
});

describe("una propuesta pide revisión, no inventa la causa", () => {
  it("da la forma correcta ante un gol rival en un sector", () => {
    expect(SYSTEM_INSTRUCTION).toContain("UNA PROPUESTA PUEDE PEDIR REVISIÓN; NO PUEDE INVENTAR LA CAUSA");
    expect(SYSTEM_INSTRUCTION).toContain(
      "revisar en vídeo cómo se desarrolló esa acción y qué permitió la finalización",
    );
  });

  it("nombra los seis conceptos que no pueden colarse como explicación", () => {
    for (const concepto of [
      "presión", "cierre", "cobertura", "balance defensivo", "marcaje", "estructura defensiva",
    ]) {
      expect(SYSTEM_INSTRUCTION).toContain(concepto);
    }
    expect(SYSTEM_INSTRUCTION).toMatch(/salvo que haya evidencia registrada que sostenga ese concepto en concreto/);
  });

  it("fija el camino permitido y el prohibido", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(
      /DATO REGISTRADO, luego PREGUNTA para el cuerpo técnico, luego REVISIÓN O PROPUESTA/,
    );
    expect(SYSTEM_INSTRUCTION).toMatch(/Nunca DATO, CAUSA INVENTADA, SOLUCIÓN PRESCRITA/);
  });
});
