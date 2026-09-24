/**
 * src/components/export/PhaseZoneMaps.tsx
 *
 * Los mapas de la cuarta dimensión: la misma rejilla, separada por FASE.
 *
 * DOS MAPAS POR MÉTRICA, NO VEINTICUATRO
 * --------------------------------------
 * Cuatro fases × cuatro métricas × tres periodos son 48 pistas que nadie lee.
 * Cada métrica contrasta exactamente DOS fases —las suyas— y el periodo se
 * elige fuera, en pantalla. La página del PDF fija el par y no ofrece filtro:
 * un informe no se navega.
 *
 * NADA SE ESCONDE
 * ---------------
 * Los dos mapas no agotan la métrica: hay acciones en fases que no son el par
 * principal y acciones sin fase registrada. Las dos cosas se declaran debajo
 * con su cifra y entran en la línea que cierra el total. Un mapa que no cuadra
 * con su propio total es un mapa que miente por omisión.
 *
 * EL COLOR COMPARA LAS DOS FASES, Y NADA MÁS
 * ------------------------------------------
 * `maxOverride` con el máximo de la métrica: dentro de una fila los tonos son
 * comparables, entre filas no. Nunca mide eficacia.
 */
import React from "react";
import { MatchData, Period } from "../../types/futsal";
import { FutsalPitch } from "../field/FutsalPitch";
import { captionsForRival } from "./ZoneMapBoard";
import {
  PHASE_METRICS,
  PhaseGroup,
  PhaseMetric,
  PhaseMetricKey,
  PhaseSplit,
  formatPhaseCoverage,
  otherPhaseDetail,
  phaseMetric,
  phaseSharedMax,
  phaseSplit,
  reconcilePhaseMetric,
} from "../../utils/phaseAnalysis";

export const PHASE_LEGEND =
  "Mayor intensidad = mayor volumen. La escala se comparte entre las dos fases de la misma fila; no la compares con otra fila. No indica eficacia.";

export const PHASE_PERSPECTIVE_NOTE =
  "La fase es SIEMPRE la de nuestro equipo, también en las acciones del rival. Los sectores no se invierten al cambiar de campo: se guardan desde la perspectiva del equipo que ejecuta.";

/** Las dos páginas del PDF, con las métricas que lleva cada una. */
export const PHASE_PAGES: readonly {
  key: string;
  title: string;
  metrics: readonly PhaseMetricKey[];
}[] = [
  { key: "phases-ball", title: "Pérdidas y recuperaciones", metrics: ["losses", "recoveries"] },
  { key: "phases-finish", title: "Finalización", metrics: ["shots", "rivalShots"] },
];

const muted = (theme: "light" | "dark") => (theme === "light" ? "#6b7280" : "#94a3b8");
const faint = (theme: "light" | "dark") => (theme === "light" ? "#94a3b8" : "#64748b");

/** El pie de un mapa: cuántas, cuántos goles, y qué no se pudo dibujar. */
function groupCaption(grupo: PhaseGroup, metric: PhaseMetric): string {
  const partes = [String(grupo.total)];
  if (metric.key === "shots" || metric.key === "rivalShots") {
    partes.push(`${grupo.goals} gol${grupo.goals === 1 ? "" : "es"}`);
  }
  if (grupo.ruleDetermined > 0) partes.push(`${grupo.ruleDetermined} desde el punto de penalti`);
  if (grupo.unlocated > 0) partes.push(`${grupo.unlocated} sin ubicación`);
  return partes.join(" · ");
}

/**
 * Una métrica: título, sus dos mapas con escala compartida, lo que queda
 * fuera de ellos y la línea que cierra.
 *
 * Es la unidad reutilizable: la usan las dos páginas del PDF y la sección de
 * pantalla, que solo cambian el tema y el ancho de pista.
 */
export function PhaseMetricRow({
  matchData,
  metric,
  period,
  pitchWidth = 300,
  theme = "light",
  showTitle = true,
}: {
  matchData: MatchData;
  metric: PhaseMetric;
  period?: Period;
  pitchWidth?: number;
  theme?: "light" | "dark";
  showTitle?: boolean;
}) {
  const split = phaseSplit(matchData, metric, period);
  const escala = phaseSharedMax(split);
  const otras = otherPhaseDetail(split);

  return (
    <div data-phase-row={metric.key} style={{ marginBottom: 12 }}>
      {showTitle && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: metric.color,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 2,
          }}
        >
          {metric.title}
        </div>
      )}
      <div style={{ fontSize: 8, color: muted(theme), marginBottom: 4 }}>
        Cobertura de fase · {formatPhaseCoverage(split.coverage)}
        {split.coverage.withoutPhase > 0
          ? ` · ${split.coverage.withoutPhase} sin fase registrada`
          : ""}
      </div>
      {/*
        Dos columnas cuando caben y una cuando no, decidido por el ANCHO DEL
        CONTENEDOR y no por el de la ventana: `auto-fit` con un mínimo por
        columna hace que la misma fila se apile sola en un móvil y siga en
        pareja en la página del PDF, que se captura a 794 px con la ventana
        del tamaño que sea. Una media query de viewport miraría la ventana
        real y podría apilar los mapas DENTRO del PDF.
      */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        {[split.a, split.b].map((grupo) => (
          <div
            key={grupo.phase ?? "?"}
            data-phase-map={grupo.phase ?? ""}
            style={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            <div style={{ fontSize: 8, fontWeight: 700, color: theme === "light" ? "#334155" : "#cbd5e1" }}>
              {grupo.label} · {groupCaption(grupo, metric)}
            </div>
            <FutsalPitch
              mode="zone12"
              theme={theme}
              counts={grupo.counts}
              accent={metric.color}
              compact
              maxWidth={pitchWidth}
              maxOverride={escala}
              goalCaptions={captionsForRival(metric.opponent)}
              emptyLabel="Sin acciones ubicadas"
            />
          </div>
        ))}
      </div>
      {otras.length > 0 && (
        <div data-phase-other style={{ fontSize: 8, color: faint(theme), marginTop: 3 }}>
          {split.other.label} · {otras.map((o) => `${o.label} ${o.count}`).join(" · ")}
          {split.other.unlocated > 0 ? ` · ${split.other.unlocated} sin ubicación` : ""}
        </div>
      )}
      {split.unset.total > 0 && (
        <div data-phase-unset style={{ fontSize: 8, color: faint(theme), marginTop: 2 }}>
          {split.unset.label} · {split.unset.total} — no pertenecen a ninguna fase y no se
          reparten entre ellas.
        </div>
      )}
      <div data-phase-reconciliation style={{ fontSize: 8, color: muted(theme), marginTop: 3 }}>
        {reconcilePhaseMetric(split)}
      </div>
    </div>
  );
}

/**
 * Una página de fases: su leyenda y las métricas que le tocan.
 *
 * `metrics` viene de `PHASE_PAGES`, no de aquí: quién va en qué página es una
 * decisión de paginación, y la toma quien monta el informe.
 */
export function PhaseZoneMapsBoard({
  matchData,
  metrics,
  pitchWidth = 300,
  theme = "light",
}: {
  matchData: MatchData;
  metrics: readonly PhaseMetricKey[];
  pitchWidth?: number;
  theme?: "light" | "dark";
}) {
  return (
    <div>
      <div style={{ fontSize: 8, color: muted(theme), marginBottom: 8, lineHeight: 1.4 }}>
        <div>{PHASE_LEGEND}</div>
        <div>{PHASE_PERSPECTIVE_NOTE}</div>
      </div>
      {metrics.map((key) => (
        <PhaseMetricRow
          key={key}
          matchData={matchData}
          metric={phaseMetric(key)}
          pitchWidth={pitchWidth}
          theme={theme}
        />
      ))}
    </div>
  );
}

export { PHASE_METRICS };
export type { PhaseMetric, PhaseSplit };
export default PhaseZoneMapsBoard;
