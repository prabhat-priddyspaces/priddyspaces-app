"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { SettingsSection } from "@/app/owner/settings/_components/settings-section";
import { useOwnerOrg } from "@/app/owner/settings/_components/owner-org-provider";

interface PromoCode {
  public_id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  expires_at: string | null;
  max_redemptions: number | null;
  max_redemptions_per_member: number | null;
  total_redemptions: number;
  is_active: boolean;
  total_discount_granted_cents: number;
  revenue_impacted_cents: number;
  status: string | null;
}

interface TaxConfig {
  public_id: string;
  rate_percent: number;
}

const centsFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatCents(cents: number | null | undefined) {
  return centsFormatter.format((cents || 0) / 100);
}

export default function OwnerPricingPage() {
  const { orgId } = useOwnerOrg();
  const [message, setMessage] = useState("");
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [taxConfig, setTaxConfig] = useState<TaxConfig | null>(null);
  const [taxRate, setTaxRate] = useState("");

  const [promoForm, setPromoForm] = useState({
    code: "",
    discount_type: "percent",
    discount_value: "",
    description: "",
    expires_at: "",
    max_redemptions: "",
    max_redemptions_per_member: "",
    is_active: true,
  });

  async function loadPromoCodes() {
    if (!orgId) {
      setPromoCodes([]);
      return;
    }
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<PromoCode[]>(
      `/api/promo-codes?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "GET" },
      token
    );
    setPromoCodes(list);
  }

  async function loadTaxConfig() {
    if (!orgId) {
      setTaxConfig(null);
      return;
    }
    const token = getAccessToken() ?? undefined;
    try {
      const cfg = await apiFetch<TaxConfig>(
        `/api/tax-config?organization_public_id=${encodeURIComponent(orgId)}`,
        { method: "GET" },
        token
      );
      setTaxConfig(cfg);
      setTaxRate(String(cfg.rate_percent));
    } catch {
      setTaxConfig(null);
      setTaxRate("");
    }
  }

  useEffect(() => {
    loadPromoCodes().catch(() => null);
    loadTaxConfig().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function createPromoCode() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/promo-codes?organization_public_id=${encodeURIComponent(orgId)}`,
      {
        method: "POST",
        body: JSON.stringify({
          code: promoForm.code,
          discount_type: promoForm.discount_type,
          discount_value: Number(promoForm.discount_value),
          description: promoForm.description || null,
          expires_at: promoForm.expires_at ? new Date(promoForm.expires_at).toISOString() : null,
          max_redemptions: promoForm.max_redemptions ? Number(promoForm.max_redemptions) : null,
          max_redemptions_per_member: promoForm.max_redemptions_per_member
            ? Number(promoForm.max_redemptions_per_member)
            : null,
          is_active: promoForm.is_active,
        }),
      },
      token
    );
    setMessage("Promo code created");
    setPromoForm({
      code: "",
      discount_type: "percent",
      discount_value: "",
      description: "",
      expires_at: "",
      max_redemptions: "",
      max_redemptions_per_member: "",
      is_active: true,
    });
    await loadPromoCodes();
  }

  async function saveTaxConfig() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/tax-config?organization_public_id=${encodeURIComponent(orgId)}`,
      {
        method: "POST",
        body: JSON.stringify({ rate_percent: Number(taxRate) }),
      },
      token
    );
    setMessage("Tax config saved");
    await loadTaxConfig();
  }

  return (
    <div className="grid gap-5">
      {message ? <p className="text-[13px] text-text-3">{message}</p> : null}

      <SettingsSection
        title="Tax configuration"
        description="The tax rate applied to bookings for this organization. Enter a whole-number percentage."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Tax rate (%)" htmlFor="tax-rate" hint="For example, enter 8.5 for 8.5%.">
            <Input
              id="tax-rate"
              value={taxRate}
              onChange={(event) => setTaxRate(event.target.value)}
              placeholder="Rate %"
            />
          </Field>
          <div className="flex items-end">
            <Button type="button" onClick={saveTaxConfig} disabled={!orgId}>
              Save tax
            </Button>
          </div>
        </div>
        <div className="text-[12px] text-text-3">
          Current: {taxConfig ? `${taxConfig.rate_percent}%` : "Not set"}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Promo codes"
        description="Discount codes members can apply at checkout. Set a discount, an optional expiry, and redemption limits."
      >
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Code" htmlFor="promo-code" hint="Members type this at checkout.">
            <Input
              id="promo-code"
              value={promoForm.code}
              onChange={(event) =>
                setPromoForm({ ...promoForm, code: event.target.value.toUpperCase() })
              }
              placeholder="CODE"
            />
          </Field>
          <Field label="Discount type" htmlFor="promo-discount-type">
            <select
              id="promo-discount-type"
              className="h-10 rounded-lg border border-line bg-surface px-3 text-[13px] text-text"
              value={promoForm.discount_type}
              onChange={(event) => setPromoForm({ ...promoForm, discount_type: event.target.value })}
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed</option>
            </select>
          </Field>
          <Field
            label="Discount value"
            htmlFor="promo-discount-value"
            hint={promoForm.discount_type === "fixed" ? "Amount off in dollars." : "Percent off the total."}
          >
            <Input
              id="promo-discount-value"
              value={promoForm.discount_value}
              onChange={(event) =>
                setPromoForm({ ...promoForm, discount_value: event.target.value })
              }
              placeholder={promoForm.discount_type === "fixed" ? "Fixed amount ($)" : "Percent"}
            />
          </Field>
          <Field label="Status" htmlFor="promo-status">
            <select
              id="promo-status"
              className="h-10 rounded-lg border border-line bg-surface px-3 text-[13px] text-text"
              value={promoForm.is_active ? "active" : "inactive"}
              onChange={(event) =>
                setPromoForm({ ...promoForm, is_active: event.target.value === "active" })
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Description" htmlFor="promo-description">
            <Input
              id="promo-description"
              value={promoForm.description}
              onChange={(event) => setPromoForm({ ...promoForm, description: event.target.value })}
              placeholder="Description"
            />
          </Field>
          <Field label="Expires" htmlFor="promo-expires" hint="Leave empty for no expiry.">
            <Input
              id="promo-expires"
              type="date"
              value={promoForm.expires_at}
              onChange={(event) => setPromoForm({ ...promoForm, expires_at: event.target.value })}
            />
          </Field>
          <Field
            label="Max redemptions"
            htmlFor="promo-max"
            hint="Total uses across all members. Empty = unlimited."
          >
            <Input
              id="promo-max"
              value={promoForm.max_redemptions}
              onChange={(event) =>
                setPromoForm({ ...promoForm, max_redemptions: event.target.value })
              }
              placeholder="Max redemptions"
            />
          </Field>
          <Field
            label="Max per member"
            htmlFor="promo-max-per-member"
            hint="How many times one member can use it. Empty = unlimited."
          >
            <Input
              id="promo-max-per-member"
              value={promoForm.max_redemptions_per_member}
              onChange={(event) =>
                setPromoForm({ ...promoForm, max_redemptions_per_member: event.target.value })
              }
              placeholder="Max per member"
            />
          </Field>
          <div className="flex items-end">
            <Button type="button" onClick={createPromoCode} disabled={!orgId}>
              Add promo
            </Button>
          </div>
        </div>
        <div className="grid gap-2 text-[12px] text-text-3">
          {promoCodes.map((promo) => (
            <div key={promo.public_id} className="rounded-lg border border-line p-3">
              <div className="font-semibold text-text">
                {promo.code} •{" "}
                {promo.discount_type === "fixed"
                  ? `$${promo.discount_value}`
                  : `${promo.discount_value}%`}{" "}
                • {promo.status || (promo.is_active ? "active" : "inactive")}
              </div>
              {promo.description ? <div>{promo.description}</div> : null}
              <div>
                Used {promo.total_redemptions || 0}
                {promo.max_redemptions ? ` / ${promo.max_redemptions}` : ""} • Per member{" "}
                {promo.max_redemptions_per_member || "unlimited"} • Expires{" "}
                {promo.expires_at ? new Date(promo.expires_at).toLocaleDateString() : "never"}
              </div>
              <div>
                Discounts {formatCents(promo.total_discount_granted_cents)} • Revenue impacted{" "}
                {formatCents(promo.revenue_impacted_cents)}
              </div>
            </div>
          ))}
          {promoCodes.length === 0 ? <div>No promo codes configured.</div> : null}
        </div>
      </SettingsSection>
    </div>
  );
}
