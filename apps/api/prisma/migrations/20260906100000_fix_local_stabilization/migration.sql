-- Remove the legacy title uniqueness that prevented recurring occurrences
-- and unrelated tasks from sharing a title.
DROP INDEX IF EXISTS "tasks_user_id_title_key";

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "recurrence_start" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recurrence_index" INTEGER,
  ADD COLUMN IF NOT EXISTS "recurrence_series_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "tasks_recurrence_series_id_recurrence_index_key"
  ON "tasks"("recurrence_series_id", "recurrence_index");
