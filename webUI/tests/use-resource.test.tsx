import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  tokenState: {
    getApiToken: vi.fn(async (): Promise<string | null> => "tok"),
    isAuthReady: true,
  },
}));

vi.mock("@/lib/api", () => ({ apiFetch: h.apiFetchMock }));
vi.mock("@/hooks/useApiToken", () => ({ useApiToken: () => h.tokenState }));

import { useResource, useResourceList } from "@/hooks/useResource";

describe("useResource", () => {
  beforeEach(() => {
    h.apiFetchMock.mockReset();
    h.tokenState.isAuthReady = true;
    h.tokenState.getApiToken = vi.fn(async () => "tok");
  });

  it("fetches and returns data once auth is ready", async () => {
    h.apiFetchMock.mockResolvedValue([{ id: 1 }]);
    const { result } = renderHook(() => useResource<{ id: number }[]>("/api/x"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(result.current.error).toBeNull();
    expect(h.apiFetchMock).toHaveBeenCalledWith("/api/x", { method: "GET" }, "tok");
  });

  it("does not fetch until auth is ready (stays loading)", () => {
    h.tokenState.isAuthReady = false;
    const { result } = renderHook(() => useResource("/api/x"));

    expect(result.current.loading).toBe(true);
    expect(h.apiFetchMock).not.toHaveBeenCalled();
  });

  it("skips fetching when path is null and settles loading to false", async () => {
    const { result } = renderHook(() => useResource(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(h.apiFetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the unauthenticated message when requireToken and no token", async () => {
    h.tokenState.getApiToken = vi.fn(async () => null);
    h.apiFetchMock.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useResource("/api/x", { requireToken: true, unauthenticatedMessage: "Sign in to review." })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Sign in to review.");
    expect(h.apiFetchMock).not.toHaveBeenCalled();
  });

  it("captures the error message when the request fails", async () => {
    h.apiFetchMock.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useResource("/api/x"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("boom");
    expect(result.current.data).toBeNull();
  });

  it("re-fetches on reload()", async () => {
    h.apiFetchMock.mockResolvedValue(["a"]);
    const { result } = renderHook(() => useResource<string[]>("/api/x"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    h.apiFetchMock.mockResolvedValue(["a", "b"]);
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.data).toEqual(["a", "b"]);
    expect(h.apiFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("useResourceList", () => {
  beforeEach(() => {
    h.apiFetchMock.mockReset();
    h.tokenState.isAuthReady = true;
    h.tokenState.getApiToken = vi.fn(async () => "tok");
  });

  it("defaults items to [] before data resolves", () => {
    h.tokenState.isAuthReady = false;
    const { result } = renderHook(() => useResourceList<number>("/api/x"));
    expect(result.current.items).toEqual([]);
  });

  it("returns the fetched array as items", async () => {
    h.apiFetchMock.mockResolvedValue([1, 2, 3]);
    const { result } = renderHook(() => useResourceList<number>("/api/x"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([1, 2, 3]);
  });
});
