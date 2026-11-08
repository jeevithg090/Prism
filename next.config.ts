import type { NextConfig } from "next";

// When BACKEND_URL is set (e.g. the Render service), this deployment serves the UI and proxies every
// /api/* call to that single long-running backend, so in-memory demo state stays consistent.
const backend = process.env.BACKEND_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Fixtures and seed data are read with fs at runtime; ship them with every server function.
  outputFileTracingIncludes: { "/**": ["./data/**/*"] },
  async rewrites() {
    return backend ? { beforeFiles: [{ source: "/api/:path*", destination: `${backend}/api/:path*` }] } : [];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
