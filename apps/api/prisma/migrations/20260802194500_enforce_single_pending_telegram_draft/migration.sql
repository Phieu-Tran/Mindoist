CREATE UNIQUE INDEX "telegram_task_drafts_one_pending_per_user_idx"
    ON "telegram_task_drafts"("user_id") WHERE "status" = 'PENDING';
