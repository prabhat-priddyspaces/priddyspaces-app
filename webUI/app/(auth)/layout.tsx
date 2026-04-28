import Link from "next/link";

import { BackToSearchLink } from "./_components/back-to-search-link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-4">
          <Link href="/coworking" className="group inline-flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
              Priddyspaces
            </span>
            <span className="text-sm text-textSecondary group-hover:text-textPrimary">
              Coworking marketplace
            </span>
          </Link>
          <BackToSearchLink />
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
