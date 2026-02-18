/**
 * Mappers that convert Salesforce JSON records into the shape
 * expected by Drizzle insert/upsert for each table.
 */

// ---------- helpers ----------

function toDateOrNull(value: unknown): Date | null {
  if (value == null) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function toNumberStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function toIntOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : Math.round(n);
}

// Salesforce relationship fields come as nested objects, e.g. { Owner: { Name: "..." } }
function nested(record: Record<string, unknown>, path: string): string | null {
  const parts = path.split('.');
  let current: unknown = record;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current == null ? null : String(current);
}

// ---------- mappers ----------

export interface MappedAccount {
  sfId: string;
  name: string;
  industry: string | null;
  website: string | null;
  annualRevenue: string | null;
  numberOfEmployees: number | null;
  billingCity: string | null;
  billingState: string | null;
  billingCountry: string | null;
  type: string | null;
  ownerId: string | null;
  ownerName: string | null;
  description: string | null;
  lastActivityDate: Date | null;
}

export function mapAccount(sfRecord: Record<string, unknown>): MappedAccount {
  return {
    sfId: sfRecord.Id as string,
    name: sfRecord.Name as string,
    industry: toStringOrNull(sfRecord.Industry),
    website: toStringOrNull(sfRecord.Website),
    annualRevenue: toNumberStringOrNull(sfRecord.AnnualRevenue),
    numberOfEmployees: toIntOrNull(sfRecord.NumberOfEmployees),
    billingCity: toStringOrNull(sfRecord.BillingCity),
    billingState: toStringOrNull(sfRecord.BillingState),
    billingCountry: toStringOrNull(sfRecord.BillingCountry),
    type: toStringOrNull(sfRecord.Type),
    ownerId: toStringOrNull(sfRecord.OwnerId),
    ownerName: nested(sfRecord, 'Owner.Name'),
    description: toStringOrNull(sfRecord.Description),
    lastActivityDate: toDateOrNull(sfRecord.LastActivityDate),
  };
}

export interface MappedOpportunity {
  sfId: string;
  name: string;
  accountSfId: string | null;
  stageName: string;
  amount: string | null;
  closeDate: Date;
  probability: string | null;
  type: string | null;
  leadSource: string | null;
  nextStep: string | null;
  description: string | null;
  isClosed: boolean;
  isWon: boolean;
  ownerId: string | null;
  ownerName: string | null;
  assignedSeSfId: string | null;
  lastActivityDate: Date | null;
}

export function mapOpportunity(
  sfRecord: Record<string, unknown>,
  seFieldName?: string,
): MappedOpportunity {
  return {
    sfId: sfRecord.Id as string,
    name: sfRecord.Name as string,
    accountSfId: toStringOrNull(sfRecord.AccountId),
    stageName: sfRecord.StageName as string,
    amount: toNumberStringOrNull(sfRecord.Amount),
    closeDate: new Date(sfRecord.CloseDate as string),
    probability: toNumberStringOrNull(sfRecord.Probability),
    type: toStringOrNull(sfRecord.Type),
    leadSource: toStringOrNull(sfRecord.LeadSource),
    nextStep: toStringOrNull(sfRecord.NextStep),
    description: toStringOrNull(sfRecord.Description),
    isClosed: sfRecord.IsClosed === true,
    isWon: sfRecord.IsWon === true,
    ownerId: toStringOrNull(sfRecord.OwnerId),
    ownerName: nested(sfRecord, 'Owner.Name'),
    assignedSeSfId: seFieldName ? toStringOrNull(sfRecord[seFieldName]) : null,
    lastActivityDate: toDateOrNull(sfRecord.LastActivityDate),
  };
}

export interface MappedContact {
  sfId: string;
  accountSfId: string | null;
  firstName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  department: string | null;
}

export function mapContact(sfRecord: Record<string, unknown>): MappedContact {
  return {
    sfId: sfRecord.Id as string,
    accountSfId: toStringOrNull(sfRecord.AccountId),
    firstName: toStringOrNull(sfRecord.FirstName),
    lastName: sfRecord.LastName as string,
    email: toStringOrNull(sfRecord.Email),
    phone: toStringOrNull(sfRecord.Phone),
    title: toStringOrNull(sfRecord.Title),
    department: toStringOrNull(sfRecord.Department),
  };
}

export interface MappedContactRole {
  sfId: string;
  opportunitySfId: string;
  contactSfId: string;
  role: string | null;
  isPrimary: boolean;
}

export function mapContactRole(sfRecord: Record<string, unknown>): MappedContactRole {
  return {
    sfId: sfRecord.Id as string,
    opportunitySfId: sfRecord.OpportunityId as string,
    contactSfId: sfRecord.ContactId as string,
    role: toStringOrNull(sfRecord.Role),
    isPrimary: sfRecord.IsPrimary === true,
  };
}

export interface MappedActivity {
  sfId: string;
  accountSfId: string | null;
  opportunitySfId: string | null;
  subject: string | null;
  description: string | null;
  activityType: 'task' | 'event';
  activityDate: Date | null;
  status: string | null;
  priority: string | null;
  isCompleted: boolean;
  ownerId: string | null;
  ownerName: string | null;
}

export function mapActivity(
  sfRecord: Record<string, unknown>,
  type: 'task' | 'event',
): MappedActivity {
  // WhatId may point to an Opportunity (prefix 006) or other objects.
  // We store it in opportunitySfId only if it looks like an Opportunity Id.
  const whatId = toStringOrNull(sfRecord.WhatId);
  const opportunitySfId = whatId && whatId.startsWith('006') ? whatId : null;

  return {
    sfId: sfRecord.Id as string,
    accountSfId: toStringOrNull(sfRecord.AccountId),
    opportunitySfId,
    subject: toStringOrNull(sfRecord.Subject),
    description: toStringOrNull(sfRecord.Description),
    activityType: type,
    activityDate: toDateOrNull(sfRecord.ActivityDate),
    status: type === 'task' ? toStringOrNull(sfRecord.Status) : null,
    priority: type === 'task' ? toStringOrNull(sfRecord.Priority) : null,
    isCompleted: type === 'task' ? sfRecord.IsClosed === true : false,
    ownerId: toStringOrNull(sfRecord.OwnerId),
    ownerName: nested(sfRecord, 'Owner.Name'),
  };
}
