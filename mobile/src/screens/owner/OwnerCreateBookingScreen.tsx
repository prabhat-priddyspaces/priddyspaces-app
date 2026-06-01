import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type PaymentMode = "cash_collected" | "payment_link";
type MemberMode = "existing" | "new";
type BookingMode = "hourly" | "day_pass";

type Location = {
  public_id: string;
  name: string;
  city?: string | null;
};

type Space = {
  public_id: string;
  name: string;
  space_type: string;
  capacity: number;
};

type Member = {
  user_public_id: string;
  name: string;
  email: string;
  company_name?: string | null;
};

type Preview = {
  total_amount_cents: number;
  base_amount_cents: number;
  tax_amount_cents?: number;
  rate_basis?: string | null;
};

type BookingResult = {
  request_public_id: string;
  booking_public_id?: string | null;
  payment_collection_mode: PaymentMode;
  payment_link_expires_at?: string | null;
  member_email: string;
  total_amount_cents: number;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function localIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function money(cents: number | null | undefined) {
  return `$${((cents || 0) / 100).toFixed(2)}`;
}

function centsFromCurrency(value: string): number | null {
  const clean = value.trim();
  if (!clean) return null;
  const parsed = Number(clean);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export function OwnerCreateBookingScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [locations, setLocations] = useState<Location[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [locationId, setLocationId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [bookingMode, setBookingMode] = useState<BookingMode>("hourly");
  const [fullDay, setFullDay] = useState(false);
  const [seats, setSeats] = useState("1");
  const [memberMode, setMemberMode] = useState<MemberMode>("new");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPublicId, setMemberPublicId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash_collected");
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedSpace = useMemo(
    () => spaces.find((space) => space.public_id === spaceId) || null,
    [spaceId, spaces],
  );

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<Location[]>("/api/locations", { method: "GET" }, token)
      .then((rows) => {
        setLocations(rows);
        if (rows.length === 1) setLocationId(rows[0].public_id);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load locations"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || !locationId) {
      setSpaces([]);
      setSpaceId("");
      return;
    }
    apiFetch<Space[]>(`/api/locations/${locationId}/spaces`, { method: "GET" }, token)
      .then((rows) => {
        setSpaces(rows);
        setSpaceId(rows[0]?.public_id || "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load spaces"));
  }, [locationId, token]);

  useEffect(() => {
    if (!token || memberMode !== "existing" || memberSearch.trim().length < 2) {
      setMembers([]);
      return;
    }
    const handle = setTimeout(() => {
      apiFetch<Member[]>(
        `/api/owner/members?search=${encodeURIComponent(memberSearch.trim())}`,
        { method: "GET" },
        token,
      )
        .then(setMembers)
        .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to search members"));
    }, 250);
    return () => clearTimeout(handle);
  }, [memberMode, memberSearch, token]);

  function buildPayload(includeMember: boolean) {
    const overrideCents = centsFromCurrency(overrideAmount);
    const payload: Record<string, unknown> = {
      space_public_id: spaceId,
      start_datetime: localIso(date, startTime),
      end_datetime: localIso(date, endTime),
      booking_mode: bookingMode,
      full_day: fullDay,
      seats_requested: Math.max(1, Number.parseInt(seats, 10) || 1),
    };
    if (overrideCents != null) {
      payload.override_amount_cents = overrideCents;
      payload.override_reason = overrideReason.trim();
    }
    if (includeMember) {
      payload.payment_collection_mode = paymentMode;
      payload.operator_notes = notes.trim() || null;
      if (memberMode === "existing") {
        payload.member_public_id = memberPublicId;
      } else {
        payload.member = {
          email: email.trim(),
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          company_name: company.trim() || null,
        };
      }
    }
    return payload;
  }

  function validate(includeMember: boolean) {
    if (!spaceId) return "Select a space";
    if (!date || !startTime || !endTime) return "Enter date and time";
    if (overrideAmount.trim() && !overrideReason.trim()) return "Override reason is required";
    if (includeMember && memberMode === "existing" && !memberPublicId) return "Select an existing member";
    if (includeMember && memberMode === "new" && (!fullName.trim() || !email.trim())) {
      return "Name and email are required for a new member";
    }
    return "";
  }

  async function handlePreview() {
    if (!token) return;
    const error = validate(false);
    if (error) {
      setMessage(error);
      return;
    }
    setSaving(true);
    setMessage("");
    setPreview(null);
    try {
      const resp = await apiFetch<Preview>(
        "/api/owner/bookings/preview",
        { method: "POST", body: JSON.stringify(buildPayload(false)) },
        token,
      );
      setPreview(resp);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to preview booking");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!token) return;
    const error = validate(true);
    if (error) {
      setMessage(error);
      return;
    }
    setSaving(true);
    setMessage("");
    setResult(null);
    try {
      const resp = await apiFetch<BookingResult>(
        "/api/owner/bookings",
        { method: "POST", body: JSON.stringify(buildPayload(true)) },
        token,
      );
      setResult(resp);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to create booking");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Create booking</Text>
          <Text style={styles.subtitle}>Create a cash booking or send a payment link.</Text>
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate("Bookings")}>
          <Text style={styles.secondaryButtonText}>Requests</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {result ? (
        <View style={styles.successBox}>
          <Text style={styles.successTitle}>
            {result.payment_collection_mode === "cash_collected" ? "Cash booking confirmed" : "Payment link sent"}
          </Text>
          <Text style={styles.successText}>
            {result.member_email} · {money(result.total_amount_cents)}
          </Text>
          <Text style={styles.successText}>Request {result.request_public_id}</Text>
          {result.payment_link_expires_at ? (
            <Text style={styles.successText}>
              Hold expires {new Date(result.payment_link_expires_at).toLocaleString()}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Space</Text>
        <View style={styles.optionGrid}>
          {locations.map((location) => (
            <TouchableOpacity
              key={location.public_id}
              style={[styles.option, locationId === location.public_id && styles.optionActive]}
              onPress={() => setLocationId(location.public_id)}
              accessibilityLabel={`Select location ${location.name}`}
            >
              <Text style={styles.optionTitle}>{location.name}</Text>
              {location.city ? <Text style={styles.optionSubtitle}>{location.city}</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.optionGrid}>
          {spaces.map((space) => (
            <TouchableOpacity
              key={space.public_id}
              style={[styles.option, spaceId === space.public_id && styles.optionActive]}
              onPress={() => setSpaceId(space.public_id)}
              accessibilityLabel={`Select space ${space.name}`}
            >
              <Text style={styles.optionTitle}>{space.name}</Text>
              <Text style={styles.optionSubtitle}>
                {space.space_type.replace(/_/g, " ")} · {space.capacity} seats
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {selectedSpace ? <Text style={styles.hint}>Selected: {selectedSpace.name}</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Date and time</Text>
        <View style={styles.row}>
          <Field label="Date" value={date} onChange={setDate} />
          <Field label="Start" value={startTime} onChange={setStartTime} />
          <Field label="End" value={endTime} onChange={setEndTime} />
        </View>
        <View style={styles.row}>
          <ModeButton active={bookingMode === "hourly"} label="Hourly" onPress={() => setBookingMode("hourly")} />
          <ModeButton active={bookingMode === "day_pass"} label="Day pass" onPress={() => setBookingMode("day_pass")} />
          <ModeButton active={fullDay} label="Full day" onPress={() => setFullDay((current) => !current)} />
        </View>
        <Field label="Seats" value={seats} onChange={setSeats} keyboardType="number-pad" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Member</Text>
        <View style={styles.row}>
          <ModeButton
            active={memberMode === "existing"}
            label="Existing"
            onPress={() => {
              setMemberMode("existing");
              setMemberPublicId("");
            }}
          />
          <ModeButton
            active={memberMode === "new"}
            label="New"
            onPress={() => {
              setMemberMode("new");
              setMemberPublicId("");
            }}
          />
        </View>
        {memberMode === "existing" ? (
          <>
            <Field label="Search" value={memberSearch} onChange={setMemberSearch} />
            <View style={styles.optionGrid}>
              {members.map((member) => (
                <TouchableOpacity
                  key={member.user_public_id}
                  style={[styles.option, memberPublicId === member.user_public_id && styles.optionActive]}
                  onPress={() => setMemberPublicId(member.user_public_id)}
                  accessibilityLabel={`Select member ${member.email}`}
                >
                  <Text style={styles.optionTitle}>{member.name || member.email}</Text>
                  <Text style={styles.optionSubtitle}>{member.email}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <Field label="Full name" value={fullName} onChange={setFullName} />
            <Field label="Email" value={email} onChange={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Field label="Phone" value={phone} onChange={setPhone} keyboardType="phone-pad" />
            <Field label="Company" value={company} onChange={setCompany} />
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment</Text>
        <View style={styles.row}>
          <ModeButton active={paymentMode === "cash_collected"} label="Cash collected" onPress={() => setPaymentMode("cash_collected")} />
          <ModeButton active={paymentMode === "payment_link"} label="Payment link" onPress={() => setPaymentMode("payment_link")} />
        </View>
        <Field label="Override amount" value={overrideAmount} onChange={setOverrideAmount} keyboardType="decimal-pad" />
        <Field label="Override reason" value={overrideReason} onChange={setOverrideReason} />
        <Field label="Notes" value={notes} onChange={setNotes} multiline />
      </View>

      {preview ? (
        <View style={styles.previewBox}>
          <Text style={styles.previewTitle}>Preview total</Text>
          <Text style={styles.previewAmount}>{money(preview.total_amount_cents)}</Text>
          <Text style={styles.previewText}>{preview.rate_basis || "Standard rate"}</Text>
        </View>
      ) : null}

      <TouchableOpacity style={styles.secondaryAction} onPress={handlePreview} disabled={saving}>
        <Text style={styles.secondaryActionText}>{saving ? "Working..." : "Preview booking"}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.primaryButton} onPress={handleCreate} disabled={saving}>
        <Text style={styles.primaryButtonText}>
          {saving ? "Creating..." : paymentMode === "cash_collected" ? "Confirm cash booking" : "Send payment link"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboardType,
  autoCapitalize,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: "default" | "number-pad" | "decimal-pad" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={[styles.input, multiline && styles.textArea]}
      />
    </View>
  );
}

function ModeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.modeButton, active && styles.modeButtonActive]} onPress={onPress}>
      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  content: {
    padding: 20,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#6B7280",
  },
  message: {
    color: "#B91C1C",
    fontSize: 13,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionGrid: {
    gap: 8,
  },
  option: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#FFFFFF",
  },
  optionActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF",
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  optionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: "#6B7280",
  },
  hint: {
    fontSize: 12,
    color: "#4B5563",
  },
  field: {
    gap: 5,
    flexGrow: 1,
    minWidth: 120,
  },
  label: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  modeButton: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  modeButtonActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF",
  },
  modeButtonText: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "700",
  },
  modeButtonTextActive: {
    color: "#3730A3",
  },
  previewBox: {
    borderWidth: 1,
    borderColor: "#C7D2FE",
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
    padding: 14,
  },
  previewTitle: {
    fontSize: 12,
    color: "#4338CA",
    fontWeight: "700",
  },
  previewAmount: {
    marginTop: 4,
    fontSize: 24,
    color: "#111827",
    fontWeight: "700",
  },
  previewText: {
    marginTop: 2,
    fontSize: 12,
    color: "#4B5563",
  },
  successBox: {
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    padding: 14,
  },
  successTitle: {
    color: "#15803D",
    fontSize: 14,
    fontWeight: "700",
  },
  successText: {
    marginTop: 3,
    color: "#166534",
    fontSize: 12,
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 13,
    backgroundColor: "#4F46E5",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryAction: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  secondaryActionText: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "700",
  },
});
