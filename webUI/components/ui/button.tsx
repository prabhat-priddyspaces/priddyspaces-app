import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:shadow-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-surface text-text border border-line-strong hover:border-text-3",
        primary:
          "bg-brand text-white border border-brand hover:bg-brand-hover hover:border-brand-hover",
        ghost:
          "bg-transparent text-text border border-transparent hover:bg-surface-2",
        "outline-danger":
          "bg-surface text-danger border border-danger/30 hover:border-danger/60",
        // Backward-compat aliases for legacy pages — removed in Phase 7e.
        secondary:
          "bg-surface text-text border border-line-strong hover:border-text-3",
        destructive:
          "bg-surface text-danger border border-danger/30 hover:border-danger/60",
      },
      size: {
        default: "h-9 px-3.5 text-[13px] rounded-xl",
        sm: "h-[30px] px-2.5 text-[12px] rounded-lg",
        lg: "h-11 px-4.5 text-[15px] rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
