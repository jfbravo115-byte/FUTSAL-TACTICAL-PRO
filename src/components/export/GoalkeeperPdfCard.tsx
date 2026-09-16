/**
 * src/components/export/GoalkeeperPdfCard.tsx
 *
 * Ficha de portero para PÁGINA IMPRESA (fondo claro, estilos en línea porque
 * el nodo se rasteriza con html-to-image).
 *
 * Vivía dentro de pdfExportService. Se saca aquí porque hay DOS generadores de
 * PDF de porteros — el informe independiente del servicio y el "Porteros +
 * Mapa" de MatchTracker — y cada uno tenía su propia idea de cómo se cuenta un
 * partido. Ahora los dos pintan esta misma ficha a partir de la misma entrada
 * de `buildGoalkeeperReports()`.
 */
import React from "react";
import { GameEvent, GoalieAction, Role } from "../../types/futsal";
import { GoalkeeperReportEntry } from "../../services/goalkeeperReportService";
import { GoalkeeperOriginMap, GoalkeeperImpactMap } from "./GoalkeeperMaps";
import { GoalkeeperInterventionMap } from "../field/GoalkeeperInterventionMap";
import { GK_ZONE_DESCRIPTION, GK_ZONE_IDS, GK_ZONE_LABEL } from "../../utils/goalkeeperZones";
import { formatGoalieAction } from "../../utils/goalkeeperActions";

const cardStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: 10,
};

export function GoalkeeperPdfCard({
  gk,
  allEvents,
  isOnlyRelevantGoalkeeper,
}: {
  gk: GoalkeeperReportEntry;
  allEvents: GameEvent[];
  /** ¿Es este el único portero relevante de SU equipo en todo el
   *  partido? Determina el fallback legacy del mapa de origen (ver
   *  GoalkeeperOriginMap) — evita atribuir un disparo rival ambiguo a
   *  más de un portero cuando hubo varios. */
  isOnlyRelevantGoalkeeper: boolean;
}) {
  return (
    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>#{gk.number} {gk.name}</div>
          <div style={{ fontSize: 10, color: "#6b7280" }}>
            {gk.totLabel} en pista{!gk.isOnPitch ? " · sustituido" : ""}{gk.isOpponent ? " · rival" : ""}
          </div>
        </div>
        {/* La cifra que manda es "Paradas": es la misma que pinta de verde el
            mapa de impacto. El desglose por subtipo va debajo y solo declara
            lo que realmente se registró — un disparo detenido sin subtipo no
            se convierte en blocaje ni en despeje. */}
        <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
          <span>Tiros recibidos <b>{gk.shotsAgainst}</b></span>
          <span>Paradas <b>{gk.totalSaves}</b></span>
          <span>Salidas <b>{gk.exits}</b></span>
          <span>Encajados <b>{gk.conceded}</b></span>
          {/* La etiqueta dice explícitamente "resueltos" porque el
              denominador son paradas + encajados, NO todos los tiros
              recibidos: las intervenciones no registradas quedan fuera. */}
          <span>
            % paradas (resueltos){" "}
            <b>{gk.effectivenessPct === null ? "—" : `${gk.effectivenessPct}%`}</b>
          </span>
        </div>
      </div>
      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>
        % paradas calculado sobre tiros a puerta resueltos ({gk.totalSaves} paradas +{" "}
        {gk.conceded} encajados = {gk.shotsFaced}).
        {gk.shotsUndeclared > 0
          ? ` Intervenciones no registradas: ${gk.shotsUndeclared} — son tiros recibidos, pero no consta si el portero intervino, así que no entran en el porcentaje.`
          : ""}
      </div>
      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 6 }}>
        Desglose de paradas: blocajes {gk.saveCatch} · despejes {gk.saveDeflect}
        {gk.saveGeneric > 0 ? ` · genéricas ${gk.saveGeneric}` : ""}
        {gk.saveUnspecified > 0 ? ` · sin subtipo registrado ${gk.saveUnspecified}` : ""}
        {gk.shotsFaced > 0 && gk.mappedInterventions < gk.shotsFaced
          ? ` — el mapa de portería muestra ${gk.mappedInterventions} de ${gk.shotsFaced} (el resto no tiene zona registrada)`
          : ""}
        {gk.exits > 0 ? (
          <span>
            {" · "}Salidas: {gk.exitsSuccess} con éxito · {gk.exitsFail} falladas
            {gk.exitsUnknown > 0 ? ` · ${gk.exitsUnknown} sin resultado registrado` : ""}
          </span>
        ) : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>Origen de los tiros · pista de 12 zonas</div>
          {/* IMPORTANTE: el mapa de ORIGEN necesita el conjunto COMPLETO de
              eventos del partido (matchData.events), no solo los propios
              del portero — la lógica original (extraída de MatchTracker.tsx,
              ver GoalkeeperMaps.tsx) también contabiliza disparos del rival
              mientras este portero está en pista, que NO llevan su id en
              playerIds. gk.events (filtrado a playerIds.includes) se
              queda corto para este mapa concreto. */}
          <GoalkeeperOriginMap goalie={{ id: gk.id, number: gk.number, name: gk.name, role: Role.GOALKEEPER, isOnPitch: gk.isOnPitch, plusMinus: 0, individualTimeSeconds: gk.totSeconds, isOpponent: gk.isOpponent, stats: { goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0, fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: gk.totalSaves, conceded: gk.conceded } }} isOpponent={gk.isOpponent} events={allEvents} isOnlyRelevantGoalkeeper={isOnlyRelevantGoalkeeper} compact theme="light" />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>Destino de los tiros · portería · verde parada / rojo gol</div>
          {/* El mapa de IMPACTO sí debe usar solo intervenciones propias
              del portero (gk.events) — no se toca, es correcto tal cual. */}
          <GoalkeeperImpactMap events={gk.events} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>Últimas intervenciones</div>
          {gk.timeline.length === 0 ? (
            <div style={{ fontSize: 10, color: "#9ca3af" }}>Sin datos registrados.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {gk.timeline.slice(-6).reverse().map((t, i) => (
                <div key={i} style={{ fontSize: 10, display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", paddingBottom: 2 }}>
                  <span style={{ color: "#6b7280" }}>{t.timeLabel}</span>
                  <span style={{ fontWeight: 700 }}>{t.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>


      {/* ── ZONAS DE INTERVENCIÓN ──────────────────────────────────────
          Tercera dimensión espacial, con bloque propio y a ancho completo.
          Origen (12 zonas de pista), destino (portería) y zona de
          intervención (área del portero) son tres preguntas distintas y aquí
          se leen como tres mapas distintos: sus contadores no se mezclan.

          El dibujo es el MISMO componente que usa la captura
          (GoalkeeperInterventionMap), así que la geometría de las cinco zonas
          existe una sola vez en el código. */}
      <div style={{ marginTop: 10, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 6,
          }}
        >
          Zonas de intervención
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 14 }}>
          <GoalkeeperInterventionMap
            theme="light"
            counts={gk.interventionZones}
            accent="#2563eb"
            maxWidth={170}
            hideLegend
          />

          <div>
            {/* Resumen legible: el mapa muestra la distribución, esto da la
                cifra exacta. Nunca se imprime GK1-GK5. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {GK_ZONE_IDS.map((id) => (
                <div
                  key={id}
                  data-gk-zone-row={id}
                  style={{ display: "flex", justifyContent: "space-between", fontSize: 9, gap: 8 }}
                >
                  <span style={{ color: "#374151" }}>
                    {GK_ZONE_LABEL[id]} · {GK_ZONE_DESCRIPTION[id]}
                  </span>
                  <b>{gk.interventionZones[id]}</b>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 9,
                  gap: 8,
                  color: "#6b7280",
                  borderTop: "1px solid #e5e7eb",
                  paddingTop: 2,
                  marginTop: 2,
                }}
              >
                <span>Sin ubicación registrada</span>
                <b>{gk.interventionsUnlocated}</b>
              </div>
            </div>

            {/* Desglose por tipo. Solo aparecen los tipos realmente
                registrados: no se infiere el tipo de un evento histórico. */}
            {Object.keys(gk.interventionZonesByAction).length > 0 && (
              <table
                style={{
                  width: "100%",
                  marginTop: 8,
                  borderCollapse: "collapse",
                  fontSize: 8,
                }}
              >
                <thead>
                  <tr style={{ color: "#6b7280" }}>
                    <th style={{ textAlign: "left", padding: "2px 4px" }}></th>
                    {GK_ZONE_IDS.map((id) => (
                      <th key={id} style={{ padding: "2px 4px", textAlign: "center" }}>
                        {GK_ZONE_LABEL[id].replace("Zona ", "Z")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(gk.interventionZonesByAction) as GoalieAction[]).map((action) => (
                    <tr key={action} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "2px 4px", fontWeight: 700 }}>
                        {formatGoalieAction(action)}
                      </td>
                      {GK_ZONE_IDS.map((id) => (
                        <td key={id} style={{ padding: "2px 4px", textAlign: "center" }}>
                          {gk.interventionZonesByAction[action]![id] || ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {gk.exits > 0 && (
                    <>
                      <tr style={{ borderTop: "1px solid #f1f5f9", color: "#6b7280" }}>
                        <td style={{ padding: "2px 4px", paddingLeft: 10 }}>— con éxito</td>
                        {GK_ZONE_IDS.map((id) => (
                          <td key={id} style={{ padding: "2px 4px", textAlign: "center" }}>
                            {gk.exitZonesSuccess[id] || ""}
                          </td>
                        ))}
                      </tr>
                      <tr style={{ color: "#6b7280" }}>
                        <td style={{ padding: "2px 4px", paddingLeft: 10 }}>— falladas</td>
                        {GK_ZONE_IDS.map((id) => (
                          <td key={id} style={{ padding: "2px 4px", textAlign: "center" }}>
                            {gk.exitZonesFail[id] || ""}
                          </td>
                        ))}
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
