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

type MemberRecord = {
  public_id: string;
  email: string;
  name: string;
  is_active: boolean;
  email_verified: boolean;
  bookings: number;
  payments: number;
  subscriptions: number;
};

type Filter = "all" | "subscribed" | "not_subscribed" | "failed_payments";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "subscribed", label: "Subscribed" },
  { value: "not_subscribed", label: "Not subscribed" },
  { value: "failed_payments", label: "Failed payments" },
];

export function AdminMembersScreen() {
  const { token } = useAuth();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [query, setQuery] = useState("");
  const [signupFrom, setSignupFrom] = useState("");
  const [signupTo, setSignupTo] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (signupFrom) params.set("signup_from", signupFrom);
    if (signupTo) params.set("signup_to", signupTo);
    if (filter === "subscribed") params.set("has_subscription", "true");
    else if (filter === "not_subscribed") params.set("has_subscription", "false");
    else if (filter === "failed_payments") params.set("has_failed_payments", "true");
    const qs = params.toString();
    const path = qs ? `/api/admin/members?${qs}` : "/api/admin/members";
    try {
      const result = await apiFetch<MemberRecord[]>(path, { method: "GET" }, token);
      setMembers(result);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load members");
    }
  }, [token, query, signupFrom, signupTo, filter]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Members</Text>
      <Text style={styles.subtitle}>All member accounts across the platform.</Text>

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search members"
          style={styles.input}
          placeholder="Search by name or email"
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>
      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Signup from"
          style={styles.input}
          placeholder="Signup from YYYY-MM-DD"
          placeholderTextColor="#9CA3AF"
          value={signupFrom}
          onChangeText={setSignupFrom}
          autoCapitalize="none"
        />
        <TextInput
          accessibilityLabel="Signup to"
          style={styles.input}
          placeholder="Signup to YYYY-MM-DD"
          placeholderTextColor="#9CA3AF"
          value={signupTo}
          onChangeText={setSignupTo}
          autoCapitalize="none"
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {FILTERS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#FFFFFF" },
              filter === option.value && { borderColor: "#4F46E5", backgroundColor: "#EEF2FF" },
            ]}
            onPress={() => setFilter(option.value)}
            accessibilityRole="button"
            accessibilityLabel={`Filter ${option.label}`}
          >
            <Text style={{ color: filter === option.value ? "#3730A3" : "#4B5563", fontSize: 12, fontWeight: "700" }}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.list}>
        {members.length === 0 && !loading ? <Text style={styles.mutedText}>No members.</Text> : null}
        {members.map((member) => (
          <View key={member.public_id} style={styles.card}>
            <Text style={styles.cardTitle}>{member.name || member.email}</Text>
            <Text style={styles.mutedText}>{member.email}</Text>
            <Text style={styles.mutedText}>
              {member.is_active ? "Active" : "Inactive"} •{" "}
              {member.email_verified ? "Email verified" : "Email unverified"}
            </Text>
            <Text style={styles.mutedText}>
              {member.bookings} bookings • {member.payments} payments • {member.subscriptions}{" "}
              subscriptions
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
