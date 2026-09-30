// Tasas de mercado: datos OFICIALES del Comparador de créditos de consumo del SERNAC (rates.json v2).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cargarMercado, ofertasDeMercado, parseMercado, resumirMercado } from "@/lib/mercado";
import subset from "./fixtures/rates-sernac-subset.json";

afterEach(() => vi.unstubAllGlobals());
const respuesta = (data: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, json: async () => data });
const mercado = parseMercado(subset)!;

describe("parseMercado (formato v2)", () => {
  it("lee las simulaciones con su fuente, enlace, fecha y aviso", () => {
    expect(mercado.fuente).toMatch(/SERNAC/);
    expect(mercado.urlFuente).toMatch(/^https:\/\/www\.sernac\.cl/);
    expect(mercado.actualizado).toBe("2026-09-29");
    expect(mercado.aviso).toMatch(/referenciales/i);
    expect(mercado.simulaciones.length).toBe(82);
  });
  it("convierte porcentajes a fracciones y seguro a booleano", () => {
    const s = mercado.simulaciones.find((x) => x.institucion === "BANCO BICE" && x.monto === 5_000_000 && x.cuotas === 48 && x.seguro)!;
    expect(s.tasaMensual).toBeCloseTo(0.0117, 6);
    expect(s.cae).toBeCloseTo(0.1674, 6);
    expect(s.cuota).toBe(143_611);
    expect(s.ctc).toBe(6_893_328);
  });
  it("rechaza versiones distintas, sin fecha o sin fuente", () => {
    expect(parseMercado({ ...subset, version: 1 })).toBeNull();
    expect(parseMercado({ ...subset, actualizado: null })).toBeNull();
    expect(parseMercado({ ...subset, url_fuente: "" })).toBeNull();
    expect(parseMercado(null)).toBeNull();
  });
  it("descarta filas absurdas o mal formadas sin romper el resto", () => {
    const sucio = { ...subset, simulaciones: [...subset.simulaciones, ["X", -1, 12, 1, 100, 1.5, 1, 1, 20, 1200], ["Y", 1e6, 12, 1, 100, 99, 1, 1, 20, 1200], "basura", null, ["Z"]] };
    expect(parseMercado(sucio)!.simulaciones.length).toBe(82);
  });
  it("una tasa mensual sobre 6% o CTC que no calza con cuota × cuotas se descarta", () => {
    const raro = { ...subset, simulaciones: [["ROTO", 1_000_000, 12, 1, 90_000, 2.0, 1, 1, 30, 5_000_000]] };
    expect(parseMercado(raro)!.simulaciones).toEqual([]);
  });
});

describe("cargarMercado: estados explícitos", () => {
  it("ok con datos oficiales", async () => {
    vi.stubGlobal("fetch", respuesta(subset));
    const r = await cargarMercado();
    expect(r.estado).toBe("ok");
    expect(r.mercado!.simulaciones.length).toBe(82);
  });
  it("vacío: archivo válido pero sin simulaciones", async () => {
    vi.stubGlobal("fetch", respuesta({ ...subset, simulaciones: [] }));
    expect((await cargarMercado()).estado).toBe("vacio");
  });
  it("error: formato antiguo, HTTP, red o JSON corrupto", async () => {
    for (const f of [respuesta({ actualizado: null, fuente: "", ofertas: [] }), respuesta({}, false), vi.fn().mockRejectedValue(new TypeError("x")),
      vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("x"); } })]) {
      vi.stubGlobal("fetch", f);
      expect((await cargarMercado()).estado).toBe("error");
    }
  });
  it("error por tiempo: corta en vez de colgarse", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    })));
    const t0 = Date.now();
    expect((await cargarMercado("/rates.json", 50)).estado).toBe("error");
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe("ofertasDeMercado: la más competitiva por plazo, a tu monto", () => {
  it("elige por cada plazo la institución con menor CTC y ordena por plazo", () => {
    const o = ofertasDeMercado(mercado, { monto: 5_000_000, seguro: true });
    expect(o.map((x) => x.cuotas)).toEqual([...o.map((x) => x.cuotas)].sort((a, b) => a - b));
    expect(new Set(o.map((x) => x.cuotas)).size).toBe(o.length);
    expect(o.every((x) => x.institucion === "BANCO BICE")).toBe(true); // hoy es la más barata en todos los plazos
    const o48 = o.find((x) => x.cuotas === 48)!;
    expect(o48.tasaMensual).toBeCloseTo(0.0117, 6);
    expect(o48.ctc).toBe(6_893_328);
    expect(o48.montoBase).toBe(5_000_000);
    expect(o48.escalado).toBe(false);
  });
  it("escala linealmente al monto pedido y lo declara", () => {
    const o = ofertasDeMercado(mercado, { monto: 4_000_000, seguro: true }).find((x) => x.cuotas === 48)!;
    expect(o.montoBase).toBe(5_000_000);   // el monto publicado más cercano
    expect(o.escalado).toBe(true);
    expect(o.cuota).toBeCloseTo(143_611 * 0.8, 0);
    expect(o.ctc).toBeCloseTo(6_893_328 * 0.8, 0);
  });
  it("usa el monto publicado más cercano, pero no extrapola lejos", () => {
    expect(ofertasDeMercado(mercado, { monto: 6_000_000, seguro: true })[0].montoBase).toBe(5_000_000);
    expect(ofertasDeMercado(mercado, { monto: 8_500_000, seguro: true })[0].montoBase).toBe(10_000_000);
    expect(ofertasDeMercado(mercado, { monto: 30_000_000, seguro: true })).toEqual([]);   // fuera de lo publicado (máx. $10.000.000)
  });
  it("respeta la opción de seguro de desgravamen", () => {
    const con = ofertasDeMercado(mercado, { monto: 5_000_000, seguro: true }).find((x) => x.cuotas === 48)!;
    const sin = ofertasDeMercado(mercado, { monto: 5_000_000, seguro: false }).find((x) => x.cuotas === 48)!;
    expect(sin.ctc).not.toBe(con.ctc);
    expect(sin.seguro).toBe(false);
  });
  it("sin mercado o con monto inválido devuelve vacío", () => {
    expect(ofertasDeMercado(null, { monto: 5_000_000, seguro: true })).toEqual([]);
    expect(ofertasDeMercado(mercado, { monto: 0, seguro: true })).toEqual([]);
  });
});

describe("resumirMercado", () => {
  it("resume la tasa más competitiva del mercado para tu monto, con fuente y fecha", () => {
    const r = resumirMercado(mercado, { monto: 5_000_000, seguro: true })!;
    expect(r.mejor.institucion).toBe("BANCO BICE");
    expect(r.menorTasa).toBeCloseTo(0.0116, 6);
    expect(r.peorTasa).toBeGreaterThan(0.02);
    expect(r.cantidadInstituciones).toBe(4);
    expect(r.actualizado).toBe("2026-09-29");
    expect(r.urlFuente).toMatch(/sernac\.cl/);
  });
  it("null si no hay datos", () => expect(resumirMercado(null, { monto: 1, seguro: true })).toBeNull());
});
