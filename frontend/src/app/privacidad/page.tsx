export const metadata = { title: "Política de privacidad — RefinanciaCL" };

export default function Privacidad() {
  return (
    <article className="prose max-w-none space-y-3">
      <h1 className="text-2xl font-bold">Política de privacidad</h1>
      <p>RefinanciaCL es una herramienta educativa y de código abierto (MIT). Diseñamos todo para <b>no guardar tus datos</b>.</p>
      <ul className="list-disc pl-6">
        <li><b>No almacenamos</b> tu renta, tus deudas ni el resultado de tus simulaciones.</li>
        <li>La simulación se procesa en memoria en el servidor y se descarta al responder. No registramos el contenido de las solicitudes.</li>
        <li>No usamos cookies de seguimiento, Google Analytics ni herramientas similares.</li>
        <li>El PDF se genera al momento y se descarga a tu dispositivo; el código QR solo apunta a esta herramienta y no contiene tus datos.</li>
        <li>Los únicos datos guardados son públicos: ofertas del mercado, UF/UTM y tasas de referencia.</li>
        <li>Puedes auditar el código y ejecutar tu propia copia local.</li>
      </ul>
      <p className="text-sm text-slate-500">
        {/* TODO: verificar con abogado — Ley 19.628 (protección de la vida privada) y su reforma (Ley 21.719). */}
        Revisión legal pendiente respecto de la Ley 19.628 y la Ley 21.719 sobre datos personales.
      </p>
    </article>
  );
}
