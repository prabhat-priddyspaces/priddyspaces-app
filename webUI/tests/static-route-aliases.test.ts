import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildS3Uri,
  collectStaticRouteAliases,
  uploadStaticRouteAliases,
} = require("../scripts/static-route-aliases.js") as {
  buildS3Uri: (bucketUri: string, key: string) => string;
  collectStaticRouteAliases: (outDir: string) => Array<{
    sourceFile: string;
    sourceKey: string;
    aliasKey: string;
  }>;
  uploadStaticRouteAliases: (
    outDir: string,
    bucketUri: string,
    options?: { spawnSync?: (...args: unknown[]) => { status: number | null }; dryRun?: boolean },
  ) => Array<{ sourceFile: string; sourceKey: string; aliasKey: string }>;
};

let tempDir: string | null = null;

function makeOutDir() {
  tempDir = mkdtempSync(path.join(tmpdir(), "priddy-static-routes-"));
  mkdirSync(path.join(tempDir, "owner", "locations"), { recursive: true });
  mkdirSync(path.join(tempDir, "owner", "spaces"), { recursive: true });
  mkdirSync(path.join(tempDir, "member", "requests"), { recursive: true });
  writeFileSync(path.join(tempDir, "index.html"), "<html>root</html>");
  writeFileSync(path.join(tempDir, "404.html"), "<html>missing</html>");
  writeFileSync(path.join(tempDir, "owner.html"), "<html>owner</html>");
  writeFileSync(path.join(tempDir, "owner", "locations", "new.html"), "<html>new</html>");
  writeFileSync(path.join(tempDir, "owner", "spaces", "edit.html"), "<html>edit</html>");
  writeFileSync(path.join(tempDir, "owner", "spaces", "media.html"), "<html>media</html>");
  writeFileSync(path.join(tempDir, "member", "requests", "index.html"), "<html>requests</html>");
  writeFileSync(path.join(tempDir, "member", "requests", "_.html"), "<html>request detail</html>");
  return tempDir;
}

describe("static route aliases", () => {
  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  it("collects extensionless aliases for exported route HTML files", () => {
    const outDir = makeOutDir();

    expect(collectStaticRouteAliases(outDir).map((alias) => alias.aliasKey)).toEqual([
      "member/requests/_",
      "member/requests",
      "owner",
      "owner/locations/new",
      "owner/spaces/edit",
      "owner/spaces/media",
    ]);
  });

  it("uploads aliases with explicit HTML metadata", () => {
    const outDir = makeOutDir();
    const spawnSync = vi.fn(() => ({ status: 0 }));

    uploadStaticRouteAliases(outDir, "s3://bucket/web", { spawnSync });

    expect(buildS3Uri("s3://bucket/web/", "owner/locations/new")).toBe(
      "s3://bucket/web/owner/locations/new",
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "aws",
      expect.arrayContaining([
        "s3",
        "cp",
        path.join(outDir, "owner", "locations", "new.html"),
        "s3://bucket/web/owner/locations/new",
        "--content-type",
        "text/html; charset=utf-8",
      ]),
      { stdio: "inherit" },
    );
  });
});
