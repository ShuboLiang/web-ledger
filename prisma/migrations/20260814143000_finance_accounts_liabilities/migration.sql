ALTER TABLE "accounts"
ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "ledger_id"
    ORDER BY "sort_order" ASC, "created_at" ASC
  ) AS row_number
  FROM "accounts"
)
UPDATE "accounts"
SET "is_default" = true
FROM ranked
WHERE "accounts"."id" = ranked."id"
  AND ranked.row_number = 1;

CREATE UNIQUE INDEX "accounts_one_default_per_ledger"
ON "accounts"("ledger_id")
WHERE "is_default" = true;

CREATE TABLE "account_transfers" (
  "id" TEXT NOT NULL,
  "ledger_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "from_account_id" TEXT NOT NULL,
  "to_account_id" TEXT NOT NULL,
  "kind" VARCHAR(30) NOT NULL DEFAULT 'transfer',
  "note" VARCHAR(500) NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "account_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "liabilities" (
  "id" TEXT NOT NULL,
  "ledger_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "kind" VARCHAR(30) NOT NULL DEFAULT 'loan',
  "original_principal" DECIMAL(14,2) NOT NULL,
  "total_interest" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "start_date" DATE NOT NULL,
  "first_due_date" DATE NOT NULL,
  "total_installments" INTEGER NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "settled_at" DATE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "liabilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "liability_payments" (
  "id" TEXT NOT NULL,
  "liability_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "source_account_id" TEXT NOT NULL,
  "principal" DECIMAL(14,2) NOT NULL,
  "interest" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "kind" VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  "note" VARCHAR(500) NOT NULL DEFAULT '',
  "transfer_id" TEXT NOT NULL,
  "expense_transaction_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "liability_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "liability_installments" (
  "id" TEXT NOT NULL,
  "liability_id" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "due_date" DATE NOT NULL,
  "principal" DECIMAL(14,2) NOT NULL,
  "interest" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'planned',
  "payment_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "liability_installments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_transfers_ledger_id_date_idx"
ON "account_transfers"("ledger_id", "date" DESC);
CREATE INDEX "account_transfers_from_account_id_idx"
ON "account_transfers"("from_account_id");
CREATE INDEX "account_transfers_to_account_id_idx"
ON "account_transfers"("to_account_id");

CREATE UNIQUE INDEX "liabilities_ledger_id_account_id_key"
ON "liabilities"("ledger_id", "account_id");
CREATE INDEX "liabilities_ledger_id_status_idx"
ON "liabilities"("ledger_id", "status");

CREATE UNIQUE INDEX "liability_payments_transfer_id_key"
ON "liability_payments"("transfer_id");
CREATE INDEX "liability_payments_liability_id_date_idx"
ON "liability_payments"("liability_id", "date" DESC);
CREATE INDEX "liability_payments_source_account_id_idx"
ON "liability_payments"("source_account_id");

CREATE UNIQUE INDEX "liability_installments_liability_id_number_key"
ON "liability_installments"("liability_id", "number");
CREATE INDEX "liability_installments_liability_id_due_date_idx"
ON "liability_installments"("liability_id", "due_date");

ALTER TABLE "account_transfers"
ADD CONSTRAINT "account_transfers_ledger_id_fkey"
FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_transfers"
ADD CONSTRAINT "account_transfers_from_account_id_fkey"
FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_transfers"
ADD CONSTRAINT "account_transfers_to_account_id_fkey"
FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "liabilities"
ADD CONSTRAINT "liabilities_ledger_id_fkey"
FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "liabilities"
ADD CONSTRAINT "liabilities_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "liability_payments"
ADD CONSTRAINT "liability_payments_liability_id_fkey"
FOREIGN KEY ("liability_id") REFERENCES "liabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "liability_payments"
ADD CONSTRAINT "liability_payments_source_account_id_fkey"
FOREIGN KEY ("source_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "liability_payments"
ADD CONSTRAINT "liability_payments_transfer_id_fkey"
FOREIGN KEY ("transfer_id") REFERENCES "account_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "liability_payments"
ADD CONSTRAINT "liability_payments_expense_transaction_id_fkey"
FOREIGN KEY ("expense_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "liability_installments"
ADD CONSTRAINT "liability_installments_liability_id_fkey"
FOREIGN KEY ("liability_id") REFERENCES "liabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "liability_installments"
ADD CONSTRAINT "liability_installments_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "liability_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
