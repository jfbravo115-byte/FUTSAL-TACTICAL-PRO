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
 *   JUGADAS      córner, falta a favor y banda registrados como jugada
 *                enlazada: cómo se sacaron, dónde, cómo acabaron y quién.
 *                Sale del motor único `summarizeSetPieceSequences`; solo
 *                aparece si el partido tiene alguna, así que el PDF de un
 *                partido anterior queda exactamente como estaba.
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
import {
  PlayerTally,
  SetPieceRootStats,
  SideSetPieceStats,
  summarizeSetPieceSequences,
} from "../../utils/setPieceStats";
import { SET_PIECE_MODALITY_LABEL, SetPieceModality } from "../../utils/setPieceSequence";
import { formatJerseyNumber } from "../../utils/jerseyNumber";

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

// ── JUGADAS REGISTRADAS ─────────────────────────────────────────────────

const MODALIDAD_CORTA: Record<SetPieceModality, string> = {
  direct: "directo",
  prepared: "preparada",
  quick: "rápido",
};

/** «preparada 2 · rápido 1», solo lo que tiene valor. Vacío → «—». */
function modalidades(s: SetPieceRootStats): string {
  const partes = (Object.keys(SET_PIECE_MODALITY_LABEL) as SetPieceModality[])
    .filter((m) => (s.byModality[m] ?? 0) > 0)
    .map((m) => `${MODALIDAD_CORTA[m]} ${s.byModality[m]}`);
  return partes.length ? partes.join(" · ") : "—";
}

function ladoSector(tipo: keyof SideSetPieceStats, lado: SideSetPieceStats): string {
  const partes: string[] = [];
  if (tipo === "corner" || tipo === "throwIn") {
    const l = lado[tipo].bySide;
    if (l.left) partes.push(`izq. ${l.left}`);
    if (l.right) partes.push(`der. ${l.right}`);
  }
  if (tipo === "throwIn") {
    for (const [sector, n] of Object.entries(lado.throwIn.bySector)) if (n) partes.push(`${sector} ${n}`);
  }
  if (tipo === "freeKick") {
    for (const [zona, n] of Object.entries(lado.freeKick.byZone)) {
      if (n && zona !== "unknown") partes.push(`${zona} ${n}`);
    }
  }
  return partes.length ? partes.join(" · ") : "—";
}

/**
 * Un porcentaje solo con denominador: sin jugadas registradas no hay %. La
 * tasa ya llega en porcentaje entero desde el motor; aquí no se recalcula.
 */
function conTasa(n: number, tasa: number | null): string {
  return tasa === null ? String(n) : `${n} (${tasa}%)`;
}

const TIPOS: { key: keyof SideSetPieceStats; label: string }[] = [
  { key: "corner", label: "Córner" },
  { key: "freeKick", label: "Falta a favor" },
  { key: "throwIn", label: "Banda" },
];

function hayJugadas(lado: SideSetPieceStats): boolean {
  return lado.corner.recorded + lado.freeKick.recorded + lado.throwIn.total > 0;
}

function SequenceSection({ matchData }: { matchData: MatchData }) {
  const stats = summarizeSetPieceSequences(matchData.events || []);
  if (!hayJugadas(stats.team) && !hayJugadas(stats.opponent)) return null;
  // El contrato de los informes: «#dorsal nombre». Sin identificar, se dice.
  const nombre = (id: string) => {
    const p = matchData.players.find((x) => x.id === id);
    return p ? `#${formatJerseyNumber(p)} ${p.name}` : "no identificado";
  };
  const quien = (lista: PlayerTally[], sinIdentificar: number) => {
    const partes = lista.slice(0, 3).map((t) => `${nombre(t.playerId)} ${t.count}`);
    if (sinIdentificar) partes.push(`no identificado ${sinIdentificar}`);
    return partes.length ? partes.join(" · ") : "—";
  };
  const bandos = [
    { label: matchData.teamName, lado: stats.team },
    { label: matchData.opponentName, lado: stats.opponent },
  ];
  const filas = bandos.flatMap(({ label, lado }) =>
    TIPOS.filter(({ key }) => lado[key].total > 0).map(({ key, label: tipo }) => ({
      equipo: label,
      tipo,
      key,
      lado,
      s: lado[key] as SetPieceRootStats,
    })),
  );
  return (
    <Section title="Jugadas registradas · córner, falta a favor y banda">
      <table data-sequence-table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ ...head, textAlign: "left" }}>Equipo</th>
            <th style={{ ...head, textAlign: "left" }}>Reinicio</th>
            <th style={head}>Total</th>
            <th style={head}>Registradas</th>
            <th style={head}>Modalidad</th>
            <th style={head}>Lado / sector</th>
            <th style={head}>Remates</th>
            <th style={head}>Goles</th>
            <th style={head}>Pérdidas</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(({ equipo, tipo, key, lado, s }) => (
            <tr
              key={`${equipo}-${key}`}
              data-sequence-row={`${equipo}|${key}`}
              style={{ borderBottom: "0.5px solid #f1f5f9" }}
            >
              <td style={rowLabel}>{equipo}</td>
              <td style={{ ...cell, textAlign: "left" }}>{tipo}</td>
              <td style={{ ...cell, fontWeight: 700 }}>{s.total}</td>
              <td style={cell}>{s.recorded}</td>
              <td style={cell}>{modalidades(s)}</td>
              <td style={cell}>{ladoSector(key, lado)}</td>
              <td style={cell}>{conTasa(s.attempts, s.attemptRate)}</td>
              <td style={cell}>{conTasa(s.goals, s.goalRate)}</td>
              <td style={cell}>{conTasa(s.losses, s.lossRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
        {filas
          .filter(({ s }) => s.recorded > 0)
          .map(({ equipo, tipo, key, s }) => (
            <div key={`${equipo}-${key}-quien`} data-sequence-people={`${equipo}|${key}`} style={{ fontSize: 9 }}>
              <span style={{ fontWeight: 700 }}>
                {equipo} · {tipo}
              </span>
              {" — "}sacadores: {quien(s.takers, s.unidentifiedTakers)}
              {" · "}finalizadores: {quien(s.finishers, s.unidentifiedFinishers)}
            </div>
          ))}
      </div>
      <p style={{ fontSize: 8, color: "#94a3b8", marginTop: 6 }}>
        Remates, goles y pérdidas de una jugada YA están en los tiros, el marcador y las pérdidas
        del partido: aquí solo se dice de qué reanudación nacieron, no se suman aparte. Una banda
        no es un tiro. Los porcentajes son sobre las registradas; sin ninguna, no hay porcentaje.
        Lado y sector, desde la perspectiva del equipo que saca.
      </p>
    </Section>
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

      <SequenceSection matchData={matchData} />
    </div>
  );
}
