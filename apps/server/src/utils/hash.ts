import crypto from 'node:crypto';

export function hashActionItem(
  accountId: string,
  action: string,
  source: string,
  date: string,
): string {
  return crypto
    .createHash('sha256')
    .update(`${accountId}:${action}:${source}:${date}`)
    .digest('hex');
}
