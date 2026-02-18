export interface SfAccount {
  id: string;
  sfId: string;
  name: string;
  industry: string | null;
  website: string | null;
  annualRevenue: number | null;
  numberOfEmployees: number | null;
  billingCity: string | null;
  billingState: string | null;
  billingCountry: string | null;
  type: string | null;
  ownerId: string | null;
  ownerName: string | null;
  description: string | null;
  lastActivityDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SfOpportunity {
  id: string;
  sfId: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  stageName: string;
  amount: number | null;
  closeDate: string;
  probability: number | null;
  type: string | null;
  leadSource: string | null;
  nextStep: string | null;
  description: string | null;
  isClosed: boolean;
  isWon: boolean;
  ownerId: string | null;
  ownerName: string | null;
  assignedSeSfId: string | null;
  assignedSeUserId: string | null;
  assignedSeName: string | null;
  lastActivityDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SfContact {
  id: string;
  sfId: string;
  accountId: string | null;
  firstName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  department: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SfOppContactRole {
  id: string;
  opportunityId: string;
  contactId: string;
  role: string | null;
  isPrimary: boolean;
  contact?: SfContact;
}

export interface SfActivity {
  id: string;
  sfId: string;
  accountId: string | null;
  opportunityId: string | null;
  subject: string | null;
  description: string | null;
  activityType: 'task' | 'event';
  activityDate: string | null;
  status: string | null;
  priority: string | null;
  isCompleted: boolean;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SfOpportunityStage {
  id: string;
  stageName: string;
  sortOrder: number;
  isClosed: boolean;
  isWon: boolean;
}

export interface KanbanColumn {
  stage: SfOpportunityStage;
  opportunities: SfOpportunity[];
}
