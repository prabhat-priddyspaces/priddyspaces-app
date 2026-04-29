"use client";

import { cn } from "@/lib/utils";
import { CalendarSpace, SPACE_TYPES, SPACE_TYPE_LABEL, STATUS_OPTIONS } from "@/lib/calendar";

interface LocationOption {
  public_id: string;
  name: string;
}

export interface CalendarFilters {
  locationPublicId: string | null;
  spaceTypes: string[];
  spacePublicIds: string[];
  statuses: string[];
  memberSearch: string;
}

interface CalendarFilterBarProps {
  locations: LocationOption[];
  spaces: CalendarSpace[];
  filters: CalendarFilters;
  onChange: (next: CalendarFilters) => void;
}

function toggleInList<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        active
          ? "border-accent bg-accent text-white"
          : "border-border bg-surface text-textSecondary hover:border-accent/50"
      )}
    >
      {children}
    </button>
  );
}

export function CalendarFilterBar({
  locations,
  spaces,
  filters,
  onChange,
}: CalendarFilterBarProps) {
  const filteredSpaces = filters.locationPublicId
    ? spaces.filter((s) => s.location_public_id === filters.locationPublicId)
    : spaces;

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-textMuted">Location</label>
        <select
          value={filters.locationPublicId || ""}
          onChange={(e) =>
            onChange({ ...filters, locationPublicId: e.target.value || null, spacePublicIds: [] })
          }
          className="h-9 rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
        >
          <option value="">All locations</option>
          {locations.map((loc) => (
            <option key={loc.public_id} value={loc.public_id}>
              {loc.name}
            </option>
          ))}
        </select>
        <input
          value={filters.memberSearch}
          onChange={(e) => onChange({ ...filters, memberSearch: e.target.value })}
          placeholder="Search member name or email"
          className="h-9 flex-1 min-w-[200px] rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-textMuted self-center">Type:</span>
        {SPACE_TYPES.map((type) => (
          <Chip
            key={type}
            active={filters.spaceTypes.includes(type)}
            onClick={() =>
              onChange({ ...filters, spaceTypes: toggleInList(filters.spaceTypes, type) })
            }
          >
            {SPACE_TYPE_LABEL[type]}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-textMuted self-center">Status:</span>
        {STATUS_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            active={filters.statuses.includes(opt.value)}
            onClick={() =>
              onChange({ ...filters, statuses: toggleInList(filters.statuses, opt.value) })
            }
          >
            {opt.label}
          </Chip>
        ))}
      </div>

      {filteredSpaces.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-textMuted self-center">Space:</span>
          {filteredSpaces.map((space) => (
            <Chip
              key={space.public_id}
              active={filters.spacePublicIds.includes(space.public_id)}
              onClick={() =>
                onChange({
                  ...filters,
                  spacePublicIds: toggleInList(filters.spacePublicIds, space.public_id),
                })
              }
            >
              {space.name || "Unnamed"}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
