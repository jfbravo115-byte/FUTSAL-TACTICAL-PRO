/**
 * src/components/field/GoalkeeperInterventionMap.tsx
 *
 * Mapa del área del portero, visto desde arriba y SIEMPRE en la misma
 * orientación: portería arriba, campo hacia abajo. Dividido por profundidad
 * en cinco bandas.
 *
 * Es un dominio propio, no la pista de 12 zonas: aquí no importa el avance
 * hacia la portería rival, sino a qué distancia de la suya interviene el
 * portero.
 *
 *   Zona 1  bajo palos
 *   Zona 2  dentro del área, profundidad corta
 *   Zona 3  dentro del área, profundidad media
 *   Zona 4  zona avanzada, hasta el límite del área
 *   ──────  límite del área
 *   Zona 5  fuera del área
 *
 * Las proporciones son visuales y tácticas: la app no registra metros y
 * fingirlos sería inventar precisión. Lo único que el dibujo afirma es que la
 * Zona 4 termina justo en el límite del área y la Zona 5 queda fuera.
 *
 * Geometría en estilos inline porque este mismo componente se rasteriza para
 * el PDF, donde no conviene depender de la hoja de estilos de la app.
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

/**
 * Alto relativo de cada banda. Suman 100. La Zona 1 es estrecha (bajo palos)
 * y la 5 amplia (todo el exterior); el límite del área cae entre la 4 y la 5.
 */
const BAND_HEIGHT: Record<GoalkeeperInterventionZone, number> = {
  GK1: 14,
  GK2: 18,
  GK3: 20,
  GK4: 22,
  GK5: 26,
};

/** Las cuatro primeras zonas están DENTRO del área. */
const INSIDE_BOX: readonly GoalkeeperInterventionZone[] = ["GK1", "GK2", "GK3", "GK4"];

const THEME = {
  dark: {
    turf: "#0f3d24",
    turfOutside: "#0b2a19",
    line: "rgba(255,255,255,0.75)",
    text: "#ffffff",
    textMuted: "rgba(255,255,255,0.6)",
    idle: "rgba(255,255,255,0.05)",
    border: "rgba(255,255,255,0.18)",
    frame: "#1e293b",
  },
  light: {
    turf: "#e8f3ea",
    turfOutside: "#f1f5f2",
    line: "rgba(22,101,52,0.5)",
    text: "#14532d",
    textMuted: "#4b5563",
    idle: "rgba(255,255,255,0.4)",
    border: "rgba(22,101,52,0.22)",
    frame: "#cbd5e1",
  },
} as const;

function withAlpha(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type GoalkeeperInterventionMapProps = {
  selectedZone?: GoalkeeperInterventionZone;
  /** Si se pasa, cada banda es pulsable. Un toque selecciona y continúa. */
  onSelect?: (zone: GoalkeeperInterventionZone) => void;
  /** Recuento por zona, para usarlo como mapa de distribución. */
  counts?: Partial<Record<GoalkeeperInterventionZone, number>>;
  theme?: GoalkeeperMapTheme;
  accent?: string;
  compact?: boolean;
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
  maxWidth,
  className,
}: GoalkeeperInterventionMapProps) {
  const tokens = THEME[theme];
  const isSelector = typeof onSelect === "function";
  const max = Math.max(1, ...GK_ZONE_IDS.map((id) => counts?.[id] ?? 0));

  return (
    <div
      className={className}
      style={{ maxWidth: maxWidth ?? (compact ? 200 : 300), margin: "0 auto", width: "100%" }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 4",
          borderRadius: 10,
          overflow: "hidden",
          border: `3px solid ${tokens.frame}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {GK_ZONE_IDS.map((id) => {
          const count = counts?.[id] ?? 0;
          const isSelected = selectedZone === id;
          const intensity = counts ? Math.min(1, count / max) : 0;
          const inside = INSIDE_BOX.includes(id);

          const background = isSelected
            ? withAlpha(accent, 0.8)
            : count > 0
              ? withAlpha(accent, 0.18 + intensity * 0.55)
              : inside
                ? tokens.turf
                : tokens.turfOutside;

          const label = GK_ZONE_LABEL[id];
          const aria = formatGoalkeeperZoneLong(id) ?? label;

          const common: React.CSSProperties = {
            flexGrow: BAND_HEIGHT[id],
            flexBasis: 0,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background,
            color: tokens.text,
            border: "none",
            // El límite del área: la Zona 4 termina aquí y la 5 queda fuera.
            borderBottom: id === "GK4" ? `2px solid ${tokens.line}` : "none",
            borderTop: `1px solid ${tokens.border}`,
            padding: 0,
            // Área táctil cómoda incluso en la banda más estrecha.
            minHeight: compact ? 26 : 40,
          };

          const content = (
            <>
              <span
                style={{
                  fontSize: compact ? 9 : 11,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {label}
              </span>
              {!compact && (
                <span style={{ fontSize: 8, color: tokens.textMuted, textAlign: "center" }}>
                  {GK_ZONE_DESCRIPTION[id]}
                </span>
              )}
              {count > 0 && (
                <span
                  style={{
                    position: "absolute",
                    right: 6,
                    fontSize: compact ? 11 : 14,
                    fontWeight: 900,
                  }}
                >
                  {count}
                </span>
              )}
            </>
          );

          return isSelector ? (
            <button
              key={id}
              type="button"
              aria-label={aria}
              aria-pressed={isSelected}
              title={aria}
              onClick={() => onSelect!(id)}
              style={{ ...common, cursor: "pointer" }}
            >
              {content}
            </button>
          ) : (
            <div key={id} aria-label={aria} title={aria} style={common}>
              {content}
            </div>
          );
        })}

        {/* Portería, arriba: fija la orientación de un vistazo. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "46%",
            height: 6,
            background: tokens.line,
            borderBottomLeftRadius: 3,
            borderBottomRightRadius: 3,
            pointerEvents: "none",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
          fontSize: compact ? 7 : 9,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: tokens.textMuted,
        }}
      >
        <span>▲ Portería</span>
        <span>Fuera del área ▼</span>
      </div>
    </div>
  );
}

export default GoalkeeperInterventionMap;
