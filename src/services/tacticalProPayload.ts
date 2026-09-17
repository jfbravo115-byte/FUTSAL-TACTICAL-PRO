/**
 * src/services/tacticalProPayload.ts
 *
 * Contexto que se envía a TACTICAL PRO. Función pura, sin React y sin DOM.
 *
 * POR QUÉ EXISTE
 * --------------
 * Las dos pantallas que piden análisis mandaban cosas distintas: MatchTracker
 * enviaba solo `matchData` —eventos crudos— y MatchAnalysis enviaba además el
 * resumen determinista. El mismo partido llegaba al modelo con dos niveles de
 * información según el botón que se pulsara, y desde la pantalla más usada le
 * tocaba reinterpretar los eventos a mano.
 *
 * Aquí se construye UNA vez y lo usan las dos.
 *
 * NO RECALCULA NADA
 * -----------------
 * Cada cifra viene del helper que ya es autoritativo para ese dominio:
 *
 *   generateMatchReport      métricas de equipo, jugadores, balón parado
 *   buildGoalkeeperReports   porteros (Fase 4, con Modelo C y GK1-GK5)
 *   buildZoneDashboard       espacio (12 zonas, destino, córners)
 *
 * Si una cifra no está aquí es porque su helper no la produce, no porque este
 * módulo haya decidido calcularla de otra manera.
 *
 * PROYECTA, NO RECALCULA
 * ----------------------
 * Lo único que este módulo hace con la salida de esos helpers es QUITAR
 * campos. Nunca añade, nunca transforma y nunca recompone un número. Cada
 * exclusión está justificada abajo y medida: el payload de un partido real
 * pasó de ~327 KB a ~62 KB sin perder un solo agregado.
 *
 * Tres motivos para excluir, y ninguno más:
 *
 *   1. RUIDO      no es texto analizable (logos en base64) o es nuestra propia
 *                 salida anterior (`tacticalAnalysis`), que al reintentar se
 *                 realimentaba a sí misma.
 *   2. DUPLICADO  el mismo GameEvent ya viaja en `matchData.events`
 *                 (`goalkeepers[].events`, `goalkeepers[].timeline`).
 *   3. CONTRADICTORIO
 *                 `deterministicReport.goalkeeper` sale de `player.stats` —el
 *                 modelo anterior a Fase 4— y discrepa de
 *                 `tacticalContext.goalkeepers`. Dos verdades sobre el mismo
 *                 portero en el mismo prompt no es contexto: es una trampa.
 *                 Se excluye del envío; el informe determinista original,
 *                 los PDFs y la UI siguen intactos.
 *
 * EL GLOSARIO NO ES DECORACIÓN
 * ----------------------------
 * El resumen viaja serializado en JSON, con claves como `corners.team.shot` y
 * `shotsFromCorner`, que nombran dos hechos distintos y se parecen demasiado.
 * El glosario es lo que impide que el modelo los sume, y lo que le dice que la
 * ausencia de un campo opcional no es un cero observado.
 */
import { MatchData } from "../types/futsal";
import { MatchReport, generateMatchReport } from "./matchReportService";
import { GoalkeeperReportEntry, buildGoalkeeperReports } from "./goalkeeperReportService";
import { ZoneDashboard, buildZoneDashboard } from "./matchZonesService";

/**
 * Vocabulario mínimo para que el modelo lea el resumen sin inventarse la
 * semántica. Es texto, no cálculo: no sustituye a ninguna métrica.
 */
export const TACTICAL_PRO_GLOSSARY: readonly string[] = [
  "Z1-Z4 con izquierda/centro/derecha: sectores de pista normalizados SIEMPRE a la " +
    "perspectiva del equipo que ejecuta la acción. Z1 es la zona más cercana a la portería " +
    "propia de ese equipo y Z4 la más cercana a la rival. Un sector del rival está expresado " +
    "desde SU perspectiva, no desde la nuestra: no los compares como si fueran el mismo lado " +
    "del campo.",
  "GK1-GK5: zona física donde interviene el portero, medida por profundidad respecto a su " +
    "portería (GK1 bajo palos, GK5 fuera del área). Es un dominio propio: no son sectores de " +
    "pista ni destinos de tiro, y nunca se suman con ellos.",
  "Destino de tiro (portería): dónde termina el balón en el marco. Dominio propio, distinto " +
    "del sector de origen.",
  "Tiro directo de córner: un evento CORNER con setPieceOutcome 'shot'. Significa que ese " +
    "córner se ejecutó directamente hacia portería. NO crea ningún tiro ni suma a los tiros.",
  "Tiro procedente de córner: un evento SHOT con setPiece 'corner'. Es un tiro que el " +
    "operador declaró como procedente de un córner. Es un registro INDEPENDIENTE del " +
    "anterior: no se suman entre sí, ninguno implica al otro y pueden no coincidir.",
  "FOUL: infracción COMETIDA por el equipo indicado en el evento. Las faltas recibidas son " +
    "las que comete el rival. Una falta no describe cómo se reanudó el juego.",
  // Tres cifras de faltas conviven en este payload y miden cosas distintas. El
  // informe todavía no las etiqueta —eso es otro paso—, así que se declaran
  // aquí para que el modelo no las presente como si fueran la misma.
  "Faltas, contador reglamentario: 'matchData.fouls', 'deterministicReport.fouls' y " +
    "'deterministicReport.teamTotals.fouls' son el MISMO contador, y son las faltas " +
    "acumuladas del PERIODO ACTUAL, el que dispara la sanción de la 6ª falta. Se reinician " +
    "en el descanso. NO son el total del partido y no debes presentarlas como tal.",
  "Faltas, total del partido: son los eventos FOUL registrados. 'periodStats[].fouls' los da " +
    "por periodo y el desglose por jugador los da por jugador. Que el contador reglamentario " +
    "valga 0 mientras hay eventos FOUL no es una contradicción: significa que esas faltas se " +
    "cometieron en un periodo anterior y el contador ya se reinició. Dilo así si lo comentas.",
  "SET_PIECE con setPieceOrigin 'free_kick' y setPieceOutcome 'play': una falta a favor que " +
    "el equipo puso en juego en corto. No es una infracción ni un tiro.",
  "SHOT con setPiece 'free_kick': un tiro que el operador declaró procedente de una falta a " +
    "favor. No es la falta cometida, que pertenece al rival.",
  // El resumen determinista traía un bloque `goalkeeper` derivado de
  // player.stats, el modelo anterior a Fase 4, que discrepa del de aquí. Ya no
  // se envía; esta línea le dice al modelo que no lo busque.
  "Portería: la ÚNICA fuente de datos de portero es 'tacticalContext.goalkeepers'. Incluye " +
    "paradas por subtipo, salidas con su resultado, goles encajados y zonas GK1-GK5. El " +
    "resumen determinista no trae datos de portero: no los deduzcas de las estadísticas de " +
    "jugador ni de los eventos crudos.",
  "No infieras relaciones causales ni secuenciales entre FOUL, CORNER, SET_PIECE y SHOT por " +
    "cercanía temporal ni por orden en la lista. La aplicación no registra ningún vínculo " +
    "entre ellos; cualquier cadena que describas sería inventada.",
  "La ausencia de un campo opcional no demuestra que el hecho no ocurriera: significa que no " +
    "se registró. No conviertas datos no registrados en ceros observados ni en afirmaciones " +
    "de que algo no sucedió.",
];

/**
 * El partido sin lo que no es texto analizable.
 *
 * Los logos se guardan como `data:image/...;base64,...` (FileReader en
 * MatchTracker) y pesaban 240 KB de los 327 KB del payload: dos imágenes
 * enviadas a un modelo de texto. `tacticalAnalysis` es la respuesta de la
 * petición ANTERIOR, que MatchTracker guarda en el propio partido: al pulsar
 * REINTENTAR se reenviaba como si fuera un dato del partido, y crecía en cada
 * intento.
 *
 * Los tres campos siguen intactos en el MatchData original, que es el que se
 * guarda, se pinta y se exporta a PDF.
 */
export type TacticalProMatchData = Omit<
  MatchData,
  "teamLogo" | "opponentLogo" | "tacticalAnalysis"
>;

/**
 * El resumen determinista sin el bloque `goalkeeper`.
 *
 * Ese bloque lee `player.stats.saves/conceded` —modelo anterior a Fase 4— y
 * contradice a `tacticalContext.goalkeepers` dentro del mismo prompt. No se
 * corrige aquí ni se toca el dato persistido: simplemente deja de enviarse la
 * cifra que sabemos peor.
 */
export type TacticalProReport = Omit<MatchReport, "goalkeeper">;

/**
 * El informe de portero sin sus dos campos pesados.
 *
 * `events` son GameEvent completos —los MISMOS objetos, mismo `id`, que ya
 * viajan en `matchData.events`— y existen para que la pantalla dibuje los
 * mapas. `timeline` es su reescritura en etiquetas de tiempo. Ningún agregado
 * depende de ellos: todos los contadores vienen ya calculados del helper.
 */
export type TacticalProGoalkeeper = Omit<GoalkeeperReportEntry, "events" | "timeline">;

export type TacticalProContext = {
  /** Fase 4 completa: subtipos de parada, salidas con resultado y GK1-GK5. */
  goalkeepers: TacticalProGoalkeeper[];
  /** Fase 3 y 5: sectores, destino y córners, por bando. */
  zones: { team: ZoneDashboard; opponent: ZoneDashboard };
  glossary: readonly string[];
};

export type TacticalProPayload = {
  /** Contexto del partido, sin imágenes; no es la fuente de métricas. */
  matchData: TacticalProMatchData;
  deterministicReport: TacticalProReport;
  tacticalContext: TacticalProContext;
};

/** Quita del partido lo que no es texto analizable. No muta el original. */
export function projectMatchDataForAI(matchData: MatchData): TacticalProMatchData {
  const { teamLogo, opponentLogo, tacticalAnalysis, ...resto } = matchData;
  return resto;
}

/** Quita del resumen la portería legacy. No muta el original. */
export function projectReportForAI(report: MatchReport): TacticalProReport {
  const { goalkeeper, ...resto } = report;
  return resto;
}

/** Quita de cada portero los eventos crudos duplicados. No muta el original. */
export function projectGoalkeepersForAI(
  entries: GoalkeeperReportEntry[],
): TacticalProGoalkeeper[] {
  return entries.map(({ events, timeline, ...resto }) => resto);
}

/**
 * Contexto completo para una petición de análisis POSTPARTIDO.
 *
 * Determinista: para el mismo `matchData` devuelve siempre lo mismo, venga de
 * la pantalla que venga. Eso es justamente lo que se estaba incumpliendo.
 */
export function buildTacticalProPayload(matchData: MatchData): TacticalProPayload {
  return {
    matchData: projectMatchDataForAI(matchData),
    deterministicReport: projectReportForAI(generateMatchReport(matchData)),
    tacticalContext: {
      goalkeepers: projectGoalkeepersForAI(buildGoalkeeperReports(matchData)),
      zones: {
        team: buildZoneDashboard(matchData, false),
        opponent: buildZoneDashboard(matchData, true),
      },
      glossary: TACTICAL_PRO_GLOSSARY,
    },
  };
}
