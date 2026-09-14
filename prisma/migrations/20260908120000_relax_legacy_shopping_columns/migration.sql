-- Legacy shopping_items kept extra NOT NULL columns such as unit_price.
-- Prisma only writes the current schema, so those leftovers must have defaults.
DO $$
DECLARE
  col record;
BEGIN
  IF to_regclass('shopping_items') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'shopping_items'
      AND column_name = 'unit_price'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'shopping_items'
        AND column_name = 'amount'
    ) THEN
      UPDATE "shopping_items"
      SET "amount" = "unit_price"
      WHERE "unit_price" IS NOT NULL
        AND "unit_price" <> 0.01
        AND ("amount" IS NULL OR "amount" = 0.01);
      UPDATE "shopping_items"
      SET "unit_price" = COALESCE("unit_price", "amount", 0.01);
    END IF;

    ALTER TABLE "shopping_items" ALTER COLUMN "unit_price" SET DEFAULT 0.01;

    CREATE OR REPLACE FUNCTION shopping_items_sync_unit_price()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      IF NEW.unit_price IS NULL THEN
        NEW.unit_price := COALESCE(NEW.amount, 0.01);
      END IF;
      IF NEW.amount IS NULL THEN
        NEW.amount := COALESCE(NEW.unit_price, 0.01);
      END IF;
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS shopping_items_sync_unit_price ON "shopping_items";
    CREATE TRIGGER shopping_items_sync_unit_price
      BEFORE INSERT OR UPDATE ON "shopping_items"
      FOR EACH ROW
      EXECUTE PROCEDURE shopping_items_sync_unit_price();
  END IF;

  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'shopping_items'
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND column_name NOT IN (
        'id',
        'ledger_id',
        'month',
        'name',
        'amount',
        'note',
        'purchased',
        'created_at',
        'updated_at'
      )
  LOOP
    IF col.column_name IN ('quantity', 'qty', 'count') THEN
      EXECUTE format('ALTER TABLE shopping_items ALTER COLUMN %I SET DEFAULT 1', col.column_name);
      EXECUTE format('UPDATE shopping_items SET %I = 1 WHERE %I IS NULL', col.column_name, col.column_name);
    ELSE
      EXECUTE format('ALTER TABLE shopping_items ALTER COLUMN %I DROP NOT NULL', col.column_name);
    END IF;
  END LOOP;
END $$;
