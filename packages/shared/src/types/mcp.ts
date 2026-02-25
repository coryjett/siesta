// ── Account types ──

export interface Account {
  id: string;
  name: string;
  arr: number | null;
  openPipeline: number | null;
  healthStatus: 'healthy' | 'needs_attention' | 'at_risk';
  csmOwner: string | null;
  cseOwner: string | null;
  renewalDate: string | null;
  region: string | null;
  products: string[];
  lifecyclePhase: string | null;
  productionStatus: string | null;
}

export interface AccountDetail extends Account {
  openIssuesCount: number;
  recentInteractions: Interaction[];
  topContacts: Contact[];
  sentimentSummary: {
    overall: string;
    trend: string;
  } | null;
  description: string | null;
}

// ── Contact types ──

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  phone: string | null;
  gongCallCount: number;
  emailCount: number;
  lastInteractionDate: string | null;
}

// ── Interaction types ──

export type InteractionSourceType = 'email' | 'call' | 'meeting' | 'ticket';

export interface Interaction {
  id: string;
  sourceType: InteractionSourceType;
  date: string;
  title: string;
  preview: string | null;
  sentiment: string | null;
  participants: string[];
}

export interface InteractionDetail {
  id: string;
  sourceType: string;
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

export interface Opportunity {
  id: string;
  name: string;
  stage: string;
  amount: number | null;
  closeDate: string | null;
  probability: number | null;
  owner: string | null;
  type: string | null;
  isClosed: boolean;
  isWon: boolean;
}

// ── Issue types ──

export interface Issue {
  id: string;
  title: string;
  status: string;
  sourceSystem: 'zendesk' | 'github';
  priority: string | null;
  assignee: string | null;
  createdDate: string;
  updatedDate: string | null;
}

// ── Task types ──

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  dueDate: string | null;
  assignee: string | null;
}

// ── Sentiment types ──

export interface SentimentTrend {
  period: string;
  score: number;
  label: string;
}

export interface SentimentData {
  trends: SentimentTrend[];
  drivers: Array<{
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    description: string;
  }>;
  overall: string;
}

// ── Portfolio types ──

export interface HealthBucket {
  count: number;
  arr: number;
}

export interface PortfolioStats {
  totalAccounts: number;
  totalArr: number;
  healthDistribution: {
    healthy: HealthBucket;
    needsAttention: HealthBucket;
    atRisk: HealthBucket;
  };
}

// ── Search types ──

export interface SearchResult {
  accountId: string;
  accountName: string;
  interactionId: string;
  snippet: string;
  score: number;
  sourceType: string;
  date: string;
  title: string;
}

export interface NegativeInteraction {
  accountId: string;
  accountName: string;
  interactionId: string;
  sourceType: string;
  date: string;
  title: string;
  preview: string | null;
  sentiment: string;
}

// ── Architecture types ──

export interface ArchitectureDoc {
  content: string;
  lastUpdated: string | null;
}

// ── Home types ──

export interface AccountActionItem {
  type: 'task' | 'issue' | 'commitment';
  id: string;
  accountId: string;
  accountName: string;
  title: string;
  status: string;
  priority: string | null;
  dueDate: string | null;
  sourceSystem: string | null;
  createdDate: string | null;
  /** For commitments: the matching snippet from the call transcript */
  snippet: string | null;
  /** For commitments: the interaction ID to link to the full call */
  interactionId: string | null;
}

export interface HomeData {
  portfolioStats: PortfolioStats;
  myAccounts: Account[];
  actionItems: AccountActionItem[];
}

// ── Connection types ──

export interface McpConnectionStatus {
  connected: boolean;
  serverUrl: string;
  lastChecked: string | null;
}
