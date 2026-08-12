-- A category budget can occur only once per ledger and month.
CREATE UNIQUE INDEX "budgets_ledger_id_month_category1_key"
ON "budgets"("ledger_id", "month", "category1");

-- PostgreSQL treats NULL values as distinct, so total budgets need a partial index.
CREATE UNIQUE INDEX "budgets_one_total_per_month_key"
ON "budgets"("ledger_id", "month")
WHERE "category1" IS NULL;
