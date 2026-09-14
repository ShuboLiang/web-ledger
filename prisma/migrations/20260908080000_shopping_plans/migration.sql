-- CreateTable
CREATE TABLE IF NOT EXISTS "shopping_settings" (
    "id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "salary" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shopping_settings_salary_check" CHECK ("salary" >= 0)
);

-- shopping_items may already exist from the earlier estimated-totals feature
-- (migration 20260905010000). Align the existing table with the monthly shape
-- instead of recreating it.
DO $$
BEGIN
  IF to_regclass('shopping_items') IS NULL THEN
    CREATE TABLE "shopping_items" (
        "id" TEXT NOT NULL,
        "ledger_id" TEXT NOT NULL,
        "month" DATE NOT NULL,
        "name" VARCHAR(80) NOT NULL,
        "amount" DECIMAL(14,2) NOT NULL,
        "note" VARCHAR(500) NOT NULL DEFAULT '',
        "purchased" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "shopping_items_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "shopping_items_amount_check" CHECK ("amount" > 0)
    );
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'shopping_items' AND column_name = 'month'
    ) THEN
      ALTER TABLE "shopping_items" ADD COLUMN "month" DATE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'shopping_items' AND column_name = 'amount'
    ) THEN
      ALTER TABLE "shopping_items" ADD COLUMN "amount" DECIMAL(14,2) NOT NULL DEFAULT 0.01;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'shopping_items' AND column_name = 'name'
    ) THEN
      ALTER TABLE "shopping_items" ADD COLUMN "name" VARCHAR(80) NOT NULL DEFAULT '';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'shopping_items' AND column_name = 'note'
    ) THEN
      ALTER TABLE "shopping_items" ADD COLUMN "note" VARCHAR(500) NOT NULL DEFAULT '';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'shopping_items' AND column_name = 'purchased'
    ) THEN
      ALTER TABLE "shopping_items" ADD COLUMN "purchased" BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'shopping_items' AND column_name = 'created_at'
    ) THEN
      ALTER TABLE "shopping_items" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'shopping_items' AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE "shopping_items" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL;
    END IF;
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "shopping_settings_ledger_id_key" ON "shopping_settings"("ledger_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "shopping_items_ledger_id_month_idx" ON "shopping_items"("ledger_id", "month");

-- AddForeignKey
ALTER TABLE "shopping_settings" DROP CONSTRAINT IF EXISTS "shopping_settings_ledger_id_fkey";
ALTER TABLE "shopping_settings" ADD CONSTRAINT "shopping_settings_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" DROP CONSTRAINT IF EXISTS "shopping_items_ledger_id_fkey";
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
