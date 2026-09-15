/**
 * src/components/field/GoalkeeperInterventionMap.tsx
 *
 * Área del portero vista DESDE ARRIBA, dibujada como minicampo: portería con
 * postes y travesaño, línea de gol, área de penalti de fútbol sala (los dos
 * arcos unidos por el tramo recto) y el espacio exterior.
 *
 * Las cinco zonas de profundidad están integradas DENTRO del dibujo, no
 * apiladas como un formulario: las cuatro primeras se recortan contra la
 * silueta del área, así que su forma la define el propio área. La quinta es
 * el exterior, y la diferencia se entiende por el dibujo, no por una línea.
 *
 *   PORTERÍA
 *      ↓  Zona 1  bajo palos
 *      ↓  Zona 2  profundidad corta
 *      ↓  Zona 3  profundidad media
 *      ↓  Zona 4  hasta el límite del área
 *   ── límite del área ──
 *      ↓  Zona 5  fuera del área
 *
 * PROPORCIONES
 * ------------
 * La silueta es la real (dos arcos desde los postes unidos por un tramo
 * recto), pero la PROFUNDIDAD va exagerada respecto a la anchura. A escala
 * métrica exacta el área es mucho más ancha que profunda y las cuatro bandas
 * interiores quedarían por debajo del mínimo táctil en un móvil. Es la misma
 * convención de las pizarras tácticas. No se codifican metros: la app no los
 * registra.
 *
 * GEOMETRÍA ÚNICA
 * ---------------
 * Se exporta para que captura, análisis e informe compartan el mismo dibujo:
 * no hay tres versiones de las cinco zonas.
 */
import React from "react";
import { GoalkeeperInterventionZone } from "../../types/futsal";
import {
  GK_ZONE_DESCRIPTION,
  GK_ZONE_IDS,
  GK_ZONE_LABEL,
  formatGoalkeeperZoneLong,
} from "../../utils/goalkeeperZones";

export type GoalkeeperMapTheme = "dark" | "light";

// ── GEOMETRÍA COMPARTIDA ────────────────────────────────────────────────

export const GK_VIEWBOX = { width: 120, height: 150 } as const;

/** Línea de gol: todo lo que hay debajo es campo. */
const GOAL_LINE_Y = 18;
/** Postes, sobre la línea de gol. */
const POST_LEFT_X = 48;
const POST_RIGHT_X = 72;
/** Profundidad del área. Las cuatro zonas interiores la reparten. */
const AREA_BOTTOM_Y = 94;
const ARC_RX = 44;
const ARC_RY = AREA_BOTTOM_Y - GOAL_LINE_Y;

/**
 * Silueta del área de fútbol sala: cuarto de arco desde cada poste unidos por
 * un tramo recto paralelo a la línea de gol.
 */
export const GK_AREA_PATH = [
  `M ${POST_LEFT_X - ARC_RX},${GOAL_LINE_Y}`,
  `A ${ARC_RX},${ARC_RY} 0 0 0 ${POST_LEFT_X},${AREA_BOTTOM_Y}`,
  `L ${POST_RIGHT_X},${AREA_BOTTOM_Y}`,
  `A ${ARC_RX},${ARC_RY} 0 0 0 ${POST_RIGHT_X + ARC_RX},${GOAL_LINE_Y}`,
  "Z",
].join(" ");

/** Reparto vertical de cada zona, en porcentaje del alto total del dibujo. */
export const GK_BAND_LAYOUT: Record<
  GoalkeeperInterventionZone,
  { top: number; height: number; y: number; h: number }
> = (() => {
  const inner = (AREA_BOTTOM_Y - GOAL_LINE_Y) / 4;
  const pct = (v: number) => (v / GK_VIEWBOX.height) * 100;
  const bands = {} as Record<
    GoalkeeperInterventionZone,
    { top: number; height: number; y: number; h: number }
  >;
  (["GK1", "GK2", "GK3", "GK4"] as const).forEach((id, i) => {
    const y = GOAL_LINE_Y + i * inner;
    bands[id] = { top: pct(y), height: pct(inner), y, h: inner };
  });
  const outsideH = GK_VIEWBOX.height - AREA_BOTTOM_Y;
  bands.GK5 = {
    top: pct(AREA_BOTTOM_Y),
    height: pct(outsideH),
    y: AREA_BOTTOM_Y,
    h: outsideH,
  };
  return bands;
})();

const THEME = {
  dark: {
    turf: "#14532d",
    turfInside: "#166534",
    line: "rgba(255,255,255,0.85)",
    goal: "#e2e8f0",
    text: "#ffffff",
    textMuted: "rgba(255,255,255,0.6)",
    frame: "#1e293b",
  },
  light: {
    turf: "#dcefe1",
    turfInside: "#eaf6ed",
    line: "rgba(22,101,52,0.65)",
    goal: "#475569",
    text: "#14532d",
    textMuted: "#4b5563",
    frame: "#cbd5e1",
  },
} as const;

function withAlpha(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  return `rgba(${parseInt(full.slice(0, 2), 16)}, ${parseInt(full.slice(2, 4), 16)}, ${parseInt(full.slice(4, 6), 16)}, ${alpha})`;
}

let clipSeq = 0;

export type GoalkeeperInterventionMapProps = {
  selectedZone?: GoalkeeperInterventionZone;
  /** Si se pasa, cada zona es pulsable. Un toque selecciona y continúa. */
  onSelect?: (zone: GoalkeeperInterventionZone) => void;
  /** Recuento por zona, para usarlo como mapa de distribución. */
  counts?: Partial<Record<GoalkeeperInterventionZone, number>>;
  theme?: GoalkeeperMapTheme;
  accent?: string;
  compact?: boolean;
  /** Oculta la leyenda de debajo. Útil en espacios muy reducidos. */
  hideLegend?: boolean;
  maxWidth?: number;
  className?: string;
};

export function GoalkeeperInterventionMap({
  selectedZone,
  onSelect,
  counts,
  theme = "dark",
  accent = "#22d3ee",
  compact = false,
  hideLegend = false,
  maxWidth,
  className,
}: GoalkeeperInterventionMapProps) {
  const tokens = THEME[theme];
  const isSelector = typeof onSelect === "function";
  const clipId = React.useMemo(() => `gk-area-clip-${++clipSeq}`, []);
  const max = Math.max(1, ...GK_ZONE_IDS.map((id) => counts?.[id] ?? 0));

  const fillFor = (id: GoalkeeperInterventionZone) => {
    if (selectedZone === id) return withAlpha(accent, 0.85);
    const count = counts?.[id] ?? 0;
    if (count > 0) return withAlpha(accent, 0.2 + Math.min(1, count / max) * 0.6);
    return "transparent";
  };

  return (
    <div
      className={className}
      style={{ width: "100%", maxWidth: maxWidth ?? (compact ? 190 : 300), margin: "0 auto" }}
    >
      <div style={{ position: "relative", width: "100%" }}>
        <svg
          viewBox={`0 0 ${GK_VIEWBOX.width} ${GK_VIEWBOX.height}`}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            borderRadius: 8,
            border: `2px solid ${tokens.frame}`,
            background: tokens.turf,
          }}
          aria-hidden="true"
        >
          <defs>
            <clipPath id={clipId}>
              <path d={GK_AREA_PATH} />
            </clipPath>
          </defs>

          {/* Área rellena: la silueta que hace reconocible el dibujo. */}
          <path d={GK_AREA_PATH} fill={tokens.turfInside} />

          {/* Zonas 1-4, recortadas contra el área: su forma la da el área. */}
          <g clipPath={`url(#${clipId})`}>
            {(["GK1", "GK2", "GK3", "GK4"] as const).map((id) => (
              <rect
                key={id}
                // Marca estable de la región, para poder comprobar en tests
                // que las cinco zonas se dibujan también cuando el mapa es de
                // solo lectura (PDF), donde no hay botones accesibles.
                data-gk-zone={id}
                x={0}
                y={GK_BAND_LAYOUT[id].y}
                width={GK_VIEWBOX.width}
                height={GK_BAND_LAYOUT[id].h}
                fill={fillFor(id)}
              />
            ))}
            {(["GK2", "GK3", "GK4"] as const).map((id) => (
              <line
                key={`sep-${id}`}
                x1={0}
                y1={GK_BAND_LAYOUT[id].y}
                x2={GK_VIEWBOX.width}
                y2={GK_BAND_LAYOUT[id].y}
                stroke={tokens.line}
                strokeWidth={0.4}
                strokeDasharray="2 2"
                opacity={0.5}
              />
            ))}
          </g>

          {/* Zona 5: el exterior del área. */}
          <rect
            data-gk-zone="GK5"
            x={0}
            y={GK_BAND_LAYOUT.GK5.y}
            width={GK_VIEWBOX.width}
            height={GK_BAND_LAYOUT.GK5.h}
            fill={fillFor("GK5")}
          />

          {/* Límite del área, trazo continuo sobre la silueta. */}
          <path d={GK_AREA_PATH} fill="none" stroke={tokens.line} strokeWidth={1.6} />

          {/* Línea de gol. */}
          <line
            x1={0}
            y1={GOAL_LINE_Y}
            x2={GK_VIEWBOX.width}
            y2={GOAL_LINE_Y}
            stroke={tokens.line}
            strokeWidth={1.2}
          />

          {/* Punto de penalti (6 m) y doble penalti (10 m). */}
          <circle cx={60} cy={GOAL_LINE_Y + ARC_RY * 0.34} r={1.1} fill={tokens.line} />
          <circle cx={60} cy={GOAL_LINE_Y + ARC_RY * 0.62} r={1.1} fill={tokens.line} />

          {/* Portería: travesaño y postes, por encima de la línea de gol. */}
          <rect
            x={POST_LEFT_X}
            y={GOAL_LINE_Y - 11}
            width={POST_RIGHT_X - POST_LEFT_X}
            height={11}
            fill={withAlpha("#ffffff", theme === "dark" ? 0.12 : 0.5)}
            stroke={tokens.goal}
            strokeWidth={1.2}
          />
          <rect x={POST_LEFT_X - 1.6} y={GOAL_LINE_Y - 12} width={3.2} height={13} fill={tokens.goal} />
          <rect x={POST_RIGHT_X - 1.6} y={GOAL_LINE_Y - 12} width={3.2} height={13} fill={tokens.goal} />

          {/* Número de zona, dentro del propio campo. */}
          {GK_ZONE_IDS.map((id) => {
            const band = GK_BAND_LAYOUT[id];
            const isSelected = selectedZone === id;
            const count = counts?.[id] ?? 0;
            return (
              <g key={`n-${id}`}>
                <text
                  x={60}
                  y={band.y + band.h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={id === "GK5" ? 11 : 9}
                  fontWeight={900}
                  fill={isSelected ? "#ffffff" : tokens.text}
                  opacity={isSelected ? 1 : 0.75}
                >
                  {GK_ZONE_LABEL[id].replace("Zona ", "")}
                </text>
                {count > 0 && (
                  <text
                    x={GK_VIEWBOX.width - 6}
                    y={band.y + band.h / 2}
                    textAnchor="end"
                    dominantBaseline="central"
                    fontSize={9}
                    fontWeight={900}
                    fill={tokens.text}
                  >
                    {count}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Zonas táctiles: botones HTML reales sobre el dibujo. Más simples
            que la geometría visible, pero accesibles y fáciles de acertar. */}
        {isSelector && (
          <div style={{ position: "absolute", inset: 0 }}>
            {GK_ZONE_IDS.map((id) => {
              const band = GK_BAND_LAYOUT[id];
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={formatGoalkeeperZoneLong(id) ?? GK_ZONE_LABEL[id]}
                  aria-pressed={selectedZone === id}
                  title={formatGoalkeeperZoneLong(id) ?? GK_ZONE_LABEL[id]}
                  onClick={() => onSelect!(id)}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: `${band.top}%`,
                    height: `${band.height}%`,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    WebkitTapHighlightColor: withAlpha(accent, 0.3),
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {!hideLegend && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 1 }}>
          {GK_ZONE_IDS.map((id) => (
            <div
              key={`leg-${id}`}
              style={{
                fontSize: compact ? 7 : 9,
                color: selectedZone === id ? tokens.text : tokens.textMuted,
                fontWeight: selectedZone === id ? 900 : 600,
              }}
            >
              {GK_ZONE_LABEL[id]} · {GK_ZONE_DESCRIPTION[id]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default GoalkeeperInterventionMap;
