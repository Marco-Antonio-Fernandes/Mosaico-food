-- Apply once to existing SQLite databases before deploying this version.
ALTER TABLE "FoodProduct" ADD COLUMN "unitWeightGrams" INTEGER;
ALTER TABLE "FoodProduct" ADD COLUMN "unitVolumeMl" INTEGER;
CREATE TABLE "FoodAssistantRegistrationDraft" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "stockUnit" TEXT NOT NULL,
  "unitWeightGrams" INTEGER,
  "unitVolumeMl" INTEGER,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
