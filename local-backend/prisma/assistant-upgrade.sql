-- Apply once to an existing SQLite database. Not executed by this edit.
CREATE TABLE "FoodCounterBatch" ("id" TEXT NOT NULL PRIMARY KEY, "fingerprint" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "FoodAssistantDraft" (
 "id" TEXT NOT NULL PRIMARY KEY, "productId" TEXT NOT NULL,
 "action" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "totalCents" INTEGER NOT NULL,
 "paymentMethod" TEXT, "unitPriceCents" INTEGER NOT NULL,
 "completed" BOOLEAN NOT NULL DEFAULT false, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "FoodCounterSale" (
 "id" TEXT NOT NULL PRIMARY KEY, "productId" TEXT NOT NULL,
 "productName" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "totalCents" INTEGER NOT NULL,
 "paymentMethod" TEXT, "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
