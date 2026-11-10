-- CreateTable
CREATE TABLE "FoodFinanceAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "openingBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FoodFinanceTitle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "settledCents" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FoodSaleCancellation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleType" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FoodCardSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dueDate" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FoodFinancialMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashSessionId" TEXT,
    "saleType" TEXT,
    "saleId" TEXT,
    "originalMovementId" TEXT,
    "accountId" TEXT,
    CONSTRAINT "FoodFinancialMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FoodFinanceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FoodFinancialMovement_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "FoodCashSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FoodFinancialMovement" ("amountCents", "cashSessionId", "createdAt", "id", "kind", "note", "occurredAt", "operationId", "paymentMethod", "referenceId", "referenceType", "source") SELECT "amountCents", "cashSessionId", "createdAt", "id", "kind", "note", "occurredAt", "operationId", "paymentMethod", "referenceId", "referenceType", "source" FROM "FoodFinancialMovement";
DROP TABLE "FoodFinancialMovement";
ALTER TABLE "new_FoodFinancialMovement" RENAME TO "FoodFinancialMovement";
CREATE UNIQUE INDEX "FoodFinancialMovement_operationId_key" ON "FoodFinancialMovement"("operationId");
CREATE INDEX "FoodFinancialMovement_saleType_saleId_idx" ON "FoodFinancialMovement"("saleType", "saleId");
CREATE INDEX "FoodFinancialMovement_originalMovementId_idx" ON "FoodFinancialMovement"("originalMovementId");
CREATE INDEX "FoodFinancialMovement_accountId_occurredAt_idx" ON "FoodFinancialMovement"("accountId", "occurredAt");
CREATE INDEX "FoodFinancialMovement_cashSessionId_createdAt_idx" ON "FoodFinancialMovement"("cashSessionId", "createdAt");
CREATE INDEX "FoodFinancialMovement_referenceType_referenceId_idx" ON "FoodFinancialMovement"("referenceType", "referenceId");
CREATE INDEX "FoodFinancialMovement_occurredAt_idx" ON "FoodFinancialMovement"("occurredAt");
CREATE UNIQUE INDEX "FoodFinancialMovement_referenceType_referenceId_kind_key" ON "FoodFinancialMovement"("referenceType", "referenceId", "kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "FoodSaleCancellation_saleType_saleId_key" ON "FoodSaleCancellation"("saleType", "saleId");

