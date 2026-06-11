import { useEffect, useState } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth as useClerkAuth } from "@clerk/expo";

import { API_BASE_URL } from "../constants";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { OrgOnboardingScreen } from "../screens/OrgOnboardingScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { BookingsScreen } from "../screens/BookingsScreen";
import { MemberCalendarScreen } from "../screens/MemberCalendarScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { OwnerDashboardScreen } from "../screens/owner/OwnerDashboardScreen";
import { OwnerLocationsScreen } from "../screens/owner/OwnerLocationsScreen";
import { OwnerLocationRoomsScreen } from "../screens/owner/OwnerLocationRoomsScreen";
import { OwnerLocationEditScreen } from "../screens/owner/OwnerLocationEditScreen";
import { OwnerAddSpaceScreen } from "../screens/owner/OwnerAddSpaceScreen";
import { OwnerSpaceEditScreen } from "../screens/owner/OwnerSpaceEditScreen";
import { OwnerSpaceMediaScreen } from "../screens/owner/OwnerSpaceMediaScreen";
import { OwnerCalendarScreen } from "../screens/owner/OwnerCalendarScreen";
import { OwnerPaymentsScreen } from "../screens/owner/OwnerPaymentsScreen";
import { OwnerMembersScreen } from "../screens/owner/OwnerMembersScreen";
import { OwnerMemberDetailScreen } from "../screens/owner/OwnerMemberDetailScreen";
import { OwnerPaymentHealthScreen } from "../screens/owner/OwnerPaymentHealthScreen";
import { OwnerAssistantPoliciesScreen } from "../screens/owner/OwnerAssistantPoliciesScreen";
import { OwnerNewLocationScreen } from "../screens/owner/OwnerNewLocationScreen";
import { OwnerBookingsScreen } from "../screens/owner/OwnerBookingsScreen";
import { OwnerCreateBookingScreen } from "../screens/owner/OwnerCreateBookingScreen";
import { OwnerSettingsScreen } from "../screens/owner/OwnerSettingsScreen";
import { OwnerPaymentSettingsScreen } from "../screens/owner/OwnerPaymentSettingsScreen";
import { OwnerTeamScreen } from "../screens/owner/OwnerTeamScreen";
import { LocationSpacesScreen } from "../screens/member/LocationSpacesScreen";
import { MemberSubscriptionsScreen } from "../screens/member/MemberSubscriptionsScreen";
import { MemberRewardsScreen } from "../screens/member/MemberRewardsScreen";
import { MemberInsightsScreen } from "../screens/member/MemberInsightsScreen";
import { SpaceDetailScreen } from "../screens/member/SpaceDetailScreen";
import { BookingDetailScreen } from "../screens/BookingDetailScreen";
import { PaymentSuccessScreen } from "../screens/PaymentSuccessScreen";
import { MenuScreen } from "../screens/MenuScreen";
import { InvoicesScreen } from "../screens/InvoicesScreen";
import { PaymentsScreen } from "../screens/PaymentsScreen";
import { AssistantScreen } from "../screens/AssistantScreen";
import { AccessPassesScreen } from "../screens/access/AccessPassesScreen";
import { MySpaceQrScreen } from "../screens/access/MySpaceQrScreen";
import { MemberDirectoryScreen } from "../screens/access/MemberDirectoryScreen";
import { AccessScannerScreen } from "../screens/access/AccessScannerScreen";
import { AttendanceScreen } from "../screens/access/AttendanceScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { addNotificationTapListener, registerExpoPushToken } from "../lib/notifications";

const Stack = createNativeStackNavigator();
const MemberStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef<any>();

function openAssistant(navigation: any) {
  let current = navigation;
  while (current) {
    const routeNames = current.getState?.().routeNames || [];
    if (routeNames.includes("Assistant")) {
      current.navigate("Assistant");
      return;
    }
    current = current.getParent?.();
  }
  navigation.navigate?.("Assistant");
}

function AssistantHeaderButton({ navigation }: { navigation: any }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/api/assistant/status`)
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => {
        if (active) setEnabled(Boolean(data.enabled));
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!enabled) return null;

  return (
    <TouchableOpacity style={{ marginRight: 12 }} onPress={() => openAssistant(navigation)}>
      <Text style={{ fontSize: 20, color: "#4f46e5" }}>✦</Text>
    </TouchableOpacity>
  );
}

function MenuHeaderButton({ navigation }: { navigation: any }) {
  return (
    <TouchableOpacity
      style={styles.menuButton}
      onPress={() => navigation.navigate("Menu")}
      accessibilityRole="button"
      accessibilityLabel="Open menu"
    >
      <View style={styles.menuBar} />
      <View style={styles.menuBar} />
      <View style={styles.menuBar} />
    </TouchableOpacity>
  );
}

function MarketplaceStack() {
  return (
    <MemberStack.Navigator
      screenOptions={({ navigation }) => ({
        headerLeft: () => <MenuHeaderButton navigation={navigation} />,
        headerRight: () => <AssistantHeaderButton navigation={navigation} />,
      })}
    >
      <MemberStack.Screen name="MarketplaceHome" component={HomeScreen} options={{ title: "Marketplace" }} />
      <MemberStack.Screen name="LocationSpaces" component={LocationSpacesScreen} options={{ title: "Spaces" }} />
      <MemberStack.Screen name="SpaceDetail" component={SpaceDetailScreen} options={{ title: "Space" }} />
    </MemberStack.Navigator>
  );
}

function MemberTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerLeft: () => <MenuHeaderButton navigation={navigation} />,
        headerRight: () => <AssistantHeaderButton navigation={navigation} />,
      })}
    >
      <Tabs.Screen name="Marketplace" component={MarketplaceStack} options={{ headerShown: false }} />
      <Tabs.Screen name="Calendar" component={MemberCalendarScreen} options={{ title: "Calendar" }} />
      <Tabs.Screen name="Bookings" component={BookingsScreen} />
      <Tabs.Screen name="AccessPasses" component={AccessPassesScreen} options={{ title: "Access Passes" }} />
      <Tabs.Screen name="MySpaceQr" component={MySpaceQrScreen} options={{ title: "My Space QR" }} />
      <Tabs.Screen name="Directory" component={MemberDirectoryScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

function OwnerTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerLeft: () => <MenuHeaderButton navigation={navigation} />,
        headerRight: () => <AssistantHeaderButton navigation={navigation} />,
      })}
    >
      <Tabs.Screen name="Dashboard" component={OwnerDashboardScreen} />
      <Tabs.Screen name="Scanner" component={AccessScannerScreen} />
      <Tabs.Screen name="Attendance" component={AttendanceScreen} />
      <Tabs.Screen name="Locations" component={OwnerLocationsScreen} />
      <Tabs.Screen name="Bookings" component={OwnerBookingsScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

function AdminTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerLeft: () => <MenuHeaderButton navigation={navigation} />,
        headerRight: () => <AssistantHeaderButton navigation={navigation} />,
      })}
    >
      <Tabs.Screen name="Scanner" component={AccessScannerScreen} />
      <Tabs.Screen name="Attendance" component={AttendanceScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

function MainApp() {
  const { me } = useAuth();

  if (!me?.role && !me?.platform_role) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      </Stack.Navigator>
    );
  }

  if (me.role === "owner" && !me.has_organization) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="OrgOnboarding" component={OrgOnboardingScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="App"
        component={me.platform_role ? AdminTabs : me.role === "owner" ? OwnerTabs : MemberTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} options={{ title: "Booking" }} />
      <Stack.Screen name="PaymentSuccess" component={PaymentSuccessScreen} options={{ title: "Success" }} />
      <Stack.Screen name="Menu" component={MenuScreen} options={{ title: "Menu" }} />
      <Stack.Screen name="Invoices" component={InvoicesScreen} options={{ title: "Invoices" }} />
      <Stack.Screen
        name="MemberSubscriptions"
        component={MemberSubscriptionsScreen}
        options={{ title: "Memberships" }}
      />
      <Stack.Screen name="MemberRewards" component={MemberRewardsScreen} options={{ title: "Rewards" }} />
      <Stack.Screen name="MemberInsights" component={MemberInsightsScreen} options={{ title: "Insights" }} />
      <Stack.Screen name="Payments" component={PaymentsScreen} options={{ title: "Payments" }} />
      <Stack.Screen name="MemberDirectory" component={MemberDirectoryScreen} options={{ title: "Directory" }} />
      <Stack.Screen name="AccessPasses" component={AccessPassesScreen} options={{ title: "Access Passes" }} />
      <Stack.Screen name="MySpaceQr" component={MySpaceQrScreen} options={{ title: "My Space QR" }} />
      <Stack.Screen name="AccessScanner" component={AccessScannerScreen} options={{ title: "Scanner" }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: "Attendance" }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Notifications" }} />
      <Stack.Screen name="OwnerCreateBooking" component={OwnerCreateBookingScreen} options={{ title: "Create booking" }} />
      <Stack.Screen name="OwnerLocationRooms" component={OwnerLocationRoomsScreen} options={{ title: "Manage rooms" }} />
      <Stack.Screen name="OwnerLocationEdit" component={OwnerLocationEditScreen} options={{ title: "Edit location" }} />
      <Stack.Screen name="OwnerAddSpace" component={OwnerAddSpaceScreen} options={{ title: "Add space" }} />
      <Stack.Screen name="OwnerSpaceEdit" component={OwnerSpaceEditScreen} options={{ title: "Edit space" }} />
      <Stack.Screen name="OwnerSpaceMedia" component={OwnerSpaceMediaScreen} options={{ title: "Space photos" }} />
      <Stack.Screen name="OwnerCalendar" component={OwnerCalendarScreen} options={{ title: "Calendar" }} />
      <Stack.Screen name="OwnerPayments" component={OwnerPaymentsScreen} options={{ title: "Payments" }} />
      <Stack.Screen name="OwnerMembers" component={OwnerMembersScreen} options={{ title: "Members" }} />
      <Stack.Screen name="OwnerMemberDetail" component={OwnerMemberDetailScreen} options={{ title: "Member" }} />
      <Stack.Screen name="OwnerPaymentHealth" component={OwnerPaymentHealthScreen} options={{ title: "Payment health" }} />
      <Stack.Screen
        name="OwnerAssistantPolicies"
        component={OwnerAssistantPoliciesScreen}
        options={{ title: "Assistant policies" }}
      />
      <Stack.Screen name="OwnerNewLocation" component={OwnerNewLocationScreen} options={{ title: "New location" }} />
      <Stack.Screen name="OwnerSettings" component={OwnerSettingsScreen} options={{ title: "Settings" }} />
      <Stack.Screen
        name="OwnerPaymentSettings"
        component={OwnerPaymentSettingsScreen}
        options={{ title: "Payment settings" }}
      />
      <Stack.Screen name="OwnerTeam" component={OwnerTeamScreen} options={{ title: "Team" }} />
      <Stack.Screen name="Assistant" component={AssistantScreen} options={{ title: "Assistant" }} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { loading, token } = useAuth();

  useEffect(() => {
    if (!token) return;
    void registerExpoPushToken(token, false);
  }, [token]);

  useEffect(() => {
    const sub = addNotificationTapListener((data) => {
      const bookingId = typeof data.booking_public_id === "string" ? data.booking_public_id : null;
      if (bookingId && navigationRef.isReady()) {
        navigationRef.navigate("Main", {
          screen: "BookingDetail",
          params: { bookingId },
        });
      }
    });
    return () => {
      sub.remove();
    };
  }, []);

  if (!isLoaded || loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isSignedIn ? (
          <Stack.Screen name="Main" component={MainApp} />
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    marginLeft: 12,
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  menuBar: {
    width: 18,
    height: 2,
    borderRadius: 2,
    backgroundColor: "#111827",
  },
});
