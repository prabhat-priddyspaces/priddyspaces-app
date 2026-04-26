import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { useAuth } from "../context/AuthContext";

type MenuItem = {
  label: string;
  screen: string;
  target: "tab" | "stack";
};

const ownerItems: MenuItem[] = [
  { label: "Dashboard", screen: "Dashboard", target: "tab" },
  { label: "Locations", screen: "Locations", target: "tab" },
  { label: "Bookings", screen: "Bookings", target: "tab" },
  { label: "Team", screen: "OwnerTeam", target: "stack" },
  { label: "Settings", screen: "OwnerSettings", target: "stack" },
  { label: "Payments", screen: "Payments", target: "stack" },
  { label: "Invoices", screen: "Invoices", target: "stack" },
  { label: "Profile", screen: "Profile", target: "tab" }
];

const customerItems: MenuItem[] = [
  { label: "Marketplace", screen: "Marketplace", target: "tab" },
  { label: "Bookings", screen: "Bookings", target: "tab" },
  { label: "Invoices", screen: "Invoices", target: "stack" },
  { label: "Profile", screen: "Profile", target: "tab" }
];

export function MenuScreen() {
  const navigation = useNavigation<any>();
  const { me, signOut } = useAuth();
  const items = me?.role === "owner" ? ownerItems : customerItems;

  function goTo(item: MenuItem) {
    if (item.target === "stack") {
      navigation.navigate(item.screen);
      return;
    }
    navigation.navigate("App", { screen: item.screen });
    navigation.goBack();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Menu</Text>
      <Text style={styles.subtitle}>Quick navigation</Text>
      <View style={styles.list}>
        {items.map((item) => (
          <TouchableOpacity key={item.screen} style={styles.item} onPress={() => goTo(item)}>
            <Text style={styles.itemText}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.divider} />
      <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
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
  list: {
    marginTop: 16,
    gap: 10
  },
  item: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB"
  },
  itemText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827"
  },
  divider: {
    marginTop: 20,
    height: 1,
    backgroundColor: "#E5E7EB"
  },
  logoutButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center"
  },
  logoutText: {
    color: "#B91C1C",
    fontWeight: "600"
  }
});
