/**
 * SOQL query builders for each Salesforce entity synced by Siesta.
 */

export function buildAccountsQuery(): string {
  return `
    SELECT
      Id,
      Name,
      Industry,
      Website,
      AnnualRevenue,
      NumberOfEmployees,
      BillingCity,
      BillingState,
      BillingCountry,
      Type,
      OwnerId,
      Owner.Name,
      Description,
      LastActivityDate
    FROM Account
  `.replace(/\s+/g, ' ').trim();
}

export function buildOpportunitiesQuery(seFieldName?: string): string {
  const seField = seFieldName ? `, ${seFieldName}` : '';

  return `
    SELECT
      Id,
      Name,
      AccountId,
      Account.Name,
      StageName,
      Amount,
      CloseDate,
      Probability,
      Type,
      LeadSource,
      NextStep,
      Description,
      IsClosed,
      IsWon,
      OwnerId,
      Owner.Name${seField},
      LastActivityDate
    FROM Opportunity
  `.replace(/\s+/g, ' ').trim();
}

export function buildContactsQuery(): string {
  return `
    SELECT
      Id,
      AccountId,
      FirstName,
      LastName,
      Email,
      Phone,
      Title,
      Department
    FROM Contact
  `.replace(/\s+/g, ' ').trim();
}

export function buildContactRolesQuery(): string {
  return `
    SELECT
      Id,
      OpportunityId,
      ContactId,
      Role,
      IsPrimary
    FROM OpportunityContactRole
  `.replace(/\s+/g, ' ').trim();
}

export function buildTasksQuery(): string {
  return `
    SELECT
      Id,
      AccountId,
      WhatId,
      Subject,
      Description,
      ActivityDate,
      Status,
      Priority,
      IsClosed,
      OwnerId,
      Owner.Name
    FROM Task
  `.replace(/\s+/g, ' ').trim();
}

export function buildEventsQuery(): string {
  return `
    SELECT
      Id,
      AccountId,
      WhatId,
      Subject,
      Description,
      ActivityDate,
      OwnerId,
      Owner.Name
    FROM Event
  `.replace(/\s+/g, ' ').trim();
}
