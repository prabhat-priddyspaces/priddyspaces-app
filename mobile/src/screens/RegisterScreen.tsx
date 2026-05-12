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
      <Text style={styles.subtitle}>Create a member account to book spaces and manage memberships.</Text>
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
