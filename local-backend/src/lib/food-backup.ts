import type { PrismaService } from "./prisma.service";
import { FinancialError } from "./financial-movement";

export const backupTableNames = [
  "customer",
  "creditAccount",
  "creditEntry",
  "syncOperation",
  "foodAutomationConfig",
  "foodAutomationConversation",
  "foodAutomationMessage",
  "foodProduct",
  "foodStockOperation",
  "foodAssistantDraft",
  "foodAssistantRegistrationDraft",
  "foodCounterSale",
  "foodCounterBatch",
  "foodStockPrompt",
  "foodCustomer",
  "foodConversation",
  "foodMessage",
  "foodOrder",
  "foodOrderItem",
  "foodOrderSchedule",
  "foodOrderScheduleItem",
  "foodCashSession",
  "foodFinanceAccount",
  "foodFinanceTitle",
  "foodSaleCancellation",
  "foodFinancialMovement",
  "foodCardSchedule",
] as const;

export type BackupTableName = (typeof backupTableNames)[number];
export type FoodBackup = {
  format: "mosaico-food-backup";
  version: 1;
  exportedAt: string;
  tables: Partial<Record<BackupTableName, unknown[]>>;
};

type AnyDatabase = Record<string, {
  findMany: (args?: unknown) => Promise<unknown[]>;
  findFirst: (args?: unknown) => Promise<Record<string, unknown> | null>;
  upsert: (args: unknown) => Promise<Record<string, unknown>>;
}>;

const databaseDelegates = (database: PrismaService) => database as unknown as AnyDatabase;

export async function exportFoodDatabase(database: PrismaService): Promise<FoodBackup> {
  return database.$transaction(async transaction => {
    const delegates = databaseDelegates(transaction as PrismaService);
    const tables = {} as Partial<Record<BackupTableName, unknown[]>>;
    for (const tableName of backupTableNames) tables[tableName] = await delegates[tableName].findMany();
    return {
      format: "mosaico-food-backup",
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      tables,
    };
  }, { maxWait: 120_000, timeout: 120_000 });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function reviveDates(value: unknown, key?: string): unknown {
  if (value instanceof Date) return value;
  if (typeof value === "string" && key && /At$/.test(key) && !Number.isNaN(Date.parse(value))) {
    return new Date(value);
  }
  if (Array.isArray(value)) return value.map(item => reviveDates(item));
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(Object.entries(record).map(([entryKey, entryValue]) => [entryKey, reviveDates(entryValue, entryKey)]));
}

function mapValue(value: unknown, tableName: BackupTableName, maps: Map<BackupTableName, Map<string, string>>) {
  if (typeof value !== "string") return value;
  return maps.get(tableName)?.get(value) ?? value;
}

function remapJsonRecipe(value: unknown, maps: Map<BackupTableName, Map<string, string>>) {
  if (typeof value !== "string") return value;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return value;
    return JSON.stringify(parsed.map(item => {
      const row = asRecord(item);
      if (!row || typeof row.ingredientId !== "string") return item;
      return { ...row, ingredientId: mapValue(row.ingredientId, "foodProduct", maps) };
    }));
  } catch {
    return value;
  }
}

function remapReferences(tableName: BackupTableName, data: Record<string, unknown>, maps: Map<BackupTableName, Map<string, string>>) {
  const next = { ...data };
  const references: Partial<Record<BackupTableName, Array<[string, BackupTableName]>>> = {
    creditAccount: [["customerId", "customer"]],
    creditEntry: [["creditAccountId", "creditAccount"]],
    foodAutomationMessage: [["conversationId", "foodAutomationConversation"]],
    foodStockOperation: [["productId", "foodProduct"]],
    foodAssistantDraft: [["productId", "foodProduct"]],
    foodCounterSale: [["productId", "foodProduct"]],
    foodStockPrompt: [["productId", "foodProduct"], ["ingredientId", "foodProduct"]],
    foodConversation: [["customerId", "foodCustomer"]],
    foodMessage: [["conversationId", "foodConversation"]],
    foodOrder: [["customerId", "foodCustomer"], ["conversationId", "foodConversation"]],
    foodOrderItem: [["orderId", "foodOrder"], ["productId", "foodProduct"]],
    foodOrderScheduleItem: [["scheduleId", "foodOrderSchedule"], ["productId", "foodProduct"]],
    foodFinancialMovement: [["cashSessionId", "foodCashSession"], ["accountId", "foodFinanceAccount"], ["originalMovementId", "foodFinancialMovement"]],
  };

  if (tableName === "foodCustomer" && typeof next.creditCustomerId === "string") {
    next.creditCustomerId = mapValue(next.creditCustomerId, "customer", maps);
  }
  if (tableName === "foodFinancialMovement" || tableName === "foodSaleCancellation") {
    const referenceTables: Record<string, BackupTableName> = { order: "foodOrder", counter_sale: "foodCounterBatch", assistant_sale: "foodAssistantDraft", credit_payment: "creditEntry", card_settlement: "foodFinancialMovement" };
    const referenceTable = typeof next.referenceType === "string" ? referenceTables[next.referenceType] : undefined;
    if (referenceTable) next.referenceId = mapValue(next.referenceId, referenceTable, maps);
    const saleTable = typeof next.saleType === "string" ? referenceTables[next.saleType] : undefined;
    if (saleTable) next.saleId = mapValue(next.saleId, saleTable, maps);
  }
  if (tableName === "foodProduct") next.recipeJson = remapJsonRecipe(next.recipeJson, maps);

  for (const [field, referenceTable] of references[tableName] ?? []) {
    if (typeof next[field] === "string") next[field] = mapValue(next[field], referenceTable, maps);
  }
  return next;
}

async function findNaturalMatch(tableName: BackupTableName, delegate: AnyDatabase[string], data: Record<string, unknown>) {
  const where = (() => {
    switch (tableName) {
      case "customer": return typeof data.normalizedPhone === "string" && data.normalizedPhone ? { normalizedPhone: data.normalizedPhone } : null;
      case "creditAccount": return typeof data.customerId === "string" ? { customerId: data.customerId } : null;
      case "creditEntry": return typeof data.operationId === "string" ? { operationId: data.operationId } : null;
      case "foodFinancialMovement": return typeof data.operationId === "string" ? { operationId: data.operationId } : null;
      case "syncOperation": return typeof data.operationId === "string" ? { operationId: data.operationId } : null;
      case "foodAutomationConversation": return typeof data.providerConversationId === "number" ? { providerConversationId: data.providerConversationId } : null;
      case "foodAutomationMessage": return typeof data.conversationId === "string" && typeof data.providerId === "string" ? { conversationId: data.conversationId, providerId: data.providerId } : null;
      case "foodProduct": return typeof data.normalizedName === "string" && data.normalizedName ? { normalizedName: data.normalizedName } : null;
      case "foodCustomer": return typeof data.normalizedPhone === "string" && data.normalizedPhone ? { normalizedPhone: data.normalizedPhone } : null;
      case "foodConversation": return typeof data.sessionId === "string" && typeof data.remoteJid === "string" ? { sessionId: data.sessionId, remoteJid: data.remoteJid } : null;
      case "foodMessage": return typeof data.sessionId === "string" && typeof data.providerMessageId === "string" ? { sessionId: data.sessionId, providerMessageId: data.providerMessageId } : null;
      case "foodOrder": return typeof data.saleOperationId === "string" && data.saleOperationId ? { saleOperationId: data.saleOperationId } : null;
      default: return null;
    }
  })();
  return where ? delegate.findFirst({ where }) : null;
}

function isPrismaUniqueError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function importFoodDatabase(database: PrismaService, backup: FoodBackup) {
  const maps = new Map<BackupTableName, Map<string, string>>(
    backupTableNames.map(tableName => [tableName, new Map<string, string>()]),
  );
  const summary = { inserted: 0, updated: 0, skipped: 0 };
  const delegates = databaseDelegates(database);

  await database.$transaction(async transaction => {
    const transactionDelegates = databaseDelegates(transaction as PrismaService);
    for (const tableName of backupTableNames) {
      const rows = [...(backup.tables[tableName] ?? [])];
      if (tableName === "foodFinancialMovement") {
        // Resolve operation identities before remapping refunds and settlements.
        for (const row of rows) {
          const record = asRecord(row);
          if (record && typeof record.id === "string" && typeof record.operationId === "string") {
            const existing = await transactionDelegates.foodFinancialMovement.findFirst({ where: { operationId: record.operationId } });
            maps.get(tableName)?.set(record.id, typeof existing?.id === "string" ? existing.id : record.id);
          }
        }
      }
      const delegate = transactionDelegates[tableName];
      for (const rawRow of rows) {
        const source = asRecord(rawRow);
        if (!source || typeof source.id !== "string") {
          summary.skipped += 1;
          continue;
        }

        const sourceId = tableName === "foodCardSchedule" ? mapValue(source.id, "foodFinancialMovement", maps) as string : source.id;
        const revived = reviveDates(Object.fromEntries(Object.entries(source).filter(([key]) => key !== "id"))) as Record<string, unknown>;
        const data = remapReferences(tableName, revived, maps);
        let existing = await findNaturalMatch(tableName, delegate, data);
        if (["foodFinancialMovement", "foodFinanceAccount", "foodFinanceTitle", "foodSaleCancellation"].includes(tableName)) {
          existing ??= await delegate.findFirst({ where: { id: sourceId } });
          if (existing) {
            if (Object.entries(data).some(([key, value]) => JSON.stringify(existing![key]) !== JSON.stringify(value))) throw new FinancialError("O backup contém um lançamento financeiro diferente do registro existente.");
            maps.get(tableName)?.set(sourceId, existing.id as string);
            summary.skipped += 1;
            continue;
          }
        }
        let targetId = existing?.id as string | undefined;

        try {
          const result = await delegate.upsert({
            where: { id: targetId ?? sourceId },
            create: { id: targetId ?? sourceId, ...data },
            update: data,
          });
          targetId = result.id as string;
          maps.get(tableName)?.set(sourceId, targetId);
          if (existing) summary.updated += 1;
          else summary.inserted += 1;
        } catch (error) {
          if (!isPrismaUniqueError(error)) throw error;
          existing = await findNaturalMatch(tableName, delegate, data);
          if (!existing?.id) {
            summary.skipped += 1;
            continue;
          }
          await delegate.upsert({ where: { id: existing.id }, create: { id: existing.id, ...data }, update: data });
          maps.get(tableName)?.set(sourceId, existing.id as string);
          summary.updated += 1;
        }
      }
    }
  }, { maxWait: 120_000, timeout: 120_000 });

  // Keep this reference so the compiler does not allow the import routine to
  // accidentally be called with a disconnected service in future changes.
  void delegates;
  return summary;
}
