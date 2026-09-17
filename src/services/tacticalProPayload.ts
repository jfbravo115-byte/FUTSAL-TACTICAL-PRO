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
  "SET_PIECE con setPieceOrigin 'free_kick' y setPieceOutcome 'play': una falta a favor que " +
    "el equipo puso en juego en corto. No es una infracción ni un tiro.",
  "SHOT con setPiece 'free_kick': un tiro que el operador declaró procedente de una falta a " +
    "favor. No es la falta cometida, que pertenece al rival.",
  "No infieras relaciones causales ni secuenciales entre FOUL, CORNER, SET_PIECE y SHOT por " +
    "cercanía temporal ni por orden en la lista. La aplicación no registra ningún vínculo " +
    "entre ellos; cualquier cadena que describas sería inventada.",
  "La ausencia de un campo opcional no demuestra que el hecho no ocurriera: significa que no " +
    "se registró. No conviertas datos no registrados en ceros observados ni en afirmaciones " +
    "de que algo no sucedió.",
];

export type TacticalProContext = {
  /** Fase 4 completa: subtipos de parada, salidas con resultado y GK1-GK5. */
  goalkeepers: GoalkeeperReportEntry[];
  /** Fase 3 y 5: sectores, destino y córners, por bando. */
  zones: { team: ZoneDashboard; opponent: ZoneDashboard };
  glossary: readonly string[];
};

export type TacticalProPayload = {
  /** Se mantiene por compatibilidad y como contexto; no es la fuente de métricas. */
  matchData: MatchData;
  deterministicReport: MatchReport;
  tacticalContext: TacticalProContext;
};

/**
 * Contexto completo para una petición de análisis POSTPARTIDO.
 *
 * Determinista: para el mismo `matchData` devuelve siempre lo mismo, venga de
 * la pantalla que venga. Eso es justamente lo que se estaba incumpliendo.
 */
export function buildTacticalProPayload(matchData: MatchData): TacticalProPayload {
  return {
    matchData,
    deterministicReport: generateMatchReport(matchData),
    tacticalContext: {
      goalkeepers: buildGoalkeeperReports(matchData),
      zones: {
        team: buildZoneDashboard(matchData, false),
        opponent: buildZoneDashboard(matchData, true),
      },
      glossary: TACTICAL_PRO_GLOSSARY,
    },
  };
}
