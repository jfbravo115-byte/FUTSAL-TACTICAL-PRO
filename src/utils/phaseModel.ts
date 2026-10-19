/**
 * src/utils/phaseModel.ts
 *
 * La fase de juego: qué estamos haciendo, no cuántos somos.
 *
 * POR QUÉ ES UN MÓDULO PURO
 * -------------------------
 * La transición vive fuera de MatchTracker a propósito. Ahí dentro sería una
 * rama más entre ocho mil líneas de captura en vivo, imposible de mutar y de
 * probar por separado; aquí es una función de tres argumentos que se puede
 * fijar con tests y romper a voluntad para comprobar que los tests la
 * protegen.
 *
 * LO QUE ESTE MODELO NO HACE
 * --------------------------
 * No deduce la fase. En el modelo de datos no hay posesión, ni presión, ni
 * transición: deducirla de la zona o del tipo de acción sería inventarla. Solo
 * cambia sola cuando el propio evento la determina por definición:
 *
 *   recuperar el balón ES el inicio de una transición ofensiva
 *   perderlo        ES el inicio de una transición defensiva
 *   encajar un gol  ES una reanudación nuestra desde el centro
 *
 * Todo lo demás —un tiro, una falta, un córner, un cambio— la deja como está.
 * Un córner a favor implica que atacamos, sí, pero si el estado decía otra
 * cosa el automatismo estaría corrigiendo un olvido del operador, y eso ya es
 * inventar.
 *
 * LA FASE DEL EVENTO NO ES EL ESTADO SIGUIENTE
 * -------------------------------------------
 * Son dos cosas distintas y el orden importa. Una pérdida ocurre MIENTRAS
 * atacábamos: el evento se queda con `attack_positional`, y solo DESPUÉS el
 * estado pasa a `defense_transition` para la acción siguiente. Invertirlo
 * produciría datos plausibles y falsos, que es la peor clase de error.
 */
import { ActionType, GoalieAction, PhaseOfPlay } from "../types/futsal";
import { beneficiarySide, isGoalEvent } from "./goalModel";

export const PHASES: readonly PhaseOfPlay[] = [
  "attack_positional",
  "attack_transition",
  "defense_organized",
  "defense_transition",
];

/** Nombre completo. Nunca se abrevia: en directo hay que leerlo de un vistazo. */
export const PHASE_LABEL: Record<PhaseOfPlay, string> = {
  attack_positional: "Ataque posicional",
  attack_transition: "Transición ofensiva",
  defense_organized: "Defensa organizada",
  defense_transition: "Transición defensiva",
};

/** Lo que se lee cuando todavía no se ha declarado ninguna fase. */
export const PHASE_UNSET_LABEL = "Sin registrar";

/** Rótulo de la cabecera de captura, en mayúsculas. */
export function phaseHeaderLabel(phase: PhaseOfPlay | undefined): string {
  return `FASE · ${(phase ? PHASE_LABEL[phase] : PHASE_UNSET_LABEL).toUpperCase()}`;
}

/**
 * Etiqueta para el CSV de acciones.
 *
 * Un evento sin fase deja la celda VACÍA, igual que el resto de columnas
 * opcionales del mismo CSV: escribir «No registrada» convertiría la ausencia
 * en un valor y la haría indistinguible de un dato.
 */
export function phaseCsvLabel(phase: PhaseOfPlay | undefined): string {
  return phase ? PHASE_LABEL[phase] : "";
}

export function isPhaseOfPlay(raw: unknown): raw is PhaseOfPlay {
  return typeof raw === "string" && (PHASES as readonly string[]).includes(raw);
}

/**
 * Fase leída de un origen que no controlamos —un snapshot de otra versión, un
 * JSON importado—. Cualquier valor que no sea una de las cuatro se descarta:
 * un partido antiguo no tiene fase y así debe quedarse.
 */
export function parsePhaseOfPlay(raw: unknown): PhaseOfPlay | undefined {
  return isPhaseOfPlay(raw) ? raw : undefined;
}

export function isAttackPhase(phase: PhaseOfPlay | undefined): boolean {
  return phase === "attack_positional" || phase === "attack_transition";
}

export function isDefensePhase(phase: PhaseOfPlay | undefined): boolean {
  return phase === "defense_organized" || phase === "defense_transition";
}

// ── LOS DOS BOTONES ─────────────────────────────────────────────────────
//
// «Atacamos» y «Defendemos» responden a quién tiene el balón, que es lo único
// que el operador puede afirmar sin dudar mientras el partido corre. Que la
// fase sea posicional o de transición lo pone el automatismo; pulsar el botón
// significa siempre «esto ya está estabilizado».

/** Tras declarar que atacamos, la fase es posicional, se viniera de donde se viniera. */
export function phaseAfterAttackTap(): PhaseOfPlay {
  return "attack_positional";
}

/** Tras declarar que defendemos, la fase es organizada. */
export function phaseAfterDefenseTap(): PhaseOfPlay {
  return "defense_organized";
}

// ── TRANSICIÓN AUTOMÁTICA ───────────────────────────────────────────────

/**
 * Estado que queda PARA LA ACCIÓN SIGUIENTE después de registrar un evento.
 *
 * `current` es la fase que tenía el evento que se acaba de registrar; el
 * evento ya se la ha quedado y esta función no la toca.
 *
 * Con `current` sin definir devuelve `undefined`: mientras el operador no haya
 * declarado la primera fase, ningún automatismo puede inventarla. Un partido
 * entero puede capturarse sin fase, y eso es un dato honesto.
 *
 * `isOpponentEvent` es el bando que EJECUTA la acción, tal y como lo guarda
 * `metadata.isOpponent`. En un gol es quien marca, tanto si llegó como
 * `ActionType.GOAL` del rival como si llegó como `GoalieAction.GOAL_CONCEDED`
 * de nuestro portero: `handleAction` normaliza los dos al mismo bando.
 */
export function nextPhaseAfterEvent(
  type: ActionType | GoalieAction,
  isOpponentEvent: boolean,
  current: PhaseOfPlay | undefined,
): PhaseOfPlay | undefined {
  if (current === undefined) return undefined;

  // La forma mínima que `goalModel` necesita para decidir si esto es un gol y
  // a quién le sube. No se duplica aquí ninguna tabla: el reinicio tras un gol
  // lo gobierna el BENEFICIARIO, y quién es el beneficiario lo sabe un solo
  // módulo.
  const comoGol = { type, metadata: { isOpponent: isOpponentEvent } };

  // Tras cualquier gol se saca del centro, y saca el equipo que lo ENCAJA.
  // Vale igual para un gol en propia, donde quien lo mete y quien puntúa son
  // contrarios: lo que decide la reanudación es quién marcó en el marcador,
  // no quién tocó el balón.
  if (isGoalEvent(comoGol)) {
    return beneficiarySide(comoGol) === "opponent"
      ? "attack_positional" // nos marcaron: sacamos nosotros
      : "defense_organized"; // marcamos: saca el rival
  }

  switch (type) {
    // Recuperar es, por definición, el instante en que empieza una
    // transición. CUÁL de las dos depende de quién recupera: si recupera el
    // rival, el que pasa a defender eres tú.
    case ActionType.STEAL:
    case ActionType.INTERCEPTION:
      return isOpponentEvent ? "defense_transition" : "attack_transition";

    // Perderlo, lo simétrico y por el mismo motivo: una pérdida del rival es
    // un balón que ganamos nosotros. Antes esto no miraba el bando, así que
    // una pérdida rival nos dejaba «defendiendo» justo cuando acabábamos de
    // recuperar. Con las acciones del otro equipo a un toque, ese error
    // pasaba de raro a frecuente.
    case ActionType.LOSS:
    case ActionType.UNFORCED_ERROR:
      return isOpponentEvent ? "attack_transition" : "defense_transition";

    // Todo lo demás mantiene la fase. Un tiro no cambia la posesión; el
    // rebote o el saque de puerta sí, y eso lo registra la acción siguiente.
    default:
      return current;
  }
}
