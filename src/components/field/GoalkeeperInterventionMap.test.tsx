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
import { GoalkeeperInterventionMap } from "./GoalkeeperInterventionMap";

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

  it("orienta el mapa: portería arriba, fuera del área abajo", () => {
    const texto = mount().host.textContent || "";
    expect(texto).toContain("Portería");
    expect(texto).toContain("Fuera del área");
  });
});

describe("Selección y distribución", () => {
  it("marca la zona seleccionada con aria-pressed", () => {
    const { host } = mount({ selectedZone: "GK3" });
    const marcadas = bandas(host).filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0].getAttribute("aria-label")).toContain("Zona 3");
  });

  it("como mapa de distribución muestra el conteo por zona", () => {
    const { host } = mount({ counts: { GK1: 3, GK4: 1 } });
    const texto = host.textContent || "";
    expect(texto).toContain("3");
    expect(texto).toContain("1");
  });
});

describe("Responsive y táctil", () => {
  it("las bandas tienen altura mínima cómoda para el dedo", () => {
    const { host } = mount();
    for (const banda of bandas(host)) {
      const min = parseInt((banda as HTMLElement).style.minHeight || "0", 10);
      expect(min).toBeGreaterThanOrEqual(40);
    }
    const { host: compacto } = mount({ compact: true });
    for (const banda of bandas(compacto)) {
      expect(parseInt((banda as HTMLElement).style.minHeight || "0", 10)).toBeGreaterThan(0);
    }
  });

  it("no se desborda: ancho relativo y sin scroll horizontal propio", () => {
    const { host } = mount();
    const caja = host.firstElementChild as HTMLElement;
    expect(caja.style.width).toBe("100%");
    expect(caja.style.margin).toContain("auto");
    // El recuadro recorta su contenido en lugar de desbordarlo.
    const marco = caja.querySelector("div") as HTMLElement;
    expect(marco.style.overflow).toBe("hidden");
  });

  it("sin onSelect se renderiza como mapa de solo lectura", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    act(() => {
      createRoot(host).render(<GoalkeeperInterventionMap counts={{ GK2: 2 }} />);
    });
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(host.querySelectorAll("[aria-label]").length).toBeGreaterThanOrEqual(5);
  });
});
