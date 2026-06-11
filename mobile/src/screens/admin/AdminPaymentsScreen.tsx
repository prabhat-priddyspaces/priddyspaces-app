import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { adminStyles as styles } from "./adminStyles";

type AdminPayment = {
  public_id: string;
  status: string;
  amount: number;
  amount_cents: number | null;
  provider: string | null;
  failure_reason: string | null;
  platform_fee_amount: number | null;
  owner_net_amount: number | null;
  member_name: string | null;
  member_email: string | null;
  organization_name: string | null;
  space_name: string | null;
  location_name: string | null;
  created_at: string | null;
};

type PaymentsResponse = {
  summary: {
    gmv: number;
    platform_earnings: number;
    owner_net: number;
    failed_payments: number;
  };
  results: AdminPayment[];
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function paymentAmount(payment: AdminPayment): number {
  if (payment.amount_cents != null) return payment.amount_cents / 100;
  return payment.amount || 0;
}

export function AdminPaymentsScreen() {
  const { token } = useAuth();
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<PaymentsResponse>("/api/admin/payments", { method: "GET" }, token)
      .then(setData)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load payments"))
      .finally(() => setLoading(false));
  }, [token]);

  const stats: Array<[string, string]> = data
    ? [
        ["GMV", currency.format(data.summary.gmv)],
        ["Platform earnings", currency.format(data.summary.platform_earnings)],
        ["Owner net", currency.format(data.summary.owner_net)],
        ["Failed payments", data.summary.failed_payments.toString()],
      ]
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Payments</Text>
      <Text style={styles.subtitle}>Platform-wide payment ledger with GMV and earnings.</Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {stats.map(([label, value]) => (
          <View key={label} style={[styles.card, { flexGrow: 1, minWidth: 140 }]}>
            <Text style={styles.mutedText}>{label}</Text>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#111827" }}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.list}>
        {(data?.results ?? []).map((payment) => (
          <View key={payment.public_id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {currency.format(paymentAmount(payment))} • {payment.status}
            </Text>
            <Text style={styles.mutedText}>
              {payment.member_name || payment.member_email || "Member"} •{" "}
              {payment.organization_name || "—"}
            </Text>
            <Text style={styles.mutedText}>
              {[payment.location_name, payment.space_name].filter(Boolean).join(" / ") || "—"}
              {payment.provider ? ` • ${payment.provider}` : ""}
            </Text>
            <Text style={styles.mutedText}>
              Fee {currency.format(payment.platform_fee_amount ?? 0)} • Net{" "}
              {currency.format(payment.owner_net_amount ?? 0)}
              {payment.created_at ? ` • ${new Date(payment.created_at).toLocaleString()}` : ""}
            </Text>
            {payment.failure_reason ? <Text style={styles.message}>{payment.failure_reason}</Text> : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
