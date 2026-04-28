"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface Organization {
  public_id: string;
  name: string;
}

interface LocationOption {
  public_id: string;
  name: string;
}

interface OwnerPaymentSetting {
  public_id: string;
  provider: "stripe" | "cardpointe";
  is_enabled: boolean;
  is_test_mode: boolean;
  stripe_publishable_key: string | null;
  has_stripe_secret_key: boolean;
  has_stripe_webhook_secret: boolean;
  cardpointe_merchant_id: string | null;
  has_cardpointe_username: boolean;
  has_cardpointe_password: boolean;
  cardpointe_site: string | null;
  cardpointe_tokenizer_url: string | null;
  connection_status: string;
  last_tested_at: string | null;
}

const emptyForm = {
  provider: "stripe" as "stripe" | "cardpointe",
  is_enabled: false,
  is_test_mode: true,
  stripe_publishable_key: "",
  stripe_secret_key: "",
  stripe_webhook_secret: "",
  cardpointe_merchant_id: "",
  cardpointe_username: "",
  cardpointe_password: "",
  cardpointe_site: "",
  cardpointe_tokenizer_url: "",
};

export default function OwnerPaymentSettingsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [settings, setSettings] = useState<OwnerPaymentSetting[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [orgOverride, setOrgOverride] = useState("");
  const [locationOverride, setLocationOverride] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const selected = useMemo(
    () => settings.find((setting) => setting.provider === form.provider) || null,
    [settings, form.provider]
  );

  async function loadSettings(nextOrgId = orgId) {
    if (!nextOrgId) {
      setSettings([]);
      return;
    }
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<OwnerPaymentSetting[]>(
      `/api/owner/payment-settings?organization_public_id=${encodeURIComponent(nextOrgId)}`,
      { method: "GET" },
      token
    );
    setSettings(list);
  }

  useEffect(() => {
    async function load() {
      const token = getAccessToken() ?? undefined;
      try {
        const list = await apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token);
        setOrgs(list);
        if (list.length > 0) setOrgId(list[0].public_id);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to load organizations");
      } finally {
        setLoading(false);
      }
    }
    load().catch(() => null);
  }, []);

  useEffect(() => {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    Promise.all([
      loadSettings(orgId),
      apiFetch<LocationOption[]>(
        `/api/locations?organization_public_id=${encodeURIComponent(orgId)}`,
        { method: "GET" },
        token
      ).catch(() => []),
    ])
      .then(([, locationList]) => {
        setLocations(locationList);
        setLocationId(locationList[0]?.public_id || "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load payment settings"));
  }, [orgId]);

  useEffect(() => {
    if (!selected) {
      setForm((current) => ({ ...emptyForm, provider: current.provider }));
      return;
    }
    setForm((current) => ({
      ...current,
      is_enabled: selected.is_enabled,
      is_test_mode: selected.is_test_mode,
      stripe_publishable_key: selected.stripe_publishable_key || "",
      stripe_secret_key: "",
      stripe_webhook_secret: "",
      cardpointe_merchant_id: selected.cardpointe_merchant_id || "",
      cardpointe_username: "",
      cardpointe_password: "",
      cardpointe_site: selected.cardpointe_site || "",
      cardpointe_tokenizer_url: selected.cardpointe_tokenizer_url || "",
    }));
  }, [selected]);

  async function saveSettings() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/owner/payment-settings?organization_public_id=${encodeURIComponent(orgId)}`,
      {
        method: "POST",
        body: JSON.stringify(form),
      },
      token
    );
    setMessage("Payment settings saved");
    await loadSettings();
  }

  async function testSetting(publicId: string) {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch(`/api/owner/payment-settings/${publicId}/test`, { method: "POST" }, token);
      setMessage("Connection test succeeded");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      await loadSettings();
    }
  }

  async function toggleSetting(publicId: string, enabled: boolean) {
    const token = getAccessToken() ?? undefined;
    await apiFetch(`/api/owner/payment-settings/${publicId}/${enabled ? "enable" : "disable"}`, { method: "POST" }, token);
    setMessage(enabled ? "Provider enabled" : "Provider disabled");
    await loadSettings();
  }

  async function saveOrgOverride() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/owner/payment-provider/organization/${orgId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ payment_provider: orgOverride || null }),
      },
      token
    );
    setMessage("Organization payment provider saved");
  }

  async function saveLocationOverride() {
    if (!locationId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/owner/payment-provider/location/${locationId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ payment_provider: locationOverride || null }),
      },
      token
    );
    setMessage("Location payment provider saved");
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h2 className="text-2xl font-semibold">Payment settings</h2>
          <p className="text-textSecondary">Configure the provider used for booking request charges.</p>
        </div>

        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        <Card className="grid gap-4 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Organization</Label>
              <select
                value={orgId}
                onChange={(event) => setOrgId(event.target.value)}
                disabled={loading}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              >
                {orgs.map((org) => (
                  <option key={org.public_id} value={org.public_id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Organization provider</Label>
              <select
                value={orgOverride}
                onChange={(event) => setOrgOverride(event.target.value)}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              >
                <option value="">Global default</option>
                <option value="stripe">Stripe</option>
                <option value="cardpointe">CardPointe</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={saveOrgOverride} disabled={!orgId}>
                Save organization override
              </Button>
            </div>
          </div>
        </Card>

        <Card className="grid gap-4 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Location</Label>
              <select
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              >
                <option value="">Select location</option>
                {locations.map((location) => (
                  <option key={location.public_id} value={location.public_id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Location provider</Label>
              <select
                value={locationOverride}
                onChange={(event) => setLocationOverride(event.target.value)}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              >
                <option value="">Organization/global default</option>
                <option value="stripe">Stripe</option>
                <option value="cardpointe">CardPointe</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={saveLocationOverride} disabled={!locationId}>
                Save location override
              </Button>
            </div>
          </div>
        </Card>

        <Card className="grid gap-4 p-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="grid gap-2">
              <Label>Provider</Label>
              <select
                value={form.provider}
                onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value as "stripe" | "cardpointe" }))}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              >
                <option value="stripe">Stripe</option>
                <option value="cardpointe">CardPointe</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-textSecondary">
              <input
                type="checkbox"
                checked={form.is_enabled}
                onChange={(event) => setForm((current) => ({ ...current, is_enabled: event.target.checked }))}
              />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-textSecondary">
              <input
                type="checkbox"
                checked={form.is_test_mode}
                onChange={(event) => setForm((current) => ({ ...current, is_test_mode: event.target.checked }))}
              />
              Test mode
            </label>
          </div>

          {form.provider === "stripe" ? (
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                value={form.stripe_publishable_key}
                onChange={(event) => setForm((current) => ({ ...current, stripe_publishable_key: event.target.value }))}
                placeholder="Stripe publishable key"
              />
              <Input
                value={form.stripe_secret_key}
                onChange={(event) => setForm((current) => ({ ...current, stripe_secret_key: event.target.value }))}
                placeholder={selected?.has_stripe_secret_key ? "Secret key saved" : "Stripe secret key"}
              />
              <Input
                value={form.stripe_webhook_secret}
                onChange={(event) => setForm((current) => ({ ...current, stripe_webhook_secret: event.target.value }))}
                placeholder={selected?.has_stripe_webhook_secret ? "Webhook secret saved" : "Stripe webhook secret"}
              />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={form.cardpointe_merchant_id}
                onChange={(event) => setForm((current) => ({ ...current, cardpointe_merchant_id: event.target.value }))}
                placeholder="Merchant ID"
              />
              <Input
                value={form.cardpointe_site}
                onChange={(event) => setForm((current) => ({ ...current, cardpointe_site: event.target.value }))}
                placeholder="Gateway site"
              />
              <Input
                value={form.cardpointe_username}
                onChange={(event) => setForm((current) => ({ ...current, cardpointe_username: event.target.value }))}
                placeholder={selected?.has_cardpointe_username ? "Username saved" : "Username"}
              />
              <Input
                value={form.cardpointe_password}
                onChange={(event) => setForm((current) => ({ ...current, cardpointe_password: event.target.value }))}
                placeholder={selected?.has_cardpointe_password ? "Password saved" : "Password"}
              />
              <Input
                value={form.cardpointe_tokenizer_url}
                onChange={(event) => setForm((current) => ({ ...current, cardpointe_tokenizer_url: event.target.value }))}
                placeholder="Tokenizer URL"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={saveSettings} disabled={!orgId}>
              Save provider
            </Button>
            {selected ? (
              <>
                <Button type="button" variant="secondary" onClick={() => testSetting(selected.public_id)}>
                  Test connection
                </Button>
                <Button type="button" variant="secondary" onClick={() => toggleSetting(selected.public_id, !selected.is_enabled)}>
                  {selected.is_enabled ? "Disable" : "Enable"}
                </Button>
              </>
            ) : null}
          </div>
        </Card>

        <Card className="grid gap-3 p-4">
          <div className="text-sm font-semibold text-textPrimary">Configured providers</div>
          {settings.length === 0 ? <div className="text-sm text-textMuted">No providers configured.</div> : null}
          {settings.map((setting) => (
            <div key={setting.public_id} className="rounded-md border border-border p-3 text-sm text-textSecondary">
              <div className="font-medium text-textPrimary">{setting.provider}</div>
              <div>
                {setting.is_enabled ? "Enabled" : "Disabled"} • {setting.is_test_mode ? "Test" : "Live"} • {setting.connection_status}
              </div>
              {setting.last_tested_at ? <div>Last tested {new Date(setting.last_tested_at).toLocaleString()}</div> : null}
            </div>
          ))}
        </Card>
      </div>
    </AppShell>
  );
}
