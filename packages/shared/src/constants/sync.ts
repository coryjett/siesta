export const SYNC_INTERVALS = {
  SALESFORCE: 15 * 60 * 1000, // 15 minutes
  GONG: 30 * 60 * 1000, // 30 minutes
};

export const PROVIDERS = {
  SALESFORCE: 'salesforce',
  GONG: 'gong',
} as const;

export const SF_ENTITIES = ['stages', 'accounts', 'opportunities', 'contacts', 'contact_roles', 'activities'] as const;
export const GONG_ENTITIES = ['calls', 'transcripts'] as const;

export type Provider = typeof PROVIDERS[keyof typeof PROVIDERS];
export type SfEntity = typeof SF_ENTITIES[number];
export type GongEntity = typeof GONG_ENTITIES[number];
