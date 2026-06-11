import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Organization = { public_id: string; name: string };

type MemberStats = {
  total_bookings: number;
  confirmed_bookings: number;
  canceled_bookings: number;
  no_shows: number;
  open_requests: number;
  total_revenue_cents: number;
  active_subscriptions: number;
  first_booking_at: string | null;
  last_booking_at: string | null;
};

export type MemberListItem = {
  user_public_id: string;
  organization_public_id: string;
  name: string;
  email: string;
  status: string;
  phone: string | null;
  company_name: string | null;
  tags: string[];
  stats: MemberStats;
};

const MEMBER_STATUSES = ["lead", "active", "churned", "blocked"] as const;
type StatusFilter = "all" | (typeof MEMBER_STATUSES)[number];

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export function OwnerMembersScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token)
      .then((list) => {
        setOrgs(list);
        setOrgId((current) => current || list[0]?.public_id || "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, [token]);

  const load = useCallback(async () => {
    if (!token || !orgId) return;
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams();
      params.set("organization_public_id", orgId);
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      const result = await apiFetch<MemberListItem[]>(
        `/api/owner/members?${params.toString()}`,
        { method: "GET" },
        token,
      );
      setMembers(result);
    } catch (err) {
      setMembers([]);
      setMessage(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [token, orgId, search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: members.length };
    for (const member of members) {
      out[member.status] = (out[member.status] ?? 0) + 1;
    }
    return out;
  }, [members]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Members</Text>
      <Text style={styles.subtitle}>
        Anyone who has booked, requested, or subscribed to a space at your locations.
      </Text>

      {orgs.length > 1 ? (
        <View style={styles.chipRow}>
          {orgs.map((org) => (
            <Chip
              key={org.public_id}
              label={org.name}
              active={orgId === org.public_id}
              accessibilityLabel={`Organization ${org.name}`}
              onPress={() => setOrgId(org.public_id)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search members"
          style={styles.input}
          placeholder="Search by name or email"
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={load}
          disabled={!orgId}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.chipRow}>
        {(["all", ...MEMBER_STATUSES] as StatusFilter[]).map((value) => (
          <Chip
            key={value}
            label={`${value} (${counts[value] ?? 0})`}
            active={statusFilter === value}
            accessibilityLabel={`Status ${value}`}
            onPress={() => setStatusFilter(value)}
          />
        ))}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.list}>
        {members.length === 0 && !loading ? (
          <Text style={styles.mutedText}>
            {orgId
              ? "No members have been added to this organization yet."
              : "Select an organization to view members."}
          </Text>
        ) : (
          members.map((member) => (
            <TouchableOpacity
              key={member.user_public_id}
              style={styles.card}
              onPress={() =>
                navigation.navigate("OwnerMemberDetail", {
                  publicId: member.user_public_id,
                  orgId: member.organization_public_id,
                  name: member.name,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open member ${member.name}`}
            >
              <Text style={styles.cardTitle}>{member.name}</Text>
              {member.company_name ? <Text style={styles.mutedText}>{member.company_name}</Text> : null}
              <Text style={styles.cardSubtitle}>{member.email}</Text>
              <Text style={styles.mutedText}>
                {member.status} • {member.stats.confirmed_bookings} confirmed /{" "}
                {member.stats.total_bookings} total • {formatCents(member.stats.total_revenue_cents)}
              </Text>
              <Text style={styles.mutedText}>Last booking {formatDate(member.stats.last_booking_at)}</Text>
              {member.tags.length > 0 ? (
                <Text style={styles.tagsText}>{member.tags.join(" • ")}</Text>
              ) : null}
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F9FAFB"
  },
  container: {
    padding: 20,
    gap: 12
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
    paddingVertical: 7,
    backgroundColor: "#FFFFFF"
  },
  chipActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF"
  },
  chipText: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  chipTextActive: {
    color: "#3730A3"
  },
  searchRow: {
    flexDirection: "row",
    gap: 8
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF"
  },
  searchButton: {
    borderRadius: 10,
    backgroundColor: "#4F46E5",
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700"
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
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#374151"
  },
  tagsText: {
    fontSize: 12,
    color: "#3730A3",
    fontWeight: "600"
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
