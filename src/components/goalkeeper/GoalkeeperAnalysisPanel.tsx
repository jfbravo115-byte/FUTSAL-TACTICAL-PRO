/**
 * src/components/goalkeeper/GoalkeeperAnalysisPanel.tsx
 *
 * Análisis de UN portero para pantalla. Es la misma lectura que usa el PDF:
 * consume una entrada de `buildGoalkeeperReports()` y no vuelve a contar nada
 * por su cuenta.
 *
 * POR QUÉ EXISTE
 * --------------
 * La ficha de la pestaña "Porteros" leía `player.stats.saves/conceded`, el
 * modelo acumulado anterior a Fase 4. Ese contador no distingue blocaje de
 * despeje, no conoce las salidas y no sabe nada de `goalkeeperZone`, así que
 * la pantalla seguía contando el partido con el vocabulario viejo mientras el
 * PDF ya usaba el nuevo. Un mismo partido, dos versiones. Aquí se corta:
 *
 *     GameEvent → buildGoalkeeperReports() → pantalla
 *                                          → PDF
 *
 * Los tres mapas responden a tres preguntas distintas y sus contadores no se
 * mezclan: desde dónde tiran (12 zonas de pista), dónde termina el balón
 * (portería) y dónde interviene el portero (área, GK1-GK5).
 */
import React from "react";
import { GameEvent, Player } from "../../types/futsal";
import { GoalkeeperReportEntry } from "../../services/goalkeeperReportService";
import { GoalkeeperOriginMap, GoalkeeperImpactMap } from "../export/GoalkeeperMaps";
import { GoalkeeperInterventionMap } from "../field/GoalkeeperInterventionMap";
import { GK_ZONE_DESCRIPTION, GK_ZONE_IDS, GK_ZONE_LABEL } from "../../utils/goalkeeperZones";

export type GoalkeeperAnalysisPanelProps = {
  report: GoalkeeperReportEntry;
  goalie: Player;
  isOpponent: boolean;
  /** Conjunto COMPLETO de eventos: el mapa de origen lo necesita. */
  allEvents: GameEvent[];
  isOnlyRelevantGoalkeeper: boolean;
  /** Ficha estrecha (barra lateral): apila los mapas en vez de alinearlos. */
  compact?: boolean;
};

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone: string;
  hint?: string;
}) {
  return (
    <div
      data-gk-stat={label}
      className="bg-black/20 p-1.5 rounded-xl flex flex-col items-center border border-white/5"
    >
      <span className="text-[7px] font-black text-slate-500 uppercase mb-1 text-center truncate w-full">
        {label}
      </span>
      <span
        data-gk-stat-value={label}
        className={`text-lg font-black ${tone} tabular-nums leading-none`}
      >
        {value}
      </span>
      {hint ? (
        <span className="text-[7px] font-bold text-slate-500 mt-0.5 text-center">{hint}</span>
      ) : null}
    </div>
  );
}

export function GoalkeeperAnalysisPanel({
  report,
  goalie,
  isOpponent,
  allEvents,
  isOnlyRelevantGoalkeeper,
  compact = false,
}: GoalkeeperAnalysisPanelProps) {
  const accent = isOpponent ? "text-rose-400" : "text-blue-400";

  return (
    <div className="flex flex-col gap-3">
      {/* ── RESUMEN ────────────────────────────────────────────────────
          Paradas es el total; blocaje y despeje son su desglose, no
          categorías aparte que haya que sumar. Las salidas van con su
          resultado y NO se cuentan como paradas. */}
      <div className="grid grid-cols-3 gap-1.5">
        <Stat
          label="Paradas"
          value={report.totalSaves}
          tone={accent}
          hint="total, blocajes y despejes incluidos"
        />
        <Stat label="Blocajes" value={report.saveCatch} tone="text-cyan-400" />
        <Stat label="Despejes" value={report.saveDeflect} tone="text-teal-400" />
        <Stat
          label="Salidas"
          value={report.exits}
          tone="text-amber-400"
          hint={
            report.exits > 0
              ? `${report.exitsSuccess} éxito · ${report.exitsFail} fallo`
              : undefined
          }
        />
        <Stat label="G. Enc" value={report.conceded} tone="text-red-500" />
        <Stat label="T. Rec." value={report.shotsAgainst} tone="text-white" />
      </div>

      {report.saveUnspecified > 0 || report.shotsUndeclared > 0 ? (
        <div className="text-[8px] font-bold text-slate-500 leading-tight px-1">
          {report.saveUnspecified > 0
            ? `${report.saveUnspecified} parada(s) sin subtipo registrado. `
            : ""}
          {report.shotsUndeclared > 0
            ? `${report.shotsUndeclared} tiro(s) recibidos sin intervención registrada — no entran en el porcentaje.`
            : ""}
        </div>
      ) : null}

      <div className={compact ? "flex flex-col gap-3" : "grid grid-cols-3 gap-3"}>
        {/* ── MAPA 1 · ORIGEN ───────────────────────────────────────── */}
        <div className="p-3 bg-black/40 rounded-2xl border border-white/5">
          <div className={`text-[8px] font-black ${accent} uppercase tracking-widest mb-2`}>
            Origen de los tiros · pista
          </div>
          <GoalkeeperOriginMap
            goalie={goalie}
            isOpponent={isOpponent}
            events={allEvents}
            isOnlyRelevantGoalkeeper={isOnlyRelevantGoalkeeper}
            compact
          />
        </div>

        {/* ── MAPA 2 · DESTINO ──────────────────────────────────────── */}
        <div className="p-3 bg-black/40 rounded-2xl border border-white/5">
          <div className={`text-[8px] font-black ${accent} uppercase tracking-widest mb-2`}>
            Destino de los tiros · portería
          </div>
          {/* Solo eventos atribuidos a ESTE portero (regla de ownership del
              servicio), nunca "el portero que está ahora en pista". */}
          <GoalkeeperImpactMap events={report.events} />
        </div>

        {/* ── MAPA 3 · ZONAS DE INTERVENCIÓN ────────────────────────── */}
        <div className="p-3 bg-black/40 rounded-2xl border border-white/5">
          <div className={`text-[8px] font-black ${accent} uppercase tracking-widest mb-2`}>
            Zonas de intervención
          </div>
          <GoalkeeperInterventionMap
            counts={report.interventionZones}
            accent={isOpponent ? "#fb7185" : "#22d3ee"}
            hideLegend
            compact
          />
          <div className="mt-2 flex flex-col gap-0.5">
            {GK_ZONE_IDS.map((id) => (
              <div
                key={id}
                data-gk-zone-row={id}
                className="flex items-baseline justify-between gap-2 text-[8px] font-bold text-slate-400"
              >
                <span className="truncate">
                  {GK_ZONE_LABEL[id]} · {GK_ZONE_DESCRIPTION[id]}
                </span>
                <span className="font-black text-slate-200 tabular-nums">
                  {report.interventionZones[id]}
                </span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-2 text-[8px] font-bold text-slate-600 border-t border-white/5 mt-1 pt-1">
              <span>Sin ubicación registrada</span>
              <span className="font-black tabular-nums">{report.interventionsUnlocated}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
