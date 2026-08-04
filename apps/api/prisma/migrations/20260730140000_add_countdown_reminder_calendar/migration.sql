-- AlterTable
ALTER TABLE "countdowns"
  ADD COLUMN "reminder_days_before" INTEGER,
  ADD COLUMN "show_in_calendar" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "early_notification_sent_at" TIMESTAMP(3);
