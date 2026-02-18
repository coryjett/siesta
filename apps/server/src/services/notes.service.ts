import { eq, desc, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notes, users } from '../db/schema/index.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors.js';
import { parsePagination, buildPaginatedResponse } from '../utils/pagination.js';
import { createNoteSchema, updateNoteSchema } from '@siesta/shared';
import type { CreateNoteInput, UpdateNoteInput } from '@siesta/shared';

/**
 * Create a new note. Any authenticated SE can create a note on any account or opportunity.
 */
export async function createNote(authorId: string, input: CreateNoteInput) {
  const parsed = createNoteSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.errors.map((e) => e.message).join(', '));
  }

  const { accountId, opportunityId, contentJson, contentHtml, contentPlainText } = parsed.data;

  const [note] = await db
    .insert(notes)
    .values({
      authorId,
      accountId: accountId ?? null,
      opportunityId: opportunityId ?? null,
      contentJson,
      contentHtml,
      contentPlainText,
    })
    .returning();

  // Return the note with author info
  return getNote(note.id);
}

/**
 * Update an existing note. Only the original author can update their note.
 */
export async function updateNote(noteId: string, authorId: string, input: UpdateNoteInput) {
  const parsed = updateNoteSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.errors.map((e) => e.message).join(', '));
  }

  // Check the note exists and belongs to the author
  const existing = await db
    .select()
    .from(notes)
    .where(eq(notes.id, noteId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError('Note', noteId);
  }

  if (existing[0].authorId !== authorId) {
    throw new ForbiddenError('You can only edit your own notes');
  }

  const { contentJson, contentHtml, contentPlainText } = parsed.data;

  await db
    .update(notes)
    .set({
      contentJson,
      contentHtml,
      contentPlainText,
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId));

  return getNote(noteId);
}

/**
 * Delete a note. Only the original author can delete their note.
 */
export async function deleteNote(noteId: string, authorId: string) {
  const existing = await db
    .select()
    .from(notes)
    .where(eq(notes.id, noteId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError('Note', noteId);
  }

  if (existing[0].authorId !== authorId) {
    throw new ForbiddenError('You can only delete your own notes');
  }

  await db.delete(notes).where(eq(notes.id, noteId));
}

/**
 * Get paginated notes for a specific account, joined with author name.
 */
export async function getNotesForAccount(accountId: string, page?: number, pageSize?: number) {
  const { page: p, pageSize: ps, offset } = parsePagination({ page, pageSize });

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: notes.id,
        authorId: notes.authorId,
        authorName: users.name,
        accountId: notes.accountId,
        opportunityId: notes.opportunityId,
        contentJson: notes.contentJson,
        contentHtml: notes.contentHtml,
        contentPlainText: notes.contentPlainText,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .innerJoin(users, eq(notes.authorId, users.id))
      .where(eq(notes.accountId, accountId))
      .orderBy(desc(notes.createdAt))
      .limit(ps)
      .offset(offset),
    db
      .select({ count: count() })
      .from(notes)
      .where(eq(notes.accountId, accountId)),
  ]);

  const total = totalResult[0]?.count ?? 0;
  return buildPaginatedResponse(data, total, p, ps);
}

/**
 * Get paginated notes for a specific opportunity, joined with author name.
 */
export async function getNotesForOpportunity(opportunityId: string, page?: number, pageSize?: number) {
  const { page: p, pageSize: ps, offset } = parsePagination({ page, pageSize });

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: notes.id,
        authorId: notes.authorId,
        authorName: users.name,
        accountId: notes.accountId,
        opportunityId: notes.opportunityId,
        contentJson: notes.contentJson,
        contentHtml: notes.contentHtml,
        contentPlainText: notes.contentPlainText,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .innerJoin(users, eq(notes.authorId, users.id))
      .where(eq(notes.opportunityId, opportunityId))
      .orderBy(desc(notes.createdAt))
      .limit(ps)
      .offset(offset),
    db
      .select({ count: count() })
      .from(notes)
      .where(eq(notes.opportunityId, opportunityId)),
  ]);

  const total = totalResult[0]?.count ?? 0;
  return buildPaginatedResponse(data, total, p, ps);
}

/**
 * Get a single note by ID with author information.
 */
export async function getNote(noteId: string) {
  const result = await db
    .select({
      id: notes.id,
      authorId: notes.authorId,
      authorName: users.name,
      accountId: notes.accountId,
      opportunityId: notes.opportunityId,
      contentJson: notes.contentJson,
      contentHtml: notes.contentHtml,
      contentPlainText: notes.contentPlainText,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .innerJoin(users, eq(notes.authorId, users.id))
    .where(eq(notes.id, noteId))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Note', noteId);
  }

  return result[0];
}
