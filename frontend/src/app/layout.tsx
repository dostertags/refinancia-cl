import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RefinanciaCL — Simulador de refinanciamiento",
  description: "Simulador educativo y open source para optimizar tus deudas de consumo y tarjetas en Chile. No es una oferta de crédito.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <body>
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold text-brand">RefinanciaCL</Link>
            <Link href="/privacidad" className="text-sm text-slate-600 underline">Privacidad</Link>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-4xl px-4 pb-10 text-sm text-slate-600">
          <p className="rounded-md border border-slate-300 bg-slate-100 p-3">
            Esta simulación no constituye una oferta de crédito. Las condiciones finales dependen de la evaluación de cada
            institución. Herramienta educativa, no es asesoría financiera. Proyecto open source (MIT). Sin cookies de
            seguimiento ni analytics.
          </p>
        </footer>
      </body>
    </html>
  );
}
