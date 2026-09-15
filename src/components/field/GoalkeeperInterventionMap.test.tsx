// @vitest-environment jsdom
/**
 * Mapa de intervención del portero (GK1-GK5).
 *
 * Dominio propio: no es la pista de 12 zonas. Estos tests fijan que las cinco
 * bandas son seleccionables, que el usuario nunca ve el código interno y que
 * la interacción es de un solo toque, sin confirmar.
 */
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { GK_ZONE_IDS, GK_ZONE_LABEL } from "../../utils/goalkeeperZones";
import {
  GK_AREA_PATH,
  GK_BAND_LAYOUT,
  GK_VIEWBOX,
  GoalkeeperInterventionMap,
} from "./GoalkeeperInterventionMap";

function mount(props: Partial<React.ComponentProps<typeof GoalkeeperInterventionMap>> = {}) {
  const onSelect = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<GoalkeeperInterventionMap onSelect={onSelect} {...props} />);
  });
  return { host, onSelect };
}

const bandas = (host: HTMLElement) =>
  Array.from(host.querySelectorAll("button[aria-label]"));

describe("Las cinco zonas", () => {
  it("se renderizan las cinco y son pulsables", () => {
    const { host } = mount();
    expect(bandas(host)).toHaveLength(5);
  });

  it("cada zona es seleccionable y emite su identificador", () => {
    for (const id of GK_ZONE_IDS) {
      const { host, onSelect } = mount();
      const banda = bandas(host).find((b) =>
        (b.getAttribute("aria-label") || "").startsWith(GK_ZONE_LABEL[id]),
      )!;
      act(() => {
        banda.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(id);
    }
  });

  it("un solo toque basta: no hay botón de confirmar", () => {
    const { host, onSelect } = mount();
    act(() => {
      bandas(host)[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect((host.textContent || "").toLowerCase()).not.toContain("confirmar");
  });
});

describe("Etiquetas de usuario", () => {
  it("muestra Zona 1..Zona 5 y NUNCA GK1..GK5", () => {
    const { host } = mount();
    const texto = host.textContent || "";
    for (const id of GK_ZONE_IDS) {
      expect(texto).toContain(GK_ZONE_LABEL[id]);
    }
    expect(texto).not.toMatch(/GK[1-5]/);
  });

  it("cada banda lleva aria-label descriptivo, sin código interno", () => {
    const { host } = mount();
    for (const banda of bandas(host)) {
      const aria = banda.getAttribute("aria-label") || "";
      expect(aria).toMatch(/^Zona [1-5] · /);
      expect(aria).not.toMatch(/GK[1-5]/);
    }
  });

  it("dibuja un campo reconocible: portería, línea de gol y área", () => {
    const { host } = mount();
    const svg = host.querySelector("svg")!;
    expect(svg).toBeTruthy();

    // El área de futsal: dos arcos desde los postes unidos por un tramo recto.
    const areaPaths = Array.from(svg.querySelectorAll("path")).filter((p) =>
      (p.getAttribute("d") || "").includes("A "),
    );
    expect(areaPaths.length).toBeGreaterThanOrEqual(2); // relleno + trazo
    expect(GK_AREA_PATH).toMatch(/^M .* A .* L .* A .* Z$/);

    // Portería: travesaño y dos postes por encima de la línea de gol.
    expect(svg.querySelectorAll("rect").length).toBeGreaterThanOrEqual(3);
    // Línea de gol y separadores.
    expect(svg.querySelectorAll("line").length).toBeGreaterThanOrEqual(1);
  });

  it("las zonas 1-4 se recortan contra la silueta del área", () => {
    // Es lo que hace que su forma la defina el área y no un rectángulo.
    const { host } = mount();
    const svg = host.querySelector("svg")!;
    const clip = svg.querySelector("clipPath");
    expect(clip).toBeTruthy();
    expect(clip!.querySelector("path")!.getAttribute("d")).toBe(GK_AREA_PATH);

    const clipped = svg.querySelector(`g[clip-path]`);
    expect(clipped).toBeTruthy();
    expect(clipped!.querySelectorAll("rect")).toHaveLength(4);
  });

  it("la zona 5 queda FUERA del área recortada", () => {
    const { host } = mount();
    const svg = host.querySelector("svg")!;
    const clipped = svg.querySelector("g[clip-path]")!;
    // El rect de la zona 5 no está dentro del grupo recortado.
    const fuera = Array.from(svg.querySelectorAll("rect")).filter(
      (r) => !clipped.contains(r) && r.getAttribute("y") === String(GK_BAND_LAYOUT.GK5.y),
    );
    expect(fuera.length).toBeGreaterThanOrEqual(1);
    // Y empieza justo donde acaba el área.
    expect(GK_BAND_LAYOUT.GK5.y).toBeGreaterThan(GK_BAND_LAYOUT.GK4.y);
  });
});

describe("Responsive y táctil", () => {
  // jsdom no maqueta, así que se comprueba el PRESUPUESTO geométrico: el
  // reparto en porcentaje y el tamaño que resulta a anchos reales.
  const ANCHO_MOVIL = 290; // modal a 88vw en un teléfono de 375

  it("el dibujo escala con el contenedor, sin desbordarlo", () => {
    const { host } = mount();
    const svg = host.querySelector("svg") as SVGElement;
    expect((svg as any).style.width).toBe("100%");
    expect((svg as any).style.height).toBe("auto");
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${GK_VIEWBOX.width} ${GK_VIEWBOX.height}`);
  });

  it("las cinco bandas reparten el alto sin solaparse ni dejar huecos", () => {
    let anterior = GK_BAND_LAYOUT.GK1.top;
    for (const id of GK_ZONE_IDS) {
      const band = GK_BAND_LAYOUT[id];
      expect(band.top).toBeGreaterThanOrEqual(anterior - 0.01);
      anterior = band.top + band.height;
    }
    expect(anterior).toBeLessThanOrEqual(100.01);
  });

  it("en un móvil de 375 px las zonas superan el mínimo táctil de 44 px", () => {
    // Alto renderizado = ancho × (alto/ancho del viewBox).
    const alto = ANCHO_MOVIL * (GK_VIEWBOX.height / GK_VIEWBOX.width);
    for (const id of GK_ZONE_IDS) {
      const px = (GK_BAND_LAYOUT[id].height / 100) * alto;
      expect(px).toBeGreaterThanOrEqual(44);
    }
  });

  it("el mapa completo cabe en la altura de un móvil", () => {
    const alto = ANCHO_MOVIL * (GK_VIEWBOX.height / GK_VIEWBOX.width);
    expect(alto).toBeLessThan(600); // deja sitio para título, leyenda y botón
  });

  it("sin onSelect se renderiza como mapa de solo lectura", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    act(() => {
      createRoot(host).render(<GoalkeeperInterventionMap counts={{ GK2: 2 }} />);
    });
    expect(host.querySelectorAll("button")).toHaveLength(0);
    // Pero sigue mostrando el dibujo y la leyenda.
    expect(host.querySelector("svg")).toBeTruthy();
    expect(host.textContent || "").toContain("Bajo palos");
  });
});

describe("Geometría compartida", () => {
  it("expone una única geometría, para no dibujar cinco zonas distintas por sitio", () => {
    expect(GK_AREA_PATH).toBeTruthy();
    expect(Object.keys(GK_BAND_LAYOUT).sort()).toEqual([...GK_ZONE_IDS].sort());
  });

  it("las cuatro zonas interiores están dentro del área y la quinta fuera", () => {
    const fondoArea = GK_BAND_LAYOUT.GK4.y + GK_BAND_LAYOUT.GK4.h;
    expect(GK_BAND_LAYOUT.GK5.y).toBe(fondoArea);
    for (const id of ["GK1", "GK2", "GK3", "GK4"] as const) {
      expect(GK_BAND_LAYOUT[id].y).toBeLessThan(fondoArea);
    }
  });
});
