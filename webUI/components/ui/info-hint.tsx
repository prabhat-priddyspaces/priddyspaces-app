import * as React from "react";
import { HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export interface InfoHintProps {
  /** Help text surfaced on hover (native tooltip) and to screen readers. */
  label: string;
  className?: string;
}

/**
 * Small inline help affordance: a question-mark icon that reveals an
 * explanation on hover and is announced to assistive tech via `aria-label`.
 * Use next to labels/legends where a `Field` `hint` line doesn't fit. Styling
 * matches `Field`'s hint text so it reads as one help system.
 */
export function InfoHint({ label, className }: InfoHintProps) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex cursor-help align-middle text-text-3 hover:text-text-2 transition-colors",
        className
      )}
    >
      <HelpCircle size={14} strokeWidth={1.8} />
    </span>
  );
}
