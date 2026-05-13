import * as React from "react";

import { cn } from "@/lib/utils";

export interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
}

export function Logo({ size = 28, className, style, ...props }: LogoProps) {
  return (
    <div
      className={cn("rounded-lg grid place-items-center flex-none", className)}
      style={{
        width: size,
        height: size,
        background:
          "linear-gradient(135deg, var(--ps-violet-400) 0%, var(--ps-violet-600) 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,.25), 0 1px 3px rgba(64,40,170,.25)",
        ...style,
      }}
      aria-hidden
      {...props}
    >
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M5 3v18M5 3h7a5 5 0 0 1 0 10H5M14.5 13l5 8"
          stroke="#fff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
