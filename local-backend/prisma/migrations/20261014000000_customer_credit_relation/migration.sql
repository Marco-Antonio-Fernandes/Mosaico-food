-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FoodCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "automationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "creditCustomerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FoodCustomer_creditCustomerId_fkey" FOREIGN KEY ("creditCustomerId") REFERENCES "CreditAccount" ("customerId") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FoodCustomer" ("address", "automationEnabled", "createdAt", "creditCustomerId", "email", "id", "name", "normalizedPhone", "notes", "phone", "updatedAt") SELECT "address", "automationEnabled", "createdAt", "creditCustomerId", "email", "id", "name", "normalizedPhone", "notes", "phone", "updatedAt" FROM "FoodCustomer";
DROP TABLE "FoodCustomer";
ALTER TABLE "new_FoodCustomer" RENAME TO "FoodCustomer";
CREATE UNIQUE INDEX "FoodCustomer_normalizedPhone_key" ON "FoodCustomer"("normalizedPhone");
CREATE INDEX "FoodCustomer_name_idx" ON "FoodCustomer"("name");
CREATE INDEX "FoodCustomer_creditCustomerId_idx" ON "FoodCustomer"("creditCustomerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

