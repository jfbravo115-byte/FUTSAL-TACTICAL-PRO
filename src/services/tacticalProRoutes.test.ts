/**
 * Una sola ruta hacia TACTICAL PRO.
 *
 * Toda la Fase 6 ha consistido en quitar generadores paralelos: dos payloads
 * distintos (Paso 2), dos verdades sobre el portero (Paso 2C) y ahora dos
 * formas de hablar con el endpoint. Estos tests leen el código fuente de las
 * pantallas y fallan si vuelve a aparecer una segunda implementación.
 *
 * Son estáticos a propósito: `MatchTracker.tsx` son 8.000 líneas y no se puede
 * montar en jsdom, así que la alternativa a leer el fichero sería no fijar
 * nada. Es el mismo enfoque que utils/reportPagination.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf-8");

const matchTracker = leer("../pages/MatchTracker.tsx");
const matchAnalysis = leer("../pages/MatchAnalysis.tsx");
const tacticalBoard = leer("../pages/TacticalBoard.tsx");
const servicio = leer("./tacticalAnalysisService.ts");

describe("las dos pantallas postpartido comparten servicio", () => {
  it("ambas importan streamTacticalReport", () => {
    expect(matchTracker).toContain('import { streamTacticalReport } from "../services/tacticalAnalysisService"');
    expect(matchAnalysis).toContain('import { streamTacticalReport } from "../services/tacticalAnalysisService"');
  });

  it("ninguna monta su propia petición al endpoint", () => {
    expect(matchTracker).not.toContain("'/api/tactical-pro'");
    expect(matchTracker).not.toContain('"/api/tactical-pro"');
    expect(matchAnalysis).not.toContain("'/api/tactical-pro'");
    expect(matchAnalysis).not.toContain('"/api/tactical-pro"');
  });

  it("ninguna parsea el protocolo por su cuenta", () => {
    for (const fuente of [matchTracker, matchAnalysis]) {
      expect(fuente).not.toContain("getReader()");
      expect(fuente).not.toContain("TextDecoder");
      expect(fuente).not.toContain("x-ndjson");
    }
  });

  it("el servicio es el único que construye el cuerpo", () => {
    expect(servicio).toContain("buildTacticalProPayload");
    expect(matchTracker).not.toContain("buildTacticalProPayload");
    expect(matchAnalysis).not.toContain("buildTacticalProPayload");
  });

  it("ya no queda el plazo único de 20 s para terminar el informe", () => {
    expect(matchTracker).not.toContain("20000");
    expect(matchAnalysis).not.toContain("20000");
    expect(matchAnalysis).not.toContain("Promise.race");
  });
});

describe("persistencia solo con el informe entero", () => {
  /** El cuerpo de runTacticalAnalysis, partido en éxito y fallo. */
  const cuerpo = matchTracker.slice(
    matchTracker.indexOf("const runTacticalAnalysis"),
    matchTracker.indexOf("const closeTacticalModal"),
  );
  const exito = cuerpo.slice(
    cuerpo.indexOf("await streamTacticalReport"),
    cuerpo.indexOf("} catch (e: any)"),
  );
  const fallo = cuerpo.slice(cuerpo.indexOf("} catch (e: any)"));

  it("el bloque de éxito existe y es donde se guarda", () => {
    expect(exito).toContain("setMatchData((prev) => ({ ...prev, tacticalAnalysis: analysis }))");
    expect(exito).toContain("updateFinalLocalCopyMatchData(");
  });

  it("la rama de error NO guarda nada", () => {
    expect(fallo).not.toContain("setMatchData(");
    expect(fallo).not.toContain("updateFinalLocalCopyMatchData(");
  });

  it("solo hay un punto de guardado del análisis en toda la pantalla", () => {
    const guardados = cuerpo.split("tacticalAnalysis: analysis").length - 1;
    expect(guardados).toBe(2); // el estado y la copia local, ambos en el éxito
  });

  it("el informe determinista se pinta ANTES de pedir nada a la IA", () => {
    const base = cuerpo.indexOf("setBaseReportMarkdown(formatMatchReportAsMarkdown(report))");
    const peticion = cuerpo.indexOf("await streamTacticalReport");
    expect(base).toBeGreaterThan(-1);
    expect(base).toBeLessThan(peticion);
  });

  it("MatchAnalysis guarda, y solo en la rama de éxito", () => {
    // Antes esta pantalla no persistía nada: un análisis generado desde el
    // Historial se perdía al salir. Ahora sí escribe, pero con la MISMA
    // disciplina que MatchTracker — nunca desde el catch.
    const runAI = matchAnalysis.slice(
      matchAnalysis.indexOf("const runAI = async"),
      matchAnalysis.indexOf("const scrollTo ="),
    );
    const exito = runAI.slice(
      runAI.indexOf("await streamTacticalReport"),
      runAI.indexOf("} catch (err: any)"),
    );
    // Sobre el CÓDIGO de la rama de error: su comentario cita la función a
    // propósito, para explicar por qué NO está ahí.
    const fallo = runAI
      .slice(runAI.indexOf("} catch (err: any)"))
      .replace(/^\s*\/\/.*$/gm, "");

    expect(runAI).toContain("streamTacticalReport");
    expect(exito).toContain("updateFinalLocalCopyMatchData(localCopyId,");
    expect(fallo).not.toContain("updateFinalLocalCopyMatchData");
    expect(fallo).not.toContain("setMatch(");
  });

  it("MatchAnalysis solo escribe en la copia local de ESE partido", () => {
    // Los dos destinos salen del identificador con el que se abrió el
    // partido, resueltos en un solo sitio. Guardar en cualquier otro
    // asociaría el análisis al partido equivocado.
    expect(matchAnalysis).toContain("const destinos = resolveTacticalTargets(local, decoded);");
    expect(matchAnalysis).toContain("setLocalCopyId(destinos.localCopyId);");
    expect(matchAnalysis).toContain("setRemoteId(destinos.remoteId);");
    expect(matchAnalysis).toMatch(/updateFinalLocalCopyMatchData\(localCopyId,/);
  });

  it("un texto vacío o incompleto no sustituye a un análisis anterior", () => {
    // La guarda está ANTES de tocar nada: si el informe no es persistible, no
    // se escribe ni en memoria, ni en local, ni en remoto.
    expect(matchAnalysis).toContain("if (!isPersistableAnalysis(result)) return;");
  });

  it("la MEMORIA se actualiza aunque el partido venga solo del historial remoto", () => {
    // El defecto corregido: `setMatch` vivía dentro de `if (localCopyId)`, así
    // que un partido abierto desde otro dispositivo enseñaba el análisis en
    // pantalla y exportaba un PDF sin él.
    const runAI = matchAnalysis.slice(
      matchAnalysis.indexOf("const runAI = async"),
      matchAnalysis.indexOf("const scrollTo ="),
    );
    const memoria = runAI.indexOf("setMatch((prev) => (prev ? { ...prev, tacticalAnalysis: result } : prev));");
    const local = runAI.indexOf("if (localCopyId) updateFinalLocalCopyMatchData(localCopyId, actualizado);");
    expect(memoria).toBeGreaterThan(-1);
    expect(local).toBeGreaterThan(-1);
    // La memoria va ANTES y fuera de cualquier condición sobre la copia local.
    expect(memoria).toBeLessThan(local);
  });

  it("el remoto se actualiza por su ruta aislada y es lo ÚLTIMO", () => {
    const runAI = matchAnalysis.slice(
      matchAnalysis.indexOf("const runAI = async"),
      matchAnalysis.indexOf("const scrollTo ="),
    );
    expect(runAI).toContain("await sincronizarAnalisis(result);");
    expect(matchAnalysis).toContain("await updatePartidoTacticalAnalysis(remoteId, texto);");
    // Y el reintento sincroniza, NUNCA vuelve a llamar a Anthropic.
    const reintento = matchAnalysis.slice(matchAnalysis.indexOf("data-tactical-sync-retry"));
    expect(reintento.slice(0, 400)).toContain("sincronizarAnalisis(ai)");
    expect(reintento.slice(0, 400)).not.toContain("runAI(");
  });

  it("un fallo de sincronización no borra ni degrada el análisis", () => {
    const sync = matchAnalysis.slice(
      matchAnalysis.indexOf("const sincronizarAnalisis = async"),
      matchAnalysis.indexOf("const runAI = async"),
    );
    const fallo = sync.slice(sync.indexOf("} catch (err)")).replace(/^\s*\/\/.*$/gm, "");
    expect(fallo).toContain('setAiSync("fallo")');
    expect(fallo).not.toContain("setAi(");
    expect(fallo).not.toContain("setMatch(");
    expect(fallo).not.toContain("setAiPartial(");
    expect(fallo).not.toContain("streamTacticalReport");
  });
});

describe("cancelación conectada a la UI", () => {
  it("cerrar el modal aborta la generación", () => {
    expect(matchTracker).toContain("const closeTacticalModal");
    expect(matchTracker).toContain("onClose={closeTacticalModal}");
    expect(matchTracker).toMatch(/closeTacticalModal[\s\S]{0,200}tacticalAbortRef\.current\?\.abort\(\)/);
  });

  it("desmontar la pantalla también", () => {
    expect(matchTracker).toContain("useEffect(() => () => tacticalAbortRef.current?.abort(), [])");
    expect(matchAnalysis).toContain("useEffect(() => () => aiAbortRef.current?.abort(), [])");
  });
});

describe("TacticalBoard sigue intacto", () => {
  it("no pide NDJSON y sigue leyendo JSON", () => {
    expect(tacticalBoard).toContain("await res.json()");
    expect(tacticalBoard).toContain("data.analysis");
    expect(tacticalBoard).not.toContain("x-ndjson");
    expect(tacticalBoard).not.toContain("streamTacticalReport");
  });

  it("el servicio no-streaming sigue disponible para quien lo necesite", () => {
    expect(servicio).toContain("export async function generateTacticalReport");
  });
});
