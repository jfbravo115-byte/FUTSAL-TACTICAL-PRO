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
  // VOLUMEN POR ZONA. El PDF pintaba un «22» en una celda y nada explicaba
  // qué agregaba. El modelo recibe además el desglose, pero nada le decía que
  // `total` no es la suma de las categorías ni que los goles ya van dentro de
  // los tiros. Se declara aquí, con el mismo detalle que el resto.
  "Volumen por zona: 'tacticalContext.zones.<team|opponent>.zone12.zones[].total' (y su " +
    "equivalente en 'legacy') es el número TOTAL de eventos de ESE equipo cuyo sector de " +
    "origen el sistema reconoce en esa zona. Es un recuento de eventos ubicados, no una " +
    "suma de categorías.",
  "Volumen por zona, el resto: 'total' NO es necesariamente igual a " +
    "shots + losses + recoveries + fouls + corners. Puede incluir otros eventos ubicados que " +
    "no tienen categoría propia: jugadas de falta (SET_PIECE), paradas (SAVE, SAVE_CATCH, " +
    "SAVE_DEFLECT, SAVE_PARRY) y salidas (EXIT) con sector registrado. Si te salen las " +
    "cuentas cortas, es ese resto: no es un error ni una contradicción y no lo presentes " +
    "como tal.",
  "Volumen por zona, tiros y goles: 'goals' está INCLUIDO dentro de 'shots'. NO sumes " +
    "shots + goals: contarías los goles dos veces. Dilo como «N tiros, de los que G fueron " +
    "gol».",
  "Volumen por zona, de quién: 'zones.team' y 'zones.opponent' son dashboards SEPARADOS y " +
    "cada uno contiene solo las acciones de su propio equipo, con sus sectores normalizados " +
    "a SU perspectiva. Las faltas de 'zones.team' son las que ese equipo COMETE, no las que " +
    "recibe. No los sumes ni los compares celda a celda como si fueran el mismo campo.",
  "Volumen por zona, el color: el PDF pinta cada celda con una intensidad relativa al " +
    "máximo de ESE partido. Es solo presentación: no viaja en estos datos, no forma parte de " +
    "ninguna métrica y no significa eficacia, rendimiento ni peligro. Un volumen alto puede " +
    "ser la zona donde más balones se pierden.",
  "Tiro directo de córner: un evento CORNER con setPieceOutcome 'shot'. Significa que ese " +
    "córner se ejecutó directamente hacia portería. NO crea ningún tiro ni suma a los tiros.",
  "Tiro procedente de córner: un evento SHOT con setPiece 'corner'. Es un tiro que el " +
    "operador declaró como procedente de un córner. Es un registro INDEPENDIENTE del " +
    "anterior: no se suman entre sí, ninguno implica al otro y pueden no coincidir.",
  "FOUL: infracción COMETIDA por el equipo indicado en el evento. Las faltas recibidas son " +
    "las que comete el rival. Una falta no describe cómo se reanudó el juego.",
  // CUATRO CIFRAS DE FALTAS CONVIVEN AQUÍ Y MIDEN COSAS DISTINTAS.
  //
  // Mientras el informe copiaba el contador en vivo, el total del partido y el
  // contador reglamentario eran el MISMO número, y este glosario lo decía así.
  // Desde que el informe deriva las faltas de los eventos ya no lo son:
  // `deterministicReport.fouls` es el TOTAL y `periodFoulCounter` es el
  // contador que se reinicia. Se declaran por separado, cada uno con su nombre
  // de campo, porque confundirlos es justo el error que se quiere evitar.
  "Faltas, TOTAL DEL PARTIDO: 'deterministicReport.fouls' es el total de TODO el partido, " +
    "con la forma {team, opponent}, derivado EXCLUSIVAMENTE de los eventos FOUL " +
    "persistidos. 'deterministicReport.teamTotals.fouls' es ese mismo total propio del " +
    "partido y coincide con 'deterministicReport.fouls.team' cuando hay cobertura de " +
    "eventos FOUL. Ambas cifras SÍ son el total del partido y debes presentarlas como tal.",
  "Faltas, DESGLOSE POR PERIODO: 'deterministicReport.foulsByPeriod' trae, por cada periodo " +
    "con faltas, las cometidas por AMBOS equipos con la forma {period, team, opponent}. Es " +
    "la fuente para afirmaciones del tipo «cometió 5 faltas en la primera parte y 2 en la " +
    "segunda». 'periodStats[].fouls' y 'periodStats[].opponentFouls' repiten esas mismas " +
    "cifras por periodo, propias y del rival.",
  "Faltas, CONTADOR REGLAMENTARIO: 'deterministicReport.periodFoulCounter' —y su gemelo " +
    "'matchData.fouls'— es el contador acumulado del PERIODO, el que dispara la sanción de " +
    "la 6ª falta. Puede REINICIARSE al cambiar de periodo, así que al acabar el partido " +
    "refleja solo el último periodo. NO es el total del partido: no lo presentes como tal, " +
    "no lo sumes al total y no lo compares con él como si fuera una contradicción. Que sea " +
    "menor que el total, o que valga 0 habiendo eventos FOUL, significa únicamente que esas " +
    "faltas se cometieron en un periodo anterior y el contador ya se reinició.",
  "Faltas, COBERTURA: 'deterministicReport.hasFoulEvents' dice si existe evidencia FOUL " +
    "suficiente para reconstruir el desglose. Si es false, el total y el desglose por " +
    "periodo NO están disponibles: dilo así y NO inventes total histórico, distribución " +
    "por periodos ni acumulación previa. En ese caso 'periodFoulCounter' puede existir como " +
    "último contador reglamentario registrado y sigue SIN ser el total del partido. No " +
    "deduzcas faltas de PlayerStats, de los dobles penaltis, de los goles, de las tarjetas, " +
    "del texto narrativo ni de las zonas.",
  "Doble penalti: 'setPiece' con valor 'double_penalty' describe la PROCEDENCIA de un tiro " +
    "o de un gol, no una infracción. El evento FOUL es la falta cometida y es un registro " +
    "distinto: un doble penalti NO equivale a un nuevo evento FOUL ni lo implica. No " +
    "reconstruyas el número de faltas a partir del número de dobles penaltis.",
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
