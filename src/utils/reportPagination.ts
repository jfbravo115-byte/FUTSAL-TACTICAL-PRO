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
 *
 * `contextPages` son las de contexto táctico, que NO son un número fijo:
 * dependen de cuántas ventanas y cuántos goles tenga el partido, y valen 0
 * cuando no hay ninguna de las dos cosas. Ver `paginateContextReport`.
 *
 * `tacticalProPages` son las del análisis interpretativo, que valen 0 cuando
 * el partido no tiene ninguno guardado. Un informe sin análisis no imprime
 * una hoja anunciando que falta.
 */
export function teamReportPageCount(
  teamsWithPlayers: number,
  contextPages = 0,
  tacticalProPages = 0,
): number {
  return (
    Math.max(0, teamsWithPlayers) * TEAM_REPORT_PAGES_PER_TEAM +
    TEAM_REPORT_SHARED_PAGES +
    Math.max(0, contextPages) +
    Math.max(0, tacticalProPages)
  );
}

// ── PÁGINA DE CONTEXTO TÁCTICO ──────────────────────────────────────────
//
// POR QUÉ SE PAGINA A MANO
// ------------------------
// Las páginas del PDF se capturan con `toJpeg` y se insertan con
// `addImage(..., pdfW, min(pdfH, pdfW*aspecto))`: una página más alta que A4
// NO se recorta, se COMPRIME. Así que el contenido no puede desbordar, y como
// el número de ventanas y de goles depende del partido, hay que repartirlo
// antes de dibujar.
//
// El presupuesto está en píxeles reales del diseño, no en "elementos por
// página": es lo único que se puede comprobar por test contra el alto A4.

/** Alto útil de una página, descontando márgenes, cabecera y pie. */
export const CONTEXT_PAGE_CONTENT_H = 879;

/** Alto de una tarjeta de situación especial, con su separación. */
export const CONTEXT_CARD_H = 118;

/** Alto de una fila de la secuencia de goles. */
export const GOAL_ROW_H = 28;

/** Título de sección más su línea de contexto. */
export const CONTEXT_SECTION_HEADER_H = 40;

/** Una página de contexto táctico: sus tarjetas y sus filas de gol. */
export type ContextReportPage<C, G> = {
  contexts: C[];
  goals: G[];
  /** ¿Esta página abre la sección de situaciones especiales? */
  opensContexts: boolean;
  /** ¿Esta página abre la sección de secuencia de goles? */
  opensGoals: boolean;
};

/**
 * Reparte ventanas y goles en páginas sin cortar nunca una tarjeta.
 *
 * Genérica a propósito: no necesita conocer los tipos de `matchContexts` ni
 * de `goalSequence`, solo cuántos elementos hay. Así este archivo sigue
 * siendo el único que sabe de paginación y no adquiere dependencias.
 *
 * Sin ventanas y sin goles devuelve una lista VACÍA —un partido sin
 * situaciones especiales no imprime una página en blanco—, y no hace falta
 * un caso especial para conseguirlo: sin elementos que repartir no se abre
 * ninguna página.
 */
export function paginateContextReport<C, G>(
  contexts: readonly C[],
  goals: readonly G[],
  contentHeight = CONTEXT_PAGE_CONTENT_H,
): ContextReportPage<C, G>[] {
  const pages: ContextReportPage<C, G>[] = [];
  let actual: ContextReportPage<C, G> | null = null;
  let libre = 0;

  const nuevaPagina = () => {
    actual = { contexts: [], goals: [], opensContexts: false, opensGoals: false };
    pages.push(actual);
    libre = contentHeight;
  };

  // ── Situaciones especiales ──
  let abreContextos = contexts.length > 0;
  for (const c of contexts) {
    const cabecera = abreContextos ? CONTEXT_SECTION_HEADER_H : 0;
    if (!actual || libre < cabecera + CONTEXT_CARD_H) {
      nuevaPagina();
      // Al saltar de página la sección se vuelve a titular, para que una
      // tarjeta suelta no aparezca sin decir de qué es.
      actual!.opensContexts = true;
      libre -= CONTEXT_SECTION_HEADER_H;
    } else if (abreContextos) {
      actual.opensContexts = true;
      libre -= CONTEXT_SECTION_HEADER_H;
    }
    actual!.contexts.push(c);
    libre -= CONTEXT_CARD_H;
    abreContextos = false;
  }

  // ── Secuencia de goles ──
  let abreGoles = goals.length > 0;
  for (const g of goals) {
    const cabecera = abreGoles ? CONTEXT_SECTION_HEADER_H : 0;
    if (!actual || libre < cabecera + GOAL_ROW_H) {
      nuevaPagina();
      actual!.opensGoals = true;
      libre -= CONTEXT_SECTION_HEADER_H;
    } else if (abreGoles) {
      actual.opensGoals = true;
      libre -= CONTEXT_SECTION_HEADER_H;
    }
    actual!.goals.push(g);
    libre -= GOAL_ROW_H;
    abreGoles = false;
  }

  return pages;
}
