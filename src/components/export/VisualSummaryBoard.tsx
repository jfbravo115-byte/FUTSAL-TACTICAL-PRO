import React from "react";
import { MatchData, Player } from "../../types/futsal";
import { MatchReport } from "../../services/matchReportService";
import { formatJerseyNumber } from "../../utils/jerseyNumber";
import { playerDisplayIdentity } from "../../utils/playerIdentity";

const BG = "#0A0B0E";
const CARD = "#0F172A";
const BORDER = "#262B36";
const PANEL = "#16181D";
const SHOTS = "#67e8f9";
const CONVERSION = "#bef264";
const RECOVERIES = "#93c5fd";
const POSITIVE = "#6ee7b7";
const NEGATIVE = "#fca5a5";
const TOT = "#fbbf24";
const SCORER = "#a3e635";
const RECOVERER = "#60a5fa";

const HIGHLIGHT_BG: Record<string, { background: string; border: string }> = {
  [TOT]: { background: "#1F1A10", border: "#5A4718" },
  [SCORER]: { background: "#171E10", border: "#41551C" },
  [RECOVERER]: { background: "#101826", border: "#28446B" },
};

export const NO_DATA = "Sin datos";

export function highlightLabel(
  highlight: { id: string; number: number; jerseyNumberKnown?: boolean; name: string } | null,
  players: Player[],
): string {
  if (!highlight) return NO_DATA;
  const player = players.find((candidate) => candidate.id === highlight.id);
  const number = formatJerseyNumber(player ?? highlight);
  if (!player) return `#${number} ${highlight.name}`.trim();
  const identity = playerDisplayIdentity(player, { players, maxCaracteres: 22 });
  const name =
    identity.kind === "nombre" ? identity.nombreCompleto! : identity.etiquetaProvisional;
  return `#${number} ${name}`;
}

export function signedBalance(balance: number): string {
  return `${balance >= 0 ? "+" : ""}${balance}`;
}

export function goalsLabel(goals: number): string {
  return `${goals} ${goals === 1 ? "gol" : "goles"}`;
}

export function scorerLeadersLabel(
  scorers: MatchReport["highlights"]["topScorers"],
  players: Player[],
): string {
  if (!scorers.length) return NO_DATA;
  return scorers.map((scorer) => highlightLabel(scorer, players)).join(" · ");
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, background: CARD, borderRadius: 16, padding: "14px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginTop: 6 }}>
        {label}
      </div>
    </div>
  );
}

function HighlightCard({ label, who, value, color }: { label: string; who: string; value: string; color: string }) {
  const tone = HIGHLIGHT_BG[color];
  return (
    <div style={{ border: `1px solid ${tone.border}`, background: tone.background, borderRadius: 16, padding: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, color: "#ffffff" }}>{who}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/**
 * El mismo resumen visual para las dos exportaciones PDF. No calcula cifras:
 * consume exclusivamente el informe determinista que alimenta la pantalla.
 */
export function VisualSummaryBoard({ matchData, report }: { matchData: MatchData; report: MatchReport }) {
  const totals = report.teamTotals;
  const highlights = report.highlights;
  const players = matchData.players || [];
  const balance = totals.recoveryLossBalance;
  const conversion = totals.goalConversionPct === null ? "—" : `${totals.goalConversionPct}%`;

  return (
    <div data-visual-summary style={{ background: BG, borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ border: `1px solid ${BORDER}`, background: PANEL, borderRadius: 20, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Resultado</div>
          <div style={{ fontSize: 19, fontWeight: 900, color: "#ffffff", marginTop: 2 }}>{matchData.teamName} · {matchData.opponentName}</div>
        </div>
        <div style={{ fontSize: 54, fontWeight: 900, color: "#ffffff", lineHeight: 1 }}>{report.score.team}–{report.score.opponent}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <KpiCard label="Tiros totales" value={String(totals.shots)} color={SHOTS} />
        <KpiCard label="Conversión" value={conversion} color={CONVERSION} />
        <KpiCard label="Recuperaciones" value={String(totals.recoveries)} color={RECOVERIES} />
        <KpiCard label="Balance Rec-(P+E)" value={signedBalance(balance)} color={balance >= 0 ? POSITIVE : NEGATIVE} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <HighlightCard label="Mayor TOT" who={highlightLabel(highlights.topTot, players)} value={highlights.topTot ? highlights.topTot.totLabel : NO_DATA} color={TOT} />
        <HighlightCard label={highlights.topScorers.length > 1 ? "Máximos goleadores" : "Máximo goleador"} who={scorerLeadersLabel(highlights.topScorers, players)} value={highlights.topScorers.length > 1 ? `${goalsLabel(highlights.topScorers[0].goals)} cada uno` : goalsLabel(highlights.topScorer ? highlights.topScorer.goals : 0)} color={SCORER} />
        <HighlightCard label="Más recuperaciones" who={highlightLabel(highlights.topRecoverer, players)} value={highlights.topRecoverer ? String(highlights.topRecoverer.recoveries) : NO_DATA} color={RECOVERER} />
      </div>
    </div>
  );
}
