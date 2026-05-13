import * as React from "react";

import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  // Padding is opt-in per the new design system. Defaulted to true here only
  // to keep ~60 legacy pages readable until they're migrated; flip to false
  // (or omit) when building new components. Cleaned up in Phase 7e.
  padded?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, padded = true, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-surface border border-line rounded-2xl shadow-xs dark:shadow-none",
        padded && "p-6",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

export { Card };
