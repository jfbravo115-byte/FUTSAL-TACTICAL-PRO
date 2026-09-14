/**
 * src/components/export/ZoneHeatGrid.tsx
 *
 * Matriz compacta de zona para el PDF global del equipo (página 3). Extraída
 * de MatchTracker.tsx sin cambio de comportamiento, para poder testearla de
 * forma aislada sin arrastrar la página entera (Firebase, router,
 * animaciones) al entorno de test — mismo criterio que ya se siguió con
 * GoalkeeperMaps y lineupIntegrity.
 *
 * A diferencia de FutsalPitch, aquí NO se dibuja la pista completa: son seis
 * mapas de ~108 px de ancho en una misma página, y a ese tamaño una pista con
 * áreas y porterías sería ilegible. Es deliberadamente una matriz tipo
 * sparkline, pero con la MISMA semántica que el resto del sistema.
 *
 * El sistema espacial lo deciden LOS DATOS: 4×3 para partidos de 12 zonas,
 * 3×3 para históricos, y nunca se convierte de uno al otro.
 *
 * Las celdas no imprimen el identificador interno: los ejes se rotulan en
 * lenguaje natural, que además es lo único legible a este tamaño.
 */
import React from "react";
import { GameEvent } from "../../types/futsal";
import { ZONE_LANES, ZoneBand, isZone12Id, makeZone12 } from "../../utils/fieldZones";
import {
  LEGACY_COLS,
  LEGACY_ROWS,
  classifyZone,
  formatAnyZoneLabel,
  isLegacyZoneId,
} from "../../utils/legacyZoneMap";

const RGB_BY_COLOR: Record<string, string> = {
  "#16a34a": "22,163,74",
  "#2563eb": "37,99,235",
  "#9333ea": "147,51,234",
  "#ea580c": "234,88,12",
  "#dc2626": "220,38,38",
  "#0ea5e9": "14,165,233",
};

export function ZoneHeatGrid({
  events,
  color,
  title,
}: {
  events: GameEvent[];
  color: string;
  title: string;
}) {
  // Histórico SOLO si no hay ni un sector del sistema nuevo. Un partido sin
  // ninguna zona registrada se dibuja con el sistema NUEVO: es lo que la app
  // produce hoy, y presentarlo como rejilla histórica sería mentir sobre el
  // origen del dato.
  const isLegacy =
    !events.some((e) => isZone12Id(e.originGrid?.toUpperCase())) &&
    events.some((e) => isLegacyZoneId(e.originGrid));

  const counts: Record<string, number> = {};
  events.forEach((e) => {
    const ref = classifyZone(e.originGrid);
    if (ref && ref.kind !== "unknown") counts[ref.id] = (counts[ref.id] || 0) + 1;
  });

  const laneLabels = isLegacy ? ["SUP", "CEN", "INF"] : ["IZQ", "CEN", "DER"];
  const bandLabels = isLegacy ? ["1", "2", "3"] : ["1", "2", "3", "4"];
  const nCols = bandLabels.length;

  const cellId = (ri: number, ci: number) =>
    isLegacy
      ? `${LEGACY_ROWS[ri]}${LEGACY_COLS[ci]}`
      : makeZone12((ci + 1) as ZoneBand, ZONE_LANES[ri]);

  const maxC = Math.max(...(Object.values(counts) as number[]), 1);
  const W = 108;
  const H = 74;
  const labelW = 15;
  const bottomH = 9;
  const gridX = labelW;
  const gridY = 2;
  const cW = (W - labelW - 2) / nCols;
  const cH = (H - gridY - bottomH) / 3;
  const rgb = RGB_BY_COLOR[color] || "14,165,233";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div
        style={{
          fontSize: 7,
          fontWeight: 700,
          color,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          textAlign: "center",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 7, color: "#94a3b8" }}>{events.length} eventos</div>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ border: "1px solid #e2e8f0", borderRadius: 4, background: "#f8fafc" }}
      >
        {laneLabels.map((label, ri) => (
          <text
            key={`lane-${label}`}
            x={labelW - 3}
            y={gridY + cH * (ri + 0.5)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize="5"
            fill="#94a3b8"
          >
            {label}
          </text>
        ))}
        {bandLabels.map((label, ci) => (
          <text
            key={`band-${label}`}
            x={gridX + cW * (ci + 0.5)}
            y={H - 2}
            textAnchor="middle"
            fontSize="5"
            fill="#94a3b8"
          >
            {label}
          </text>
        ))}
        {laneLabels.map((_, ri) =>
          bandLabels.map((__, ci) => {
            const zId = cellId(ri, ci);
            const cnt = counts[zId] || 0;
            const intensity = cnt / maxC;
            const x = gridX + ci * cW;
            const y = gridY + ri * cH;
            const fill = cnt === 0 ? "#f8fafc" : `rgba(${rgb},${0.15 + intensity * 0.75})`;
            return (
              <g key={zId} aria-label={formatAnyZoneLabel(zId)}>
                <title>{formatAnyZoneLabel(zId)}</title>
                <rect x={x} y={y} width={cW - 1} height={cH - 1} fill={fill} rx={2} />
                {cnt > 0 && (
                  <text
                    x={x + cW / 2 - 0.5}
                    y={y + cH / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="8"
                    fontWeight="600"
                    fill={intensity > 0.5 ? "white" : color}
                  >
                    {cnt}
                  </text>
                )}
              </g>
            );
          }),
        )}
      </svg>
      <div style={{ fontSize: 6, color: "#94a3b8", textAlign: "center" }}>
        {isLegacy
          ? "Rejilla histórica · franjas 1-3"
          : "◀ portería propia · zonas 1-4 · portería rival ▶"}
      </div>
    </div>
  );
}

export default ZoneHeatGrid;
