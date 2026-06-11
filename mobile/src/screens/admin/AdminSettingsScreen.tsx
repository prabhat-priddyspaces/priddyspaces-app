import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { adminStyles as styles } from "./adminStyles";

type CurrentAdmin = {
  first_name: string | null;
  last_name: string | null;
  email: string;
  has_password: boolean;
};

type SettingsResponse = {
  default_owner_commission_pct: number;
  priddy_points_enabled: boolean;
  priddy_signup_points: number;
  priddy_point_value_cents: number;
  priddy_allowed_space_types: string[];
  priddy_allowed_booking_modes: string[];
  booking_calendar_daily_prices_enabled: boolean;
  current_admin: CurrentAdmin;
};

const SPACE_TYPES = ["shared_desk", "conference_room", "virtual_office", "private_office", "suite"];
const BOOKING_MODES = ["day_pass", "hourly"];

function chipStyle(active: boolean) {
  return [
    { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#FFFFFF" },
    active && { borderColor: "#4F46E5", backgroundColor: "#EEF2FF" },
  ];
}

function chipTextStyle(active: boolean) {
  return { color: active ? "#3730A3" : "#4B5563", fontSize: 12, fontWeight: "700" as const, textTransform: "capitalize" as const };
}

const SUCCESS_MESSAGES = new Set(["Platform defaults saved.", "Profile saved.", "Password updated."]);

export function AdminSettingsScreen() {
  const { token } = useAuth();
  const [commission, setCommission] = useState("0");
  const [priddyEnabled, setPriddyEnabled] = useState(false);
  const [priddySignupPoints, setPriddySignupPoints] = useState("0");
  const [priddySpaceTypes, setPriddySpaceTypes] = useState<string[]>([]);
  const [priddyBookingModes, setPriddyBookingModes] = useState<string[]>([]);
  const [calendarDailyPricesEnabled, setCalendarDailyPricesEnabled] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<CurrentAdmin | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<SettingsResponse>("/api/admin/settings", { method: "GET" }, token)
      .then((settings) => {
        setCommission(String(settings.default_owner_commission_pct));
        setPriddyEnabled(settings.priddy_points_enabled);
        setPriddySignupPoints(String(settings.priddy_signup_points));
        setPriddySpaceTypes(settings.priddy_allowed_space_types || []);
        setPriddyBookingModes(settings.priddy_allowed_booking_modes || []);
        setCalendarDailyPricesEnabled(settings.booking_calendar_daily_prices_enabled);
        setCurrentAdmin(settings.current_admin);
        setFirstName(settings.current_admin.first_name || "");
        setLastName(settings.current_admin.last_name || "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setLoading(false));
  }, [token]);

  function toggleList(list: string[], setList: (next: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function saveSettings() {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(
        "/api/admin/settings",
        {
          method: "PATCH",
          body: JSON.stringify({
            default_owner_commission_pct: Number(commission),
            priddy_points_enabled: priddyEnabled,
            priddy_signup_points: Number(priddySignupPoints || 0),
            priddy_point_value_cents: 1,
            priddy_allowed_space_types: priddySpaceTypes,
            priddy_allowed_booking_modes: priddyBookingModes,
            booking_calendar_daily_prices_enabled: calendarDailyPricesEnabled,
          }),
        },
        token,
      );
      setMessage("Platform defaults saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function saveProfile() {
    if (!token) return;
    setMessage("");
    try {
      const admin = await apiFetch<CurrentAdmin>(
        "/api/admin/settings/profile",
        { method: "PATCH", body: JSON.stringify({ first_name: firstName, last_name: lastName }) },
        token,
      );
      setCurrentAdmin(admin);
      setMessage("Profile saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function changePassword() {
    if (!token) return;
    if (newPassword !== confirmPassword) {
      setMessage("New passwords do not match.");
      return;
    }
    setMessage("");
    try {
      await apiFetch(
        "/api/admin/settings/password",
        {
          method: "PATCH",
          body: JSON.stringify({
            current_password: currentAdmin?.has_password ? currentPassword : null,
            new_password: newPassword,
          }),
        },
        token,
      );
      setCurrentAdmin((current) => (current ? { ...current, has_password: true } : current));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Password update failed");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Platform settings</Text>
      <Text style={styles.subtitle}>Defaults, Priddy Points, profile, and password.</Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={SUCCESS_MESSAGES.has(message) ? { color: "#047857", fontSize: 12, fontWeight: "700" } : styles.message}>
          {message}
        </Text>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Platform defaults</Text>
        <Text style={styles.mutedText}>Default owner commission %</Text>
        <TextInput
          accessibilityLabel="Default commission"
          style={styles.input}
          value={commission}
          onChangeText={setCommission}
          keyboardType="number-pad"
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <TouchableOpacity
            style={chipStyle(priddyEnabled)}
            onPress={() => setPriddyEnabled(!priddyEnabled)}
            accessibilityRole="button"
            accessibilityLabel="Toggle priddy points"
          >
            <Text style={chipTextStyle(priddyEnabled)}>
              Priddy Points {priddyEnabled ? "on" : "off"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={chipStyle(calendarDailyPricesEnabled)}
            onPress={() => setCalendarDailyPricesEnabled(!calendarDailyPricesEnabled)}
            accessibilityRole="button"
            accessibilityLabel="Toggle calendar daily prices"
          >
            <Text style={chipTextStyle(calendarDailyPricesEnabled)}>
              Calendar daily prices {calendarDailyPricesEnabled ? "on" : "off"}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.mutedText}>Signup points</Text>
        <TextInput
          accessibilityLabel="Signup points"
          style={styles.input}
          value={priddySignupPoints}
          onChangeText={setPriddySignupPoints}
          keyboardType="number-pad"
        />
        <Text style={styles.mutedText}>Priddy-eligible space types</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {SPACE_TYPES.map((type) => (
            <TouchableOpacity
              key={type}
              style={chipStyle(priddySpaceTypes.includes(type))}
              onPress={() => toggleList(priddySpaceTypes, setPriddySpaceTypes, type)}
              accessibilityRole="button"
              accessibilityLabel={`Priddy type ${type}`}
            >
              <Text style={chipTextStyle(priddySpaceTypes.includes(type))}>{type.replace(/_/g, " ")}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.mutedText}>Priddy-eligible booking modes</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {BOOKING_MODES.map((mode) => (
            <TouchableOpacity
              key={mode}
              style={chipStyle(priddyBookingModes.includes(mode))}
              onPress={() => toggleList(priddyBookingModes, setPriddyBookingModes, mode)}
              accessibilityRole="button"
              accessibilityLabel={`Priddy mode ${mode}`}
            >
              <Text style={chipTextStyle(priddyBookingModes.includes(mode))}>{mode.replace(/_/g, " ")}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.searchButton}
          onPress={saveSettings}
          accessibilityRole="button"
          accessibilityLabel="Save platform defaults"
        >
          <Text style={styles.searchButtonText}>Save defaults</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Profile</Text>
        <Text style={styles.mutedText}>{currentAdmin?.email || ""}</Text>
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="Admin first name"
            style={styles.input}
            placeholder="First name"
            placeholderTextColor="#9CA3AF"
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            accessibilityLabel="Admin last name"
            style={styles.input}
            placeholder="Last name"
            placeholderTextColor="#9CA3AF"
            value={lastName}
            onChangeText={setLastName}
          />
        </View>
        <TouchableOpacity
          style={styles.searchButton}
          onPress={saveProfile}
          accessibilityRole="button"
          accessibilityLabel="Save admin profile"
        >
          <Text style={styles.searchButtonText}>Save profile</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Password</Text>
        {currentAdmin?.has_password ? (
          <TextInput
            accessibilityLabel="Current password"
            style={styles.input}
            placeholder="Current password"
            placeholderTextColor="#9CA3AF"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
          />
        ) : null}
        <TextInput
          accessibilityLabel="New password"
          style={styles.input}
          placeholder="New password"
          placeholderTextColor="#9CA3AF"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />
        <TextInput
          accessibilityLabel="Confirm password"
          style={styles.input}
          placeholder="Confirm new password"
          placeholderTextColor="#9CA3AF"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={changePassword}
          disabled={!newPassword}
          accessibilityRole="button"
          accessibilityLabel="Update password"
        >
          <Text style={styles.searchButtonText}>Update password</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
