/**
 * src/components/export/SetPieceSummaryBoard.tsx
 *
 * Bloque de BALÓN PARADO para páginas impresas (fondo claro, estilos en línea
 * porque el nodo se rasteriza con html-to-image).
 *
 * POR QUÉ EXISTE
 * --------------
 * El PDF real del informe (`informe_*.pdf`) se monta con una plantilla propia
 * dentro de MatchTracker, distinta de la del servicio de exportación. Las dos
 * necesitan decir lo mismo sobre balón parado, y copiar el bloque en cada una
 * es exactamente el problema que costó tres rondas en Fase 4. Así que el
 * bloque es UNO y lo usan las dos rutas.
 *
 * TRES LECTURAS QUE NO SE MEZCLAN
 * -------------------------------
 *   CÓRNERS      lado (izquierda/derecha) + cómo se ejecutó (tiro/jugada)
 *   FALTAS       COMETIDAS y recibidas, con cuántas tienen ubicación
 *   TIROS DE BP  tiros propios que declaran venir de falta o de córner
 *
 * Una falta es una INFRACCIÓN: nunca se clasifica como "tiro" o "jugada", que
 * describiría lo que hizo el rival después. El tiro de falta se cuenta en el
 * propio tiro (`setPiece === 'free_kick'`), sin relacionarlo con ninguna falta
 * concreta.
 */
import React from "react";
import { ActionType, GameEvent, MatchData } from "../../types/futsal";
import { CornerSummary, summarizeCorners } from "../../utils/cornerModel";
import {
  SET_PIECE_OUTCOME_LABEL,
  SET_PIECE_RESTART_LABEL_PLURAL,
  SetPieceOutcomeSummary,
  SetPieceRestartSummary,
  countShotsFromSetPiece,
  summarizeCornerOutcomes,
  summarizeSetPieceRestarts,
} from "../../utils/setPieceModel";
import { classifyZone } from "../../utils/legacyZoneMap";

export type SetPieceSummary = {
  corners: { side: CornerSummary; outcome: SetPieceOutcomeSummary };
  fouls: { total: number; located: number; unlocated: number };
  shotsFrom: { freeKick: number; corner: number };
  /** Faltas a favor puestas en juego. Ni faltas cometidas ni tiros. */
  freeKickPlays: SetPieceRestartSummary;
};

/** Resumen de balón parado de UN bando. Función pura, reutilizable en tests. */
export function buildSetPieceSummary(
  events: GameEvent[],
  opponent: boolean,
): SetPieceSummary {
  const fouls = events.filter(
    (e) => e.type === ActionType.FOUL && !!e.metadata?.isOpponent === opponent,
  );
  const located = fouls.filter((e) => classifyZone(e.originGrid) !== null).length;

  return {
    corners: {
      side: summarizeCorners(events, opponent),
      outcome: summarizeCornerOutcomes(events, opponent),
    },
    fouls: { total: fouls.length, located, unlocated: fouls.length - located },
    shotsFrom: {
      freeKick: countShotsFromSetPiece(events, "free_kick", opponent),
      corner: countShotsFromSetPiece(events, "corner", opponent),
    },
    freeKickPlays: summarizeSetPieceRestarts(
      events,
      opponent,
      (e) => classifyZone(e.originGrid) !== null,
    ),
  };
}

const cell: React.CSSProperties = { padding: "4px 6px", textAlign: "center" };
const head: React.CSSProperties = { ...cell, fontWeight: 700, fontSize: 9, color: "#64748b" };
const rowLabel: React.CSSProperties = { padding: "4px 6px", textAlign: "left", fontWeight: 600 };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: "0.5px solid #e2e8f0",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export function SetPieceSummaryBoard({ matchData }: { matchData: MatchData }) {
  const events = matchData.events || [];
  const propio = buildSetPieceSummary(events, false);
  const rival = buildSetPieceSummary(events, true);
  const columnas = [
    { label: matchData.teamName, data: propio },
    { label: matchData.opponentName, data: rival },
  ];

  return (
    <div data-set-piece-board style={{ fontSize: 10, color: "#0f172a" }}>
      <Section title="Córners">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ ...head, textAlign: "left" }}>Equipo</th>
              <th style={head}>Total</th>
              <th style={head}>Izquierda</th>
              <th style={head}>Derecha</th>
              <th style={head}>{SET_PIECE_OUTCOME_LABEL.shot}</th>
              <th style={head}>{SET_PIECE_OUTCOME_LABEL.play}</th>
              <th style={head}>Sin subtipo registrado</th>
            </tr>
          </thead>
          <tbody>
            {columnas.map(({ label, data }) => (
              <tr key={label} data-set-piece-row={label} style={{ borderBottom: "0.5px solid #f1f5f9" }}>
                <td style={rowLabel}>{label}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{data.corners.side.total}</td>
                <td style={cell}>{data.corners.side.left}</td>
                <td style={cell}>{data.corners.side.right}</td>
                <td style={cell}>{data.corners.outcome.shot}</td>
                <td style={cell}>{data.corners.outcome.play}</td>
                <td style={cell}>{data.corners.outcome.unrecorded}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 8, color: "#94a3b8", marginTop: 6 }}>
          «Tiro directo» indica que el córner se ejecutó directamente hacia portería. «Desde
          córner», más abajo, contabiliza tiros registrados con procedencia córner. Son registros
          independientes: ni se suman ni se deducen uno del otro.
        </p>
        <p style={{ fontSize: 8, color: "#94a3b8", marginTop: 4 }}>
          «Sin subtipo registrado» significa que no consta cómo se ejecutó el córner; no es una
          estimación. El lado se lee desde la perspectiva del equipo que saca.
        </p>
      </Section>

      <Section title="Faltas">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ ...head, textAlign: "left" }}>Equipo</th>
              <th style={head}>Cometidas</th>
              <th style={head}>Recibidas</th>
              <th style={head}>Con ubicación</th>
              <th style={head}>Sin ubicación</th>
            </tr>
          </thead>
          <tbody>
            <tr data-foul-row={matchData.teamName} style={{ borderBottom: "0.5px solid #f1f5f9" }}>
              <td style={rowLabel}>{matchData.teamName}</td>
              <td style={{ ...cell, fontWeight: 700 }}>{propio.fouls.total}</td>
              <td style={cell}>{rival.fouls.total}</td>
              <td style={cell}>{propio.fouls.located}</td>
              <td style={cell}>{propio.fouls.unlocated}</td>
            </tr>
            <tr data-foul-row={matchData.opponentName}>
              <td style={rowLabel}>{matchData.opponentName}</td>
              <td style={{ ...cell, fontWeight: 700 }}>{rival.fouls.total}</td>
              <td style={cell}>{propio.fouls.total}</td>
              <td style={cell}>{rival.fouls.located}</td>
              <td style={cell}>{rival.fouls.unlocated}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: 8, color: "#94a3b8", marginTop: 6 }}>
          Una falta es la infracción cometida. Las recibidas son las que comete el rival. Quién
          ejecuta después la reanudación se cuenta abajo, en el propio tiro.
        </p>
      </Section>

      <Section title={SET_PIECE_RESTART_LABEL_PLURAL}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ ...head, textAlign: "left" }}>Equipo</th>
              <th style={head}>Total</th>
              <th style={head}>Con ubicación</th>
              <th style={head}>Sin ubicación</th>
            </tr>
          </thead>
          <tbody>
            {columnas.map(({ label, data }) => (
              <tr key={label} data-free-kick-play-row={label} style={{ borderBottom: "0.5px solid #f1f5f9" }}>
                <td style={rowLabel}>{label}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{data.freeKickPlays.total}</td>
                <td style={cell}>{data.freeKickPlays.located}</td>
                <td style={cell}>{data.freeKickPlays.unlocated}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 8, color: "#94a3b8", marginTop: 6 }}>
          Una falta a favor puesta en juego en vez de rematada. No suma a las faltas cometidas
          —esas son del rival— ni a los tiros.
        </p>
      </Section>

      <Section title="Tiros procedentes de balón parado">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ ...head, textAlign: "left" }}>Equipo</th>
              <th style={head}>Desde falta</th>
              <th style={head}>Desde córner</th>
            </tr>
          </thead>
          <tbody>
            {columnas.map(({ label, data }) => (
              <tr key={label} data-shot-origin-row={label} style={{ borderBottom: "0.5px solid #f1f5f9" }}>
                <td style={rowLabel}>{label}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{data.shotsFrom.freeKick}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{data.shotsFrom.corner}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 8, color: "#94a3b8", marginTop: 6 }}>
          Lo declara el propio tiro. No se deduce de ninguna falta ni córner concreto: son
          acciones distintas y no se relacionan por cercanía temporal.
        </p>
      </Section>
    </div>
  );
}
