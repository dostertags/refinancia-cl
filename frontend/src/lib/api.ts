import type { Resultado, SimulacionRequest } from "./types";

// Sin cookies ni credenciales: `credentials: "omit"`. El backend no guarda la solicitud.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Convierte el `detail` de la API (texto o lista de {campo, msg}) en un mensaje legible en español. */
export function mensajeError(detalle: unknown, status: number): string {
  if (typeof detalle === "string") return detalle;
  if (Array.isArray(detalle) && detalle.length > 0) {
    return detalle
      .map((d) => (d && typeof d === "object" && "msg" in d ? `${(d as { campo?: string }).campo ? `${(d as { campo: string }).campo}: ` : ""}${(d as { msg: string }).msg}` : ""))
      .filter(Boolean)
      .join(" · ");
  }
  if (status === 429) return "Demasiadas solicitudes. Espera un minuto e intenta nuevamente.";
  return `No pudimos procesar la solicitud (error ${status}).`;
}

async function post(path: string, body: SimulacionRequest): Promise<Response> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST", credentials: "omit",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) {
    const cuerpo = await r.json().catch(() => ({}));
    throw new Error(mensajeError((cuerpo as { detail?: unknown }).detail, r.status));
  }
  return r;
}

export async function simular(req: SimulacionRequest): Promise<Resultado> {
  return (await post("/api/simular", req)).json();
}

export async function descargarInforme(req: SimulacionRequest): Promise<Blob> {
  return (await post("/api/informe", req)).blob();
}
