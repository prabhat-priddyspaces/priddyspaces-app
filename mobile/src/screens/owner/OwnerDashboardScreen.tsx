import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type BookingRequest = {
  status: string;
  estimated_amount?: number | null;
};

type Payment = { amount: number };
type Invoice = { amount: number };
type Organization = { public_id: string };

function StatCard({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.statCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${label}`}
    >
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </TouchableOpacity>
  );
}

export function OwnerDashboardScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(0);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [invoicesTotal, setInvoicesTotal] = useState(0);
  const [membersTotal, setMembersTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      apiFetch<BookingRequest[]>("/api/booking-requests", { method: "GET" }, token).catch(() => []),
      apiFetch<Payment[]>("/api/payments", { method: "GET" }, token).catch(() => []),
      apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token).catch(() => []),
      apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token).catch(() => [])
    ])
      .then(async ([requests, payments, invoices, orgs]) => {
        setTotal(requests.length);
        setPending(requests.filter((b) => b.status === "requested").length);
        setPaymentsTotal(payments.reduce((sum, p) => sum + (p.amount || 0), 0));
        setInvoicesTotal(invoices.length);
        if (orgs.length > 0) {
          const members = await apiFetch<any[]>(`/api/orgs/${orgs[0].public_id}/members`, { method: "GET" }, token).catch(
            () => []
          );
          setMembersTotal(members.length);
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Owner overview</Text>
      <Text style={styles.subtitle}>Booking requests, owner revenue, invoices, and team access.</Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 12 }} />
      ) : (
        <View style={styles.stats}>
          <StatCard
            label="Booking requests"
            value={total.toString()}
            onPress={() => navigation.navigate("Bookings")}
          />
          <StatCard
            label="Pending requests"
            value={pending.toString()}
            onPress={() => navigation.navigate("Bookings")}
          />
          <StatCard
            label="Payment volume"
            value={`$${paymentsTotal}`}
            onPress={() => navigation.navigate("Payments")}
          />
          <StatCard
            label="Invoice count"
            value={invoicesTotal.toString()}
            onPress={() => navigation.navigate("Invoices")}
          />
          <StatCard
            label="Team members"
            value={membersTotal.toString()}
            onPress={() => navigation.navigate("OwnerTeam")}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827"
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280"
  },
  stats: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  statCard: {
    minWidth: 140,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB"
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280"
  },
  statValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "600",
    color: "#111827"
  }
});
