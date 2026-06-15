import * as React from "react";

import { cn } from "@/lib/utils";

const PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ["#F3E4D4", "#B8753A", "#3E2517"], // copper
  ["#DDEADF", "#2F5D50", "#10231F"], // sage
  ["#EFE7DC", "#8D7865", "#2D241C"], // taupe
  ["#EEF4F8", "#356899", "#102A43"], // denim
  ["#FDEDEA", "#B42318", "#4A120D"], // brick
];

function initials(name: string | undefined) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function paletteFor(name: string | undefined): readonly [string, string, string] {
  const seed = name?.charCodeAt(0) ?? 0;
  return PALETTES[seed % PALETTES.length];
}

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  size?: number;
  src?: string;
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ name, size = 28, src, className, style, ...props }, ref) => {
    const [c1, c2, fg] = paletteFor(name);
    if (src) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name ?? ""}
          width={size}
          height={size}
          className={cn("rounded-full object-cover flex-none", className)}
          style={{ width: size, height: size, ...style }}
        />
      );
    }
    return (
      <div
        ref={ref}
        className={cn("rounded-full grid place-items-center font-bold flex-none select-none", className)}
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${c1}, ${c2})`,
          color: fg,
          fontSize: Math.max(10, Math.round(size * 0.36)),
          ...style,
        }}
        {...props}
      >
        {initials(name)}
      </div>
    );
  }
);
Avatar.displayName = "Avatar";

export { Avatar };
