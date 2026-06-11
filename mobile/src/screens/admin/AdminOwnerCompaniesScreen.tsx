import { useCallback, useEffect, useState } from "react";
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

type OwnerCompany = {
  public_id: string;
  name: string;
  display_name: string | null;
  business_email: string | null;
  review_status: string;
  review_notes: string | null;
  commission_override_pct: number | null;
  payment_status: string;
  payment_blockers: string[];
  marketplace_visible_listings: number;
  payment_hidden_listings: number;
  locations: number;
  listings: number;
  owner: { email: string | null; name: string | null };
};

export function AdminOwnerCompaniesScreen() {
  const { token, me } = useAuth();
  const [companies, setCompanies] = useState<OwnerCompany[]>([]);
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const canEdit = me?.platform_role === "superadmin" || me?.platform_role === "admin";

  const load = useCallback(
    async (search: string) => {
      if (!token) return;
      const q = search.trim();
      const path = q
        ? `/api/admin/owner-companies?q=${encodeURIComponent(q)}`
        : "/api/admin/owner-companies";
      const result = await apiFetch<OwnerCompany[]>(path, { method: "GET" }, token);
      setCompanies(result);
      setNotes(Object.fromEntries(result.map((c) => [c.public_id, c.review_notes || ""])));
      setOverrides(
        Object.fromEntries(
          result.map((c) => [
            c.public_id,
            c.commission_override_pct != null ? String(c.commission_override_pct) : "",
          ]),
        ),
      );
    },
    [token],
  );

  useEffect(() => {
    setLoading(true);
    load("")
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load companies"))
      .finally(() => setLoading(false));
  }, [load]);

  async function updateCompany(publicId: string, reviewStatus: string | null) {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(
        `/api/admin/owner-companies/${publicId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            review_status: reviewStatus,
            review_notes: notes[publicId] || null,
            commission_override_pct:
              (overrides[publicId] ?? "") === "" ? null : Number(overrides[publicId]),
          }),
        },
        token,
      );
      await load(query);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Owner Companies</Text>
      <Text style={styles.subtitle}>Approve, reject, and manage marketplace commission overrides.</Text>

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search companies"
          style={styles.input}
          placeholder="Search company"
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={() => load(query).catch((err) => setMessage(String(err)))}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.list}>
        {companies.length === 0 && !loading ? <Text style={styles.mutedText}>No companies.</Text> : null}
        {companies.map((company) => (
          <View key={company.public_id} style={styles.card}>
            <Text style={styles.cardTitle}>{company.display_name || company.name}</Text>
            <Text style={styles.mutedText}>
              {company.owner.name || company.owner.email || "Owner"} •{" "}
              {company.business_email || "no business email"}
            </Text>
            <Text style={styles.mutedText}>
              Review {company.review_status} • Payments {company.payment_status}
              {company.commission_override_pct != null
                ? ` • ${company.commission_override_pct}% override`
                : ""}
            </Text>
            <Text style={styles.mutedText}>
              {company.locations} locations • {company.listings} listings •{" "}
              {company.marketplace_visible_listings} visible / {company.payment_hidden_listings} hidden
            </Text>
            {company.payment_blockers.length > 0 ? (
              <Text style={styles.message}>{company.payment_blockers.join(" • ")}</Text>
            ) : null}
            {canEdit ? (
              <>
                <TextInput
                  accessibilityLabel={`Review notes ${company.public_id}`}
                  style={styles.input}
                  placeholder="Review notes"
                  placeholderTextColor="#9CA3AF"
                  value={notes[company.public_id] || ""}
                  onChangeText={(value) =>
                    setNotes((current) => ({ ...current, [company.public_id]: value }))
                  }
                />
                <TextInput
                  accessibilityLabel={`Commission override ${company.public_id}`}
                  style={styles.input}
                  placeholder="Commission override % (blank = default)"
                  placeholderTextColor="#9CA3AF"
                  value={overrides[company.public_id] || ""}
                  onChangeText={(value) =>
                    setOverrides((current) => ({ ...current, [company.public_id]: value }))
                  }
                  keyboardType="number-pad"
                />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(
                    [
                      ["approved", "Approve"],
                      ["rejected", "Reject"],
                      [null, "Save notes"],
                    ] as const
                  ).map(([status, label]) => (
                    <TouchableOpacity
                      key={label}
                      style={styles.searchButton}
                      onPress={() => updateCompany(company.public_id, status)}
                      accessibilityRole="button"
                      accessibilityLabel={`${label} ${company.public_id}`}
                    >
                      <Text style={styles.searchButtonText}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
