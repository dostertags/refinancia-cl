"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cae, tasaMensualDesdeAnual } from "@/lib/amortizacion";
import { codificarEstado, decodificarEstado, type EstadoCompartido } from "@/lib/compartir";
import { resumenComparacion, type CreditoGuardado } from "@/lib/comparador";
import { formatearMientrasEscribe, formatPct, parseCLP, parseTasa } from "@/lib/format";
import { cargarMercado, MERCADO_VACIO, type EstadoMercado, type Mercado } from "@/lib/mercado";
import { generarOpciones } from "@/lib/opciones";
import type { Credito, Modo } from "@/lib/tipos";
import Ayuda from "./Ayuda";
import { Campo, estiloCampo, estiloEtiqueta } from "./Campos";
import Comparador from "./Comparador";
import Faq from "./Faq";
import Resultados from "./Resultados";

interface OfertaForm { nombre: string; tasa: string; gastos: string }
type Unidad = "mes" | "anio";
const MAX_GUARDADOS = 3;
const MAX_OFERTAS = 3;

const boton = "min-h-12 rounded-lg border border-borde-input bg-superficie px-4 text-sm font-medium text-texto hover:bg-superficie-2";
const tasaATexto = (t: number): string => String(+(t * 100).toFixed(4)).replace(".", ",");

// El fragmento de la URL (#d=...) se lee con useSyncExternalStore: en el servidor es "" y en el navegador el valor real.
const suscribirHash = (cb: () => void): (() => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };
const leerHash = (): string => window.location.hash;
const hashServidor = (): string => "";

/** Envoltorio: valida el enlace compartido y reinicia el formulario (por `key`) si llega uno. */
export default function Calculadora() {
  const hash = useSyncExternalStore(suscribirHash, leerHash, hashServidor);
  const inicial = hash.startsWith("#d=") ? decodificarEstado(hash.slice(3)) : null;
  return <FormularioCalculadora key={inicial ? hash : "vacio"} inicial={inicial} />;
}

function FormularioCalculadora({ inicial }: { inicial: EstadoCompartido | null }) {
  const c0 = inicial?.credito;
  const [saldo, setSaldo] = useState(c0 ? formatearMientrasEscribe(String(c0.saldo)) : "");
  const [cuota, setCuota] = useState(c0 ? formatearMientrasEscribe(String(c0.cuota)) : "");
  const [tasa, setTasa] = useState(c0 ? tasaATexto(c0.tasaMensual) : "");
  const [unidad, setUnidad] = useState<Unidad>("mes");
  const [modo, setModo] = useState<Modo>(inicial?.modo ?? "intereses");
  const [tarjetaSaldo, setTarjetaSaldo] = useState(c0?.tarjeta?.saldo ? formatearMientrasEscribe(String(c0.tarjeta.saldo)) : "");
  const [tarjetaTasa, setTarjetaTasa] = useState(c0?.tarjeta ? tasaATexto(c0.tarjeta.tasaMensual) : "");
  const [ofertas, setOfertas] = useState<OfertaForm[]>((c0?.ofertas ?? []).map((o) => ({ nombre: o.nombre, tasa: tasaATexto(o.tasaMensual), gastos: o.gastos ? formatearMientrasEscribe(String(o.gastos)) : "" })));
  const [abono, setAbono] = useState(c0?.abonoUnico ? formatearMientrasEscribe(String(c0.abonoUnico)) : "");
  const [calculado, setCalculado] = useState<Credito | null>(c0 ?? null);
  const [mercado, setMercado] = useState<{ estado: EstadoMercado | "cargando"; mercado: Mercado }>({ estado: "cargando", mercado: MERCADO_VACIO });
  const [guardados, setGuardados] = useState<CreditoGuardado[]>([]);
  const [copiado, setCopiado] = useState(false);
  const zonaResultados = useRef<HTMLDivElement>(null);

  // Primera carga: el estado inicial ya es "cargando"; solo se actualiza cuando llega la respuesta.
  useEffect(() => { let vivo = true; void cargarMercado().then((m) => { if (vivo) setMercado(m); }); return () => { vivo = false; }; }, []);
  const reintentar = useCallback(async () => {
    setMercado((m) => ({ ...m, estado: "cargando" }));
    setMercado(await cargarMercado());
  }, []);

  const tasaMensual = (): number => { const t = parseTasa(tasa); return unidad === "mes" || Number.isNaN(t) ? t : tasaMensualDesdeAnual(t); };
  const construir = (): Credito => {
    const tTarjeta = parseTasa(tarjetaTasa);
    return {
      saldo: parseCLP(saldo), cuota: parseCLP(cuota), tasaMensual: tasaMensual(),
      tarjeta: tTarjeta > 0 ? { saldo: parseCLP(tarjetaSaldo) || undefined, tasaMensual: tTarjeta } : undefined,
      ofertas: ofertas.filter((o) => parseTasa(o.tasa) > 0).map((o) => ({ nombre: o.nombre.trim(), tasaMensual: parseTasa(o.tasa), gastos: parseCLP(o.gastos) })),
      abonoUnico: parseCLP(abono) || undefined,
    };
  };

  const resultado = useMemo(() => (calculado ? generarOpciones(calculado, modo) : null), [calculado, modo]);
  const desactualizado = calculado !== null && JSON.stringify(construir()) !== JSON.stringify(calculado);
  const comparacion = useMemo(() => resumenComparacion(guardados), [guardados]);

  useEffect(() => { if (calculado) { zonaResultados.current?.focus({ preventScroll: true }); zonaResultados.current?.scrollIntoView?.({ block: "start" }); } }, [calculado]);

  const t = tasaMensual();
  const pistaTasa = Number.isNaN(t) || t <= 0 ? undefined : unidad === "anio" ? `Equivale a ${formatPct(t)} al mes` : `Equivale a ${formatPct(cae(t), 1)} al año`;

  const copiarEnlace = async () => {
    if (!calculado) return;
    const url = `${window.location.origin}${window.location.pathname}#d=${codificarEstado({ credito: calculado, modo })}`;
    try { await navigator.clipboard.writeText(url); setCopiado(true); } catch { setCopiado(false); }
  };
  const guardar = () => {
    if (!calculado || guardados.length >= MAX_GUARDADOS) return;
    setGuardados([...guardados, { id: `${Date.now()}-${guardados.length}`, nombre: `Crédito ${guardados.length + 1}`, credito: calculado }]);
  };

  const acciones = (
    <div className="no-print space-y-2 rounded-xl border border-borde bg-superficie p-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => window.print()} className={boton}>Guardar como PDF o imprimir</button>
        <button type="button" onClick={copiarEnlace} className={boton}>Copiar enlace</button>
        <button type="button" onClick={guardar} disabled={guardados.length >= MAX_GUARDADOS} className={`${boton} disabled:opacity-50`}>Guardar para comparar</button>
      </div>
      {copiado && <p className="text-sm text-ok">Enlace copiado.</p>}
      <p className="text-xs text-suave">El enlace lleva tus datos dentro (no pasan por ningún servidor), así que quien reciba el enlace verá estos datos.</p>
      {guardados.length > 0 && guardados.length < MAX_GUARDADOS && <p className="text-xs text-suave">Guardado. Cambia los datos y calcula otro crédito para compararlos (hasta {MAX_GUARDADOS}).</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); setCalculado(construir()); setCopiado(false); }} noValidate
        className="no-print space-y-4 rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="¿Cuánto debes hoy?" valor={saldo} onCambio={(v) => setSaldo(formatearMientrasEscribe(v))} placeholder="3.000.000"
            ayuda={<Ayuda etiqueta="¿Qué es lo que debo hoy?">Lo que todavía te falta pagar del crédito, sin contar los intereses futuros. Lo ves en tu app del banco como &quot;saldo insoluto&quot; o &quot;saldo de la deuda&quot;.</Ayuda>} />
          <Campo etiqueta="Tu cuota mensual" valor={cuota} onCambio={(v) => setCuota(formatearMientrasEscribe(v))} placeholder="153.000"
            ayuda={<Ayuda etiqueta="¿Qué es la cuota?">Lo que pagas cada mes por este crédito.</Ayuda>} />
          <div>
            <div className={estiloEtiqueta}>
              <label htmlFor="tasa">Tasa de interés</label>
              <Ayuda etiqueta="¿Qué es la tasa de interés?">Es lo que te cobra el banco cada mes por prestarte plata, como porcentaje de lo que debes. La encuentras en tu contrato o en la app del banco. Ejemplo: 2,1% al mes.</Ayuda>
            </div>
            <input id="tasa" inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder={unidad === "mes" ? "3,0" : "42,6"} value={tasa}
              onChange={(e) => setTasa(e.target.value)} className={estiloCampo} aria-describedby="tasa-pista" />
            <div role="radiogroup" aria-label="La tasa es" className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {([["mes", "por mes"], ["anio", "por año (CAE)"]] as const).map(([v, texto]) => (
                <label key={v} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 ${unidad === v ? "border-brand bg-brand-fondo font-semibold" : "border-borde-input"}`}>
                  <input type="radio" name="unidad" value={v} checked={unidad === v} onChange={() => setUnidad(v)} className="sr-only" />{texto}
                </label>
              ))}
            </div>
            <p id="tasa-pista" className="mt-1 text-xs text-suave">{pistaTasa ?? "Escribe solo el número, por ejemplo 3 o 2,5."}</p>
          </div>
        </div>

        <fieldset>
          <legend className={estiloEtiqueta}>¿Qué te importa más?</legend>
          <div className="grid grid-cols-2 gap-2">
            {([["intereses", "Pagar menos intereses"], ["cuota", "Bajar mi cuota"]] as const).map(([v, texto]) => (
              <label key={v} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-lg border px-3 text-center text-sm font-medium ${modo === v ? "border-brand bg-brand text-sobre-brand" : "border-borde-input bg-superficie"}`}>
                <input type="radio" name="modo" value={v} checked={modo === v} onChange={() => setModo(v)} className="sr-only" />{texto}
              </label>
            ))}
          </div>
        </fieldset>

        <details className="rounded-lg border border-borde p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">¿Te ofrecieron una tasa mejor? (opcional)</summary>
          <div className="mt-3 space-y-3">
            {ofertas.map((o, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_9rem_auto]">
                <Campo etiqueta="Banco" valor={o.nombre} modo="decimal" placeholder="Ej. Banco Amigo" onCambio={(v) => setOfertas(ofertas.map((x, k) => (k === i ? { ...x, nombre: v } : x)))} />
                <Campo etiqueta="Tasa mensual (%)" valor={o.tasa} modo="decimal" placeholder="1,2" onCambio={(v) => setOfertas(ofertas.map((x, k) => (k === i ? { ...x, tasa: v } : x)))} />
                <Campo etiqueta="Gastos de la operación" valor={o.gastos} placeholder="0" onCambio={(v) => setOfertas(ofertas.map((x, k) => (k === i ? { ...x, gastos: formatearMientrasEscribe(v) } : x)))}
                  ayuda={<Ayuda etiqueta="¿Qué son los gastos de la operación?">Lo que te cobran por hacer el cambio: comisión, notaría, impuestos. Se restan de lo que ahorras.</Ayuda>} />
                <button type="button" onClick={() => setOfertas(ofertas.filter((_, k) => k !== i))} className="min-h-11 self-end px-3 text-sm text-suave underline">Quitar</button>
              </div>
            ))}
            {ofertas.length < MAX_OFERTAS && <button type="button" onClick={() => setOfertas([...ofertas, { nombre: "", tasa: "", gastos: "" }])} className={boton}>+ Agregar oferta</button>}
          </div>
        </details>

        <details className="rounded-lg border border-borde p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">¿Tienes tarjeta de crédito? Compárala (opcional)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Saldo de la tarjeta" valor={tarjetaSaldo} onCambio={(v) => setTarjetaSaldo(formatearMientrasEscribe(v))} placeholder="2.000.000" />
            <Campo etiqueta="Tasa mensual de la tarjeta (%)" valor={tarjetaTasa} modo="decimal" onCambio={setTarjetaTasa} placeholder="3,5" />
          </div>
        </details>

        <details className="rounded-lg border border-borde p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">¿Puedes abonar una parte de una sola vez? (opcional)</summary>
          <div className="mt-3 sm:max-w-xs">
            <Campo etiqueta="Abono de una sola vez" valor={abono} onCambio={(v) => setAbono(formatearMientrasEscribe(v))} placeholder="500.000"
              pista="Te mostramos cuánto ahorrarías y cuánto antes terminarías." />
          </div>
        </details>

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-borde bg-fondo px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <button type="submit" className="min-h-14 w-full rounded-xl bg-brand px-4 text-lg font-bold text-sobre-brand">Calcular</button>
        </div>
      </form>

      <div ref={zonaResultados} tabIndex={-1} aria-live="polite" className="space-y-4 outline-none">
        {resultado && !resultado.ok && <div role="alert" className="rounded-xl border border-borde bg-error-fondo p-4 text-error-texto">{resultado.error}</div>}
        {resultado?.ok && (
          <>
            {desactualizado && (
              <p role="status" className="no-print rounded-xl border border-borde bg-aviso-fondo p-3 text-sm text-aviso-texto">
                Cambiaste los datos. Presiona Calcular para actualizar los resultados.
              </p>
            )}
            <Resultados r={resultado} modo={modo} estadoMercado={mercado.estado} mercado={mercado.mercado} onReintentar={reintentar} acciones={acciones} />
          </>
        )}
      </div>

      <Comparador filas={comparacion} onQuitar={(id) => setGuardados(guardados.filter((g) => g.id !== id))}
        onNombre={(id, nombre) => setGuardados(guardados.map((g) => (g.id === id ? { ...g, nombre } : g)))} />
      <Faq />
    </div>
  );
}
