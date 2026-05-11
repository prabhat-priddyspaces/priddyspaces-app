import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import {
  AssistantMessage,
  AssistantProposal,
  confirmAssistantProposal,
  dismissAssistantProposal,
  sendAssistantMessage,
} from "../lib/assistant";

function ProposalCard({
  proposal,
  onHandled,
}: {
  proposal: AssistantProposal;
  onHandled: (proposalId: string, status: string) => void;
}) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const expired = new Date(proposal.expires_at).getTime() < Date.now();
  const disabled = busy || expired || proposal.status !== "pending" || !token;

  async function act(kind: "confirm" | "dismiss") {
    if (!token) return;
    setBusy(true);
    setMessage("");
    try {
      const result =
        kind === "confirm"
          ? await confirmAssistantProposal(token, proposal.proposal_id)
          : await dismissAssistantProposal(token, proposal.proposal_id);
      onHandled(proposal.proposal_id, result.status);
      setMessage(result.status);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.proposal}>
      <Text style={styles.proposalTitle}>{proposal.summary}</Text>
      <Text style={styles.proposalKind}>{proposal.kind}</Text>
      {proposal.warnings.map((warning) => (
        <Text key={warning} style={styles.warning}>
          {warning}
        </Text>
      ))}
      <View style={styles.proposalActions}>
        <TouchableOpacity disabled={disabled} style={[styles.smallButton, disabled && styles.disabled]} onPress={() => act("confirm")}>
          <Text style={styles.smallButtonText}>Confirm</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={disabled} style={[styles.secondaryButton, disabled && styles.disabled]} onPress={() => act("dismiss")}>
          <Text style={styles.secondaryButtonText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
      {expired ? <Text style={styles.error}>This proposal expired.</Text> : null}
      {message ? <Text style={styles.meta}>{message}</Text> : null}
    </View>
  );
}

function MessageRow({
  item,
  onProposalHandled,
}: {
  item: AssistantMessage;
  onProposalHandled: (proposalId: string, status: string) => void;
}) {
  const isUser = item.role === "user";
  return (
    <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={isUser ? styles.userText : styles.assistantText}>{item.content}</Text>
        {!isUser && item.citations.length ? (
          <View style={styles.citations}>
            {item.citations.map((citation) => (
              <Text key={`${citation.type}-${citation.id}`} style={styles.citation}>
                {citation.title || citation.type}
              </Text>
            ))}
          </View>
        ) : null}
        {!isUser
          ? item.proposals.map((proposal) => (
              <ProposalCard key={proposal.proposal_id} proposal={proposal} onHandled={onProposalHandled} />
            ))
          : null}
      </View>
    </View>
  );
}

export function AssistantScreen() {
  const { token } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const text = input.trim();
    if (!text || !token) return;
    setInput("");
    setError("");
    setMessages((current) => [
      ...current,
      { public_id: `local_${Date.now()}`, role: "user", content: text, citations: [], proposals: [] },
    ]);
    setLoading(true);
    try {
      const response = await sendAssistantMessage({ token, message: text, conversationId });
      if (response.conversation_public_id) setConversationId(response.conversation_public_id);
      if (response.message) setMessages((current) => [...current, response.message as AssistantMessage]);
      if (!response.message && response.disabled_reason) {
        setMessages((current) => [
          ...current,
          {
            public_id: `disabled_${Date.now()}`,
            role: "assistant",
            content: response.disabled_reason || "Assistant unavailable",
            citations: [],
            proposals: [],
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assistant request failed");
    } finally {
      setLoading(false);
    }
  }

  function onProposalHandled(proposalId: string, status: string) {
    setMessages((current) =>
      current.map((message) => ({
        ...message,
        proposals: message.proposals.map((proposal) =>
          proposal.proposal_id === proposalId ? { ...proposal, status } : proposal,
        ),
      })),
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        contentContainerStyle={styles.list}
        data={messages}
        keyExtractor={(item) => item.public_id}
        renderItem={({ item }) => <MessageRow item={item} onProposalHandled={onProposalHandled} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>PriddySpaces Assistant</Text>
            <Text style={styles.emptyText}>Ask about bookings, policies, billing, spaces, or owner operations.</Text>
          </View>
        }
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask PriddySpaces..."
          multiline
        />
        <TouchableOpacity style={[styles.sendButton, (!input.trim() || loading) && styles.disabled]} disabled={!input.trim() || loading} onPress={send}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  list: { padding: 16, gap: 12 },
  empty: { borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff", borderRadius: 8, padding: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  emptyText: { marginTop: 6, color: "#6b7280" },
  messageRow: { flexDirection: "row" },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  bubble: { maxWidth: "86%", borderRadius: 8, padding: 12 },
  userBubble: { backgroundColor: "#4f46e5" },
  assistantBubble: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb" },
  userText: { color: "#fff" },
  assistantText: { color: "#111827" },
  citations: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  citation: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, color: "#6b7280", fontSize: 12 },
  proposal: { marginTop: 10, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#f9fafb" },
  proposalTitle: { color: "#111827", fontWeight: "700" },
  proposalKind: { color: "#6b7280", fontSize: 12, marginTop: 2 },
  warning: { color: "#d97706", fontSize: 12, marginTop: 6 },
  proposalActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  smallButton: { backgroundColor: "#4f46e5", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  smallButtonText: { color: "#fff", fontWeight: "700" },
  secondaryButton: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  secondaryButtonText: { color: "#111827", fontWeight: "700" },
  meta: { marginTop: 6, color: "#6b7280", fontSize: 12 },
  inputRow: { flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: "#e5e7eb", backgroundColor: "#fff" },
  input: { flex: 1, maxHeight: 120, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#fff" },
  sendButton: { minWidth: 72, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#4f46e5", paddingHorizontal: 12 },
  sendText: { color: "#fff", fontWeight: "700" },
  disabled: { opacity: 0.5 },
  error: { color: "#dc2626", paddingHorizontal: 16, paddingVertical: 6 },
});
