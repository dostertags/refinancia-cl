import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Calculadora from "@/components/Calculadora";
import Tema from "@/components/Tema";
import { codificarEstado } from "@/lib/compartir";
import subset from "./fixtures/rates-sernac-subset.json";

const VACIO = { ...subset, simulaciones: [] };
const CON_TASAS = subset;

function mockRates(data: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => data }));
}
async function llenar(saldo = "3000000", cuota = "153000", tasa = "3") {
  await userEvent.type(screen.getByLabelText(/cuánto debes/i), saldo);
  await userEvent.type(screen.getByLabelText(/tu cuota mensual/i), cuota);
  await userEvent.type(screen.getByLabelText(/^tasa de interés/i), tasa);
}
const calcular = () => userEvent.click(screen.getByRole("button", { name: /^calcular/i }));

beforeEach(() => { mockRates(CON_TASAS); window.location.hash = ""; });
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
  it("cada opción muestra el cálculo COMPLETO mes a mes (hoy vs. opción) con totales", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    const primera = (await screen.findAllByText(/ver cómo se calcula/i))[0];
    await userEvent.click(primera);
    const hoy = screen.getByRole("table", { name: /hoy, sin cambiar nada/i });
    const nueva = screen.getAllByRole("table", { name: /con esta opción/i })[0];
    expect(within(hoy).getByText(/interés/i)).toBeInTheDocument();
    // Una fila por mes (más encabezado y total): nada truncado.
    const meses = Number(/\((\d+) meses?\)/.exec(hoy.querySelector("caption")!.textContent!)![1]);
    expect(within(hoy).getAllByRole("row")).toHaveLength(meses + 2);
    expect(within(nueva).getByRole("row", { name: /total/i })).toBeInTheDocument();
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
    expect(await screen.findByRole("alert")).toHaveTextContent(/crédito de consumo.*tarjeta/i);
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
  it("sin tasas cargadas no inventa nada: solo opciones que no requieren renegociar", async () => {
    mockRates(VACIO);
    render(<Calculadora />);
    await llenar();
    await calcular();
    expect(await screen.findByText(/aún no hay tasas de mercado cargadas/i)).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: /opciones/i })).getAllByRole("listitem");
    expect(items.every((li) => /sin renegociar|renegociar nada/i.test(li.textContent ?? ""))).toBe(true);
  });
  it("muestra la tasa más competitiva del mercado con institución, fuente oficial y fecha", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    const r = await screen.findByRole("region", { name: /tasa más competitiva del mercado/i });
    expect(r).toHaveTextContent(/1,19%/);
    expect(r).toHaveTextContent(/Banco BICE/);
    expect(r).toHaveTextContent(/SERNAC/);
    expect(r).toHaveTextContent(/29-09-2026/);
    expect(within(r).getByRole("link", { name: /sernac/i })).toHaveAttribute("href", expect.stringMatching(/^https:\/\/www\.sernac\.cl/));
  });
  it("cada opción de mercado nombra la institución y enlaza a la fuente", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    const primera = (await screen.findAllByRole("listitem"))[0];
    expect(primera).toHaveTextContent(/Banco BICE/);
    expect(primera).toHaveTextContent(/informada por .* al SERNAC/i);
    expect(within(primera).getByRole("link", { name: /ver fuente/i })).toHaveAttribute("href", expect.stringContaining("sernac.cl"));
  });
  it("de dónde salen los números: fuente, fecha, aviso de simulaciones referenciales y nota del CAE", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    const f = await screen.findByRole("region", { name: /de dónde salen los números/i });
    expect(f).toHaveTextContent(/SERNAC/);
    expect(f).toHaveTextContent(/29-09-2026/);
    expect(f).toHaveTextContent(/referenciales/i);
    expect(f).toHaveTextContent(/cada institución/i);
    expect(within(f).getByRole("link", { name: /comparador/i })).toBeInTheDocument();
  });
  it("por defecto compara con seguro de desgravamen y se puede quitar (cambian las cifras)", async () => {
    render(<Calculadora />);
    await llenar();
    await calcular();
    const antes = (await screen.findAllByRole("listitem"))[0].textContent;
    const seguro = screen.getByLabelText(/con seguro de desgravamen/i);
    expect(seguro).toBeChecked();
    await userEvent.click(seguro);
    expect(screen.getAllByRole("listitem")[0].textContent).not.toBe(antes);
  });
  it("si falla la carga lo dice y permite reintentar; la calculadora sigue funcionando", async () => {
    mockRates({}, false);
    render(<Calculadora />);
    await llenar();
    await calcular();
    expect(await screen.findByText(/Te faltan/)).toBeInTheDocument();
    expect(await screen.findByText(/no pudimos cargar las tasas de mercado/i)).toBeInTheDocument();
    mockRates(CON_TASAS);
    await userEvent.click(await screen.findByRole("button", { name: /reintentar/i }));
    expect((await screen.findAllByText(/Banco BICE/)).length).toBeGreaterThan(0);
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

async function agregarTarjeta(nombre: string, saldo: string, opts: { pago?: string; tasa?: string } = {}, indice = 0) {
  await userEvent.click(screen.getByRole("button", { name: /agregar tarjeta/i }));
  const nombres = screen.getAllByLabelText(/nombre de la tarjeta/i), saldos = screen.getAllByLabelText(/total que debes en esta tarjeta/i);
  const pagos = screen.getAllByLabelText(/pago mensual de esta tarjeta/i), tasas = screen.getAllByLabelText(/tasa mensual de esta tarjeta/i);
  if (nombre) await userEvent.type(nombres[indice], nombre);
  await userEvent.type(saldos[indice], saldo);
  if (opts.pago) await userEvent.type(pagos[indice], opts.pago);
  if (opts.tasa) await userEvent.type(tasas[indice], opts.tasa);
}

describe("Reglas claras: obligatorio y opcional", () => {
  it("un cuadro explica qué se necesita y qué es opcional, antes de llenar nada", () => {
    render(<Calculadora />);
    const r = screen.getByRole("region", { name: /qué necesitas/i });
    expect(r).toHaveTextContent(/obligatorio/i);
    expect(r).toHaveTextContent(/cuánto debes y tu cuota/i);
    expect(r).toHaveTextContent(/tasa de interés o los meses que te faltan/i);
    expect(r).toHaveTextContent(/opcional/i);
    expect(r).toHaveTextContent(/tarjetas/i);
  });
  it("cada campo dice si es obligatorio, una-de-dos u opcional", () => {
    render(<Calculadora />);
    expect(screen.getByLabelText(/cuánto debes/i)).toHaveAccessibleDescription(/obligatorio/i);
    expect(screen.getByLabelText(/tu cuota mensual/i)).toHaveAccessibleDescription(/obligatorio/i);
    expect(screen.getByLabelText(/^tasa de interés/i)).toHaveAccessibleDescription(/una de las dos/i);
    expect(screen.getByLabelText(/meses que te faltan/i)).toHaveAccessibleDescription(/una de las dos/i);
  });
  it("las secciones opcionales están marcadas como opcionales", () => {
    render(<Calculadora />);
    expect(screen.getByText(/tarjetas de crédito \(opcional\)/i)).toBeInTheDocument();
    expect(screen.getByText(/te ofrecieron una tasa mejor\? \(opcional\)/i)).toBeInTheDocument();
  });
});

describe("Tasa opcional: alcanza con los meses que te faltan", () => {
  it("saldo + cuota + meses (sin tasa) calcula y explica que la tasa se calculó", async () => {
    render(<Calculadora />);
    await userEvent.type(screen.getByLabelText(/cuánto debes/i), "3000000");
    await userEvent.type(screen.getByLabelText(/tu cuota mensual/i), "153000");
    await userEvent.type(screen.getByLabelText(/meses que te faltan/i), "31");
    await calcular();
    expect(await screen.findByText(/Te faltan/)).toBeInTheDocument();
    expect(screen.getByText(/calculamos tu tasa a partir de los meses que te faltan/i)).toBeInTheDocument();
  });
  it("sin tasa ni meses explica que falta una de las dos", async () => {
    render(<Calculadora />);
    await userEvent.type(screen.getByLabelText(/cuánto debes/i), "3000000");
    await userEvent.type(screen.getByLabelText(/tu cuota mensual/i), "153000");
    await calcular();
    expect(await screen.findByRole("alert")).toHaveTextContent(/tasa de interés o los meses que te faltan/i);
  });
});

describe("Tarjetas: se suman al total a refinanciar", () => {
  it("permite agregar hasta 3 tarjetas y oculta el botón al llegar a 3", async () => {
    render(<Calculadora />);
    for (let k = 0; k < 3; k++) await userEvent.click(screen.getByRole("button", { name: /agregar tarjeta/i }));
    expect(screen.getAllByLabelText(/total que debes en esta tarjeta/i)).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /agregar tarjeta/i })).not.toBeInTheDocument();
  });
  it("cada tarjeta trae la casilla 'Incluir en el refinanciamiento' marcada por defecto", async () => {
    render(<Calculadora />);
    await userEvent.click(screen.getByRole("button", { name: /agregar tarjeta/i }));
    expect(screen.getByLabelText(/incluir en el refinanciamiento/i)).toBeChecked();
  });
  it("muestra el total a refinanciar con el desglose (crédito + tarjeta)", async () => {
    render(<Calculadora />);
    await llenar();
    await agregarTarjeta("Falabella", "2000000", { pago: "100000", tasa: "3,5" });
    await calcular();
    const r = await screen.findByRole("region", { name: /deuda a refinanciar/i });
    expect(r).toHaveTextContent("$5.000.000");
    expect(r).toHaveTextContent(/Tu crédito/);
    expect(r).toHaveTextContent(/Falabella/);
  });
  it("hoy pagas incluye la tarjeta", async () => {
    render(<Calculadora />);
    await llenar();
    await agregarTarjeta("Falabella", "2000000", { pago: "100000", tasa: "3,5" });
    await calcular();
    expect(await screen.findByText(/hoy pagas/i)).toHaveTextContent("$253.000");
  });
  it("al desmarcar la casilla, la tarjeta queda fuera del total pero sigue en lo que pagas", async () => {
    render(<Calculadora />);
    await llenar();
    await agregarTarjeta("Falabella", "2000000", { pago: "100000", tasa: "3,5" });
    await userEvent.click(screen.getByLabelText(/incluir en el refinanciamiento/i));
    await calcular();
    const r = await screen.findByRole("region", { name: /deuda a refinanciar/i });
    expect(r).toHaveTextContent("$3.000.000");
    expect(r).toHaveTextContent(/se queda como está/i);
    expect(screen.getByText(/hoy pagas/i)).toHaveTextContent("$253.000");
  });
  it("solo saldo: no inventa y explica que falta el pago o la tasa", async () => {
    render(<Calculadora />);
    await llenar();
    await agregarTarjeta("Ripley", "2000000");
    await calcular();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Ripley.*pago mensual o su tasa/i);
  });
  it("con pago mensual y sin tasa, dice qué se supuso", async () => {
    render(<Calculadora />);
    await llenar();
    await agregarTarjeta("Ripley", "2000000", { pago: "100000" });
    await calcular();
    const s = await screen.findByRole("region", { name: /lo que supusimos/i });
    expect(s).toHaveTextContent(/24 meses/);
  });
  it("una tarjeta con datos pero sin saldo avisa que falta el total", async () => {
    render(<Calculadora />);
    await llenar();
    await userEvent.click(screen.getByRole("button", { name: /agregar tarjeta/i }));
    await userEvent.type(screen.getAllByLabelText(/pago mensual de esta tarjeta/i)[0], "100000");
    await calcular();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Tu tarjeta.*cuánto debes en ella/i);
  });
  it("solo con una tarjeta (sin crédito de consumo) la tarjeta entra al total a refinanciar", async () => {
    render(<Calculadora />);
    await agregarTarjeta("Falabella", "2000000", { pago: "100000" });
    await calcular();
    const r = await screen.findByRole("region", { name: /deuda a refinanciar/i });
    expect(r).toHaveTextContent("$2.000.000");
    expect(r).toHaveTextContent(/Falabella/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/hoy pagas/i)).toHaveTextContent("$100.000");
  });
  it("con tarjeta, los campos del crédito dicen que son opcionales; sin tarjeta, obligatorios", async () => {
    render(<Calculadora />);
    expect(screen.getByLabelText(/tu cuota mensual/i)).toHaveAccessibleDescription(/^Obligatorio/);
    await userEvent.click(screen.getByRole("button", { name: /agregar tarjeta/i }));
    expect(screen.getByLabelText(/tu cuota mensual/i)).toHaveAccessibleDescription(/Opcional si agregas tarjeta/);
  });
  it("crédito + 2 tarjetas: el total a refinanciar es la suma exacta y cada una aparece en el desglose", async () => {
    render(<Calculadora />);
    await llenar();
    await agregarTarjeta("Falabella", "2000000", { pago: "100000" }, 0);
    await agregarTarjeta("Ripley", "1500000", { tasa: "3,2" }, 1);
    await calcular();
    const r = await screen.findByRole("region", { name: /deuda a refinanciar/i });
    expect(r).toHaveTextContent("$6.500.000");
    expect(r).toHaveTextContent(/Falabella.*\$2\.000\.000/);
    expect(r).toHaveTextContent(/Ripley.*\$1\.500\.000/);
  });
  it("las tarjetas viajan en el enlace compartido y se recuperan", async () => {
    window.location.hash = "#d=" + codificarEstado({ credito: { saldo: 3_000_000, cuota: 153_000, mesesRestantes: 31,
      tarjetas: [{ nombre: "Falabella", saldo: 2_000_000, pagoMensual: 100_000, incluir: false }] }, modo: "intereses" });
    render(<Calculadora />);
    expect(await screen.findByText(/Te faltan/)).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre de la tarjeta/i)).toHaveValue("Falabella");
    expect(screen.getByLabelText(/incluir en el refinanciamiento/i)).not.toBeChecked();
  });
  it("los gráficos comparan el total de TODAS las deudas contra cada opción", async () => {
    render(<Calculadora />);
    await llenar();
    await agregarTarjeta("Falabella", "2000000", { pago: "100000", tasa: "3,5" });
    await calcular();
    const total = await screen.findByRole("region", { name: /cuánto pagarías en total/i });
    expect(within(total).getByText(/^Hoy$/)).toBeInTheDocument();
    expect(total).toHaveTextContent(/\$[\d.]{9}/);
  });
});
