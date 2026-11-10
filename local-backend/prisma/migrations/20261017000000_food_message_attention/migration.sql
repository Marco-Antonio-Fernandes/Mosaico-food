ALTER TABLE "FoodMessage" ADD COLUMN "needsHuman" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "FoodMessage_needsHuman_createdAt_idx" ON "FoodMessage"("needsHuman", "createdAt");
