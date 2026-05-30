import { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
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
import { ProfileScreen } from "../screens/ProfileScreen";
import { OwnerDashboardScreen } from "../screens/owner/OwnerDashboardScreen";
import { OwnerLocationsScreen } from "../screens/owner/OwnerLocationsScreen";
import { OwnerBookingsScreen } from "../screens/owner/OwnerBookingsScreen";
import { OwnerSettingsScreen } from "../screens/owner/OwnerSettingsScreen";
import { OwnerTeamScreen } from "../screens/owner/OwnerTeamScreen";
import { LocationSpacesScreen } from "../screens/member/LocationSpacesScreen";
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

const Stack = createNativeStackNavigator();
const MemberStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

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
      <Stack.Screen name="Payments" component={PaymentsScreen} options={{ title: "Payments" }} />
      <Stack.Screen name="MemberDirectory" component={MemberDirectoryScreen} options={{ title: "Directory" }} />
      <Stack.Screen name="AccessPasses" component={AccessPassesScreen} options={{ title: "Access Passes" }} />
      <Stack.Screen name="MySpaceQr" component={MySpaceQrScreen} options={{ title: "My Space QR" }} />
      <Stack.Screen name="AccessScanner" component={AccessScannerScreen} options={{ title: "Scanner" }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: "Attendance" }} />
      <Stack.Screen name="OwnerSettings" component={OwnerSettingsScreen} options={{ title: "Settings" }} />
      <Stack.Screen name="OwnerTeam" component={OwnerTeamScreen} options={{ title: "Team" }} />
      <Stack.Screen name="Assistant" component={AssistantScreen} options={{ title: "Assistant" }} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { loading } = useAuth();

  if (!isLoaded || loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
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
