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
