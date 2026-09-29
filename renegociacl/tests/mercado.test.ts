import { afterEach, describe, expect, it, vi } from "vitest";
import { cargarMercado, resumirMercado } from "@/lib/mercado";

afterEach(() => vi.unstubAllGlobals());
const respuesta = (data: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, json: async () => data });

describe("cargarMercado: estados explícitos", () => {
  it("ok: entrega tasas con fuente y fecha", async () => {
    vi.stubGlobal("fetch", respuesta({ actualizado: "2026-09-28", fuente: "SERNAC", ofertas: [{ institucion: "A", tasaMensual: 0.012 }] }));
    const r = await cargarMercado();
    expect(r.estado).toBe("ok");
    expect(r.mercado.ofertas).toHaveLength(1);
  });
  it("vacío: el archivo existe pero no trae tasas (no se inventan)", async () => {
    vi.stubGlobal("fetch", respuesta({ actualizado: null, fuente: "", ofertas: [] }));
    expect((await cargarMercado()).estado).toBe("vacio");
  });
  it("error: la respuesta HTTP falla", async () => {
    vi.stubGlobal("fetch", respuesta({}, false));
    expect((await cargarMercado()).estado).toBe("error");
  });
  it("error: la red se cae", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect((await cargarMercado()).estado).toBe("error");
  });
  it("error: JSON corrupto", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("bad"); } }));
    expect((await cargarMercado()).estado).toBe("error");
  });
  it("error por tiempo: si el servidor no responde, corta a los pocos segundos en vez de colgarse", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    })));
    const t0 = Date.now();
    const r = await cargarMercado("/rates.json", 50);
    expect(r.estado).toBe("error");
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it("ignora tasas absurdas (negativas, 0, más de 20% mensual) o mal formadas", async () => {
    vi.stubGlobal("fetch", respuesta({ actualizado: "2026-09-28", fuente: "X", ofertas: [
      { institucion: "Bien", tasaMensual: 0.015 }, { institucion: "Neg", tasaMensual: -1 }, { institucion: "Cero", tasaMensual: 0 },
      { institucion: "Enorme", tasaMensual: 3 }, { tasaMensual: 0.02 }, "basura", null] }));
    const r = await cargarMercado();
    expect(r.mercado.ofertas.map((o) => o.institucion)).toEqual(["Bien"]);
  });
});

describe("resumirMercado", () => {
  it("mínimo y mediana", () => {
    const r = resumirMercado({ actualizado: "2026-09-28", fuente: "SERNAC", ofertas: [
      { institucion: "A", tasaMensual: 0.012 }, { institucion: "B", tasaMensual: 0.016 }, { institucion: "C", tasaMensual: 0.02 }] })!;
    expect(r.min).toBeCloseTo(0.012); expect(r.mediana).toBeCloseTo(0.016); expect(r.mejor).toBe("A");
  });
});
