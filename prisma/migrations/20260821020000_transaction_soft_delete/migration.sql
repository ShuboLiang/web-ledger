-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "transactions_ledger_id_deleted_at_idx" ON "transactions"("ledger_id", "deleted_at");
