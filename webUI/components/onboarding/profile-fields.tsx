"use client";

import Link from "next/link";

import { COUNTRIES } from "@/lib/countries";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TIMEZONES =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];

export interface OnboardingProfileForm {
  full_name: string;
  phone: string;
  country: string;
  timezone: string;
  terms_accepted: boolean;
  privacy_policy_accepted: boolean;
}

export const emptyOnboardingProfileForm: OnboardingProfileForm = {
  full_name: "",
  phone: "",
  country: "US",
  timezone: "",
  terms_accepted: false,
  privacy_policy_accepted: false,
};

export function detectTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

interface ProfileFieldsProps {
  form: OnboardingProfileForm;
  onChange: (form: OnboardingProfileForm) => void;
}

export function ProfileFields({ form, onChange }: ProfileFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input
          id="full_name"
          value={form.full_name}
          onChange={(e) => onChange({ ...form, full_name: e.target.value })}
          placeholder="Jane Doe"
          required
          autoComplete="name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          type="tel"
          value={form.phone}
          onChange={(e) => onChange({ ...form, phone: e.target.value })}
          placeholder="+1 555 000 0000"
          autoComplete="tel"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="country">Country</Label>
        <select
          id="country"
          className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[13px] text-text"
          value={form.country}
          onChange={(e) => onChange({ ...form, country: e.target.value })}
          required
          autoComplete="country"
        >
          {COUNTRIES.map(({ code, name }) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        {TIMEZONES.length > 0 ? (
          <select
            id="timezone"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textPrimary"
            value={form.timezone}
            onChange={(e) => onChange({ ...form, timezone: e.target.value })}
            required
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id="timezone"
            value={form.timezone}
            onChange={(e) => onChange({ ...form, timezone: e.target.value })}
            placeholder="America/New_York"
            required
          />
        )}
      </div>
    </>
  );
}

export function TermsCheckbox({ form, onChange }: ProfileFieldsProps) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={form.terms_accepted && form.privacy_policy_accepted}
        onChange={(e) => {
          const checked = e.target.checked;
          onChange({
            ...form,
            terms_accepted: checked,
            privacy_policy_accepted: checked,
          });
        }}
        className="mt-1 rounded border-border"
        required
      />
      <span className="text-textSecondary">
        I agree to the{" "}
        <Link href="/terms" className="text-accent hover:underline">
          Terms and Conditions
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-accent hover:underline">
          Privacy Policy
        </Link>
        .
      </span>
    </label>
  );
}
