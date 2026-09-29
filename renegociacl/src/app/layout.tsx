import type { Metadata, Viewport } from "next";
import Tema from "@/components/Tema";
import "./globals.css";

export const metadata: Metadata = {
  title: "RenegociaCL — ¿Cuánto puedes ahorrar en tu crédito?",
  description: "Calculadora gratis para renegociar tu crédito en Chile: mira cuántos pesos y meses ahorras. Sin registro; tus datos no salen de tu celular.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "light dark" };

// Aplica el tema guardado (o el del sistema) ANTES de pintar, para que no parpadee. Solo lee una preferencia local.
const SCRIPT_TEMA = "try{var t=localStorage.getItem('tema');var d=t?t==='oscuro':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} /></head>
      <body>
        <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-superficie focus:p-3">Saltar al contenido</a>
        <main id="contenido" className="mx-auto max-w-3xl px-4 pb-6 pt-4 sm:py-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-lg font-extrabold text-brand">RenegociaCL</p>
            <Tema />
          </div>
          {children}
        </main>
        <footer className="mx-auto max-w-3xl space-y-2 px-4 pb-10 text-sm text-suave">
          <p className="rounded-lg border border-borde bg-superficie-2 p-3 text-texto">
            Esta calculadora es una simulación educativa: no es una oferta de crédito ni asesoría financiera. Las condiciones finales las define cada
            institución. Todo se calcula en tu dispositivo: no guardamos ni enviamos lo que ingresas, no hay registro ni cookies de seguimiento.
          </p>
        </footer>
      </body>
    </html>
  );
}
