import { sanitizePhone } from "../src/lib/phone";

describe("sanitizePhone", () => {
  it("strips non-digit characters", () => {
    expect(sanitizePhone("(555) 123-4567")).toBe("5551234567");
  });

  it("caps at 10 digits", () => {
    expect(sanitizePhone("12211211212")).toBe("1221121121");
  });

  it("strips letters and symbols", () => {
    expect(sanitizePhone("555ABC4567x")).toBe("5554567");
  });

  it("returns empty string for blank input", () => {
    expect(sanitizePhone("()-+ ")).toBe("");
  });

  it("leaves a valid 10-digit number untouched", () => {
    expect(sanitizePhone("5551234567")).toBe("5551234567");
  });
});
