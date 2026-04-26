import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { BookingsScreen } from "../screens/BookingsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { OwnerDashboardScreen } from "../screens/owner/OwnerDashboardScreen";
import { OwnerLocationsScreen } from "../screens/owner/OwnerLocationsScreen";
import { OwnerBookingsScreen } from "../screens/owner/OwnerBookingsScreen";
import { OwnerSettingsScreen } from "../screens/owner/OwnerSettingsScreen";
import { OwnerTeamScreen } from "../screens/owner/OwnerTeamScreen";
import { LocationSpacesScreen } from "../screens/customer/LocationSpacesScreen";
import { SpaceDetailScreen } from "../screens/customer/SpaceDetailScreen";
import { BookingDetailScreen } from "../screens/BookingDetailScreen";
import { PaymentSuccessScreen } from "../screens/PaymentSuccessScreen";
import { MenuScreen } from "../screens/MenuScreen";
import { InvoicesScreen } from "../screens/InvoicesScreen";
import { PaymentsScreen } from "../screens/PaymentsScreen";

const Stack = createNativeStackNavigator();
const CustomerStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function MarketplaceStack() {
  return (
    <CustomerStack.Navigator
      screenOptions={({ navigation }) => ({
        headerLeft: () => (
          <TouchableOpacity style={{ marginLeft: 12 }} onPress={() => navigation.navigate("Menu")}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Menu</Text>
          </TouchableOpacity>
        )
      })}
    >
      <CustomerStack.Screen name="MarketplaceHome" component={HomeScreen} options={{ title: "Marketplace" }} />
      <CustomerStack.Screen name="LocationSpaces" component={LocationSpacesScreen} options={{ title: "Spaces" }} />
      <CustomerStack.Screen name="SpaceDetail" component={SpaceDetailScreen} options={{ title: "Space" }} />
    </CustomerStack.Navigator>
  );
}

function CustomerTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerLeft: () => (
          <TouchableOpacity style={{ marginLeft: 12 }} onPress={() => navigation.navigate("Menu")}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Menu</Text>
          </TouchableOpacity>
        )
      })}
    >
      <Tabs.Screen name="Marketplace" component={MarketplaceStack} options={{ headerShown: false }} />
      <Tabs.Screen name="Bookings" component={BookingsScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

function OwnerTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerLeft: () => (
          <TouchableOpacity style={{ marginLeft: 12 }} onPress={() => navigation.navigate("Menu")}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Menu</Text>
          </TouchableOpacity>
        )
      })}
    >
      <Tabs.Screen name="Dashboard" component={OwnerDashboardScreen} />
      <Tabs.Screen name="Locations" component={OwnerLocationsScreen} />
      <Tabs.Screen name="Bookings" component={OwnerBookingsScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const { token, me, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: true }}>
        {token ? (
          <>
            <Stack.Screen
              name="App"
              component={me?.role === "owner" ? OwnerTabs : CustomerTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="BookingDetail" component={BookingDetailScreen} options={{ title: "Booking" }} />
            <Stack.Screen name="PaymentSuccess" component={PaymentSuccessScreen} options={{ title: "Success" }} />
            <Stack.Screen name="Menu" component={MenuScreen} options={{ title: "Menu" }} />
            <Stack.Screen name="Invoices" component={InvoicesScreen} options={{ title: "Invoices" }} />
            <Stack.Screen name="Payments" component={PaymentsScreen} options={{ title: "Payments" }} />
            <Stack.Screen name="OwnerSettings" component={OwnerSettingsScreen} options={{ title: "Settings" }} />
            <Stack.Screen name="OwnerTeam" component={OwnerTeamScreen} options={{ title: "Team" }} />
          </>
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
