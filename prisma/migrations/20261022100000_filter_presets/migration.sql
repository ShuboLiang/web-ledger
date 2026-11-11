-- CreateTable
CREATE TABLE "filter_presets" (
    "id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "page" VARCHAR(20) NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "params" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filter_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "filter_presets_ledger_id_page_name_key" ON "filter_presets"("ledger_id", "page", "name");

-- AddForeignKey
ALTER TABLE "filter_presets" ADD CONSTRAINT "filter_presets_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
