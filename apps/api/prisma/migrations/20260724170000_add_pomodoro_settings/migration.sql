-- AlterTable
ALTER TABLE "users" ADD COLUMN "pomodoro_work_minutes" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "users" ADD COLUMN "pomodoro_break_minutes" INTEGER NOT NULL DEFAULT 5;
