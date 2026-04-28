"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const FALLBACK_PATH = "/coworking";

export function BackToSearchLink() {
  const router = useRouter();
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    setHasHistory(window.history.length > 1);
  }, []);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (hasHistory) {
      router.back();
    } else {
      router.push(FALLBACK_PATH);
    }
  }

  return (
    <a
      href={FALLBACK_PATH}
      onClick={handleClick}
      className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm font-medium text-textPrimary transition hover:border-accent hover:text-accent"
    >
      <span aria-hidden="true">&larr;</span>
      Back to search
    </a>
  );
}
