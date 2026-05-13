import * as React from "react";

import { cn } from "@/lib/utils";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn("text-[12px] font-medium text-text-2", className)}
        {...props}
      />
    );
  }
);
Label.displayName = "Label";

export { Label };
