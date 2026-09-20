/**
 * src/components/DisciplinaryAura.tsx
 *
 * Aura disciplinaria: el halo amarillo o rojo que rodea a un jugador
 * amonestado o expulsado.
 *
 * POR QUÉ ES UN COMPONENTE Y NO UNAS CLASES SUELTAS
 * -------------------------------------------------
 * El jugador se dibuja en tres sitios —la pista, el banquillo y el radial de
 * CAMBIO— y cada uno tenía su propia versión del indicador: una tira de
 * 1,5 × 2,5 px en la pista, otra de 1,5 × 2 px en el radial y ninguna roja en
 * el banquillo. Con un solo componente los tres dicen lo mismo.
 *
 * SE DERIVA DEL JUGADOR, NO DE UN ESTADO PROPIO
 * ---------------------------------------------
 * La fuente es `player.stats.yellowCards` / `redCards` a través de
 * `disciplinaryState`. Por eso sobrevive a un cambio —el estado viaja con el
 * jugador, no con la casilla— y por eso desaparece solo si se borra el evento
 * de la tarjeta: no hay nada que revertir a mano.
 *
 * NO TAPA EL DORSAL NI EL NOMBRE
 * ------------------------------
 * Es un anillo por FUERA del contenedor (`-inset-1`) y no captura toques, así
 * que no cambia ni la legibilidad ni el área pulsable de la tarjeta.
 */
import React from "react";
import { DisciplinaryState } from "../utils/squadModel";

/** El contenedor debe ser `relative` y no recortar (`overflow-visible`). */
export function DisciplinaryAura({
  state,
  rounded = "rounded-xl",
  inset = "-inset-1",
}: {
  state: DisciplinaryState;
  rounded?: string;
  /** `inset-0` cuando el contenedor recorta (`overflow-hidden`). */
  inset?: string;
}) {
  if (state === "none") return null;
  const isRed = state === "red";
  return (
    <span
      aria-hidden
      title={isRed ? "Expulsado" : "Amonestado"}
      className={`pointer-events-none absolute ${inset} ${rounded} z-[5] ring-2 ${
        isRed
          ? "ring-red-500 shadow-[0_0_14px_3px_rgba(239,68,68,0.75)]"
          : "ring-yellow-400 shadow-[0_0_14px_3px_rgba(250,204,21,0.7)]"
      }`}
    />
  );
}

/** Chips de tarjeta, para acompañar al aura donde ya se mostraban. */
export function DisciplinaryCards({ yellow, red }: { yellow: number; red: number }) {
  if (yellow <= 0 && red <= 0) return null;
  return (
    <span className="flex gap-0.5">
      {yellow > 0 && (
        <span
          title={`Amarillas: ${yellow}`}
          className="w-2 h-3 bg-yellow-400 rounded-[1px] border border-black/30 shadow-sm"
        />
      )}
      {red > 0 && (
        <span
          title="Roja"
          className="w-2 h-3 bg-red-600 rounded-[1px] border border-black/30 shadow-sm"
        />
      )}
    </span>
  );
}

export default DisciplinaryAura;
