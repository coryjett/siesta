import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { actionItemCompletions } from '../db/schema/index.js';
import { extractActionItems, type ActionItem } from './openai-summary.service.js';

/**
 * Get action items for an account with completion status merged in.
 */
export async function getActionItemsWithStatus(
  accountId: string,
  userId: string,
): Promise<ActionItem[]> {
  const items = await extractActionItems(accountId);
  if (items.length === 0) return items;

  const hashes = items.map((i) => i.id).filter(Boolean);
  if (hashes.length === 0) return items;

  const completions = await db
    .select({ itemHash: actionItemCompletions.itemHash })
    .from(actionItemCompletions)
    .where(
      and(
        eq(actionItemCompletions.userId, userId),
        inArray(actionItemCompletions.itemHash, hashes),
      ),
    );

  const completedSet = new Set(completions.map((c) => c.itemHash));

  return items.map((item) => ({
    ...item,
    status: completedSet.has(item.id) ? ('done' as const) : ('open' as const),
  }));
}

/**
 * Mark an action item as complete for a user.
 */
export async function completeActionItem(
  accountId: string,
  itemHash: string,
  userId: string,
): Promise<void> {
  await db
    .insert(actionItemCompletions)
    .values({ itemHash, accountId, userId })
    .onConflictDoNothing();
}

/**
 * Unmark an action item completion for a user.
 */
export async function uncompleteActionItem(
  itemHash: string,
  userId: string,
): Promise<void> {
  await db
    .delete(actionItemCompletions)
    .where(
      and(
        eq(actionItemCompletions.itemHash, itemHash),
        eq(actionItemCompletions.userId, userId),
      ),
    );
}

/**
 * Get action items across multiple accounts, filtered to items
 * where the owner matches the given userName, with completion state.
 */
export async function getUserActionItemsAcrossAccounts(
  accounts: Array<{ id: string; name: string }>,
  userName: string,
  userId: string,
): Promise<Array<ActionItem & { accountId: string; accountName: string }>> {
  const results = await Promise.allSettled(
    accounts.map(async (account) => {
      const items = await extractActionItems(account.id);
      return items
        .filter((item) => {
          if (!item.owner) return false;
          const ownerLower = item.owner.toLowerCase();
          const nameLower = userName.toLowerCase();
          return ownerLower.includes(nameLower) || nameLower.includes(ownerLower)
            || nameLower.split(' ').some((part) => part.length > 1 && ownerLower.includes(part));
        })
        .map((item) => ({
          ...item,
          accountId: account.id,
          accountName: account.name,
        }));
    }),
  );

  const allItems: Array<ActionItem & { accountId: string; accountName: string }> = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
    }
  }

  if (allItems.length === 0) return allItems;

  // Merge completion state
  const hashes = allItems.map((i) => i.id).filter(Boolean);
  if (hashes.length === 0) return allItems;

  const completions = await db
    .select({ itemHash: actionItemCompletions.itemHash })
    .from(actionItemCompletions)
    .where(
      and(
        eq(actionItemCompletions.userId, userId),
        inArray(actionItemCompletions.itemHash, hashes),
      ),
    );

  const completedSet = new Set(completions.map((c) => c.itemHash));

  return allItems.map((item) => ({
    ...item,
    status: completedSet.has(item.id) ? ('done' as const) : ('open' as const),
  }));
}
