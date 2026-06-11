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

type TeamMember = {
  public_id: string;
  email: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  is_active: boolean;
};

const ROLES = ["support", "admin", "superadmin"];

export function AdminPlatformTeamScreen() {
  const { token, me } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { role: string; is_active: boolean }>>({});
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("support");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const isSuperadmin = me?.platform_role === "superadmin";

  const load = useCallback(async () => {
    if (!token) return;
    const result = await apiFetch<TeamMember[]>("/api/admin/platform-team", { method: "GET" }, token);
    setMembers(result);
    setDrafts(
      Object.fromEntries(
        result.map((member) => [member.public_id, { role: member.role, is_active: member.is_active }]),
      ),
    );
  }, [token]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load platform team"))
      .finally(() => setLoading(false));
  }, [load]);

  async function invite() {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(
        "/api/admin/platform-team",
        { method: "POST", body: JSON.stringify({ email, role }) },
        token,
      );
      setEmail("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Invite failed");
    }
  }

  async function update(member: TeamMember) {
    if (!token) return;
    const draft = drafts[member.public_id];
    if (!draft) return;
    setMessage("");
    try {
      await apiFetch(
        `/api/admin/platform-team/${member.public_id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            first_name: member.first_name ?? "",
            last_name: member.last_name ?? "",
            role: draft.role,
            is_active: draft.is_active,
          }),
        },
        token,
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function remove(member: TeamMember) {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(`/api/admin/platform-team/${member.public_id}`, { method: "DELETE" }, token);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Remove failed");
    }
  }

  if (!isSuperadmin) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <Text style={styles.title}>Platform team</Text>
        <Text style={styles.mutedText}>Only superadmins can manage platform team accounts.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Platform team</Text>
      <Text style={styles.subtitle}>Invite and manage superadmin, admin, and support accounts.</Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Invite member</Text>
        <TextInput
          accessibilityLabel="Invite email"
          style={styles.input}
          placeholder="email@example.com"
          placeholderTextColor="#9CA3AF"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ROLES.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#FFFFFF" },
                role === option && { borderColor: "#4F46E5", backgroundColor: "#EEF2FF" },
              ]}
              onPress={() => setRole(option)}
              accessibilityRole="button"
              accessibilityLabel={`Invite role ${option}`}
            >
              <Text style={{ color: role === option ? "#3730A3" : "#4B5563", fontSize: 12, fontWeight: "700", textTransform: "capitalize" }}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.searchButton}
          onPress={invite}
          accessibilityRole="button"
          accessibilityLabel="Invite member"
        >
          <Text style={styles.searchButtonText}>Invite</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.list}>
        {members.map((member) => {
          const draft = drafts[member.public_id] || { role: member.role, is_active: member.is_active };
          return (
            <View key={member.public_id} style={styles.card}>
              <Text style={styles.cardTitle}>{member.name || member.email}</Text>
              <Text style={styles.mutedText}>{member.email}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {ROLES.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#FFFFFF" },
                      draft.role === option && { borderColor: "#4F46E5", backgroundColor: "#EEF2FF" },
                    ]}
                    onPress={() =>
                      setDrafts((current) => ({
                        ...current,
                        [member.public_id]: { ...draft, role: option },
                      }))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Set ${member.public_id} role ${option}`}
                  >
                    <Text style={{ color: draft.role === option ? "#3730A3" : "#4B5563", fontSize: 12, fontWeight: "700", textTransform: "capitalize" }}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#FFFFFF" },
                    draft.is_active && { borderColor: "#047857", backgroundColor: "#ECFDF5" },
                  ]}
                  onPress={() =>
                    setDrafts((current) => ({
                      ...current,
                      [member.public_id]: { ...draft, is_active: !draft.is_active },
                    }))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Toggle active ${member.public_id}`}
                >
                  <Text style={{ color: draft.is_active ? "#047857" : "#4B5563", fontSize: 12, fontWeight: "700" }}>
                    {draft.is_active ? "Active" : "Inactive"}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={styles.searchButton}
                  onPress={() => update(member)}
                  accessibilityRole="button"
                  accessibilityLabel={`Save ${member.public_id}`}
                >
                  <Text style={styles.searchButtonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.searchButton, { backgroundColor: "#DC2626" }]}
                  onPress={() => remove(member)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${member.public_id}`}
                >
                  <Text style={styles.searchButtonText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
