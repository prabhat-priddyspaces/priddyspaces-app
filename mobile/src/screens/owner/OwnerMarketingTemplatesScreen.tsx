import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRoute } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Organization = { public_id: string; name: string };

type MarketingTemplate = {
  public_id: string;
  name: string;
  subject: string;
  html_body: string | null;
  text_body: string | null;
  category: string | null;
  variables: string[];
  is_archived: boolean;
};

type Preview = {
  subject: string;
  html_body: string | null;
  text_body: string | null;
  missing_values: string[];
} | null;

const SHORTCODE_GROUPS: Array<{ label: string; items: Array<[string, string]> }> = [
  {
    label: "Member",
    items: [
      ["{{ member.first_name }}", "First name"],
      ["{{ member.last_name }}", "Last name"],
      ["{{ member.full_name }}", "Full name"],
      ["{{ member.email }}", "Email"],
      ["{{ member.phone }}", "Phone"],
      ["{{ member.company }}", "Company"],
    ],
  },
  {
    label: "Business",
    items: [
      ["{{ business.name }}", "Organization"],
      ["{{ business.address }}", "Address"],
      ["{{ business.city }}", "City"],
      ["{{ business.state }}", "State"],
      ["{{ business.postal_code }}", "Postal code"],
      ["{{ business.support_email }}", "Support email"],
      ["{{ business.phone }}", "Phone"],
      ["{{ business.website }}", "Website"],
    ],
  },
  {
    label: "Owner",
    items: [
      ["{{ owner.full_name }}", "Owner"],
      ["{{ owner.email }}", "Owner email"],
      ["{{ owner.phone }}", "Owner phone"],
    ],
  },
  {
    label: "Location",
    items: [
      ["{{ location.name }}", "Location"],
      ["{{ location.address }}", "Address"],
      ["{{ location.city }}", "City"],
      ["{{ location.state }}", "State"],
      ["{{ location.postal_code }}", "Postal code"],
      ["{{ location.phone }}", "Phone"],
      ["{{ location.email }}", "Email"],
    ],
  },
  {
    label: "Reservation",
    items: [
      ["{{ booking.space_name }}", "Space"],
      ["{{ booking.location_name }}", "Location"],
      ["{{ booking.start_date }}", "Start date"],
      ["{{ booking.start_time }}", "Start time"],
      ["{{ booking.end_date }}", "End date"],
      ["{{ booking.end_time }}", "End time"],
      ["{{ booking.number }}", "Booking ID"],
      ["{{ booking.request_number }}", "Request ID"],
    ],
  },
  {
    label: "Invoice",
    items: [
      ["{{ invoice.number }}", "Invoice ID"],
      ["{{ invoice.amount }}", "Invoice amount"],
      ["{{ invoice.balance_due }}", "Balance due"],
      ["{{ invoice.status }}", "Invoice status"],
      ["{{ invoice.due_date }}", "Due date"],
    ],
  },
  {
    label: "Payment",
    items: [
      ["{{ payment.amount }}", "Payment amount"],
      ["{{ payment.status }}", "Payment status"],
      ["{{ payment.failure_reason }}", "Decline reason"],
      ["{{ payment.provider }}", "Provider"],
    ],
  },
  {
    label: "Card",
    items: [
      ["{{ card.brand }}", "Card brand"],
      ["{{ card.last4 }}", "Card last4"],
      ["{{ card.expiry }}", "Card expiry"],
    ],
  },
  {
    label: "Links",
    items: [
      ["{{ links.booking }}", "Booking link"],
      ["{{ links.invoice }}", "Invoice link"],
      ["{{ links.retry_payment }}", "Retry payment"],
      ["{{ links.update_payment_method }}", "Update card"],
      ["{{ links.access_pass }}", "Access pass"],
    ],
  },
];

const DEFAULT_FORM = {
  name: "",
  subject: "",
  category: "general",
  html_body:
    '<p>Hi {{ member.first_name }},</p><p></p><p><a href="{{ links.unsubscribe }}">Unsubscribe</a></p>',
  text_body: "Hi {{ member.first_name }},\n\nUnsubscribe: {{ links.unsubscribe }}",
};

const SUCCESS_MESSAGES = new Set(["Template saved", "Test send queued"]);

export function OwnerMarketingTemplatesScreen() {
  const { token } = useAuth();
  const route = useRoute<any>();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState<string>(route.params?.orgId || "");
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [selected, setSelected] = useState<MarketingTemplate | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [preview, setPreview] = useState<Preview>(null);
  const [testEmail, setTestEmail] = useState("");
  const [activeBody, setActiveBody] = useState<"html_body" | "text_body">("html_body");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token)
      .then((list) => {
        setOrgs(list);
        setOrgId((current) => current || list[0]?.public_id || "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, [token]);

  const loadTemplates = useCallback(async () => {
    if (!token || !orgId) return;
    const list = await apiFetch<MarketingTemplate[]>(
      `/api/marketing/templates?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "GET" },
      token,
    );
    setTemplates(list);
  }, [token, orgId]);

  useEffect(() => {
    setLoading(true);
    loadTemplates()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load templates"))
      .finally(() => setLoading(false));
  }, [loadTemplates]);

  function edit(template: MarketingTemplate) {
    setSelected(template);
    setPreview(null);
    setForm({
      name: template.name,
      subject: template.subject,
      category: template.category || "general",
      html_body: template.html_body || "",
      text_body: template.text_body || "",
    });
  }

  function startNew() {
    setSelected(null);
    setPreview(null);
    setForm(DEFAULT_FORM);
  }

  // Mobile inserts at the end of the active body (no caret tracking like web's textarea).
  function insertShortcode(shortcode: string) {
    setForm((current) => ({ ...current, [activeBody]: `${current[activeBody] || ""}${shortcode}` }));
  }

  async function save() {
    if (!token || !orgId) return;
    setMessage("");
    try {
      if (selected) {
        const updated = await apiFetch<MarketingTemplate>(
          `/api/marketing/templates/${selected.public_id}`,
          { method: "PUT", body: JSON.stringify(form) },
          token,
        );
        setSelected(updated);
      } else {
        const created = await apiFetch<MarketingTemplate>(
          "/api/marketing/templates",
          { method: "POST", body: JSON.stringify({ ...form, organization_public_id: orgId }) },
          token,
        );
        setSelected(created);
      }
      setMessage("Template saved");
      await loadTemplates();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function previewTemplate() {
    if (!token || !selected) return;
    try {
      const result = await apiFetch<Preview>(
        `/api/marketing/templates/${selected.public_id}/preview`,
        { method: "POST", body: JSON.stringify({ organization_public_id: orgId }) },
        token,
      );
      setPreview(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Preview failed");
    }
  }

  async function sendTest() {
    if (!token || !selected) return;
    try {
      await apiFetch(
        `/api/marketing/templates/${selected.public_id}/test-send`,
        {
          method: "POST",
          body: JSON.stringify({ organization_public_id: orgId, to_email: testEmail || undefined }),
        },
        token,
      );
      setMessage("Test send queued");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Test send failed");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Templates</Text>
      <Text style={styles.subtitle}>Subject and email bodies with safe Priddyspaces variables.</Text>

      {orgs.length > 1 ? (
        <View style={styles.chipRow}>
          {orgs.map((org) => (
            <Chip
              key={org.public_id}
              label={org.name}
              active={orgId === org.public_id}
              accessibilityLabel={`Organization ${org.name}`}
              onPress={() => setOrgId(org.public_id)}
            />
          ))}
        </View>
      ) : null}

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={SUCCESS_MESSAGES.has(message) ? styles.successMessage : styles.message}>
          {message}
        </Text>
      ) : null}

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={startNew}
          accessibilityRole="button"
          accessibilityLabel="New template"
        >
          <Text style={styles.secondaryButtonText}>New template</Text>
        </TouchableOpacity>
        {templates.map((template) => (
          <TouchableOpacity
            key={template.public_id}
            style={[styles.listRow, selected?.public_id === template.public_id && styles.listRowActive]}
            onPress={() => edit(template)}
            accessibilityRole="button"
            accessibilityLabel={`Edit template ${template.name}`}
          >
            <Text style={styles.listTitle}>{template.name}</Text>
            <Text style={styles.mutedText}>{template.subject}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{selected ? "Edit template" : "Create template"}</Text>
        <Field label="Template name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field
          label="Category"
          value={form.category}
          onChange={(category) => setForm({ ...form, category })}
        />
        <Field label="Subject" value={form.subject} onChange={(subject) => setForm({ ...form, subject })} />
        <View style={styles.chipRow}>
          <Chip
            label="Edit HTML body"
            active={activeBody === "html_body"}
            accessibilityLabel="Edit HTML body"
            onPress={() => setActiveBody("html_body")}
          />
          <Chip
            label="Edit text body"
            active={activeBody === "text_body"}
            accessibilityLabel="Edit text body"
            onPress={() => setActiveBody("text_body")}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>HTML body</Text>
          <TextInput
            accessibilityLabel="HTML body"
            style={[styles.input, styles.multiline]}
            value={form.html_body}
            onChangeText={(html_body) => setForm({ ...form, html_body })}
            onFocus={() => setActiveBody("html_body")}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Text body</Text>
          <TextInput
            accessibilityLabel="Text body"
            style={[styles.input, styles.multiline]}
            value={form.text_body}
            onChangeText={(text_body) => setForm({ ...form, text_body })}
            onFocus={() => setActiveBody("text_body")}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={save}
            accessibilityRole="button"
            accessibilityLabel="Save template"
          >
            <Text style={styles.primaryButtonText}>{selected ? "Save template" : "Create template"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, !selected && styles.disabled]}
            onPress={previewTemplate}
            disabled={!selected}
            accessibilityRole="button"
            accessibilityLabel="Preview template"
          >
            <Text style={styles.secondaryButtonText}>Preview</Text>
          </TouchableOpacity>
        </View>
        <Field
          label="Test email (optional)"
          value={testEmail}
          onChange={setTestEmail}
        />
        <TouchableOpacity
          style={[styles.secondaryButton, !selected && styles.disabled]}
          onPress={sendTest}
          disabled={!selected}
          accessibilityRole="button"
          accessibilityLabel="Test send"
        >
          <Text style={styles.secondaryButtonText}>Test send</Text>
        </TouchableOpacity>
        {selected?.variables?.length ? (
          <Text style={styles.mutedText}>Variables: {selected.variables.join(", ")}</Text>
        ) : null}
        {preview ? (
          <View style={styles.previewBox}>
            <Text style={styles.listTitle}>{preview.subject}</Text>
            {preview.missing_values.length ? (
              <Text style={styles.message}>{preview.missing_values.join(", ")}</Text>
            ) : null}
            <Text style={styles.previewBody}>{preview.text_body || preview.html_body || ""}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Short codes</Text>
        <Text style={styles.mutedText}>Taps append to the {activeBody === "html_body" ? "HTML" : "text"} body.</Text>
        {SHORTCODE_GROUPS.map((group) => (
          <View key={group.label} style={{ gap: 6 }}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            <View style={styles.chipRow}>
              {group.items.map(([shortcode, label]) => (
                <Chip
                  key={shortcode}
                  label={label}
                  active={false}
                  accessibilityLabel={`Insert ${shortcode}`}
                  onPress={() => insertShortcode(shortcode)}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
      />
    </View>
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
  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase"
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
    fontSize: 13,
    color: "#111827",
    backgroundColor: "#FFFFFF"
  },
  multiline: {
    minHeight: 140,
    textAlignVertical: "top"
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
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF"
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "700"
  },
  disabled: {
    opacity: 0.5
  },
  listRow: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 3
  },
  listRowActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF"
  },
  listTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827"
  },
  previewBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 6,
    backgroundColor: "#F9FAFB"
  },
  previewBody: {
    fontSize: 12,
    color: "#374151"
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
