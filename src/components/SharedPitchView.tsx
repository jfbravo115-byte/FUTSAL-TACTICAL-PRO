/**
 * src/components/SharedPitchView.tsx
 *
 * EXPERIMENTO · los diez sobre una sola pista, 5 contra 5.
 *
 * LO QUE RESUELVE
 * ---------------
 * En la vista focal hay que decirle a la aplicación «ahora hablo del rival»
 * antes de registrar nada suyo. En columnas eso ya no hace falta, pero las
 * fichas están fuera del campo. Aquí están donde el entrenador las está
 * mirando: dentro de la pista, en su posición, y se tocan directamente.
 *
 * EL EQUIPO NO SE DISTINGUE SOLO POR EL COLOR
 * -------------------------------------------
 * El local va en ficha redonda y maciza; el rival, cuadrada, con doble borde y
 * una «R». En una tablet a pleno sol el color es lo primero que se pierde, y
 * aquí confundirse significa apuntarle el gol al equipo contrario.
 *
 * LAS FICHAS NO SE TAPAN
 * ----------------------
 * La separación la calcula `layoutSharedPitch` con las medidas reales de la
 * pista y de la ficha, no con un porcentaje fijo. Esta vista solo dibuja lo
 * que esa función le da: si avisa de que no caben separadas, no se ofrece.
 */
import React from "react";
import { Player, Role } from "../types/futsal";
import { DisciplinaryAura, DisciplinaryCards } from "./DisciplinaryAura";
import { disciplinaryState } from "../utils/squadModel";
import {
  DEFAULT_PITCH_METRICS,
  PitchMetrics,
  SharedPitchPlacement,
} from "../utils/sharedPitch";
import { playerClocks } from "../utils/playerClock";
import {
  bothTeamsTimeScales,
  timeLoadAriaLabel,
  timeLoadColor,
} from "../utils/timeLoadColor";
import { nombreCorto } from "./DualRosterPanel";

/** Lado en el que se dibuja cada portería, para rotularlas. */
export type GoalLabels = { left: string; right: string };

export function SharedPitchPlayers({
  placements,
  players,
  selectedId,
  onSelect,
  metrics = DEFAULT_PITCH_METRICS,
  disabled = false,
}: {
  placements: SharedPitchPlacement[];
  /** Los diez en pista, indexados por id. */
  players: Record<string, Player>;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  /** Las mismas medidas con las que se ha calculado la colocación. */
  metrics?: PitchMetrics;
  disabled?: boolean;
}) {
  // Las dos escalas de los dos equipos, de una vez por render y a partir de
  // los MISMOS datos que pintan los cronómetros: ni un temporizador más.
  const escalas = bothTeamsTimeScales(Object.values(players));

  return (
    <>
      {placements.map((pos) => {
        const p = players[pos.id];
        if (!p) return null;
        const rival = pos.side === "opponent";
        const activo = selectedId === p.id;
        const portero = p.role === Role.GOALKEEPER;
        // Los MISMOS segundos que lleva el tick del partido y el MISMO
        // formato que la ficha de la vista focal. Aquí no se cuenta nada.
        const { tot, rot } = playerClocks(p);
        // Dos escalas INDEPENDIENTES: el que más ha jugado puede acabar de
        // entrar, y es justo ese cruce el que decide una rotación.
        const suEquipo = rival ? escalas.opponent : escalas.team;
        const colorTot = timeLoadColor(p.individualTimeSeconds, suEquipo.tot);
        const colorRot = timeLoadColor(p.rotationTimeSeconds ?? 0, suEquipo.rot);

        return (
          <button
            key={p.id}
            data-shared-pitch-player={p.id}
            data-shared-pitch-side={rival ? "opponent" : "team"}
            data-shared-pitch-nudged={pos.nudged ? "1" : "0"}
            aria-pressed={activo}
            aria-label={`${rival ? "Rival" : "Local"} ${p.number} ${p.name}, total ${tot}, rotación ${rot}`}
            disabled={disabled}
            onClick={() => onSelect(p.id)}
            style={{
              left: `${pos.left}%`,
              top: `${pos.top}%`,
              width: metrics.cardWidth,
              height: metrics.cardHeight,
            }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 z-[40] overflow-hidden
              flex flex-col items-center justify-center gap-px px-1 transition-all active:scale-95
              disabled:opacity-40 rounded-lg border-2 ${
                rival
                  ? "border-double border-red-300/80 bg-red-900/85"
                  : "border-blue-200/70 bg-blue-700/85"
              } ${activo ? "ring-4 ring-white z-[60] scale-105" : ""}`}
          >
            <DisciplinaryAura state={disciplinaryState(p)} rounded="rounded-lg" inset="inset-0" />

            {/* 1 · DORSAL, que es lo que se busca primero. Con la marca del
                equipo al lado: a pleno sol el color es lo primero que se
                pierde, y confundirse aquí es apuntarle el gol al otro. */}
            <span className="flex items-baseline gap-1 leading-none">
              <span className="text-[15px] font-black text-white leading-none tabular-nums">
                {p.number}
              </span>
              <span
                className={`text-[7px] font-black uppercase leading-none ${
                  portero ? "text-amber-300" : rival ? "text-red-200" : "text-blue-100"
                }`}
              >
                {portero ? "POR" : rival ? "R" : "J"}
              </span>
            </span>

            {/* 2-3 · TOT y ROT, SIEMPRE visibles: sin tocar la ficha, sin
                desplegar nada. Es lo que decide una rotación.

                Cada uno en su cápsula y con SU escala: el color no toca el
                cuerpo de la ficha, que es lo que identifica al equipo. Y el
                color no va solo: lleva su flecha y su rótulo hablado, porque
                a pleno sol el color es lo primero que se pierde. */}
            <span
              data-shared-pitch-tot
              data-load-level={colorTot.level}
              aria-label={timeLoadAriaLabel("tot", tot, colorTot.level)}
              style={{
                color: colorTot.foreground,
                backgroundColor: colorTot.background,
                borderColor: colorTot.border,
              }}
              className="w-full rounded border px-0.5 text-[9px] font-mono font-black leading-[11px] tabular-nums text-center"
            >
              TOT {tot}<span data-load-marker className="pl-px">{colorTot.marker}</span>
            </span>
            <span
              data-shared-pitch-rot
              data-load-level={colorRot.level}
              aria-label={timeLoadAriaLabel("rot", rot, colorRot.level)}
              style={{
                color: colorRot.foreground,
                backgroundColor: colorRot.background,
                borderColor: colorRot.border,
              }}
              className="w-full rounded border px-0.5 text-[9px] font-mono font-black leading-[11px] tabular-nums text-center"
            >
              ROT {rot}<span data-load-marker className="pl-px">{colorRot.marker}</span>
            </span>

            {/* 4 · El nombre, lo último: con el dorsal delante casi nunca
                hace falta, y si no cabe se recorta —nunca ensancha la ficha—. */}
            <span className="text-[7px] font-black uppercase leading-none opacity-80 truncate w-full text-center">
              {nombreCorto(p.name)}
            </span>

            <span className="absolute top-0 right-0">
              <DisciplinaryCards yellow={p.stats.yellowCards} red={p.stats.redCards} />
            </span>
          </button>
        );
      })}
    </>
  );
}

/**
 * Los dos banquillos, FUERA de la pista.
 *
 * Dentro no caben sin tapar a los que juegan, y mezclarlos invitaría a
 * apuntarle una acción a quien está sentado. Solo uno abierto a la vez.
 */
export function SharedPitchBenches({
  teamName,
  opponentName,
  teamBench,
  opponentBench,
  open,
  onToggle,
  onSelect,
  saliente,
  disabled = false,
}: {
  teamName: string;
  opponentName: string;
  teamBench: Player[];
  opponentBench: Player[];
  open: "team" | "opponent" | null;
  onToggle: (lado: "team" | "opponent") => void;
  onSelect: (id: string) => void;
  /** Quién está seleccionado en la pista, que es a quien se sustituye. */
  saliente: { id: string; lado: "team" | "opponent"; nombre: string; dorsal: number } | null;
  disabled?: boolean;
}) {
  const lados = [
    { lado: "team" as const, nombre: teamName, banquillo: teamBench, acento: "border-blue-500/40 text-blue-300" },
    { lado: "opponent" as const, nombre: opponentName, banquillo: opponentBench, acento: "border-red-500/40 text-red-300" },
  ];
  const abierto = lados.find((l) => l.lado === open);
  /** Solo se puede cambiar dentro del equipo de quien está seleccionado. */
  const puedeCambiar = !!saliente && !!abierto && saliente.lado === abierto.lado;

  return (
    <div data-shared-pitch-benches className="shrink-0 border-t border-white/10 pt-1 mt-1">
      <div className="flex gap-1">
        {lados.map(({ lado, nombre, banquillo, acento }) => (
          <button
            key={lado}
            data-shared-bench-toggle={lado}
            aria-expanded={open === lado}
            onClick={() => onToggle(lado)}
            className={`flex-1 min-h-[32px] rounded-lg border bg-black/30 px-2 py-1 text-[8px] font-black uppercase tracking-wide hover:bg-white/10 ${acento} ${
              open === lado ? "ring-2 ring-white/40" : ""
            }`}
          >
            Banquillo {nombre} · {banquillo.length} {open === lado ? "▴" : "▾"}
          </button>
        ))}
      </div>

      {abierto && (
        <div
          data-shared-bench={abierto.lado}
          /* Alto acotado y con desplazamiento propio: si la lista pudiera
             crecer sin tope, al abrirla la pista encogería por debajo de lo
             que se validó y las fichas volverían a juntarse. */
          className="flex gap-1 flex-wrap pt-1 max-h-[96px] overflow-y-auto custom-scrollbar"
        >
          {/* Sin nadie tocado en la pista no se sabe quién sale, y adivinarlo
              es como se acaba sacando al que no era. Se dice, en vez de dejar
              fichas que no responden. */}
          <div
            data-shared-bench-hint
            className="w-full text-[7px] font-black uppercase tracking-widest text-slate-500 pb-0.5"
          >
            {!puedeCambiar
              ? "Toca primero en la pista al jugador que SALE"
              : `Entra por #${saliente!.dorsal} ${nombreCorto(saliente!.nombre)}`}
          </div>
          {abierto.banquillo.map((p) => (
            <button
              key={p.id}
              data-shared-bench-player={p.id}
              disabled={disabled || !puedeCambiar}
              onClick={() => onSelect(p.id)}
              className="relative overflow-hidden min-h-[44px] rounded-lg border border-white/10 bg-black/30 px-2 py-1 flex items-center gap-1.5 hover:bg-white/10 disabled:opacity-40"
            >
              <DisciplinaryAura state={disciplinaryState(p)} rounded="rounded-lg" inset="inset-0" />
              <span className="shrink-0 w-6 h-6 rounded bg-black/50 flex items-center justify-center text-[10px] font-black">
                {p.number}
              </span>
              <span className="text-[8px] font-black uppercase truncate max-w-[70px]">
                {nombreCorto(p.name)}
              </span>
            </button>
          ))}
          {abierto.banquillo.length === 0 && (
            <div className="text-[8px] text-slate-500 italic px-1 py-2">Sin suplentes</div>
          )}
        </div>
      )}
    </div>
  );
}

export default SharedPitchPlayers;
