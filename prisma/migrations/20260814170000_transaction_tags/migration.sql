CREATE TABLE "transaction_tags" (
  "transaction_id" INTEGER NOT NULL,
  "tag_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transaction_tags_pkey" PRIMARY KEY ("transaction_id", "tag_id")
);

CREATE INDEX "transaction_tags_tag_id_transaction_id_idx"
  ON "transaction_tags"("tag_id", "transaction_id");

ALTER TABLE "transaction_tags"
  ADD CONSTRAINT "transaction_tags_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transaction_tags"
  ADD CONSTRAINT "transaction_tags_tag_id_fkey"
  FOREIGN KEY ("tag_id") REFERENCES "tags"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
