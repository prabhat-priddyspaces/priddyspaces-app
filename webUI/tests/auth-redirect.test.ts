import { describe, it, expect, beforeEach } from "vitest";

import {
  buildLoginHref,
  consumeOauthNext,
  sanitizeNext,
  stashOauthNext,
} from "../lib/auth-redirect";

describe("sanitizeNext", () => {
  it("returns null for falsy input", () => {
    expect(sanitizeNext(null)).toBeNull();
    expect(sanitizeNext(undefined)).toBeNull();
    expect(sanitizeNext("")).toBeNull();
  });

  it("accepts same-origin path", () => {
    expect(sanitizeNext("/spaces/abc")).toBe("/spaces/abc");
    expect(sanitizeNext("/spaces/abc?date=2026-05-10&start_time=09:00")).toBe(
      "/spaces/abc?date=2026-05-10&start_time=09:00",
    );
  });

  it("rejects protocol-relative URLs (open-redirect)", () => {
    expect(sanitizeNext("//evil.com")).toBeNull();
    expect(sanitizeNext("//evil.com/path")).toBeNull();
  });

  it("rejects absolute URLs", () => {
    expect(sanitizeNext("http://evil.com")).toBeNull();
    expect(sanitizeNext("https://evil.com/path")).toBeNull();
  });

  it("rejects javascript: and other schemes", () => {
    expect(sanitizeNext("javascript:alert(1)")).toBeNull();
    expect(sanitizeNext("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects bare paths without leading slash", () => {
    expect(sanitizeNext("spaces/abc")).toBeNull();
  });
});

describe("buildLoginHref", () => {
  it("URL-encodes the next value", () => {
    expect(buildLoginHref("/spaces/abc?date=2026-05-10")).toBe(
      "/login?next=%2Fspaces%2Fabc%3Fdate%3D2026-05-10",
    );
  });
});

describe("stashOauthNext / consumeOauthNext", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("round-trips a same-origin path", () => {
    stashOauthNext("/spaces/abc?date=2026-05-10");
    expect(consumeOauthNext()).toBe("/spaces/abc?date=2026-05-10");
    // Second consume returns null (one-shot).
    expect(consumeOauthNext()).toBeNull();
  });

  it("does not stash unsafe values", () => {
    stashOauthNext("//evil.com");
    expect(consumeOauthNext()).toBeNull();
  });

  it("clears storage when given a null/empty value", () => {
    stashOauthNext("/spaces/abc");
    stashOauthNext(null);
    expect(consumeOauthNext()).toBeNull();
  });
});
