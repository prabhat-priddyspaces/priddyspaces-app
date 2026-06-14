import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useOAuth } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";

import { useAuth } from "../context/AuthContext";
import { colors, fontSizes, radii } from "../theme";

WebBrowser.maybeCompleteAuthSession();

export function LoginScreen() {
  const { signIn, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { startOAuthFlow: startGoogle } = useOAuth({ strategy: "oauth_google" });
  const { startOAuthFlow: startApple } = useOAuth({ strategy: "oauth_apple" });
  const { startOAuthFlow: startMicrosoft } = useOAuth({ strategy: "oauth_microsoft" });

  async function handleLogin() {
    try {
      await signIn(email, password);
    } catch (err) {
      Alert.alert("Login failed", err instanceof Error ? err.message : "Check your credentials and try again.");
    }
  }

  async function handleOAuth(startFlow: ReturnType<typeof useOAuth>["startOAuthFlow"]) {
    try {
      const { createdSessionId, setActive } = await startFlow();
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (err) {
      Alert.alert("Sign-in failed", err instanceof Error ? err.message : "Check your identity provider and try again.");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to browse, book, and manage Priddyspaces workspaces.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.text4}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.text4}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.primaryButtonText}>Sign in</Text>
        )}
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={styles.socialButton}
        onPress={() => handleOAuth(startGoogle)}
        disabled={loading}
      >
        <Text style={styles.socialButtonText}>Continue with Google</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.socialButton}
        onPress={() => handleOAuth(startApple)}
        disabled={loading}
      >
        <Text style={styles.socialButtonText}>Continue with Apple</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.socialButton}
        onPress={() => handleOAuth(startMicrosoft)}
        disabled={loading}
      >
        <Text style={styles.socialButtonText}>Continue with Microsoft</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.bg },
  title: { fontSize: fontSizes.pageTitle, fontWeight: "600", color: colors.text },
  subtitle: { marginTop: 8, fontSize: fontSizes.body, color: colors.text2, marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSizes.body,
    color: colors.text,
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: colors.brand,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.white, fontWeight: "600", fontSize: fontSizes.body },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    gap: 8,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { fontSize: fontSizes.caption, color: colors.text4 },
  socialButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  socialButtonText: { fontSize: fontSizes.body, fontWeight: "500", color: colors.text },
});
