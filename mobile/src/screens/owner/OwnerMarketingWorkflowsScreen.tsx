import { useCallback, useEffect, useMemo, useState } from "react";
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
type MarketingTemplate = { public_id: string; name: string };
type Segment = { public_id: string; name: string };

type GraphNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

type Graph = { nodes: GraphNode[]; edges: Array<{ id: string; source: string; target: string }> };

type Workflow = {
  public_id: string;
  name: string;
  status: string;
  graph: Graph;
};

type WorkflowRun = {
  public_id: string;
  user_public_id: string;
  status: string;
  current_node_id: string | null;
  next_run_at: string | null;
};

type Step = { kind: string; data: Record<string, unknown> };

const STEP_KINDS = ["wait", "send_email", "condition", "notify_owner", "add_tag", "stop"];

const STEP_LABELS: Record<string, string> = {
  wait: "Wait 1 day",
  send_email: "Send email",
  condition: "Condition",
  notify_owner: "Notify owner",
  add_tag: "Add tag",
  stop: "Stop",
};

const SUCCESS_MESSAGES = new Set([
  "Workflow saved",
  "Workflow published",
  "Workflow activated",
  "Workflow paused",
]);

export function OwnerMarketingWorkflowsScreen() {
  const { token } = useAuth();
  const route = useRoute<any>();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState<string>(route.params?.orgId || "");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [name, setName] = useState("New workflow");
  const [segmentId, setSegmentId] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
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

  const loadAll = useCallback(async () => {
    if (!token || !orgId) return;
    const qs = `organization_public_id=${encodeURIComponent(orgId)}`;
    const [workflowList, templateList, segmentList] = await Promise.all([
      apiFetch<Workflow[]>(`/api/marketing/workflows?${qs}`, { method: "GET" }, token),
      apiFetch<MarketingTemplate[]>(`/api/marketing/templates?${qs}`, { method: "GET" }, token),
      apiFetch<Segment[]>(`/api/marketing/segments?${qs}`, { method: "GET" }, token),
    ]);
    setWorkflows(workflowList);
    setTemplates(templateList);
    setSegments(segmentList);
    setSegmentId((current) => current || segmentList[0]?.public_id || "");
  }, [token, orgId]);

  useEffect(() => {
    setLoading(true);
    loadAll()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load workflows"))
      .finally(() => setLoading(false));
  }, [loadAll]);

  // Linear chain trigger → steps → stop, emitting web's graph shape
  // (RN replaces web's drag canvas with an ordered step list — same JSON).
  const graph = useMemo<Graph>(() => {
    const nodes: GraphNode[] = [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 0, y: 80 },
        data: {
          label: "Trigger: segment entry",
          trigger: "segment_entry",
          segment_public_id: segmentId || undefined,
        },
      },
      ...steps.map((step, index) => ({
        id: `${step.kind}-${index + 1}`,
        type: step.kind,
        position: { x: 180 + index * 40, y: 80 + index * 35 },
        data: { label: STEP_LABELS[step.kind] || step.kind, kind: step.kind, ...step.data },
      })),
      { id: "stop", type: "stop", position: { x: 420, y: 80 }, data: { label: "Stop" } },
    ];
    const edges = nodes.slice(0, -1).map((node, index) => ({
      id: `${node.id}-${nodes[index + 1].id}`,
      source: node.id,
      target: nodes[index + 1].id,
    }));
    return { nodes, edges };
  }, [steps, segmentId]);

  function addStep(kind: string) {
    const data: Record<string, unknown> = {};
    if (kind === "wait") {
      data.amount = 1;
      data.unit = "days";
    }
    if (kind === "send_email") {
      data.template_public_id = templates[0]?.public_id || "";
      data.sender_lane = "shared";
    }
    if (kind === "condition") data.filters = {};
    if (kind === "add_tag") data.tag = "marketing-engaged";
    setSteps((current) => [...current, { kind, data }]);
  }

  function selectWorkflow(workflow: Workflow) {
    setSelected(workflow);
    setName(workflow.name);
    const nodes = workflow.graph?.nodes || [];
    const trigger = nodes.find((node) => node.id === "trigger");
    setSegmentId(String(trigger?.data?.segment_public_id || segments[0]?.public_id || ""));
    setSteps(
      nodes
        .filter((node) => node.id !== "trigger" && node.id !== "stop")
        .map((node) => ({
          kind: String(node.data?.kind || node.type),
          data: Object.fromEntries(
            Object.entries(node.data || {}).filter(([key]) => !["label", "kind"].includes(key)),
          ),
        })),
    );
    loadRuns(workflow.public_id).catch(() => null);
  }

  async function loadRuns(workflowPublicId: string) {
    if (!token) return;
    const result = await apiFetch<WorkflowRun[]>(
      `/api/marketing/workflows/${workflowPublicId}/runs`,
      { method: "GET" },
      token,
    );
    setRuns(result);
  }

  async function saveWorkflow() {
    if (!token) return;
    setMessage("");
    try {
      if (selected) {
        const updated = await apiFetch<Workflow>(
          `/api/marketing/workflows/${selected.public_id}`,
          { method: "PUT", body: JSON.stringify({ name, graph }) },
          token,
        );
        setSelected(updated);
      } else {
        const created = await apiFetch<Workflow>(
          "/api/marketing/workflows",
          { method: "POST", body: JSON.stringify({ organization_public_id: orgId, name, graph }) },
          token,
        );
        setSelected(created);
      }
      setMessage("Workflow saved");
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function action(path: string, label: string) {
    if (!token || !selected) return;
    setMessage("");
    try {
      const updated = await apiFetch<Workflow>(
        `/api/marketing/workflows/${selected.public_id}/${path}`,
        { method: "POST" },
        token,
      );
      if (updated) setSelected(updated);
      setMessage(label);
      await loadRuns(selected.public_id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `${label} failed`);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Workflows</Text>
      <Text style={styles.subtitle}>
        Automations for segment entry, waits, conditions, email sends, tags, and stops.
      </Text>

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
          onPress={() => {
            setSelected(null);
            setName("New workflow");
            setSteps([]);
            setRuns([]);
          }}
          accessibilityRole="button"
          accessibilityLabel="New workflow"
        >
          <Text style={styles.secondaryButtonText}>New workflow</Text>
        </TouchableOpacity>
        {workflows.map((workflow) => (
          <TouchableOpacity
            key={workflow.public_id}
            style={[styles.listRow, selected?.public_id === workflow.public_id && styles.listRowActive]}
            onPress={() => selectWorkflow(workflow)}
            accessibilityRole="button"
            accessibilityLabel={`Edit workflow ${workflow.name}`}
          >
            <Text style={styles.listTitle}>{workflow.name}</Text>
            <Text style={styles.mutedText}>{workflow.status}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Field label="Workflow name" value={name} onChange={setName} />
        <Text style={styles.label}>Trigger: segment entry</Text>
        <View style={styles.chipRow}>
          {segments.map((segment) => (
            <Chip
              key={segment.public_id}
              label={segment.name}
              active={segmentId === segment.public_id}
              accessibilityLabel={`Trigger segment ${segment.name}`}
              onPress={() => setSegmentId(segment.public_id)}
            />
          ))}
        </View>
        <Text style={styles.label}>Steps (in order)</Text>
        {steps.length === 0 ? <Text style={styles.mutedText}>Trigger → Stop (no steps yet).</Text> : null}
        {steps.map((step, index) => (
          <View key={`${step.kind}-${index}`} style={styles.listRow}>
            <Text style={styles.listTitle}>
              {index + 1}. {STEP_LABELS[step.kind] || step.kind}
            </Text>
            {step.kind === "send_email" ? (
              <Text style={styles.mutedText}>
                Template {String(step.data.template_public_id || "first template")} • shared lane
              </Text>
            ) : null}
            {step.kind === "wait" ? (
              <Text style={styles.mutedText}>
                {String(step.data.amount)} {String(step.data.unit)}
              </Text>
            ) : null}
            {step.kind === "add_tag" ? (
              <Text style={styles.mutedText}>Tag: {String(step.data.tag)}</Text>
            ) : null}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setSteps((current) => current.filter((_, i) => i !== index))}
              accessibilityRole="button"
              accessibilityLabel={`Remove step ${index + 1}`}
            >
              <Text style={styles.secondaryButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
        <Text style={styles.label}>Add step</Text>
        <View style={styles.chipRow}>
          {STEP_KINDS.map((kind) => (
            <Chip
              key={kind}
              label={kind.replace(/_/g, " ")}
              active={false}
              accessibilityLabel={`Add ${kind}`}
              onPress={() => addStep(kind)}
            />
          ))}
        </View>
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={saveWorkflow}
            accessibilityRole="button"
            accessibilityLabel="Save workflow"
          >
            <Text style={styles.primaryButtonText}>Save</Text>
          </TouchableOpacity>
          {(
            [
              ["publish", "Workflow published", "Publish"],
              ["activate", "Workflow activated", "Activate"],
              ["pause", "Workflow paused", "Pause"],
            ] as const
          ).map(([path, label, text]) => (
            <TouchableOpacity
              key={path}
              style={[styles.secondaryButton, !selected && styles.disabled]}
              onPress={() => action(path, label)}
              disabled={!selected}
              accessibilityRole="button"
              accessibilityLabel={text}
            >
              <Text style={styles.secondaryButtonText}>{text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {selected ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Runs • {selected.status}
          </Text>
          {runs.length === 0 ? <Text style={styles.mutedText}>No runs yet.</Text> : null}
          {runs.map((run) => (
            <View key={run.public_id} style={styles.listRow}>
              <Text style={styles.listTitle}>{run.user_public_id}</Text>
              <Text style={styles.mutedText}>
                {run.status} • {run.current_node_id || "—"}
                {run.next_run_at ? ` • next ${new Date(run.next_run_at).toLocaleString()}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
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
      <TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChange} />
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
    fontWeight: "700",
    textTransform: "capitalize"
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
    color: "#111827",
    textTransform: "capitalize"
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF"
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 12,
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
    gap: 6
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
