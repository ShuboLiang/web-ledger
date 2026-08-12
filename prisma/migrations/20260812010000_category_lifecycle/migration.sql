-- Preserve the readable category snapshot on each transaction while adding a
-- restrictive relation used for safe rename, merge and delete operations.
ALTER TABLE "transactions" ADD COLUMN "category_id" TEXT;
ALTER TABLE "categories" ADD COLUMN "merged_into_id" TEXT;

-- Older imports may contain a category that is absent from the dictionary.
INSERT INTO "categories" (
    "id", "ledger_id", "category1", "category2", "enabled", "sort_order", "created_at", "updated_at"
)
SELECT
    'legacy_' || md5(random()::text || clock_timestamp()::text || source."ledger_id" || source."category1" || source."category2"),
    source."ledger_id",
    source."category1",
    source."category2",
    true,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "ledger_id", "category1", "category2"
    FROM "transactions"
) AS source
LEFT JOIN "categories" AS category
  ON category."ledger_id" = source."ledger_id"
 AND category."category1" = source."category1"
 AND category."category2" = source."category2"
WHERE category."id" IS NULL;

UPDATE "transactions" AS transaction
SET "category_id" = category."id"
FROM "categories" AS category
WHERE category."ledger_id" = transaction."ledger_id"
  AND category."category1" = transaction."category1"
  AND category."category2" = transaction."category2";

ALTER TABLE "transactions" ALTER COLUMN "category_id" SET NOT NULL;
CREATE INDEX "transactions_category_id_idx" ON "transactions"("category_id");
CREATE INDEX "categories_merged_into_id_idx" ON "categories"("merged_into_id");
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_merged_into_id_fkey"
  FOREIGN KEY ("merged_into_id") REFERENCES "categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
