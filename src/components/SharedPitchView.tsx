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
import { SharedPitchPlacement } from "../utils/sharedPitch";
import { nombreCorto } from "./DualRosterPanel";

/** Lado en el que se dibuja cada portería, para rotularlas. */
export type GoalLabels = { left: string; right: string };

export function SharedPitchPlayers({
  placements,
  players,
  selectedId,
  onSelect,
  disabled = false,
}: {
  placements: SharedPitchPlacement[];
  /** Los diez en pista, indexados por id. */
  players: Record<string, Player>;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      {placements.map((pos) => {
        const p = players[pos.id];
        if (!p) return null;
        const rival = pos.side === "opponent";
        const activo = selectedId === p.id;
        const portero = p.role === Role.GOALKEEPER;

        return (
          <button
            key={p.id}
            data-shared-pitch-player={p.id}
            data-shared-pitch-side={rival ? "opponent" : "team"}
            data-shared-pitch-nudged={pos.nudged ? "1" : "0"}
            aria-pressed={activo}
            aria-label={`${rival ? "Rival" : "Local"} ${p.number} ${p.name}`}
            disabled={disabled}
            onClick={() => onSelect(p.id)}
            style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 z-[40] min-w-[46px] min-h-[44px] w-[46px] h-[44px]
              flex flex-col items-center justify-center overflow-hidden transition-all active:scale-95
              disabled:opacity-40 ${
                rival
                  ? "rounded-md border-2 border-double border-red-300/80 bg-red-950/80"
                  : "rounded-full border-2 border-blue-200/70 bg-blue-600"
              } ${activo ? "ring-4 ring-white z-[60] scale-110" : ""}`}
          >
            <DisciplinaryAura
              state={disciplinaryState(p)}
              rounded={rival ? "rounded-md" : "rounded-full"}
              inset="inset-0"
            />
            <span
              className={`text-[13px] font-black leading-none ${
                portero ? "text-amber-300" : "text-white"
              }`}
            >
              {p.number}
            </span>
            <span className="text-[6px] font-black uppercase leading-none opacity-80 max-w-[42px] truncate">
              {portero ? "POR" : rival ? "R" : nombreCorto(p.name)}
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
