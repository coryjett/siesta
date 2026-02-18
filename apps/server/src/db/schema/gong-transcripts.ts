import { pgTable, uuid, text, jsonb, timestamp, index, customType } from 'drizzle-orm/pg-core';
import { gongCalls } from './gong-calls';
import { sql } from 'drizzle-orm';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const gongTranscripts = pgTable('gong_transcripts', {
  id: uuid('id').defaultRandom().primaryKey(),
  callId: uuid('call_id').notNull().references(() => gongCalls.id, { onDelete: 'cascade' }).unique(),
  fullText: text('full_text').notNull(),
  segments: jsonb('segments').$type<Array<{
    speakerName: string;
    speakerRole: 'internal' | 'external';
    startTime: number;
    endTime: number;
    text: string;
  }>>().notNull().default([]),
  searchVector: tsvector('search_vector').generatedAlwaysAs(
    sql`to_tsvector('english', full_text)`
  ),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('gong_transcripts_search_vector_idx').using('gin', table.searchVector),
  index('gong_transcripts_full_text_trgm_idx').using('gin', sql`${table.fullText} gin_trgm_ops`),
]);
