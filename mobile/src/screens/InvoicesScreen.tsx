import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

type Invoice = {
  public_id: string;
  amount: number;
  status: string;
  pdf_url: string | null;
};

export function InvoicesScreen() {
  const { token } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token)
      .then(setInvoices)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load invoice history"))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Invoices</Text>
      <Text style={styles.subtitle}>Receipts for booking requests and memberships.</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.list}>
        {invoices.length === 0 && !loading ? (
          <Text style={styles.empty}>No booking receipts or membership invoices yet.</Text>
        ) : (
          invoices.map((invoice) => (
            <View key={invoice.public_id} style={styles.card}>
              <Text style={styles.cardTitle}>{invoice.public_id}</Text>
              <Text style={styles.cardMuted}>${invoice.amount} • {invoice.status}</Text>
              {invoice.pdf_url ? (
                <TouchableOpacity onPress={() => Linking.openURL(invoice.pdf_url || "")}>
                  <Text style={styles.link}>Open invoice PDF</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.cardMuted}>Invoice PDF pending</Text>
              )}
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
  link: {
    marginTop: 6,
    fontSize: 12,
    color: "#2563EB",
    fontWeight: "600"
  },
  empty: {
    fontSize: 12,
    color: "#6B7280"
  }
});
