import { describe, expect, it } from "vitest";

import { dynamic, GET, revalidate } from "../app/api/health/route";

describe("frontend health route", () => {
  it("is uncached so deploy smoke checks hit the live frontend origin", async () => {
    const response = GET();

    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
  });
});
