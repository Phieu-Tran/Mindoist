ALTER TABLE "tasks" ADD COLUMN "due_notification_sent_at" TIMESTAMP(3);

ALTER TABLE "countdowns" ADD COLUMN "notification_sent_at" TIMESTAMP(3);

CREATE INDEX "tasks_due_notification_sent_at_idx" ON "tasks"("due_notification_sent_at");

CREATE INDEX "countdowns_notification_sent_at_idx" ON "countdowns"("notification_sent_at");
