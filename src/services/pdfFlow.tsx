/**
 * src/services/pdfFlow.tsx
 *
 * MAQUETACIÓN DE LOS PDF POR MEDICIÓN, NO POR ADIVINANZA.
 *
 * EL PROBLEMA
 * -----------
 * Cada página del dossier y del informe resumido se escribía a mano: «esto va
 * en la 3, esto en la 4». Cuando el partido traía más datos de los previstos,
 * la página crecía por debajo del A4 y la captura la APLASTABA para que
 * cupiera (la primera del informe resumido salía a 2289 px comprimidos en
 * 1684), o la recortaba en silencio con `overflow: hidden`. Y cuando traía
 * menos, quedaban hojas medio vacías: 18 páginas para un partido normal.
 *
 * LA SOLUCIÓN
 * -----------
 * El documento se describe como una lista de BLOQUES con significado:
 *
 *   heading  un título; nunca se queda solo al pie de una página
 *   map      un mapa o una rejilla de pistas; nunca se parte
 *   card     una tarjeta (portero, contexto); nunca se parte
 *   text     un párrafo; nunca se parte (los largos llegan ya troceados)
 *   table    una tabla; se parte POR FILAS, repitiendo la cabecera
 *
 * Se renderizan una vez fuera de pantalla, se MIDE cada uno con el
 * navegador real, y se reparten en páginas A4 de alto fijo. Después se pinta
 * el documento definitivo y se AUDITA antes de capturar: si alguna página
 * tiene más contenido que hueco (`scrollHeight > clientHeight`), se vuelve a
 * repartir con menos alto útil. `overflow: hidden` queda solo como red; nunca
 * es la forma de hacer caber nada.
 *
 * Sin escalar páginas: cada página capturada mide exactamente un A4, así que
 * el PDF no estira ni encoge ninguna.
 */
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { flushSync } from "react-dom";

// ── TIPOS ───────────────────────────────────────────────────────────────

export type FlowKind = "heading" | "text" | "map" | "card" | "table";

/** Un trozo del documento con significado propio. */
export type FlowItem = {
  /** Estable entre exportaciones: sirve de clave, de ancla y de prueba. */
  id: string;
  /** Sección del inventario a la que pertenece. */
  section: string;
  kind: FlowKind;
  /** De quién es el bloque: el filtro «sin rival» se comprueba con esto. */
  team?: "team" | "opponent" | "both";
  /** Lo que se pinta, salvo en las tablas partibles. */
  node?: React.ReactNode;
  /**
   * Una tabla que se puede partir por filas. `render(from, to)` pinta la
   * cabecera y las filas [from, to); cada fila lleva `data-flow-row`.
   */
  rows?: { count: number; render: (from: number, to: number) => React.ReactNode };
  /** Un título: va siempre con lo que introduce. */
  keepWithNext?: boolean;
  /** Empieza página nueva (salvo que la actual esté vacía). */
  breakBefore?: boolean;
  /**
   * Alto aproximado para cuando NO hay motor de maquetación (jsdom). El
   * navegador siempre mide; esto solo evita que, en pruebas, una fila de
   * pistas puestas en horizontal se estime como si fueran apiladas.
   */
  estimate?: number;
};

/** Lo que el reparto necesita saber de cada bloque: cuánto mide. */
export type MeasuredItem = {
  id: string;
  height: number;
  keepWithNext?: boolean;
  breakBefore?: boolean;
  /** Solo en tablas partibles: alto de la cabecera y de cada fila. */
  rowsHead?: number;
  rowHeights?: number[];
};

/** Un bloque colocado: entero, o un tramo de filas de una tabla. */
export type Placement = { id: string; from?: number; to?: number };

export type FlowPlan = {
  pages: Placement[][];
  /** Bloques que por sí solos miden más que una página. */
  oversize: string[];
  /**
   * Títulos que no caben con lo que introducen ni en una página vacía (el
   * bloque siguiente ocupa casi una hoja). Es imposible no separarlos; se
   * declara en vez de fallar.
   */
  unavoidable?: string[];
};

// ── REPARTO (función pura) ──────────────────────────────────────────────

/**
 * Reparte los bloques medidos en páginas de `available` px de alto útil,
 * con `gap` px entre bloques.
 *
 * Reglas, en este orden:
 *   1. un bloque que no cabe en lo que queda de página baja a la siguiente;
 *   2. un título necesita sitio para él Y para el arranque de lo que
 *      introduce (el bloque siguiente, o la cabecera y la primera fila de
 *      una tabla); si no lo hay, baja entero;
 *   3. una tabla se parte por filas y cada tramo repite su cabecera;
 *   4. `breakBefore` abre página, salvo que la actual esté vacía;
 *   5. nunca se crea una página vacía.
 */
export function paginateFlow(
  items: MeasuredItem[],
  available: number,
  gap: number,
): FlowPlan {
  const pages: Placement[][] = [];
  const oversize: string[] = [];
  const unavoidable: string[] = [];
  let actual: Placement[] | null = null;
  let usado = 0;

  const nueva = () => {
    actual = [];
    pages.push(actual);
    usado = 0;
  };
  const coste = (h: number) => ((actual as Placement[] | null)?.length ? gap : 0) + h;
  const cabe = (h: number) => usado + coste(h) <= available;

  /** Lo mínimo de un bloque que tiene que acompañar a su título. */
  const arranque = (siguiente: MeasuredItem | undefined): number => {
    if (!siguiente) return 0;
    if (siguiente.rowHeights && siguiente.rowHeights.length) {
      return (siguiente.rowsHead ?? 0) + siguiente.rowHeights[0];
    }
    return siguiente.height;
  };

  /**
   * Lo que tiene que caber JUNTO a partir del título `i`: la cadena de
   * títulos seguidos (p. ej. «Tactical Pro» y «1. Lectura del partido») y el
   * arranque del primer bloque que introducen.
   */
  const grupoDesde = (i: number): number => {
    let total = 0;
    let j = i;
    while (j < items.length && items[j].keepWithNext) {
      total += (j > i ? gap : 0) + items[j].height;
      j++;
    }
    if (j < items.length) total += gap + arranque(items[j]);
    return total;
  };

  items.forEach((item, i) => {
    if (!actual) nueva();
    if (item.breakBefore && actual!.length) nueva();

    // ── Tabla partible ──
    if (item.rowHeights && item.rowHeights.length) {
      const cabecera = item.rowsHead ?? 0;
      let r = 0;
      while (r < item.rowHeights.length) {
        const libre = available - usado - (actual!.length ? gap : 0);
        let alto = cabecera;
        let k = r;
        while (k < item.rowHeights.length && alto + item.rowHeights[k] <= libre) {
          alto += item.rowHeights[k];
          k++;
        }
        if (k === r) {
          if (actual!.length) {
            nueva();
            continue;
          }
          // Página vacía y ni una fila cabe: se coloca igual y se avisa.
          oversize.push(item.id);
          alto = cabecera + item.rowHeights[r];
          k = r + 1;
        }
        usado += coste(alto);
        actual!.push({ id: item.id, from: r, to: k });
        r = k;
        if (r < item.rowHeights.length) nueva();
      }
      return;
    }

    // ── Bloque entero ──
    // Un título se coloca solo si en lo que queda de página cabe con todo lo
    // que introduce. Si no, baja: lo que introduce también bajaría, y el
    // título se quedaría solo al pie.
    const necesita = item.keepWithNext ? grupoDesde(i) : item.height;
    if (item.keepWithNext && necesita > available) unavoidable.push(item.id);
    if (actual!.length && !cabe(necesita)) nueva();
    if (item.height > available) oversize.push(item.id);
    usado += coste(item.height);
    actual!.push({ id: item.id });
  });

  return { pages: pages.filter((p) => p.length > 0), oversize, unavoidable };
}

/**
 * Página en la que EMPIEZA cada sección, numerada desde `firstPage`.
 *
 * El índice sale de aquí, nunca de números escritos a mano.
 */
export function sectionStartPages(
  plan: FlowPlan,
  items: FlowItem[],
  firstPage: number,
): Record<string, number> {
  const seccionDe = new Map(items.map((it) => [it.id, it.section]));
  const inicio: Record<string, number> = {};
  plan.pages.forEach((pagina, i) => {
    for (const p of pagina) {
      const s = seccionDe.get(p.id);
      if (s && inicio[s] === undefined) inicio[s] = firstPage + i;
    }
  });
  return inicio;
}

/**
 * Lo que el reparto NUNCA puede producir. Devuelve la lista de fallos.
 *
 *   - una página vacía;
 *   - un título como último bloque de una página que no es la última;
 *   - un mapa, una tarjeta o un texto partido;
 *   - una tabla con filas perdidas o repetidas;
 *   - un bloque perdido o duplicado.
 */
export function auditPlan(plan: FlowPlan, items: FlowItem[]): string[] {
  const fallos: string[] = [];
  const porId = new Map(items.map((it) => [it.id, it]));
  plan.pages.forEach((pagina, i) => {
    if (pagina.length === 0) fallos.push(`página ${i + 1} vacía`);
    const ultimo = pagina[pagina.length - 1];
    const it = ultimo && porId.get(ultimo.id);
    if (it?.keepWithNext && i < plan.pages.length - 1 && !(plan.unavoidable ?? []).includes(it.id)) {
      fallos.push(`título «${it.id}» solo al final de la página ${i + 1}`);
    }
  });
  const vistos = new Map<string, Placement[]>();
  plan.pages.flat().forEach((p) => vistos.set(p.id, [...(vistos.get(p.id) ?? []), p]));
  for (const it of items) {
    const trozos = vistos.get(it.id) ?? [];
    if (trozos.length === 0) {
      fallos.push(`bloque «${it.id}» perdido`);
      continue;
    }
    if (it.rows) {
      let esperado = 0;
      for (const t of trozos) {
        if (t.from !== esperado) fallos.push(`tabla «${it.id}» con filas fuera de orden`);
        esperado = t.to ?? esperado;
      }
      if (esperado !== it.rows.count) fallos.push(`tabla «${it.id}» incompleta`);
    } else if (trozos.length > 1 || trozos[0].from !== undefined) {
      fallos.push(`${it.kind === "map" ? "mapa" : "bloque"} «${it.id}» partido`);
    }
  }
  return fallos;
}

// ── AUDITORÍA DEL DOCUMENTO RENDERIZADO ─────────────────────────────────

export type RenderedPageAudit = {
  page: number;
  /** px de contenido que no caben en el cuerpo (0 = cabe). */
  overflow: number;
  empty: boolean;
  footer: string | null;
  /** Bloques que contiene, para poder decir DÓNDE está el problema. */
  items: string[];
};

/**
 * Mide cada página YA PINTADA, antes de capturarla.
 *
 * `scrollHeight > clientHeight` es la prueba de que algo quedaría fuera del
 * A4; un cuerpo sin texto ni gráficos es una página vacía.
 */
export function auditRenderedPages(pages: HTMLElement[]): RenderedPageAudit[] {
  return pages.map((page, i) => {
    const cuerpo = page.querySelector<HTMLElement>("[data-flow-body]") ?? page;
    const overflow = Math.max(0, cuerpo.scrollHeight - cuerpo.clientHeight);
    const texto = (cuerpo.textContent ?? "").trim();
    const grafico = cuerpo.querySelector("svg, img, canvas, [data-pitch-mode]");
    return {
      page: i + 1,
      overflow,
      empty: !texto && !grafico,
      footer: page.querySelector("[data-flow-page-number]")?.textContent ?? null,
      items: Array.from(cuerpo.querySelectorAll("[data-flow-item]")).map(
        (e) => e.getAttribute("data-flow-item") ?? "",
      ),
    };
  });
}

/** Los fallos de un documento renderizado. Vacío = se puede capturar. */
export function renderedPageProblems(audit: RenderedPageAudit[]): string[] {
  const fallos: string[] = [];
  const total = audit.length;
  audit.forEach((a) => {
    if (a.overflow > 1) {
      fallos.push(`página ${a.page} (${a.items.join(", ")}): ${a.overflow} px fuera del A4`);
    }
    if (a.empty) fallos.push(`página ${a.page} vacía`);
    if (a.footer !== null && a.footer.trim() !== `Página ${a.page} de ${total}`) {
      fallos.push(`página ${a.page}: pie «${a.footer}» no correlativo`);
    }
  });
  return fallos;
}

// ── MEDICIÓN ────────────────────────────────────────────────────────────

/**
 * Alto estimado cuando no hay motor de maquetación (jsdom, en las pruebas).
 *
 * El navegador siempre mide de verdad; esto solo existe para que el reparto
 * se pueda ejercitar en un entorno sin layout. Es deliberadamente
 * conservador: texto a ~110 caracteres por línea, filas de 16 px y pistas
 * de 150 px.
 */
export function estimateHeight(el: Element): number {
  const texto = (el.textContent ?? "").length;
  const filas = el.querySelectorAll("tr").length;
  const pistas = el.querySelectorAll("[data-pitch-mode], svg").length;
  return 12 + Math.ceil(texto / 110) * 13 + filas * 16 + pistas * 150;
}

/** ¿Hay un motor de maquetación real? jsdom devuelve 0 en todo. */
function hayLayout(container: HTMLElement): boolean {
  const sonda = document.createElement("div");
  sonda.style.height = "37px";
  container.appendChild(sonda);
  const alto = sonda.getBoundingClientRect().height;
  sonda.remove();
  return alto > 0;
}

function altoDe(el: Element, real: boolean): number {
  return real ? el.getBoundingClientRect().height : estimateHeight(el);
}

/** Mide los bloques ya pintados dentro de `container`. */
export function measureRenderedItems(container: HTMLElement, items: FlowItem[]): MeasuredItem[] {
  const real = hayLayout(container);
  const porId = new Map<string, Element>();
  container.querySelectorAll("[data-flow-measure]").forEach((el) => {
    porId.set(el.getAttribute("data-flow-measure") ?? "", el);
  });
  return items.map((it) => {
    const el = porId.get(it.id);
    const base: MeasuredItem = {
      id: it.id,
      height: el ? Math.ceil(!real && it.estimate !== undefined ? it.estimate : altoDe(el, real)) : 0,
      keepWithNext: it.keepWithNext,
      breakBefore: it.breakBefore,
    };
    if (it.rows && el) {
      const filas = Array.from(el.querySelectorAll("[data-flow-row]"));
      const alturas = filas.map((f) => Math.ceil(real ? f.getBoundingClientRect().height : 16 + Math.ceil((f.textContent ?? "").length / 140) * 12));
      const suma = alturas.reduce((a, b) => a + b, 0);
      base.rowHeights = alturas;
      base.rowsHead = Math.max(0, base.height - suma);
      if (alturas.length !== it.rows.count) {
        // Una tabla que no marca sus filas se trata como bloque entero.
        base.rowHeights = undefined;
        base.rowsHead = undefined;
      }
    }
    return base;
  });
}

// ── PINTADO ─────────────────────────────────────────────────────────────

/** Separación vertical entre bloques, igual al medir que al pintar. */
export const FLOW_GAP = 10;

/**
 * `flowShrink: 0`: dentro del cuerpo (una columna flex de alto fijo) un
 * bloque NUNCA se encoge para caber; si no cabe, se ve en la auditoría.
 */
const itemWrapStyle: React.CSSProperties = { display: "flow-root", minWidth: 0, flexShrink: 0 };

/** Un bloque tal cual se va a imprimir. */
export function FlowItemView({ item, placement }: { item: FlowItem; placement?: Placement }) {
  const contenido =
    item.rows
      ? item.rows.render(placement?.from ?? 0, placement?.to ?? item.rows.count)
      : item.node;
  return (
    <div
      data-flow-item={item.id}
      data-flow-kind={item.kind}
      data-flow-section={item.section}
      data-flow-team={item.team ?? "both"}
      style={itemWrapStyle}
    >
      {contenido}
    </div>
  );
}

/**
 * Los bloques para medir, tal cual irían en el cuerpo de una página.
 *
 * Se pintan DENTRO del marco real (`renderProbe`): misma anchura, misma
 * tipografía heredada y mismo hueco. Medidos fuera del marco heredaban la
 * fuente de la aplicación y no la del PDF, y un bloque se pintaba hasta
 * 32 px más alto de lo medido.
 */
function MeasureItems({ items }: { items: FlowItem[] }) {
  return (
    <>
      {items.map((it) => (
        <div key={it.id} data-flow-measure={it.id} style={itemWrapStyle}>
          {it.rows ? it.rows.render(0, it.rows.count) : it.node}
        </div>
      ))}
    </>
  );
}

/** Espera a que el navegador termine de maquetar: dos fotogramas y las fuentes. */
async function asentar(): Promise<void> {
  await new Promise((r) => setTimeout(r, 60));
  const fuentes = (document as any).fonts?.ready as Promise<unknown> | undefined;
  if (fuentes) await Promise.race([fuentes, new Promise((r) => setTimeout(r, 1500))]);
  if (typeof requestAnimationFrame === "function") {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
  }
}

function pintar(root: Root, element: React.ReactElement) {
  flushSync(() => root.render(element));
}

// ── ORQUESTACIÓN ────────────────────────────────────────────────────────

export type FlowProgress = {
  phase: "layout" | "capture" | "save";
  page: number;
  total: number;
};

export type FlowDocumentArgs = {
  items: FlowItem[];
  /** Alto útil si no se puede medir (jsdom). En el navegador se mide. */
  fallbackBodyHeight: number;
  /**
   * Pinta el documento entero a partir del reparto: portada (si la hay) y
   * páginas. Cada página lleva `data-flow-page` y su cuerpo `data-flow-body`.
   */
  renderDocument: (plan: FlowPlan) => React.ReactElement;
  /**
   * Una página con su marco y `children` en el cuerpo: vacía, mide el alto
   * útil; con los bloques dentro, mide cada bloque en su contexto real.
   */
  renderProbe: (children: React.ReactNode) => React.ReactElement;
  /** Se llama con las páginas pintadas y ya auditadas, antes de capturar. */
  onReady: (pages: HTMLElement[], plan: FlowPlan) => Promise<void>;
};

/** Margen de seguridad frente a redondeos entre medir y pintar. */
const MARGEN = 4;

/**
 * Mide, reparte, pinta, audita y entrega las páginas.
 *
 * Si la auditoría encuentra contenido fuera del A4, vuelve a repartir con
 * menos alto útil —hasta tres veces—. Si aun así no cabe, falla en voz alta:
 * un PDF con texto recortado es peor que un error que dice por qué.
 *
 * El contenedor temporal se desmonta y se retira SIEMPRE, también si algo
 * lanza.
 */
export async function runFlowDocument(args: FlowDocumentArgs): Promise<void> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "-10000px";
  container.style.zIndex = "-1";
  container.setAttribute("data-flow-container", "");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    // 1 · Alto útil real de una página.
    pintar(root, args.renderProbe(null));
    await asentar();
    const cuerpo = container.querySelector<HTMLElement>("[data-flow-body]");
    const medido = cuerpo?.getBoundingClientRect().height ?? 0;
    let disponible = (medido > 0 ? Math.floor(medido) : args.fallbackBodyHeight) - MARGEN;

    // 2 · Medir cada bloque.
    pintar(root, args.renderProbe(<MeasureItems items={args.items} />));
    await asentar();
    const medidos = measureRenderedItems(container, args.items);

    // 3 · Repartir, pintar y auditar.
    for (let intento = 0; intento < 4; intento++) {
      const plan = paginateFlow(medidos, disponible, FLOW_GAP);
      const fallosPlan = auditPlan(plan, args.items);
      if (fallosPlan.length) throw new Error(`Maquetación inválida: ${fallosPlan.join(" · ")}`);
      pintar(root, args.renderDocument(plan));
      await asentar();
      const paginas = Array.from(container.querySelectorAll<HTMLElement>("[data-flow-page]"));
      const auditoria = auditRenderedPages(paginas);
      const desborde = Math.max(0, ...auditoria.map((a) => a.overflow));
      const problemas = renderedPageProblems(auditoria);
      if (desborde > 1 && intento < 3) {
        disponible -= desborde + MARGEN;
        continue;
      }
      if (problemas.length) {
        throw new Error(`No se pudo maquetar sin recortar: ${problemas.join(" · ")}`);
      }
      await args.onReady(paginas, plan);
      return;
    }
  } finally {
    root.unmount();
    container.remove();
  }
}
