CREATE TYPE "ProjectType" AS ENUM ('DAILY_LOG', 'JOB', 'PERSONAL', 'CUSTOM');

ALTER TABLE "projects"
  ADD COLUMN "type" "ProjectType" NOT NULL DEFAULT 'CUSTOM';

ALTER TABLE "project_columns"
  ADD COLUMN "color" TEXT NOT NULL DEFAULT 'slate';
