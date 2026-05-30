import { useCallback, useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";

import { useAuth } from "../../context/AuthContext";
import {
  AccessPassResolve,
  checkInAccessPass,
  checkOutAccessPass,
  extractAccessPassToken,
  resolveAccessPass,
} from "../../lib/accessPasses";
import { accessStyles as styles, formatDateTime, titleize } from "./accessStyles";

function ResultCard({ result }: { result: AccessPassResolve | null }) {
  if (!result) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No pass scanned</Text>
        <Text style={styles.muted}>Open the camera or paste a token to validate a QR access pass.</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{result.member_name || result.member_email || "Member"}</Text>
      <Text style={styles.muted}>{result.member_email || "No email"}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{titleize(result.pass_status)}</Text>
      </View>
      <Text style={styles.label}>Booking</Text>
      <Text style={styles.value}>{result.booking_public_id || "Not available"}</Text>
      <Text style={styles.label}>Location</Text>
      <Text style={styles.value}>{result.location_name || "Not available"}</Text>
      <Text style={styles.label}>Space</Text>
      <Text style={styles.value}>{result.space_name || titleize(result.space_type)}</Text>
      <Text style={styles.label}>Window</Text>
      <Text style={styles.value}>{formatDateTime(result.start_datetime)} to {formatDateTime(result.end_datetime)}</Text>
      <Text style={styles.label}>Checked in</Text>
      <Text style={styles.value}>{formatDateTime(result.checked_in_at)}</Text>
      <Text style={styles.label}>Checked out</Text>
      <Text style={styles.value}>{formatDateTime(result.checked_out_at)}</Text>
    </View>
  );
}

export function AccessScannerScreen() {
  const { token } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);
  const [rawToken, setRawToken] = useState("");
  const [activeToken, setActiveToken] = useState("");
  const [result, setResult] = useState<AccessPassResolve | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const resolveToken = useCallback(
    async (value: string) => {
      if (!token) return;
      const parsed = extractAccessPassToken(value);
      if (!parsed) return;
      setBusy(true);
      setMessage("");
      try {
        const resolved = await resolveAccessPass(parsed, token);
        setActiveToken(parsed);
        setRawToken(parsed);
        setResult(resolved);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Unable to resolve access pass");
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  async function openCamera() {
    setMessage("");
    const status = permission?.granted ? permission : await requestPermission();
    if (!status?.granted) {
      setMessage("Camera permission is required to scan QR codes.");
      return;
    }
    setScanPaused(false);
    setCameraOpen(true);
  }

  function handleScan(scan: BarcodeScanningResult) {
    if (scanPaused) return;
    setScanPaused(true);
    setCameraOpen(false);
    void resolveToken(scan.data);
  }

  async function checkIn() {
    if (!activeToken || !token) return;
    setBusy(true);
    setMessage("");
    try {
      setResult(await checkInAccessPass(activeToken, token));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to check in");
    } finally {
      setBusy(false);
    }
  }

  async function checkOut() {
    if (!activeToken || !token) return;
    setBusy(true);
    setMessage("");
    try {
      setResult(await checkOutAccessPass(activeToken, token));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to check out");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={styles.title}>Access Scanner</Text>
      <Text style={styles.subtitle}>Scan member access passes with the device camera.</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={[styles.row, { marginTop: 16 }]}>
        <TouchableOpacity style={styles.button} onPress={cameraOpen ? () => setCameraOpen(false) : openCamera}>
          <Text style={styles.buttonText}>{cameraOpen ? "Stop camera" : "Start camera"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            setScanPaused(false);
            setResult(null);
            setRawToken("");
            setActiveToken("");
          }}
        >
          <Text style={styles.secondaryButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>
      {cameraOpen ? (
        <View style={[styles.card, { padding: 0, overflow: "hidden" }]}>
          <CameraView
            style={{ height: 320, width: "100%" }}
            facing="back"
            onBarcodeScanned={scanPaused ? undefined : handleScan}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            testID="mobile-access-camera"
          />
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.label}>Manual token</Text>
        <TextInput
          style={styles.input}
          value={rawToken}
          onChangeText={setRawToken}
          placeholder="Paste QR URL or token"
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[styles.button, { marginTop: 12, opacity: busy ? 0.5 : 1 }]}
          onPress={() => resolveToken(rawToken)}
          disabled={busy}
        >
          <Text style={styles.buttonText}>Resolve</Text>
        </TouchableOpacity>
      </View>
      <ResultCard result={result} />
      {result ? (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.button, { flex: 1, opacity: result.can_check_in && !busy ? 1 : 0.5 }]}
            onPress={checkIn}
            disabled={!result.can_check_in || busy}
          >
            <Text style={styles.buttonText}>Check in</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, { flex: 1, opacity: result.can_check_out && !busy ? 1 : 0.5 }]}
            onPress={checkOut}
            disabled={!result.can_check_out || busy}
          >
            <Text style={styles.secondaryButtonText}>Check out</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}
