CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "username" VARCHAR(40) NOT NULL,
  "display_name" VARCHAR(60) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "token_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "token_version" INTEGER NOT NULL,
  "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");
CREATE INDEX "auth_sessions_user_id_revoked_at_idx" ON "auth_sessions"("user_id", "revoked_at");
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ledgers" ADD COLUMN "user_id" TEXT;
CREATE UNIQUE INDEX "ledgers_user_id_key" ON "ledgers"("user_id");
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_model_profiles" ADD COLUMN "user_id" TEXT;
DROP INDEX IF EXISTS "ai_model_profiles_name_key";
CREATE UNIQUE INDEX "ai_model_profiles_user_id_name_key" ON "ai_model_profiles"("user_id", "name");
CREATE INDEX "ai_model_profiles_user_id_is_default_idx" ON "ai_model_profiles"("user_id", "is_default");
ALTER TABLE "ai_model_profiles" ADD CONSTRAINT "ai_model_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_conversations" ADD COLUMN "user_id" TEXT;
DROP INDEX IF EXISTS "ai_conversations_updated_at_idx";
CREATE INDEX "ai_conversations_user_id_updated_at_idx" ON "ai_conversations"("user_id", "updated_at" DESC);
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
