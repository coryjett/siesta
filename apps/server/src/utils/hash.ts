import crypto from 'node:crypto';

export function hashActionItem(
  accountId: string,
  action: string,
  source: string,
  date: string,
  sourceType?: string,
  recordId?: string,
): string {
  const parts = [accountId, action, source, date];
  if (sourceType) parts.push(sourceType);
  if (recordId) parts.push(recordId);
  return crypto
    .createHash('sha256')
    .update(parts.join(':'))
    .digest('hex');
}
