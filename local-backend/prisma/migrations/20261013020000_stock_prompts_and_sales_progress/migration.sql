ALTER TABLE "FoodProduct" ADD COLUMN "salesProgressJson" TEXT NOT NULL DEFAULT '{}';

CREATE TABLE "FoodStockPrompt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "yieldQuantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);

CREATE INDEX "FoodStockPrompt_status_createdAt_idx" ON "FoodStockPrompt"("status", "createdAt");
CREATE INDEX "FoodStockPrompt_productId_ingredientId_status_idx" ON "FoodStockPrompt"("productId", "ingredientId", "status");
