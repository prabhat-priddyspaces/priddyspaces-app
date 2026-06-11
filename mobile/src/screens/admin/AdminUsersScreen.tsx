import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { adminStyles as styles } from "./adminStyles";

type AdminUser = {
  public_id: string;
  email: string;
  name: string;
  app_role: string | null;
  platform_role: string | null;
  is_active: boolean;
  email_verified: boolean;
  organization_count: number;
  bookings: number;
  payments: number;
  subscriptions: number;
};

type UsersResponse = {
  results: AdminUser[];
  total: number;
};

const ROLE_FILTERS = ["all", "member", "owner", "platform", "unassigned"];
const STATUS_FILTERS: Array<[string, string]> = [
  ["", "Any status"],
  ["active", "Active"],
  ["inactive", "Inactive"],
];

function chipStyle(active: boolean) {
  return [
    { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#FFFFFF" },
    active && { borderColor: "#4F46E5", backgroundColor: "#EEF2FF" },
  ];
}

function chipTextStyle(active: boolean) {
  return { color: active ? "#3730A3" : "#4B5563", fontSize: 12, fontWeight: "700" as const, textTransform: "capitalize" as const };
}

export function AdminUsersScreen() {
  const { token } = useAuth();
  const [data, setData] = useState<UsersResponse | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("");
  const [invite, setInvite] = useState({ email: "", first_name: "", last_name: "", phone: "", company_name: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (role !== "all") params.set("role", role);
    if (status) params.set("status", status);
    const result = await apiFetch<UsersResponse>(`/api/admin/users?${params.toString()}`, { method: "GET" }, token);
    setData(result);
  }, [token, query, role, status]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }, [load]);

  async function inviteOwner() {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(
        "/api/admin/owner-invites",
        {
          method: "POST",
          body: JSON.stringify({
            email: invite.email,
            first_name: invite.first_name || undefined,
            last_name: invite.last_name || undefined,
            phone: invite.phone || undefined,
            company_name: invite.company_name || undefined,
          }),
        },
        token,
      );
      setInvite({ email: "", first_name: "", last_name: "", phone: "", company_name: "" });
      setMessage("Owner invite sent.");
      setRole("owner");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to send owner invite");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Users</Text>
      <Text style={styles.subtitle}>Every account on the platform with role and activity context.</Text>

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search users"
          style={styles.input}
          placeholder="Search by name or email"
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ROLE_FILTERS.map((option) => (
          <TouchableOpacity
            key={option}
            style={chipStyle(role === option)}
            onPress={() => setRole(option)}
            accessibilityRole="button"
            accessibilityLabel={`Role ${option}`}
          >
            <Text style={chipTextStyle(role === option)}>{option}</Text>
          </TouchableOpacity>
        ))}
        {STATUS_FILTERS.map(([value, label]) => (
          <TouchableOpacity
            key={label}
            style={chipStyle(status === value)}
            onPress={() => setStatus(value)}
            accessibilityRole="button"
            accessibilityLabel={`Status ${label}`}
          >
            <Text style={chipTextStyle(status === value)}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={message === "Owner invite sent." ? { color: "#047857", fontSize: 12, fontWeight: "700" } : styles.message}>
          {message}
        </Text>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Invite owner</Text>
        <TextInput
          accessibilityLabel="Owner invite email"
          style={styles.input}
          placeholder="owner@example.com"
          placeholderTextColor="#9CA3AF"
          value={invite.email}
          onChangeText={(email) => setInvite({ ...invite, email })}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="Invite first name"
            style={styles.input}
            placeholder="First name"
            placeholderTextColor="#9CA3AF"
            value={invite.first_name}
            onChangeText={(first_name) => setInvite({ ...invite, first_name })}
          />
          <TextInput
            accessibilityLabel="Invite company"
            style={styles.input}
            placeholder="Company"
            placeholderTextColor="#9CA3AF"
            value={invite.company_name}
            onChangeText={(company_name) => setInvite({ ...invite, company_name })}
          />
        </View>
        <TouchableOpacity
          style={styles.searchButton}
          onPress={inviteOwner}
          disabled={!invite.email}
          accessibilityRole="button"
          accessibilityLabel="Send owner invite"
        >
          <Text style={styles.searchButtonText}>Send invite</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Results ({data?.total ?? 0})</Text>
      <View style={styles.list}>
        {(data?.results ?? []).map((user) => (
          <View key={user.public_id} style={styles.card}>
            <Text style={styles.cardTitle}>{user.name || user.email}</Text>
            <Text style={styles.mutedText}>{user.email}</Text>
            <Text style={styles.mutedText}>
              {user.platform_role || user.app_role || "unassigned"} •{" "}
              {user.is_active ? "active" : "inactive"} •{" "}
              {user.email_verified ? "verified" : "unverified"}
            </Text>
            <Text style={styles.mutedText}>
              {user.organization_count} orgs • {user.bookings} bookings • {user.payments} payments •{" "}
              {user.subscriptions} subscriptions
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
