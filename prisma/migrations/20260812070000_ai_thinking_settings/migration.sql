ALTER TABLE "ai_model_profiles"
ADD COLUMN "thinking_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "thinking_level" VARCHAR(20) NOT NULL DEFAULT 'medium';

ALTER TABLE "ai_model_profiles"
ADD CONSTRAINT "ai_model_profiles_thinking_level_check"
CHECK ("thinking_level" IN ('minimal', 'low', 'medium', 'high', 'xhigh', 'max'));
