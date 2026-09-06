/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PGlite carga un binario WASM: debe quedar fuera del bundling del servidor.
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default nextConfig;
