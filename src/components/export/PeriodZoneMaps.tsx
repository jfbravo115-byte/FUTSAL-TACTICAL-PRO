/**
 * src/components/export/PeriodZoneMaps.tsx
 *
 * Página "Evolución por periodos" del PDF: las mismas zonas, separadas por
 * parte.
 *
 * LA PREGUNTA QUE RESPONDE
 * ------------------------
 * La portada dice que hubo 9 pérdidas en Zona 2 · centro. No dice si fueron
 * antes o después del descanso, que es justo lo que el cuerpo técnico
 * necesita para saber qué cambió. Aquí se separan por parte tres métricas —
 * pérdidas, recuperaciones y tiros— sobre la misma rejilla.
 *
 * UNA SOLA FUENTE
 * ---------------
 * Todo sale de `buildZoneDashboard(matchData, false, period)`, que ya admitía
 * el periodo y filtra ANTES del mismo motor que alimenta la portada. Aquí no
 * se filtra ni se cuenta ningún evento a mano: si esta página dijera una cifra
 * distinta de la página 1 sería porque alguien montó un segundo recuento, y
 * por eso no hay ninguno.
 *
 * ESCALA COMPARTIDA
 * -----------------
 * Cada pareja de mapas se normaliza contra el MISMO máximo. Sin eso, una
 * primera parte con 6 pérdidas en una zona y una segunda con 3 se pintan
 * idénticas —`FutsalPitch` normaliza contra su propio máximo— y el lector
 * concluye lo contrario de lo que pasó. El máximo es POR MÉTRICA: comparar la
 * intensidad de las pérdidas con la de los tiros no significa nada.
 *
 * LO QUE ESTA PÁGINA NO DICE
 * --------------------------
 * No dice si atacábamos o defendíamos. Ese dato no se registra en ningún
 * campo —no hay posesión, ni fase, ni transición—, así que deducirlo de la
 * zona sería inventarlo. Aquí solo se dice dónde ocurrió cada tipo de acción
 * y en qué parte.
 */
import React from "react";
import { MatchData, Period } from "../../types/futsal";
import { FutsalPitch } from "../field/FutsalPitch";
import {
  ZoneBucket,
  ZoneDashboard,
  buildZoneDashboard,
  primaryBucket,
} from "../../services/matchZonesService";
import { OWN_CAPTIONS } from "./ZoneMapBoard";
import { BASE_PERIODS, periodLabel } from "./PeriodShotMaps";

/** Las tres métricas de la página. `shots` INCLUYE los goles. */
export type PeriodZoneMetric = "losses" | "recoveries" | "shots";

export const PERIOD_ZONE_METRICS: readonly {
  key: PeriodZoneMetric;
  title: string;
  color: string;
}[] = [
  { key: "losses", title: "Pérdidas", color: "#ea580c" },
  { key: "recoveries", title: "Recuperaciones", color: "#9333ea" },
  { key: "shots", title: "Tiros", color: "#2563eb" },
];

/** Un periodo con su dashboard ya construido. No se recalcula nada más. */
export type PeriodZoneColumn = {
  period: number;
  label: string;
  dashboard: ZoneDashboard;
  bucket: ZoneBucket | null;
};

/**
 * Periodos que hay que dibujar.
 *
 * Las dos reglamentarias SIEMPRE, aunque una esté vacía: un mapa a cero es
 * información. Cualquier otro periodo presente en los eventos se añade
 * ordenado, de modo que una prórroga de un partido antiguo se presenta en
 * lugar de perderse — y nunca mezclada dentro de la segunda parte.
 *
 * Mismo criterio que `shotMapPeriods`, aplicado a todas las acciones en vez
 * de solo a los tiros.
 */
export function periodZonePeriods(matchData: MatchData): number[] {
  const extra = new Set<number>();
  for (const e of matchData.events || []) {
    if (typeof e.period !== "number") continue;
    if (e.period === Period.FINISHED) continue;
    if (!BASE_PERIODS.includes(e.period as Period)) extra.add(e.period);
  }
  return [...BASE_PERIODS, ...[...extra].sort((a, b) => a - b)];
}

/** Una columna por periodo, construida con el motor de siempre. */
export function buildPeriodColumns(matchData: MatchData): PeriodZoneColumn[] {
  return periodZonePeriods(matchData).map((period) => {
    const dashboard = buildZoneDashboard(matchData, false, period as Period);
    return {
      period,
      label: periodLabel(period),
      dashboard,
      bucket: primaryBucket(dashboard),
    };
  });
}

/** Recuento por zona de una métrica, listo para `FutsalPitch.counts`. */
export function metricCounts(
  bucket: ZoneBucket | null,
  metric: PeriodZoneMetric,
): Record<string, number> {
  if (!bucket) return {};
  return Object.fromEntries(bucket.zones.map((z) => [z.zone, z[metric]]));
}

/**
 * El máximo que comparten los mapas de UNA métrica.
 *
 * Nunca se comparte entre métricas distintas: pintar las pérdidas con el
 * máximo de los tiros diría que nueve pérdidas son «poco» porque hubo más
 * tiros, que no significa nada.
 */
export function sharedMax(columns: PeriodZoneColumn[], metric: PeriodZoneMetric): number {
  let max = 1;
  for (const col of columns) {
    for (const z of col.bucket?.zones ?? []) {
      if (z[metric] > max) max = z[metric];
    }
  }
  return max;
}

/** Acciones de esa métrica en ese periodo, ubicadas o no. */
export function metricTotal(dashboard: ZoneDashboard, metric: PeriodZoneMetric): number {
  return metric === "shots" ? dashboard.totals.attempts : dashboard.totals[metric];
}

/** Las que se pudieron dibujar. */
export function metricLocated(bucket: ZoneBucket | null, metric: PeriodZoneMetric): number {
  return (bucket?.zones ?? []).reduce((acc, z) => acc + z[metric], 0);
}

/**
 * Acciones de esa métrica sin sector dibujable.
 *
 * En los tiros NO cuentan los penaltis: su origen lo fija el reglamento, no
 * la observación, así que no les falta un dato — se declaran aparte.
 */
export function metricUnlocated(
  dashboard: ZoneDashboard,
  bucket: ZoneBucket | null,
  metric: PeriodZoneMetric,
): number {
  const reglamentarios = metric === "shots" ? dashboard.ruleDetermined : 0;
  return Math.max(
    0,
    metricTotal(dashboard, metric) - metricLocated(bucket, metric) - reglamentarios,
  );
}

/**
 * Acciones UBICADAS que no pertenecen a ninguna de las columnas dibujadas.
 *
 * Se obtiene restando: total global menos la suma de los periodos. Si sale
 * mayor que cero significa que hay eventos con zona cuyo `period` no es
 * ninguno de los listados —típicamente un JSON antiguo sin el campo—, y
 * entonces la página NO puede afirmar que el global es la suma de las partes.
 *
 * Se calcula desde los mismos dashboards: ni un recuento nuevo.
 */
export function unlocatedInTime(
  globalBucket: ZoneBucket | null,
  columns: PeriodZoneColumn[],
  metric: PeriodZoneMetric,
): number {
  const global = metricLocated(globalBucket, metric);
  const porPartes = columns.reduce((acc, c) => acc + metricLocated(c.bucket, metric), 0);
  return Math.max(0, global - porPartes);
}

/** Goles de un periodo. Van DENTRO de los tiros, nunca aparte. */
export function periodGoals(dashboard: ZoneDashboard): number {
  return dashboard.totals.goals;
}

/**
 * ¿Hay algo que dibujar?
 *
 * Un partido histórico de 9 celdas queda fuera: su perspectiva no se
 * registró y rotular «Zona 2 · centro» sería una precisión que el dato no
 * permite. Y un partido moderno sin ninguna de las tres acciones ubicadas
 * tampoco: una página con seis pistas vacías no informa de nada.
 */
export function hasPeriodZoneData(matchData: MatchData): boolean {
  const global = primaryBucket(buildZoneDashboard(matchData, false));
  if (!global || global.system !== "zone12") return false;
  return PERIOD_ZONE_METRICS.some((m) => metricLocated(global, m.key) > 0);
}

// ── COMPONENTE ──────────────────────────────────────────────────────────

const LEYENDA =
  "Mayor intensidad = mayor volumen. La escala se comparte entre las partes de cada fila. No indica eficacia.";

export function PeriodZoneMapsBoard({
  matchData,
  pitchWidth = 300,
}: {
  matchData: MatchData;
  pitchWidth?: number;
}) {
  const columns = buildPeriodColumns(matchData);
  const globalBucket = primaryBucket(buildZoneDashboard(matchData, false));
  // Con prórroga hay más de dos columnas y las pistas tienen que encoger: el
  // alto de la página es fijo y pasarse no recorta, comprime.
  const width = columns.length > 2 ? Math.round(pitchWidth * (2 / columns.length)) : pitchWidth;

  return (
    <div>
      <div style={{ fontSize: 8, color: "#6b7280", marginBottom: 8, lineHeight: 1.4 }}>
        <div>{LEYENDA}</div>
        <div>
          El color compara las partes DENTRO de cada fila; no compares la intensidad de una
          fila con la de otra. Los sectores no se invierten al cambiar de campo: se guardan
          desde la perspectiva del equipo que ejecuta.
        </div>
      </div>

      {PERIOD_ZONE_METRICS.map((metric) => {
        const max = sharedMax(columns, metric.key);
        const sinPeriodo = unlocatedInTime(globalBucket, columns, metric.key);
        const totalGlobal = metricTotal(buildZoneDashboard(matchData, false), metric.key);
        const golesGlobal = periodGoals(buildZoneDashboard(matchData, false));
        return (
          <div key={metric.key} style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: metric.color,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              {metric.title}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
                gap: 14,
              }}
            >
              {columns.map((col) => {
                const total = metricTotal(col.dashboard, metric.key);
                const sinUbicar = metricUnlocated(col.dashboard, col.bucket, metric.key);
                const reglamentarios = metric.key === "shots" ? col.dashboard.ruleDetermined : 0;
                const goles = metric.key === "shots" ? periodGoals(col.dashboard) : null;
                return (
                  <div
                    key={`${metric.key}-${col.period}`}
                    style={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    <div style={{ fontSize: 8, fontWeight: 700, color: "#334155" }}>
                      {col.label} · {total}
                      {goles !== null ? ` · ${goles} gol${goles === 1 ? "" : "es"}` : ""}
                    </div>
                    {(sinUbicar > 0 || reglamentarios > 0) && (
                      <div style={{ fontSize: 8, color: "#94a3b8" }}>
                        {reglamentarios > 0 ? `${reglamentarios} desde el punto de penalti` : ""}
                        {reglamentarios > 0 && sinUbicar > 0 ? " · " : ""}
                        {sinUbicar > 0 ? `${sinUbicar} sin ubicación` : ""}
                      </div>
                    )}
                    <FutsalPitch
                      mode="zone12"
                      theme="light"
                      counts={metricCounts(col.bucket, metric.key)}
                      accent={metric.color}
                      compact
                      maxWidth={width}
                      maxOverride={max}
                      goalCaptions={OWN_CAPTIONS}
                      emptyLabel="Sin acciones ubicadas"
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 8, color: "#6b7280", marginTop: 3 }}>
              Total · {totalGlobal}
              {metric.key === "shots" ? ` · ${golesGlobal} gol${golesGlobal === 1 ? "" : "es"}` : ""}
              {sinPeriodo > 0
                ? ` — ${sinPeriodo} acción(es) con zona sin periodo registrado; el total puede no coincidir con la suma de las partes.`
                : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default PeriodZoneMapsBoard;
