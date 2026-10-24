/**
 * src/utils/playerIdentity.ts
 *
 * QUIÉN ES ESTE JUGADOR CUANDO SOLO CABE UNA LÍNEA.
 *
 * EL PROBLEMA
 * -----------
 * Las fichas de captura enseñaban el dorsal como información principal
 * siempre. Para el rival es lo correcto —se le reconoce por el número—, pero
 * para el equipo propio no: a los nuestros los conocemos por el nombre, y
 * leer «7» y traducirlo mentalmente a «Juan» cuesta el medio segundo que
 * separa apuntar la acción de perderla.
 *
 * LA REGLA NO ES EL BANDO, SON LOS DATOS
 * --------------------------------------
 * Atar «local → nombre, rival → dorsal» sería mentira en los dos sentidos:
 * un rival al que SÍ conocemos por nombre se leería peor que un desconocido,
 * y un jugador nuestro todavía sin nombre no se leería en absoluto. Lo que
 * manda es qué dato existe:
 *
 *   1. hay nombre real        → NOMBRE principal, dorsal secundario;
 *   2. no, pero hay dorsal    → DORSAL principal, letra provisional debajo;
 *   3. ni nombre ni dorsal    → LETRA provisional principal, «?» secundario.
 *
 * QUÉ ES UN «NOMBRE REAL»
 * -----------------------
 * Todo lo que no sea una cadena vacía ni uno de los nombres que la propia
 * aplicación se inventa al crear plantillas. Se reconocen SOLO los patrones
 * exactos que genera —ver `PATRONES_AUTOMATICOS`—, nunca por heurística: un
 * nombre no es provisional por ser corto, ni por llevar números. «Dani 10»
 * es un apodo real y se respeta; «Jugador 10» lo escribió la aplicación.
 *
 * Esto decide ÚNICAMENTE la presentación. `player.name` no se toca, no se
 * limpia y no se borra: un nombre provisional sigue viajando intacto al
 * informe, al CSV y a Tactical Pro.
 */
import { Player, Role } from "../types/futsal";
import { formatJerseyNumber, isJerseyUnknown, provisionalLabel } from "./jerseyNumber";

/**
 * Los nombres que la aplicación se inventa, uno por uno y exactos.
 *
 * Salen de leer los dos únicos sitios que crean jugadores:
 *
 *   · `PreMatch.tsx`   → «Portero 1», «Jugador 1», «Nuevo Jugador»,
 *                        «POR RIVAL 1», «PJ RIVAL 1»,
 *                        «ENTRENADOR LOCAL», «DELEGADO VISITANTE»…
 *   · `MatchTracker.tsx` (plantilla por defecto y «añadir jugador»)
 *                      → «POR LOCAL 1», «PJ LOCAL 1», «POR RIVAL 1»,
 *                        «PJ RIVAL 1», «NUEVO JUGADOR»,
 *                        «ENTRENADOR RIVAL», «DELEGADO LOCAL»…
 *
 * Si mañana alguien añade un generador nuevo, su patrón se añade AQUÍ. Es
 * deliberado que la lista haya que mantenerla a mano: la alternativa —una
 * regla que adivine— acabaría tratando el apellido de alguien como relleno.
 */
const PATRONES_AUTOMATICOS: RegExp[] = [
  /^(?:POR|PJ) (?:LOCAL|RIVAL) \d+$/,
  /^(?:PORTERO|JUGADOR) \d+$/,
  /^NUEVO JUGADOR$/,
  /^(?:ENTRENADOR|DELEGADO) (?:LOCAL|RIVAL|VISITANTE)$/,
];

/** Mayúsculas y un solo espacio entre palabras, para comparar y para pintar. */
export function normalizeDisplayName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * ¿Lo escribió la aplicación o una persona?
 *
 * Compara contra los patrones EXACTOS, con el nombre ya normalizado. Ni
 * «empieza por» ni «contiene»: «Jugador 1 Pérez» es un nombre real al que
 * alguien añadió el apellido encima del relleno, y perderlo sería peor que
 * no haber abreviado nunca.
 */
export function isProvisionalName(name: string | null | undefined): boolean {
  const limpio = normalizeDisplayName(name);
  if (!limpio) return false; // el vacío no es provisional: es que no hay nada
  return PATRONES_AUTOMATICOS.some((re) => re.test(limpio));
}

/** ¿Tiene un nombre que identifique a una persona? */
export function hasRealName(player: { name?: string | null } | null | undefined): boolean {
  const limpio = normalizeDisplayName(player?.name);
  return limpio !== "" && !isProvisionalName(limpio);
}

// ── ABREVIACIÓN ─────────────────────────────────────────────────────────

/** Lo que cabe en la primera línea de una ficha 72×58 junto al dorsal. */
export const SHORT_NAME_CHARS = 8;

/** Una palabra recortada con punto: «ALEJANDRO» en 5 → «ALEJ.». */
function recorta(palabra: string, max: number): string {
  if (max <= 1) return palabra.slice(0, 1);
  return palabra.length <= max ? palabra : `${palabra.slice(0, max - 1)}.`;
}

/**
 * El nombre más largo que quepa en `availableCharacters`, sin azar.
 *
 *   «Juan»                   →  JUAN
 *   «Juan Pérez»             →  JUAN P.
 *   «Alejandro García López» →  ALEJ. G.
 *
 * Se conserva SIEMPRE el nombre de pila y la inicial del segundo término.
 * Quedarse con la última palabra —lo que hacía `nombreCorto`— es tentador
 * porque el apellido distingue mejor, pero en una plantilla apuntada a
 * vuelapluma la última palabra es un número y la ficha acaba diciendo «1».
 *
 * Determinista: mismo nombre y mismo ancho, mismo resultado, siempre.
 */
export function shortPlayerName(
  name: string | null | undefined,
  availableCharacters: number = SHORT_NAME_CHARS,
): string {
  const limpio = normalizeDisplayName(name);
  if (!limpio) return "";
  const max = Math.max(1, Math.trunc(availableCharacters));

  const partes = limpio.split(" ");
  const inicial = partes.length > 1 ? `${partes[1][0]}.` : "";

  // De más a menos información. Se devuelve el PRIMERO que quepa, así que el
  // nombre solo se abrevia tanto como haga falta y ni un carácter más.
  const candidatos = inicial
    ? [
        limpio,
        `${partes[0]} ${inicial}`,
        `${recorta(partes[0], max - inicial.length - 1)} ${inicial}`,
      ]
    : [limpio];
  for (const c of candidatos) if (c.length <= max) return c;

  // Anchos minúsculos —una columna de 2 o 3 caracteres— donde no cabe ni la
  // inicial. Se recorta en seco, pero NUNCA se devuelve algo más ancho de lo
  // que se pidió: quien llama ya ha hecho sus cuentas de geometría con ese
  // número y pasarse rompería la ficha.
  return recorta(limpio, max);
}

// ── IDENTIDAD PARA PINTAR ───────────────────────────────────────────────

/** Qué dato manda en esta ficha. */
export type PlayerDisplayKind = "nombre" | "dorsal" | "provisional";

export type PlayerDisplayIdentity = {
  /** Cuál de las tres reglas se ha aplicado. */
  kind: PlayerDisplayKind;
  /** Lo que va GRANDE: el nombre corto, el dorsal o la letra. */
  principal: string;
  /** Lo que va pequeño al lado: el dorsal, `?`… o nada. */
  secundario: string | null;
  /** El nombre corto, si hay nombre real. Si no, `null`. */
  nombreCorto: string | null;
  /** El nombre tal cual lo escribieron, sin tocar. `null` si no es real. */
  nombreCompleto: string | null;
  /** El dorsal ya formateado: «7» o «?». */
  dorsal: string;
  /** Letra estable dentro de su plantilla: «A», «B»… */
  letra: string;
  /** «RIVAL A», «LOCAL C» — la etiqueta provisional entera. */
  etiquetaProvisional: string;
  /** Frase para lectores de pantalla: «Juan Pérez, dorsal 7». */
  aria: string;
};

export type PlayerDisplayContext = {
  /** La plantilla donde vive, para calcular una letra que no se mueva. */
  players: Player[];
  /** Ancho útil, en caracteres, de la línea donde va el nombre. */
  maxCaracteres?: number;
};

/**
 * Quién es este jugador y qué dato manda al pintarlo.
 *
 * Pura: mismas entradas, misma salida, y no toca nada del jugador. Toda la
 * superficie de captura —pista 5v5, focal, columnas, banquillos, radial y
 * selectores— pregunta aquí, para que la jerarquía no dependa de en qué
 * pantalla estés mirando al mismo jugador.
 */
export function playerDisplayIdentity(
  player: Player,
  context: PlayerDisplayContext,
): PlayerDisplayIdentity {
  const { players, maxCaracteres = SHORT_NAME_CHARS } = context;
  const dorsal = formatJerseyNumber(player);
  const sinDorsal = isJerseyUnknown(player);

  // El cuerpo técnico no lleva dorsal ni entra en la numeración de la
  // plantilla: su nombre ES su identidad y se enseña tal cual. Darle una
  // letra provisional diría que está pendiente de reconocer, y no lo está.
  const esStaff = player.role === Role.COACH || player.role === Role.DELEGATE;

  const etiquetaProvisional = esStaff
    ? normalizeDisplayName(player.name)
    : provisionalLabel(player, players);
  const letra = etiquetaProvisional.replace(/^(?:LOCAL|RIVAL) /, "");

  if (esStaff || hasRealName(player)) {
    const corto = shortPlayerName(player.name, maxCaracteres);
    const completo = (player.name ?? "").trim();
    return {
      kind: "nombre",
      principal: corto,
      secundario: dorsal,
      nombreCorto: corto,
      nombreCompleto: completo,
      dorsal,
      letra,
      etiquetaProvisional,
      aria: `${completo}, ${sinDorsal ? "dorsal desconocido" : `dorsal ${dorsal}`}`,
    };
  }

  const base = {
    nombreCorto: null,
    nombreCompleto: null,
    dorsal,
    letra,
    etiquetaProvisional,
    aria: `${etiquetaProvisional}, ${sinDorsal ? "dorsal desconocido" : `dorsal ${dorsal}`}`,
  };

  // Sin nombre pero con dorsal: manda el número, que es por lo que se le
  // reconoce en el campo. La letra queda debajo, en pequeño, porque es lo
  // único que lo distingue de otro desconocido si luego se le quita el número.
  if (!sinDorsal) {
    return { ...base, kind: "dorsal", principal: dorsal, secundario: letra };
  }

  // Ni nombre ni dorsal: lo único estable que tiene es su letra.
  return { ...base, kind: "provisional", principal: letra, secundario: "?" };
}
