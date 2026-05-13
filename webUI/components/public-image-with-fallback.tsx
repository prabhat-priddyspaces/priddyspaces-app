"use client";

import { type ImgHTMLAttributes, useEffect, useState } from "react";

interface PublicImageWithFallbackProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string | null | undefined;
  fallbackLabel?: string;
  fallbackClassName: string;
}

export function PublicImageWithFallback({
  src,
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
    <img
      {...props}
      src={src}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
