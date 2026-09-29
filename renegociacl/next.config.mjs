/** @type {import('next').NextConfig} */
// Exportación estática: Firebase Hosting sirve la carpeta `out/` (sin servidor, sin backend).
const nextConfig = { output: "export", images: { unoptimized: true }, reactStrictMode: true, trailingSlash: false };
export default nextConfig;
