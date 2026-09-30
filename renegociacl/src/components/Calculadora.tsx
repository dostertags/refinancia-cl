"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cae, tasaMensualDesdeAnual } from "@/lib/amortizacion";
import { codificarEstado, decodificarEstado, type EstadoCompartido } from "@/lib/compartir";
import { resumenComparacion, type CreditoGuardado } from "@/lib/comparador";
import { formatearMientrasEscribe, formatPct, parseCLP, parseTasa } from "@/lib/format";
import { cargarMercado, type EstadoMercado, type Mercado } from "@/lib/mercado";
import { generarOpciones, MAX_TARJETAS } from "@/lib/opciones";
import type { Credito, Modo } from "@/lib/tipos";
import Ayuda from "./Ayuda";
import { Campo, estiloCampo, estiloEtiqueta, Insignia } from "./Campos";
import Comparador from "./Comparador";
import Faq from "./Faq";
import Resultados from "./Resultados";

interface OfertaForm { nombre: string; tasa: string; gastos: string }
interface TarjetaForm { nombre: string; saldo: string; pago: string; tasa: string; incluir: boolean }
type Unidad = "mes" | "anio";
const MAX_GUARDADOS = 3;
const MAX_OFERTAS = 3;
const TARJETA_VACIA: TarjetaForm = { nombre: "", saldo: "", pago: "", tasa: "", incluir: true };

const boton = "min-h-12 rounded-lg border border-borde-input bg-superficie px-4 text-sm font-medium text-texto hover:bg-superficie-2";
const tasaATexto = (t: number): string => String(+(t * 100).toFixed(4)).replace(".", ",");
const dinero = (n: number | undefined): string => (n ? formatearMientrasEscribe(String(n)) : "");
const tasaOpcional = (txt: string): number | undefined => { const v = parseTasa(txt); return Number.isNaN(v) ? undefined : v; };
/** JSON con las llaves ordenadas: sirve para comparar dos estados sin que importe el orden en que se armaron. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : x));

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
  const [saldo, setSaldo] = useState(dinero(c0?.saldo));
  const [cuota, setCuota] = useState(dinero(c0?.cuota));
  const [tasa, setTasa] = useState(c0?.tasaMensual !== undefined ? tasaATexto(c0.tasaMensual) : "");
  const [mesesFaltan, setMesesFaltan] = useState(c0?.mesesRestantes ? String(c0.mesesRestantes) : "");
  const [unidad, setUnidad] = useState<Unidad>("mes");
  const [modo, setModo] = useState<Modo>(inicial?.modo ?? "intereses");
  const [tarjetas, setTarjetas] = useState<TarjetaForm[]>((c0?.tarjetas ?? []).map((t) => ({
    nombre: t.nombre ?? "", saldo: dinero(t.saldo), pago: dinero(t.pagoMensual), tasa: t.tasaMensual !== undefined ? tasaATexto(t.tasaMensual) : "", incluir: t.incluir !== false })));
  const [ofertas, setOfertas] = useState<OfertaForm[]>((c0?.ofertas ?? []).map((o) => ({ nombre: o.nombre, tasa: tasaATexto(o.tasaMensual), gastos: dinero(o.gastos) })));
  const [abono, setAbono] = useState(dinero(c0?.abonoUnico));
  const [calculado, setCalculado] = useState<Credito | null>(c0 ?? null);
  const [mercado, setMercado] = useState<{ estado: EstadoMercado | "cargando"; mercado: Mercado | null }>({ estado: "cargando", mercado: null });
  const [seguro, setSeguro] = useState(true);
  const [guardados, setGuardados] = useState<CreditoGuardado[]>([]);
  const [copiado, setCopiado] = useState(false);
  const zonaResultados = useRef<HTMLDivElement>(null);

  // Primera carga: el estado inicial ya es "cargando"; solo se actualiza cuando llega la respuesta.
  useEffect(() => { let vivo = true; void cargarMercado().then((m) => { if (vivo) setMercado(m); }); return () => { vivo = false; }; }, []);
  const reintentar = useCallback(async () => {
    setMercado((m) => ({ ...m, estado: "cargando" }));
    setMercado(await cargarMercado());
  }, []);

  const tasaMensual = (): number | undefined => {
    const t = tasaOpcional(tasa);
    return t === undefined || unidad === "mes" ? t : tasaMensualDesdeAnual(t);
  };
  const construir = (): Credito => {
    const ofs = ofertas.filter((o) => parseTasa(o.tasa) > 0).map((o) => ({ nombre: o.nombre.trim(), tasaMensual: parseTasa(o.tasa), gastos: parseCLP(o.gastos) }));
    const tjs = tarjetas.map((t) => ({ nombre: t.nombre.trim() || undefined, saldo: parseCLP(t.saldo) || undefined, pagoMensual: parseCLP(t.pago) || undefined,
      tasaMensual: tasaOpcional(t.tasa), incluir: t.incluir }));
    return {
      saldo: parseCLP(saldo), cuota: parseCLP(cuota), tasaMensual: tasaMensual(), mesesRestantes: parseCLP(mesesFaltan) || undefined,
      tarjetas: tjs.length > 0 ? tjs : undefined, ofertas: ofs.length > 0 ? ofs : undefined, abonoUnico: parseCLP(abono) || undefined,
    };
  };

  const resultado = useMemo(() => (calculado ? generarOpciones(calculado, modo, mercado.mercado, { seguro }) : null), [calculado, modo, mercado.mercado, seguro]);
  const desactualizado = calculado !== null && canon(construir()) !== canon(calculado);
  const comparacion = useMemo(() => resumenComparacion(guardados), [guardados]);

  useEffect(() => { if (calculado) { zonaResultados.current?.focus({ preventScroll: true }); zonaResultados.current?.scrollIntoView?.({ block: "start" }); } }, [calculado]);

  const t = tasaMensual();
  const pistaTasa = t === undefined || t <= 0 ? undefined : unidad === "anio" ? `Equivale a ${formatPct(t)} al mes` : `Equivale a ${formatPct(cae(t), 1)} al año`;

  const copiarEnlace = async () => {
    if (!calculado) return;
    const url = `${window.location.origin}${window.location.pathname}#d=${codificarEstado({ credito: calculado, modo })}`;
    try { await navigator.clipboard.writeText(url); setCopiado(true); } catch { setCopiado(false); }
  };
  const guardar = () => {
    if (!calculado || guardados.length >= MAX_GUARDADOS) return;
    setGuardados([...guardados, { id: `${Date.now()}-${guardados.length}`, nombre: `Crédito ${guardados.length + 1}`, credito: calculado }]);
  };
  const cambiarTarjeta = (i: number, cambio: Partial<TarjetaForm>) => setTarjetas(tarjetas.map((x, k) => (k === i ? { ...x, ...cambio } : x)));

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
      <section aria-labelledby="necesitas" className="no-print rounded-xl border border-borde bg-superficie p-4 text-sm">
        <h2 id="necesitas" className="mb-2 font-semibold">Qué necesitas</h2>
        <p><Insignia id="n1" texto="Obligatorio" /> Cuánto debes y tu cuota mensual.</p>
        <p className="mt-2"><Insignia id="n2" texto="Una de las dos" /> Tu tasa de interés o los meses que te faltan. Si escribes una, calculamos la otra.</p>
        <p className="mt-2"><Insignia id="n3" texto="Opcional" /> Tus tarjetas de crédito (si las agregas, escribe cuánto debes en cada una y su pago mensual o su tasa; las que dejes marcadas se suman a la deuda a refinanciar), las ofertas que te dieron y un abono de una sola vez.</p>
      </section>

      <form onSubmit={(e) => { e.preventDefault(); setCalculado(construir()); setCopiado(false); }} noValidate
        className="no-print space-y-4 rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="¿Cuánto debes hoy?" req="Obligatorio" valor={saldo} onCambio={(v) => setSaldo(formatearMientrasEscribe(v))} placeholder="3.000.000"
            ayuda={<Ayuda etiqueta="¿Qué es lo que debo hoy?">Lo que todavía te falta pagar del crédito, sin contar los intereses futuros. Lo ves en tu app del banco como &quot;saldo insoluto&quot; o &quot;saldo de la deuda&quot;.</Ayuda>} />
          <Campo etiqueta="Tu cuota mensual" req="Obligatorio" valor={cuota} onCambio={(v) => setCuota(formatearMientrasEscribe(v))} placeholder="153.000"
            ayuda={<Ayuda etiqueta="¿Qué es la cuota?">Lo que pagas cada mes por este crédito.</Ayuda>} />
        </div>

        <div className="rounded-lg border border-borde p-3">
          <p className="mb-3 text-sm text-suave">Ahora escribe <b className="text-texto">una de estas dos</b> (con una basta; si pones las dos, usamos la tasa):</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className={estiloEtiqueta}>
                <label htmlFor="tasa">Tasa de interés</label>
                <Insignia id="tasa-req" texto="Una de las dos" />
                <Ayuda etiqueta="¿Qué es la tasa de interés?">Es lo que te cobra el banco cada mes por prestarte plata, como porcentaje de lo que debes. La encuentras en tu contrato o en la app del banco. Ejemplo: 2,1% al mes.</Ayuda>
              </div>
              <input id="tasa" inputMode="decimal" enterKeyHint="next" autoComplete="off" placeholder={unidad === "mes" ? "3,0" : "42,6"} value={tasa}
                onChange={(e) => setTasa(e.target.value)} className={estiloCampo} aria-describedby="tasa-req tasa-pista" />
              <div role="radiogroup" aria-label="La tasa es" className="mt-2 grid grid-cols-2 gap-2 text-sm">
                {([["mes", "por mes"], ["anio", "por año (CAE)"]] as const).map(([v, texto]) => (
                  <label key={v} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 ${unidad === v ? "border-brand bg-brand-fondo font-semibold" : "border-borde-input"}`}>
                    <input type="radio" name="unidad" value={v} checked={unidad === v} onChange={() => setUnidad(v)} className="sr-only" />{texto}
                  </label>
                ))}
              </div>
              <p id="tasa-pista" className="mt-1 text-xs text-suave">{pistaTasa ?? "Escribe solo el número, por ejemplo 3 o 2,5."}</p>
            </div>
            <Campo etiqueta="Meses que te faltan" req="Una de las dos" valor={mesesFaltan} onCambio={(v) => setMesesFaltan(v.replace(/\D/g, "").slice(0, 4))} placeholder="31"
              pista="Cuántas cuotas te quedan por pagar. Si no sabes tu tasa, con esto la calculamos."
              ayuda={<Ayuda etiqueta="¿Dónde veo los meses que me faltan?">En tu app del banco aparece como &quot;cuotas restantes&quot; o &quot;cuotas por pagar&quot;. También sale en la tabla de amortización de tu contrato.</Ayuda>} />
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

        <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-borde p-3 text-sm">
          <input type="checkbox" checked={seguro} onChange={(e) => setSeguro(e.target.checked)} className="mt-0.5 h-5 w-5" />
          <span><b>Comparar con seguro de desgravamen</b> (como en el comparador del SERNAC). Sin seguro la cuota es menor, pero si quien pidió el crédito fallece o queda inválido, la deuda no se cubre.</span>
        </label>

        <fieldset className="space-y-3 rounded-lg border border-borde p-3">
          <legend className="px-1 text-sm font-medium">Tarjetas de crédito (opcional)</legend>
          <p className="text-xs text-suave">Si agregas una tarjeta, escribe cuánto debes en ella y su pago mensual o su tasa (con una de las dos basta).
            Las tarjetas que dejes marcadas se suman a la deuda a refinanciar. Puedes agregar hasta {MAX_TARJETAS}.</p>
          {tarjetas.map((tj, i) => (
            <div key={i} className="space-y-3 rounded-lg bg-superficie-2 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Nombre de la tarjeta" req="Opcional" valor={tj.nombre} modo="decimal" placeholder="Ej. Falabella" onCambio={(v) => cambiarTarjeta(i, { nombre: v.slice(0, 40) })} />
                <Campo etiqueta="Total que debes en esta tarjeta" req="Obligatorio" valor={tj.saldo} placeholder="2.000.000" onCambio={(v) => cambiarTarjeta(i, { saldo: formatearMientrasEscribe(v) })} />
                <Campo etiqueta="Pago mensual de esta tarjeta" req="Una de las dos" valor={tj.pago} placeholder="100.000" onCambio={(v) => cambiarTarjeta(i, { pago: formatearMientrasEscribe(v) })} />
                <Campo etiqueta="Tasa mensual de esta tarjeta (%)" req="Una de las dos" valor={tj.tasa} modo="decimal" placeholder="3,5" onCambio={(v) => cambiarTarjeta(i, { tasa: v })} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={tj.incluir} onChange={(e) => cambiarTarjeta(i, { incluir: e.target.checked })} className="h-5 w-5" />
                  Incluir en el refinanciamiento
                </label>
                <button type="button" onClick={() => setTarjetas(tarjetas.filter((_, k) => k !== i))} className="min-h-11 px-3 text-sm text-suave underline">Quitar tarjeta</button>
              </div>
            </div>
          ))}
          {tarjetas.length < MAX_TARJETAS && <button type="button" onClick={() => setTarjetas([...tarjetas, { ...TARJETA_VACIA }])} className={boton}>+ Agregar tarjeta</button>}
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
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">¿Puedes abonar una parte de una sola vez? (opcional)</summary>
          <div className="mt-3 sm:max-w-xs">
            <Campo etiqueta="Abono de una sola vez" req="Opcional" valor={abono} onCambio={(v) => setAbono(formatearMientrasEscribe(v))} placeholder="500.000"
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
