/** @type {import('next').NextConfig} */
// "standalone" reduce la imagen Docker; sin telemetría ni analytics (privacidad).
const nextConfig = { output: "standalone", reactStrictMode: true };
export default nextConfig;
