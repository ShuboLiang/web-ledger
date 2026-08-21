-- CreateTable
CREATE TABLE "recurring_rules" (
    "id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "frequency" VARCHAR(20) NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "day_of_month" INTEGER,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "next_run_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "direction" VARCHAR(10) NOT NULL DEFAULT 'expense',
    "item" VARCHAR(80) NOT NULL,
    "category1" VARCHAR(40) NOT NULL,
    "category2" VARCHAR(40) NOT NULL,
    "account_id" TEXT,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "auto_create" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_generations" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "run_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "transaction_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_rules_ledger_id_enabled_next_run_date_idx" ON "recurring_rules"("ledger_id", "enabled", "next_run_date");

-- CreateIndex
CREATE INDEX "recurring_rules_enabled_next_run_date_idx" ON "recurring_rules"("enabled", "next_run_date");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_generations_rule_id_run_date_key" ON "recurring_generations"("rule_id", "run_date");

-- CreateIndex
CREATE INDEX "recurring_generations_rule_id_status_idx" ON "recurring_generations"("rule_id", "status");

-- CreateIndex
CREATE INDEX "recurring_generations_transaction_id_idx" ON "recurring_generations"("transaction_id");

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_generations" ADD CONSTRAINT "recurring_generations_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "recurring_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_generations" ADD CONSTRAINT "recurring_generations_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
