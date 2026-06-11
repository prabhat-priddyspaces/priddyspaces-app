import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export function ImpersonationBanner() {
  const { me, token, refreshMe } = useAuth();
  const [stopping, setStopping] = useState(false);
  const impersonation = me?.impersonation;

  if (!impersonation?.is_impersonating) return null;

  async function stopImpersonation() {
    if (!token || stopping) return;
    setStopping(true);
    try {
      await apiFetch("/api/admin/impersonation/stop", { method: "POST" }, token);
      await refreshMe();
    } catch {
      // Banner stays visible; the next refresh will reconcile state.
    } finally {
      setStopping(false);
    }
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        Impersonating {impersonation.target_email || "member"} as{" "}
        {impersonation.actor_email || "admin"}.
        {impersonation.reason ? ` Reason: ${impersonation.reason}` : ""}
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={stopImpersonation}
        disabled={stopping}
        accessibilityRole="button"
        accessibilityLabel="Stop impersonating"
      >
        <Text style={styles.buttonText}>{stopping ? "Stopping…" : "Stop"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF3C7",
    borderBottomWidth: 1,
    borderBottomColor: "#FCD34D",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: "#78350F"
  },
  button: {
    borderWidth: 1,
    borderColor: "#B45309",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  buttonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#78350F"
  }
});
