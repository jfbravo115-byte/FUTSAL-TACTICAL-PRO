/**
 * src/components/export/GoalkeeperPdfPages.tsx
 *
 * Páginas del PDF "Porteros + Mapa" (`porteros_*.pdf`): las que captura
 * `handleExport(Role.GOALKEEPER)` desde los refs de MatchTracker. Tres páginas
 * por equipo con portero: 1ª parte, 2ª parte y comparativa.
 *
 * POR QUÉ ESTABA MAL
 * ------------------
 * Esta plantilla era un tercer generador con su propia aritmética: contaba
 * paradas y goles a mano, atribuía los eventos con `p.isOnPitch && ...` —el
 * portero que está en pista AHORA, no el del momento del evento— y dibujaba el
 * origen sobre la rejilla `A1-C3` anterior a Fase 3. Por eso el PDF real seguía
 * enseñando "PARADAS (n) · Zona lanzamiento → Zona portería" sin salidas, sin
 * subtipos y sin zonas de intervención, mientras la pantalla ya contaba bien.
 *
 * Ahora cada portero se resuelve con `buildGoalkeeperReport()` y se pinta con
 * la MISMA ficha que el informe independiente de porteros.
 *
 * Vive fuera de MatchTracker.tsx para poder probarse: el fallo estaba
 * justamente en la parte que no tenía tests.
 */
import React from "react";
import { MatchData, Player, Role } from "../../types/futsal";
import { buildGoalkeeperReport, GoalkeeperReportEntry } from "../../services/goalkeeperReportService";
import { GoalkeeperPdfCard } from "./GoalkeeperPdfCard";

const pageStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  zIndex: -300,
  opacity: 0.01,
  pointerEvents: "none",
  width: 794,
  backgroundColor: "#ffffff",
  fontFamily: "'Inter', sans-serif",
  color: "#0f172a",
  padding: 40,
};

const headerStyle: React.CSSProperties = {
  background: "#0f172a",
  color: "white",
  padding: "14px 24px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
};

const slStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: 10,
  paddingBottom: 6,
  borderBottom: "0.5px solid #e2e8f0",
};

const footerStyle: React.CSSProperties = {
  marginTop: 20,
  borderTop: "0.5px solid #e2e8f0",
  paddingTop: 8,
  display: "flex",
  justifyContent: "space-between",
  fontSize: 8,
  color: "#94a3b8",
};

type Half = (e: { period: number }) => boolean;

const isFirstHalf: Half = (e) => Number(e.period) === 0;
const isSecondHalf: Half = (e) => Number(e.period) === 1;

/** Partido recortado a una mitad. El cálculo es el mismo; cambia el conjunto. */
function scoped(matchData: MatchData, half?: Half): MatchData {
  if (!half) return matchData;
  return { ...matchData, events: matchData.events.filter((e) => half(e as any)) };
}

/** ¿Hizo algo este portero en este tramo? Incluye salidas, no solo paradas. */
function participo(r: GoalkeeperReportEntry): boolean {
  return r.totalSaves + r.conceded + r.exits + r.shotsUndeclared > 0;
}

function GkTable({
  players,
  reports,
  accent,
}: {
  players: Player[];
  reports: Map<string, GoalkeeperReportEntry>;
  accent: string;
}) {
  const cabeceras = ["Portero", "Par.", "Bloc.", "Desp.", "Sal.", "Enc.", "%Par.", "Min."];
  const colores = ["#64748b", "#16a34a", "#0891b2", "#0d9488", "#d97706", "#dc2626", "#d97706", "#0284c7"];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
          {cabeceras.map((h, i) => (
            <th
              key={h}
              style={{
                padding: "4px 5px",
                textAlign: i === 0 ? "left" : "center",
                fontWeight: 700,
                fontSize: 9,
                color: colores[i],
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {players.map((p) => {
          const r = reports.get(p.id)!;
          return (
            <tr key={p.id} data-gk-row={p.id} style={{ borderBottom: "0.5px solid #f1f5f9" }}>
              <td style={{ padding: "4px 5px", textAlign: "left", fontWeight: 600 }}>
                <span style={{ color: accent, marginRight: 4, fontWeight: 700 }}>{p.number}</span>
                {p.name}
              </td>
              <td style={{ padding: "4px 5px", textAlign: "center", color: "#16a34a", fontWeight: r.totalSaves > 0 ? 700 : 400 }}>
                {r.totalSaves}
              </td>
              <td style={{ padding: "4px 5px", textAlign: "center", color: "#0891b2" }}>{r.saveCatch}</td>
              <td style={{ padding: "4px 5px", textAlign: "center", color: "#0d9488" }}>{r.saveDeflect}</td>
              <td style={{ padding: "4px 5px", textAlign: "center", color: "#d97706" }}>
                {r.exits}
                {r.exits > 0 ? (
                  <span style={{ fontSize: 7, color: "#94a3b8" }}>
                    {" "}
                    ({r.exitsSuccess}✓/{r.exitsFail}✗)
                  </span>
                ) : null}
              </td>
              <td style={{ padding: "4px 5px", textAlign: "center", color: "#dc2626", fontWeight: r.conceded > 0 ? 700 : 400 }}>
                {r.conceded}
              </td>
              <td style={{ padding: "4px 5px", textAlign: "center", color: "#d97706", fontWeight: 700 }}>
                {r.effectivenessPct === null ? "—" : `${r.effectivenessPct}%`}
              </td>
              <td style={{ padding: "4px 5px", textAlign: "center" }}>
                {Math.round((p.individualTimeSeconds || 0) / 60)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Fichas completas (resumen + los tres mapas) de una mitad. */
function GkCards({
  players,
  matchData,
  half,
}: {
  players: Player[];
  matchData: MatchData;
  half: Half;
}) {
  const tramo = scoped(matchData, half);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {players.map((p) => {
        const report = buildGoalkeeperReport(tramo, p);
        if (!participo(report)) {
          return (
            <div key={p.id} style={{ fontSize: 9, color: "#94a3b8", fontStyle: "italic" }}>
              #{p.number} {p.name} — sin participación en esta parte.
            </div>
          );
        }
        return (
          <GoalkeeperPdfCard
            key={p.id}
            gk={report}
            allEvents={tramo.events}
            isOnlyRelevantGoalkeeper={
              matchData.players.filter(
                (pl) => pl.role === Role.GOALKEEPER && pl.isOpponent === p.isOpponent,
              ).length === 1
            }
          />
        );
      })}
    </div>
  );
}

function Comparativa({
  players,
  matchData,
  accent,
}: {
  players: Player[];
  matchData: MatchData;
  accent: string;
}) {
  return (
    <>
      {players.map((p) => {
        const r1 = buildGoalkeeperReport(scoped(matchData, isFirstHalf), p);
        const r2 = buildGoalkeeperReport(scoped(matchData, isSecondHalf), p);
        const total = buildGoalkeeperReport(matchData, p);

        const items = [
          { label: "Paradas", v1: r1.totalSaves, v2: r2.totalSaves },
          { label: "Blocajes", v1: r1.saveCatch, v2: r2.saveCatch },
          { label: "Despejes", v1: r1.saveDeflect, v2: r2.saveDeflect },
          { label: "Salidas", v1: r1.exits, v2: r2.exits },
          { label: "Goles encajados", v1: r1.conceded, v2: r2.conceded },
          {
            label: "% Paradas",
            v1: r1.effectivenessPct ?? 0,
            v2: r2.effectivenessPct ?? 0,
            suffix: "%",
            maxVal: 100,
          },
        ];

        return (
          <div key={p.id} style={{ marginBottom: 28 }}>
            <div style={{ ...slStyle, color: accent }}>
              {p.name} (#{p.number}) — comparativa 1ª vs 2ª parte
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
                <div />
                <div style={{ fontSize: 8, fontWeight: 600, color: "#2563eb", textAlign: "center" }}>1ª Parte</div>
                <div style={{ fontSize: 8, fontWeight: 600, color: "#16a34a", textAlign: "center" }}>2ª Parte</div>
              </div>
              {items.map((item) => {
                const maxV = item.maxVal || Math.max(item.v1, item.v2, 1);
                const p1 = Math.round((item.v1 / maxV) * 100);
                const p2 = Math.round((item.v2 / maxV) * 100);
                return (
                  <div
                    key={item.label}
                    style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 6, alignItems: "center", marginBottom: 6 }}
                  >
                    <div style={{ fontSize: 8, color: "#64748b" }}>{item.label}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${p1}%`, height: "100%", background: "#3b82f6", borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 500, color: "#1e293b", minWidth: 22 }}>
                        {item.v1}
                        {item.suffix || ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${p2}%`, height: "100%", background: "#22c55e", borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 500, color: "#1e293b", minWidth: 22 }}>
                        {item.v2}
                        {item.suffix || ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 8, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Totales del partido
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
              {[
                { label: "Total paradas", val: total.totalSaves, color: "#16a34a" },
                { label: "Salidas", val: `${total.exitsSuccess}✓ / ${total.exitsFail}✗`, color: "#d97706" },
                { label: "Goles encajados", val: total.conceded, color: "#dc2626" },
                { label: "% Paradas", val: total.effectivenessPct === null ? "—" : `${total.effectivenessPct}%`, color: "#d97706" },
                { label: "Minutos", val: Math.round((p.individualTimeSeconds || 0) / 60), color: "#0284c7" },
              ].map((t) => (
                <div key={t.label} style={{ background: "#f8fafc", border: "0.5px solid #e2e8f0", borderRadius: 8, padding: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 7, color: "#94a3b8", textTransform: "uppercase", marginBottom: 3 }}>{t.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: t.color }}>{t.val}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

export type GoalkeeperPdfPagesProps = {
  matchData: MatchData;
  goals: number;
  opponentGoals: number;
  /** Nodos que captura handleExport. Solo el primer equipo los recibe. */
  page1Ref: React.RefObject<HTMLDivElement | null>;
  page2Ref: React.RefObject<HTMLDivElement | null>;
  page3Ref: React.RefObject<HTMLDivElement | null>;
};

export function GoalkeeperPdfPages({
  matchData,
  goals,
  opponentGoals,
  page1Ref,
  page2Ref,
  page3Ref,
}: GoalkeeperPdfPagesProps) {
  const locales = matchData.players.filter((p) => p.role === Role.GOALKEEPER && !p.isOpponent);
  const rivales = matchData.players.filter((p) => p.role === Role.GOALKEEPER && p.isOpponent);
  const equipos = [
    {
      players: locales,
      name: matchData.teamName,
      vsName: matchData.opponentName,
      accent: "#3b82f6",
      score: `${goals} — ${opponentGoals}`,
    },
    {
      players: rivales,
      name: matchData.opponentName,
      vsName: matchData.teamName,
      accent: "#ef4444",
      score: `${opponentGoals} — ${goals}`,
    },
  ].filter((t) => t.players.length > 0);

  if (equipos.length === 0) return null;
  const totalPages = equipos.length * 3;

  const tablaDe = (players: Player[], half: Half) => {
    const tramo = scoped(matchData, half);
    return new Map(players.map((p) => [p.id, buildGoalkeeperReport(tramo, p)]));
  };

  return (
    <>
      {equipos.map((team, ti) => (
        <React.Fragment key={ti}>
          {/* Página 1 · 1ª parte */}
          <div ref={ti === 0 ? page1Ref : undefined} style={pageStyle}>
            <div style={headerStyle}>
              <div>
                <div style={{ fontSize: 8, color: "#f59e0b", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 3 }}>
                  Goalkeeper Report · 1ª Parte
                </div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{team.name}</div>
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                  vs {team.vsName} · {team.score}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 8, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#1e3a5f", color: "#93c5fd", textTransform: "uppercase" }}>
                  1ª PARTE
                </div>
                <div style={{ fontSize: 8, color: "#64748b", marginTop: 6 }}>
                  {new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
                </div>
              </div>
            </div>
            <div style={slStyle}>1. estadísticas — primera parte</div>
            <GkTable players={team.players} reports={tablaDe(team.players, isFirstHalf)} accent={team.accent} />
            <p style={{ fontSize: 8, color: "#94a3b8", marginTop: 6, marginBottom: 16 }}>
              % Paradas = Paradas / (Paradas + Goles encajados) × 100. Blocajes y despejes son el
              desglose de las paradas, no se suman aparte. Las salidas no cuentan como parada.
            </p>
            <div style={slStyle}>2. mapas — primera parte</div>
            <GkCards players={team.players} matchData={matchData} half={isFirstHalf} />
            <div style={footerStyle}>
              <span>Futsal Commander Pro · Goalkeeper Report</span>
              <span>
                Página {ti * 3 + 1} / {totalPages}
              </span>
            </div>
          </div>

          {/* Página 2 · 2ª parte */}
          <div ref={ti === 0 ? page2Ref : undefined} style={pageStyle}>
            <div style={headerStyle}>
              <div>
                <div style={{ fontSize: 8, color: "#f59e0b", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 3 }}>
                  Goalkeeper Report · 2ª Parte
                </div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{team.name}</div>
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                  vs {team.vsName} · {team.score}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 8, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#1e3a2f", color: "#86efac", textTransform: "uppercase" }}>
                  2ª PARTE
                </div>
              </div>
            </div>
            <div style={slStyle}>3. estadísticas — segunda parte</div>
            <GkTable players={team.players} reports={tablaDe(team.players, isSecondHalf)} accent={team.accent} />
            <p style={{ fontSize: 8, color: "#94a3b8", marginTop: 6, marginBottom: 16 }}>
              % Paradas = Paradas / (Paradas + Goles encajados) × 100.
            </p>
            <div style={slStyle}>4. mapas — segunda parte</div>
            <GkCards players={team.players} matchData={matchData} half={isSecondHalf} />
            <div style={footerStyle}>
              <span>Futsal Commander Pro · Goalkeeper Report</span>
              <span>
                Página {ti * 3 + 2} / {totalPages}
              </span>
            </div>
          </div>

          {/* Página 3 · comparativa */}
          <div ref={ti === 0 ? page3Ref : undefined} style={pageStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: team.accent }} />
                <span style={{ fontSize: 14, fontWeight: 700 }}>{team.name} — Comparativa del partido</span>
              </div>
              <span style={{ fontSize: 8, color: "#94a3b8" }}>
                Página {ti * 3 + 3} / {totalPages}
              </span>
            </div>
            <Comparativa players={team.players} matchData={matchData} accent={team.accent} />
            <div style={footerStyle}>
              <span>Futsal Commander Pro · Goalkeeper Report</span>
              <span>
                Página {ti * 3 + 3} / {totalPages}
              </span>
            </div>
          </div>
        </React.Fragment>
      ))}
    </>
  );
}
