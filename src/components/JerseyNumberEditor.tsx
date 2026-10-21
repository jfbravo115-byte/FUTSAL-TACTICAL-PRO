/**
 * src/components/JerseyNumberEditor.tsx
 *
 * EDITOR RÁPIDO DE DORSAL, SIN SALIR DEL PARTIDO.
 *
 * Nace de un caso concreto: se empieza a analizar sin conocer la alineación
 * rival y los dorsales se van reconociendo sobre la marcha. Ir a la pantalla
 * de preparación a media posesión no es una opción, así que esto es un modal
 * compacto que solo toca una cosa —el número— y no detiene el reloj, no
 * registra ningún evento y no cambia la fase, el marcador ni la formación.
 */
import React from "react";
import { Player } from "../types/futsal";
import {
  JERSEY_ERROR_TEXT,
  JERSEY_MAX,
  JERSEY_MIN,
  UNKNOWN_NUMBER,
  duplicateHolder,
  formatJerseyNumber,
  isUnknownNumber,
  parseJerseyInput,
  playerLabel,
} from "../utils/jerseyNumber";

export type JerseyDecision =
  | { tipo: "guardar"; number: number }
  | { tipo: "intercambiar"; conId: string };

export function JerseyNumberEditor({
  player,
  players,
  teamName,
  opponentName,
  onConfirm,
  onClose,
}: {
  player: Player;
  /** La plantilla entera: hace falta para detectar duplicados del MISMO equipo. */
  players: Player[];
  teamName: string;
  opponentName: string;
  onConfirm: (decision: JerseyDecision) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = React.useState(
    isUnknownNumber(player.number) ? "" : String(player.number),
  );
  const parsed = parseJerseyInput(texto);
  const propuesto = parsed.ok ? parsed.value : null;
  const choca =
    propuesto !== null && propuesto !== player.number
      ? duplicateHolder(players, player.id, propuesto)
      : null;
  const equipo = player.isOpponent ? opponentName || "RIVAL" : teamName || "MI EQUIPO";

  const guardar = () => {
    if (!parsed.ok || propuesto === null) return;
    onConfirm({ tipo: "guardar", number: propuesto });
  };

  return (
    <>
      <div
        data-jersey-editor-backdrop
        onClick={onClose}
        className="fixed inset-0 z-[320] bg-black/75 backdrop-blur-sm"
      />
      <div
        data-jersey-editor
        role="dialog"
        aria-label={`Editar dorsal de ${playerLabel(player, players)}`}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[330] w-[88vw] max-w-xs
                   bg-[#0E1015] border border-white/15 rounded-3xl p-4 flex flex-col gap-3 shadow-2xl"
      >
        <div className="flex flex-col gap-0.5">
          <span
            className={`text-[9px] font-black uppercase tracking-widest ${
              player.isOpponent ? "text-red-400" : "text-blue-400"
            }`}
          >
            {equipo}
          </span>
          <span className="text-[13px] font-black uppercase text-white truncate">
            {playerLabel(player, players)}
          </span>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
            Dorsal actual · {formatJerseyNumber(player.number)}
          </span>
        </div>

        <input
          data-jersey-input
          autoFocus
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && parsed.ok && !choca) guardar();
            if (e.key === "Escape") onClose();
          }}
          placeholder="?"
          aria-label="Dorsal"
          className="w-full bg-white/10 border-2 border-white/15 rounded-2xl py-3 text-center
                     text-[28px] font-black text-white tabular-nums outline-none focus:border-white/40"
        />

        {parsed.ok === false && (
          <p data-jersey-error className="text-[9px] font-black uppercase text-amber-400 leading-tight">
            {JERSEY_ERROR_TEXT[parsed.reason]}
          </p>
        )}

        {/* Un duplicado silencioso es un partido mal apuntado: se avisa y se
            ofrece el intercambio, que es lo que suele haber pasado de verdad
            —dos dorsales cruzados—. */}
        {choca && (
          <div data-jersey-duplicate className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-2 flex flex-col gap-2">
            <p className="text-[9px] font-black uppercase text-amber-300 leading-tight">
              El dorsal {propuesto} ya está asignado a {playerLabel(choca, players)}
            </p>
            <button
              data-jersey-swap
              onClick={() => onConfirm({ tipo: "intercambiar", conId: choca.id })}
              className="w-full py-2 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest"
            >
              Intercambiar dorsales
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            data-jersey-unknown
            onClick={() => onConfirm({ tipo: "guardar", number: UNKNOWN_NUMBER })}
            className="py-2 rounded-xl border border-white/15 bg-white/5 text-[9px] font-black uppercase tracking-widest text-slate-300"
          >
            Dorsal desconocido
          </button>
          <button
            data-jersey-save
            disabled={!parsed.ok || !!choca}
            onClick={guardar}
            className="py-2 rounded-xl bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
          >
            Guardar
          </button>
        </div>

        <button
          data-jersey-cancel
          onClick={onClose}
          className="w-full py-1 text-[9px] font-black uppercase tracking-widest text-slate-500"
        >
          Cancelar
        </button>

        <p className="text-[8px] uppercase tracking-widest text-slate-600 text-center leading-tight">
          Dorsal de {JERSEY_MIN} a {JERSEY_MAX} · vacío = sin asignar · no toca el reloj
        </p>
      </div>
    </>
  );
}

export default JerseyNumberEditor;
