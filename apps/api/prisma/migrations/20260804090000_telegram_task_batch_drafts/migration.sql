CREATE TABLE "telegram_task_batch_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "telegram_chat_id" TEXT NOT NULL,
    "titles" TEXT[] NOT NULL,
    "project_id" TEXT,
    "project_name" TEXT,
    "color" TEXT,
    "tag_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tag_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "create_tag_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER,
    "due_date" DATE,
    "due_time" TEXT,
    "status" "TelegramTaskDraftStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_task_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_task_batch_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telegram_task_batch_drafts_user_id_status_created_at_idx"
    ON "telegram_task_batch_drafts"("user_id", "status", "created_at");
CREATE INDEX "telegram_task_batch_drafts_telegram_chat_id_status_created_at_idx"
    ON "telegram_task_batch_drafts"("telegram_chat_id", "status", "created_at");
CREATE INDEX "telegram_task_batch_drafts_expires_at_idx"
    ON "telegram_task_batch_drafts"("expires_at");
CREATE UNIQUE INDEX "telegram_task_batch_drafts_one_pending_per_user_idx"
    ON "telegram_task_batch_drafts"("user_id") WHERE "status" = 'PENDING';

ALTER TABLE "telegram_task_batch_drafts"
    ADD CONSTRAINT "telegram_task_batch_drafts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_task_batch_drafts"
    ADD CONSTRAINT "telegram_task_batch_drafts_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
