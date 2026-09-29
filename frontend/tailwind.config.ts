import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { brand: { DEFAULT: "#1e3a8a", light: "#dbeafe" } } } },
  plugins: [],
};
export default config;
