import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Member = {
  public_id: string;
  user_public_id: string;
  user_email: string;
  role: string;
  can_override_pricing: boolean;
};

export function OwnerTeamScreen() {
  const { token } = useAuth();
  const [orgId, setOrgId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    user_public_id: "",
    role: "staff",
    can_override_pricing: "false"
  });

  useEffect(() => {
    if (!token || !orgId) return;
    setLoading(true);
    apiFetch<Member[]>(`/api/orgs/${orgId}/members`, { method: "GET" }, token)
      .then(setMembers)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load members"))
      .finally(() => setLoading(false));
  }, [token, orgId]);

  async function addMember() {
    if (!token || !orgId) {
      setMessage("Enter organization id");
      return;
    }
    if (!form.user_public_id) {
      setMessage("Enter user public id");
      return;
    }
    await apiFetch(
      `/api/orgs/${orgId}/members`,
      {
        method: "POST",
        body: JSON.stringify({
          user_public_id: form.user_public_id,
          role: form.role,
          can_override_pricing: form.can_override_pricing === "true"
        })
      },
      token
    );
    setMessage("Member added");
    setForm({ user_public_id: "", role: "staff", can_override_pricing: "false" });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Team</Text>
      <Text style={styles.subtitle}>Manage staff access.</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <TextInput style={styles.input} placeholder="Organization public id" value={orgId} onChangeText={setOrgId} />
      <TextInput
        style={styles.input}
        placeholder="User public id"
        value={form.user_public_id}
        onChangeText={(value) => setForm({ ...form, user_public_id: value })}
      />
      <Text style={styles.sectionTitle}>Role</Text>
      <View style={styles.optionRow}>
        {["owner", "admin", "staff"].map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionButton, form.role === opt && styles.optionActive]}
            onPress={() => setForm({ ...form, role: opt })}
          >
            <Text style={styles.optionText}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.sectionTitle}>Pricing override</Text>
      <View style={styles.optionRow}>
        {["true", "false"].map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionButton, form.can_override_pricing === opt && styles.optionActive]}
            onPress={() => setForm({ ...form, can_override_pricing: opt })}
          >
            <Text style={styles.optionText}>{opt === "true" ? "Yes" : "No"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={addMember}>
        <Text style={styles.primaryButtonText}>Add member</Text>
      </TouchableOpacity>

      <View style={styles.list}>
        {members.length === 0 && !loading ? (
          <Text style={styles.empty}>No members yet.</Text>
        ) : (
          members.map((member) => (
            <View key={member.public_id} style={styles.card}>
              <Text style={styles.cardTitle}>{member.user_email}</Text>
              <Text style={styles.cardMuted}>{member.role} • {member.user_public_id}</Text>
              <Text style={styles.cardMuted}>
                Pricing override: {member.can_override_pricing ? "Yes" : "No"}
              </Text>
            </View>
          ))
        )}
      </View>
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
  message: {
    marginTop: 12,
    color: "#0F766E",
    fontSize: 12
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#FFFFFF"
  },
  primaryButton: {
    marginTop: 10,
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  sectionTitle: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: "600",
    color: "#111827"
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8
  },
  optionButton: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  optionActive: {
    borderColor: "#111827",
    backgroundColor: "#F3F4F6"
  },
  optionText: {
    fontSize: 12,
    color: "#111827",
    fontWeight: "600"
  },
  list: {
    marginTop: 16,
    gap: 12
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB"
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827"
  },
  cardMuted: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280"
  },
  empty: {
    fontSize: 12,
    color: "#6B7280"
  }
});
