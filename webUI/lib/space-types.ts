import { apiFetch } from "@/lib/api";

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
// first paint and when the registry endpoint is unavailable, so older clients
// and SSR degrade gracefully.
export const FALLBACK_SPACE_TYPES: SpaceTypeConfig[] = [
  {
    key: "private_office",
    label: "Private Office",
    description: "A fully enclosed private office leased by the month.",
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
    description: "Pooled coworking seats available by day pass or monthly membership.",
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
    description: "A meeting room bookable by the hour or for the full day.",
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
    description: "A professional business address and mail handling with no physical desk.",
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
    description: "A larger multi-room office suite leased by the month.",
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
    description: "A large-capacity space for events, bookable by the hour or full day.",
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
    description: "A prestigious business mailing address with no physical workspace.",
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

export function titleizeSpaceType(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function spaceTypeLabel(key: string, types?: SpaceTypeConfig[]): string {
  const found = (types ?? FALLBACK_SPACE_TYPES).find((t) => t.key === key);
  return found?.label ?? titleizeSpaceType(key);
}

export function archetypeForKey(key: string, types?: SpaceTypeConfig[]): SpaceArchetype | null {
  const found = (types ?? FALLBACK_SPACE_TYPES).find((t) => t.key === key);
  return found?.archetype ?? null;
}

// ── Archetype-derived owner-form behavior ───────────────────────────────────
export interface SpaceTypeFormConfig {
  capacityApplicable: boolean;
  capacityLabel: string;
  capacityHelp: string;
  showHourly: boolean;
  requireHourly: boolean;
  showDaily: boolean;
  requireDaily: boolean;
  dailyLabel: string;
  dailyHelp: string;
  showAvailability: boolean;
  showBuffers: boolean;
  showVolumeDiscounts: boolean;
  showTerms: boolean;
  requireTerm: boolean;
  termLabel: string;
}

export function formConfigForArchetype(archetype: SpaceArchetype | null): SpaceTypeFormConfig {
  if (archetype === "room_hourly") {
    return {
      capacityApplicable: true,
      capacityLabel: "Room capacity",
      capacityHelp: "Number of people the room can seat.",
      showHourly: true,
      requireHourly: true,
      showDaily: true,
      requireDaily: true,
      dailyLabel: "Day rate price (USD)",
      dailyHelp: "All-day room price.",
      showAvailability: true,
      showBuffers: true,
      showVolumeDiscounts: true,
      showTerms: false,
      requireTerm: false,
      termLabel: "",
    };
  }
  if (archetype === "desk_pool") {
    return {
      capacityApplicable: true,
      capacityLabel: "Desks available per day",
      capacityHelp: "Pooled sellable seats for day passes and coworking memberships.",
      showHourly: false,
      requireHourly: false,
      showDaily: true,
      requireDaily: true,
      dailyLabel: "Day pass price (USD)",
      dailyHelp: "Charged per shared-desk day pass seat.",
      showAvailability: true,
      showBuffers: false,
      showVolumeDiscounts: true,
      showTerms: true,
      requireTerm: false,
      termLabel: "Membership Terms",
    };
  }
  if (archetype === "virtual") {
    return {
      capacityApplicable: false,
      capacityLabel: "",
      capacityHelp: "",
      showHourly: false,
      requireHourly: false,
      showDaily: false,
      requireDaily: false,
      dailyLabel: "",
      dailyHelp: "",
      showAvailability: false,
      showBuffers: false,
      showVolumeDiscounts: false,
      showTerms: true,
      requireTerm: true,
      termLabel: "Virtual Membership Terms",
    };
  }
  // private_office_lease / suite_lease
  return {
    capacityApplicable: true,
    capacityLabel: archetype === "suite_lease" ? "Suite seats" : "Office seats",
    capacityHelp: "Number of people included in this office or suite.",
    showHourly: false,
    requireHourly: false,
    showDaily: false,
    requireDaily: false,
    dailyLabel: "",
    dailyHelp: "",
    showAvailability: false,
    showBuffers: false,
    showVolumeDiscounts: false,
    showTerms: true,
    requireTerm: true,
    termLabel: "Lease Terms",
  };
}

// The membership/lease booking mode used by a term-managed archetype.
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

// Maps a term-managed archetype to the legacy space-type key understood by the
// LeaseTermsManager (which keys booking mode + labels off these strings).
export function legacyTermSpaceTypeForArchetype(
  archetype: SpaceArchetype | null
): "private_office" | "suite" | "shared_desk" | "virtual_office" | null {
  switch (archetype) {
    case "virtual":
      return "virtual_office";
    case "desk_pool":
      return "shared_desk";
    case "suite_lease":
      return "suite";
    case "private_office_lease":
      return "private_office";
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
