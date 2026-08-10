-- Additive task/calendar boundary migration.
-- Legacy due_date/due_time/start_date/duration_min columns stay in place
-- during the compatibility window.

ALTER TABLE "tasks"
  ADD COLUMN "deadline_date" DATE,
  ADD COLUMN "deadline_time" TEXT,
  ADD COLUMN "deadline_time_zone" TEXT;

UPDATE "tasks"
SET
  "deadline_date" = "due_date"::date,
  "deadline_time" = "due_time"
WHERE "due_date" IS NOT NULL;

CREATE INDEX "tasks_deadline_date_idx" ON "tasks"("deadline_date");

CREATE TYPE "TimeBlockSource" AS ENUM ('MANUAL', 'RECURRENCE', 'IMPORT', 'EXTERNAL');

CREATE TABLE "time_blocks" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3) NOT NULL,
  "time_zone" TEXT NOT NULL,
  "all_day" BOOLEAN NOT NULL DEFAULT false,
  "source" "TimeBlockSource" NOT NULL DEFAULT 'MANUAL',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "time_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "time_blocks_user_id_start_at_idx" ON "time_blocks"("user_id", "start_at");
CREATE INDEX "time_blocks_task_id_idx" ON "time_blocks"("task_id");
ALTER TABLE "time_blocks"
  ADD CONSTRAINT "time_blocks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_blocks"
  ADD CONSTRAINT "time_blocks_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE');

CREATE TABLE "external_calendars" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" "CalendarProvider" NOT NULL,
  "external_calendar_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "time_zone" TEXT,
  "is_visible" BOOLEAN NOT NULL DEFAULT true,
  "is_read_only" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "external_calendars_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_calendars_user_id_provider_external_calendar_id_key"
  ON "external_calendars"("user_id", "provider", "external_calendar_id");
CREATE INDEX "external_calendars_user_id_idx" ON "external_calendars"("user_id");
ALTER TABLE "external_calendars"
  ADD CONSTRAINT "external_calendars_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "external_event_links" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "external_calendar_id" TEXT NOT NULL,
  "external_event_id" TEXT NOT NULL,
  "task_id" TEXT,
  "time_block_id" TEXT,
  "etag" TEXT,
  "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_event_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_event_links_external_calendar_id_external_event_id_key"
  ON "external_event_links"("external_calendar_id", "external_event_id");
CREATE INDEX "external_event_links_user_id_idx" ON "external_event_links"("user_id");
CREATE INDEX "external_event_links_task_id_idx" ON "external_event_links"("task_id");
CREATE INDEX "external_event_links_time_block_id_idx" ON "external_event_links"("time_block_id");
ALTER TABLE "external_event_links"
  ADD CONSTRAINT "external_event_links_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_event_links"
  ADD CONSTRAINT "external_event_links_external_calendar_id_fkey"
  FOREIGN KEY ("external_calendar_id") REFERENCES "external_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_event_links"
  ADD CONSTRAINT "external_event_links_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "external_event_links"
  ADD CONSTRAINT "external_event_links_time_block_id_fkey"
  FOREIGN KEY ("time_block_id") REFERENCES "time_blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
