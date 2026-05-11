"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type Edge, type EdgeChange, type Node, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { MarketingTemplate, OrganizationOption, Segment, Workflow, WorkflowRun } from "@/lib/marketing";
import { formatDateTime, statusTone } from "@/lib/marketing";
import { cn } from "@/lib/utils";

const baseNodes: Node[] = [
  { id: "trigger", type: "default", position: { x: 0, y: 80 }, data: { label: "Trigger: segment entry", trigger: "segment_entry" } },
  { id: "stop", type: "default", position: { x: 420, y: 80 }, data: { label: "Stop" } },
];

const baseEdges: Edge[] = [{ id: "trigger-stop", source: "trigger", target: "stop" }];

export default function MarketingWorkflowsPage() {
  const [orgs, setOrgs] = useState<OrganizationOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [nodes, setNodes] = useState<Node[]>(baseNodes);
  const [edges, setEdges] = useState<Edge[]>(baseEdges);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("New workflow");

  const selectedSegment = segments[0]?.public_id || "";
  const selectedTemplate = templates[0]?.public_id || "";

  useEffect(() => {
    async function loadOrgs() {
      const token = getAccessToken() ?? undefined;
      const list = await apiFetch<OrganizationOption[]>("/api/orgs", { method: "GET" }, token);
      setOrgs(list);
      if (list[0]) setOrgId(list[0].public_id);
    }
    loadOrgs().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, []);

  async function loadAll(currentOrgId = orgId) {
    if (!currentOrgId) return;
    const token = getAccessToken() ?? undefined;
    const qs = `organization_public_id=${encodeURIComponent(currentOrgId)}`;
    const [workflowList, templateList, segmentList] = await Promise.all([
      apiFetch<Workflow[]>(`/api/marketing/workflows?${qs}`, { method: "GET" }, token),
      apiFetch<MarketingTemplate[]>(`/api/marketing/templates?${qs}`, { method: "GET" }, token),
      apiFetch<Segment[]>(`/api/marketing/segments?${qs}`, { method: "GET" }, token),
    ]);
    setWorkflows(workflowList);
    setTemplates(templateList);
    setSegments(segmentList);
  }

  useEffect(() => {
    loadAll().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load workflows"));
  }, [orgId]);

  function selectWorkflow(workflow: Workflow) {
    setSelected(workflow);
    setName(workflow.name);
    setNodes((workflow.graph.nodes || baseNodes).map((node) => ({ ...node, type: "default" })));
    setEdges(workflow.graph.edges || baseEdges);
    loadRuns(workflow.public_id).catch(() => null);
  }

  async function loadRuns(workflowPublicId: string) {
    const token = getAccessToken() ?? undefined;
    const result = await apiFetch<WorkflowRun[]>(`/api/marketing/workflows/${workflowPublicId}/runs`, { method: "GET" }, token);
    setRuns(result);
  }

  const graph = useMemo(() => ({
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.id === "trigger" ? "trigger" : String(node.data?.kind || node.data?.nodeType || node.id),
      position: node.position,
      data: node.data,
    })),
    edges,
  }), [nodes, edges]);

  const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge(connection, current)), []);
  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((current) => applyNodeChanges(changes, current)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes, current)), []);

  function addNode(kind: string) {
    const id = `${kind}-${Date.now()}`;
    const labels: Record<string, string> = {
      wait: "Wait 1 day",
      send_email: "Send email",
      condition: "Condition",
      notify_owner: "Notify owner",
      add_tag: "Add tag",
      stop: "Stop",
    };
    const data: Record<string, unknown> = { label: labels[kind] || kind, kind };
    if (kind === "wait") {
      data.amount = 1;
      data.unit = "days";
    }
    if (kind === "send_email") {
      data.template_public_id = selectedTemplate;
      data.sender_lane = "shared";
    }
    if (kind === "condition") {
      data.filters = {};
    }
    if (kind === "add_tag") {
      data.tag = "marketing-engaged";
    }
    if (kind === "trigger") {
      data.trigger = "segment_entry";
      data.segment_public_id = selectedSegment;
    }
    setNodes((current) => [...current, { id, type: "default", position: { x: 180 + current.length * 40, y: 80 + current.length * 35 }, data }]);
  }

  async function saveWorkflow() {
    const token = getAccessToken() ?? undefined;
    try {
      if (selected) {
        const updated = await apiFetch<Workflow>(
          `/api/marketing/workflows/${selected.public_id}`,
          { method: "PUT", body: JSON.stringify({ name, graph }) },
          token
        );
        setSelected(updated);
      } else {
        const created = await apiFetch<Workflow>(
          "/api/marketing/workflows",
          { method: "POST", body: JSON.stringify({ organization_public_id: orgId, name, graph }) },
          token
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
    if (!selected) return;
    const token = getAccessToken() ?? undefined;
    try {
      const updated = await apiFetch<Workflow>(`/api/marketing/workflows/${selected.public_id}/${path}`, { method: "POST" }, token).catch(() => null);
      setMessage(label);
      await loadAll();
      if (updated) setSelected(updated);
      await loadRuns(selected.public_id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `${label} failed`);
    }
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-textPrimary">Workflows</h2>
            <p className="text-textSecondary">Visual automations for segment entry, waits, conditions, email sends, tags, and stops.</p>
          </div>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="h-10 rounded-sm border border-border bg-surface px-3 text-sm">
            {orgs.map((org) => <option key={org.public_id} value={org.public_id}>{org.name}</option>)}
          </select>
        </div>

        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="p-3">
            <button type="button" onClick={() => { setSelected(null); setName("New workflow"); setNodes(baseNodes); setEdges(baseEdges); setRuns([]); }} className="mb-3 w-full rounded-sm border border-border px-3 py-2 text-left text-sm hover:bg-surface2">New workflow</button>
            <div className="grid gap-2">
              {workflows.map((workflow) => (
                <button key={workflow.public_id} type="button" onClick={() => selectWorkflow(workflow)} className={`rounded-sm border px-3 py-2 text-left text-sm ${selected?.public_id === workflow.public_id ? "border-accent bg-accentSubtle" : "border-border hover:bg-surface2"}`}>
                  <div className="font-medium text-textPrimary">{workflow.name}</div>
                  <div className="text-xs capitalize text-textMuted">{workflow.status}</div>
                </button>
              ))}
            </div>
          </Card>

          <div className="grid gap-4">
            <Card className="grid gap-3 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={saveWorkflow}>Save</Button>
                  <Button type="button" variant="secondary" onClick={() => action("publish", "Workflow published")} disabled={!selected}>Publish</Button>
                  <Button type="button" variant="secondary" onClick={() => action("activate", "Workflow activated")} disabled={!selected}>Activate</Button>
                  <Button type="button" variant="secondary" onClick={() => action("pause", "Workflow paused")} disabled={!selected}>Pause</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {["wait", "send_email", "condition", "notify_owner", "add_tag", "stop"].map((kind) => (
                  <Button key={kind} type="button" size="sm" variant="secondary" onClick={() => addNode(kind)}>{kind.replace("_", " ")}</Button>
                ))}
              </div>
            </Card>

            <div className="h-[520px] overflow-hidden rounded-md border border-border bg-white">
              <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView>
                <Background />
                <Controls />
              </ReactFlow>
            </div>

            {selected ? (
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="text-sm font-semibold text-textPrimary">Runs</div>
                  <span className={cn("rounded-sm border px-2 py-0.5 text-xs capitalize", statusTone(selected.status))}>{selected.status}</span>
                </div>
                <div className="grid gap-2 text-sm">
                  {runs.map((run) => (
                    <div key={run.public_id} className="grid gap-1 rounded-sm border border-border p-2 md:grid-cols-4">
                      <div className="text-textPrimary">{run.user_public_id}</div>
                      <div className="capitalize text-textSecondary">{run.status}</div>
                      <div className="text-textMuted">{run.current_node_id || "—"}</div>
                      <div className="text-textMuted">{formatDateTime(run.next_run_at)}</div>
                    </div>
                  ))}
                  {runs.length === 0 ? <div className="text-sm text-textMuted">No runs yet.</div> : null}
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
