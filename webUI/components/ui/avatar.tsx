import * as React from "react";

import { cn } from "@/lib/utils";

const PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ["#FFD074", "#FF9E5E", "#5a2a00"], // amber
  ["#B59FFF", "#7C5BF5", "#28195D"], // violet
  ["#7FDDB8", "#2EB888", "#0a3a2a"], // mint
  ["#FFC4D9", "#FF7AA2", "#5a1030"], // rose
  ["#A8C7FF", "#5E8EFF", "#0c2c60"], // blue
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
