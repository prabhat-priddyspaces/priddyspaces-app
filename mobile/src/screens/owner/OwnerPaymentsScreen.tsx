import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Payment = {
  id: number;
  public_id: string;
  status: string;
  provider?: string | null;
  amount?: number;
  amount_cents?: number;
  booking_id?: number | null;
  subscription_id?: number | null;
  space_name?: string | null;
  space_type?: string | null;
  location_name?: string | null;
  location_city?: string | null;
  member_name?: string | null;
  member_email?: string | null;
  booking_start_datetime?: string | null;
  booking_end_datetime?: string | null;
  subscription_start_date?: string | null;
  subscription_end_date?: string | null;
  created_at?: string | null;
  platform_fee_amount?: number | null;
  owner_net_amount?: number | null;
  commission_rate_pct?: number | null;
  failure_reason?: string | null;
};

type Invoice = {
  public_id: string;
  payment_id: number | null;
};

type Organization = { public_id: string; name: string };

type PayoutSummary = {
  gross_cents: number;
  tax_cents: number;
  refunded_cents: number;
  platform_fee_cents: number;
  owner_net_cents: number;
  succeeded_count: number;
  failed_count: number;
};

function paymentAmount(payment: Payment): number {
  if (typeof payment.amount_cents === "number") return payment.amount_cents / 100;
  return payment.amount || 0;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function titleize(value: string | null | undefined) {
  return (value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function paymentTitle(payment: Payment): string {
  if (payment.booking_id != null) return `Booking payment • ${payment.space_name || "Space"}`;
  if (payment.subscription_id != null) return `Membership charge • ${payment.space_name || "Space"}`;
  return "Payment";
}

function paymentWhere(payment: Payment): string {
  const location = [payment.location_name, payment.location_city].filter(Boolean).join(" • ");
  const type = titleize(payment.space_type);
  return [location, type].filter(Boolean).join(" • ") || payment.public_id;
}

function paymentWhen(payment: Payment): string {
  if (payment.booking_start_datetime && payment.booking_end_datetime) {
    return `${new Date(payment.booking_start_datetime).toLocaleString()} - ${new Date(payment.booking_end_datetime).toLocaleString()}`;
  }
  if (payment.subscription_start_date) {
    const end = payment.subscription_end_date
      ? ` - ${new Date(payment.subscription_end_date).toLocaleDateString()}`
      : "";
    return `Membership period: ${new Date(payment.subscription_start_date).toLocaleDateString()}${end}`;
  }
  return payment.created_at ? `Charged: ${new Date(payment.created_at).toLocaleString()}` : "";
}

export function OwnerPaymentsScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      apiFetch<Payment[]>("/api/payments", { method: "GET" }, token).catch(() => []),
      apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token).catch(() => []),
      apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token).catch(() => []),
    ])
      .then(([paymentRows, invoiceRows, orgRows]) => {
        setPayments(paymentRows);
        setInvoices(invoiceRows);
        setOrgs(orgRows);
        setOrgId((current) => current || orgRows[0]?.public_id || "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load payments"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || !orgId) {
      setPayoutSummary(null);
      return;
    }
    apiFetch<PayoutSummary>(
      `/api/owner/payout-summary?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "GET" },
      token,
    )
      .then(setPayoutSummary)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load payout summary"));
  }, [token, orgId]);

  const invoiceByPaymentId = useMemo(() => {
    const map = new Map<number, Invoice>();
    invoices.forEach((invoice) => {
      if (invoice.payment_id != null) map.set(invoice.payment_id, invoice);
    });
    return map;
  }, [invoices]);

  const stats = useMemo(() => {
    const succeeded = payments.filter((payment) => payment.status === "succeeded");
    return [
      { label: "Succeeded", value: succeeded.length.toString() },
      { label: "Failed", value: payments.filter((p) => p.status === "failed").length.toString() },
      {
        label: "Requires payment",
        value: payments.filter((p) => p.status === "requires_payment").length.toString(),
      },
      {
        label: "Processed volume",
        value: formatUsd(succeeded.reduce((sum, payment) => sum + paymentAmount(payment), 0)),
      },
    ];
  }, [payments]);

  const payoutRows: Array<[string, number]> = [
    ["Gross", payoutSummary?.gross_cents ?? 0],
    ["Tax", payoutSummary?.tax_cents ?? 0],
    ["Refunded", payoutSummary?.refunded_cents ?? 0],
    ["Platform fees", payoutSummary?.platform_fee_cents ?? 0],
    ["Owner net", payoutSummary?.owner_net_cents ?? 0],
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Payments</Text>
      <Text style={styles.subtitle}>
        Track booking and membership charges with member, space, invoice, and payout context.
      </Text>

      {orgs.length > 1 ? (
        <View style={styles.chipRow}>
          {orgs.map((org) => (
            <TouchableOpacity
              key={org.public_id}
              style={[styles.chip, orgId === org.public_id && styles.chipActive]}
              onPress={() => setOrgId(org.public_id)}
              accessibilityRole="button"
              accessibilityLabel={`Organization ${org.name}`}
            >
              <Text style={[styles.chipText, orgId === org.public_id && styles.chipTextActive]}>
                {org.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.statsRow}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <Text style={styles.mutedText}>{stat.label}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payout ledger summary</Text>
        <Text style={styles.mutedText}>Internal payment ledger, net of recorded refunds.</Text>
        <View style={styles.statsRow}>
          {payoutRows.map(([label, cents]) => (
            <View key={label} style={styles.payoutCard}>
              <Text style={styles.mutedText}>{label}</Text>
              <Text style={styles.payoutValue}>{formatUsd(cents / 100)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.mutedText}>
          Successful ledger entries: {payoutSummary?.succeeded_count ?? 0} • Failed entries:{" "}
          {payoutSummary?.failed_count ?? 0}
        </Text>
      </View>

      <View style={styles.list}>
        {payments.length === 0 && !loading ? (
          <Text style={styles.mutedText}>No booking or membership payments recorded yet.</Text>
        ) : (
          payments.map((payment) => {
            const invoice = invoiceByPaymentId.get(payment.id);
            return (
              <View key={payment.public_id} style={styles.card}>
                <Text style={styles.cardTitle}>{paymentTitle(payment)}</Text>
                <Text style={styles.mutedText}>
                  {titleize(payment.status)}
                  {payment.provider ? ` • ${payment.provider}` : ""}
                </Text>
                <Text style={styles.cardSubtitle}>
                  {payment.member_name || payment.member_email || "Member unavailable"}
                </Text>
                <Text style={styles.mutedText}>{paymentWhere(payment)}</Text>
                <Text style={styles.mutedText}>{paymentWhen(payment)}</Text>
                <Text style={styles.amount}>{formatUsd(paymentAmount(payment))}</Text>
                <Text style={styles.mutedText}>
                  Fee {formatUsd(payment.platform_fee_amount ?? 0)} • Net{" "}
                  {formatUsd(payment.owner_net_amount ?? 0)}
                  {payment.commission_rate_pct != null ? ` • ${payment.commission_rate_pct}%` : ""}
                </Text>
                {payment.failure_reason ? (
                  <Text style={styles.warning}>{payment.failure_reason}</Text>
                ) : null}
                <View style={styles.actionsRow}>
                  {invoice ? (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => navigation.navigate("Invoices")}
                      accessibilityRole="button"
                      accessibilityLabel={`Open invoice ${invoice.public_id}`}
                    >
                      <Text style={styles.secondaryButtonText}>Invoice {invoice.public_id}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {payment.status === "failed" && payment.booking_id != null ? (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => navigation.navigate("App", { screen: "Bookings" })}
                      accessibilityRole="button"
                      accessibilityLabel={`Review follow-up ${payment.public_id}`}
                    >
                      <Text style={styles.secondaryButtonText}>Review follow-up</Text>
                    </TouchableOpacity>
                  ) : null}
                  {payment.status === "failed" && payment.subscription_id != null ? (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => navigation.navigate("OwnerSettings")}
                      accessibilityRole="button"
                      accessibilityLabel={`Review billing setup ${payment.public_id}`}
                    >
                      <Text style={styles.secondaryButtonText}>Review billing setup</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
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
    color: "#111827"
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  payoutCard: {
    flexGrow: 1,
    minWidth: 110,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 4
  },
  payoutValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  list: {
    gap: 12
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 4
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827"
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#374151"
  },
  amount: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827"
  },
  warning: {
    fontSize: 12,
    color: "#991B1B"
  },
  actionsRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF"
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700"
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
