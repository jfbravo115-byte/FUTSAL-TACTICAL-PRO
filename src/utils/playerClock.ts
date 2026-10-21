/**
 * src/utils/playerClock.ts
 *
 * EL RELOJ DE UN JUGADOR, EN UN SOLO SITIO.
 *
 * TOT —`individualTimeSeconds`— y ROT —`rotationTimeSeconds`— los lleva el
 * mismo tick de `MatchTracker`: un único `setInterval` con el delta real,
 * cerrado por `isClockRunning`, que suma a los dos y solo a quien está en
 * pista. Aquí no se cuenta nada: esto solo da FORMA a esos segundos.
 *
 * Vivía como constante privada dentro de `MatchTracker.tsx`, y la pista 5v5
 * necesitaba lo mismo. Copiarla habría sido tener dos formatos que pueden
 * divergir —y un cronómetro que no cuadra con el de al lado es peor que no
 * enseñar ninguno—, así que se mueve aquí y las dos vistas la importan.
 */

/** mm:ss a partir de segundos, truncando. 65,9 s → «01:05». */
export function formatPlayerTime(totalSeconds: number): string {
  const seguros = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const mins = Math.floor(seguros / 60);
  const secs = Math.floor(seguros % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/** Los dos cronómetros de una ficha, ya formateados. */
export function playerClocks(player: { individualTimeSeconds: number; rotationTimeSeconds?: number }) {
  return {
    tot: formatPlayerTime(player.individualTimeSeconds),
    rot: formatPlayerTime(player.rotationTimeSeconds ?? 0),
  };
}
