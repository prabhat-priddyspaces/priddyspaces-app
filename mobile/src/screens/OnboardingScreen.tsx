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
import { colors, fontSizes, radii } from "../theme";

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
        placeholderTextColor={colors.text4}
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
      />

      <Text style={styles.label}>{isOwner ? "Phone *" : "Phone (optional)"}</Text>
      <TextInput
        style={styles.input}
        placeholder="5551234567"
        placeholderTextColor={colors.text4}
        value={phone}
        onChangeText={(value) => setPhone(sanitizePhone(value))}
        keyboardType="phone-pad"
      />

      <Text style={styles.label}>Country (ISO code)</Text>
      <TextInput
        style={styles.input}
        placeholder="US"
        placeholderTextColor={colors.text4}
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
          <ActivityIndicator color={colors.white} />
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
  container: { flexGrow: 1, padding: 24, backgroundColor: colors.bg },
  title: { fontSize: fontSizes.pageTitle, fontWeight: "600", color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: fontSizes.body, color: colors.text2, marginBottom: 24 },
  label: { fontSize: fontSizes.body, fontWeight: "500", color: colors.text2, marginBottom: 6 },
  roleRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  roleCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: 12,
    backgroundColor: colors.surface,
    gap: 4,
  },
  roleCardActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  roleTitle: { fontSize: fontSizes.small, fontWeight: "700", color: colors.text2 },
  roleTitleActive: { color: colors.brandStrong },
  roleHint: { fontSize: fontSizes.caption, color: colors.text3 },
  input: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSizes.body,
    color: colors.text,
    marginBottom: 16,
    backgroundColor: colors.surface,
  },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 24 },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkmark: { color: colors.white, fontSize: fontSizes.caption },
  checkLabel: { flex: 1, fontSize: fontSizes.small, color: colors.text2, lineHeight: 20 },
  primaryButton: {
    backgroundColor: colors.brand,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.white, fontWeight: "600", fontSize: fontSizes.bodyLg },
});
