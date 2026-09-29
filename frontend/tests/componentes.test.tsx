import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Glosario from "@/components/Glosario";
import StepDeudas from "@/components/StepDeudas";
import StepPerfil from "@/components/StepPerfil";
import StepResultado from "@/components/StepResultado";
import { mensajeError } from "@/lib/api";
import type { Resultado } from "@/lib/types";

// Recharts necesita medidas reales del DOM; en jsdom lo sustituimos por un contenedor vacío.
vi.mock("recharts", () => {
  const Vacio = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: Vacio, BarChart: Vacio, Bar: Vacio, CartesianGrid: Vacio, XAxis: Vacio, YAxis: Vacio, Tooltip: Vacio, Legend: Vacio };
});

const base: Resultado = {
  estado: "SIN_DEUDAS", fecha_calculo: "2026-09-28", renta_considerada: 1_000_000, situacion_actual: null, propuesta: null,
  tarjetas_amortizacion: [], analisis_una_deuda: null, reglas: [], alertas: [], sugerencias: [], mensajes: [],
  renta_minima_sugerida: null, fuente_ofertas: "sernac", aviso_ofertas: "Ofertas del SERNAC.",
  disclaimer: "Esta simulación no constituye una oferta de crédito.", aviso_retracto: "Tienes 20 días corridos para retractarte.",
  enlaces_oficiales: {}, supuestos: [], total_a_refinanciar: 0, partes_refinanciar: [], excluidas: [],
};

describe("Glosario", () => {
  it("explica CAE, CTC y retracto en lenguaje simple", () => {
    render(<Glosario />);
    for (const t of ["CAE", "CTC", "Retracto", "Carga financiera"]) expect(screen.getByText(t)).toBeInTheDocument();
  });
});

describe("StepPerfil", () => {
  it("no avanza sin consentimiento expreso", async () => {
    const onNext = vi.fn();
    render(<StepPerfil inicial={null} onNext={onNext} />);
    await userEvent.type(screen.getByLabelText(/renta líquida mensual/i), "1500000");
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(await screen.findByText(/debes aceptar/i)).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("avanza con renta y consentimiento", async () => {
    const onNext = vi.fn();
    render(<StepPerfil inicial={null} onNext={onNext} />);
    await userEvent.type(screen.getByLabelText(/renta líquida mensual/i), "1.500.000");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(onNext.mock.calls[0][0].renta_liquida).toBe(1500000);
  });

  it("exige renta", async () => {
    render(<StepPerfil inicial={null} onNext={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(await screen.findByText(/ingresa tu renta/i)).toBeInTheDocument();
  });
});

describe("StepDeudas", () => {
  it("cada campo tiene su etiqueta asociada (accesibilidad)", () => {
    render(<StepDeudas inicial={[]} opciones={{ objetivo: "costo", tarjetas_mas_de_24: false }} onNext={vi.fn()} onBack={vi.fn()} />);
    for (const etiqueta of ["Institución", "Monto adeudado", "Tasa mensual (%)", "Cuota actual", "Meses restantes"]) {
      expect(screen.getByLabelText(etiqueta)).toBeInTheDocument();
    }
  });

  it("ofrece el modo menor cuota y la casilla de tarjetas solo en ese modo", async () => {
    render(<StepDeudas inicial={[]} opciones={{ objetivo: "costo", tarjetas_mas_de_24: false }} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.queryByLabelText(/más de 24 meses/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/menor cuota posible/i));
    expect(screen.getByLabelText(/más de 24 meses/i)).toBeInTheDocument();
  });
});

describe("StepResultado", () => {
  it("advierte con claridad cuando las ofertas son ilustrativas", () => {
    render(<StepResultado res={{ ...base, fuente_ofertas: "ilustrativas", aviso_ofertas: "Las ofertas usadas son ilustrativas y no son ofertas reales." }} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no son ofertas reales/i);
  });

  it("muestra siempre el disclaimer y el aviso de retracto", () => {
    render(<StepResultado res={base} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/no constituye una oferta de crédito/i)).toBeInTheDocument();
    expect(screen.getByText(/20 días corridos/i)).toBeInTheDocument();
  });

  it("explica qué hacer cuando los datos son inconsistentes", () => {
    render(<StepResultado res={{ ...base, estado: "DATOS_INCONSISTENTES", mensajes: ["La cuota de Banco X no calza."] }} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /revisa los datos/i })).toBeInTheDocument();
    expect(screen.getByText(/no calza/i)).toBeInTheDocument();
  });
});

describe("mensajeError", () => {
  it("usa el texto del detalle si es string", () => expect(mensajeError("Debes aceptar", 422)).toBe("Debes aceptar"));
  it("une los mensajes de validación en español", () => {
    expect(mensajeError([{ campo: "perfil.renta_liquida", msg: "Debe ser un número válido." }], 422)).toContain("Debe ser un número válido.");
  });
  it("maneja 429", () => expect(mensajeError(undefined, 429)).toMatch(/demasiadas solicitudes/i));
  it("tiene mensaje genérico", () => expect(mensajeError(undefined, 500)).toMatch(/500/));
});
