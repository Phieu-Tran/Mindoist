-- AlterTable: add import_source and external_id columns for idempotent re-import
ALTER TABLE "tasks" ADD COLUMN "import_source" TEXT,
ADD COLUMN "external_id" TEXT;

-- CreateIndex: unique constraint (userId, importSource, externalId) —
-- Postgres allows multiple NULLs in a unique index, so existing tasks
-- (both fields NULL) are unaffected.
CREATE UNIQUE INDEX "unique_import_identity" ON "tasks"("user_id", "import_source", "external_id");
