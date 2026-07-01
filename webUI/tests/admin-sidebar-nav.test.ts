import { describe, expect, it } from "vitest";

import { getSidebarSections } from "../components/shell/sidebar";

function hrefs(sections: ReturnType<typeof getSidebarSections>): string[] {
  return sections.flatMap((section) => section.items.map((item) => item.href));
}

describe("admin sidebar navigation", () => {
  it("exposes the Space Types management page to admins and superadmins", () => {
    expect(hrefs(getSidebarSections("admin", false))).toContain("/admin/space-types");
    expect(hrefs(getSidebarSections("admin", true))).toContain("/admin/space-types");
  });

  it("does not leak the admin-only page into owner or customer navs", () => {
    expect(hrefs(getSidebarSections("owner", false))).not.toContain("/admin/space-types");
    expect(hrefs(getSidebarSections("customer", false))).not.toContain("/admin/space-types");
  });
});
