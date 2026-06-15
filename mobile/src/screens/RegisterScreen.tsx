import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useAuth } from "../context/AuthContext";
import { colors, fontSizes, radii } from "../theme";

export function RegisterScreen() {
  const { signUp, verifyEmailCode, loading } = useAuth();
  const [form, setForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  });
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  async function handleRegister() {
    try {
      const result = await signUp(form);
      if (result.status === "needs_verification") {
        setVerificationPending(true);
        Alert.alert("Check your email", "Enter the verification code to finish creating your account.");
      }
    } catch (err) {
      Alert.alert("Registration failed", err instanceof Error ? err.message : "Check your member account details and try again.");
    }
  }

  async function handleVerifyEmail() {
    if (!verificationCode.trim()) {
      Alert.alert("Verification code required", "Enter the code from your email to continue.");
      return;
    }
    try {
      await verifyEmailCode(verificationCode.trim());
    } catch (err) {
      Alert.alert("Verification failed", err instanceof Error ? err.message : "Check the code and try again.");
    }
  }

  if (verificationPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>Enter the verification code sent to {form.email}.</Text>
        <TextInput
          style={styles.input}
          placeholder="Verification code"
          placeholderTextColor={colors.text4}
          autoCapitalize="none"
          keyboardType="number-pad"
          value={verificationCode}
          onChangeText={setVerificationCode}
        />
        <TouchableOpacity style={styles.primaryButton} onPress={handleVerifyEmail} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryButtonText}>Verify email</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            setVerificationPending(false);
            setVerificationCode("");
          }}
          disabled={loading}
        >
          <Text style={styles.secondaryButtonText}>Use a different email</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create member account</Text>
      <Text style={styles.subtitle}>Create a member account to book spaces and manage memberships.</Text>
      <TextInput
        style={styles.input}
        placeholder="First name"
        placeholderTextColor={colors.text4}
        value={form.first_name}
        onChangeText={(value) => setForm({ ...form, first_name: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Last name"
        placeholderTextColor={colors.text4}
        value={form.last_name}
        onChangeText={(value) => setForm({ ...form, last_name: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.text4}
        autoCapitalize="none"
        keyboardType="email-address"
        value={form.email}
        onChangeText={(value) => setForm({ ...form, email: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.text4}
        secureTextEntry
        value={form.password}
        onChangeText={(value) => setForm({ ...form, password: value })}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.primaryButtonText}>Create account</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: colors.bg
  },
  title: {
    fontSize: fontSizes.pageTitle,
    fontWeight: "600",
    color: colors.text
  },
  subtitle: {
    marginTop: 8,
    fontSize: fontSizes.body,
    color: colors.text2,
    marginBottom: 20
  },
  input: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSizes.body,
    color: colors.text,
    marginBottom: 12,
    backgroundColor: colors.surface
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: colors.brand,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: "center"
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: fontSizes.body
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  secondaryButtonText: {
    color: colors.brand,
    fontWeight: "600"
  }
});
