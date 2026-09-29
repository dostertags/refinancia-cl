import { describe, expect, it } from "vitest";
import { codificarEstado, decodificarEstado, type EstadoCompartido } from "@/lib/compartir";
import { resumenComparacion } from "@/lib/comparador";
import { escalar } from "@/lib/graficos";

const estado: EstadoCompartido = {
  credito: { saldo: 3_000_000, cuota: 153_000, tasaMensual: 0.03, tarjeta: { saldo: 2_000_000, tasaMensual: 0.035 },
    ofertas: [{ nombre: "Banco Ñandú", tasaMensual: 0.012, gastos: 30_000 }], abonoUnico: 200_000 },
  modo: "cuota",
};

describe("enlace para compartir", () => {
  it("ida y vuelta con tildes y ñ", () => expect(decodificarEstado(codificarEstado(estado))).toEqual(estado));
  it("usa solo caracteres seguros para una URL", () => expect(codificarEstado(estado)).toMatch(/^[A-Za-z0-9_-]+$/));
  it.each([["", "vacío"], ["%%%", "no base64"], ["e30", "json sin campos"], [btoa("no es json"), "no json"]])(
    "descarta entradas inválidas (%s: %s)", (h) => expect(decodificarEstado(h)).toBeNull());
  it("rechaza valores fuera de rango o de tipo incorrecto", () => {
    const malo = codificarEstado({ ...estado, credito: { ...estado.credito, saldo: -5 } });
    expect(decodificarEstado(malo)).toBeNull();
    const raro = btoa(JSON.stringify({ credito: { saldo: "3000000", cuota: 1, tasaMensual: 0.02 }, modo: "cuota" })).replace(/=+$/, "");
    expect(decodificarEstado(raro)).toBeNull();
  });
  it("rechaza modos desconocidos y payloads gigantes", () => {
    expect(decodificarEstado(codificarEstado({ ...estado, modo: "hack" as never }))).toBeNull();
    expect(decodificarEstado("A".repeat(5000))).toBeNull();
  });
});

describe("gráficos: escalar", () => {
  it("el mayor ocupa 100% y los demás son proporcionales", () => expect(escalar([50, 100, 25])).toEqual([50, 100, 25]));
  it("maneja ceros y vacío", () => { expect(escalar([0, 0])).toEqual([0, 0]); expect(escalar([])).toEqual([]); });
  it("nunca devuelve más de 100 ni menos de 0", () => {
    for (const v of escalar([3, -2, 9])) { expect(v).toBeLessThanOrEqual(100); expect(v).toBeGreaterThanOrEqual(0); }
  });
});

describe("modo comparación de créditos", () => {
  const lista = [
    { id: "a", nombre: "Banco A", credito: { saldo: 3_000_000, cuota: 153_000, tasaMensual: 0.03 } },
    { id: "b", nombre: "Casa B", credito: { saldo: 1_000_000, cuota: 49_924, tasaMensual: 0.015 } },
  ];
  it("resume cada crédito lado a lado", () => {
    const r = resumenComparacion(lista);
    expect(r).toHaveLength(2);
    expect(r[0].nombre).toBe("Banco A");
    expect(r[0].meses).toBeGreaterThan(20);
    expect(r[0].intereses).toBeGreaterThan(0);
    expect(r[0].mejorAhorro).toBeGreaterThan(0);
  });
  it("marca cuál conviene renegociar primero (mayor ahorro)", () => {
    const r = resumenComparacion(lista);
    expect(r.find((x) => x.prioridad)!.nombre).toBe("Banco A");
  });
  it("un crédito inválido no rompe la comparación", () => {
    const r = resumenComparacion([...lista, { id: "c", nombre: "Malo", credito: { saldo: 5_000_000, cuota: 10_000, tasaMensual: 0.03 } }]);
    expect(r.find((x) => x.nombre === "Malo")!.error).toMatch(/nunca baja/i);
  });
});
