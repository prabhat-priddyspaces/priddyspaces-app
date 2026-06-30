import { apiFetch } from "../src/lib/api";
import {
  archetypeForKey,
  fetchSpaceTypes,
  formConfigForArchetype,
  isTermManagedArchetype,
  termBookingModeForArchetype,
  FALLBACK_SPACE_TYPES,
} from "../src/lib/spaceTypes";

jest.mock("../src/lib/api", () => ({ apiFetch: jest.fn() }));

const mockApiFetch = apiFetch as jest.Mock;

describe("spaceTypes lib", () => {
  afterEach(() => jest.resetAllMocks());

  it("returns the API list when available", async () => {
    const payload = [{ ...FALLBACK_SPACE_TYPES[0], label: "Custom Office" }];
    mockApiFetch.mockResolvedValueOnce(payload);
    const result = await fetchSpaceTypes("token");
    expect(result).toEqual(payload);
  });

  it("falls back to bundled types when the request fails", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("offline"));
    const result = await fetchSpaceTypes("token");
    expect(result).toBe(FALLBACK_SPACE_TYPES);
  });

  it("falls back when the API returns an empty list", async () => {
    mockApiFetch.mockResolvedValueOnce([]);
    const result = await fetchSpaceTypes("token");
    expect(result).toBe(FALLBACK_SPACE_TYPES);
  });

  it("maps the new built-in types to existing archetypes", () => {
    expect(archetypeForKey("event_space")).toBe("room_hourly");
    expect(archetypeForKey("business_address")).toBe("virtual");
  });

  it("derives room behavior for event space and hides capacity for virtual", () => {
    const event = formConfigForArchetype(archetypeForKey("event_space"));
    expect(event.showHourly).toBe(true);
    expect(event.capacityApplicable).toBe(true);

    const address = formConfigForArchetype(archetypeForKey("business_address"));
    expect(address.capacityApplicable).toBe(false);
    expect(address.showDaily).toBe(false);
  });

  it("treats business address as a term-managed virtual membership", () => {
    const archetype = archetypeForKey("business_address");
    expect(isTermManagedArchetype(archetype)).toBe(true);
    expect(termBookingModeForArchetype(archetype)).toBe("virtual_membership");
  });
});
