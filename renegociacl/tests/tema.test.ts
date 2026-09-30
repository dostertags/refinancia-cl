import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLASE_INICIAL_HTML, SCRIPT_TEMA } from "@/lib/tema";

const html = () => document.documentElement;
const ejecutar = () => new Function(SCRIPT_TEMA)();

beforeEach(() => { localStorage.clear(); html().className = CLASE_INICIAL_HTML; });
afterEach(() => { localStorage.clear(); html().className = ""; });

describe("tema por defecto: modo oscuro", () => {
  it("el HTML nace con la clase dark (sin parpadeo aunque falle el script)", () => expect(CLASE_INICIAL_HTML).toBe("dark"));
  it("sin preferencia guardada queda oscuro", () => {
    ejecutar();
    expect(html().classList.contains("dark")).toBe(true);
  });
  it("aunque el sistema esté en modo claro, sigue oscuro por defecto", () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q })) as never;
    ejecutar();
    expect(html().classList.contains("dark")).toBe(true);
  });
  it("respeta a quien eligió modo claro", () => {
    localStorage.setItem("tema", "claro");
    ejecutar();
    expect(html().classList.contains("dark")).toBe(false);
  });
  it("respeta a quien eligió modo oscuro", () => {
    localStorage.setItem("tema", "oscuro");
    html().classList.remove("dark");
    ejecutar();
    expect(html().classList.contains("dark")).toBe(true);
  });
  it("si localStorage falla (navegación privada) no rompe y queda oscuro", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("bloqueado"); };
    try {
      expect(() => ejecutar()).not.toThrow();
      expect(html().classList.contains("dark")).toBe(true);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
