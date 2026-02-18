import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appSettings } from '../db/schema/index.js';

/**
 * Get a single setting by key. Returns null if not found.
 */
export async function getSetting(key: string): Promise<string | null> {
  const result = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  return result.length > 0 ? result[0].value : null;
}

/**
 * Upsert a setting (insert or update on conflict).
 */
export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

/**
 * Get multiple settings by their keys.
 * Returns a map of key -> value for the found settings.
 */
export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};

  const results = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, keys));

  const map: Record<string, string> = {};
  for (const row of results) {
    map[row.key] = row.value;
  }
  return map;
}

/**
 * Get all settings.
 */
export async function getAllSettings() {
  return db.select().from(appSettings);
}
