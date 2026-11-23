/**
 * src/utils/actionSummary.ts
 *
 * La frase que confirma lo que se acaba de registrar. Función pura.
 *
 * PARA QUÉ
 * --------
 * Con los dos equipos accesibles desde la misma pantalla, la pregunta «¿a
 * quién se lo acabo de apuntar?» deja de tener una respuesta obvia. La
 * confirmación la responde en voz alta y SIEMPRE con las mismas cuatro cosas:
 * equipo, jugador, acción y —si es un gol en propia— a quién le suma, que es
 * justo lo contrario de lo que el ojo espera.
 *
 * NO INVENTA NADA
 * ---------------
 * Un evento sin jugador se describe sin jugador. No se rellena con «el
 * portero», ni con el último que tocó, ni con un dorsal cualquiera: en
 * directo hay acciones que no se pueden atribuir y decirlo es más barato que
 * arreglarlo después.
 */
import { ActionType, GameEvent, MatchData, PhaseOfPlay, Player } from "../types/futsal";
import { formatEventTypeLabel } from "./eventLabels";
import { PHASE_LABEL } from "./phaseModel";
import {
  UNKNOWN_SCORER_LABEL,
  actorSide,
  beneficiarySide,
  isOwnGoal,
  sideName,
} from "./goalModel";
import { formatZoneLabel } from "./fieldZones";
import { eventActor } from "./eventActor";
import { playerDisplayIdentity } from "./playerIdentity";
import { SequenceCard, describeSequence, sequenceIdOf } from "./setPieceSequence";

export type ActionSummaryNames = { teamName: string; opponentName: string };

/** `"#7 Pérez"`, o el rótulo de no identificado. */
export function describeActor(
  event: GameEvent,
  players: MatchData["players"],
): string {
  // Misma resolución que el CSV: `utils/eventActor`. Dos criterios distintos
  // para «quién hizo esto» acabarían diciendo cosas distintas del mismo
  // evento, que es justo lo que pasaba antes de centralizarlo.
  const autor = eventActor(event, players || []);
  if (!autor) return UNKNOWN_SCORER_LABEL;
  return `#${autor.number} ${autor.name}`;
}

/**
 * «Registrado: Gol en propia de #7 CD MURCIA · gol para PR7».
 *
 * El prefijo lo pone quien la muestra: así la misma frase sirve para el aviso
 * previo a confirmar y para el posterior.
 */
export function describeRegisteredAction(
  event: GameEvent,
  matchData: Pick<MatchData, "players" | "teamName" | "opponentName"> & {
    events?: GameEvent[];
  },
): string {
  const nombres: ActionSummaryNames = {
    teamName: matchData.teamName || "LOCAL",
    opponentName: matchData.opponentName || "RIVAL",
  };

  // Una jugada a balón parado se confirma ENTERA: tipo, equipo, dónde,
  // cómo, quién saca, quién remata y en qué acabó. Confirmar solo el córner
  // dejaría al operador sin saber si el gol que acaba de anotar se guardó.
  const secuencia = sequenceIdOf(event);
  if (secuencia && matchData.events) {
    const card = describeSequence(matchData.events, secuencia);
    if (card) return describeSequenceCard(card, matchData.players, nombres);
  }
  const equipoAutor = sideName(actorSide(event), nombres);
  const quien = describeActor(event, matchData.players);

  if (isOwnGoal(event)) {
    // Las dos mitades son contrarias a propósito: quien lo mete y quien
    // puntúa. Es el único evento del modelo donde eso pasa, y es donde el
    // operador se equivocaría si solo se dijera una.
    return `${formatEventTypeLabel(event)} de ${quien} (${equipoAutor}) · gol para ${sideName(
      beneficiarySide(event),
      nombres,
    )}`;
  }

  const partes = [`${formatEventTypeLabel(event)} de ${quien}`, equipoAutor];
  const origen = formatZoneLabel(event.originGrid);
  const destino = event.destinationGrid
    ? event.destinationGrid.toUpperCase() === "OUT"
      ? "fuera"
      : event.destinationGrid.toUpperCase()
    : null;
  if (origen && destino) partes.push(`${origen} → ${destino}`);
  else if (origen) partes.push(origen);
  else if (destino) partes.push(`→ ${destino}`);
  return partes.join(" · ");
}

/** La fase en que se registró, para que la confirmación también la enseñe. */
export function describePhase(phase: PhaseOfPlay | undefined): string | null {
  return phase ? PHASE_LABEL[phase] : null;
}

/**
 * ¿Este evento merece una confirmación con «Deshacer»?
 *
 * Los automatismos no: un cambio de formación o una sustitución los provoca
 * el propio operador en un menú y ya ve el resultado. Lo que se confirma es
 * lo que se registra de un toque sobre la pista y puede irse al equipo
 * equivocado.
 */
export function deservesConfirmation(event: GameEvent): boolean {
  return (
    event.type !== ActionType.FORMATION_CHANGE &&
    event.type !== ActionType.SUBSTITUTION
  );
}

/**
 * Una jugada, en una línea.
 *
 * Sacador y finalizador se nombran por separado aunque sean el mismo
 * jugador: decir «saca y remata #7» es un dato, no una redundancia.
 */
export function describeSequenceCard(
  card: SequenceCard,
  players: Player[],
  nombres: ActionSummaryNames,
): string {
  const etiqueta = (id: string | null) => {
    if (!id) return "no identificado";
    const p = players.find((x) => x.id === id);
    if (!p) return "no identificado";
    const ident = playerDisplayIdentity(p, { players, maxCaracteres: 22 });
    return ident.kind === "nombre"
      ? `#${ident.dorsal} ${ident.nombreCompleto}`
      : `#${ident.dorsal} ${ident.etiquetaProvisional}`;
  };
  const partes = [
    `${card.rootLabel} (${card.isOpponent ? nombres.opponentName : nombres.teamName})`,
  ];
  if (card.locationLabel) partes.push(card.locationLabel);
  if (card.modalityLabel) partes.push(card.modalityLabel);
  partes.push(`saca ${etiqueta(card.takerId)}`);
  if (card.outcome === "shot" || card.outcome === "goal" || card.outcome === "loss") {
    partes.push(
      `${card.outcome === "loss" ? "pierde" : "remata"} ${etiqueta(card.finisherId)}`,
    );
  }
  if (card.outcomeLabel) partes.push(card.outcomeLabel);
  return partes.join(" · ");
}
