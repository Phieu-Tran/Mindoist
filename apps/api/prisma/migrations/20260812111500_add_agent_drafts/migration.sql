CREATE TYPE "AgentDraftKind" AS ENUM ('CREATE_TASK', 'CREATE_TASK_BATCH', 'EDIT_TASK', 'RESCHEDULE');
CREATE TYPE "AgentTransport" AS ENUM ('TELEGRAM', 'MCP', 'WEB');
CREATE TYPE "AgentDraftStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED');
CREATE TABLE "agent_drafts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "transport" "AgentTransport" NOT NULL,
  "transport_ref" TEXT,
  "kind" "AgentDraftKind" NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "AgentDraftStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "result_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "agent_drafts_user_id_status_created_at_idx" ON "agent_drafts"("user_id", "status", "created_at");
