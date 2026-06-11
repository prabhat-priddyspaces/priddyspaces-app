import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type LoyaltyWallet = {
  public_id: string;
  organization_public_id: string;
  organization_name: string;
  promo_balance: number;
  earned_balance: number;
  total_balance: number;
  lifetime_earned_points: number;
  tier: string;
  point_value_cents: number;
  cash_value_cents: number;
  next_expiration_at: string | null;
  expiring_points: number;
};

type LoyaltyLedgerEntry = {
  public_id: string;
  entry_type: string;
  point_type: string;
  points: number;
  source: string;
  expires_at: string | null;
  note: string | null;
};

type PriddyPointsWallet = {
  public_id: string;
  balance: number;
  lifetime_earned_points: number;
  point_value_cents: number;
  cash_value_cents: number;
};

function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
  }).format(value / 100);
}

function formatPoints(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function titleize(value: string) {
  return value.replace(/_/g, " ");
}

export function MemberRewardsScreen() {
  const { token } = useAuth();
  const [wallets, setWallets] = useState<LoyaltyWallet[]>([]);
  const [priddyWallet, setPriddyWallet] = useState<PriddyPointsWallet | null>(null);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [transactions, setTransactions] = useState<LoyaltyLedgerEntry[]>([]);
  const [priddyTransactions, setPriddyTransactions] = useState<LoyaltyLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      apiFetch<PriddyPointsWallet>("/api/loyalty/priddy-wallet", { method: "GET" }, token),
      apiFetch<LoyaltyWallet[]>("/api/loyalty/wallets", { method: "GET" }, token),
      apiFetch<LoyaltyLedgerEntry[]>("/api/loyalty/priddy-wallet/transactions", { method: "GET" }, token),
    ])
      .then(([priddy, list, priddyHistory]) => {
        setPriddyWallet(priddy);
        setWallets(list);
        setPriddyTransactions(priddyHistory);
        if (list[0]) setSelectedOrg(list[0].organization_public_id);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load rewards"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || !selectedOrg) {
      setTransactions([]);
      return;
    }
    apiFetch<LoyaltyLedgerEntry[]>(
      `/api/loyalty/wallets/${selectedOrg}/transactions`,
      { method: "GET" },
      token,
    )
      .then(setTransactions)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load transactions"));
  }, [token, selectedOrg]);

  const selected =
    wallets.find((wallet) => wallet.organization_public_id === selectedOrg) ?? wallets[0] ?? null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Rewards</Text>
      <Text style={styles.subtitle}>Your loyalty balances are separate for each workspace owner.</Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {wallets.length > 1 ? (
        <View style={styles.chipRow}>
          {wallets.map((wallet) => {
            const active = selectedOrg === wallet.organization_public_id;
            return (
              <TouchableOpacity
                key={wallet.public_id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedOrg(wallet.organization_public_id)}
                accessibilityRole="button"
                accessibilityLabel={`Wallet ${wallet.organization_name}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {wallet.organization_name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {priddyWallet ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Priddy Points</Text>
          <Text style={styles.mutedText}>Platform points for eligible desks and passes.</Text>
          <Text style={styles.bigValue}>{formatPoints(priddyWallet.balance)}</Text>
          <Text style={styles.mutedText}>{formatCents(priddyWallet.cash_value_cents)} value</Text>
          {priddyTransactions.slice(0, 3).map((entry) => (
            <View key={entry.public_id} style={styles.ledgerRow}>
              <Text style={styles.ledgerType}>{titleize(entry.entry_type)}</Text>
              <Text style={entry.points >= 0 ? styles.pointsPositive : styles.pointsNegative}>
                {entry.points >= 0 ? "+" : ""}
                {formatPoints(entry.points)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {selected ? (
        <>
          <View style={styles.statsRow}>
            <Metric label="Available points" value={formatPoints(selected.total_balance)} />
            <Metric label="Cash value" value={formatCents(selected.cash_value_cents)} />
            <Metric label="Tier" value={selected.tier} />
            <Metric
              label="Expiring next"
              value={`${formatPoints(selected.expiring_points)} pts`}
              detail={formatDate(selected.next_expiration_at)}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{selected.organization_name}</Text>
            <View style={styles.balanceGrid}>
              <Balance label="Promo points" value={formatPoints(selected.promo_balance)} />
              <Balance label="Earned points" value={formatPoints(selected.earned_balance)} />
              <Balance label="Lifetime earned" value={formatPoints(selected.lifetime_earned_points)} />
              <Balance label="Point value" value={`${selected.point_value_cents} cent`} />
            </View>
            <Text style={styles.mutedText}>
              Silver at 10k / Gold at 50k / Platinum at 150k lifetime earned points.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rewards history</Text>
            {transactions.length === 0 ? (
              <Text style={styles.mutedText}>No rewards activity yet.</Text>
            ) : (
              transactions.map((entry) => (
                <View key={entry.public_id} style={styles.ledgerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ledgerType}>{titleize(entry.entry_type)}</Text>
                    <Text style={styles.mutedText}>{entry.note || entry.source}</Text>
                    <Text style={styles.mutedText}>
                      {titleize(entry.point_type)}
                      {entry.expires_at ? ` • Expires ${formatDate(entry.expires_at)}` : ""}
                    </Text>
                  </View>
                  <Text style={entry.points >= 0 ? styles.pointsPositive : styles.pointsNegative}>
                    {entry.points >= 0 ? "+" : ""}
                    {formatPoints(entry.points)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : !loading ? (
        <View style={styles.section}>
          <Text style={styles.mutedText}>Book an eligible space to start earning owner-specific rewards.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.mutedText}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {detail ? <Text style={styles.mutedText}>{detail}</Text> : null}
    </View>
  );
}

function Balance({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.balanceCard}>
      <Text style={styles.mutedText}>{label}</Text>
      <Text style={styles.balanceValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F9FAFB"
  },
  container: {
    padding: 20,
    gap: 14
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827"
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#6B7280"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF"
  },
  chipActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF"
  },
  chipText: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "700"
  },
  chipTextActive: {
    color: "#3730A3"
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 8
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  bigValue: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111827"
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  statCard: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    gap: 4
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textTransform: "capitalize"
  },
  balanceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  balanceCard: {
    flexGrow: 1,
    minWidth: 130,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 4
  },
  balanceValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827"
  },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10
  },
  ledgerType: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    textTransform: "capitalize"
  },
  pointsPositive: {
    color: "#047857",
    fontWeight: "700",
    fontSize: 13
  },
  pointsNegative: {
    color: "#DC2626",
    fontWeight: "700",
    fontSize: 13
  },
  mutedText: {
    fontSize: 12,
    color: "#6B7280"
  },
  message: {
    color: "#DC2626",
    fontSize: 12
  }
});
