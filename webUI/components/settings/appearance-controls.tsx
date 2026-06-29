"use client";

import * as React from "react";
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { type ThemeFamily, type ThemeMode } from "@/lib/preferences";
import { cn } from "@/lib/utils";

interface FamilyOption {
  id: ThemeFamily;
  label: string;
  description: string;
  // Representative colors used to render the live preview swatch.
  preview: { bg: string; surface: string; line: string; brand: string; text: string; muted: string };
}

const FAMILY_OPTIONS: FamilyOption[] = [
  {
    id: "neutral",
    label: "Neutral",
    description: "Cool slate and indigo. Crisp, modern, the default.",
    preview: { bg: "#F7F8FA", surface: "#FFFFFF", line: "#E6E9EF", brand: "#4F46E5", text: "#0F172A", muted: "#64748B" },
  },
  {
    id: "warm",
    label: "Warm",
    description: "Sage green on warm paper. Calm and inviting.",
    preview: { bg: "#F4EFE5", surface: "#FFFFFF", line: "#E5DCCD", brand: "#2C5247", text: "#1A1E1B", muted: "#807A6D" },
  },
  {
    id: "premium",
    label: "Premium",
    description: "Deep emerald on near-black. High-end and focused.",
    preview: { bg: "#0C0F0E", surface: "#181E1B", line: "#283230", brand: "#6EE7B7", text: "#ECEAE3", muted: "#6C736B" },
  },
];

interface ModeOption {
  id: ThemeMode;
  label: string;
  icon: LucideIcon;
}

const MODE_OPTIONS: ModeOption[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

function FamilyPreview({ preview }: { preview: FamilyOption["preview"] }) {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-lg border"
      style={{ background: preview.bg, borderColor: preview.line }}
    >
      <div className="flex h-20">
        <div
          className="flex w-1/3 flex-col gap-1.5 p-2"
          style={{ background: preview.surface, borderRight: `1px solid ${preview.line}` }}
        >
          <span className="h-1.5 w-3/4 rounded-full" style={{ background: preview.brand }} />
          <span className="h-1.5 w-full rounded-full" style={{ background: preview.line }} />
          <span className="h-1.5 w-2/3 rounded-full" style={{ background: preview.line }} />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-2">
          <span className="h-1.5 w-1/2 rounded-full" style={{ background: preview.text }} />
          <span className="h-1.5 w-full rounded-full" style={{ background: preview.muted }} />
          <span className="mt-auto h-4 w-12 rounded-md" style={{ background: preview.brand }} />
        </div>
      </div>
    </div>
  );
}

// Reflect the active selection only after mount, so the server render and the
// first client render agree (the real choice lives in localStorage).
function useMounted(): boolean {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

export function ThemeFamilyPicker() {
  const { family, setFamily } = useTheme();
  const mounted = useMounted();
  const activeFamily = mounted ? family : null;

  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
      {FAMILY_OPTIONS.map((option) => {
        const active = activeFamily === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`theme-family-${option.id}`}
            onClick={() => setFamily(option.id)}
            className={cn(
              "group flex flex-col gap-2.5 rounded-xl border p-2.5 text-left transition-colors",
              active ? "border-brand ring-2 ring-brand/30" : "border-line hover:border-line-strong"
            )}
          >
            <FamilyPreview preview={option.preview} />
            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="text-[13px] font-semibold text-text">{option.label}</span>
              {active ? (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand text-brand-fg">
                  <Check size={11} strokeWidth={2.4} />
                </span>
              ) : null}
            </div>
            <p className="px-0.5 text-[11px] leading-relaxed text-text-3">{option.description}</p>
          </button>
        );
      })}
    </div>
  );
}

export function ThemeModePicker() {
  const { mode, setMode } = useTheme();
  const mounted = useMounted();
  const activeMode = mounted ? mode : null;

  return (
    <div role="radiogroup" aria-label="Appearance mode" className="flex flex-wrap gap-2">
      {MODE_OPTIONS.map((option) => {
        const active = activeMode === option.id;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`theme-mode-${option.id}`}
            onClick={() => setMode(option.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-colors",
              active
                ? "border-brand bg-brand-soft text-brand-strong"
                : "border-line-strong text-text-2 hover:border-text-3"
            )}
          >
            <Icon size={15} strokeWidth={1.7} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
