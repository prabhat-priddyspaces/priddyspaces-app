import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../constants";
import { sanitizePhone } from "../lib/phone";

type Role = "member" | "owner";

export function OnboardingScreen() {
  const { getToken, refreshMe } = useAuth();

  const [role, setRole] = useState<Role>("member");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const isOwner = role === "owner";

  async function handleSubmit() {
    if (!termsAccepted) {
      Alert.alert("Terms required", "Please accept the Terms and Privacy Policy.");
      return;
    }
    if (!fullName.trim()) {
      Alert.alert("Name required", "Please enter your full name.");
      return;
    }
    if (isOwner && !phone.trim()) {
      Alert.alert("Phone required", "Please enter a phone number for your owner account.");
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/onboarding/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role,
          full_name: fullName.trim(),
          phone: phone || undefined,
          country: country || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          terms_accepted: true,
          privacy_policy_accepted: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Profile setup failed");
      }
      // Owners continue to organization setup; members land in the member tabs.
      await refreshMe();
    } catch (err) {
      Alert.alert("Profile setup failed", err instanceof Error ? err.message : "Check your profile details and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Complete your profile</Text>
      <Text style={styles.subtitle}>
        {isOwner
          ? "Set up your owner profile, then add your business details for marketplace review."
          : "Set up your member profile to book spaces and manage memberships."}
      </Text>

      <Text style={styles.label}>I want to *</Text>
      <View style={styles.roleRow}>
        <TouchableOpacity
          style={[styles.roleCard, !isOwner && styles.roleCardActive]}
          onPress={() => setRole("member")}
          accessibilityRole="button"
          accessibilityLabel="Join a workspace"
        >
          <Text style={[styles.roleTitle, !isOwner && styles.roleTitleActive]}>Join a workspace</Text>
          <Text style={styles.roleHint}>Book desks, rooms, and memberships.</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roleCard, isOwner && styles.roleCardActive]}
          onPress={() => setRole("owner")}
          accessibilityRole="button"
          accessibilityLabel="List my workspace"
        >
          <Text style={[styles.roleTitle, isOwner && styles.roleTitleActive]}>List my workspace</Text>
          <Text style={styles.roleHint}>Manage locations, spaces, and bookings.</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Full name *</Text>
      <TextInput
        style={styles.input}
        placeholder="Jane Doe"
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
      />

      <Text style={styles.label}>{isOwner ? "Phone *" : "Phone (optional)"}</Text>
      <TextInput
        style={styles.input}
        placeholder="5551234567"
        value={phone}
        onChangeText={(value) => setPhone(sanitizePhone(value))}
        keyboardType="phone-pad"
      />

      <Text style={styles.label}>Country (ISO code)</Text>
      <TextInput
        style={styles.input}
        placeholder="US"
        value={country}
        onChangeText={setCountry}
        maxLength={2}
        autoCapitalize="characters"
      />

      <TouchableOpacity
        style={styles.checkRow}
        onPress={() => setTermsAccepted(!termsAccepted)}
      >
        <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
          {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.checkLabel}>
          I agree to the Terms and Conditions and Privacy Policy.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {isOwner ? "Continue to business details" : "Save member profile"}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  title: { fontSize: 24, fontWeight: "600", color: "#111827", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#6B7280", marginBottom: 24 },
  label: { fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 6 },
  roleRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  roleCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FFF",
    gap: 4,
  },
  roleCardActive: { borderColor: "#4F46E5", backgroundColor: "#EEF2FF" },
  roleTitle: { fontSize: 13, fontWeight: "700", color: "#374151" },
  roleTitleActive: { color: "#3730A3" },
  roleHint: { fontSize: 11, color: "#6B7280" },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
    backgroundColor: "#FFF",
  },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 24 },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: "#111827", borderColor: "#111827" },
  checkmark: { color: "#FFF", fontSize: 12 },
  checkLabel: { flex: 1, fontSize: 13, color: "#6B7280", lineHeight: 20 },
  primaryButton: {
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFF", fontWeight: "600", fontSize: 15 },
});
