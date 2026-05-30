import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const nextConfig = require("../next.config.js");

describe("security headers", () => {
  it("allows same-origin browser camera and geolocation while keeping microphone disabled", async () => {
    const routes = await nextConfig.headers();
    const globalRoute = routes.find((route: { source: string }) => route.source === "/(.*)");
    const permissionsPolicy = globalRoute?.headers.find(
      (header: { key: string }) => header.key === "Permissions-Policy",
    );

    expect(permissionsPolicy?.value).toBe("camera=(self), microphone=(), geolocation=(self)");
    expect(permissionsPolicy?.value).not.toContain("geolocation=()");
    expect(permissionsPolicy?.value).not.toContain("microphone=(self)");
  });
});
