import "@testing-library/jest-dom";
import React from "react";
import { vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin",
  useParams: () => ({})
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string | { pathname?: string };
  }) =>
    React.createElement(
      "a",
      { href: typeof href === "string" ? href : href.pathname ?? "", ...props },
      children
    )
}));

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: unknown }) => children,
  SignIn: () => null,
  SignUp: () => null,
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: false,
    getToken: vi.fn(() => Promise.resolve(null)),
  }),
  useClerk: () => ({
    signOut: vi.fn((callback?: () => void) => {
      callback?.();
      return Promise.resolve();
    }),
  }),
}));
