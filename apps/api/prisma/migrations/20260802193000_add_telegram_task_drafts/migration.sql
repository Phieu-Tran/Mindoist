CREATE TYPE "TelegramTaskDraftStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "telegram_task_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "telegram_chat_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "project_id" TEXT,
    "project_name" TEXT,
    "priority" INTEGER,
    "due_date" DATE,
    "due_time" TEXT,
    "status" "TelegramTaskDraftStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_task_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_task_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telegram_task_drafts_user_id_status_created_at_idx"
    ON "telegram_task_drafts"("user_id", "status", "created_at");
CREATE INDEX "telegram_task_drafts_telegram_chat_id_status_created_at_idx"
    ON "telegram_task_drafts"("telegram_chat_id", "status", "created_at");
CREATE INDEX "telegram_task_drafts_expires_at_idx"
    ON "telegram_task_drafts"("expires_at");

ALTER TABLE "telegram_task_drafts"
    ADD CONSTRAINT "telegram_task_drafts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_task_drafts"
    ADD CONSTRAINT "telegram_task_drafts_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "telegram_task_drafts"
    ADD CONSTRAINT "telegram_task_drafts_confirmed_task_id_fkey"
    FOREIGN KEY ("confirmed_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
