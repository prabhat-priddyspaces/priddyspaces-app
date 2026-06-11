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
import { useNavigation, useRoute } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Space = {
  public_id: string;
  space_type: string;
};

type SpaceImage = {
  public_id: string;
  image_url: string;
  is_primary: boolean;
  sort_order: number;
};

type MediaPresignOut = {
  upload_url: string;
  key: string;
  public_url: string;
  max_bytes: number;
};

type PickedImage = {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
};

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

export function OwnerSpaceMediaScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { spaceId } = route.params || {};
  const [space, setSpace] = useState<Space | null>(null);
  const [images, setImages] = useState<SpaceImage[]>([]);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token || !spaceId) return;
    const [spaceResp, imageResp] = await Promise.all([
      apiFetch<Space>(`/api/spaces/${spaceId}`, { method: "GET" }, token),
      apiFetch<SpaceImage[]>(`/api/spaces/${spaceId}/media`, { method: "GET" }, token).catch(() => []),
    ]);
    setSpace(spaceResp);
    setImages(imageResp);
    setIsPrimary(imageResp.length === 0);
    setSortOrder(String(imageResp.length));
  }, [token, spaceId]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load photos"))
      .finally(() => setLoading(false));
  }, [load]);

  async function pickImage() {
    setMessage("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Allow photo library access to upload space photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setPicked({
      uri: asset.uri,
      fileName: asset.fileName || `space-photo-${images.length + 1}.jpg`,
      mimeType: asset.mimeType || "image/jpeg",
      fileSize: asset.fileSize ?? null,
    });
  }

  async function handleUpload() {
    if (!token || !spaceId) return;
    if (!picked) {
      setMessage("Choose an image before uploading.");
      return;
    }
    if (picked.fileSize != null && picked.fileSize > MAX_IMAGE_UPLOAD_BYTES) {
      setMessage("Image must be 10 MB or smaller.");
      return;
    }

    setUploading(true);
    setMessage("");
    try {
      const fileResponse = await fetch(picked.uri);
      const blob = await fileResponse.blob();
      if (blob.size > MAX_IMAGE_UPLOAD_BYTES) {
        setMessage("Image must be 10 MB or smaller.");
        return;
      }

      const presign = await apiFetch<MediaPresignOut>(
        "/api/media/presign",
        {
          method: "POST",
          body: JSON.stringify({
            filename: picked.fileName,
            content_type: picked.mimeType,
            size_bytes: blob.size,
            space_public_id: spaceId,
          }),
        },
        token,
      );

      const uploadResp = await fetch(presign.upload_url, {
        method: "PUT",
        headers: { "Content-Type": picked.mimeType },
        body: blob,
      });
      if (!uploadResp.ok) {
        throw new Error("Upload to storage failed");
      }

      await apiFetch(
        "/api/media",
        {
          method: "POST",
          body: JSON.stringify({
            space_public_id: spaceId,
            storage_key: presign.key,
            image_url: presign.public_url,
            is_primary: isPrimary,
            sort_order: Number(sortOrder || images.length),
          }),
        },
        token,
      );

      setPicked(null);
      setMessage("Photo uploaded");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Space Photos</Text>
          <Text style={styles.subtitle}>
            Upload photos for {space?.space_type ? titleize(space.space_type) : "this space"} to improve
            the marketplace listing.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={message === "Photo uploaded" ? styles.successMessage : styles.message}>{message}</Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upload a photo</Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={pickImage}
          accessibilityRole="button"
          accessibilityLabel="Choose image"
        >
          <Text style={styles.secondaryButtonText}>{picked ? "Choose a different image" : "Choose image"}</Text>
        </TouchableOpacity>
        {picked ? (
          <View style={styles.previewRow}>
            <Image source={{ uri: picked.uri }} style={styles.previewImage} />
            <Text style={styles.mutedText} numberOfLines={1}>
              {picked.fileName}
            </Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={[styles.chip, isPrimary && styles.chipActive]}
          onPress={() => setIsPrimary((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel="Set as primary image"
        >
          <Text style={[styles.chipText, isPrimary && styles.chipTextActive]}>
            {isPrimary ? "Primary image" : "Set as primary image"}
          </Text>
        </TouchableOpacity>
        <View style={styles.field}>
          <Text style={styles.label}>Sort order</Text>
          <TextInput
            accessibilityLabel="Sort order"
            value={sortOrder}
            onChangeText={setSortOrder}
            keyboardType="number-pad"
            style={styles.input}
          />
        </View>
        <TouchableOpacity
          style={[styles.primaryButton, uploading && styles.primaryButtonDisabled]}
          onPress={handleUpload}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Upload photo"
        >
          {uploading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Upload Photo</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Photos</Text>
        {images.length === 0 && !loading ? (
          <Text style={styles.mutedText}>No photos uploaded yet.</Text>
        ) : (
          images.map((image) => (
            <View key={image.public_id} style={styles.photoCard}>
              <Image source={{ uri: image.image_url }} style={styles.photo} />
              <Text style={styles.mutedText}>
                Sort order {image.sort_order}
                {image.is_primary ? " • Primary" : ""}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function titleize(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB"
  },
  content: {
    padding: 20,
    gap: 14
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
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
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 12
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  previewRow: {
    gap: 8
  },
  previewImage: {
    height: 140,
    borderRadius: 10,
    backgroundColor: "#F3F4F6"
  },
  field: {
    gap: 5
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
  chip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 13,
    backgroundColor: "#4F46E5"
  },
  primaryButtonDisabled: {
    opacity: 0.5
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700"
  },
  secondaryButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF"
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700"
  },
  photoCard: {
    gap: 6
  },
  photo: {
    height: 180,
    borderRadius: 10,
    backgroundColor: "#F3F4F6"
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
