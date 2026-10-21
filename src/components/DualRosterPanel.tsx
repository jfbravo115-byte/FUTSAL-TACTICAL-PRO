/**
 * src/components/DualRosterPanel.tsx
 *
 * EXPERIMENTO · la plantilla de UN equipo, siempre visible y seleccionable.
 *
 * LO QUE CAMBIA RESPECTO A LA VISTA FOCAL
 * ---------------------------------------
 * En la vista validada, para registrar algo del rival hay que decirle antes a
 * la aplicación «ahora hablo del rival». Aquí no: se toca al jugador y su
 * equipo queda decidido por ser suyo. El panel no sabe nada de `pitchView`.
 *
 * EL EQUIPO NO SE DISTINGUE SOLO POR EL COLOR
 * -------------------------------------------
 * Cada lado lleva su nombre, su inicial en un escudo y un borde propio. En una
 * tablet a pleno sol el color es lo primero que se pierde, y confundir las dos
 * plantillas aquí significa apuntarle la acción al equipo equivocado.
 */
import { formatJerseyNumber } from "../utils/jerseyNumber";
import React from "react";
import { Player, Role } from "../types/futsal";
import { DisciplinaryAura, DisciplinaryCards } from "./DisciplinaryAura";
import { disciplinaryState } from "../utils/squadModel";

export type DualRosterOrientation = "column" | "row";

/**
 * Nombre corto de la ficha.
 *
 * El apellido es lo útil cuando existe, pero una plantilla de prueba —o un
 * equipo rival apuntado a vuelapluma— se llama «Jugador 1» o «PJ RIVAL 2», y
 * quedarse con la última palabra deja la ficha diciendo «1». Si la última
 * palabra no identifica a nadie, se enseña el nombre entero y que lo recorte
 * el CSS.
 */
export function nombreCorto(name: string): string {
  const limpio = (name || "").trim();
  if (!limpio) return "";
  const partes = limpio.split(/\s+/);
  const ultima = partes[partes.length - 1];
  const inservible = partes.length < 2 || /^[\d.#-]+$/.test(ultima) || ultima.length < 3;
  return inservible ? limpio : ultima;
}

export function DualRosterPanel({
  teamName,
  logo,
  isOpponent,
  onPitch,
  bench,
  selectedId,
  onSelect,
  benchOpen,
  onToggleBench,
  onBenchSelect,
  orientation = "column",
  disabled = false,
}: {
  teamName: string;
  logo?: string;
  isOpponent: boolean;
  onPitch: Player[];
  bench: Player[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  benchOpen: boolean;
  onToggleBench: () => void;
  onBenchSelect: (id: string) => void;
  orientation?: DualRosterOrientation;
  disabled?: boolean;
}) {
  const acento = isOpponent
    ? { texto: "text-red-300", borde: "border-red-500/40", fondo: "bg-red-950/25", sel: "bg-red-500 text-slate-950 border-red-200" }
    : { texto: "text-blue-300", borde: "border-blue-500/40", fondo: "bg-blue-950/25", sel: "bg-blue-500 text-slate-950 border-blue-200" };

  const ficha = (p: Player) => {
    const activo = selectedId === p.id;
    return (
      <button
        key={p.id}
        data-roster-player={p.id}
        data-roster-side={isOpponent ? "opponent" : "team"}
        aria-pressed={activo}
        disabled={disabled}
        onClick={() => onSelect(p.id)}
        className={`relative overflow-hidden min-h-[44px] rounded-xl border-2 px-1.5 py-1 flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 ${
          activo ? `${acento.sel} ring-2 ring-white` : `bg-black/30 ${acento.borde} hover:bg-black/20`
        } ${orientation === "row" ? "flex-1 min-w-0 justify-center" : "w-full"}`}
      >
        <DisciplinaryAura state={disciplinaryState(p)} rounded="rounded-xl" inset="inset-0" />
        <span
          className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black ${
            p.role === Role.GOALKEEPER ? "bg-amber-500 text-black" : activo ? "bg-black/30" : "bg-black/50 text-white"
          }`}
        >
          {formatJerseyNumber(p)}
        </span>
        <span className="text-[9px] font-black uppercase truncate min-w-0">
          {nombreCorto(p.name)}
        </span>
        {p.role === Role.GOALKEEPER && (
          <span className="text-[7px] font-black uppercase opacity-70 shrink-0">POR</span>
        )}
        {activo && <span className="text-[8px] font-black shrink-0">●</span>}
        <span className="absolute top-0 right-0">
          <DisciplinaryCards yellow={p.stats.yellowCards} red={p.stats.redCards} />
        </span>
      </button>
    );
  };

  return (
    <div
      data-roster-panel={isOpponent ? "opponent" : "team"}
      className={`rounded-2xl border ${acento.borde} ${acento.fondo} p-1.5 flex flex-col gap-1 min-h-0 ${
        orientation === "row" ? "w-full shrink-0" : "h-full min-h-0 overflow-hidden"
      }`}
    >
      <div className="flex items-center gap-1.5 px-0.5 shrink-0 min-h-[24px]">
        <span className={`shrink-0 w-5 h-5 rounded-md border ${acento.borde} bg-black/40 flex items-center justify-center text-[9px] font-black ${acento.texto}`}>
          {logo ? <img src={logo} alt="" className="w-full h-full object-contain rounded-md" /> : (teamName || "?").charAt(0).toUpperCase()}
        </span>
        <span className={`text-[9px] font-black uppercase truncate ${acento.texto}`} title={teamName}>
          {teamName}
        </span>
        <button
          data-roster-bench-toggle={isOpponent ? "opponent" : "team"}
          aria-expanded={benchOpen}
          onClick={onToggleBench}
          className="ml-auto shrink-0 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[8px] font-black uppercase text-slate-300 hover:bg-white/10"
        >
          Banquillo {benchOpen ? "▴" : "▾"}
        </button>
      </div>

      {/* En columna la lista TIENE que poder desplazarse: a 1024×768 las
          cinco fichas más la cabecera no caben en el alto del panel, y sin
          esto las dos últimas quedaban dibujadas por debajo de la barra de
          acciones —medido: inalcanzables con elementFromPoint—. */}
      <div
        className={
          orientation === "row"
            ? "flex gap-1 w-full"
            : "flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto custom-scrollbar"
        }
      >
        {onPitch.map(ficha)}
        {onPitch.length === 0 && (
          <div className="text-[8px] text-slate-500 italic px-1 py-2">Sin jugadores en pista</div>
        )}
      </div>

      {benchOpen && (
        <div data-roster-bench={isOpponent ? "opponent" : "team"} className="border-t border-white/10 pt-1 mt-0.5">
          <div className="text-[7px] font-black uppercase tracking-widest text-slate-500 pb-1">
            Banquillo · {bench.length}
          </div>
          {/* Se reutiliza el flujo de sustitución existente: este panel no
              reimplementa rotaciones, solo ofrece otra puerta al mismo botón. */}
          <div className={orientation === "row" ? "flex gap-1 flex-wrap" : "grid grid-cols-2 gap-1"}>
            {bench.map((p) => (
              <button
                key={p.id}
                data-roster-bench-player={p.id}
                disabled={disabled}
                onClick={() => onBenchSelect(p.id)}
                className="relative overflow-hidden min-h-[40px] rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 flex items-center gap-1.5 hover:bg-white/10 disabled:opacity-40"
              >
                <DisciplinaryAura state={disciplinaryState(p)} rounded="rounded-lg" inset="inset-0" />
                <span className="shrink-0 w-5 h-5 rounded bg-black/50 flex items-center justify-center text-[9px] font-black">
                  {formatJerseyNumber(p)}
                </span>
                <span className="text-[8px] font-black uppercase truncate">{nombreCorto(p.name)}</span>
              </button>
            ))}
            {bench.length === 0 && (
              <div className="text-[8px] text-slate-500 italic px-1">Sin suplentes</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DualRosterPanel;
