"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { SenderSettings } from "@/lib/marketing";
import { formatDateTime, statusTone } from "@/lib/marketing";
import { cn } from "@/lib/utils";
import { SettingsSection } from "@/app/owner/settings/_components/settings-section";
import { useOwnerOrg } from "@/app/owner/settings/_components/owner-org-provider";

export default function OwnerEmailSenderPage() {
  const { orgId } = useOwnerOrg();
  const [settings, setSettings] = useState<SenderSettings | null>(null);
  const [message, setMessage] = useState("");
  const [senderForm, setSenderForm] = useState({
    default_sender_lane: "shared",
    verified_sender_public_id: "",
  });
  const [verifiedForm, setVerifiedForm] = useState({ email: "", name: "" });

  async function loadSettings(currentOrgId = orgId) {
    if (!currentOrgId) {
      setSettings(null);
      return;
    }
    const token = getAccessToken() ?? undefined;
    const result = await apiFetch<SenderSettings>(
      `/api/marketing/settings?organization_public_id=${encodeURIComponent(currentOrgId)}`,
      { method: "GET" },
      token
    );
    setSettings(result);
    setSenderForm({
      default_sender_lane: result.default_sender_lane,
      verified_sender_public_id: result.verified_sender_public_id || "",
    });
  }

  useEffect(() => {
    loadSettings().catch((err) =>
      setMessage(err instanceof Error ? err.message : "Failed to load settings")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function saveSender() {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch<SenderSettings>(
        "/api/marketing/settings/sender",
        { method: "PUT", body: JSON.stringify({ organization_public_id: orgId, ...senderForm }) },
        token
      );
      setMessage("Sender settings saved");
      await loadSettings();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function addVerifiedSender() {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch(
        "/api/marketing/settings/verified-senders",
        { method: "POST", body: JSON.stringify({ organization_public_id: orgId, ...verifiedForm }) },
        token
      );
      setVerifiedForm({ email: "", name: "" });
      setMessage("Verified sender requested");
      await loadSettings();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to request verified sender");
    }
  }

  async function refresh(publicId: string) {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch(
        `/api/marketing/settings/verified-senders/${publicId}/refresh`,
        { method: "POST" },
        token
      );
      setMessage("Sender refreshed");
      await loadSettings();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Refresh failed");
    }
  }

  return (
    <div className="grid gap-5">
      {message ? <p className="text-[13px] text-text-3">{message}</p> : null}

      {settings ? (
        <>
          <SettingsSection
            title="Default sender lane"
            description="Choose which address your marketing emails send from: the shared Priddyspaces sender or your own SendGrid-verified business sender."
          >
            <p className="text-[12px] text-text-3">
              Shared cap: {settings.shared_daily_cap}/day · Verified cap:{" "}
              {settings.verified_sender_daily_cap}/day
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field
                label="Sender lane"
                htmlFor="sender-lane"
                hint="Verified senders have higher daily limits and show your own business address."
              >
                <select
                  id="sender-lane"
                  value={senderForm.default_sender_lane}
                  onChange={(event) =>
                    setSenderForm({ ...senderForm, default_sender_lane: event.target.value })
                  }
                  className="h-10 rounded-lg border border-line bg-surface px-3 text-[13px] text-text"
                >
                  <option value="shared">Platform shared sender</option>
                  <option value="verified_sender">Verified business sender</option>
                </select>
              </Field>
              <Field label="Verified sender" htmlFor="verified-sender">
                <select
                  id="verified-sender"
                  value={senderForm.verified_sender_public_id}
                  onChange={(event) =>
                    setSenderForm({ ...senderForm, verified_sender_public_id: event.target.value })
                  }
                  className="h-10 rounded-lg border border-line bg-surface px-3 text-[13px] text-text"
                >
                  <option value="">No verified sender selected</option>
                  {settings.verified_senders.map((sender) => (
                    <option key={sender.public_id} value={sender.public_id}>
                      {sender.email} ({sender.status})
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end">
                <Button type="button" onClick={saveSender}>
                  Save sender
                </Button>
              </div>
            </div>
            <div className="text-[12px] text-text-3">
              Shared from: {settings.shared_from_name || "Priddyspaces"} &lt;
              {settings.shared_from_email}&gt;
            </div>
          </SettingsSection>

          <SettingsSection
            title="Add verified sender"
            description="Request verification for one of your own email addresses so campaigns can send from your brand."
          >
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Field label="Email" htmlFor="verified-email">
                <Input
                  id="verified-email"
                  value={verifiedForm.email}
                  onChange={(event) => setVerifiedForm({ ...verifiedForm, email: event.target.value })}
                  placeholder="owner@business.com"
                />
              </Field>
              <Field label="Sender name" htmlFor="verified-name">
                <Input
                  id="verified-name"
                  value={verifiedForm.name}
                  onChange={(event) => setVerifiedForm({ ...verifiedForm, name: event.target.value })}
                  placeholder="Sender name"
                />
              </Field>
              <div className="flex items-end">
                <Button type="button" onClick={addVerifiedSender} disabled={!verifiedForm.email}>
                  Add
                </Button>
              </div>
            </div>
          </SettingsSection>

          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-text-3">
                <tr>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Checked</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {settings.verified_senders.map((sender) => (
                  <tr key={sender.public_id} className="border-t border-line">
                    <td className="px-3 py-2 text-text">{sender.email}</td>
                    <td className="px-3 py-2 text-text-2">{sender.name || "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[11px] capitalize",
                          statusTone(sender.status)
                        )}
                      >
                        {sender.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-3">{formatDateTime(sender.last_checked_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => refresh(sender.public_id)}
                      >
                        Refresh
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-[13px] text-text-3">
          {orgId ? "Loading sender settings…" : "Select an organization to manage email senders."}
        </p>
      )}
    </div>
  );
}
