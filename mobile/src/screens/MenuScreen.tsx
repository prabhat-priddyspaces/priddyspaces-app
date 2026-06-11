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
  { label: "Scanner", screen: "Scanner", target: "tab" },
  { label: "Attendance", screen: "Attendance", target: "tab" },
  { label: "Locations", screen: "Locations", target: "tab" },
  { label: "Bookings", screen: "Bookings", target: "tab" },
  { label: "Calendar", screen: "OwnerCalendar", target: "stack" },
  { label: "Members", screen: "OwnerMembers", target: "stack" },
  { label: "Team", screen: "OwnerTeam", target: "stack" },
  { label: "Notifications", screen: "Notifications", target: "stack" },
  { label: "Settings", screen: "OwnerSettings", target: "stack" },
  { label: "Assistant policies", screen: "OwnerAssistantPolicies", target: "stack" },
  { label: "Payment providers", screen: "OwnerPaymentSettings", target: "stack" },
  { label: "Payments", screen: "OwnerPayments", target: "stack" },
  { label: "Payment health", screen: "OwnerPaymentHealth", target: "stack" },
  { label: "Invoices", screen: "Invoices", target: "stack" },
  { label: "Profile", screen: "Profile", target: "tab" }
];

const memberItems: MenuItem[] = [
  { label: "Marketplace", screen: "Marketplace", target: "tab" },
  { label: "Calendar", screen: "Calendar", target: "tab" },
  { label: "Bookings", screen: "Bookings", target: "tab" },
  { label: "Access Passes", screen: "AccessPasses", target: "tab" },
  { label: "My Space QR", screen: "MySpaceQr", target: "tab" },
  { label: "Memberships", screen: "MemberSubscriptions", target: "stack" },
  { label: "Rewards", screen: "MemberRewards", target: "stack" },
  { label: "Insights", screen: "MemberInsights", target: "stack" },
  { label: "Directory", screen: "Directory", target: "tab" },
  { label: "Notifications", screen: "Notifications", target: "stack" },
  { label: "Invoices", screen: "Invoices", target: "stack" },
  { label: "Profile", screen: "Profile", target: "tab" }
];

const adminItems: MenuItem[] = [
  { label: "Scanner", screen: "Scanner", target: "tab" },
  { label: "Attendance", screen: "Attendance", target: "tab" },
  { label: "Notifications", screen: "Notifications", target: "stack" },
  { label: "Profile", screen: "Profile", target: "tab" },
];

export function MenuScreen() {
  const navigation = useNavigation<any>();
  const { me, signOut } = useAuth();
  const items = me?.platform_role ? adminItems : me?.role === "owner" ? ownerItems : memberItems;

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
