-- AlterTable
ALTER TABLE "users" ADD COLUMN     "work_hours_per_day" INTEGER NOT NULL DEFAULT 8;

-- RenameIndex
ALTER INDEX "unique_import_identity" RENAME TO "tasks_user_id_import_source_external_id_key";
