import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useAuth } from "../context/AuthContext";

export function RegisterScreen() {
  const { signUp, loading } = useAuth();
  const [form, setForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "customer" as "owner" | "customer"
  });

  async function handleRegister() {
    try {
      await signUp(form);
    } catch (err) {
      Alert.alert("Registration failed", err instanceof Error ? err.message : "Try again.");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.subtitle}>Join as an owner or customer</Text>
      <TextInput
        style={styles.input}
        placeholder="First name"
        value={form.first_name}
        onChangeText={(value) => setForm({ ...form, first_name: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Last name"
        value={form.last_name}
        onChangeText={(value) => setForm({ ...form, last_name: value })}
      />
      <View style={styles.roleRow}>
        <TouchableOpacity
          style={[styles.roleButton, form.role === "customer" && styles.roleButtonActive]}
          onPress={() => setForm({ ...form, role: "customer" })}
        >
          <Text style={[styles.roleButtonText, form.role === "customer" && styles.roleButtonTextActive]}>
            Customer
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roleButton, form.role === "owner" && styles.roleButtonActive]}
          onPress={() => setForm({ ...form, role: "owner" })}
        >
          <Text style={[styles.roleButtonText, form.role === "owner" && styles.roleButtonTextActive]}>
            Owner
          </Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={form.email}
        onChangeText={(value) => setForm({ ...form, email: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={form.password}
        onChangeText={(value) => setForm({ ...form, password: value })}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Create account</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#111827"
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 20
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: "#FFFFFF"
  },
  roleRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12
  },
  roleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center"
  },
  roleButtonActive: {
    backgroundColor: "#111827",
    borderColor: "#111827"
  },
  roleButtonText: {
    color: "#111827",
    fontWeight: "600"
  },
  roleButtonTextActive: {
    color: "#FFFFFF"
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600"
  }
});
