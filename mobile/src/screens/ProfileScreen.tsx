import { useEffect, useState } from "react";
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

import { apiFetch } from "../lib/api";
import { sanitizePhone } from "../lib/phone";
import { useAuth } from "../context/AuthContext";

type MeProfile = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company_name: string | null;
};

export function ProfileScreen() {
  const { me, token, signOut } = useAuth();
  const navigation = useNavigation<any>();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    company_name: "",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    apiFetch<MeProfile>("/api/me", { method: "GET" }, token)
      .then((profile) => {
        setForm({
          first_name: profile.first_name || "",
          last_name: profile.last_name || "",
          phone: profile.phone || "",
          company_name: profile.company_name || "",
        });
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load profile"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    setMessage("");
    try {
      await apiFetch(
        "/api/me",
        {
          method: "PATCH",
          body: JSON.stringify({
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            phone: form.phone,
            company_name: form.company_name.trim(),
          }),
        },
        token,
      );
      setMessage("Profile saved");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          Your name, phone, and company. These appear to coworking owners when you book.
        </Text>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={message === "Profile saved" ? styles.successMessage : styles.message}>{message}</Text>
      ) : null}

      <View style={styles.section}>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.staticValue}>{me?.email || "unknown"}</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Role</Text>
          <Text style={styles.staticValue}>{me?.platform_role || me?.role || "unknown"}</Text>
        </View>
        <View style={styles.row}>
          <Field
            label="First name"
            value={form.first_name}
            onChange={(first_name) => setForm({ ...form, first_name })}
          />
          <Field
            label="Last name"
            value={form.last_name}
            onChange={(last_name) => setForm({ ...form, last_name })}
          />
        </View>
        <Field
          label="Phone"
          value={form.phone}
          onChange={(phone) => setForm({ ...form, phone: sanitizePhone(phone) })}
          keyboardType="number-pad"
          placeholder="5551234567"
        />
        <Field
          label="Company name"
          value={form.company_name}
          onChange={(company_name) => setForm({ ...form, company_name })}
          placeholder="Optional"
        />
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleSave}
          disabled={saving || loading}
          accessibilityRole="button"
          accessibilityLabel="Save profile"
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save profile</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("Notifications")}
          accessibilityRole="button"
          accessibilityLabel="Notification settings"
        >
          <Text style={styles.secondaryButtonText}>Notification settings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={signOut}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Text style={styles.logoutButtonText}>Log out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboardType,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: "number-pad";
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        style={styles.input}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB"
  },
  content: {
    padding: 20,
    gap: 14
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
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 12
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  field: {
    gap: 5,
    flexGrow: 1,
    minWidth: 120
  },
  label: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "700"
  },
  staticValue: {
    fontSize: 14,
    color: "#6B7280"
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF"
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 13,
    backgroundColor: "#4F46E5"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingVertical: 11,
    backgroundColor: "#FFFFFF"
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "700"
  },
  logoutButton: {
    alignItems: "center",
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 10
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  message: {
    color: "#DC2626",
    fontSize: 12
  },
  successMessage: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "700"
  }
});
