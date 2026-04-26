import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { StripeProvider } from "@stripe/stripe-react-native";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { getToken } from "./src/lib/storage";

function AppBootstrap() {
  const { hydrate } = useAuth();

  useEffect(() => {
    let isMounted = true;
    getToken().then((stored) => {
      if (stored && isMounted) {
        hydrate(stored);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [hydrate]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <AppNavigator />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""}>
      <AuthProvider>
        <AppBootstrap />
      </AuthProvider>
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F9FAFB"
  }
});
