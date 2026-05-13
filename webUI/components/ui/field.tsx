import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}

const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, label, htmlFor, hint, error, children, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5", className)} {...props}>
      {label && (
        <Label htmlFor={htmlFor} className="mb-0">
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-[11px] text-danger mt-1">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-text-3 mt-1">{hint}</p>
      ) : null}
    </div>
  )
);
Field.displayName = "Field";

export { Field };
