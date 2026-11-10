CREATE TABLE "FoodAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "notasemtupeCompanyId" TEXT,
    "notasemtupeToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "FoodAccount_cnpj_key" ON "FoodAccount"("cnpj");
CREATE INDEX "FoodAccount_name_idx" ON "FoodAccount"("name");
