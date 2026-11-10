-- Expansão aditiva para um banco anterior ao controle financeiro. Aplicar uma vez.
BEGIN IMMEDIATE;

-- AlterTable
ALTER TABLE "CreditEntry" ADD COLUMN "paymentMethod" TEXT;

-- AlterTable
ALTER TABLE "FoodCashSession" ADD COLUMN "activeKey" TEXT;

-- AlterTable
ALTER TABLE "FoodCounterSale" ADD COLUMN "financialOperationId" TEXT;
ALTER TABLE "FoodCounterSale" ADD COLUMN "source" TEXT;

-- CreateTable
CREATE TABLE "FoodFinancialMovement" (
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
    CONSTRAINT "FoodFinancialMovement_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "FoodCashSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodFinancialMovement_operationId_key" ON "FoodFinancialMovement"("operationId");

-- CreateIndex
CREATE INDEX "FoodFinancialMovement_cashSessionId_createdAt_idx" ON "FoodFinancialMovement"("cashSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "FoodFinancialMovement_referenceType_referenceId_idx" ON "FoodFinancialMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "FoodFinancialMovement_occurredAt_idx" ON "FoodFinancialMovement"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "FoodFinancialMovement_referenceType_referenceId_kind_key" ON "FoodFinancialMovement"("referenceType", "referenceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "FoodCashSession_activeKey_key" ON "FoodCashSession"("activeKey");


COMMIT;
