import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

export function PaymentSuccessScreen() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payment complete</Text>
      <Text style={styles.subtitle}>Your booking payment was successful.</Text>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate("Bookings", { refresh: true })}
      >
        <Text style={styles.primaryButtonText}>Go to bookings</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate("Marketplace")}>
        <Text style={styles.secondaryButtonText}>Back to marketplace</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: "#111827"
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center"
  },
  primaryButton: {
    marginTop: 20,
    backgroundColor: "#111827",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  secondaryButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10
  },
  secondaryButtonText: {
    color: "#111827",
    fontWeight: "600"
  }
});
