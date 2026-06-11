import { useEffect, useState } from "react";
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

type Organization = { public_id: string; name: string };

const SECTIONS: Array<{ key: string; label: string; screen: string }> = [
  { key: "campaigns", label: "Campaigns", screen: "OwnerMarketingCampaigns" },
  { key: "segments", label: "Segments", screen: "OwnerMarketingSegments" },
  { key: "templates", label: "Templates", screen: "OwnerMarketingTemplates" },
  { key: "workflows", label: "Workflows", screen: "OwnerMarketingWorkflows" },
  { key: "suppressions", label: "Suppressions", screen: "OwnerMarketingSuppressions" },
];

export function OwnerMarketingScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [stats, setStats] = useState<Record<string, number | string>>({
    templates: 0,
    segments: 0,
    campaigns: 0,
    workflows: 0,
    suppressions: 0,
    sender: "shared",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token)
      .then((list) => {
        setOrgs(list);
        if (list[0]) setOrgId((current) => current || list[0].public_id);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, [token]);

  useEffect(() => {
    if (!token || !orgId) return;
    const qs = `organization_public_id=${encodeURIComponent(orgId)}`;
    setLoading(true);
    Promise.all([
      apiFetch<unknown[]>(`/api/marketing/templates?${qs}`, { method: "GET" }, token),
      apiFetch<unknown[]>(`/api/marketing/segments?${qs}`, { method: "GET" }, token),
      apiFetch<unknown[]>(`/api/marketing/campaigns?${qs}`, { method: "GET" }, token),
      apiFetch<unknown[]>(`/api/marketing/workflows?${qs}`, { method: "GET" }, token),
      apiFetch<Array<{ status: string }>>(`/api/marketing/suppressions?${qs}`, { method: "GET" }, token),
      apiFetch<{ default_sender_lane: string }>(`/api/marketing/settings?${qs}`, { method: "GET" }, token),
    ])
      .then(([templates, segments, campaigns, workflows, suppressions, settings]) => {
        setStats({
          templates: templates.length,
          segments: segments.length,
          campaigns: campaigns.length,
          workflows: workflows.length,
          suppressions: suppressions.filter((item) => item.status === "active").length,
          sender: settings.default_sender_lane,
        });
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load marketing"))
      .finally(() => setLoading(false));
  }, [token, orgId]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Marketing</Text>
      <Text style={styles.subtitle}>Email campaigns and automations for your own members.</Text>

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
        {SECTIONS.map((section) => (
          <TouchableOpacity
            key={section.key}
            style={styles.statCard}
            onPress={() => navigation.navigate(section.screen, { orgId })}
            accessibilityRole="button"
            accessibilityLabel={`Open ${section.label}`}
          >
            <Text style={styles.mutedText}>{section.label}</Text>
            <Text style={styles.statValue}>{String(stats[section.key] ?? 0)}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.statCard}
          onPress={() => navigation.navigate("OwnerMarketingSettings", { orgId })}
          accessibilityRole="button"
          accessibilityLabel="Open Sender settings"
        >
          <Text style={styles.mutedText}>Sender</Text>
          <Text style={styles.statValue}>{String(stats.sender).replace(/_/g, " ")}</Text>
        </TouchableOpacity>
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
    minWidth: 150,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 4
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textTransform: "capitalize"
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
