/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone', // for the Docker image (./apps/web/.next/standalone)
  // The Arena preview proxies the app on https://{port}-{sandboxId}.e2b.app.
  // Allow that origin so HMR / _next/* requests don't get blocked (warn-mode today, block-mode later).
  allowedDevOrigins: ['*.e2b.app', 'localhost', '127.0.0.1'],
};

export default nextConfig;
