-- Initial schema for databases preceding the existing incremental migrations.

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedPhone" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "creditLimitCents" INTEGER,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "CreditAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CreditEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creditAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "operationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditEntry_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "CreditAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "SyncOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "baseVersion" INTEGER,
    "occurredAt" DATETIME NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "FoodAutomationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "FoodAutomationConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerConversationId" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'idle',
    "pendingItemsJson" TEXT NOT NULL DEFAULT '[]',
    "pendingFulfillment" TEXT,
    "pendingAddress" TEXT,
    "orderId" TEXT,
    "lastOrderMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "FoodAutomationMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodAutomationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "FoodAutomationConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FoodProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Geral',
    "aliasesJson" TEXT NOT NULL DEFAULT '[]',
    "variantsJson" TEXT NOT NULL DEFAULT '[]',
    "costPriceCents" INTEGER NOT NULL DEFAULT 0,
    "salePriceCents" INTEGER NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "unpreparedQuantity" INTEGER NOT NULL DEFAULT 0,
    "productionMode" TEXT NOT NULL DEFAULT 'resale',
    "stockUnit" TEXT NOT NULL DEFAULT 'un',
    "unitWeightGrams" INTEGER,
    "unitVolumeMl" INTEGER,
    "recipeJson" TEXT NOT NULL DEFAULT '[]',
    "allowOnDemand" BOOLEAN NOT NULL DEFAULT false,
    "fryToOrder" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "FoodStockOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "FoodAssistantDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "paymentMethod" TEXT,
    "unitPriceCents" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "FoodAssistantRegistrationDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stockUnit" TEXT NOT NULL,
    "unitWeightGrams" INTEGER,
    "unitVolumeMl" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "FoodCounterSale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "paymentMethod" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "FoodCounterBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "FoodCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "automationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "FoodConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "customerId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'idle',
    "greetingSent" BOOLEAN NOT NULL DEFAULT false,
    "automationPaused" BOOLEAN NOT NULL DEFAULT false,
    "pendingItemsJson" TEXT NOT NULL DEFAULT '[]',
    "pendingFulfillment" TEXT,
    "pendingAddress" TEXT,
    "lastOrderId" TEXT,
    "lastOrderMessageId" TEXT,
    "lastMessageAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FoodConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "FoodCustomer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "FoodMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT,
    "mediaType" TEXT,
    "transcriptionStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    CONSTRAINT "FoodMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "FoodConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FoodOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerName" TEXT,
    "customerId" TEXT,
    "conversationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "fulfillment" TEXT NOT NULL,
    "deliveryAddress" TEXT,
    "totalCents" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'whatsapp',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FoodOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "FoodCustomer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FoodOrder_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "FoodConversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "FoodOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "variantName" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "fryNow" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "FoodOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "FoodOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FoodOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "FoodProduct" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "FoodOrderSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "weekdaysJson" TEXT NOT NULL DEFAULT '[]',
    "timeLocal" TEXT NOT NULL DEFAULT '09:00',
    "fulfillment" TEXT NOT NULL DEFAULT 'pickup',
    "deliveryAddress" TEXT,
    "nextRunAt" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "FoodOrderScheduleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "flavor" TEXT,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "FoodOrderScheduleItem_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "FoodOrderSchedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FoodOrderScheduleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "FoodProduct" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "FoodCashSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "openingCashCents" INTEGER NOT NULL,
    "expectedCashCents" INTEGER,
    "countedCashCents" INTEGER,
    "differenceCents" INTEGER,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "Customer_updatedAt_idx" ON "Customer"("updatedAt");

CREATE INDEX "Customer_normalizedPhone_idx" ON "Customer"("normalizedPhone");

CREATE UNIQUE INDEX "CreditAccount_customerId_key" ON "CreditAccount"("customerId");

CREATE INDEX "CreditAccount_updatedAt_idx" ON "CreditAccount"("updatedAt");

CREATE UNIQUE INDEX "CreditEntry_operationId_key" ON "CreditEntry"("operationId");

CREATE INDEX "CreditEntry_creditAccountId_occurredAt_idx" ON "CreditEntry"("creditAccountId", "occurredAt");

CREATE INDEX "CreditEntry_updatedAt_idx" ON "CreditEntry"("updatedAt");

CREATE UNIQUE INDEX "SyncOperation_operationId_key" ON "SyncOperation"("operationId");

CREATE INDEX "SyncOperation_createdAt_idx" ON "SyncOperation"("createdAt");

CREATE INDEX "SyncOperation_entity_entityId_idx" ON "SyncOperation"("entity", "entityId");

CREATE UNIQUE INDEX "FoodAutomationConversation_providerConversationId_key" ON "FoodAutomationConversation"("providerConversationId");

CREATE INDEX "FoodAutomationMessage_processedAt_idx" ON "FoodAutomationMessage"("processedAt");

CREATE UNIQUE INDEX "FoodAutomationMessage_conversationId_providerId_key" ON "FoodAutomationMessage"("conversationId", "providerId");

CREATE UNIQUE INDEX "FoodProduct_normalizedName_key" ON "FoodProduct"("normalizedName");

CREATE INDEX "FoodProduct_active_idx" ON "FoodProduct"("active");

CREATE INDEX "FoodProduct_name_idx" ON "FoodProduct"("name");

CREATE UNIQUE INDEX "FoodCustomer_normalizedPhone_key" ON "FoodCustomer"("normalizedPhone");

CREATE INDEX "FoodCustomer_name_idx" ON "FoodCustomer"("name");

CREATE INDEX "FoodConversation_customerId_idx" ON "FoodConversation"("customerId");

CREATE INDEX "FoodConversation_lastMessageAt_idx" ON "FoodConversation"("lastMessageAt");

CREATE UNIQUE INDEX "FoodConversation_sessionId_remoteJid_key" ON "FoodConversation"("sessionId", "remoteJid");

CREATE INDEX "FoodMessage_conversationId_processedAt_idx" ON "FoodMessage"("conversationId", "processedAt");

CREATE INDEX "FoodMessage_createdAt_idx" ON "FoodMessage"("createdAt");

CREATE UNIQUE INDEX "FoodMessage_sessionId_providerMessageId_key" ON "FoodMessage"("sessionId", "providerMessageId");

CREATE INDEX "FoodOrder_customerId_createdAt_idx" ON "FoodOrder"("customerId", "createdAt");

CREATE INDEX "FoodOrder_status_createdAt_idx" ON "FoodOrder"("status", "createdAt");

CREATE INDEX "FoodOrderItem_orderId_idx" ON "FoodOrderItem"("orderId");

CREATE INDEX "FoodOrderItem_productId_idx" ON "FoodOrderItem"("productId");

CREATE INDEX "FoodOrderSchedule_active_nextRunAt_idx" ON "FoodOrderSchedule"("active", "nextRunAt");

CREATE INDEX "FoodOrderScheduleItem_scheduleId_idx" ON "FoodOrderScheduleItem"("scheduleId");

CREATE INDEX "FoodOrderScheduleItem_productId_idx" ON "FoodOrderScheduleItem"("productId");

CREATE UNIQUE INDEX "FoodCashSession_businessDate_key" ON "FoodCashSession"("businessDate");
