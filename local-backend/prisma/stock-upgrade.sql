-- Manual upgrade for existing SQLite databases. Apply once, before deploying
-- the new backend and regenerating Prisma Client. Not executed by this change.
ALTER TABLE "FoodProduct" ADD COLUMN "unpreparedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FoodProduct" ADD COLUMN "productionMode" TEXT NOT NULL DEFAULT 'resale';
ALTER TABLE "FoodProduct" ADD COLUMN "stockUnit" TEXT NOT NULL DEFAULT 'un';
ALTER TABLE "FoodProduct" ADD COLUMN "recipeJson" TEXT NOT NULL DEFAULT '[]';
CREATE TABLE "FoodStockOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
