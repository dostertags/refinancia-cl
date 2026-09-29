import type { Config } from "tailwindcss";

// Los colores vienen de variables CSS (globals.css): un solo lugar para claro/oscuro y para verificar el contraste.
const v = (n: string) => `var(--${n})`;
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fondo: v("fondo"), superficie: v("superficie"), "superficie-2": v("superficie-2"), texto: v("texto"), suave: v("suave"),
        borde: v("borde"), "borde-input": v("borde-input"), brand: v("brand"), "sobre-brand": v("sobre-brand"),
        "brand-fondo": v("brand-fondo"), ok: v("ok"), mal: v("mal"), "aviso-fondo": v("aviso-fondo"), "aviso-texto": v("aviso-texto"),
        "error-fondo": v("error-fondo"), "error-texto": v("error-texto"),
      },
    },
  },
  plugins: [],
};
export default config;
