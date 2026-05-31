import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

type Payment = {
  public_id: string;
  amount: number;
  status: string;
  provider: string;
};

export function PaymentsScreen() {
  const { token } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<Payment[]>("/api/payments", { method: "GET" }, token)
      .then(setPayments)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load payment history"))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payment history</Text>
      <Text style={styles.subtitle}>Track booking and membership charges.</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.list}>
        {payments.length === 0 && !loading ? (
          <Text style={styles.empty}>No booking or membership payments yet.</Text>
        ) : (
          payments.map((payment) => (
            <View key={payment.public_id} style={styles.card}>
              <Text style={styles.cardTitle}>{payment.public_id}</Text>
              <Text style={styles.cardMuted}>${payment.amount} • {payment.status}</Text>
              <Text style={styles.cardMuted}>{payment.provider}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827"
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280"
  },
  message: {
    marginTop: 12,
    color: "#DC2626",
    fontSize: 12
  },
  list: {
    marginTop: 16,
    gap: 12
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB"
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827"
  },
  cardMuted: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280"
  },
  empty: {
    fontSize: 12,
    color: "#6B7280"
  }
});
