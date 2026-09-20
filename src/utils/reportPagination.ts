/**
 * src/utils/reportPagination.ts
 *
 * Cuántas páginas tiene el PDF Global del equipo (`informe_*.pdf`).
 *
 * POR QUÉ EXISTE
 * --------------
 * El total estaba escrito siete veces dentro de la plantilla, cada una con su
 * propia copia de la fórmula. Al añadir la página de balón parado solo se
 * actualizaron dos, y el PDF salió con «Página 1 / 7 … Página 8 / 8».
 *
 * Fuente única: quien añada o quite una página cambia este archivo y todas
 * las páginas se renumeran solas.
 */

/** Páginas por equipo con jugadores: tabla, comparativa y perfil. */
export const TEAM_REPORT_PAGES_PER_TEAM = 3;

/** Páginas comunes al final: mapas de zona, tiros por periodo y balón parado. */
export const TEAM_REPORT_SHARED_PAGES = 3;

/**
 * Total de páginas del informe. `teamsWithPlayers` son los equipos que
 * realmente aportan jugadores: un partido sin rival registrado no imprime sus
 * tres páginas, y el denominador tiene que reflejarlo.
 */
export function teamReportPageCount(teamsWithPlayers: number): number {
  return Math.max(0, teamsWithPlayers) * TEAM_REPORT_PAGES_PER_TEAM + TEAM_REPORT_SHARED_PAGES;
}
