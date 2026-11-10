-- Apply once to an existing SQLite database before deploying the speech integration.
ALTER TABLE "FoodMessage" ADD COLUMN "mediaType" TEXT;
ALTER TABLE "FoodMessage" ADD COLUMN "transcriptionStatus" TEXT;
