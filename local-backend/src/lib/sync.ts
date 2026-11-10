import { z } from "zod";

import { creditEntryInputSchema } from "./credit-entry";

export const syncOperationSchema = z.object({
  operationId: z.string().uuid(),
  entity: z.literal("credit_entry"),
  entityId: z.string().uuid(),
  action: z.literal("create"),
  baseVersion: z.number().int().nonnegative().optional(),
  occurredAt: z.string().datetime(),
  payload: creditEntryInputSchema,
});

export const syncPushSchema = z.object({
  operations: z.array(syncOperationSchema).max(100),
});

export const syncCursorSchema = z.string().datetime();

export type SyncOperation = z.infer<typeof syncOperationSchema>;
