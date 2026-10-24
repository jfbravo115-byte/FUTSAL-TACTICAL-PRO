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

import { SHORT_NAME_CHARS, playerDisplayIdentity } from "../utils/playerIdentity";
import { useLongPress } from "../hooks/useLongPress";

/** Lado en el que se dibuja cada portería, para rotularlas. */
export type GoalLabels = { left: string; right: string };

export function SharedPitchPlayers({
  placements,
  players,
  selectedId,
  onSelect,
  onEditNumber,
  metrics = DEFAULT_PITCH_METRICS,
  disabled = false,
}: {
  placements: SharedPitchPlacement[];
  /** Los diez en pista, indexados por id. */
  players: Record<string, Player>;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  /** Pulsación mantenida sobre una ficha: abrir el editor de dorsal. */
  onEditNumber?: (id: string) => void;
  /** Las mismas medidas con las que se ha calculado la colocación. */
  metrics?: PitchMetrics;
  disabled?: boolean;
}) {
  // Las dos escalas de los dos equipos, de una vez por render y a partir de
  // los MISMOS datos que pintan los cronómetros: ni un temporizador más.
  const escalas = bothTeamsTimeScales(Object.values(players));
  const todos = Object.values(players);

  return (
    <>
      {placements.map((pos) => {
        const p = players[pos.id];
        if (!p) return null;
        return (
          <FichaEnPista
            key={p.id}
            player={p}
            todos={todos}
            pos={pos}
            escalas={escalas}
            metrics={metrics}
            activo={selectedId === p.id}
            onSelect={onSelect}
            onEditNumber={onEditNumber}
            disabled={disabled}
          />
        );
      })}
    </>
  );
}

/**
 * UNA ficha. Es un componente propio porque cada una necesita su propia
 * máquina de pulsación: toque corto para registrar, pulsación mantenida para
 * corregir el dorsal.
 */
function FichaEnPista({
  player: p,
  todos,
  pos,
  escalas,
  metrics,
  activo,
  onSelect,
  onEditNumber,
  disabled,
}: {
  player: Player;
  todos: Player[];
  pos: SharedPitchPlacement;
  escalas: ReturnType<typeof bothTeamsTimeScales>;
  metrics: PitchMetrics;
  activo: boolean;
  onSelect: (id: string) => void;
  onEditNumber?: (id: string) => void;
  disabled: boolean;
}) {
  const { pending, handlers } = useLongPress({
    onTap: () => onSelect(p.id),
    onLongPress: onEditNumber ? () => onEditNumber(p.id) : undefined,
    disabled,
  });

  const rival = pos.side === "opponent";
  const portero = p.role === Role.GOALKEEPER;
  // Los MISMOS segundos que lleva el tick del partido y el MISMO formato que
  // la ficha de la vista focal. Aquí no se cuenta nada.
  const { tot, rot } = playerClocks(p);
  // Dos escalas INDEPENDIENTES: el que más ha jugado puede acabar de entrar,
  // y es justo ese cruce el que decide una rotación.
  const suEquipo = rival ? escalas.opponent : escalas.team;
  const colorTot = timeLoadColor(p.individualTimeSeconds, suEquipo.tot);
  const colorRot = timeLoadColor(p.rotationTimeSeconds ?? 0, suEquipo.rot);
  // Qué dato manda en ESTA ficha. No lo decide el bando: lo deciden los datos
  // que haya —nombre real, dorsal conocido o ninguno de los dos—.
  //
  // El ancho es MEDIDO en el preview, no estimado. La línea útil de la ficha
  // son 64 px; el dorsal «#10» a 8 px ocupa 15,6 y los huecos 2, así que al
  // nombre le quedan 46,4. A 10 px entran ahí «JUAN P.» (42,3) y «ALEJ. G.»
  // (44,6), que son los dos casos del encargo.
  //
  // Al portero se le da un carácter menos porque conserva marca de puesto:
  // «POR» entero son 16,2 px y dejaría el nombre en «M. V.», así que con
  // nombre delante se reduce a «P» —4,5 px— y el nombre cabe igual.
  const ident = playerDisplayIdentity(p, {
    players: todos,
    maxCaracteres: portero ? 7 : SHORT_NAME_CHARS,
  });
  const conNombre = ident.kind === "nombre";

  return (
          <button
            data-shared-pitch-player={p.id}
            data-shared-pitch-side={rival ? "opponent" : "team"}
            data-shared-pitch-nudged={pos.nudged ? "1" : "0"}
            data-long-press={pending ? "1" : "0"}
            data-display-kind={ident.kind}
            aria-pressed={activo}
            /* El bando se dice SOLO cuando no lo dice ya la identidad: quien
               no tiene nombre se llama «RIVAL A» o «LOCAL C» y repetirlo
               sonaría «Rival RIVAL A». Quien sí lo tiene necesita el bando,
               porque «Juan Pérez» a secas no dice de qué equipo es. */
            aria-label={`${conNombre ? `${rival ? "Rival" : "Local"} ` : ""}${ident.aria}${portero ? ", portero" : ""}, tiempo total ${tot}, rotación ${rot}. Mantén pulsado para cambiar el dorsal`}
            disabled={disabled}
            {...handlers}
            style={{
              left: `${pos.left}%`,
              top: `${pos.top}%`,
              width: metrics.cardWidth,
              height: metrics.cardHeight,
            }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 z-[40] overflow-hidden
              flex flex-col items-center justify-center gap-px px-0.5 transition-all active:scale-95
              disabled:opacity-40 rounded-lg border-2 ${
                rival
                  ? "border-double border-red-300/80 bg-red-900/85"
                  : "border-blue-200/70 bg-blue-700/85"
              } ${activo ? "ring-4 ring-white z-[60] scale-105" : ""}`}
          >
            <DisciplinaryAura state={disciplinaryState(p)} rounded="rounded-lg" inset="inset-0" />

            {/* Progreso de la pulsación mantenida: un borde que se cierra en
                los 1.200 ms. No mueve la ficha ni tapa los cronómetros, y
                desaparece en cuanto se suelta o se arrastra. */}
            {pending && (
              <span
                data-long-press-ring
                aria-hidden
                className="absolute inset-0 rounded-lg ring-2 ring-white/80 animate-pulse pointer-events-none"
              />
            )}

            {/* 1 · QUIÉN ES, en una sola línea y por orden de utilidad.

                Con nombre real manda el NOMBRE: a los nuestros los conocemos
                así, y traducir «7 → Juan» de cabeza cuesta el medio segundo
                que separa apuntar la acción de perderla. Sin nombre manda el
                dorsal, y sin dorsal la letra provisional.

                El nombre lleva `min-w-0 truncate`: al estrecharse se encoge
                ÉL, nunca empuja al dorsal ni a la marca de equipo fuera de
                los 72 px. Por eso la ficha no puede desbordar por largo que
                sea el nombre.

                La marca de equipo/rol se queda siempre: a pleno sol el color
                es lo primero que se pierde, y confundirse aquí es apuntarle
                el gol al otro. */}
            <span className="flex w-full items-baseline justify-center gap-0.5 leading-none min-w-0">
              {conNombre ? (
                <>
                  <span
                    data-shared-pitch-name
                    title={ident.nombreCompleto ?? undefined}
                    className="min-w-0 truncate text-[10px] font-black uppercase text-white leading-none"
                  >
                    {ident.principal}
                  </span>
                  <span
                    data-shared-pitch-jersey
                    className="shrink-0 text-[8px] font-black text-white/85 leading-none tabular-nums"
                  >
                    #{ident.secundario}
                  </span>
                </>
              ) : (
                <>
                  <span
                    {...(ident.kind === "provisional" ? { "data-provisional-label": "" } : {})}
                    data-shared-pitch-jersey
                    className="text-[15px] font-black text-white leading-none tabular-nums"
                  >
                    {ident.principal}
                  </span>
                  {ident.kind === "provisional" && (
                    <span className="shrink-0 text-[9px] font-black text-white/85 leading-none">
                      ?
                    </span>
                  )}
                </>
              )}
              {/* Con el nombre delante no caben las tres cosas en 64 px, y el
                  indicador de posición es lo que el encargo manda quitar
                  primero. Se quita el del jugador de campo —«J»/«R»—, cuyo
                  bando sigue leyéndose en el relleno, en el borde doble, en
                  la mitad de pista que ocupa la ficha y en el rótulo hablado.
                  El del portero NO se quita: ser portero cambia qué acciones
                  tienen sentido y no se deduce de nada más en la ficha. Lo
                  que se hace es encogerlo a «P» —4,5 px en vez de 16,2—, que
                  sigue sin depender del color. */}
              {(!conNombre || portero) && (
                <span
                  data-role-mark
                  className={`shrink-0 text-[7px] font-black uppercase leading-none ${
                    portero ? "text-amber-300" : rival ? "text-red-200" : "text-blue-100"
                  }`}
                >
                  {portero ? (conNombre ? "P" : "POR") : rival ? "R" : "J"}
                </span>
              )}
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
              /* `whitespace-nowrap`: «TOT 01:54↑» cabía por los pelos y se
                 partía en dos líneas, lo que subía la cápsula a 24 px y
                 desbordaba la ficha recortando el dorsal —medido—. */
              className="w-full rounded border px-0.5 text-[9px] font-mono font-black leading-[11px] tabular-nums text-center whitespace-nowrap"
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
              /* `whitespace-nowrap`: «TOT 01:54↑» cabía por los pelos y se
                 partía en dos líneas, lo que subía la cápsula a 24 px y
                 desbordaba la ficha recortando el dorsal —medido—. */
              className="w-full rounded border px-0.5 text-[9px] font-mono font-black leading-[11px] tabular-nums text-center whitespace-nowrap"
            >
              ROT {rot}<span data-load-marker className="pl-px">{colorRot.marker}</span>
            </span>

            <span className="absolute top-0 right-0">
              <DisciplinaryCards yellow={p.stats.yellowCards} red={p.stats.redCards} />
            </span>

            {/* Quien no tiene nombre pero SÍ dorsal lleva además su letra:
                es lo único que lo distinguirá del resto si más tarde se le
                quita el número. Cuando no hay ni nombre ni dorsal la letra ya
                va arriba como información principal, y repetirla aquí sería
                gastar la única línea libre en decir dos veces lo mismo. */}
            {ident.kind === "dorsal" && (
              <span
                data-provisional-label
                /* `h-[7px]` con su propio `leading`: sin altura fija, la caja
                   de línea del tipo se pasaba 1 px del borde inferior y la
                   ficha declaraba desbordamiento. No cambia nada visible:
                   la etiqueta es de 6 px y sigue entera. */
                className="absolute bottom-0 left-0 right-0 h-[7px] overflow-hidden text-[6px] font-black uppercase tracking-widest text-white/70 leading-[7px]"
              >
                {ident.secundario}
              </span>
            )}
          </button>
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
  players,
  teamBench,
  opponentBench,
  open,
  onToggle,
  onSelect,
  onEditNumber,
  saliente,
  disabled = false,
}: {
  teamName: string;
  opponentName: string;
  /** La plantilla ENTERA: la letra provisional se cuenta sobre ella, no sobre
   *  el banquillo, o un suplente cambiaría de letra al salir a pista. */
  players: Player[];
  teamBench: Player[];
  opponentBench: Player[];
  open: "team" | "opponent" | null;
  onToggle: (lado: "team" | "opponent") => void;
  onSelect: (id: string) => void;
  /** Pulsación mantenida sobre un suplente: editar su dorsal. */
  onEditNumber?: (id: string) => void;
  /** Quién está seleccionado en la pista, que es a quien se sustituye. */
  saliente: { id: string; lado: "team" | "opponent" } | null;
  disabled?: boolean;
}) {
  const lados = [
    { lado: "team" as const, nombre: teamName, banquillo: teamBench, acento: "border-blue-500/40 text-blue-300" },
    { lado: "opponent" as const, nombre: opponentName, banquillo: opponentBench, acento: "border-red-500/40 text-red-300" },
  ];
  const abierto = lados.find((l) => l.lado === open);
  /** Solo se puede cambiar dentro del equipo de quien está seleccionado. */
  const puedeCambiar = !!saliente && !!abierto && saliente.lado === abierto.lado;

  /**
   * A quién se sustituye, dicho como se le llama en su ficha: por el nombre
   * si lo tiene, por el dorsal si no. Decir «Entra por #7» a quien está
   * mirando una pista llena de nombres obliga a buscar quién era el 7.
   */
  const enPista = saliente ? players.find((p) => p.id === saliente.id) : undefined;
  const identSaliente = enPista ? playerDisplayIdentity(enPista, { players, maxCaracteres: 14 }) : null;
  const textoSaliente = identSaliente
    ? identSaliente.kind === "nombre"
      ? `${identSaliente.principal} · #${identSaliente.dorsal}`
      : `#${identSaliente.dorsal} ${identSaliente.kind === "dorsal" ? identSaliente.letra : ""}`.trim()
    : "";

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
              ? "Toca primero en la pista al jugador que SALE · mantén pulsado para cambiar dorsal"
              : `Entra por ${textoSaliente}`}
          </div>
          {abierto.banquillo.map((p) => (
            <FichaDeBanquillo
              key={p.id}
              player={p}
              todos={players}
              onSelect={onSelect}
              onEditNumber={onEditNumber}
              disabled={disabled || !puedeCambiar}
            />
          ))}
          {abierto.banquillo.length === 0 && (
            <div className="text-[8px] text-slate-500 italic px-1 py-2">Sin suplentes</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Un suplente del banquillo. Mismo gesto que en la pista: toque corto para
 * que entre, pulsación mantenida para corregirle el dorsal —que es
 * precisamente donde más falta hace, porque al rival se le reconocen los
 * números según van saliendo—.
 */
function FichaDeBanquillo({
  player: p,
  todos,
  onSelect,
  onEditNumber,
  disabled,
}: {
  player: Player;
  todos: Player[];
  onSelect: (id: string) => void;
  onEditNumber?: (id: string) => void;
  disabled: boolean;
}) {
  // Aquí cabe más texto que en la pista, así que el nombre se abrevia menos.
  const ident = playerDisplayIdentity(p, { players: todos, maxCaracteres: 10 });
  const { pending, handlers } = useLongPress({
    onTap: () => onSelect(p.id),
    onLongPress: onEditNumber ? () => onEditNumber(p.id) : undefined,
    // El editor funciona aunque el cambio no esté permitido todavía: no hace
    // falta elegir a quién sustituye para poder corregirle el número.
    disabled: false,
  });
  return (
    <button
      data-shared-bench-player={p.id}
      data-long-press={pending ? "1" : "0"}
      disabled={disabled && !onEditNumber}
      data-display-kind={ident.kind}
      aria-label={`${ident.aria}. Mantén pulsado para cambiar el dorsal`}
      {...handlers}
      onClick={(e) => {
        handlers.onClick(e);
        if (disabled) e.preventDefault();
      }}
      className={`relative overflow-hidden min-h-[44px] rounded-lg border px-2 py-1 flex items-center gap-1.5 hover:bg-white/10 ${
        disabled ? "opacity-40 border-white/10 bg-black/30" : "border-white/10 bg-black/30"
      } ${pending ? "ring-2 ring-white/80" : ""}`}
    >
      <DisciplinaryAura state={disciplinaryState(p)} rounded="rounded-lg" inset="inset-0" />
      {/* El dorsal sigue en su chapa, porque es el ancla al acta. Lo que
          cambia es el texto de al lado: el nombre cuando lo hay —que es lo
          que el analista está leyendo— y la letra estable cuando no, en vez
          del «PJ RIVAL 1» que no distinguía a nadie. */}
      <span className="shrink-0 w-6 h-6 rounded bg-black/50 flex items-center justify-center text-[10px] font-black">
        {ident.dorsal}
      </span>
      <span
        data-shared-bench-name
        title={ident.nombreCompleto ?? undefined}
        className={`font-black uppercase truncate max-w-[70px] ${
          ident.kind === "nombre" ? "text-[9px]" : "text-[8px] text-white/70"
        }`}
      >
        {ident.kind === "nombre" ? ident.principal : ident.letra}
      </span>
    </button>
  );
}

export default SharedPitchPlayers;
