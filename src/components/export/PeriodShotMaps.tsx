/**
 * src/components/export/PeriodShotMaps.tsx
 *
 * Mapas de TIROS separados por parte.
 *
 * POR QUÉ SOLO LOS TIROS
 * ----------------------
 * El dashboard de mapas ya agota su página con seis pistas acumuladas, y
 * duplicarlas todas por parte daría doce mapas que nadie lee. La pregunta que
 * el cuerpo técnico se hace en el descanso es concreta —«¿desde dónde nos
 * tiraron en la primera y desde dónde en la segunda?»— así que se separa
 * exactamente eso, y el resto sigue siendo acumulado.
 *
 * NO HACE FALTA NINGÚN CAMPO NUEVO
 * --------------------------------
 * `GameEvent.period` se guarda en cada evento desde siempre. Esto solo lo usa.
 *
 * EL CAMBIO DE CAMPO NO SE APLICA AQUÍ
 * ------------------------------------
 * Los sectores se guardan YA normalizados a la perspectiva del equipo que
 * ejecuta: Z1 es «cerca de mi portería» y Z4 «cerca de la rival» en las dos
 * partes, se ataque hacia donde se ataque. Espejar por `attackDirection`
 * rompería esa normalización y haría incomparables las dos mitades, que es
 * justo lo contrario de lo que esta página viene a permitir.
 *
 * UN TIRO SIN SECTOR SIGUE SIENDO UN TIRO
 * ---------------------------------------
 * Cuenta en el total de su parte y se declara como «sin ubicación». No se
 * dibuja en ninguna celda: no sabemos desde dónde se hizo.
 */
import React from "react";
import { GameEvent, Period } from "../../types/futsal";
import { FutsalPitch } from "../field/FutsalPitch";
import { isShotAttempt, isShotGoal } from "../../utils/shotModel";
import { captionsForRival, countZones, isLegacyMatch } from "./ZoneMapBoard";

/** Las partes que se nombran. FINISHED no es una parte, es un estado. */
export const PERIOD_LABEL: Record<number, string> = {
  [Period.FIRST]: "1ª parte",
  [Period.SECOND]: "2ª parte",
  [Period.OVERTIME_1]: "Prórroga 1",
  [Period.OVERTIME_2]: "Prórroga 2",
};

export function periodLabel(period: number): string {
  return PERIOD_LABEL[period] ?? `Periodo ${period}`;
}

/** Las dos partes siempre; una prórroga solo si el partido la jugó. */
export const BASE_PERIODS: readonly Period[] = [Period.FIRST, Period.SECOND];

/**
 * Partes que hay que dibujar.
 *
 * Las dos reglamentarias se muestran aunque estén vacías —un mapa vacío es
 * información— y cualquier otra solo si trae tiros, de modo que un partido
 * antiguo con un periodo inesperado se presenta en vez de perderse.
 */
export function shotMapPeriods(events: GameEvent[]): number[] {
  const extra = new Set<number>();
  for (const e of events || []) {
    if (!isShotAttempt(e)) continue;
    if (typeof e.period !== "number") continue;
    if (!BASE_PERIODS.includes(e.period)) extra.add(e.period);
  }
  return [...BASE_PERIODS, ...[...extra].sort((a, b) => a - b)];
}

export type PeriodShotMap = {
  key: string;
  title: string;
  period: number;
  isRivalAction: boolean;
  events: GameEvent[];
};

/**
 * Los mapas de tiros de un bando, uno por parte.
 *
 * `opponent` decide de quién se habla. Los goles entran, igual que en
 * cualquier otro recuento de intentos: un gol es un tiro que acabó dentro.
 */
export function buildPeriodShotMaps(events: GameEvent[], opponent: boolean): PeriodShotMap[] {
  const attempts = (events || []).filter(
    (e) => isShotAttempt(e) && !!e.metadata?.isOpponent === opponent,
  );
  return shotMapPeriods(events).map((period) => ({
    key: `${opponent ? "rival" : "propio"}-p${period}`,
    title: `${opponent ? "Tiros recibidos" : "Tiros"} — ${periodLabel(period)}`,
    period,
    isRivalAction: opponent,
    events: attempts.filter((e) => e.period === period),
  }));
}

/** Tiros de un mapa que no se pudieron ubicar. Se declara, no se esconde. */
export function unlocatedCount(map: PeriodShotMap): number {
  const located = Object.values(countZones(map.events)).reduce((a, b) => a + b, 0);
  return Math.max(0, map.events.length - located);
}

/** Línea de reconciliación: la suma de las partes tiene que dar el total. */
export function reconciliationLine(maps: PeriodShotMap[], total: number): string {
  const partes = maps.map((m) => `${periodLabel(m.period)} ${m.events.length}`).join(" · ");
  return `${partes} · Total ${total}`;
}

// ── COMPONENTE ──────────────────────────────────────────────────────────

export function PeriodShotMapsBoard({
  events,
  opponent,
  theme = "light",
  pitchWidth = 300,
  accent,
}: {
  events: GameEvent[];
  opponent: boolean;
  theme?: "light" | "dark";
  pitchWidth?: number;
  accent?: string;
}) {
  const maps = buildPeriodShotMaps(events, opponent);
  const legacy = isLegacyMatch(events);
  const total = maps.reduce((acc, m) => acc + m.events.length, 0);
  const color = accent ?? (opponent ? "#0ea5e9" : "#2563eb");
  const muted = theme === "light" ? "#94a3b8" : "#64748b";
  // Con prórroga hay cuatro mapas en vez de dos. La página del PDF tiene un
  // presupuesto de alto fijo (ZONE_MAP_PAGE) y pasarse no recorta: comprime.
  const width = maps.length > 2 ? Math.round(pitchWidth * 0.72) : pitchWidth;

  return (
    <div>
      <div style={{ fontSize: 8, color: muted, marginBottom: 10 }}>
        {reconciliationLine(maps, total)}
        {" — "}
        los goles cuentan como intento. Los sectores no se invierten al cambiar de campo:
        se guardan desde la perspectiva del equipo que ejecuta.
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(2, maps.length)}, 1fr)`,
          gap: 18,
        }}
      >
        {maps.map((def) => {
          const sinUbicacion = unlocatedCount(def);
          const goles = def.events.filter(isShotGoal).length;
          return (
            <div key={def.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {def.title}
              </div>
              <div style={{ fontSize: 8, color: muted }}>
                {def.events.length} tiros · {goles} gol{goles === 1 ? "" : "es"}
                {sinUbicacion > 0 ? ` · ${sinUbicacion} sin ubicación` : ""}
              </div>
              <FutsalPitch
                mode={legacy ? "legacy3x3" : "zone12"}
                theme={theme}
                counts={countZones(def.events)}
                accent={color}
                compact
                maxWidth={width}
                goalCaptions={captionsForRival(def.isRivalAction)}
                emptyLabel="Sin tiros ubicados"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PeriodShotMapsBoard;
