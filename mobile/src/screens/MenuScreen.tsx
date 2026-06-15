import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { useAuth } from "../context/AuthContext";
import { colors, fontSizes, radii, shadows } from "../theme";

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
  { label: "Analytics", screen: "OwnerAnalytics", target: "stack" },
  { label: "Loyalty", screen: "OwnerLoyalty", target: "stack" },
  { label: "Marketing", screen: "OwnerMarketing", target: "stack" },
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
  { label: "Dashboard", screen: "AdminDashboard", target: "tab" },
  { label: "Scanner", screen: "Scanner", target: "tab" },
  { label: "Bookings", screen: "AdminBookings", target: "stack" },
  { label: "Listings", screen: "AdminListings", target: "stack" },
  { label: "Audit logs", screen: "AdminAuditLogs", target: "stack" },
  { label: "Members", screen: "AdminMembers", target: "stack" },
  { label: "Owner users", screen: "AdminOwnerUsers", target: "stack" },
  { label: "Owner companies", screen: "AdminOwnerCompanies", target: "stack" },
  { label: "Payments", screen: "AdminPayments", target: "stack" },
  { label: "Users", screen: "AdminUsers", target: "stack" },
  { label: "Calendar", screen: "AdminCalendar", target: "stack" },
  { label: "Platform team", screen: "AdminPlatformTeam", target: "stack" },
  { label: "Assistant quality", screen: "AdminAssistantQuality", target: "stack" },
  { label: "Analytics", screen: "AdminAnalytics", target: "stack" },
  { label: "Settings", screen: "AdminSettings", target: "stack" },
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
    marginTop: 6,
    fontSize: fontSizes.body,
    color: colors.text2
  },
  list: {
    marginTop: 16,
    gap: 10
  },
  item: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card
  },
  itemText: {
    fontSize: fontSizes.body,
    fontWeight: "600",
    color: colors.text
  },
  divider: {
    marginTop: 20,
    height: 1,
    backgroundColor: colors.line
  },
  logoutButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: "center"
  },
  logoutText: {
    color: colors.danger,
    fontWeight: "600"
  }
});
