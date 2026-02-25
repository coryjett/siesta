/**
 * TypeScript types for MCP tool inputs/outputs.
 * Derived from the portfolio-analyzer MCP server tool schemas.
 */

// ── Account types ──

export interface McpAccount {
  id: string;
  name: string;
  arr: number | null;
  health_status: 'healthy' | 'needs_attention' | 'at_risk';
  csm_owner: string | null;
  cse_owner: string | null;
  renewal_date: string | null;
  region: string | null;
  products: string[];
  lifecycle_phase: string | null;
  production_status: string | null;
}

export interface McpAccountDetail extends McpAccount {
  open_issues_count: number;
  recent_interactions: McpInteraction[];
  top_contacts: McpContact[];
  sentiment_summary: {
    overall: string;
    trend: string;
  } | null;
}

export interface McpAccountInfo {
  id: string;
  name: string;
  arr: number | null;
  health_status: string;
  csm_owner: string | null;
  cse_owner: string | null;
  renewal_date: string | null;
  region: string | null;
  products: string[];
  lifecycle_phase: string | null;
  production_status: string | null;
  description: string | null;
}

// ── Contact types ──

export interface McpContact {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  phone: string | null;
  gong_call_count: number;
  email_count: number;
  last_interaction_date: string | null;
}

// ── Interaction types ──

export interface McpInteraction {
  id: string;
  source_type: 'email' | 'call' | 'meeting' | 'ticket';
  date: string;
  title: string;
  preview: string | null;
  sentiment: string | null;
  participants: string[];
}

export interface McpInteractionDetail {
  id: string;
  source_type: string;
  date: string;
  title: string;
  content: string;
  participants: Array<{
    name: string;
    email: string | null;
    role: string | null;
  }>;
  sentiment: string | null;
  summary: string | null;
}

// ── Opportunity types ──

export interface McpOpportunity {
  id: string;
  name: string;
  stage: string;
  amount: number | null;
  close_date: string | null;
  probability: number | null;
  owner: string | null;
  type: string | null;
  is_closed: boolean;
  is_won: boolean;
}

// ── Issue types ──

export interface McpIssue {
  id: string;
  title: string;
  status: string;
  source_system: 'zendesk' | 'github';
  priority: string | null;
  assignee: string | null;
  created_date: string;
  updated_date: string | null;
}

// ── Task types ──

export interface McpTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  assignee: string | null;
}

// ── Sentiment types ──

export interface McpSentimentTrend {
  period: string;
  score: number;
  label: string;
}

export interface McpSentimentData {
  trends: McpSentimentTrend[];
  drivers: Array<{
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    description: string;
  }>;
  overall: string;
}

// ── Portfolio types ──

export interface McpPortfolioStats {
  total_accounts: number;
  total_arr: number;
  health_distribution: {
    healthy: { count: number; arr: number };
    needs_attention: { count: number; arr: number };
    at_risk: { count: number; arr: number };
  };
}

// ── Search types ──

export interface McpSearchResult {
  account_id: string;
  account_name: string;
  interaction_id: string;
  snippet: string;
  score: number;
  source_type: string;
  date: string;
  title: string;
}

export interface McpNegativeInteraction {
  account_id: string;
  account_name: string;
  interaction_id: string;
  source_type: string;
  date: string;
  title: string;
  preview: string | null;
  sentiment: string;
}

// ── Architecture types ──

export interface McpArchitectureDoc {
  content: string;
  last_updated: string | null;
}

// ── MCP Tool schema types ──

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ── JSON-RPC types ──

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}
