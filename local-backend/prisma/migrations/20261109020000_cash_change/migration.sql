ALTER TABLE "FoodConversation" ADD COLUMN "pendingCashReceivedCents" INTEGER;
ALTER TABLE "FoodOrder" ADD COLUMN "cashReceivedCents" INTEGER;
ALTER TABLE "FoodOrder" ADD COLUMN "cashChangeCents" INTEGER;
