import { z } from 'zod';

export const mcpConnectionSchema = z.object({
  serverUrl: z.string().url(),
});

export const userRoleUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['se', 'se_manager', 'admin']),
  sfUserId: z.string().nullable().optional(),
});

export type McpConnectionInput = z.infer<typeof mcpConnectionSchema>;
export type UserRoleUpdateInput = z.infer<typeof userRoleUpdateSchema>;
