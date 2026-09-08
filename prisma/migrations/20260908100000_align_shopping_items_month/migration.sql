-- Older shopping_items tables were created without month; the app now filters by month.
DO $$
BEGIN
  IF to_regclass('public.shopping_items') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shopping_items'
      AND column_name = 'month'
  ) THEN
    ALTER TABLE "shopping_items" ADD COLUMN "month" DATE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shopping_items'
      AND column_name = 'created_at'
  ) THEN
    UPDATE "shopping_items"
    SET "month" = (date_trunc('month', timezone('Asia/Shanghai', COALESCE("created_at", now()))))::date
    WHERE "month" IS NULL;
  ELSE
    UPDATE "shopping_items"
    SET "month" = (date_trunc('month', timezone('Asia/Shanghai', now())))::date
    WHERE "month" IS NULL;
  END IF;

  ALTER TABLE "shopping_items" ALTER COLUMN "month" SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shopping_items'
      AND column_name = 'note'
  ) THEN
    ALTER TABLE "shopping_items" ADD COLUMN "note" VARCHAR(500) NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shopping_items'
      AND column_name = 'purchased'
  ) THEN
    ALTER TABLE "shopping_items" ADD COLUMN "purchased" BOOLEAN NOT NULL DEFAULT false;
  END IF;

  CREATE INDEX IF NOT EXISTS "shopping_items_ledger_id_month_idx"
    ON "shopping_items"("ledger_id", "month");
END $$;
