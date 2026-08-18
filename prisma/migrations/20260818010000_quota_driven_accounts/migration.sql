ALTER TABLE "liability_installments" DROP CONSTRAINT IF EXISTS "liability_installments_payment_id_fkey";
ALTER TABLE "liability_installments" DROP CONSTRAINT IF EXISTS "liability_installments_liability_id_fkey";
ALTER TABLE "liability_payments" DROP CONSTRAINT IF EXISTS "liability_payments_expense_transaction_id_fkey";
ALTER TABLE "liability_payments" DROP CONSTRAINT IF EXISTS "liability_payments_transfer_id_fkey";
ALTER TABLE "liability_payments" DROP CONSTRAINT IF EXISTS "liability_payments_source_account_id_fkey";
ALTER TABLE "liability_payments" DROP CONSTRAINT IF EXISTS "liability_payments_liability_id_fkey";
ALTER TABLE "liabilities" DROP CONSTRAINT IF EXISTS "liabilities_account_id_fkey";
ALTER TABLE "liabilities" DROP CONSTRAINT IF EXISTS "liabilities_ledger_id_fkey";

DROP TABLE IF EXISTS "liability_installments";
DROP TABLE IF EXISTS "liability_payments";
DROP TABLE IF EXISTS "liabilities";
