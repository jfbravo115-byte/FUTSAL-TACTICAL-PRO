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

  switch (type) {
    // Recuperar es, por definición, el instante en que empieza la transición
    // ofensiva. No se deduce de nada: es lo que significa el botón.
    case ActionType.STEAL:
    case ActionType.INTERCEPTION:
      return "attack_transition";

    // Perderlo, lo simétrico.
    case ActionType.LOSS:
    case ActionType.UNFORCED_ERROR:
      return "defense_transition";

    // Tras un gol se saca del centro, así que la fase siguiente es posicional
    // y el bando lo decide quién marcó: si marcamos nosotros, reanuda el
    // rival y nosotros defendemos.
    case ActionType.GOAL:
    case GoalieAction.GOAL_CONCEDED:
      return isOpponentEvent ? "attack_positional" : "defense_organized";

    // Todo lo demás mantiene la fase. Un tiro no cambia la posesión; el
    // rebote o el saque de puerta sí, y eso lo registra la acción siguiente.
    default:
      return current;
  }
}
