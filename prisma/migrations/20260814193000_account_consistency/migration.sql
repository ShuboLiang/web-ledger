UPDATE "accounts"
SET "type" = 'cash'
WHERE "type" NOT IN ('cash', 'bank', 'ewallet', 'credit', 'loan');

UPDATE "accounts"
SET "opening_balance" = CASE
  WHEN "type" IN ('credit', 'loan') THEN -ABS("opening_balance")
  ELSE ABS("opening_balance")
END;

UPDATE "accounts"
SET "enabled" = true
WHERE "is_default" = true;

ALTER TABLE "accounts"
ADD COLUMN "balance_date" DATE;

ALTER TABLE "accounts"
ADD CONSTRAINT "accounts_type_check"
CHECK ("type" IN ('cash', 'bank', 'ewallet', 'credit', 'loan'));

ALTER TABLE "accounts"
ADD CONSTRAINT "accounts_default_state_check"
CHECK (
  "is_default" = false
  OR ("enabled" = true AND "type" IN ('cash', 'bank', 'ewallet'))
);

CREATE TABLE "account_adjustments" (
  "id" TEXT NOT NULL,
  "ledger_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "note" VARCHAR(500) NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_adjustments_nonzero_check" CHECK ("amount" <> 0)
);

CREATE INDEX "account_adjustments_ledger_id_date_idx"
ON "account_adjustments"("ledger_id", "date" DESC);

CREATE INDEX "account_adjustments_account_id_idx"
ON "account_adjustments"("account_id");

ALTER TABLE "account_adjustments"
ADD CONSTRAINT "account_adjustments_ledger_id_fkey"
FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_adjustments"
ADD CONSTRAINT "account_adjustments_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
