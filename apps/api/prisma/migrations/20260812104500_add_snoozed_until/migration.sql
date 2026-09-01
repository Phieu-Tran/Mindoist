ALTER TABLE "tasks" ADD COLUMN "snoozed_until" TIMESTAMP(3);
CREATE INDEX "tasks_user_id_snoozed_until_idx" ON "tasks"("user_id", "snoozed_until");
