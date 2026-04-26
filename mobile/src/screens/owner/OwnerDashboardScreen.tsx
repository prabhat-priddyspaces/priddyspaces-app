import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type BookingRequest = {
  status: string;
  estimated_amount?: number | null;
};

type Payment = { amount: number };
type Invoice = { amount: number };
type Organization = { public_id: string };

export function OwnerDashboardScreen() {
  const { token } = useAuth();
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
      <Text style={styles.title}>Owner Dashboard</Text>
      <Text style={styles.subtitle}>Revenue and occupancy snapshots.</Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 12 }} />
      ) : (
        <View style={styles.stats}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total bookings</Text>
            <Text style={styles.statValue}>{total}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Pending</Text>
            <Text style={styles.statValue}>{pending}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Payments</Text>
            <Text style={styles.statValue}>${paymentsTotal}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Invoices</Text>
            <Text style={styles.statValue}>{invoicesTotal}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Team</Text>
            <Text style={styles.statValue}>{membersTotal}</Text>
          </View>
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
