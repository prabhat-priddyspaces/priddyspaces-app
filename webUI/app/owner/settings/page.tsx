"use client";

import { useEffect, useState } from "react";

import { OrganizationAmenitiesManager } from "@/components/organization-amenities-manager";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { SettingsSection } from "@/app/owner/settings/_components/settings-section";
import { useOwnerOrg } from "@/app/owner/settings/_components/owner-org-provider";

export default function OwnerBusinessProfilePage() {
  const { orgId, selectedOrg, refreshOrgs } = useOwnerOrg();
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", branding: "" });

  useEffect(() => {
    if (!selectedOrg) {
      setForm({ name: "", branding: "" });
      return;
    }
    setForm({ name: selectedOrg.name, branding: selectedOrg.branding ?? "" });
  }, [selectedOrg]);

  async function saveOrganizationProfile() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/orgs/${orgId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name: form.name, branding: form.branding }),
      },
      token
    );
    setMessage("Organization profile saved");
    await refreshOrgs();
  }

  async function resubmitOrganization() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/orgs/${orgId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          branding: form.branding,
          resubmit_for_review: true,
        }),
      },
      token
    );
    setMessage("Organization resubmitted for review");
    await refreshOrgs();
  }

  return (
    <div className="grid gap-5">
      {message ? <p className="text-[13px] text-text-3">{message}</p> : null}

      <SettingsSection
        title="Organization profile"
        description="Your organization's name and branding as members and the public marketplace see it."
        action={
          selectedOrg?.review_status === "rejected" ? (
            <Button type="button" variant="secondary" onClick={resubmitOrganization}>
              Resubmit for review
            </Button>
          ) : null
        }
      >
        <p className="text-[12px] text-text-3">
          Review status:{" "}
          <span className="font-medium text-text-2">
            {selectedOrg?.review_status || "not available"}
          </span>
          {selectedOrg?.review_notes ? ` • ${selectedOrg.review_notes}` : ""}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Organization name"
            htmlFor="org-name"
            hint="Displayed to members and on public listings."
          >
            <Input
              id="org-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Acme Coworking"
            />
          </Field>
          <Field
            label="Branding"
            htmlFor="org-branding"
            hint="A logo URL or short brand note for your team."
          >
            <Input
              id="org-branding"
              value={form.branding}
              onChange={(event) =>
                setForm((current) => ({ ...current, branding: event.target.value }))
              }
              placeholder="Branding URL or notes"
            />
          </Field>
        </div>
        <div>
          <Button type="button" onClick={saveOrganizationProfile} disabled={!orgId}>
            Save organization profile
          </Button>
        </div>
      </SettingsSection>

      <OrganizationAmenitiesManager orgId={orgId} />
    </div>
  );
}
