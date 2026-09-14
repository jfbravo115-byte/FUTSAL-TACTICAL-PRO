/**
 * src/components/field/FutsalPitch.tsx
 *
 * Pista de fútbol sala horizontal y reconocible, reutilizable por todos los
 * mapas: selector de captura, mapas de acciones, origen de tiro del portero
 * e informes PDF.
 *
 * ORIENTACIÓN CANÓNICA — siempre la misma, en todos los mapas:
 *
 *   PORTERÍA PROPIA → Zona 1 → Zona 2 → Zona 3 → Zona 4 → PORTERÍA RIVAL
 *        (izquierda)                                          (derecha)
 *
 * El componente NO transforma nada. Como los sectores se guardan ya
 * normalizados a la perspectiva del equipo que ejecuta la acción, dibujar
 * siempre la portería propia a la izquierda es correcto para los dos equipos
 * y para las dos partes, sin espejar ni rotar. Esa es justamente la
 * simplificación que elimina la clase de bugs de rotación que tenía la app.
 *
 * Dentro de cada franja, y desde la perspectiva de quien ataca hacia la
 * derecha, la banda SUPERIOR es su izquierda y la INFERIOR su derecha.
 *
 * La geometría va en estilos inline en lugar de clases utilitarias porque
 * este mismo componente se rasteriza para el PDF (html-to-image), donde
 * conviene no depender de la hoja de estilos de la app.
 */
import React from "react";
import {
  ZONE_BANDS,
  ZONE_LANES,
  Zone12Id,
  ZoneBand,
  ZoneLane,
  formatZoneLabel,
  makeZone12,
} from "../../utils/fieldZones";
import {
  LEGACY_COLS,
  LEGACY_DISCLAIMER,
  LEGACY_ROWS,
  LegacyZoneId,
  formatLegacyLabel,
} from "../../utils/legacyZoneMap";
import { CornerSide, formatCornerLabel } from "../../utils/cornerModel";

export type PitchMode = "zone12" | "legacy3x3";
export type PitchTheme = "dark" | "light";

type Tokens = {
  turf: string;
  turfAlt: string;
  line: string;
  text: string;
  textMuted: string;
  cellIdle: string;
  cellBorder: string;
  notice: string;
};

const THEME: Record<PitchTheme, Tokens> = {
  dark: {
    turf: "#166534",
    turfAlt: "rgba(255,255,255,0.05)",
    line: "rgba(255,255,255,0.7)",
    text: "#ffffff",
    textMuted: "rgba(255,255,255,0.65)",
    cellIdle: "rgba(0,0,0,0.12)",
    cellBorder: "rgba(255,255,255,0.22)",
    notice: "rgba(255,255,255,0.55)",
  },
  light: {
    turf: "#e8f3ea",
    turfAlt: "rgba(22,101,52,0.05)",
    line: "rgba(22,101,52,0.45)",
    text: "#14532d",
    textMuted: "#4b5563",
    cellIdle: "rgba(255,255,255,0.35)",
    cellBorder: "rgba(22,101,52,0.25)",
    notice: "#6b7280",
  },
};

/** Intensidad de relleno proporcional al recuento, sobre el color de acento. */
function heatStyle(count: number, max: number, accent: string): React.CSSProperties {
  if (count <= 0) return {};
  const intensity = max > 0 ? Math.min(1, count / max) : 0;
  return { backgroundColor: withAlpha(accent, 0.18 + intensity * 0.55) };
}

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── DECORADO DE LA PISTA ────────────────────────────────────────────────

function PitchMarkings({ tokens }: { tokens: Tokens }) {
  const line = tokens.line;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.85 }}>
      {/* Franjas de césped */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={`turf-${i}`}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${(i / 8) * 100}%`,
            width: `${100 / 8}%`,
            background: i % 2 === 0 ? tokens.turfAlt : "transparent",
          }}
        />
      ))}
      {/* Línea perimetral */}
      <div style={{ position: "absolute", inset: "4%", border: `2px solid ${line}` }} />
      {/* Línea central */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "4%",
          bottom: "4%",
          width: 2,
          background: line,
          transform: "translateX(-50%)",
        }}
      />
      {/* Círculo central */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "16%",
          aspectRatio: "1 / 1",
          border: `2px solid ${line}`,
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />
      {/* Áreas de 6 m */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "50%",
          height: "46%",
          width: "13%",
          borderTop: `2px solid ${line}`,
          borderRight: `2px solid ${line}`,
          borderBottom: `2px solid ${line}`,
          borderRadius: "0 999px 999px 0",
          transform: "translateY(-50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "4%",
          top: "50%",
          height: "46%",
          width: "13%",
          borderTop: `2px solid ${line}`,
          borderLeft: `2px solid ${line}`,
          borderBottom: `2px solid ${line}`,
          borderRadius: "999px 0 0 999px",
          transform: "translateY(-50%)",
        }}
      />
      {/* Porterías */}
      <div
        style={{
          position: "absolute",
          left: "1%",
          top: "50%",
          height: "22%",
          width: "3%",
          border: `2px solid ${line}`,
          background: withAlpha("#ffffff", 0.18),
          transform: "translateY(-50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "1%",
          top: "50%",
          height: "22%",
          width: "3%",
          border: `2px solid ${line}`,
          background: withAlpha("#ffffff", 0.18),
          transform: "translateY(-50%)",
        }}
      />
      {/* Puntos de penalti */}
      {["14%", "86%"].map((left) => (
        <div
          key={`spot-${left}`}
          style={{
            position: "absolute",
            left,
            top: "50%",
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: line,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}

/** Textos de los dos extremos de la pista. */
export type GoalCaptionTexts = { left: string; right: string };

/**
 * Rótulo por defecto: vale para los mapas de acciones de UN equipo, donde el
 * sector está normalizado a la perspectiva de ese mismo equipo.
 */
export const DEFAULT_GOAL_CAPTIONS: GoalCaptionTexts = {
  left: "Portería propia",
  right: "Portería rival",
};

/**
 * Rótulos de las dos porterías. Van FUERA del recuadro de la pista (que
 * recorta su contenido) y en horizontal: el texto vertical se rasteriza de
 * forma poco fiable al generar el PDF.
 *
 * Los textos son configurables porque "propia/rival" depende de QUIÉN es el
 * sujeto del mapa. En el mapa de origen de tiro de un portero, por ejemplo,
 * los sectores están normalizados a la perspectiva del ATACANTE, así que la
 * portería de la derecha es la que defiende ese portero — llamarla "rival"
 * ahí sería exactamente al revés de lo que lee el entrenador.
 */
function GoalCaptions({
  tokens,
  compact,
  captions,
}: {
  tokens: Tokens;
  compact: boolean;
  captions: GoalCaptionTexts;
}) {
  const base: React.CSSProperties = {
    fontSize: compact ? 7 : 9,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: tokens.textMuted,
  };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, gap: 8 }}>
      <span style={base}>◀ {captions.left}</span>
      <span style={base}>{captions.right} ▶</span>
    </div>
  );
}

// ── MARCADORES DE CÓRNER ────────────────────────────────────────────────
// Un córner ocurre en una esquina, no en una celda: se dibuja en el vértice
// real de la pista y nunca como celda coloreada.

function CornerMarkers({
  corners,
  accent,
  compact,
}: {
  corners: Partial<Record<CornerSide, number>>;
  accent: string;
  compact: boolean;
}) {
  const size = compact ? 16 : 22;
  // Se ataca hacia la derecha: las esquinas ofensivas son las del borde
  // derecho. Arriba es la izquierda del atacante.
  const placement: Record<CornerSide, React.CSSProperties> = {
    left: { right: "3%", top: "6%" },
    right: { right: "3%", bottom: "6%" },
  };

  return (
    <>
      {(["left", "right"] as CornerSide[]).map((side) => {
        const count = corners[side] ?? 0;
        if (count <= 0) return null;
        return (
          <div
            key={side}
            title={`${formatCornerLabel(side)}: ${count}`}
            style={{
              position: "absolute",
              ...placement[side],
              width: size,
              height: size,
              borderRadius: "50%",
              background: accent,
              border: "2px solid #ffffff",
              color: "#ffffff",
              fontSize: compact ? 8 : 10,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
              zIndex: 5,
            }}
          >
            {count}
          </div>
        );
      })}
    </>
  );
}

// ── COMPONENTE PRINCIPAL ────────────────────────────────────────────────

export type FutsalPitchProps = {
  /** `zone12` para datos nuevos, `legacy3x3` para partidos históricos. */
  mode?: PitchMode;
  theme?: PitchTheme;
  /** Recuento por sector. Las claves deben ser del sistema indicado en `mode`. */
  counts?: Record<string, number>;
  /** Si se pasa, las celdas son pulsables (modo selector de captura). */
  onSelect?: (id: string) => void;
  selected?: string;
  /** Córners por lado, dibujados como marcador en el vértice. */
  corners?: Partial<Record<CornerSide, number>>;
  accent?: string;
  compact?: boolean;
  /** Muestra los rótulos de las porterías. Sin sentido en legacy. */
  showGoalCaptions?: boolean;
  /**
   * Textos de los dos extremos. Por defecto "Portería propia / rival", que es
   * lo correcto cuando el mapa representa las acciones del mismo equipo desde
   * cuya perspectiva están normalizados los sectores. Los mapas cuyo sujeto es
   * otro (el de origen de tiro de un portero) deben pasar los suyos.
   */
  goalCaptions?: GoalCaptionTexts;
  /** Texto cuando no hay ningún dato que representar. */
  emptyLabel?: string;
  className?: string;
  maxWidth?: number;
};

export function FutsalPitch({
  mode = "zone12",
  theme = "dark",
  counts,
  onSelect,
  selected,
  corners,
  accent = "#22d3ee",
  compact = false,
  showGoalCaptions,
  goalCaptions = DEFAULT_GOAL_CAPTIONS,
  emptyLabel = "Sin datos registrados",
  className,
  maxWidth,
}: FutsalPitchProps) {
  const tokens = THEME[theme];
  const isLegacy = mode === "legacy3x3";
  const isSelector = typeof onSelect === "function";

  // En legacy no se rotulan las porterías: la perspectiva no se registró y
  // afirmar cuál era la propia sería inventarla.
  //
  // `compact` NO las suprime. Antes sí lo hacía, y el efecto era que el mapa
  // que más necesita identificar las porterías — el de origen de tiro del
  // portero, que se dibuja compacto — era justamente el único que se quedaba
  // sin ellas. Compacto solo reduce el tamaño del texto.
  const withCaptions = showGoalCaptions ?? !isLegacy;

  const cells: { id: string; label: string }[] = isLegacy
    ? LEGACY_ROWS.flatMap((row) =>
        LEGACY_COLS.map((col) => {
          const id = `${row}${col}` as LegacyZoneId;
          return { id, label: formatLegacyLabel(id) ?? "" };
        }),
      )
    : // Se recorre por carriles (filas) y dentro por franjas (columnas) para
      // que el orden del DOM coincida con la rejilla 4×3 dibujada.
      ZONE_LANES.flatMap((lane: ZoneLane) =>
        ZONE_BANDS.map((band: ZoneBand) => {
          const id = makeZone12(band, lane) as Zone12Id;
          return { id, label: formatZoneLabel(id) ?? "" };
        }),
      );

  const values = cells.map((c) => counts?.[c.id] ?? 0);
  const max = Math.max(...values, 1);
  const totalCounted = values.reduce((a, b) => a + b, 0);
  const cornerTotal = (corners?.left ?? 0) + (corners?.right ?? 0);
  const hasData = counts ? totalCounted + cornerTotal > 0 : true;

  return (
    <div className={className} style={{ maxWidth: maxWidth ?? (compact ? 220 : 420), margin: "0 auto" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 2",
          borderRadius: 10,
          overflow: "hidden",
          background: tokens.turf,
          border: `3px solid ${theme === "dark" ? "#1e293b" : "#cbd5e1"}`,
        }}
      >
        <PitchMarkings tokens={tokens} />

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${isLegacy ? 3 : 4}, 1fr)`,
            gridTemplateRows: "repeat(3, 1fr)",
            gap: 2,
            padding: 3,
          }}
        >
          {cells.map((cell, index) => {
            const count = values[index];
            const isSelected = selected === cell.id;
            const commonStyle: React.CSSProperties = {
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              border: `1px solid ${isSelected ? "#ffffff" : tokens.cellBorder}`,
              background: isSelected ? withAlpha(accent, 0.75) : tokens.cellIdle,
              color: tokens.text,
              fontSize: compact ? 10 : 13,
              fontWeight: 900,
              ...(isSelected ? {} : heatStyle(count, max, accent)),
            };

            const content = count > 0 ? count : "";

            return isSelector ? (
              <button
                key={cell.id}
                type="button"
                aria-label={cell.label}
                title={cell.label}
                onClick={() => onSelect!(cell.id)}
                style={{ ...commonStyle, cursor: "pointer", padding: 0 }}
              >
                {content}
              </button>
            ) : (
              <div key={cell.id} aria-label={cell.label} title={cell.label} style={commonStyle}>
                {content}
              </div>
            );
          })}
        </div>

        {corners && <CornerMarkers corners={corners} accent={accent} compact={compact} />}

        {!hasData && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.45)",
              color: "#e2e8f0",
              fontSize: compact ? 9 : 11,
              fontWeight: 900,
              textTransform: "uppercase",
              textAlign: "center",
              padding: "0 12px",
            }}
          >
            {emptyLabel}
          </div>
        )}
      </div>

      {withCaptions && <GoalCaptions tokens={tokens} compact={compact} captions={goalCaptions} />}

      {isLegacy && (
        <div style={{ fontSize: compact ? 7 : 9, color: tokens.notice, marginTop: 4, textAlign: "center" }}>
          {LEGACY_DISCLAIMER}
        </div>
      )}
    </div>
  );
}

export default FutsalPitch;
