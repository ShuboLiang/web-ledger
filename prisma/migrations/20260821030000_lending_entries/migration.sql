ALTER TABLE "accounts" DROP CONSTRAINT "accounts_type_check";

ALTER TABLE "accounts"
ADD CONSTRAINT "accounts_type_check"
CHECK ("type" IN ('cash', 'bank', 'ewallet', 'credit', 'loan', 'contact'));

-- CreateTable
CREATE TABLE "lending_entries" (
    "id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "direction" VARCHAR(20) NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "settled_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "item" VARCHAR(80) NOT NULL,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "due_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "settled_at" TIMESTAMP(3),
    "transfer_id" TEXT,
    "transaction_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lending_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lending_entries_direction_check" CHECK ("direction" IN ('receivable', 'payable')),
    CONSTRAINT "lending_entries_status_check" CHECK ("status" IN ('open', 'settled')),
    CONSTRAINT "lending_entries_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "lending_entries_settled_amount_check" CHECK ("settled_amount" >= 0 AND "settled_amount" <= "amount")
);

-- CreateTable
CREATE TABLE "lending_settlements" (
    "id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "transfer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lending_settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lending_settlements_amount_check" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE INDEX "lending_entries_ledger_id_status_due_date_idx" ON "lending_entries"("ledger_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "lending_entries_ledger_id_account_id_date_idx" ON "lending_entries"("ledger_id", "account_id", "date" DESC);

-- CreateIndex
CREATE INDEX "lending_entries_transfer_id_idx" ON "lending_entries"("transfer_id");

-- CreateIndex
CREATE INDEX "lending_entries_transaction_id_idx" ON "lending_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "lending_settlements_ledger_id_date_idx" ON "lending_settlements"("ledger_id", "date" DESC);

-- CreateIndex
CREATE INDEX "lending_settlements_entry_id_idx" ON "lending_settlements"("entry_id");

-- CreateIndex
CREATE INDEX "lending_settlements_transfer_id_idx" ON "lending_settlements"("transfer_id");

-- AddForeignKey
ALTER TABLE "lending_entries" ADD CONSTRAINT "lending_entries_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lending_entries" ADD CONSTRAINT "lending_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lending_entries" ADD CONSTRAINT "lending_entries_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "account_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lending_entries" ADD CONSTRAINT "lending_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lending_settlements" ADD CONSTRAINT "lending_settlements_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lending_settlements" ADD CONSTRAINT "lending_settlements_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "lending_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lending_settlements" ADD CONSTRAINT "lending_settlements_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "account_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
