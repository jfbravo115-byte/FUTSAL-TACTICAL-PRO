/**
 * src/components/SetPieceMiniPitch.tsx
 *
 * La mini pista de la ventana de balón parado: se TOCA la esquina del córner
 * o la zona de la falta, sin leer ni elegir códigos.
 *
 * Se dibuja siempre desde quien ejecuta —ataca hacia la derecha, su izquierda
 * arriba— y la traducción a los datos canónicos la hace, sin excepciones,
 * `utils/setPieceVisualZones`. Aquí solo se pinta y se devuelve lo tocado.
 *
 * ACCESIBLE
 * ---------
 * Cada zona es un `<button>` con su frase completa en `aria-label`, estado en
 * `aria-pressed`, anillo de foco visible al llegar con el teclado y un área
 * táctil de al menos 48 px.
 */
import React from "react";
import { CornerSide } from "../utils/cornerModel";
import { Zone12Id } from "../utils/fieldZones";
import {
  FREE_KICK_COLUMNS,
  FREE_KICK_ROWS,
  VISUAL_CORNERS,
  VISUAL_CORNER_LABEL,
  VisualCorner,
  cornerSideFromVisual,
  describeFreeKickLocation,
  describeVisualCorner,
  freeKickZoneFromCell,
  visualCornerFor,
} from "../utils/setPieceVisualZones";

const foco =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-amber-300";

/** La pista dibujada: césped, líneas, porterías y los rótulos de orientación. */
function Pista({ children, team }: { children: React.ReactNode; team: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[9px] font-black uppercase tracking-wide text-slate-400 px-1">
        <span>◀ Portería de {team}</span>
        <span className="text-emerald-300">Ataca ▶ portería rival</span>
      </div>
      <div
        data-mini-pitch
        className="relative w-full rounded-xl border-2 border-emerald-200/40 bg-emerald-900/50 overflow-hidden"
        style={{ aspectRatio: "2 / 1" }}
      >
        {/* Líneas: medio campo, círculo central, áreas y porterías. Solo
            decoración: no capturan toques. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-1/2 w-px bg-emerald-100/30" />
          <div className="absolute left-1/2 top-1/2 h-[30%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-100/30" />
          <div className="absolute left-0 top-1/2 h-[56%] w-[13%] -translate-y-1/2 rounded-r-full border border-l-0 border-emerald-100/30" />
          <div className="absolute right-0 top-1/2 h-[56%] w-[13%] -translate-y-1/2 rounded-l-full border border-r-0 border-emerald-100/30" />
          <div className="absolute left-0 top-1/2 h-[20%] w-1.5 -translate-y-1/2 bg-slate-300/70" />
          <div className="absolute right-0 top-1/2 h-[20%] w-1.5 -translate-y-1/2 bg-emerald-300" />
        </div>
        {children}
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 px-1">
        <span>Arriba: su izquierda</span>
        <span>Abajo: su derecha</span>
      </div>
    </div>
  );
}

/** La frase elegida, con «Cambiar zona». */
function Seleccion({ texto, onClear }: { texto: string; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-violet-400/50 bg-violet-500/15 px-3 py-2">
      <span data-mini-pitch-selection role="status" className="text-[11px] font-black text-white">
        {texto}
      </span>
      <button
        type="button"
        data-mini-pitch-clear
        onClick={onClear}
        className={`min-h-[44px] shrink-0 rounded-lg border border-white/15 px-3 text-[10px] font-black uppercase text-slate-200 hover:bg-white/10 ${foco}`}
      >
        Cambiar zona
      </button>
    </div>
  );
}

const ESQUINA_POS: Record<VisualCorner, string> = {
  "top-left": "left-1 top-1",
  "top-right": "right-1 top-1",
  "bottom-left": "left-1 bottom-1",
  "bottom-right": "right-1 bottom-1",
};

/** Córner: las cuatro esquinas; solo las dos de la portería rival se pueden tocar. */
export function CornerMiniPitch({
  value,
  onChange,
  executingTeam,
}: {
  value: CornerSide | undefined;
  onChange: (side: CornerSide | undefined) => void;
  executingTeam: string;
}) {
  const elegida = value ? visualCornerFor(value) : undefined;
  return (
    <div className="space-y-2" data-corner-picker>
      <Pista team={executingTeam}>
        {VISUAL_CORNERS.map((corner) => {
          const side = cornerSideFromVisual(corner);
          const activa = elegida === corner;
          const etiqueta = side
            ? `Córner desde ${VISUAL_CORNER_LABEL[corner]}`
            : `${VISUAL_CORNER_LABEL[corner]}: junto a la portería de ${executingTeam}, aquí no se saca un córner a favor`;
          return (
            <button
              key={corner}
              type="button"
              data-visual-corner={corner}
              aria-label={etiqueta}
              aria-pressed={side ? activa : undefined}
              disabled={!side}
              title={etiqueta}
              onClick={() => side && onChange(side)}
              className={`absolute ${ESQUINA_POS[corner]} h-14 w-14 rounded-full border-2 text-lg font-black transition-all ${foco} ${
                !side
                  ? "cursor-not-allowed border-dashed border-white/15 bg-black/20 text-white/20"
                  : activa
                    ? "border-amber-300 bg-amber-400 text-slate-950 shadow-[0_0_0_4px_rgba(251,191,36,0.35)]"
                    : "border-white/70 bg-white/10 text-white hover:bg-white/25"
              }`}
            >
              <span aria-hidden>{!side ? "×" : activa ? "✓" : "●"}</span>
            </button>
          );
        })}
      </Pista>
      {value ? (
        <Seleccion texto={describeVisualCorner(value)} onClear={() => onChange(undefined)} />
      ) : (
        <p className="text-[9px] text-slate-500">Toca la esquina desde la que se saca.</p>
      )}
    </div>
  );
}

/** Falta: 12 zonas tocables, las mismas de los mapas, sin un solo código. */
export function FreeKickMiniPitch({
  value,
  onChange,
  executingTeam,
}: {
  value: Zone12Id | undefined;
  onChange: (zone: Zone12Id | undefined) => void;
  executingTeam: string;
}) {
  return (
    <div className="space-y-2" data-free-kick-picker>
      <Pista team={executingTeam}>
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${FREE_KICK_COLUMNS.length}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${FREE_KICK_ROWS.length}, minmax(48px, 1fr))`,
          }}
        >
          {FREE_KICK_ROWS.map((_, row) =>
            FREE_KICK_COLUMNS.map((__, column) => {
              const zona = freeKickZoneFromCell(row, column);
              const activa = value === zona;
              const etiqueta = describeFreeKickLocation(zona)!;
              return (
                <button
                  key={zona}
                  type="button"
                  data-visual-zone={`${row}-${column}`}
                  aria-label={etiqueta}
                  aria-pressed={activa}
                  title={etiqueta}
                  onClick={() => onChange(activa ? undefined : zona)}
                  className={`min-h-[48px] border border-emerald-100/15 transition-all ${foco} ${
                    activa
                      ? "bg-amber-400/80 text-slate-950"
                      : "bg-transparent text-transparent hover:bg-white/15"
                  }`}
                >
                  <span aria-hidden className="text-base font-black">{activa ? "✓" : ""}</span>
                </button>
              );
            }),
          )}
        </div>
      </Pista>
      {value ? (
        <Seleccion texto={describeFreeKickLocation(value)!} onClear={() => onChange(undefined)} />
      ) : (
        <p className="text-[9px] text-slate-500">
          Toca la zona aproximada de la falta (opcional).
        </p>
      )}
    </div>
  );
}
