export interface AssistantCitation {
  type: string;
  id: string;
  url: string;
  title?: string | null;
}

export interface AssistantProposal {
  proposal_id: string;
  kind: string;
  summary: string;
  endpoint: { method: string; path: string };
  payload: Record<string, unknown>;
  warnings: string[];
  expires_at: string;
  status: string;
}

export interface AssistantMessage {
  public_id: string;
  role: string;
  content: string;
  citations: AssistantCitation[];
  proposals: AssistantProposal[];
  created_at?: string | null;
}

export interface AssistantChatResponse {
  enabled: boolean;
  disabled_reason?: string | null;
  conversation_public_id?: string | null;
  guest_id?: string | null;
  message?: AssistantMessage | null;
  rate_limited: boolean;
  cost_capped: boolean;
}

export interface AssistantStatus {
  enabled: boolean;
  primary_model: string;
  summary_model: string;
}

export interface AssistantPolicy {
  public_id: string;
  scope_type: string;
  scope_public_id: string;
  category: string;
  title: string;
  body: string;
  source_url?: string | null;
  is_active: boolean;
  updated_at?: string | null;
}
