-- Align leftover shopping tables with the current Prisma schema.
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['shopping_items', 'shopping_incomes']
  LOOP
    IF to_regclass(target) IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = target AND column_name = 'ledger_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN "ledger_id" TEXT NOT NULL DEFAULT %L', target, '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = target AND column_name = 'month'
    ) THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = target AND column_name = 'date'
      ) THEN
        EXECUTE format('ALTER TABLE %I RENAME COLUMN "date" TO "month"', target);
      ELSE
        EXECUTE format('ALTER TABLE %I ADD COLUMN "month" DATE', target);
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = target AND column_name = 'created_at'
    ) THEN
      EXECUTE format(
        'UPDATE %I SET "month" = (date_trunc(''month'', timezone(''Asia/Shanghai'', COALESCE("created_at", now()))))::date WHERE "month" IS NULL',
        target
      );
    ELSE
      EXECUTE format(
        'UPDATE %I SET "month" = (date_trunc(''month'', timezone(''Asia/Shanghai'', now())))::date WHERE "month" IS NULL',
        target
      );
    END IF;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "month" SET NOT NULL', target);

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = target AND column_name = 'name'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN "name" VARCHAR(80) NOT NULL DEFAULT %L', target, '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = target AND column_name = 'amount'
    ) THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = target AND column_name = 'price'
      ) THEN
        EXECUTE format('ALTER TABLE %I RENAME COLUMN "price" TO "amount"', target);
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = target AND column_name = 'cost'
      ) THEN
        EXECUTE format('ALTER TABLE %I RENAME COLUMN "cost" TO "amount"', target);
      ELSE
        EXECUTE format('ALTER TABLE %I ADD COLUMN "amount" DECIMAL(14,2) NOT NULL DEFAULT 0.01', target);
      END IF;
    END IF;
    EXECUTE format('UPDATE %I SET "amount" = 0.01 WHERE "amount" IS NULL', target);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "amount" SET NOT NULL', target);

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = target AND column_name = 'note'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN "note" VARCHAR(500) NOT NULL DEFAULT %L', target, '');
    END IF;

    IF target = 'shopping_items' AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = target AND column_name = 'purchased'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN "purchased" BOOLEAN NOT NULL DEFAULT false', target);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = target AND column_name = 'created_at'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP', target);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = target AND column_name = 'updated_at'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP', target);
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I ("ledger_id", "month")',
      target || '_ledger_id_month_idx',
      target
    );
  END LOOP;
END $$;
