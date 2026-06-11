import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { adminStyles as styles } from "./adminStyles";

type AssistantQuality = {
  metrics: Record<string, number>;
  low_rated_conversations: Array<{ conversation_public_id: string | null; reason: string | null }>;
  missing_policy_categories: Array<{ category: string; count: number }>;
  reliability_events: Array<{ kind: string; count: number }>;
  tool_failure_rates: Array<{ tool: string; failures: number }>;
  usage_by_persona: Array<{ audience: string; conversations: number }>;
};

export function AdminAssistantQualityScreen() {
  const { token } = useAuth();
  const [data, setData] = useState<AssistantQuality | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<AssistantQuality>("/api/admin/assistant-quality", { method: "GET" }, token)
      .then(setData)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load assistant quality"))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Assistant Quality</Text>
      <Text style={styles.subtitle}>Conversation quality, tool reliability, policy gaps, and usage.</Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {data ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {Object.entries(data.metrics).map(([key, value]) => (
              <View key={key} style={[styles.card, { flexGrow: 1, minWidth: 130 }]}>
                <Text style={[styles.mutedText, { textTransform: "capitalize" }]}>
                  {key.replace(/_/g, " ")}
                </Text>
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#111827" }}>{value}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Reliability events</Text>
          <View style={styles.list}>
            {data.reliability_events.map((event) => (
              <View key={event.kind} style={styles.card}>
                <Text style={styles.cardTitle}>{event.kind.replace(/_/g, " ")}</Text>
                <Text style={styles.mutedText}>{event.count} events</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Tool failures</Text>
          <View style={styles.list}>
            {data.tool_failure_rates.map((tool) => (
              <View key={tool.tool} style={styles.card}>
                <Text style={styles.cardTitle}>{tool.tool}</Text>
                <Text style={styles.mutedText}>{tool.failures} failures</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Missing policy categories</Text>
          <View style={styles.list}>
            {data.missing_policy_categories.map((item) => (
              <View key={item.category} style={styles.card}>
                <Text style={styles.cardTitle}>{item.category.replace(/_/g, " ")}</Text>
                <Text style={styles.mutedText}>{item.count} unanswered</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Usage by persona</Text>
          <View style={styles.list}>
            {data.usage_by_persona.map((item) => (
              <View key={item.audience} style={styles.card}>
                <Text style={styles.cardTitle}>{item.audience}</Text>
                <Text style={styles.mutedText}>{item.conversations} conversations</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Low-rated conversations</Text>
          <View style={styles.list}>
            {data.low_rated_conversations.length === 0 ? (
              <Text style={styles.mutedText}>None.</Text>
            ) : (
              data.low_rated_conversations.map((item, index) => (
                <View key={item.conversation_public_id || String(index)} style={styles.card}>
                  <Text style={styles.cardTitle}>{item.conversation_public_id || "Conversation"}</Text>
                  <Text style={styles.mutedText}>{item.reason || "No reason recorded"}</Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
