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

export function OnboardingScreen() {
  const { getToken } = useAuth();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!termsAccepted) {
      Alert.alert("Terms required", "Please accept the Terms and Privacy Policy.");
      return;
    }
    if (!fullName.trim()) {
      Alert.alert("Name required", "Please enter your full name.");
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
          role: "member",
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
        throw new Error(data.detail || "Member profile setup failed");
      }
      // AuthContext will refresh state on next render cycle
    } catch (err) {
      Alert.alert("Profile setup failed", err instanceof Error ? err.message : "Check your profile details and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Complete your profile</Text>
      <Text style={styles.subtitle}>Set up your member profile to book spaces and manage memberships.</Text>

      <Text style={styles.label}>Full name *</Text>
      <TextInput
        style={styles.input}
        placeholder="Jane Doe"
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
      />

      <Text style={styles.label}>Phone (optional)</Text>
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
          <Text style={styles.primaryButtonText}>Save member profile</Text>
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
