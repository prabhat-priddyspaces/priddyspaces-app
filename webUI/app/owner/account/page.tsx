"use client";

import { useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { KeyRound, Mail, Save, User } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { sanitizePhone } from "@/lib/phone";
import { getAccessToken } from "@/lib/auth";
import { IS_E2E_BYPASS } from "@/lib/e2e-bypass";
import type { MeResponse } from "@/lib/me";
import { updateMeCache, useMe } from "@/hooks/useMe";
import { useForm } from "@/hooks/useForm";
import { cn } from "@/lib/utils";

type MessageTone = "success" | "danger";

type ClerkWithUserProfile = ReturnType<typeof useClerk> & {
  openUserProfile?: () => void;
};

type SecurityActionHook = (onUnavailable: () => void) => () => void;

function useClerkSecurityAction(onUnavailable: () => void) {
  const clerk = useClerk() as ClerkWithUserProfile;
  return () => {
    if (typeof clerk.openUserProfile === "function") {
      clerk.openUserProfile();
      return;
    }
    onUnavailable();
  };
}

function useBypassSecurityAction(onUnavailable: () => void) {
  return onUnavailable;
}

const useSecurityAction: SecurityActionHook = IS_E2E_BYPASS
  ? useBypassSecurityAction
  : useClerkSecurityAction;

export default function OwnerAccountPage() {
  const { me, loading, error, refresh } = useMe();
  const [loadedPublicId, setLoadedPublicId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("success");

  const form = useForm({
    initialValues: { first_name: "", last_name: "", phone: "", company_name: "" },
    validate: (values) => {
      const errors: { phone?: string } = {};
      const digits = values.phone.replace(/\D/g, "");
      if (digits && digits.length < 7) errors.phone = "Enter a valid phone number.";
      return errors;
    },
    onSubmit: async (values) => {
      const token = getAccessToken() ?? undefined;
      setMessage("");
      try {
        const updated = await apiFetch<MeResponse>(
          "/api/me",
          {
            method: "PATCH",
            body: JSON.stringify({
              first_name: values.first_name,
              last_name: values.last_name,
              phone: values.phone,
              company_name: values.company_name,
            }),
          },
          token
        );
        updateMeCache(updated, token ?? null);
        setLoadedPublicId(updated.public_id);
        setMessage("Owner profile saved.");
        setMessageTone("success");
        refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Unable to save profile.");
        setMessageTone("danger");
      }
    },
  });

  const openSecuritySettings = useSecurityAction(() => {
    setMessage("Email and password settings open in Clerk account management.");
    setMessageTone("success");
  });

  const setFormValues = form.setValues;
  useEffect(() => {
    if (!me || loadedPublicId === me.public_id) return;
    setFormValues({
      first_name: me.first_name ?? "",
      last_name: me.last_name ?? "",
      phone: me.phone ?? "",
      company_name: me.company_name ?? "",
    });
    setLoadedPublicId(me.public_id);
  }, [loadedPublicId, me, setFormValues]);

  const displayName =
    [form.values.first_name, form.values.last_name].filter(Boolean).join(" ") ||
    me?.email ||
    "Owner";

  return (
    <AppShell title="Account" breadcrumb={["Owner", "Account"]}>
      <div className="mx-auto grid max-w-4xl gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-text">
              Account
            </h2>
            <p className="mt-1 text-[13px] text-text-3">
              Manage the owner profile and sign-in settings used across booking operations.
            </p>
          </div>
          {me ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
              <Avatar name={displayName} size={36} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-text">
                  {displayName}
                </div>
                <div className="truncate text-[12px] text-text-3">{me.email}</div>
              </div>
            </div>
          ) : null}
        </div>

        {message ? (
          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-[13px]",
              messageTone === "danger"
                ? "border-danger/30 bg-danger-soft text-danger"
                : "border-success/30 bg-success-soft text-success"
            )}
          >
            {message}
          </div>
        ) : null}

        {loading ? (
          <Card className="p-5 text-[13px] text-text-3">Loading account...</Card>
        ) : error || !me ? (
          <Card className="p-5 text-[13px] text-danger">
            Unable to load account details.
          </Card>
        ) : (
          <>
            <Card padded={false} className="p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-brand-soft text-brand">
                  <User size={16} />
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-text">
                    Profile
                  </div>
                  <div className="text-[12px] text-text-3">
                    Basic details used across owner workflows.
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="First name" htmlFor="owner-first-name">
                  <Input
                    id="owner-first-name"
                    value={form.values.first_name}
                    onChange={form.handleChange("first_name")}
                    placeholder="First name"
                    autoComplete="given-name"
                  />
                </Field>
                <Field label="Last name" htmlFor="owner-last-name">
                  <Input
                    id="owner-last-name"
                    value={form.values.last_name}
                    onChange={form.handleChange("last_name")}
                    placeholder="Last name"
                    autoComplete="family-name"
                  />
                </Field>
                <Field label="Phone" htmlFor="owner-phone" error={form.errors.phone}>
                  <Input
                    id="owner-phone"
                    inputMode="numeric"
                    value={form.values.phone}
                    onChange={(event) => form.setValue("phone", sanitizePhone(event.target.value))}
                    placeholder="5551234567"
                    autoComplete="tel"
                  />
                </Field>
                <Field label="Company name" htmlFor="owner-company-name">
                  <Input
                    id="owner-company-name"
                    value={form.values.company_name}
                    onChange={form.handleChange("company_name")}
                    placeholder="Company name"
                    autoComplete="organization"
                  />
                </Field>
              </div>

              <div className="mt-5 flex justify-end">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void form.handleSubmit()}
                  disabled={form.submitting}
                >
                  <Save size={15} />
                  {form.submitting ? "Saving owner profile..." : "Save owner profile"}
                </Button>
              </div>
            </Card>

            <Card padded={false} className="p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-surface-2 text-text-2">
                  <KeyRound size={16} />
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-text">
                    Email and password
                  </div>
                  <div className="text-[12px] text-text-3">
                    Sign-in, email, password, and security are managed by Clerk.
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <Field label="Email" htmlFor="owner-email">
                  <div className="relative">
                    <Mail
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
                    />
                    <Input
                      id="owner-email"
                      value={me.email}
                      disabled
                      className="pl-9"
                    />
                  </div>
                </Field>
                <Button type="button" onClick={openSecuritySettings}>
                  <KeyRound size={15} />
                  Manage sign-in settings
                </Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
