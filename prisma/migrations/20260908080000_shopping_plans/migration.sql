-- CreateTable
CREATE TABLE "shopping_settings" (
    "id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "salary" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shopping_settings_salary_check" CHECK ("salary" >= 0)
);

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "shopping_settings_ledger_id_key" ON "shopping_settings"("ledger_id");

-- CreateIndex
CREATE INDEX "shopping_items_ledger_id_month_idx" ON "shopping_items"("ledger_id", "month");

-- AddForeignKey
ALTER TABLE "shopping_settings" ADD CONSTRAINT "shopping_settings_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
