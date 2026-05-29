import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOutMock = vi.fn(() => Promise.resolve());
const routerReplaceMock = vi.fn();

vi.mock("@/lib/e2e-bypass", () => ({ IS_E2E_BYPASS: false }));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: signOutMock }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
}));
vi.mock("@/hooks/useMe", () => ({ invalidateMeCache: vi.fn() }));
vi.mock("@/lib/auth", () => ({ clearAccessToken: vi.fn() }));

import { useAppSignOut } from "@/hooks/useAppSignOut";

describe("useAppSignOut (Clerk)", () => {
  beforeEach(() => {
    signOutMock.mockReset().mockResolvedValue(undefined);
    routerReplaceMock.mockReset();
  });

  it("lets Clerk redirect to the marketplace by default so logout never hits accounts.dev", async () => {
    const { result } = renderHook(() => useAppSignOut());

    await act(async () => {
      await result.current();
    });

    expect(signOutMock).toHaveBeenCalledWith({ redirectUrl: "/spaces" });
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("honors an explicit redirect target", async () => {
    const { result } = renderHook(() => useAppSignOut());

    await act(async () => {
      await result.current({ redirectTo: "/owner" });
    });

    expect(signOutMock).toHaveBeenCalledWith({ redirectUrl: "/owner" });
  });

  it("stays on the current page when redirectTo is null", async () => {
    const { result } = renderHook(() => useAppSignOut());

    await act(async () => {
      await result.current({ redirectTo: null });
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(typeof signOutMock.mock.calls[0][0]).toBe("function");
  });

  it("falls back to client navigation if Clerk sign-out throws", async () => {
    signOutMock.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useAppSignOut());

    await act(async () => {
      await result.current();
    });

    expect(routerReplaceMock).toHaveBeenCalledWith("/spaces");
  });
});
