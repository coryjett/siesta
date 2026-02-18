import { z } from 'zod';

export const sfConnectionSchema = z.object({
  sessionId: z.string().min(1),
  instanceUrl: z.string().url(),
});

export const gongConnectionSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export const seFieldMappingSchema = z.object({
  fieldApiName: z.string().min(1),
});

export const userRoleUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['se', 'se_manager', 'admin']),
  sfUserId: z.string().nullable().optional(),
});

export type SfConnectionInput = z.infer<typeof sfConnectionSchema>;
export type GongConnectionInput = z.infer<typeof gongConnectionSchema>;
export type SeFieldMappingInput = z.infer<typeof seFieldMappingSchema>;
export type UserRoleUpdateInput = z.infer<typeof userRoleUpdateSchema>;
