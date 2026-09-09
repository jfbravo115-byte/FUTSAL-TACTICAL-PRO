/**
 * src/components/export/GoalkeeperMaps.tsx
 *
 * Extraídos de MatchTracker.tsx (renderPitchOriginMap y el mapa de impacto
 * inline dentro de renderGoalieSection), MISMA lógica de selección de
 * eventos y MISMOS identificadores de zona (A1-C3 origen, G1-G9 destino/
 * OUT) — no se cambia ningún ID ni se inventa ninguna zona nueva. Se
 * extraen para poder reutilizarlos tanto en el informe completo como en
 * el informe independiente de porteros, sin duplicar la lógica.
 */
import React from "react";
import { ActionType, GameEvent, GoalieAction, Player } from "../../types/futsal";

/**
 * Mapa de ORIGEN en pista (A1-C3) de los disparos/intervenciones que
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
}: {
  goalie: Player;
  isOpponent: boolean;
  events: GameEvent[];
  compact?: boolean;
  /** ¿Es este el único portero relevante de su equipo en el partido?
   *  Determina el fallback para eventos legacy sin onPitchPlayerIds.
   *  Por defecto false (conservador: sin esta información, se prefiere
   *  no atribuir eventos legacy ambiguos). */
  isOnlyRelevantGoalkeeper?: boolean;
}) {
  const rows = ["A", "B", "C"];
  const cols = ["1", "2", "3"];
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

  const hasAnyZoneData = goalieEvents.some((e) => e.originGrid);

  return (
    <div
      className={`grid grid-cols-3 grid-rows-3 gap-1 aspect-[2/3] w-full ${compact ? "max-w-[100px]" : "max-w-[140px]"} mx-auto border border-white/10 rounded-lg bg-black/40 p-1 relative overflow-hidden`}
    >
      <div className="absolute inset-0 pointer-events-none opacity-20 flex flex-col">
        <div className="flex-1 border-b border-dashed border-white/30" />
        <div className="flex-1" />
      </div>
      {rows.map((r) =>
        cols.map((c) => {
          const id = `${r}${c}`;
          const count = goalieEvents.filter((e) => e.originGrid === id).length;
          return (
            <div
              key={id}
              className={`relative flex items-center justify-center rounded-sm border ${count > 0 ? (isOpponent ? "bg-red-500/20 border-red-500/30" : "bg-blue-500/20 border-blue-500/30") : "bg-white/[0.02] border-white/5"}`}
            >
              {count > 0 && (
                <span className={`text-[10px] font-black ${isOpponent ? "text-red-400" : "text-blue-400"}`}>
                  {count}
                </span>
              )}
              <span className="absolute bottom-0.5 right-0.5 text-[5px] font-mono opacity-10 text-white uppercase">
                {id}
              </span>
            </div>
          );
        }),
      )}
      {!hasAnyZoneData && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <span className="text-[8px] font-black text-slate-500 uppercase text-center px-2">
            Sin datos registrados
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Mapa de IMPACTO en portería (G1-G9), parada vs gol por zona. Reutiliza
 * la misma selección de eventos (acciones propias del portero) y los
 * mismos identificadores G1-G9 que ya usa la app.
 */
export function GoalkeeperImpactMap({ events }: { events: GameEvent[] }) {
  const hasAnyImpactData = events.some((e) => e.metadata?.zone || e.destinationGrid);

  return (
    <div className="aspect-[3/2] bg-slate-900 rounded-2xl border border-white/5 relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-x-8 bottom-0 top-6 border-x-4 border-t-4 border-white/40 rounded-t-lg" />
      <div className="absolute inset-x-8 bottom-0 h-[2px] bg-white/20" />
      {[...Array(9)].map((_, i) => {
        const zoneId = `G${i + 1}`;
        const zoneEvents = events.filter((e) => e.metadata?.zone === zoneId || e.destinationGrid === zoneId);
        const zoneSaves = zoneEvents.filter(
          (e) => e.type !== GoalieAction.GOAL_CONCEDED && e.type !== ActionType.GOAL,
        ).length;
        const zoneGoals = zoneEvents.filter(
          (e) => e.type === GoalieAction.GOAL_CONCEDED || e.type === ActionType.GOAL,
        ).length;
        const x = (i % 3) * 30 + 20;
        const y = Math.floor(i / 3) * 30 + 25;
        if (zoneSaves === 0 && zoneGoals === 0) return null;
        return (
          <div
            key={zoneId}
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
