ALTER TABLE "FoodProduct" ADD COLUMN "productName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FoodProduct" ADD COLUMN "flavor" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN "normalizedProductName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FoodProduct" ADD COLUMN "normalizedFlavor" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN "customizationJson" TEXT NOT NULL DEFAULT 'null';

ALTER TABLE "FoodCounterSale" ADD COLUMN "baseUnitPriceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FoodCounterSale" ADD COLUMN "customizationJson" TEXT NOT NULL DEFAULT 'null';
ALTER TABLE "FoodCounterSale" ADD COLUMN "adjustmentCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FoodCounterSale" ADD COLUMN "adjustmentNote" TEXT;
ALTER TABLE "FoodCounterSale" ADD COLUMN "isGift" BOOLEAN NOT NULL DEFAULT false;

UPDATE "FoodProduct"
SET "productName" = CASE
  WHEN instr(lower("name"), ' de ') > 0 THEN substr("name", 1, instr(lower("name"), ' de ') - 1)
  WHEN instr(lower("name"), ' da ') > 0 THEN substr("name", 1, instr(lower("name"), ' da ') - 1)
  WHEN instr(lower("name"), ' do ') > 0 THEN substr("name", 1, instr(lower("name"), ' do ') - 1)
  ELSE "name"
END
WHERE "productName" = '';

UPDATE "FoodCounterSale"
SET "baseUnitPriceCents" = CASE WHEN "quantity" > 0 THEN CAST("totalCents" / "quantity" AS INTEGER) ELSE 0 END
WHERE "baseUnitPriceCents" = 0;
