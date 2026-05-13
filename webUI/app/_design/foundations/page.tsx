"use client";

import { useState } from "react";
import {
  Bell,
  Calendar,
  Check,
  Clock,
  DollarSign,
  Inbox,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Moon,
  TrendingUp,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";

const swatches: Array<{ name: string; bg: string; fg?: string }> = [
  { name: "bg", bg: "bg-bg" },
  { name: "bg-elev", bg: "bg-bg-elev" },
  { name: "bg-sunken", bg: "bg-bg-sunken" },
  { name: "surface", bg: "bg-surface" },
  { name: "surface-2", bg: "bg-surface-2" },
  { name: "surface-3", bg: "bg-surface-3" },
  { name: "brand", bg: "bg-brand", fg: "text-white" },
  { name: "brand-soft", bg: "bg-brand-soft" },
  { name: "violet-500", bg: "bg-violet-500", fg: "text-white" },
  { name: "mint-500", bg: "bg-mint-500", fg: "text-white" },
  { name: "success-soft", bg: "bg-success-soft" },
  { name: "warning-soft", bg: "bg-warning-soft" },
  { name: "danger-soft", bg: "bg-danger-soft" },
  { name: "info-soft", bg: "bg-info-soft" },
];

const radii: Array<{ name: string; cls: string; px: string }> = [
  { name: "xs", cls: "rounded-xs", px: "6" },
  { name: "sm", cls: "rounded-sm", px: "8" },
  { name: "md", cls: "rounded-md", px: "12" },
  { name: "lg", cls: "rounded-lg", px: "16" },
  { name: "xl", cls: "rounded-xl", px: "20" },
  { name: "2xl", cls: "rounded-2xl", px: "24" },
  { name: "full", cls: "rounded-full", px: "999" },
];

const typeScale: Array<{ name: string; cls: string; px: number }> = [
  { name: "Caption", cls: "text-[11px] uppercase tracking-[0.06em] font-semibold", px: 11 },
  { name: "Label", cls: "text-[12px] font-medium", px: 12 },
  { name: "Small", cls: "text-[13px]", px: 13 },
  { name: "Body", cls: "text-[14px]", px: 14 },
  { name: "Body MD", cls: "text-[15px]", px: 15 },
  { name: "Body LG", cls: "text-[17px]", px: 17 },
  { name: "H4", cls: "text-[19px] font-semibold tracking-[-0.02em]", px: 19 },
  { name: "H3", cls: "text-[22px] font-semibold tracking-[-0.02em]", px: 22 },
  { name: "H2", cls: "text-[28px] font-semibold tracking-[-0.02em]", px: 28 },
  { name: "H1", cls: "text-[36px] font-semibold tracking-[-0.025em]", px: 36 },
  { name: "Display", cls: "text-[48px] font-semibold tracking-[-0.025em]", px: 48 },
];

export default function FoundationsPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [toggleOn, setToggleOn] = useState(true);

  return (
    <div className={theme === "dark" ? "dark" : undefined}>
      <div className="min-h-screen bg-bg text-text">
        <div className="mx-auto max-w-6xl px-8 py-10 space-y-10">
          <header className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.06em] font-semibold text-text-3 mb-2">
                Priddyspaces · Design System
              </p>
              <h1 className="text-[36px] font-semibold tracking-[-0.025em]">
                Foundations
              </h1>
              <p className="text-[14px] text-text-2 mt-1">
                Tokens, primitives and atoms — the building blocks every screen reaches for.
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
          </header>

          <Section title="Color" sub="All surfaces and accents come from CSS custom properties.">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {swatches.map((s) => (
                <div key={s.name} className="bg-surface border border-line rounded-2xl overflow-hidden shadow-xs dark:shadow-none">
                  <div className={`${s.bg} ${s.fg ?? "text-text"} h-20 flex items-end p-3 text-[12px] font-medium border-b border-line`}>
                    {s.name}
                  </div>
                  <div className="px-3 py-2 text-[11px] text-text-3 font-mono">
                    {s.bg.replace("bg-", "")}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Type scale" sub="Geist + Geist Mono. Numerics use mono with tabular figures.">
            <Card className="divide-y divide-line">
              {typeScale.map((t) => (
                <div key={t.name} className="flex items-baseline gap-6 py-3 first:pt-0 last:pb-0">
                  <div className="w-24 text-[11px] uppercase tracking-[0.06em] font-semibold text-text-3">
                    {t.name}
                  </div>
                  <div className="w-12 text-[11px] font-mono text-text-3">{t.px}px</div>
                  <div className={t.cls}>The quick brown fox</div>
                </div>
              ))}
            </Card>
          </Section>

          <Section title="Radii" sub="6 / 8 / 12 / 16 / 20 / 24 / 999 — that's the entire scale.">
            <div className="flex flex-wrap gap-4">
              {radii.map((r) => (
                <div key={r.name} className="flex flex-col items-center gap-2">
                  <div className={`w-16 h-16 bg-brand-soft border border-line ${r.cls}`} />
                  <div className="text-[11px] font-mono text-text-3">
                    {r.name} · {r.px}px
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Buttons">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">
                <Plus size={14} />
                New booking
              </Button>
              <Button variant="default">Default</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="outline-danger">Delete</Button>
              <Button variant="primary" size="sm">
                Small
              </Button>
              <Button variant="primary" size="lg">
                <Sparkles size={16} />
                Large
              </Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
            </div>
          </Section>

          <Section title="Inputs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <Field label="Workspace name" hint="Shown to your members.">
                <Input placeholder="Plantation HQ" />
              </Field>
              <Field label="Disabled">
                <Input placeholder="Cannot edit" disabled />
              </Field>
              <Field label="With error" error="That email is already in use.">
                <Input defaultValue="ada@plant.co" />
              </Field>
              <Field label="Search">
                <Input placeholder="Find anything…" />
              </Field>
            </div>
          </Section>

          <Section title="Badges">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Default</Badge>
              <Badge variant="violet">Violet</Badge>
              <Badge variant="mint">Mint</Badge>
              <Badge variant="success" dot>
                Confirmed
              </Badge>
              <Badge variant="warning" dot>
                Pending
              </Badge>
              <Badge variant="danger" dot>
                Failed
              </Badge>
              <Badge variant="info" dot>
                Draft
              </Badge>
            </div>
          </Section>

          <Section title="Avatars">
            <div className="flex items-center gap-3">
              {["Ada Lovelace", "Bertrand Russell", "Carl Sagan", "Daphne Koller", "Edsger Dijkstra"].map((n) => (
                <Avatar key={n} name={n} size={36} />
              ))}
              <Avatar name="X" size={48} />
              <Avatar name="Jane Miller" size={64} />
            </div>
          </Section>

          <Section title="Toggle + Kbd">
            <div className="flex items-center gap-6">
              <Label className="flex items-center gap-3">
                <Toggle checked={toggleOn} onCheckedChange={setToggleOn} />
                Show weekends
              </Label>
              <div className="flex items-center gap-2 text-[13px] text-text-2">
                Open palette
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </div>
            </div>
          </Section>

          <Section title="Card examples" sub="Padding is opt-in via the `padded` prop (defaulted true during migration).">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-brand-soft text-brand grid place-items-center">
                    <Calendar size={14} />
                  </div>
                  <span className="text-[12px] text-text-3 font-medium">Bookings today</span>
                </div>
                <div className="font-mono text-[26px] font-semibold tracking-[-0.025em]">12</div>
                <div className="text-[11px] text-text-3 mt-1">3 starting in the next hour</div>
              </Card>
              <Card>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-mint-50 text-mint-700 grid place-items-center">
                    <DollarSign size={14} />
                  </div>
                  <span className="text-[12px] text-text-3 font-medium">Revenue · MTD</span>
                </div>
                <div className="font-mono text-[26px] font-semibold tracking-[-0.025em]">$24,180</div>
                <Badge variant="success" dot className="mt-2">
                  <TrendingUp size={11} />
                  +18.2%
                </Badge>
              </Card>
              <Card>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-warning-soft text-warning grid place-items-center">
                    <Inbox size={14} />
                  </div>
                  <span className="text-[12px] text-text-3 font-medium">Pending requests</span>
                </div>
                <div className="font-mono text-[26px] font-semibold tracking-[-0.025em]">4</div>
                <div className="text-[11px] text-text-3 mt-1 flex items-center gap-1.5">
                  <Clock size={11} /> Oldest 2h ago
                </div>
              </Card>
            </div>
          </Section>

          <Section title="Icons">
            <div className="flex flex-wrap gap-3 text-text-2">
              {[Bell, Calendar, Check, Clock, DollarSign, Inbox, Plus, Search, Settings, Sparkles, Sun, Moon, TrendingUp].map((Icon, i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-xl border border-line bg-surface grid place-items-center"
                >
                  <Icon size={16} strokeWidth={1.6} />
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[19px] font-semibold tracking-[-0.02em]">{title}</h2>
        {sub && <p className="text-[13px] text-text-3 mt-1">{sub}</p>}
      </div>
      {children}
    </section>
  );
}
