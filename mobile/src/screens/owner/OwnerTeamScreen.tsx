import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Member = {
  public_id: string;
  user_public_id: string;
  user_email: string;
  role: string;
  can_override_pricing: boolean;
  receives_new_booking_email?: boolean;
  receives_booking_start_push: boolean;
  receives_booking_end_push: boolean;
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
    can_override_pricing: "false",
    receives_booking_start_push: true,
    receives_booking_end_push: true,
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
          can_override_pricing: form.can_override_pricing === "true",
          receives_booking_start_push: form.receives_booking_start_push,
          receives_booking_end_push: form.receives_booking_end_push,
        })
      },
      token
    );
    setMessage("Member added");
    setForm({
      user_public_id: "",
      role: "staff",
      can_override_pricing: "false",
      receives_booking_start_push: true,
      receives_booking_end_push: true,
    });
  }

  async function toggleMemberPreference(member: Member, field: "receives_booking_start_push" | "receives_booking_end_push") {
    if (!token || !orgId) return;
    const nextValue = !member[field];
    setMembers((current) =>
      current.map((item) => (item.public_id === member.public_id ? { ...item, [field]: nextValue } : item))
    );
    try {
      await apiFetch<Member>(
        `/api/orgs/${orgId}/members/${member.public_id}`,
        { method: "PATCH", body: JSON.stringify({ [field]: nextValue }) },
        token
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update notifications");
      apiFetch<Member[]>(`/api/orgs/${orgId}/members`, { method: "GET" }, token)
        .then(setMembers)
        .catch(() => null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Team</Text>
      <Text style={styles.subtitle}>Manage staff roles, pricing override access, and booking reminders.</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <TextInput style={styles.input} placeholder="Organization public ID" value={orgId} onChangeText={setOrgId} />
      <TextInput
        style={styles.input}
        placeholder="Team user public ID"
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
      <Text style={styles.sectionTitle}>Booking reminders</Text>
      <View style={styles.toggleRow}>
        <Text style={styles.cardMuted}>Start reminder push</Text>
        <Switch
          value={form.receives_booking_start_push}
          onValueChange={(value) => setForm({ ...form, receives_booking_start_push: value })}
        />
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.cardMuted}>Meeting-room end reminder push</Text>
        <Switch
          value={form.receives_booking_end_push}
          onValueChange={(value) => setForm({ ...form, receives_booking_end_push: value })}
        />
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={addMember}>
        <Text style={styles.primaryButtonText}>Add team member</Text>
      </TouchableOpacity>

      <View style={styles.list}>
        {members.length === 0 && !loading ? (
          <Text style={styles.empty}>No team members assigned yet.</Text>
        ) : (
          members.map((member) => (
            <View key={member.public_id} style={styles.card}>
              <Text style={styles.cardTitle}>{member.user_email}</Text>
              <Text style={styles.cardMuted}>{member.role} • {member.user_public_id}</Text>
              <Text style={styles.cardMuted}>
                Pricing override: {member.can_override_pricing ? "Yes" : "No"}
              </Text>
              <View style={styles.toggleRow}>
                <Text style={styles.cardMuted}>Start reminder push</Text>
                <Switch
                  testID={`team-start-push-${member.public_id}`}
                  value={member.receives_booking_start_push}
                  onValueChange={() => toggleMemberPreference(member, "receives_booking_start_push")}
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.cardMuted}>Meeting-room end reminder push</Text>
                <Switch
                  testID={`team-end-push-${member.public_id}`}
                  value={member.receives_booking_end_push}
                  onValueChange={() => toggleMemberPreference(member, "receives_booking_end_push")}
                />
              </View>
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
  toggleRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  empty: {
    fontSize: 12,
    color: "#6B7280"
  }
});
