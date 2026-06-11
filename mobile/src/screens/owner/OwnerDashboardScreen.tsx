import { useCallback, useEffect, useState } from "react";
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

type BookingRequest = {
  status: string;
  estimated_amount?: number | string | null;
  start_datetime?: string | null;
};

type Payment = {
  amount?: number;
  amount_cents?: number;
  refunded_amount_cents?: number;
  status?: string;
  created_at?: string;
};
type Invoice = { amount: number };
type Organization = { public_id: string };
type Subscription = { status: string };
type CalendarResponse = { events?: { kind: string }[] } | null;
type Location = { public_id: string; name: string };
type Space = { availability_status?: string };

function paymentAmount(payment: Payment): number {
  if (typeof payment.amount_cents === "number") return payment.amount_cents / 100;
  return payment.amount || 0;
}

function paymentRefundedAmount(payment: Payment): number {
  return typeof payment.refunded_amount_cents === "number"
    ? payment.refunded_amount_cents / 100
    : payment.status === "refunded"
      ? paymentAmount(payment)
      : 0;
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2).replace(/\.00$/, "")}`;
}

function StatCard({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  if (!onPress) {
    return (
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    );
  }
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
  const [approved, setApproved] = useState(0);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [invoicesTotal, setInvoicesTotal] = useState(0);
  const [membersTotal, setMembersTotal] = useState(0);
  const [activeMemberships, setActiveMemberships] = useState(0);
  const [occupancy, setOccupancy] = useState<number | null>(null);
  const [todayBookings, setTodayBookings] = useState(0);
  const [hasLocations, setHasLocations] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const calendarParams = new URLSearchParams();
      calendarParams.set("start", todayStart.toISOString());
      calendarParams.set("end", todayEnd.toISOString());
      calendarParams.set("include", "bookings,requests,subscriptions");

      const [requests, payments, invoices, orgs, subscriptions, calendar] = await Promise.all([
        apiFetch<BookingRequest[]>("/api/booking-requests", { method: "GET" }, token).catch(() => []),
        apiFetch<Payment[]>("/api/payments", { method: "GET" }, token).catch(() => []),
        apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token).catch(() => []),
        apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token).catch(() => []),
        apiFetch<Subscription[]>("/api/subscriptions", { method: "GET" }, token).catch(() => []),
        apiFetch<CalendarResponse>(
          `/api/owner/calendar?${calendarParams.toString()}`,
          { method: "GET" },
          token,
        ).catch(() => null),
      ]);

      setTotal(requests.length);
      setPending(requests.filter((b) => b.status === "requested").length);
      setApproved(requests.filter((b) => b.status === "approved").length);
      setPaymentsTotal(
        payments.filter((p) => p.status === "succeeded").reduce((sum, p) => sum + paymentAmount(p), 0),
      );
      setMonthRevenue(
        payments
          .filter((payment) => {
            if (payment.status !== "succeeded" || !payment.created_at) return false;
            const createdAt = new Date(payment.created_at);
            return (
              createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear()
            );
          })
          .reduce((sum, payment) => sum + paymentAmount(payment) - paymentRefundedAmount(payment), 0),
      );
      setInvoicesTotal(invoices.length);
      setActiveMemberships(
        subscriptions.filter((s) => ["active", "trialing", "past_due", "canceling"].includes(s.status))
          .length,
      );
      setTodayBookings(
        calendar?.events
          ? calendar.events.filter((event) => event.kind === "booking").length
          : requests.filter((r) => {
              if (!r.start_datetime) return false;
              const start = new Date(r.start_datetime);
              return (
                start.getDate() === now.getDate() &&
                start.getMonth() === now.getMonth() &&
                start.getFullYear() === now.getFullYear()
              );
            }).length,
      );

      if (orgs.length === 0) {
        setMembersTotal(0);
        setOccupancy(null);
        setHasLocations(false);
        return;
      }

      const orgId = orgs[0].public_id;
      const [members, locations] = await Promise.all([
        apiFetch<unknown[]>(`/api/orgs/${orgId}/members`, { method: "GET" }, token).catch(() => []),
        apiFetch<Location[]>(
          `/api/locations?organization_public_id=${orgId}`,
          { method: "GET" },
          token,
        ).catch(() => []),
      ]);
      setMembersTotal(members.length);
      setHasLocations(locations.length > 0);

      const spacesByLocation = await Promise.all(
        locations.map((location) =>
          apiFetch<Space[]>(`/api/locations/${location.public_id}/spaces`, { method: "GET" }, token).catch(
            () => [],
          ),
        ),
      );
      const totalSpaces = spacesByLocation.reduce((sum, spaces) => sum + spaces.length, 0);
      const occupiedSpaces = spacesByLocation.reduce(
        (sum, spaces) => sum + spaces.filter((space) => space.availability_status !== "available").length,
        0,
      );
      setOccupancy(totalSpaces === 0 ? null : Math.round((occupiedSpaces / totalSpaces) * 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Owner overview</Text>
      <Text style={styles.subtitle}>Booking requests, owner revenue, invoices, and team access.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 12 }} />
      ) : (
        <>
          {!hasLocations ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No locations yet</Text>
              <Text style={styles.emptyText}>
                Create your first location to track occupancy, bookings, and revenue.
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => navigation.navigate("OwnerNewLocation")}
                accessibilityRole="button"
                accessibilityLabel="Add location"
              >
                <Text style={styles.emptyButtonText}>Add location</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={styles.stats}>
            <StatCard
              label="MTD revenue"
              value={formatMoney(monthRevenue)}
              onPress={() => navigation.navigate("OwnerPayments")}
            />
            <StatCard
              label="Occupancy"
              value={occupancy === null ? "—" : `${occupancy}%`}
              onPress={() => navigation.navigate("Locations")}
            />
            <StatCard
              label="Approved bookings"
              value={approved.toString()}
              onPress={() => navigation.navigate("Bookings")}
            />
            <StatCard label="Active memberships" value={activeMemberships.toString()} />
            <StatCard
              label="Today's bookings"
              value={todayBookings.toString()}
              onPress={() => navigation.navigate("Bookings")}
            />
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
              value={formatMoney(paymentsTotal)}
              onPress={() => navigation.navigate("OwnerPayments")}
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
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1
  },
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
  error: {
    marginTop: 12,
    color: "#DC2626",
    fontSize: 12
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
  },
  emptyCard: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    gap: 8
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  emptyText: {
    fontSize: 13,
    color: "#6B7280"
  },
  emptyButton: {
    alignSelf: "flex-start",
    borderRadius: 10,
    backgroundColor: "#4F46E5",
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  emptyButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700"
  }
});
