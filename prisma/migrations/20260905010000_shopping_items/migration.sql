CREATE TABLE "shopping_items" (
    "id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shopping_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shopping_items_price_check" CHECK ("unit_price" >= 0 AND "unit_price" <= 99999999.99),
    CONSTRAINT "shopping_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 9999)
);
CREATE INDEX "shopping_items_ledger_id_purchased_created_at_idx" ON "shopping_items"("ledger_id", "purchased", "created_at" DESC);
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
