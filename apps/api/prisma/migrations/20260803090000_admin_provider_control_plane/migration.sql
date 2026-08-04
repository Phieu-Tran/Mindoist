CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "AiProviderType" AS ENUM ('GEMINI', 'ANTHROPIC', 'OPENAI', 'OPENROUTER', 'OPENAI_COMPATIBLE');

ALTER TABLE "users"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "users"
SET "role" = 'ADMIN'
WHERE "id" = (
  SELECT "id"
  FROM "users"
  ORDER BY "created_at" ASC, "id" ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM "users" WHERE "role" = 'ADMIN');

CREATE TABLE "ai_provider_configs" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "provider" "AiProviderType" NOT NULL,
  "model" TEXT NOT NULL,
  "api_base" TEXT,
  "encrypted_api_key" TEXT NOT NULL,
  "api_key_hint" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "request_timeout_ms" INTEGER NOT NULL DEFAULT 30000,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_audit_logs" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_provider_configs_enabled_priority_idx" ON "ai_provider_configs"("enabled", "priority");
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");
CREATE INDEX "admin_audit_logs_actor_user_id_created_at_idx" ON "admin_audit_logs"("actor_user_id", "created_at");

ALTER TABLE "admin_audit_logs"
  ADD CONSTRAINT "admin_audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
