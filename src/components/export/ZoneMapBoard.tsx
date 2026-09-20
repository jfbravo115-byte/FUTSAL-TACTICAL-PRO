/**
 * src/components/export/ZoneMapBoard.tsx
 *
 * Página "Mapas de zona del partido" del PDF Global del equipo.
 *
 * Sustituye a las seis matrices abstractas anteriores por seis pistas de
 * fútbol sala reconocibles, reutilizando FutsalPitch — aquí NO se dibuja
 * ninguna geometría de pista propia, es el mismo componente que usan la
 * captura, el análisis y el informe de portero.
 *
 * LEGIBILIDAD POR ENCIMA DE COMPACIDAD
 * ------------------------------------
 * Seis pistas no caben legibles junto a los perfiles circulares, así que
 * ocupan una página entera en 2 columnas × 3 filas. El presupuesto de altura
 * está calculado abajo y verificado por test: si la página creciera por
 * encima del alto A4, `addImage` la comprimiría verticalmente en lugar de
 * recortarla, y los mapas saldrían deformados.
 *
 * PERSPECTIVA
 * -----------
 * Los sectores se guardan normalizados a la perspectiva del equipo que
 * ejecuta la acción. Por eso los mapas de acciones RIVALES (goles encajados,
 * tiros recibidos) llevan sus propios rótulos: en ellos el extremo derecho es
 * NUESTRA portería, no la rival. Rotularlos con el texto por defecto diría lo
 * contrario de lo que ocurre.
 */
import React from "react";
import { ActionType, GameEvent, GoalieAction } from "../../types/futsal";
import { FutsalPitch, GoalCaptionTexts } from "../field/FutsalPitch";
import { isZone12Id } from "../../utils/fieldZones";
import { LEGACY_DISCLAIMER, classifyZone, isLegacyZoneId } from "../../utils/legacyZoneMap";

// ── PRESUPUESTO DE LA PÁGINA ────────────────────────────────────────────
// A4 a 96 dpi. La captura se inserta con addImage(..., pdfW, imgH) donde
// imgH = min(pdfH, pdfW * aspect): si el contenido supera el alto A4, la
// página NO se recorta, se comprime. De ahí que el ajuste se compruebe.

export const ZONE_MAP_PAGE = {
  PAGE_W: 794,
  PAGE_H: 1123,
  PADDING: 40,
  COLS: 2,
  ROWS: 3,
  GAP: 18,
  /** Cabecera oscura del informe: padding 40 + contenido ~50 + margen 24. */
  HEADER_H: 120,
  /** Título de sección más su línea de contexto. */
  SECTION_H: 44,
  FOOTER_H: 44,
  /** Ancho máximo de cada pista dentro de su columna (~79 mm impresos). */
  PITCH_W: 300,
  /** Título del mapa + contador de eventos + rótulos de portería + huecos. */
  MAP_CHROME_H: 50,
} as const;

/** Alto de un bloque de mapa: pista (aspecto 3/2) más su texto. */
export const zoneMapBlockHeight = (): number =>
  Math.round(ZONE_MAP_PAGE.PITCH_W / 1.5) + ZONE_MAP_PAGE.MAP_CHROME_H;

/** Alto que ocupa la rejilla completa de 3 filas. */
export const zoneMapGridHeight = (): number =>
  zoneMapBlockHeight() * ZONE_MAP_PAGE.ROWS + ZONE_MAP_PAGE.GAP * (ZONE_MAP_PAGE.ROWS - 1);

/** Alto disponible para la rejilla, descontando márgenes, cabecera y pie. */
export const zoneMapAvailableHeight = (): number =>
  ZONE_MAP_PAGE.PAGE_H -
  ZONE_MAP_PAGE.PADDING * 2 -
  ZONE_MAP_PAGE.HEADER_H -
  ZONE_MAP_PAGE.SECTION_H -
  ZONE_MAP_PAGE.FOOTER_H;

/** Ancho de columna disponible, para comprobar que la pista cabe a lo ancho. */
export const zoneMapColumnWidth = (): number =>
  (ZONE_MAP_PAGE.PAGE_W -
    ZONE_MAP_PAGE.PADDING * 2 -
    ZONE_MAP_PAGE.GAP * (ZONE_MAP_PAGE.COLS - 1)) /
  ZONE_MAP_PAGE.COLS;

// ── LOS SEIS MAPAS ──────────────────────────────────────────────────────

export type ZoneMapDef = {
  key: string;
  title: string;
  color: string;
  /** ¿Las acciones son del equipo rival? Determina los rótulos de portería. */
  isRivalAction: boolean;
  events: GameEvent[];
};

export const OWN_CAPTIONS: GoalCaptionTexts = { left: "Portería propia", right: "Portería rival" };
export const RIVAL_CAPTIONS: GoalCaptionTexts = { left: "Ataque rival", right: "Nuestra portería" };

/** Rótulos de portería según de quién sea la acción. Punto único. */
export function captionsForRival(isRivalAction: boolean): GoalCaptionTexts {
  return isRivalAction ? RIVAL_CAPTIONS : OWN_CAPTIONS;
}

export function captionsFor(def: ZoneMapDef): GoalCaptionTexts {
  return captionsForRival(def.isRivalAction);
}

/**
 * Los seis mapas del PDF Global, con exactamente la misma selección de
 * eventos que tenía la versión de matrices — solo cambia cómo se dibujan.
 */
export function buildZoneMaps(events: GameEvent[]): ZoneMapDef[] {
  const own = events.filter((e) => !e.metadata?.isOpponent);
  const rival = events.filter((e) => !!e.metadata?.isOpponent);

  return [
    {
      key: "goles",
      title: "Goles",
      color: "#16a34a",
      isRivalAction: false,
      events: own.filter((e) => e.type === ActionType.GOAL),
    },
    {
      key: "tiros",
      title: "Tiros",
      color: "#2563eb",
      isRivalAction: false,
      events: own.filter((e) => e.type === ActionType.SHOT),
    },
    {
      key: "recuperaciones",
      title: "Recuperaciones",
      color: "#9333ea",
      isRivalAction: false,
      events: own.filter(
        (e) => e.type === ActionType.STEAL || e.type === ActionType.INTERCEPTION,
      ),
    },
    {
      key: "perdidas",
      title: "Pérdidas",
      color: "#ea580c",
      isRivalAction: false,
      events: own.filter(
        (e) => e.type === ActionType.LOSS || e.type === ActionType.UNFORCED_ERROR,
      ),
    },
    {
      key: "goles-encajados",
      title: "Goles encajados",
      color: "#dc2626",
      isRivalAction: true,
      events: rival.filter(
        (e) => e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED,
      ),
    },
    {
      key: "tiros-recibidos",
      title: "Tiros recibidos",
      color: "#0ea5e9",
      isRivalAction: true,
      // Los tiros DEL RIVAL, exactamente igual que el mapa «Tiros» son los
      // nuestros: mismo criterio a los dos lados, y los goles encajados van
      // en su propio mapa igual que nuestros goles.
      //
      // Antes se incluían además nuestras paradas (isAnySave). La intención
      // era cubrir los tiros detenidos, pero una parada registrada desde el
      // radial del portero es un evento NUESTRO —metadata.isOpponent false—
      // y por tanto nunca llegaba a este filtro; lo que sí entraba eran los
      // tiros rivales que el fallback histórico interpreta como parada, ya
      // contados por ser SHOT. El resultado fue un mapa con 1 tiro recibido
      // en un partido con 12 remates afrontados por nuestros porteros.
      //
      // Una parada sin tiro rival registrado sigue estando en el informe de
      // portero. NO se dibuja aquí como tiro: no sabemos desde dónde se hizo
      // ni si hubo remate, e inventarlo sería fabricar datos.
      events: rival.filter((e) => e.type === ActionType.SHOT),
    },
  ];
}

/**
 * ¿El partido usa la rejilla histórica? Se decide con TODOS los eventos, no
 * mapa a mapa, para que los seis hablen el mismo idioma espacial. Histórico
 * solo si no hay ni un sector del sistema nuevo — un partido sin zonas
 * registradas se presenta con el sistema nuevo, que es lo que la app produce
 * hoy.
 */
export function isLegacyMatch(events: GameEvent[]): boolean {
  return (
    !events.some((e) => isZone12Id(e.originGrid?.toUpperCase())) &&
    events.some((e) => isLegacyZoneId(e.originGrid))
  );
}

/** Recuento por sector, sin convertir nunca entre sistemas. */
export function countZones(events: GameEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    const ref = classifyZone(e.originGrid);
    if (ref && ref.kind !== "unknown") counts[ref.id] = (counts[ref.id] || 0) + 1;
  }
  return counts;
}

// ── COMPONENTE ──────────────────────────────────────────────────────────

export function ZoneMapBoard({ events }: { events: GameEvent[] }) {
  const maps = buildZoneMaps(events);
  const legacy = isLegacyMatch(events);

  return (
    <div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 4,
        }}
      >
        Mapas de zona del partido
      </div>
      <div style={{ fontSize: 8, color: "#94a3b8", marginBottom: 12 }}>
        {legacy
          ? LEGACY_DISCLAIMER
          : "Cada pista se lee desde la perspectiva del equipo que ejecuta la acción."}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${ZONE_MAP_PAGE.COLS}, 1fr)`,
          gap: ZONE_MAP_PAGE.GAP,
        }}
      >
        {maps.map((def) => {
          const counts = countZones(def.events);
          const located = Object.values(counts).reduce((a, b) => a + b, 0);
          return (
            <div key={def.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: def.color,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {def.title}
              </div>
              <div style={{ fontSize: 8, color: "#94a3b8" }}>
                {def.events.length} eventos
                {def.events.length > located ? ` · ${def.events.length - located} sin ubicación` : ""}
              </div>
              <FutsalPitch
                mode={legacy ? "legacy3x3" : "zone12"}
                theme="light"
                counts={counts}
                accent={def.color}
                compact
                maxWidth={ZONE_MAP_PAGE.PITCH_W}
                goalCaptions={captionsFor(def)}
                emptyLabel="Sin acciones ubicadas"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ZoneMapBoard;
