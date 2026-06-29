"use client";

import * as React from "react";

import { Card } from "@/components/ui/card";

export interface SettingsSectionProps {
  title: React.ReactNode;
  /** Plain-language explanation of what the section controls and why it matters. */
  description?: React.ReactNode;
  /** Optional header-aligned control (e.g. a "Resubmit" button). */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Consistent settings card: a titled header with a one-line description and an
 * optional header action, followed by the section body. Keeps every settings
 * sub-page looking the same and gives each section room for helper text.
 */
export function SettingsSection({ title, description, action, children }: SettingsSectionProps) {
  return (
    <Card className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-text-3">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}
