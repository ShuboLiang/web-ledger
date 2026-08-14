UPDATE "accounts" AS a
SET "enabled" = true
FROM "liabilities" AS l
WHERE l."account_id" = a."id"
  AND l."ledger_id" = a."ledger_id"
  AND l."status" = 'active'
  AND a."enabled" = false;
