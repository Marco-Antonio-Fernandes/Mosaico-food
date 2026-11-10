ALTER TABLE "FoodOrder" ADD COLUMN "stockReserved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FoodOrder" ADD COLUMN "saleOperationId" TEXT;
CREATE UNIQUE INDEX "FoodOrder_saleOperationId_key" ON "FoodOrder"("saleOperationId");

ALTER TABLE "FoodOrderItem" ADD COLUMN "adjustmentCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FoodOrderItem" ADD COLUMN "adjustmentNote" TEXT;
ALTER TABLE "FoodOrderItem" ADD COLUMN "isGift" BOOLEAN NOT NULL DEFAULT false;
