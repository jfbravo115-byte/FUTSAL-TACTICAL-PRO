/**
 * src/components/SetPieceSequenceModal.tsx
 *
 * UNA SOLA VENTANA PARA TODA LA JUGADA.
 *
 * Antes, registrar un córner que acababa en gol eran dos capturas separadas:
 * el córner por un lado, y después buscar otra vez al jugador para anotar el
 * remate. En directo eso se traduce en jugadas a medio registrar, porque el
 * partido no espera. Aquí se declara todo de una vez —quién saca, cómo, quién
 * remata, en qué acaba— y al confirmar sale una jugada entera o no sale nada.
 *
 * NO ES UN ASISTENTE DE PASOS
 * ---------------------------
 * Es un formulario con secciones que aparecen cuando hacen falta. Un paso a
 * paso obligaría a volver atrás para corregir el equipo, y en directo eso
 * cuesta más que verlo todo junto. Las secciones del remate solo se muestran
 * si el desenlace es tiro o gol, y las de la pérdida solo si es pérdida: no
 * se pide lo que no aplica.
 *
 * CANCELAR NO GUARDA NADA
 * -----------------------
 * El borrador vive aquí dentro hasta CONFIRMAR. No hay escritura parcial, ni
 * evento creado "mientras tanto" que haya que limpiar si el operador se
 * arrepiente.
 *
 * LO QUE ESTA VENTANA NO DECIDE
 * -----------------------------
 * No toca el reloj, ni la fase, ni la formación, ni la vista de pista.
 * Devuelve un borrador y se aparta. Quien lo materializa es quien sabe en qué
 * momento del partido estamos.
 */
import React, { useMemo, useState } from "react";
import { GoalieAction, Player, Role } from "../types/futsal";
import { CornerSide, formatCornerLabel } from "../utils/cornerModel";
import { ZONE_12_IDS, Zone12Id } from "../utils/fieldZones";
import { GOAL_OUT_ID, GOAL_ZONE_IDS } from "../utils/goalZones";
import { GOALIE_ACTION_LABEL, GOALIE_RESPONSES } from "../utils/goalkeeperActions";
import { playerDisplayIdentity } from "../utils/playerIdentity";
import {
  MODALITIES_BY_ROOT,
  SEQUENCE_OUTCOME_LABEL,
  SEQUENCE_OUTCOMES,
  SET_PIECE_MODALITY_LABEL,
  SET_PIECE_ROOT_LABEL,
  SequenceOutcome,
  SetPieceModality,
  SetPieceRootKind,
  SetPieceSequenceDraft,
  THROW_IN_LOSS_SUBTYPES,
  THROW_IN_LOSS_SUBTYPE_LABEL,
  THROW_IN_SECTORS,
  THROW_IN_SIDES,
  THROW_IN_SIDE_LABEL,
  ThrowInLossSubType,
  ThrowInSector,
  ThrowInSide,
  outcomeCreatesEvent,
} from "../utils/setPieceSequence";

/** Quien no se identifica tiene su propio valor, distinto de «nadie». */
const SIN_IDENTIFICAR = "__sin_identificar__";

export type SetPieceSequenceModalProps = {
  root: SetPieceRootKind;
  teamName: string;
  opponentName: string;
  players: Player[];
  /** Bando sugerido. El operador puede corregirlo sin salir de la ventana. */
  defaultIsOpponent: boolean;
  /** Desde el menú radial llega ya elegido quién saca. */
  presetTakerId?: string;
  presetCornerSide?: CornerSide;
  /** Banda nacida de un despeje: conserva el enlace con aquel evento. */
  fromDeflectEventId?: string;
  /** El portero que encara el remate, por bando ejecutor. */
  targetGoalkeeperIdFor: (isOpponent: boolean) => string | undefined;
  onConfirm: (draft: SetPieceSequenceDraft) => void;
  onCancel: () => void;
};

const panel =
  "rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2";
const rotulo =
  "text-[9px] font-black uppercase tracking-wider text-slate-400";
const opcion =
  "py-2.5 px-2 rounded-xl border-2 text-[10px] font-black uppercase transition-all";
const elegida = "border-violet-400 bg-violet-500/25 text-white";
const suelta = "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10";

export function SetPieceSequenceModal({
  root,
  teamName,
  opponentName,
  players,
  defaultIsOpponent,
  presetTakerId,
  presetCornerSide,
  fromDeflectEventId,
  targetGoalkeeperIdFor,
  onConfirm,
  onCancel,
}: SetPieceSequenceModalProps) {
  const [isOpponent, setIsOpponent] = useState(defaultIsOpponent);
  const [cornerSide, setCornerSide] = useState<CornerSide | undefined>(presetCornerSide);
  const [originGrid, setOriginGrid] = useState<Zone12Id | undefined>(undefined);
  const [throwInSide, setThrowInSide] = useState<ThrowInSide | undefined>(undefined);
  const [throwInSector, setThrowInSector] = useState<ThrowInSector | undefined>(undefined);
  const [modality, setModality] = useState<SetPieceModality>(MODALITIES_BY_ROOT[root][0]);
  const [takerId, setTakerId] = useState<string | undefined>(presetTakerId);
  const [finisherId, setFinisherId] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<SequenceOutcome | null>(null);
  const [destination, setDestination] = useState<string | undefined>(undefined);
  const [response, setResponse] = useState<string | undefined>(undefined);
  const [lossSubType, setLossSubType] = useState<ThrowInLossSubType | undefined>(undefined);

  /**
   * Quién puede salir en los selectores.
   *
   * Primero los que están en pista, que es a quien se busca en directo; el
   * resto de la plantilla queda detrás, porque un sacador puede entrar desde
   * el banquillo a sacar y hay que poder elegirlo. El cuerpo técnico no:
   * no saca ni remata.
   */
  const plantilla = useMemo(() => {
    const delBando = players.filter(
      (p) => !!p.isOpponent === isOpponent && p.role !== Role.COACH && p.role !== Role.DELEGATE,
    );
    return [
      ...delBando.filter((p) => p.isOnPitch),
      ...delBando.filter((p) => !p.isOnPitch),
    ];
  }, [players, isOpponent]);

  const nombre = (p: Player) => {
    const ident = playerDisplayIdentity(p, { players, maxCaracteres: 14 });
    return ident.kind === "nombre" ? ident.nombreCorto : ident.etiquetaProvisional;
  };

  const dorsalDe = (p: Player) =>
    playerDisplayIdentity(p, { players, maxCaracteres: 14 }).dorsal;

  const esBanda = root === "throw_in";
  const esCorner = root === "corner";
  const esFalta = root === "free_kick";

  /**
   * ¿Se puede confirmar ya?
   *
   * Lo mínimo es saber dónde fue y en qué acabó. El sacador es opcional a
   * propósito: en directo no siempre se ve quién saca, y bloquear la
   * confirmación por eso perdería la jugada entera.
   */
  const ubicacionLista =
    (esCorner && !!cornerSide) ||
    (esBanda && !!throwInSide && !!throwInSector) ||
    esFalta;
  const listo = ubicacionLista && outcome !== null;

  const confirmar = () => {
    if (!listo || outcome === null) return;
    const identificado = (id: string | undefined) =>
      id && id !== SIN_IDENTIFICAR ? id : undefined;
    onConfirm({
      root,
      isOpponent,
      modality,
      outcome,
      takerId: identificado(takerId),
      ...(esCorner ? { cornerSide } : {}),
      ...(esFalta && originGrid ? { originGrid } : {}),
      ...(esBanda ? { throwInSide, throwInSector } : {}),
      ...(fromDeflectEventId ? { fromDeflectEventId } : {}),
      ...(outcome === "shot" || outcome === "goal"
        ? {
            shot: {
              finisherId: identificado(finisherId) ?? identificado(takerId),
              destinationGrid: destination,
              targetGoalkeeperId: targetGoalkeeperIdFor(isOpponent),
              goalieResponse: response as GoalieAction | "UNSPECIFIED" | undefined,
            },
          }
        : {}),
      ...(outcome === "loss"
        ? { loss: { playerId: identificado(takerId), subType: lossSubType } }
        : {}),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[1400] bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-3"
      data-set-piece-modal={root}
    >
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-slate-900 border border-white/10 rounded-3xl p-4 space-y-3">
        <div className="text-center">
          <h3 className="text-white font-black uppercase text-sm">
            {SET_PIECE_ROOT_LABEL[root]}
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Toda la jugada en una ventana. Nada se guarda hasta confirmar.
          </p>
        </div>

        {/* ── EQUIPO ──────────────────────────────────────────────────── */}
        <div className={panel}>
          <div className={rotulo}>Equipo que ejecuta</div>
          <div className="grid grid-cols-2 gap-2">
            {[false, true].map((rival) => (
              <button
                key={String(rival)}
                data-seq-team={rival ? "opponent" : "team"}
                onClick={() => {
                  setIsOpponent(rival);
                  // Cambiar de bando invalida a quien estaba elegido: esos
                  // jugadores son del otro equipo.
                  setTakerId(undefined);
                  setFinisherId(undefined);
                }}
                className={`${opcion} ${isOpponent === rival ? elegida : suelta}`}
              >
                {rival ? opponentName : teamName}
              </button>
            ))}
          </div>
        </div>

        {/* ── DÓNDE ───────────────────────────────────────────────────── */}
        {esCorner && (
          <div className={panel}>
            <div className={rotulo}>¿Desde qué esquina?</div>
            <div className="grid grid-cols-2 gap-2">
              {(["left", "right"] as CornerSide[]).map((side) => (
                <button
                  key={side}
                  data-seq-corner-side={side}
                  onClick={() => setCornerSide(side)}
                  className={`${opcion} ${cornerSide === side ? elegida : suelta}`}
                >
                  {formatCornerLabel(side)}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-slate-500 leading-relaxed">
              Izquierda y derecha se entienden desde la perspectiva del equipo que saca.
            </p>
          </div>
        )}

        {esFalta && (
          <div className={panel}>
            <div className={rotulo}>¿Desde dónde se saca? (opcional)</div>
            <div className="grid grid-cols-3 gap-1.5">
              {ZONE_12_IDS.map((z) => (
                <button
                  key={z}
                  data-seq-origin={z}
                  onClick={() => setOriginGrid(originGrid === z ? undefined : z)}
                  className={`py-2 rounded-lg border text-[10px] font-black ${
                    originGrid === z ? elegida : suelta
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>
        )}

        {esBanda && (
          <div className={panel}>
            <div className={rotulo}>¿Dónde se saca?</div>
            {/* Mini pista: banda arriba o abajo, sectores de propia a rival.
                Las dos cosas van normalizadas desde quien saca. */}
            <div className="space-y-1.5" data-seq-mini-pitch>
              {THROW_IN_SIDES.map((side) => (
                <div key={side} className="flex items-center gap-1.5">
                  <button
                    data-seq-throw-side={side}
                    onClick={() => setThrowInSide(side)}
                    className={`${opcion} w-24 shrink-0 ${
                      throwInSide === side ? elegida : suelta
                    }`}
                  >
                    {side === "left" ? "Izq." : "Der."}
                  </button>
                  <div className="grid grid-cols-4 gap-1 flex-1">
                    {THROW_IN_SECTORS.map((sector) => (
                      <button
                        key={sector}
                        data-seq-throw-cell={`${side}-${sector}`}
                        onClick={() => {
                          setThrowInSide(side);
                          setThrowInSector(sector);
                        }}
                        className={`py-2 rounded-lg border text-[10px] font-black ${
                          throwInSide === side && throwInSector === sector ? elegida : suelta
                        }`}
                      >
                        {sector}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-slate-500 leading-relaxed">
              Z1 es campo propio y Z4 campo rival, desde la perspectiva de quien saca.
            </p>
          </div>
        )}

        {/* ── MODALIDAD ───────────────────────────────────────────────── */}
        <div className={panel}>
          <div className={rotulo}>Modalidad</div>
          <div className="grid grid-cols-2 gap-2">
            {MODALITIES_BY_ROOT[root].map((m) => (
              <button
                key={m}
                data-seq-modality={m}
                onClick={() => setModality(m)}
                className={`${opcion} ${modality === m ? elegida : suelta}`}
              >
                {SET_PIECE_MODALITY_LABEL[m]}
              </button>
            ))}
          </div>
          {esBanda && (
            <p className="text-[9px] text-slate-500 leading-relaxed">
              De banda no se puede marcar directamente, así que no hay tiro directo.
            </p>
          )}
        </div>

        {/* ── SACADOR ─────────────────────────────────────────────────── */}
        <div className={panel}>
          <div className={rotulo}>¿Quién saca? (opcional)</div>
          <div className="grid grid-cols-4 gap-1.5">
            {plantilla.map((p) => (
              <button
                key={p.id}
                data-seq-taker={p.id}
                onClick={() => setTakerId(takerId === p.id ? undefined : p.id)}
                className={`py-2 rounded-lg border text-[10px] font-black leading-tight ${
                  takerId === p.id ? elegida : suelta
                } ${p.isOnPitch ? "" : "opacity-60"}`}
              >
                <span className="block">{dorsalDe(p)}</span>
                <span className="block text-[8px] font-bold truncate">{nombre(p)}</span>
              </button>
            ))}
            <button
              data-seq-taker="unknown"
              onClick={() =>
                setTakerId(takerId === SIN_IDENTIFICAR ? undefined : SIN_IDENTIFICAR)
              }
              className={`py-2 rounded-lg border text-[9px] font-black ${
                takerId === SIN_IDENTIFICAR ? elegida : suelta
              }`}
            >
              No ident.
            </button>
          </div>
        </div>

        {/* ── DESENLACE ───────────────────────────────────────────────── */}
        <div className={panel}>
          <div className={rotulo}>¿En qué acaba?</div>
          <div className="grid grid-cols-2 gap-2">
            {SEQUENCE_OUTCOMES.map((o) => (
              <button
                key={o}
                data-seq-outcome={o}
                onClick={() => setOutcome(o)}
                className={`${opcion} ${outcome === o ? elegida : suelta}`}
              >
                {o === "new_set_piece" && esBanda ? "Nueva banda" : SEQUENCE_OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>
          {outcome !== null && !outcomeCreatesEvent(outcome) && (
            <p className="text-[9px] text-slate-500 leading-relaxed">
              No crea ningún evento aparte: queda escrito en la propia jugada.
            </p>
          )}
        </div>

        {/* ── REMATE, DENTRO DE LA MISMA VENTANA ──────────────────────── */}
        {(outcome === "shot" || outcome === "goal") && (
          <div className={panel} data-seq-shot-section>
            <div className={rotulo}>
              {outcome === "goal" ? "El gol" : "El tiro"} · quién y dónde
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {plantilla.map((p) => (
                <button
                  key={p.id}
                  data-seq-finisher={p.id}
                  onClick={() => setFinisherId(finisherId === p.id ? undefined : p.id)}
                  className={`py-2 rounded-lg border text-[10px] font-black leading-tight ${
                    finisherId === p.id ? elegida : suelta
                  }`}
                >
                  <span className="block">{dorsalDe(p)}</span>
                  <span className="block text-[8px] font-bold truncate">{nombre(p)}</span>
                </button>
              ))}
            </div>
            <p className="text-[9px] text-slate-500">
              Si no se elige, remata quien saca. Pueden ser jugadores distintos.
            </p>

            <div className={rotulo}>Destino</div>
            <div className="grid grid-cols-5 gap-1">
              {[...GOAL_ZONE_IDS, GOAL_OUT_ID].map((g) => (
                <button
                  key={g}
                  data-seq-destination={g}
                  onClick={() => setDestination(destination === g ? undefined : g)}
                  className={`py-2 rounded-lg border text-[10px] font-black ${
                    destination === g ? elegida : suelta
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            <div className={rotulo}>Respuesta del portero</div>
            <div className="grid grid-cols-2 gap-1.5">
              {GOALIE_RESPONSES.map((r) => (
                <button
                  key={r}
                  data-seq-response={r}
                  onClick={() => setResponse(response === r ? undefined : r)}
                  className={`${opcion} ${response === r ? elegida : suelta}`}
                >
                  {GOALIE_ACTION_LABEL[r] ?? r}
                </button>
              ))}
              <button
                data-seq-response="UNSPECIFIED"
                onClick={() =>
                  setResponse(response === "UNSPECIFIED" ? undefined : "UNSPECIFIED")
                }
                className={`${opcion} col-span-2 ${
                  response === "UNSPECIFIED" ? elegida : suelta
                }`}
              >
                No registrada
              </button>
            </div>
          </div>
        )}

        {/* ── PÉRDIDA ─────────────────────────────────────────────────── */}
        {outcome === "loss" && (
          <div className={panel} data-seq-loss-section>
            <div className={rotulo}>¿Cómo se pierde?</div>
            <div className="grid grid-cols-3 gap-1.5">
              {THROW_IN_LOSS_SUBTYPES.map((s) => (
                <button
                  key={s}
                  data-seq-loss={s}
                  onClick={() => setLossSubType(lossSubType === s ? undefined : s)}
                  className={`py-2 rounded-lg border text-[10px] font-black ${
                    lossSubType === s ? elegida : suelta
                  }`}
                >
                  {THROW_IN_LOSS_SUBTYPE_LABEL[s]}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-slate-500">
              Se registra UNA pérdida enlazada, y cuenta una sola vez.
            </p>
          </div>
        )}

        {/* ── CIERRE ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            data-seq-cancel
            onClick={onCancel}
            className="py-3 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase text-slate-400"
          >
            Cancelar
          </button>
          <button
            data-seq-confirm
            disabled={!listo}
            onClick={confirmar}
            className="py-3 rounded-xl bg-violet-500/25 border-2 border-violet-400 hover:bg-violet-500/40 text-[10px] font-black uppercase text-white disabled:opacity-40 disabled:border-white/10 disabled:bg-white/5"
          >
            Confirmar jugada
          </button>
        </div>
        {!listo && (
          <p className="text-[9px] text-slate-500 text-center">
            Falta {ubicacionLista ? "el desenlace" : "la ubicación"}.
          </p>
        )}
      </div>
    </div>
  );
}
