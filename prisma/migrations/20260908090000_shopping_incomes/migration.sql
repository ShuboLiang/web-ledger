-- CreateTable
CREATE TABLE "shopping_incomes" (
    "id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_incomes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shopping_incomes_amount_check" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE INDEX "shopping_incomes_ledger_id_month_idx" ON "shopping_incomes"("ledger_id", "month");

-- AddForeignKey
ALTER TABLE "shopping_incomes" ADD CONSTRAINT "shopping_incomes_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate any previously saved global salary into this month as 工资
INSERT INTO "shopping_incomes" (
    "id",
    "ledger_id",
    "month",
    "name",
    "amount",
    "note",
    "created_at",
    "updated_at"
)
SELECT
    replace(gen_random_uuid()::text, '-', ''),
    "ledger_id",
    (date_trunc('month', timezone('Asia/Shanghai', now())))::date,
    '工资',
    "salary",
    '',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "shopping_settings"
WHERE "salary" > 0;

-- DropTable
DROP TABLE "shopping_settings";
