// Reglas acordadas: crédito = cuota + (tasa o meses); tarjeta = (pago o tasa); casilla "incluir"; textos claros.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StepDeudas from "@/components/StepDeudas";
import StepResultado from "@/components/StepResultado";
import type { Resultado } from "@/lib/types";

vi.mock("recharts", () => {
  const V = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: V, BarChart: V, Bar: V, CartesianGrid: V, XAxis: V, YAxis: V, Tooltip: V, Legend: V };
});

const opciones = { objetivo: "costo" as const, tarjetas_mas_de_24: false };
function montar() {
  const onNext = vi.fn();
  render(<StepDeudas inicial={[]} opciones={opciones} onNext={onNext} onBack={vi.fn()} />);
  return onNext;
}
const escribir = async (etiqueta: string | RegExp, valor: string) => userEvent.type(screen.getByLabelText(etiqueta), valor);
const simular = () => userEvent.click(screen.getByRole("button", { name: /simular/i }));

describe("Explicación de reglas", () => {
  it("un cuadro dice qué es obligatorio y qué es opcional", () => {
    montar();
    const r = screen.getByRole("region", { name: /qué necesitas/i });
    expect(r).toHaveTextContent(/obligatorio/i);
    expect(r).toHaveTextContent(/tasa de interés o los meses que te faltan/i);
    expect(r).toHaveTextContent(/pago mensual o su tasa/i);
    expect(r).toHaveTextContent(/opcional/i);
    expect(r).toHaveTextContent(/incluir en el refinanciamiento/i);
  });
  it("cada campo declara su regla de forma accesible", () => {
    montar();
    expect(screen.getByLabelText("Institución")).toHaveAccessibleDescription(/obligatorio/i);
    expect(screen.getByLabelText("Monto adeudado")).toHaveAccessibleDescription(/obligatorio/i);
    expect(screen.getByLabelText("Cuota actual")).toHaveAccessibleDescription(/obligatorio/i);
    expect(screen.getByLabelText("Tasa mensual (%)")).toHaveAccessibleDescription(/una de las dos/i);
    expect(screen.getByLabelText("Meses restantes")).toHaveAccessibleDescription(/una de las dos/i);
  });
});

describe("Crédito: tasa o meses restantes, al menos uno", () => {
  it("con meses y sin tasa envía la deuda sin tasa", async () => {
    const onNext = montar();
    await escribir("Institución", "Banco A");
    await escribir("Monto adeudado", "3000000");
    await escribir("Cuota actual", "153000");
    await escribir("Meses restantes", "31");
    await simular();
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    const d = onNext.mock.calls[0][0][0];
    expect(d.tasa_mensual).toBeUndefined();
    expect(d.plazo_restante_meses).toBe(31);
    expect(d.incluir).toBe(true);
  });
  it("con tasa y sin meses también sirve", async () => {
    const onNext = montar();
    await escribir("Institución", "Banco A");
    await escribir("Monto adeudado", "3000000");
    await escribir("Cuota actual", "153000");
    await escribir("Tasa mensual (%)", "3");
    await simular();
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    const d = onNext.mock.calls[0][0][0];
    expect(d.tasa_mensual).toBeCloseTo(0.03);
    expect(d.plazo_restante_meses).toBeUndefined();
  });
  it("sin tasa ni meses explica qué falta y no envía", async () => {
    const onNext = montar();
    await escribir("Institución", "Banco A");
    await escribir("Monto adeudado", "3000000");
    await escribir("Cuota actual", "153000");
    await simular();
    expect(await screen.findByText(/escribe la tasa o los meses que te faltan/i)).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });
  it("la cuota sigue siendo obligatoria", async () => {
    const onNext = montar();
    await escribir("Institución", "Banco A");
    await escribir("Monto adeudado", "3000000");
    await escribir("Meses restantes", "31");
    await simular();
    expect(await screen.findByText(/ingresa la cuota/i)).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe("Tarjeta: pago mensual o tasa, al menos uno", () => {
  async function comoTarjeta() {
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "tarjeta");
  }
  it("al elegir tarjeta cambia la etiqueta a 'Pago mensual' y oculta los meses restantes", async () => {
    montar();
    await comoTarjeta();
    expect(screen.getByLabelText("Pago mensual de la tarjeta")).toBeInTheDocument();
    expect(screen.queryByLabelText("Meses restantes")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Pago mensual de la tarjeta")).toHaveAccessibleDescription(/una de las dos/i);
  });
  it("con solo tasa (sin pago) sirve", async () => {
    const onNext = montar();
    await comoTarjeta();
    await escribir("Institución", "Falabella");
    await escribir("Monto adeudado", "2000000");
    await escribir("Tasa mensual (%)", "3,5");
    await simular();
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(onNext.mock.calls[0][0][0].cuota_actual).toBeUndefined();
  });
  it("con solo pago (sin tasa) sirve", async () => {
    const onNext = montar();
    await comoTarjeta();
    await escribir("Institución", "Falabella");
    await escribir("Monto adeudado", "2000000");
    await escribir("Pago mensual de la tarjeta", "100000");
    await simular();
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(onNext.mock.calls[0][0][0].tasa_mensual).toBeUndefined();
  });
  it("solo con el saldo explica que falta el pago o la tasa", async () => {
    const onNext = montar();
    await comoTarjeta();
    await escribir("Institución", "Falabella");
    await escribir("Monto adeudado", "2000000");
    await simular();
    expect(await screen.findByText(/escribe el pago mensual o la tasa/i)).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe("Casilla 'Incluir en el refinanciamiento'", () => {
  it("viene marcada por defecto y al desmarcarla se envía incluir=false", async () => {
    const onNext = montar();
    const casilla = screen.getByLabelText(/incluir en el refinanciamiento/i);
    expect(casilla).toBeChecked();
    await userEvent.click(casilla);
    await escribir("Institución", "Banco A");
    await escribir("Monto adeudado", "3000000");
    await escribir("Cuota actual", "153000");
    await escribir("Meses restantes", "31");
    await simular();
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(onNext.mock.calls[0][0][0].incluir).toBe(false);
  });
});

const base: Resultado = {
  estado: "OK", fecha_calculo: "2026-09-29", renta_considerada: 1_500_000, situacion_actual: null, propuesta: null,
  tarjetas_amortizacion: [], analisis_una_deuda: null, reglas: [], alertas: [], sugerencias: [], mensajes: [],
  renta_minima_sugerida: null, fuente_ofertas: "sernac", aviso_ofertas: "Ofertas del SERNAC.",
  disclaimer: "Esta simulación no constituye una oferta de crédito.", aviso_retracto: "Sobre tu derecho a retracto: confirma en sernac.cl.",
  enlaces_oficiales: {}, supuestos: [], total_a_refinanciar: 0, partes_refinanciar: [], excluidas: [],
};

describe("Resultado: total a refinanciar y supuestos", () => {
  it("muestra el total a refinanciar con su desglose y lo que queda fuera", () => {
    render(<StepResultado onNext={vi.fn()} onBack={vi.fn()} res={{ ...base, total_a_refinanciar: 5_000_000,
      partes_refinanciar: [{ institucion: "Banco A", tipo: "consumo", monto: 3_000_000 }, { institucion: "Falabella", tipo: "tarjeta", monto: 2_000_000 }],
      excluidas: [{ institucion: "Ripley", tipo: "tarjeta", monto: 800_000 }] }} />);
    const r = screen.getByRole("region", { name: /deuda a refinanciar/i });
    expect(r).toHaveTextContent("$5.000.000");
    expect(within(r).getByText("Falabella")).toBeInTheDocument();
    expect(r).toHaveTextContent(/se queda como está.*Ripley/i);
  });
  it("explica lo que se supuso o calculó por falta de datos", () => {
    render(<StepResultado onNext={vi.fn()} onBack={vi.fn()} res={{ ...base, supuestos: ["Calculamos la tasa de Banco A a partir de los meses que le faltan: 3,02% al mes."] }} />);
    expect(screen.getByRole("region", { name: /lo que supusimos/i })).toHaveTextContent(/calculamos la tasa de Banco A/i);
  });
  it("sin supuestos ni total, no muestra esas secciones", () => {
    render(<StepResultado onNext={vi.fn()} onBack={vi.fn()} res={base} />);
    expect(screen.queryByRole("region", { name: /lo que supusimos/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /deuda a refinanciar/i })).not.toBeInTheDocument();
  });
});
