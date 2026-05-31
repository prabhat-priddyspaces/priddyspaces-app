import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../constants";

export function OrgOnboardingScreen() {
  const { getToken } = useAuth();

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter your organization name.");
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/onboarding/organization`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          industry: industry.trim() || undefined,
          website: website.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Workspace organization setup failed");
      }
      // AuthContext will refresh state on next render cycle
    } catch (err) {
      Alert.alert("Organization setup failed", err instanceof Error ? err.message : "Check the organization details and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Set up your organization</Text>
      <Text style={styles.subtitle}>Tell us about the business that hosts your rooms, desks, and memberships.</Text>

      <Text style={styles.label}>Organization name *</Text>
      <TextInput
        style={styles.input}
        placeholder="Acme Coworking"
        value={name}
        onChangeText={setName}
        autoComplete="organization"
      />

      <Text style={styles.label}>Industry (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Coworking, Real Estate"
        value={industry}
        onChangeText={setIndustry}
      />

      <Text style={styles.label}>Website (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="https://example.com"
        value={website}
        onChangeText={setWebsite}
        keyboardType="url"
        autoCapitalize="none"
      />

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Create organization</Text>
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
  primaryButton: {
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: { color: "#FFF", fontWeight: "600", fontSize: 15 },
});
