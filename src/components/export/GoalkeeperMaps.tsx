/**
 * src/components/export/GoalkeeperMaps.tsx
 *
 * Extraídos de MatchTracker.tsx (renderPitchOriginMap y el mapa de impacto
 * inline dentro de renderGoalieSection), MISMA lógica de selección de
 * eventos — la atribución temporal por onPitchPlayerIds no se toca.
 *
 * Lo que sí cambia en Fase 3: el ORIGEN deja de ser una rejilla abstracta y
 * pasa a dibujarse sobre la pista real, en 12 zonas para partidos nuevos y en
 * la rejilla de 9 celdas para los históricos. Los identificadores guardados
 * NO se modifican; lo que cambia es cómo se representan y que dejan de
 * mostrarse en crudo.
 *
 * ORIGEN = pista ("¿desde dónde me tiran?")
 * DESTINO = portería ("¿dónde termina el tiro y qué ocurrió?")
 * Son dos preguntas distintas y siguen siendo dos mapas distintos.
 */
import React from "react";
import { ActionType, GameEvent, GoalieAction, Player } from "../../types/futsal";
import { FutsalPitch, PitchTheme } from "../field/FutsalPitch";
import { isZone12Id } from "../../utils/fieldZones";
import { isLegacyZoneId } from "../../utils/legacyZoneMap";
import { formatGoalZoneLabel } from "../../utils/goalZones";
import { hasGoalZone, isAnySave, isConcededGoal } from "../../services/goalkeeperReportService";

/**
 * Mapa de ORIGEN EN PISTA de los disparos/intervenciones que
 * afectan a este portero. Reutiliza exactamente la misma selección de
 * eventos que la versión original: acciones propias del portero MÁS
 * disparos del equipo rival mientras este portero está en pista.
 *
 * ATRIBUCIÓN TEMPORAL (con 2+ porteros del mismo equipo, la única fuente
 * fiable de "quién estaba en pista en ESE momento" es el propio evento,
 * no el estado final/actual del jugador — goalie.isOnPitch es solo un
 * snapshot del final del partido):
 * 1. Si e.playerIds incluye goalie.id -> el evento es propio del portero,
 *    se cuenta siempre (sin ambigüedad posible).
 * 2. Para un disparo/gol del RIVAL: si el evento trae
 *    e.onPitchPlayerIds, se atribuye SOLO si esa lista incluye
 *    goalie.id (dato real del momento del evento, no el estado actual).
 * 3. LEGACY (evento sin onPitchPlayerIds): no puede saberse con certeza
 *    qué portero de varios estaba en pista. Fallback conservador — ver
 *    prop `isOnlyRelevantGoalkeeper`: si este portero es el ÚNICO
 *    portero relevante de su equipo en todo el partido, no hay
 *    ambigüedad posible y se mantiene el comportamiento legacy
 *    (se cuenta). Si hay 2+ porteros del mismo equipo, NO se atribuye
 *    ese disparo a ninguno de forma individual antes que arriesgarse a
 *    asignarlo al portero equivocado — se prefiere infra-contar a
 *    mal-atribuir. `isOnlyRelevantGoalkeeper` se resuelve fuera de este
 *    componente (quien conoce el conjunto completo de porteros del
 *    partido) y se pasa como prop.
 */
export function GoalkeeperOriginMap({
  goalie,
  isOpponent,
  events,
  compact = false,
  isOnlyRelevantGoalkeeper = false,
  theme = "dark",
}: {
  goalie: Player;
  isOpponent: boolean;
  events: GameEvent[];
  compact?: boolean;
  theme?: PitchTheme;
  /** ¿Es este el único portero relevante de su equipo en el partido?
   *  Determina el fallback para eventos legacy sin onPitchPlayerIds.
   *  Por defecto false (conservador: sin esta información, se prefiere
   *  no atribuir eventos legacy ambiguos). */
  isOnlyRelevantGoalkeeper?: boolean;
}) {
  const RELEVANT_TYPES = new Set<string>([
    GoalieAction.SAVE,
    GoalieAction.SAVE_PARRY,
    GoalieAction.SAVE_CATCH,
    GoalieAction.GOAL_CONCEDED,
    ActionType.SHOT,
    ActionType.GOAL,
  ]);
  const goalieEvents = events.filter((e) => {
    if (!RELEVANT_TYPES.has(e.type)) return false;

    // 1. Evento propio del portero: siempre se cuenta, sin ambigüedad.
    if (e.playerIds.includes(goalie.id)) return true;

    // Evento del rival (equipo contrario al del portero) — candidato a
    // "disparo que este portero pudo encarar".
    const isRivalEvent = (e.metadata?.isOpponent ?? false) !== goalie.isOpponent;
    if (!isRivalEvent) return false;

    // 2. Con onPitchPlayerIds disponible: dato real del momento del
    //    evento — es la fuente de verdad, no goalie.isOnPitch (estado
    //    final del partido).
    if (e.onPitchPlayerIds) {
      return e.onPitchPlayerIds.includes(goalie.id);
    }

    // 3. LEGACY sin onPitchPlayerIds: solo se atribuye si este portero es
    //    el único relevante de su equipo (sin ambigüedad posible).
    return isOnlyRelevantGoalkeeper;
  });

  // Un partido nuevo usa las 12 zonas; uno histórico, la rejilla de 9 celdas.
  // No se convierte entre ambos: se dibuja cada uno en su propia pista.
  const isLegacy =
    !goalieEvents.some((e) => isZone12Id(e.originGrid)) &&
    goalieEvents.some((e) => isLegacyZoneId(e.originGrid));

  const counts: Record<string, number> = {};
  for (const e of goalieEvents) {
    const zone = typeof e.originGrid === "string" ? e.originGrid.toUpperCase() : null;
    if (!zone) continue;
    if (isLegacy ? isLegacyZoneId(zone) : isZone12Id(zone)) {
      counts[zone] = (counts[zone] || 0) + 1;
    }
  }

  return (
    <FutsalPitch
      mode={isLegacy ? "legacy3x3" : "zone12"}
      theme={theme}
      counts={counts}
      accent={isOpponent ? "#ef4444" : "#3b82f6"}
      compact={compact}
      maxWidth={compact ? 200 : 300}
      emptyLabel="Sin datos registrados"
    />
  );
}

/**
 * Mapa de IMPACTO en portería: verde = parada, rojo = gol.
 *
 * Clasifica los eventos con los MISMOS predicados que usa la cabecera de
 * estadísticas (goalkeeperReportService). Antes cada uno tenía su propio
 * criterio, y por eso podían verse círculos verdes bajo un "Blocajes 0 ·
 * Despejes 0": el mapa contaba como parada todo lo que no fuera gol,
 * mientras la cabecera solo miraba los tipos GoalieAction.SAVE*.
 */
export function GoalkeeperImpactMap({ events }: { events: GameEvent[] }) {
  const hasAnyImpactData = events.some(hasGoalZone);

  return (
    <div className="aspect-[3/2] bg-slate-900 rounded-2xl border border-white/5 relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-x-8 bottom-0 top-6 border-x-4 border-t-4 border-white/40 rounded-t-lg" />
      <div className="absolute inset-x-8 bottom-0 h-[2px] bg-white/20" />
      {[...Array(9)].map((_, i) => {
        const zoneId = `G${i + 1}`;
        const zoneEvents = events.filter((e) => e.metadata?.zone === zoneId || e.destinationGrid === zoneId);
        const zoneSaves = zoneEvents.filter(isAnySave).length;
        const zoneGoals = zoneEvents.filter(isConcededGoal).length;
        const x = (i % 3) * 30 + 20;
        const y = Math.floor(i / 3) * 30 + 25;
        if (zoneSaves === 0 && zoneGoals === 0) return null;
        return (
          <div
            key={zoneId}
            title={`${formatGoalZoneLabel(zoneId) ?? ""} — ${zoneSaves} parada(s), ${zoneGoals} gol(es)`}
            className="absolute flex flex-col items-center"
            style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
          >
            <div className="flex gap-1">
              {zoneSaves > 0 && (
                <div className="w-6 h-6 rounded-full bg-green-600 border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-lg">
                  {zoneSaves}
                </div>
              )}
              {zoneGoals > 0 && (
                <div className="w-6 h-6 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-lg">
                  {zoneGoals}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {!hasAnyImpactData && (
        <span className="text-[10px] font-black text-slate-700 uppercase italic">Sin datos registrados</span>
      )}
    </div>
  );
}
