ALTER TABLE "FoodCustomer" ADD COLUMN "creditCustomerId" TEXT REFERENCES "CreditAccount"("customerId");
ALTER TABLE "FoodOrder" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "FoodOrder" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "CreditEntry" ADD COLUMN "referenceType" TEXT;
ALTER TABLE "CreditEntry" ADD COLUMN "referenceId" TEXT;
CREATE INDEX "CreditEntry_referenceType_referenceId_idx" ON "CreditEntry"("referenceType", "referenceId");
CREATE INDEX "FoodCustomer_creditCustomerId_idx" ON "FoodCustomer"("creditCustomerId");
