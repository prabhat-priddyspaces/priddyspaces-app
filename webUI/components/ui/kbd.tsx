import * as React from "react";

import { cn } from "@/lib/utils";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {}

const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        "inline-flex h-5 min-w-[18px] px-1.5 rounded-[5px] bg-surface-2 border border-b-2 border-line-strong text-text-2 font-mono text-[11px] items-center justify-center",
        className
      )}
      {...props}
    />
  )
);
Kbd.displayName = "Kbd";

export { Kbd };
