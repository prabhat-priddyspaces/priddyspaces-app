/** @type {import('next').NextConfig} */
const isStaticExport = process.env.NEXT_OUTPUT_MODE === "export";

// Allow callers (e.g. Playwright) to use an isolated build cache so
// NEXT_PUBLIC_* values baked into the bundle don't leak between sessions.
const distDir = process.env.NEXT_DIST_DIR || ".next";

const nextConfig = {
  reactStrictMode: true,
  distDir,
  ...(isStaticExport ? { output: "export" } : {}),
  ...(process.env.NEXT_ASSET_PREFIX ? { assetPrefix: process.env.NEXT_ASSET_PREFIX } : {}),
};

module.exports = nextConfig;
