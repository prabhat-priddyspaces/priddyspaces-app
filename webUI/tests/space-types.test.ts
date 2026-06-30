import { afterEach, describe, expect, it, vi } from "vitest";

import {
  archetypeForKey,
  fetchSpaceTypes,
  formConfigForArchetype,
  isTermManagedArchetype,
  legacyTermSpaceTypeForArchetype,
  spaceTypeLabel,
  termBookingModeForArchetype,
  FALLBACK_SPACE_TYPES,
} from "../lib/space-types";
import { apiFetch } from "../lib/api";

vi.mock("../lib/api", () => ({ apiFetch: vi.fn() }));

const mockApiFetch = vi.mocked(apiFetch);

describe("space-types lib", () => {
  afterEach(() => vi.resetAllMocks());

  it("returns the API list when present", async () => {
    const payload = [{ ...FALLBACK_SPACE_TYPES[0], label: "Custom" }];
    mockApiFetch.mockResolvedValueOnce(payload as never);
    expect(await fetchSpaceTypes("t")).toEqual(payload);
  });

  it("falls back to bundled types on error or empty", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchSpaceTypes("t")).toBe(FALLBACK_SPACE_TYPES);
    mockApiFetch.mockResolvedValueOnce([] as never);
    expect(await fetchSpaceTypes("t")).toBe(FALLBACK_SPACE_TYPES);
  });

  it("maps new built-in types to existing archetypes", () => {
    expect(archetypeForKey("event_space")).toBe("room_hourly");
    expect(archetypeForKey("business_address")).toBe("virtual");
    expect(spaceTypeLabel("event_space")).toBe("Event Space");
  });

  it("derives form behavior from archetype", () => {
    const event = formConfigForArchetype(archetypeForKey("event_space"));
    expect(event.showHourly).toBe(true);
    expect(event.requireDaily).toBe(true);
    expect(event.capacityApplicable).toBe(true);

    const address = formConfigForArchetype(archetypeForKey("business_address"));
    expect(address.capacityApplicable).toBe(false);
    expect(address.requireTerm).toBe(true);
    expect(address.termLabel).toBe("Virtual Membership Terms");
  });

  it("treats business address as a term-managed virtual membership", () => {
    const archetype = archetypeForKey("business_address");
    expect(isTermManagedArchetype(archetype)).toBe(true);
    expect(termBookingModeForArchetype(archetype)).toBe("virtual_membership");
    expect(legacyTermSpaceTypeForArchetype(archetype)).toBe("virtual_office");
  });
});
