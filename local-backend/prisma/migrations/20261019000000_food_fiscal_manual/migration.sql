ALTER TABLE "FoodProduct" ADD COLUMN "fiscalNcm" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN "fiscalCest" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN "fiscalGtin" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN "fiscalUnit" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN "fiscalCfop" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN "fiscalOrigin" INTEGER;
ALTER TABLE "FoodProduct" ADD COLUMN "fiscalCst" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN "fiscalCsosn" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN "fiscalPisCst" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN "fiscalCofinsCst" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN "fiscalBenefitCode" TEXT;

CREATE TABLE "FoodFiscalDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "model" INTEGER NOT NULL DEFAULT 65,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL DEFAULT 'notaas',
    "providerInvoiceId" TEXT,
    "accessKey" TEXT,
    "protocol" TEXT,
    "number" INTEGER,
    "series" INTEGER,
    "qrCode" TEXT,
    "publicUrl" TEXT,
    "pdfUrl" TEXT,
    "xmlUrl" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "issuedAt" DATETIME,
    CONSTRAINT "FoodFiscalDocument_productId_fkey" FOREIGN KEY ("productId") REFERENCES "FoodProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FoodFiscalDocument_sourceType_sourceId_key" ON "FoodFiscalDocument"("sourceType", "sourceId");
CREATE INDEX "FoodFiscalDocument_status_createdAt_idx" ON "FoodFiscalDocument"("status", "createdAt");
CREATE INDEX "FoodFiscalDocument_productId_createdAt_idx" ON "FoodFiscalDocument"("productId", "createdAt");
