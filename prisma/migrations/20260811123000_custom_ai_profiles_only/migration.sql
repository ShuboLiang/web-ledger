-- The product only supports user-managed model profiles. Remove the legacy
-- environment profile before dropping the obsolete mode discriminator.
DELETE FROM "ai_model_profiles" WHERE "mode" <> 'custom';

UPDATE "ai_model_profiles"
SET "is_default" = TRUE
WHERE "id" = (
  SELECT "id" FROM "ai_model_profiles"
  ORDER BY "created_at" ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM "ai_model_profiles" WHERE "is_default" = TRUE
);

ALTER TABLE "ai_model_profiles" DROP COLUMN "mode";
