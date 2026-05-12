"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  LoyaltyLedgerEntry,
  LoyaltyWallet,
  formatCents,
  formatDate,
  formatPoints,
} from "@/lib/loyalty";

export default function MemberRewardsPage() {
  const [wallets, setWallets] = useState<LoyaltyWallet[]>([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [transactions, setTransactions] = useState<LoyaltyLedgerEntry[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<LoyaltyWallet[]>("/api/loyalty/wallets", { method: "GET" }, token)
      .then((list) => {
        setWallets(list);
        if (list[0]) setSelectedOrg(list[0].organization_public_id);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load rewards"));
  }, []);

  useEffect(() => {
    if (!selectedOrg) {
      setTransactions([]);
      return;
    }
    const token = getAccessToken() ?? undefined;
    apiFetch<LoyaltyLedgerEntry[]>(
      `/api/loyalty/wallets/${selectedOrg}/transactions`,
      { method: "GET" },
      token,
    )
      .then(setTransactions)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load transactions"));
  }, [selectedOrg]);

  const selected = wallets.find((wallet) => wallet.organization_public_id === selectedOrg) ?? wallets[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Rewards</h2>
          <p className="text-textSecondary">Your loyalty balances are separate for each workspace owner.</p>
        </div>
        {wallets.length > 1 ? (
          <select
            value={selectedOrg}
            onChange={(event) => setSelectedOrg(event.target.value)}
            className="h-10 rounded-sm border border-border bg-surface px-3 text-sm text-textPrimary"
          >
            {wallets.map((wallet) => (
              <option key={wallet.public_id} value={wallet.organization_public_id}>
                {wallet.organization_name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {message ? <div className="text-sm text-textMuted">{message}</div> : null}

      {selected ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Available points" value={formatPoints(selected.total_balance)} />
            <Metric label="Cash value" value={formatCents(selected.cash_value_cents)} />
            <Metric label="Tier" value={selected.tier} />
            <Metric label="Expiring next" value={`${formatPoints(selected.expiring_points)} pts`} detail={formatDate(selected.next_expiration_at)} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <div className="text-sm font-semibold text-textPrimary">{selected.organization_name}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Balance label="Promo points" value={selected.promo_balance} />
                <Balance label="Earned points" value={selected.earned_balance} />
                <Balance label="Lifetime earned" value={selected.lifetime_earned_points} />
                <Balance label="Point value" value={`${selected.point_value_cents} cent`} />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-semibold text-textPrimary">Tier progress</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface2">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.min(100, (selected.lifetime_earned_points / 150000) * 100)}%` }}
                />
              </div>
              <div className="mt-3 text-sm text-textSecondary">
                Silver at 10k / Gold at 50k / Platinum at 150k lifetime earned points.
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-textPrimary">Rewards history</div>
            {transactions.length === 0 ? (
              <div className="p-4 text-sm text-textMuted">No rewards activity yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface2 text-xs uppercase text-textMuted">
                  <tr>
                    <th className="px-3 py-2 text-left">Activity</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-right">Points</th>
                    <th className="px-3 py-2 text-left">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((entry) => (
                    <tr key={entry.public_id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="font-medium capitalize text-textPrimary">{entry.entry_type.replaceAll("_", " ")}</div>
                        <div className="text-xs text-textMuted">{entry.note || entry.source}</div>
                      </td>
                      <td className="px-3 py-2 capitalize text-textSecondary">{entry.point_type}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${entry.points >= 0 ? "text-emerald-700" : "text-error"}`}>
                        {entry.points >= 0 ? "+" : ""}
                        {formatPoints(entry.points)}
                      </td>
                      <td className="px-3 py-2 text-textMuted">{formatDate(entry.expires_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      ) : (
        <Card className="p-6 text-sm text-textMuted">Book an eligible space to start earning owner-specific rewards.</Card>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-textMuted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-textPrimary">{value}</div>
      {detail ? <div className="mt-1 text-xs text-textMuted">{detail}</div> : null}
    </Card>
  );
}

function Balance({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-sm border border-border p-3">
      <div className="text-textMuted">{label}</div>
      <div className="mt-1 font-semibold text-textPrimary">{typeof value === "number" ? formatPoints(value) : value}</div>
    </div>
  );
}
