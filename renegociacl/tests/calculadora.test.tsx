import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Calculadora from "@/components/Calculadora";
import Tema from "@/components/Tema";
import { codificarEstado } from "@/lib/compartir";

const VACIO = { actualizado: null, fuente: "", ofertas: [] };
const CON_TASAS = { actualizado: "2026-09-28", fuente: "SERNAC", ofertas: [{ institucion: "Banco Uno", tasaMensual: 0.012 }, { institucion: "Banco Dos", tasaMensual: 0.018 }] };

function mockRates(data: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => data }));
}
async function llenar(saldo = "3000000", cuota = "153000", tasa = "3") {
  await userEvent.type(screen.getByLabelText(/cuánto debes/i), saldo);
  await userEvent.type(screen.getByLabelText(/tu cuota mensual/i), cuota);
  await userEvent.type(screen.getByLabelText(/^tasa de interés/i), tasa);
}
const calcular = () => userEvent.click(screen.getByRole("button", { name: /^calcular/i }));

beforeEach(() => { mockRates(VACIO); window.location.hash = ""; });
afterEach(() => vi.unstubAllGlobals());

describe("Ingreso de datos", () => {
  it("da formato de pesos mientras escribe", async () => {
    render(<Calculadora />);
    await userEvent.type(screen.getByLabelText(/cuánto debes/i), "3000000");
    expect(screen.getByLabelText(/cuánto debes/i)).toHaveValue("3.000.000");
  });
  it("al pegar '$3.000.000,00' de una cartola no lo multiplica por 100", () => {
    render(<Calculadora />);
    fireEvent.change(screen.getByLabelText(/cuánto debes/i), { target: { value: "$3.000.000,00" } });
    expect(screen.getByLabelText(/cuánto debes/i)).toHaveValue("3.000.000");
  });
  it("los placeholders son números reales de ejemplo", () => {
    render(<Calculadora />);
    expect(screen.getByLabelText(/cuánto debes/i)).toHaveAttribute("placeholder", "3.000.000");
    expect(screen.getByLabelText(/tu cuota mensual/i)).toHaveAttribute("placeholder", "153.000");
  });
  it("permite dar la tasa por año y muestra su equivalente mensual", async () => {
    render(<Calculadora />);
    await userEvent.click(screen.getByLabelText(/por año/i));
    await userEvent.type(screen.getByLabelText(/^tasa de interés/i), "26,8242");
    expect(screen.getByText(/equivale a 2,00% al mes/i)).toBeInTheDocument();
  });
  it("las ayudas '?' explican la jerga y se abren con teclado", async () => {
    render(<Calculadora />);
    const ayuda = screen.getByRole("button", { name: /qué es la tasa de interés/i });
    expect(ayuda).toHaveAttribute("aria-expanded", "false");
    ayuda.focus();
    await userEvent.keyboard("{Enter}");
    expect(ayuda).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/lo que te cobra el banco cada mes/i)).toBeVisible();
  });
});

describe("Resultado", () => {
  it("un clic: 3 a 5 opciones en lenguaje simple y la mejor destacada arriba", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    const lista = await screen.findByRole("list", { name: /opciones/i });
    const items = within(lista).getAllByRole("listitem");
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items[0]).toHaveTextContent(/Mejor opción/);
    expect(screen.getByRole("heading", { name: /tu mejor opción/i })).toBeInTheDocument();
  });
  it("explica la situación actual en pesos y meses", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    expect(await screen.findByText(/Te faltan/)).toBeInTheDocument();
    expect(screen.getByText(/solo intereses/)).toBeInTheDocument();
  });
  it("gráficos con los mismos datos en texto (no dependen del color)", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    const total = await screen.findByRole("region", { name: /cuánto pagarías en total/i });
    expect(within(total).getAllByRole("listitem").length).toBeGreaterThanOrEqual(4);
    expect(within(total).getByText(/^Hoy$/)).toBeInTheDocument();
    const tiempo = screen.getByRole("region", { name: /cuándo terminas de pagar/i });
    expect(within(tiempo).getAllByText(/\d+ meses?/).length).toBeGreaterThanOrEqual(4);
  });
  it("cada opción muestra paso a paso cómo se calcula (primeros meses, hoy vs. opción)", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    const primera = (await screen.findAllByText(/ver cómo se calcula/i))[0];
    await userEvent.click(primera);
    const tablas = screen.getAllByRole("table", { name: /primeros meses/i });
    expect(tablas.length).toBeGreaterThanOrEqual(2);
    expect(within(tablas[0]).getByText(/interés/i)).toBeInTheDocument();
  });
  it("si la cuota no cubre los intereses da un error claro", async () => {
    render(<Calculadora />);
    await llenar("5000000", "50000", "3");
    await calcular();
    expect(await screen.findByRole("alert")).toHaveTextContent(/nunca baja/i);
  });
  it("pide datos si faltan", async () => {
    render(<Calculadora />);
    await calcular();
    expect(await screen.findByRole("alert")).toHaveTextContent(/saldo/i);
  });
  it("crédito al 0%: explica que no hay nada que renegociar", async () => {
    render(<Calculadora />);
    await llenar("1000000", "100000", "0");
    await calcular();
    expect(await screen.findByText(/no cobra intereses/i)).toBeInTheDocument();
  });
  it("cambiar a 'Bajar mi cuota' reordena al instante", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    const antes = (await screen.findAllByRole("listitem"))[0].textContent;
    await userEvent.click(screen.getByLabelText(/bajar mi cuota/i));
    expect(screen.getAllByRole("listitem")[0].textContent).not.toBe(antes);
  });
  it("avisa si editas datos después de calcular (resultados desactualizados)", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    await screen.findByText(/Te faltan/);
    await userEvent.type(screen.getByLabelText(/tu cuota mensual/i), "0");
    expect(screen.getByRole("status")).toHaveTextContent(/cambiaste los datos/i);
  });
});

describe("Ofertas, tarjeta y abono", () => {
  it("usa y nombra la oferta recibida", async () => {
    render(<Calculadora />);
    await llenar();
    await userEvent.click(screen.getByText(/te ofrecieron una tasa mejor/i));
    await userEvent.click(screen.getByRole("button", { name: /agregar oferta/i }));
    await userEvent.type(screen.getByLabelText("Banco"), "Banco Amigo");
    await userEvent.type(screen.getByLabelText(/^tasa mensual \(%\)/i), "1,2");
    await calcular();
    expect((await screen.findAllByText(/Banco Amigo/)).length).toBeGreaterThan(0);
  });
  it("si la oferta es peor que tu tasa, lo dice", async () => {
    render(<Calculadora />);
    await llenar();
    await userEvent.click(screen.getByText(/te ofrecieron una tasa mejor/i));
    await userEvent.click(screen.getByRole("button", { name: /agregar oferta/i }));
    await userEvent.type(screen.getByLabelText("Banco"), "Caro");
    await userEvent.type(screen.getByLabelText(/^tasa mensual \(%\)/i), "3,5");
    await calcular();
    expect(await screen.findByText(/no mejora tu tasa actual/i)).toBeInTheDocument();
  });
  it("la tarjeta se compara aunque cierres el bloque después de llenarlo", async () => {
    render(<Calculadora />);
    await llenar();
    const resumen = screen.getByText(/tienes tarjeta de crédito/i);
    await userEvent.click(resumen);
    await userEvent.type(screen.getByLabelText(/saldo de la tarjeta/i), "2000000");
    await userEvent.type(screen.getByLabelText(/tasa mensual de la tarjeta/i), "3,5");
    await userEvent.click(resumen);
    await calcular();
    expect(within(await screen.findByRole("table", { name: /comparación de tasas/i })).getByText("Tu tarjeta")).toBeInTheDocument();
  });
  it("un abono único opcional aparece como opción", async () => {
    render(<Calculadora />);
    await llenar();
    await userEvent.click(screen.getByText(/¿puedes abonar una parte/i));
    await userEvent.type(screen.getByLabelText(/abono de una sola vez/i), "500000");
    await calcular();
    expect((await screen.findAllByText(/Abona \$500\.000 hoy/)).length).toBeGreaterThan(0);
  });
});

describe("Confianza: fuentes y estado de las tasas", () => {
  it("sin tasas cargadas no inventa referencias", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    expect(await screen.findByText(/aún no hay tasas de mercado cargadas/i)).toBeInTheDocument();
  });
  it("con tasas cargadas muestra fuente y fecha de actualización", async () => {
    mockRates(CON_TASAS);
    render(<Calculadora />);
    await llenar();
    await calcular();
    const fuentes = await screen.findByRole("region", { name: /de dónde salen los números/i });
    expect(fuentes).toHaveTextContent(/SERNAC/);
    expect(fuentes).toHaveTextContent(/2026-09-28/);
    expect(fuentes).toHaveTextContent(/Banco Uno/);
  });
  it("si falla la carga lo dice y permite reintentar; la calculadora sigue funcionando", async () => {
    mockRates({}, false);
    render(<Calculadora />);
    await llenar();
    await calcular();
    expect(await screen.findByText(/te faltan/i)).toBeInTheDocument();
    mockRates(CON_TASAS);
    await userEvent.click(await screen.findByRole("button", { name: /reintentar/i }));
    expect(await screen.findByText(/Banco Uno/)).toBeInTheDocument();
  });
  it("muestra el aviso legal y no usa logos de bancos", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    expect(await screen.findByText(/no es una oferta de crédito ni asesoría financiera/i)).toBeInTheDocument();
    expect(document.querySelectorAll("img").length).toBe(0);
  });
});

describe("Compartir, imprimir, comparar, ayuda", () => {
  it("copia un enlace con los datos en el fragmento y advierte que quien lo reciba los verá", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Calculadora />);
    await llenar();
    await calcular();
    await userEvent.click(await screen.findByRole("button", { name: /copiar enlace/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("#d=");
    expect(screen.getByText(/quien reciba el enlace verá estos datos/i)).toBeInTheDocument();
  });
  it("abre con los datos y el resultado ya calculados desde un enlace compartido", async () => {
    window.location.hash = "#d=" + codificarEstado({ credito: { saldo: 3_000_000, cuota: 153_000, tasaMensual: 0.03 }, modo: "intereses" });
    render(<Calculadora />);
    expect(await screen.findByText(/Te faltan/)).toBeInTheDocument();
    expect(screen.getByLabelText(/cuánto debes/i)).toHaveValue("3.000.000");
  });
  it("ignora un enlace corrupto sin romperse", async () => {
    window.location.hash = "#d=%%%basura";
    render(<Calculadora />);
    expect(screen.getByRole("button", { name: /^calcular/i })).toBeInTheDocument();
    expect(screen.queryByText(/Te faltan/)).not.toBeInTheDocument();
  });
  it("imprimir / guardar como PDF llama a window.print", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<Calculadora />);
    await llenar();
    await calcular();
    await userEvent.click(await screen.findByRole("button", { name: /guardar como pdf/i }));
    expect(print).toHaveBeenCalled();
  });
  it("modo comparación: guarda dos créditos y marca cuál renegociar primero", async () => {
    render(<Calculadora />);
    await llenar("3000000", "153000", "3");
    await calcular();
    await userEvent.click(await screen.findByRole("button", { name: /guardar para comparar/i }));
    await userEvent.clear(screen.getByLabelText(/cuánto debes/i));
    await userEvent.clear(screen.getByLabelText(/tu cuota mensual/i));
    await userEvent.type(screen.getByLabelText(/cuánto debes/i), "1000000");
    await userEvent.type(screen.getByLabelText(/tu cuota mensual/i), "49924");
    await calcular();
    await userEvent.click(await screen.findByRole("button", { name: /guardar para comparar/i }));
    const tabla = await screen.findByRole("table", { name: /comparación de créditos/i });
    expect(within(tabla).getAllByRole("row")).toHaveLength(3);
    expect(tabla).toHaveTextContent(/renegocia este primero/i);
  });
  it("incluye preguntas frecuentes, entre ellas por qué difiere del banco", async () => {
    render(<Calculadora />);
    expect(screen.getByText(/por qué me da distinto que en mi banco/i)).toBeInTheDocument();
    expect(screen.getByText(/qué pasa si mi tasa es anual/i)).toBeInTheDocument();
  });
});

describe("Tema oscuro", () => {
  afterEach(() => { document.documentElement.classList.remove("dark"); localStorage.clear(); });
  it("alterna la clase y recuerda la elección", async () => {
    render(<Tema />);
    const b = screen.getByRole("button", { name: /modo oscuro/i });
    expect(b).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(b);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("tema")).toBe("oscuro");
    expect(b).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(b);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("Gráficos comparan solo lo comparable", () => {
  it("la opción de tarjeta (otra deuda) no aparece en los gráficos de total ni de plazo", async () => {
    render(<Calculadora />);
    await llenar();
    await userEvent.click(screen.getByText(/tienes tarjeta de crédito/i));
    await userEvent.type(screen.getByLabelText(/saldo de la tarjeta/i), "2000000");
    await userEvent.type(screen.getByLabelText(/tasa mensual de la tarjeta/i), "3,5");
    await calcular();
    const total = await screen.findByRole("region", { name: /cuánto pagarías en total/i });
    const tiempo = screen.getByRole("region", { name: /cuándo terminas de pagar/i });
    expect(within(total).queryByText(/tarjeta/i)).not.toBeInTheDocument();
    expect(within(tiempo).queryByText(/tarjeta/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Pasa tu tarjeta/).length).toBeGreaterThan(0); // sigue en la lista de opciones
  });
});
