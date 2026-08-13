ALTER TABLE "ai_model_profiles"
DROP CONSTRAINT "ai_model_profiles_thinking_level_check";

ALTER TABLE "ai_model_profiles"
ADD CONSTRAINT "ai_model_profiles_thinking_level_check"
CHECK ("thinking_level" IN ('default', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'));

ALTER TABLE "ai_messages"
ADD COLUMN "thinking" TEXT;
