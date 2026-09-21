/**
 * src/components/export/MatchContextBoard.tsx
 *
 * Página "Contexto táctico y secuencia de goles" del PDF Global del equipo.
 *
 * POR QUÉ EXISTE
 * --------------
 * El PDF Global es el documento que el entrenador entrega al cuerpo técnico.
 * Las situaciones especiales y la secuencia de goles vivían solo en el
 * informe en pantalla, en el markdown y en el PDF secundario, así que no
 * llegaban a quien tiene que leerlas.
 *
 * NO CALCULA NADA
 * ---------------
 * Recibe `MatchReport.matchContexts` y `MatchReport.goalSequence` ya hechos.
 * Aquí no se vuelve a definir qué es una ventana, qué es un tiro, cómo se
 * clasifica un gol ni cómo se mide un tiempo de respuesta: una sola fuente
 * de verdad, y un cambio en esos helpers se refleja aquí sin tocar este
 * archivo.
 *
 * LO QUE NO SE INVENTA
 * --------------------
 * Una ventana sin final declarado imprime «Duración no disponible». Un gol
 * cuya procedencia no se registró imprime «No registrado». Un tiempo de
 * respuesta entre partes distintas no se imprime, porque no existe.
 */
import React from "react";
import { Period } from "../../types/futsal";
import { MATCH_CONTEXT_LABEL, MatchContext, UNKNOWN_DURATION_LABEL } from "../../utils/matchContexts";
import { GoalSequenceEntry, formatMatchTime } from "../../utils/goalSequence";

/** Nombres de parte para el PDF. Nunca el número interno. */
export const PERIOD_PDF_LABEL: Record<number, string> = {
  [Period.FIRST]: "1ª Parte",
  [Period.SECOND]: "2ª Parte",
  [Period.OVERTIME_1]: "Prórroga 1",
  [Period.OVERTIME_2]: "Prórroga 2",
};

export function periodPdfLabel(period: number): string {
  return PERIOD_PDF_LABEL[period] ?? `Periodo ${period}`;
}

/** `"00:39"` o el texto de duración desconocida. Nunca se estima. */
export function formatContextDuration(duration: number | null): string {
  return duration === null ? UNKNOWN_DURATION_LABEL : formatMatchTime(duration);
}

/**
 * Marcador inicial → final de una ventana, o null si no se cerró.
 * `0-0 → 1-0`. Sin final declarado no hay marcador final que enseñar.
 */
export function formatContextScore(ctx: MatchContext): string | null {
  const inicio = `${ctx.startScore.team}-${ctx.startScore.opponent}`;
  if (!ctx.endScore) return inicio;
  return `${inicio} → ${ctx.endScore.team}-${ctx.endScore.opponent}`;
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  breakInside: "avoid",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: 10,
  paddingBottom: 6,
  borderBottom: "0.5px solid #e2e8f0",
};

/** Cifra destacada con su rótulo. Lo primero que busca el ojo. */
function Metric({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 52 }}>
      <span style={{ fontSize: 7, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize: 17, fontWeight: 900, color: accent ?? "#0f172a", lineHeight: 1.1 }}>
        {value}
      </span>
    </div>
  );
}

export function MatchContextCard({ context }: { context: MatchContext }) {
  const t = context.tally;
  const marcador = formatContextScore(context);
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#0f172a" }}>
          {MATCH_CONTEXT_LABEL[context.type]}
        </span>
        <span style={{ fontSize: 9, color: "#64748b", whiteSpace: "nowrap" }}>
          {periodPdfLabel(context.period)} · {formatContextDuration(context.duration)}
          {marcador ? ` · ${marcador}` : ""}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Metric label="Tiros" value={t.shots} accent="#2563eb" />
        <Metric label="A portería" value={t.onTarget} />
        <Metric label="Fuera" value={t.offTarget} />
        <Metric label="Bloqueados" value={t.blocked} />
        <Metric label="Goles" value={t.goals} accent="#16a34a" />
      </div>

      <div style={{ fontSize: 9, color: "#64748b" }}>
        Recuperaciones {t.recoveries} · pérdidas {t.turnovers} · faltas {t.fouls} · córners {t.corners}
      </div>
    </div>
  );
}

export function GoalSequenceRow({
  goal,
  teamName,
  opponentName,
}: {
  goal: GoalSequenceEntry;
  teamName: string;
  opponentName: string;
}) {
  const equipo = goal.scoringTeam === "team" ? teamName : opponentName;
  const quien = goal.playerName
    ? `${goal.playerNumber !== null ? `#${goal.playerNumber} ` : ""}${goal.playerName}`
    : equipo;
  // Solo se imprime cuando existe. Entre partes distintas el dato no existe
  // y no se aproxima.
  const respuesta =
    goal.secondsSinceOpponentPreviousGoal !== null
      ? `${goal.scoringTeam === "opponent" ? "Respuesta rival" : "Respuesta propia"}: ${goal.secondsSinceOpponentPreviousGoal} s`
      : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        fontSize: 10,
        padding: "4px 0",
        borderBottom: "0.5px solid #f1f5f9",
        breakInside: "avoid",
      }}
    >
      <span style={{ color: "#94a3b8", minWidth: 96 }}>
        {periodPdfLabel(goal.period)} {goal.matchTimeLabel}
      </span>
      <span style={{ fontWeight: 900, minWidth: 34, color: "#0f172a" }}>
        {goal.scoreAfter.team}-{goal.scoreAfter.opponent}
      </span>
      <span style={{ flex: 1, color: "#0f172a" }}>
        {quien}
        <span style={{ color: "#94a3b8" }}> · {equipo}</span>
      </span>
      <span style={{ color: "#475569", minWidth: 84, textAlign: "right" }}>{goal.sourceLabel}</span>
      <span style={{ color: "#94a3b8", minWidth: 132, textAlign: "right" }}>{respuesta ?? ""}</span>
    </div>
  );
}

/**
 * El contenido de UNA página, ya repartido por `paginateContextReport`.
 *
 * `opensContexts` / `opensGoals` deciden si esta página titula la sección:
 * cuando una lista continúa en la siguiente página se vuelve a titular, para
 * que una tarjeta suelta no aparezca sin decir de qué es.
 */
export function MatchContextBoard({
  contexts,
  goals,
  teamName,
  opponentName,
  opensContexts = true,
  opensGoals = true,
}: {
  contexts: MatchContext[];
  goals: GoalSequenceEntry[];
  teamName: string;
  opponentName: string;
  opensContexts?: boolean;
  opensGoals?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {contexts.length > 0 && (
        <div>
          {opensContexts && (
            <div style={sectionLabelStyle}>
              situaciones especiales — solo las declaradas durante el partido
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {contexts.map((c) => (
              <MatchContextCard key={c.openedBy} context={c} />
            ))}
          </div>
        </div>
      )}

      {goals.length > 0 && (
        <div>
          {opensGoals && <div style={sectionLabelStyle}>secuencia de goles</div>}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {goals.map((g) => (
              <GoalSequenceRow
                key={g.eventId}
                goal={g}
                teamName={teamName}
                opponentName={opponentName}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MatchContextBoard;
