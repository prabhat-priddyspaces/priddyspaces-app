import { apiFetch } from "./api";

export type SpaceArchetype =
  | "private_office_lease"
  | "suite_lease"
  | "desk_pool"
  | "room_hourly"
  | "virtual";

export interface SpaceTypeConfig {
  key: string;
  label: string;
  description: string | null;
  icon: string | null;
  archetype: SpaceArchetype;
  marketplace_category: string | null;
  capacity_applicable: boolean;
  has_physical_inventory: boolean;
  sort_order: number;
  valid_booking_modes: string[];
  default_booking_mode: string | null;
}

// Bundled fallback mirroring the backend's built-in registry seed. Used for
// offline/first render and so older builds degrade gracefully against new keys.
export const FALLBACK_SPACE_TYPES: SpaceTypeConfig[] = [
  {
    key: "private_office",
    label: "Private Office",
    description: null,
    icon: "building",
    archetype: "private_office_lease",
    marketplace_category: "private_office",
    capacity_applicable: true,
    has_physical_inventory: true,
    sort_order: 10,
    valid_booking_modes: ["private_office_lease"],
    default_booking_mode: "private_office_lease",
  },
  {
    key: "shared_desk",
    label: "Shared Desk",
    description: null,
    icon: "users",
    archetype: "desk_pool",
    marketplace_category: "coworking",
    capacity_applicable: true,
    has_physical_inventory: true,
    sort_order: 20,
    valid_booking_modes: ["day_pass", "monthly_membership"],
    default_booking_mode: "day_pass",
  },
  {
    key: "conference_room",
    label: "Conference Room",
    description: null,
    icon: "presentation",
    archetype: "room_hourly",
    marketplace_category: "meeting_room",
    capacity_applicable: true,
    has_physical_inventory: true,
    sort_order: 30,
    valid_booking_modes: ["day_pass", "hourly"],
    default_booking_mode: "hourly",
  },
  {
    key: "virtual_office",
    label: "Virtual Office",
    description: null,
    icon: "mail",
    archetype: "virtual",
    marketplace_category: null,
    capacity_applicable: false,
    has_physical_inventory: false,
    sort_order: 40,
    valid_booking_modes: ["virtual_membership"],
    default_booking_mode: "virtual_membership",
  },
  {
    key: "suite",
    label: "Suite",
    description: null,
    icon: "building-2",
    archetype: "suite_lease",
    marketplace_category: null,
    capacity_applicable: true,
    has_physical_inventory: true,
    sort_order: 50,
    valid_booking_modes: ["suite_lease"],
    default_booking_mode: "suite_lease",
  },
  {
    key: "event_space",
    label: "Event Space",
    description: null,
    icon: "calendar",
    archetype: "room_hourly",
    marketplace_category: "meeting_room",
    capacity_applicable: true,
    has_physical_inventory: true,
    sort_order: 60,
    valid_booking_modes: ["day_pass", "hourly"],
    default_booking_mode: "hourly",
  },
  {
    key: "business_address",
    label: "Business Address",
    description: null,
    icon: "map-pin",
    archetype: "virtual",
    marketplace_category: null,
    capacity_applicable: false,
    has_physical_inventory: false,
    sort_order: 70,
    valid_booking_modes: ["virtual_membership"],
    default_booking_mode: "virtual_membership",
  },
];

export async function fetchSpaceTypes(token?: string): Promise<SpaceTypeConfig[]> {
  try {
    const data = await apiFetch<SpaceTypeConfig[]>("/api/space-types", { method: "GET" }, token);
    return data && data.length ? data : FALLBACK_SPACE_TYPES;
  } catch {
    return FALLBACK_SPACE_TYPES;
  }
}

export function spaceTypeLabel(key: string, types?: SpaceTypeConfig[]): string {
  const found = (types ?? FALLBACK_SPACE_TYPES).find((t) => t.key === key);
  if (found) return found.label;
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function archetypeForKey(key: string, types?: SpaceTypeConfig[]): SpaceArchetype | null {
  const found = (types ?? FALLBACK_SPACE_TYPES).find((t) => t.key === key);
  return found?.archetype ?? null;
}

export interface SpaceTypeFormConfig {
  capacityApplicable: boolean;
  showHourly: boolean;
  requireHourly: boolean;
  showDaily: boolean;
  requireDaily: boolean;
  dailyLabel: string;
  showAvailability: boolean;
  showBuffers: boolean;
}

export function formConfigForArchetype(archetype: SpaceArchetype | null): SpaceTypeFormConfig {
  if (archetype === "room_hourly") {
    return {
      capacityApplicable: true,
      showHourly: true,
      requireHourly: true,
      showDaily: true,
      requireDaily: true,
      dailyLabel: "Day rate price",
      showAvailability: true,
      showBuffers: true,
    };
  }
  if (archetype === "desk_pool") {
    return {
      capacityApplicable: true,
      showHourly: false,
      requireHourly: false,
      showDaily: true,
      requireDaily: true,
      dailyLabel: "Day pass price",
      showAvailability: true,
      showBuffers: false,
    };
  }
  return {
    capacityApplicable: archetype !== "virtual",
    showHourly: false,
    requireHourly: false,
    showDaily: false,
    requireDaily: false,
    dailyLabel: "Daily price",
    showAvailability: false,
    showBuffers: false,
  };
}

export function termBookingModeForArchetype(archetype: SpaceArchetype | null): string | null {
  switch (archetype) {
    case "suite_lease":
      return "suite_lease";
    case "desk_pool":
      return "monthly_membership";
    case "virtual":
      return "virtual_membership";
    case "private_office_lease":
      return "private_office_lease";
    default:
      return null;
  }
}

export function isTermManagedArchetype(archetype: SpaceArchetype | null): boolean {
  return (
    archetype === "private_office_lease" ||
    archetype === "suite_lease" ||
    archetype === "desk_pool" ||
    archetype === "virtual"
  );
}
