import "@testing-library/jest-dom";
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
  default: ({ children }: { children: React.ReactNode }) => children
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
