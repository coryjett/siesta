import { z } from 'zod';

export const createNoteSchema = z.object({
  accountId: z.string().uuid().nullable().optional(),
  opportunityId: z.string().uuid().nullable().optional(),
  contentJson: z.record(z.unknown()),
  contentHtml: z.string().min(1),
  contentPlainText: z.string(),
}).refine(
  (data) => data.accountId || data.opportunityId,
  { message: 'Either accountId or opportunityId must be provided' }
);

export const updateNoteSchema = z.object({
  contentJson: z.record(z.unknown()),
  contentHtml: z.string().min(1),
  contentPlainText: z.string(),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
