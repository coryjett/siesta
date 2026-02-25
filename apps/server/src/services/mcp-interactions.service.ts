import { callTool } from '../integrations/mcp/client.js';
import { cachedCall } from './cache.service.js';
import type { McpInteractionDetail } from '../integrations/mcp/types.js';

export async function getInteractionDetail(
  accountId: string,
  sourceType: string,
  recordId: string,
) {
  return cachedCall<McpInteractionDetail>(
    `mcp:interaction:${accountId}:${sourceType}:${recordId}`,
    300,
    () =>
      callTool<McpInteractionDetail>('get_conversation_details', {
        company_id: accountId,
        source_type: sourceType,
        record_id: recordId,
      }),
  );
}
