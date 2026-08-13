-- 记录用户在待确认区手动移除的操作摘要，供下一轮 AI 对话时告知 agent
ALTER TABLE "ai_conversations" ADD COLUMN "removed_notices" JSONB NOT NULL DEFAULT '[]';
