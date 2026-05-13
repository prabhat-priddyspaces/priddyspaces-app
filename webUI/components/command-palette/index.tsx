"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  HelpCircle,
  Home,
  Inbox,
  LineChart,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  onSelect: () => void;
  keywords?: string[];
}

interface PaletteGroup {
  heading: string;
  items: PaletteItem[];
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const navigate = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const groups: PaletteGroup[] = React.useMemo(
    () => [
      {
        heading: "Quick actions",
        items: [
          {
            id: "new-booking",
            label: "New booking",
            hint: "Create a booking from a member or guest",
            icon: Plus,
            onSelect: () => navigate("/owner/calendar"),
            keywords: ["create", "booking", "reserve"],
          },
          {
            id: "new-space",
            label: "Add a space",
            icon: Plus,
            onSelect: () => navigate("/owner/spaces/new"),
            keywords: ["add", "room", "desk"],
          },
          {
            id: "new-location",
            label: "Add a location",
            icon: Plus,
            onSelect: () => navigate("/owner/locations/new"),
          },
          {
            id: "ai-summary",
            label: "Open AI summary",
            hint: "Quick read on what changed today",
            icon: Sparkles,
            onSelect: () => navigate("/owner"),
            keywords: ["ai", "assistant", "summary"],
          },
        ],
      },
      {
        heading: "Navigation",
        items: [
          {
            id: "dashboard",
            label: "Dashboard",
            icon: Home,
            onSelect: () => navigate("/owner"),
          },
          {
            id: "calendar",
            label: "Calendar",
            icon: Calendar,
            onSelect: () => navigate("/owner/calendar"),
          },
          {
            id: "requests",
            label: "Requests",
            icon: Inbox,
            onSelect: () => navigate("/owner/requests"),
          },
          {
            id: "members",
            label: "Members",
            icon: Users,
            onSelect: () => navigate("/owner/members"),
          },
          {
            id: "locations",
            label: "Locations",
            icon: MapPin,
            onSelect: () => navigate("/owner/locations"),
          },
          {
            id: "analytics",
            label: "Analytics",
            icon: LineChart,
            onSelect: () => navigate("/owner/analytics"),
          },
          {
            id: "settings",
            label: "Settings",
            icon: Settings,
            onSelect: () => navigate("/owner/settings"),
          },
        ],
      },
      {
        heading: "Help",
        items: [
          {
            id: "docs",
            label: "Docs & guides",
            icon: BookOpen,
            onSelect: () => navigate("/owner"),
          },
          {
            id: "support",
            label: "Contact support",
            icon: MessageCircle,
            onSelect: () => navigate("/owner"),
          },
          {
            id: "about",
            label: "About Priddyspaces",
            icon: HelpCircle,
            onSelect: () => navigate("/owner"),
          },
        ],
      },
    ],
    [navigate]
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className={cn(
        "fixed inset-0 z-[100] grid place-items-start bg-black/40",
        "data-[state=open]:animate-in data-[state=closed]:animate-out fade-in-0 fade-out-0"
      )}
      overlayClassName="bg-black/40"
    >
      <div className="mx-auto mt-[12vh] w-full max-w-xl rounded-2xl border border-line bg-surface shadow-pop overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
          <Search size={16} className="text-text-3" />
          <Command.Input
            autoFocus
            placeholder="Search or type a command…"
            className="flex-1 bg-transparent border-none outline-none text-[14px] text-text placeholder:text-text-4"
          />
          <Kbd>esc</Kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-[13px] text-text-3">
            No matches.
          </Command.Empty>
          {groups.map((group) => (
            <Command.Group
              key={group.heading}
              heading={
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-4 px-2 py-1.5">
                  {group.heading}
                </div>
              }
            >
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.id}
                    value={`${item.label} ${item.keywords?.join(" ") ?? ""}`}
                    onSelect={item.onSelect}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-[13px] text-text-2",
                      "data-[selected=true]:bg-brand-soft data-[selected=true]:text-text"
                    )}
                  >
                    <Icon
                      size={15}
                      strokeWidth={1.6}
                      className="text-text-3"
                    />
                    <span className="flex-1">{item.label}</span>
                    {item.hint && (
                      <span className="text-[11px] text-text-3">{item.hint}</span>
                    )}
                    <ArrowRight size={12} className="text-text-4" />
                  </Command.Item>
                );
              })}
            </Command.Group>
          ))}
        </Command.List>

        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-line text-[11px] text-text-3 bg-surface-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd>
              select
            </span>
          </div>
          <span className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-brand" />
            Ask AI
          </span>
        </div>
      </div>
    </Command.Dialog>
  );
}
