import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type FloorPlan = {
  public_id: string;
  image_url: string;
  version: number;
};

type Marker = {
  public_id: string;
  space_id: number;
  x_coordinate: number;
  y_coordinate: number;
  width: number;
  height: number;
};

type PresignResponse = {
  upload_url: string;
  key: string;
  public_url?: string | null;
  max_bytes: number;
};

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

const SUCCESS_MESSAGES = new Set(["Floor plan uploaded", "Marker created"]);

export function OwnerFloorPlanScreen() {
  const { token } = useAuth();
  const route = useRoute<any>();
  const { locationId, name } = route.params || {};
  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [spacePublicId, setSpacePublicId] = useState("");
  const [coords, setCoords] = useState({ x: "0", y: "0", w: "10", h: "10" });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const loadPlans = useCallback(async () => {
    if (!token || !locationId) return;
    const list = await apiFetch<FloorPlan[]>(
      `/api/locations/${locationId}/floor-plans`,
      { method: "GET" },
      token,
    );
    setPlans(list);
    setSelected((current) => current || list[0]?.public_id || "");
  }, [token, locationId]);

  useEffect(() => {
    setLoading(true);
    loadPlans()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load plans"))
      .finally(() => setLoading(false));
  }, [loadPlans]);

  const loadMarkers = useCallback(async () => {
    if (!token || !selected) {
      setMarkers([]);
      return;
    }
    const list = await apiFetch<Marker[]>(
      `/api/floor-plans/${selected}/markers`,
      { method: "GET" },
      token,
    );
    setMarkers(list);
  }, [token, selected]);

  useEffect(() => {
    loadMarkers().catch(() => setMarkers([]));
  }, [loadMarkers]);

  async function upload() {
    if (!token || !locationId) return;
    setMessage("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Allow photo library access to upload floor plans.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    if (asset.fileSize != null && asset.fileSize > MAX_IMAGE_UPLOAD_BYTES) {
      setMessage("Image must be 10 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const fileResponse = await fetch(asset.uri);
      const blob = await fileResponse.blob();
      const contentType = asset.mimeType || "image/png";
      const presign = await apiFetch<PresignResponse>(
        "/api/floor-plans/presign",
        {
          method: "POST",
          body: JSON.stringify({
            filename: asset.fileName || "floor-plan.png",
            content_type: contentType,
            size_bytes: blob.size,
            location_public_id: locationId,
          }),
        },
        token,
      );
      const put = await fetch(presign.upload_url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: blob,
      });
      if (!put.ok) throw new Error("Upload to storage failed");
      await apiFetch(
        "/api/floor-plans",
        {
          method: "POST",
          body: JSON.stringify({
            location_public_id: locationId,
            image_url: presign.public_url || presign.key,
          }),
        },
        token,
      );
      setMessage("Floor plan uploaded");
      await loadPlans();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to upload floor plan");
    } finally {
      setUploading(false);
    }
  }

  async function createMarker() {
    if (!token || !selected) return;
    setMessage("");
    try {
      const created = await apiFetch<Marker>(
        "/api/floor-plan-markers",
        {
          method: "POST",
          body: JSON.stringify({
            floor_plan_public_id: selected,
            space_public_id: spacePublicId,
            x_coordinate: Number(coords.x),
            y_coordinate: Number(coords.y),
            width: Number(coords.w),
            height: Number(coords.h),
          }),
        },
        token,
      );
      setMarkers((prev) => [created, ...prev]);
      setMessage("Marker created");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create marker");
    }
  }

  const selectedPlan = plans.find((plan) => plan.public_id === selected) || null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Floor plans</Text>
      <Text style={styles.subtitle}>{name || "Upload plans and place space markers."}</Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={SUCCESS_MESSAGES.has(message) ? styles.successMessage : styles.message}>
          {message}
        </Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Plans</Text>
        <View style={styles.chipRow}>
          {plans.map((plan) => (
            <TouchableOpacity
              key={plan.public_id}
              style={[styles.chip, selected === plan.public_id && styles.chipActive]}
              onPress={() => setSelected(plan.public_id)}
              accessibilityRole="button"
              accessibilityLabel={`Plan version ${plan.version}`}
            >
              <Text style={[styles.chipText, selected === plan.public_id && styles.chipTextActive]}>
                Version {plan.version}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {plans.length === 0 && !loading ? (
          <Text style={styles.mutedText}>No floor plans yet.</Text>
        ) : null}
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={upload}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Upload floor plan"
        >
          <Text style={styles.secondaryButtonText}>
            {uploading ? "Uploading…" : "Upload floor plan"}
          </Text>
        </TouchableOpacity>
        {selectedPlan ? (
          <Image source={{ uri: selectedPlan.image_url }} style={styles.planImage} resizeMode="contain" />
        ) : null}
      </View>

      {selected ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Create marker</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Space public id</Text>
            <TextInput
              accessibilityLabel="Space public id"
              style={styles.input}
              value={spacePublicId}
              onChangeText={setSpacePublicId}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.row}>
            {(
              [
                ["X", "x"],
                ["Y", "y"],
                ["W", "w"],
                ["H", "h"],
              ] as const
            ).map(([label, key]) => (
              <View key={key} style={[styles.field, styles.rowItem]}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  accessibilityLabel={`Marker ${label}`}
                  style={styles.input}
                  value={coords[key]}
                  onChangeText={(value) => setCoords({ ...coords, [key]: value })}
                  keyboardType="number-pad"
                />
              </View>
            ))}
          </View>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={createMarker}
              accessibilityRole="button"
              accessibilityLabel="Save marker"
            >
              <Text style={styles.primaryButtonText}>Save marker</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => loadMarkers().catch(() => null)}
              accessibilityRole="button"
              accessibilityLabel="Refresh markers"
            >
              <Text style={styles.secondaryButtonText}>Refresh list</Text>
            </TouchableOpacity>
          </View>
          {markers.length === 0 ? (
            <Text style={styles.mutedText}>No markers loaded</Text>
          ) : (
            markers.map((marker) => (
              <View key={marker.public_id} style={styles.listRow}>
                <Text style={styles.listTitle}>Space ID: {marker.space_id}</Text>
                <Text style={styles.mutedText}>
                  Coords: {marker.x_coordinate}, {marker.y_coordinate} • Size: {marker.width} x{" "}
                  {marker.height}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F9FAFB"
  },
  container: {
    padding: 20,
    gap: 12
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827"
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#6B7280"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF"
  },
  chipActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF"
  },
  chipText: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "700"
  },
  chipTextActive: {
    color: "#3730A3"
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  planImage: {
    height: 220,
    borderRadius: 10,
    backgroundColor: "#F3F4F6"
  },
  field: {
    gap: 5
  },
  row: {
    flexDirection: "row",
    gap: 8
  },
  rowItem: {
    flex: 1
  },
  label: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "700"
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF"
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    backgroundColor: "#4F46E5"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700"
  },
  secondaryButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#FFFFFF"
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700"
  },
  listRow: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 3
  },
  listTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827"
  },
  mutedText: {
    fontSize: 12,
    color: "#6B7280"
  },
  message: {
    color: "#DC2626",
    fontSize: 12
  },
  successMessage: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "700"
  }
});
