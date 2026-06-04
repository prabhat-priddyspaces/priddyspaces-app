"use client";

import { type ImgHTMLAttributes, useEffect, useState } from "react";

interface PublicImageWithFallbackProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string | null | undefined;
  fallbackLabel?: string;
  fallbackClassName: string;
}

export function PublicImageWithFallback({
  src,
  alt = "",
  fallbackLabel = "Priddyspaces",
  fallbackClassName,
  onError,
  ...props
}: PublicImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <div className={fallbackClassName}>{fallbackLabel}</div>;
  }

  return (
    // alt is always set (defaults to "" for decorative images) so this never
    // ships an unlabelled image; callers pass a meaningful alt where relevant.
    <img
      {...props}
      src={src}
      alt={alt}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
