import * as React from "react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export interface FormSectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Footer content, typically submit/cancel buttons. */
  actions?: React.ReactNode;
  /** Form-level error (e.g. a failed save), rendered above the actions. */
  error?: React.ReactNode;
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Card-wrapped form layout with a header, body, optional error line, and an
 * actions footer. Compose with `ui/Field` for individual inputs and the
 * `useForm` hook for state. Presentational only.
 */
export function FormSection({
  title,
  description,
  actions,
  error,
  onSubmit,
  className,
  children,
}: FormSectionProps) {
  return (
    <Card className={className}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {(title || description) && (
          <div className="flex flex-col gap-1">
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {description && <p className="text-xs text-text-3">{description}</p>}
          </div>
        )}
        <div className="flex flex-col gap-3">{children}</div>
        {error && <p className={cn("text-[12px] text-danger")}>{error}</p>}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </form>
    </Card>
  );
}
